"""Inbox Multi — direct OAuth + Gmail API for multi-account universal inbox.

See MICROSERVICE.md for the architecture rationale (short version: gws is
single-account, real universal inbox needs N independent credential slots,
so we bypass gws and talk to Google directly).
"""

import asyncio
import json
import os
import secrets
import shutil
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, urlencode, urlparse

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


# ── Paths ──

# We deliberately reuse gws's existing client_secret.json so the user only
# has to set up the OAuth client once. The OAuth setup card already drops
# the file at this canonical location.
CLIENT_SECRET_PATH = Path.home() / ".config" / "gws" / "client_secret.json"

# Per-account token storage. Each account gets its own subdirectory keyed
# by email. Keeping this OUT of ~/.config/gws/ avoids any cross-talk with
# gws's own credential store.
ACCOUNTS_DIR = Path.home() / ".config" / "mchatai" / "inbox-accounts"


# ── Models ──

class AccountInfo(BaseModel):
    email: str
    expires_at: int                  # unix seconds
    has_refresh_token: bool
    last_refreshed_at: Optional[int] = None


class AccountsList(BaseModel):
    accounts: List[AccountInfo]
    client_secret_present: bool


class AddAccountResult(BaseModel):
    email: str
    already_existed: bool


class GmailMessage(BaseModel):
    id: str
    threadId: str
    accountEmail: str                # NEW: which inbox this came from
    sender: str = Field(default="")
    subject: str = Field(default="")
    date: str = Field(default="")
    snippet: str = Field(default="")
    labelIds: List[str] = Field(default_factory=list)
    internalDate: Optional[str] = None


class EmailsResult(BaseModel):
    emails: List[GmailMessage]
    accounts: List[str]              # which accounts contributed
    errors: Dict[str, str] = Field(default_factory=dict)  # accountEmail → error string


# ── OAuth helpers ──

def _load_client_secret() -> Dict[str, Any]:
    """Read installed{} block from ~/.config/gws/client_secret.json.

    The OAuth setup card guarantees this file exists before this service is
    callable for adding accounts. Errors with 412 if absent so the Mac can
    tell the user "set up the OAuth client first" instead of failing
    silently with a confusing 500.
    """
    if not CLIENT_SECRET_PATH.exists():
        raise HTTPException(
            status_code=412,
            detail="OAuth client_secret.json not found at ~/.config/gws/. Run the OAuth setup card first."
        )
    try:
        data = json.loads(CLIENT_SECRET_PATH.read_text())
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"client_secret.json is not valid JSON: {e}")
    installed = data.get("installed")
    if not installed or "client_id" not in installed:
        raise HTTPException(
            status_code=500,
            detail="client_secret.json missing `installed.client_id` — must be a Desktop OAuth client."
        )
    return installed


def _find_free_port() -> int:
    """Bind to port 0 and let the OS pick. Same idiom gws itself uses for
    its loopback listener — Google's redirect URI policy lets us register
    `http://localhost` with no port and it will accept any port at runtime.
    """
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _account_dir(email: str) -> Path:
    """Resolve the storage dir for a given email. Email may contain `+` or
    other URL-unsafe chars but never path separators in practice — Google
    enforces that. Still defense-in-depth: reject anything with `/` or `..`.
    """
    if "/" in email or ".." in email or not email.strip():
        raise HTTPException(status_code=400, detail=f"Invalid account email: {email!r}")
    return ACCOUNTS_DIR / email


def _read_tokens(email: str) -> Dict[str, Any]:
    token_file = _account_dir(email) / "token.json"
    if not token_file.exists():
        raise HTTPException(status_code=404, detail=f"Account {email} is not authorized")
    return json.loads(token_file.read_text())


def _write_tokens(email: str, tokens: Dict[str, Any]) -> None:
    """Atomically write token blob with mode 0600. Atomic = write to a
    sibling temp file then rename, so a crash mid-write can't leave a
    half-written token file (which would brick the account).
    """
    d = _account_dir(email)
    d.mkdir(parents=True, exist_ok=True)
    target = d / "token.json"
    tmp = d / "token.json.tmp"
    tmp.write_text(json.dumps(tokens, indent=2))
    os.chmod(tmp, 0o600)
    tmp.replace(target)


