"""Inbox Multi — direct OAuth + Gmail API for multi-account universal inbox.

See MICROSERVICE.md for the architecture rationale (short version: gws is
single-account, real universal inbox needs N independent credential slots,
so we bypass gws and talk to Google directly).

READ ONLY, and metadata only. The OAuth scope is gmail.readonly and every
fetch asks Gmail for `format=metadata` — Subject/From/Date plus Gmail's own
snippet, never message bodies. Sending lives in a different service with a
different consent (gmail-manager) so that nothing here can post on the user's
behalf, however it is called.
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
from typing import Any, Dict, List, NamedTuple, Optional
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


def _authorized_account_emails() -> List[str]:
    """Every account that has a token on disk, sorted.

    One definition so the fan-out endpoints and the "which accounts *do* exist?"
    error text can never disagree about who is authorized — they used to scan
    the directory independently.
    """
    if not ACCOUNTS_DIR.exists():
        return []
    return sorted(
        d.name for d in ACCOUNTS_DIR.iterdir()
        if d.is_dir() and (d / "token.json").exists()
    )


def _read_tokens(email: str) -> Dict[str, Any]:
    token_file = _account_dir(email) / "token.json"
    if not token_file.exists():
        # A lookup miss hands back the candidates (portal/VERB_AUTHORING.md
        # rule 5). An agent that guessed the wrong address — or was handed a
        # typo in a verb arg — can correct itself, instead of reporting the
        # much more damaging "no mail found for that account".
        known = _authorized_account_emails()
        hint = (
            f" Authorized accounts: {', '.join(known)}."
            if known else " No accounts are authorized yet."
        )
        raise HTTPException(
            status_code=404,
            detail=f"Account {email} is not authorized.{hint}",
        )
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

            # A request carrying NONE of the OAuth parameters is not part of the
            # flow — it is the browser fetching /favicon.ico immediately after it
            # renders the success page below, or a probe. This check must come
            # FIRST, before the state comparison.
            #
            # 2026-09-18: it did not, and the `else: # Browser hit / favicon,
            # ignore` branch at the bottom was therefore UNREACHABLE — an absent
            # state ("") is not an equal state, so every favicon hit fell into
            # the CSRF branch and set state_mismatch. The sequence was: consent
            # succeeds, code is captured, success page renders, browser requests
            # the favicon a few ms later, error is set, and the waiter (which
            # polls every 0.5s) sees the error it had no reason to expect. A
            # completed, valid authorization was discarded and the user was told
            # "OAuth error: state_mismatch" after a flow that looked perfect.
            # An empty state is a missing state, not a mismatched one.
            if not qs.get("code") and not qs.get("error") and not qs.get("state"):
                self.send_response(204)
                self.end_headers()
                return

            # Once the code is captured the flow is OVER. A late arrival must
            # never be able to overwrite a success with a failure — that is the
            # same bug in its second form.
            if code_holder["code"] is not None:
                self.send_response(204)
                self.end_headers()
                return

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
            else:
                # A state that is PRESENT and WRONG is the real CSRF case, and
                # it is the only thing that reaches here now: stray requests and
                # post-success arrivals were both returned above. Keeping this
                # branch strict is the point — the fix above narrows WHAT counts
                # as a mismatch, it does not soften the response to a genuine one.
                code_holder["error"] = "state_mismatch"
                body = "<html><body><h2>State mismatch — possible CSRF attempt; aborted.</h2></body></html>"

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
                # gmail.readonly is a RESTRICTED scope, so a shared, verified
                # client would need a CASA third-party security assessment,
                # re-done annually. Verification is NOT required when the OAuth
                # client is owned by the user (their own Cloud project); they
                # accept the "unverified app" warning during consent instead.
                #
                # That project must be published "In production", NOT left in
                # "Testing" (which an earlier version of this comment advised):
                # Testing revokes refresh tokens after 7 DAYS and restricts
                # consent to a hand-maintained test-user list. In production and
                # unverified, tokens persist and any account can click through —
                # the cost is a permanent, unresettable 100-user cap per project,
                # which is irrelevant when each user brings their own client and
                # is its only user.
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

# The query that shipped before search existed. Every caller that doesn't name
# one gets exactly the old behaviour — the unread inbox, unchanged.
DEFAULT_UNREAD_QUERY = "is:unread in:inbox"

# Per-account ceiling for one call. Listing message IDs is one cheap request;
# the metadata fan-out that follows is one request PER MESSAGE, so this bounds
# the worst case at (accounts × 50) round trips rather than letting a caller's
# max_results run away with the event loop.
MAX_RESULTS_PER_ACCOUNT = 50

# Gmail answers an absurd query with an opaque 400 that names nothing useful.
# Catching length here means the caller gets a sentence it can act on.
MAX_QUERY_CHARS = 1024


class _FetchOutcome(NamedTuple):
    """What one account's fetch produced.

    `dropped` counts messages Gmail listed but whose metadata we could not
    read. It is NOT cosmetic bookkeeping: an agent reconciling "have they
    replied yet?" reads a missing message as "no reply" — the opposite of the
    truth. Callers surface it in EmailsResult.errors instead of returning a
    silently short list that looks complete.
    """
    messages: List[GmailMessage]
    dropped: int


def _dropped_note(dropped: int) -> str:
    """Wording for a partial result, kept in one place so both the
    single-account and fan-out paths say the same thing.
    """
    return (
        f"{dropped} message(s) matched but their metadata could not be read — "
        "this result is incomplete."
    )


def _normalize_query(q: Optional[str]) -> str:
    """Validate a caller-supplied Gmail query and fail with the fix, not the
    symptom.

    An empty query is rejected rather than quietly widened to "everything":
    a search that silently returns the whole mailbox is both a surprise bill
    in round trips and, for an agent classifying mail, a much larger blast
    radius than it asked for.
    """
    text = (q or "").strip()
    if not text:
        raise HTTPException(
            status_code=400,
            detail=(
                "Missing `q`. Pass a Gmail search query — e.g. "
                "`subject:interview newer_than:30d`, or `newer_than:7d "
                "category:primary`. For the plain unread inbox call "
                "/emails/unread/all instead."
            ),
        )
    if len(text) > MAX_QUERY_CHARS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Gmail query is {len(text)} characters; the limit here is "
                f"{MAX_QUERY_CHARS}. Narrow it with operators "
                "(from:, subject:, newer_than:) rather than more terms."
            ),
        )
    return text


def _newest_first(messages: List[GmailMessage]) -> List[GmailMessage]:
    """Sort by Gmail's internalDate (ms since epoch), newest first.

    A missing or non-numeric internalDate sorts to 0 (the bottom) rather than
    throwing; Python's sort is stable, so those keep Gmail's own ordering
    among themselves.
    """
    def _key(msg: GmailMessage) -> int:
        if msg.internalDate:
            try:
                return int(msg.internalDate)
            except ValueError:
                return 0
        return 0

    return sorted(messages, key=_key, reverse=True)


async def _fetch_messages_for(
    client: httpx.AsyncClient,
    email: str,
    max_results: int,
    q: str = DEFAULT_UNREAD_QUERY,
) -> _FetchOutcome:
    """Inner helper: list the message IDs matching `q` for one account, then
    parallel-fetch metadata for each. The single fetch behind every endpoint
    here — unread and search, one account and all.

    This was `_fetch_unread_for` with the query hardcoded. Search is the same
    two Gmail calls with a different `q`, so it is parameterized rather than
    copied: two fetches is how the paths would quietly drift into returning
    different shapes (search missing labelIds, say) while the Mac decodes both
    into one model.

    METADATA ONLY, deliberately. `format=metadata` limited to Subject/From/Date
    plus Gmail's own snippet is enough to triage an inbox or classify a reply,
    and it keeps message BODIES out of the result. Bodies are attacker-
    controlled text — anyone can mail you — and this read path feeds agents.
    Widening to `format=full` would hand a prompt-injection payload straight
    into a reconcile pass; that needs its own decision, not a quiet edit here.
    """
    access_token = await _get_valid_access_token(email)
    headers = {"Authorization": f"Bearer {access_token}"}

    list_resp = await client.get(
        GMAIL_LIST_URL,
        headers=headers,
        params={
            "q": q,
            "maxResults": max(1, min(max_results, MAX_RESULTS_PER_ACCOUNT)),
        },
        timeout=15,
    )
    if list_resp.status_code != 200:
        # Include the query: a 400 here is nearly always a malformed operator,
        # and the caller can't tell which of its accounts/queries was at fault
        # from "Gmail list failed" alone.
        raise HTTPException(
            status_code=list_resp.status_code,
            detail=f"Gmail list for {email} (q={q!r}) failed: {list_resp.text[:300]}",
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
    messages = [m for m in metas if m is not None]
    return _FetchOutcome(messages=messages, dropped=len(metas) - len(messages))


async def _fetch_one_account(email: str, q: str, max_results: int) -> EmailsResult:
    """One account, one query. Shared by the unread and search routes so both
    report a partial fetch the same way.
    """
    async with httpx.AsyncClient() as client:
        outcome = await _fetch_messages_for(client, email, max_results, q=q)
    errors: Dict[str, str] = {}
    if outcome.dropped:
        errors[email] = _dropped_note(outcome.dropped)
    return EmailsResult(
        emails=_newest_first(outcome.messages),
        accounts=[email],
        errors=errors,
    )


async def _fetch_all_accounts(q: str, max_per_account: int) -> EmailsResult:
    """Fan out one query across every authorized account and merge the
    results newest-first.

    Errors are captured per account rather than raised, so one broken account
    (revoked refresh token, say) degrades that column instead of taking down
    the whole inbox — the same contract the unread fan-out has always had.
    """
    account_emails = _authorized_account_emails()
    if not account_emails:
        return EmailsResult(emails=[], accounts=[])

    errors: Dict[str, str] = {}
    all_emails: List[GmailMessage] = []

    async with httpx.AsyncClient() as client:
        async def _safe_fetch(em: str) -> List[GmailMessage]:
            try:
                outcome = await _fetch_messages_for(client, em, max_per_account, q=q)
            except HTTPException as e:
                errors[em] = str(e.detail)
                return []
            except Exception as e:  # noqa: BLE001
                errors[em] = str(e)
                return []
            if outcome.dropped:
                errors[em] = _dropped_note(outcome.dropped)
            return outcome.messages

        results = await asyncio.gather(*(_safe_fetch(em) for em in account_emails))

    for chunk in results:
        all_emails.extend(chunk)

    return EmailsResult(
        emails=_newest_first(all_emails),
        accounts=account_emails,
        errors=errors,
    )


@router.get("/accounts/{email}/emails/unread", response_model=EmailsResult)
async def fetch_unread_for_account(email: str, max_results: int = 20) -> EmailsResult:
    """Read unread emails for one specific account. Useful when the UI
    wants to refresh a single column rather than all accounts.
    """
    return await _fetch_one_account(email, DEFAULT_UNREAD_QUERY, max_results)


@router.get("/accounts/{email}/emails/search", response_model=EmailsResult)
async def search_emails_for_account(
    email: str,
    q: str = "",
    max_results: int = 25,
) -> EmailsResult:
    """Run a Gmail query against ONE authorized account.

    Same EmailsResult / GmailMessage shape as the unread routes — callers
    decode one model whichever endpoint they hit. `q` is Gmail's own query
    language, passed through untouched (`from:`, `subject:`, `newer_than:`,
    `in:anywhere`, …); we validate its presence and length, not its grammar,
    because Gmail's parser is the authority on that and a local re-implementation
    would reject valid queries as it fell behind.

    Unknown account → 404 listing the accounts that ARE authorized.
    """
    return await _fetch_one_account(email, _normalize_query(q), max_results)


@router.get("/accounts/{email}/emails/{message_id}", response_model=GmailMessage)
async def fetch_one_message(email: str, message_id: str) -> GmailMessage:
    """Metadata for ONE message in one authorized account.

    DECLARED 2026-09-17 (Phase JM review). The Swift client has always called
    this route — `MultiAccountInboxService.message(id:account:)` — and no build
    ever served it, so every `mail.read` carrying an `account` spent a
    guaranteed 404 and then silently re-ran the very query it was trying to
    skip. The Swift comment framed that as a fallback for "older installed
    builds"; there was no build, old or new, that had the route. A dead branch
    that reads as a compatibility shim is worse than a missing one, because
    nobody goes looking for it.

    Declared AFTER `/unread` and `/search` deliberately: FastAPI matches in
    declaration order, so a `{message_id}` placeholder declared first would
    swallow both of those literal routes.

    Metadata-only, exactly like the list routes. Subject/from/date/snippet is
    what a caller reconciling an application status needs, and leaving the body
    on the server keeps attacker-controlled prose out of the agent context that
    reads this.

    Unknown account → 404 + the authorized addresses (rule 5, via _read_tokens).
    Unknown message id → 404, which the Swift client reads as "fall back to the
    query the id came from".
    """
    access_token = await _get_valid_access_token(email)
    async with httpx.AsyncClient() as client:
        r = await client.get(
            GMAIL_GET_URL_FMT.format(id=message_id),
            headers={"Authorization": f"Bearer {access_token}"},
            params={
                "format": "metadata",
                "metadataHeaders": ["Subject", "From", "Date"],
            },
            timeout=15,
        )
    if r.status_code == 404:
        raise HTTPException(
            status_code=404,
            detail=f"No message {message_id} in {email}.",
        )
    if r.status_code != 200:
        raise HTTPException(
            status_code=r.status_code,
            detail=f"Gmail get for {email} failed: {r.text[:300]}",
        )
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


@router.get("/emails/unread/all", response_model=EmailsResult)
async def fetch_unread_all_accounts(max_per_account: int = 20) -> EmailsResult:
    """Universal-inbox path: parallel-fetch unread emails from every
    authorized account, merged newest-first.
    """
    return await _fetch_all_accounts(DEFAULT_UNREAD_QUERY, max_per_account)


@router.get("/emails/search", response_model=EmailsResult)
async def search_emails_all_accounts(q: str = "", max_results: int = 25) -> EmailsResult:
    """Run a Gmail query across EVERY authorized account, merged newest-first.

    `max_results` is per account, not per call — the merged list can be
    (accounts × max_results) long. The name is the one the caller contract
    uses; its unread twin above calls the same thing `max_per_account`.

    Accounts that fail are reported in `errors` and the rest still return, so
    a search never comes back empty just because one token went stale.
    """
    return await _fetch_all_accounts(_normalize_query(q), max_results)