async def _get_valid_access_token(email: str) -> str:
    """Return a non-expired access token for `email`, refreshing on the fly
    if needed. Caller doesn't have to worry about expiry — every API call
    goes through here.

    60s leeway: refresh slightly before actual expiry so a long Gmail call
    doesn't get killed by the token expiring mid-flight.
    """
    tokens = _read_tokens(email)
    now = int(time.time())
    if tokens.get("expires_at", 0) - 60 > now:
        return tokens["access_token"]

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        raise HTTPException(
            status_code=401,
            detail=f"Account {email} has no refresh_token. Remove and re-add it.",
        )

    secret = _load_client_secret()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            secret.get("token_uri", "https://oauth2.googleapis.com/token"),
            data={
                "refresh_token": refresh_token,
                "client_id": secret["client_id"],
                "client_secret": secret["client_secret"],
                "grant_type": "refresh_token",
            },
        )
    if resp.status_code != 200:
        # If Google rejected the refresh token (403/400 invalid_grant),
        # it usually means the user revoked access. Surface clearly.
        body = resp.text[:300]
        raise HTTPException(
            status_code=401,
            detail=f"Token refresh for {email} failed (HTTP {resp.status_code}): {body}",
        )
    new = resp.json()
    tokens["access_token"] = new["access_token"]
    tokens["expires_at"] = now + int(new.get("expires_in", 3600))
    tokens["last_refreshed_at"] = now
    # Refresh tokens are usually long-lived but Google occasionally rotates
    # them — pick up the new one when offered.
    if "refresh_token" in new:
        tokens["refresh_token"] = new["refresh_token"]
    _write_tokens(email, tokens)
    return tokens["access_token"]


# ── Account management endpoints ──

@router.get("/client/status")
async def client_status() -> Dict[str, Any]:
    """Lightweight precheck so the Mac UI can know whether to show the
    'set up OAuth client first' banner before we even try /accounts/add.
    """
    return {
        "client_secret_present": CLIENT_SECRET_PATH.exists(),
        "client_secret_path": str(CLIENT_SECRET_PATH),
        "accounts_dir": str(ACCOUNTS_DIR),
    }


@router.get("/accounts", response_model=AccountsList)
async def list_accounts() -> AccountsList:
    """Enumerate authorized accounts WITHOUT exposing tokens — privacy
    contract: this endpoint must never leak the access_token / refresh_token.
    """
    items: List[AccountInfo] = []
    if ACCOUNTS_DIR.exists():
        for entry in sorted(ACCOUNTS_DIR.iterdir()):
            if not entry.is_dir():
                continue
            token_file = entry / "token.json"
            if not token_file.exists():
                continue
            try:
                t = json.loads(token_file.read_text())
            except (json.JSONDecodeError, OSError):
                # Corrupt token file — surface it as "no refresh token" so
                # the UI can offer to re-add this account.
                items.append(AccountInfo(
                    email=entry.name, expires_at=0, has_refresh_token=False
                ))
                continue
            items.append(AccountInfo(
                email=entry.name,
                expires_at=int(t.get("expires_at", 0)),
                has_refresh_token=bool(t.get("refresh_token")),
                last_refreshed_at=t.get("last_refreshed_at"),
            ))
    return AccountsList(
        accounts=items,
        client_secret_present=CLIENT_SECRET_PATH.exists(),
    )


@router.post("/accounts/add", response_model=AddAccountResult)
async def add_account() -> AddAccountResult:
    """Run OAuth loopback flow for a new Google account. Long-running
    (≤5 min while user completes consent in browser).
    """
    secret = _load_client_secret()
    state = secrets.token_urlsafe(24)
    port = _find_free_port()
    redirect_uri = f"http://localhost:{port}"

    # Loopback callback — see the OAuth Desktop App spec at
    # https://developers.google.com/identity/protocols/oauth2/native-app
    # for why we use http://localhost rather than a custom URL scheme.
    code_holder: Dict[str, Optional[str]] = {"code": None, "error": None, "state": None}

    class CallbackHandler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            qs = parse_qs(urlparse(self.path).query)
            received_state = qs.get("state", [""])[0]
            if "code" in qs and received_state == state:
                code_holder["code"] = qs["code"][0]
                code_holder["state"] = received_state
                body = (
                    "<html><body style='font-family:sans-serif;text-align:center;padding:48px;'>"
                    "<h2>✅ Account added to mChatAI Inbox</h2>"
                    "<p>You can close this tab and switch back to mChatAI+.</p>"
                    "</body></html>"
                )
            elif "error" in qs:
                code_holder["error"] = qs["error"][0]
                body = (
                    f"<html><body style='font-family:sans-serif;padding:48px;'>"
                    f"<h2>Sign-in cancelled</h2><p>{qs['error'][0]}</p>"
                    f"</body></html>"
                )
            elif received_state != state:
                code_holder["error"] = "state_mismatch"
                body = "<html><body><h2>State mismatch — possible CSRF attempt; aborted.</h2></body></html>"
            else:
                # Browser hit / favicon, ignore
                self.send_response(204)
                self.end_headers()
                return

            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body.encode("utf-8"))

        def log_message(self, *args, **kwargs):  # silence default stderr noise
            pass

    server = HTTPServer(("127.0.0.1", port), CallbackHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    try:
        auth_url = (
            "https://accounts.google.com/o/oauth2/v2/auth?"
            + urlencode({
                "client_id": secret["client_id"],
                "redirect_uri": redirect_uri,
                "response_type": "code",
                # gmail.readonly is a restricted scope but Google verification
                # is NOT required when the OAuth client is owned by the user
                # (their Cloud project, External + Testing). The user accepts
                # the "unverified app" warning during consent.
                "scope": "https://www.googleapis.com/auth/gmail.readonly openid email profile",
                "access_type": "offline",
                # Force fresh consent so a refresh_token is always issued —
                # Google only returns refresh_token on the FIRST authorization
                # by default, which would break "remove + re-add" flows.
                "prompt": "consent",
                "state": state,
                "include_granted_scopes": "true",
            })
        )

        # Open in user's default browser via macOS `open`. mChatAIShell is
        # unsandboxed so this works.
        await asyncio.create_subprocess_exec("/usr/bin/open", auth_url)

        # Wait for callback. Sleep is async-cooperative so the FastAPI event
        # loop keeps serving other requests during the 5-minute window.
        deadline = time.time() + 300
        while code_holder["code"] is None and code_holder["error"] is None:
            if time.time() > deadline:
                raise HTTPException(
                    status_code=504,
                    detail="Sign-in timed out after 5 minutes. If a browser tab didn't open, check your default-browser setting.",
                )
            await asyncio.sleep(0.5)
    finally:
        # Always tear down the listener — leaking ports across attempts
        # would be a memory leak.
        server.shutdown()
        server.server_close()

    if code_holder["error"]:
        raise HTTPException(status_code=400, detail=f"OAuth error: {code_holder['error']}")

    # Exchange code for tokens
    async with httpx.AsyncClient(timeout=20) as client:
        token_resp = await client.post(
            secret.get("token_uri", "https://oauth2.googleapis.com/token"),
            data={
                "code": code_holder["code"],
                "client_id": secret["client_id"],
                "client_secret": secret["client_secret"],
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            raise HTTPException(
                status_code=token_resp.status_code,
                detail=f"Token exchange failed: {token_resp.text[:300]}",
            )
        tokens = token_resp.json()

        # Identify which account just authorized — Google's userinfo endpoint
        # returns the email. We never extract email from the access token
        # itself (it's an opaque bearer token, not an ID token).
        userinfo_resp = await client.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        if userinfo_resp.status_code != 200:
            raise HTTPException(
                status_code=userinfo_resp.status_code,
                detail=f"Couldn't read user profile after auth: {userinfo_resp.text[:300]}",
            )
        userinfo = userinfo_resp.json()

    email = userinfo.get("email")
    if not email:
        raise HTTPException(status_code=500, detail="Google didn't return an email address for this account.")

    already_existed = (_account_dir(email) / "token.json").exists()

    now = int(time.time())
    token_blob = {
        "access_token": tokens["access_token"],
        "refresh_token": tokens.get("refresh_token"),
        "expires_at": now + int(tokens.get("expires_in", 3600)),
        "scope": tokens.get("scope", ""),
        "token_type": tokens.get("token_type", "Bearer"),
        "last_refreshed_at": now,
    }
    _write_tokens(email, token_blob)

    return AddAccountResult(email=email, already_existed=already_existed)


@router.delete("/accounts/{email}")
async def remove_account(email: str) -> Dict[str, Any]:
    """Wipe local tokens for `email`. Server-side revocation (the user
    going to myaccount.google.com/permissions) is still recommended for a
    full clean — we can't revoke for them, only forget locally.
    """
    d = _account_dir(email)
    if not d.exists():
        raise HTTPException(status_code=404, detail=f"Account {email} not found")
    shutil.rmtree(d)
    return {"removed": email}


# ── Email fetch endpoints ──

GMAIL_LIST_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
GMAIL_GET_URL_FMT = "https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}"


async def _fetch_unread_for(
    client: httpx.AsyncClient,
    email: str,
    max_results: int,
) -> List[GmailMessage]:
    """Inner helper: list unread message IDs for one account, then parallel-
    fetch metadata for each. Reused by both single-account and fan-out
    endpoints.
    """
    access_token = await _get_valid_access_token(email)
    headers = {"Authorization": f"Bearer {access_token}"}

    list_resp = await client.get(
        GMAIL_LIST_URL,
        headers=headers,
        params={"q": "is:unread in:inbox", "maxResults": max(1, min(max_results, 50))},
        timeout=15,
    )
    if list_resp.status_code != 200:
        raise HTTPException(
            status_code=list_resp.status_code,
            detail=f"Gmail list for {email} failed: {list_resp.text[:300]}",
        )
    msg_refs = list_resp.json().get("messages", [])

    async def _fetch_meta(msg_id: str) -> Optional[GmailMessage]:
        r = await client.get(
            GMAIL_GET_URL_FMT.format(id=msg_id),
            headers=headers,
            params={
                "format": "metadata",
                "metadataHeaders": ["Subject", "From", "Date"],
            },
            timeout=15,
        )
        if r.status_code != 200:
            return None
        d = r.json()
        headers_dict = {
            h["name"]: h["value"]
            for h in d.get("payload", {}).get("headers", [])
        }
        return GmailMessage(
            id=d["id"],
            threadId=d.get("threadId", d["id"]),
            accountEmail=email,
            sender=headers_dict.get("From", ""),
            subject=headers_dict.get("Subject", ""),
            date=headers_dict.get("Date", ""),
            snippet=d.get("snippet", "") or "",
            labelIds=d.get("labelIds", []) or [],
            internalDate=d.get("internalDate"),
        )

    metas = await asyncio.gather(*(_fetch_meta(m["id"]) for m in msg_refs))
    return [m for m in metas if m is not None]


@router.get("/accounts/{email}/emails/unread", response_model=EmailsResult)
async def fetch_unread_for_account(email: str, max_results: int = 20) -> EmailsResult:
    """Read unread emails for one specific account. Useful when the UI
    wants to refresh a single column rather than all accounts.
    """
    async with httpx.AsyncClient() as client:
        emails = await _fetch_unread_for(client, email, max_results)
    return EmailsResult(emails=emails, accounts=[email])


@router.get("/emails/unread/all", response_model=EmailsResult)
async def fetch_unread_all_accounts(max_per_account: int = 20) -> EmailsResult:
    """Universal-inbox path: parallel-fetch unread emails from every
    authorized account, merge into one result. Errors per-account are
    captured separately so a single broken account (e.g. revoked refresh
    token) doesn't take down the whole inbox.
    """
    if not ACCOUNTS_DIR.exists():
        return EmailsResult(emails=[], accounts=[])

    account_emails = sorted(
        d.name for d in ACCOUNTS_DIR.iterdir()
        if d.is_dir() and (d / "token.json").exists()
    )
    if not account_emails:
        return EmailsResult(emails=[], accounts=[])

    errors: Dict[str, str] = {}
    all_emails: List[GmailMessage] = []

    async with httpx.AsyncClient() as client:
        async def _safe_fetch(em: str) -> List[GmailMessage]:
            try:
                return await _fetch_unread_for(client, em, max_per_account)
            except HTTPException as e:
                errors[em] = str(e.detail)
                return []
            except Exception as e:  # noqa: BLE001
                errors[em] = str(e)
                return []

        results = await asyncio.gather(*(_safe_fetch(em) for em in account_emails))

    for chunk in results:
        all_emails.extend(chunk)

    # Sort newest-first by Gmail's internalDate (ms since epoch). Falls back
    # to date string sort which is approximate but decent.
    def _sort_key(msg: GmailMessage) -> int:
        if msg.internalDate:
            try:
                return int(msg.internalDate)
            except ValueError:
                return 0
        return 0

    all_emails.sort(key=_sort_key, reverse=True)

    return EmailsResult(emails=all_emails, accounts=account_emails, errors=errors)
