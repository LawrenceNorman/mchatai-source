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
import base64
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

# Phase MX.4 — the two access levels this service can hold.
#
# `gmail.modify` is a superset of `gmail.readonly`: it adds label changes and
# trash, and it does NOT add permanent delete (that needs the full
# `https://mail.google.com/` scope, which this service deliberately never
# requests — "delete" here means "move to Trash", recoverable for 30 days by
# the user, in Gmail, without us).
READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
MODIFY_SCOPE = "https://www.googleapis.com/auth/gmail.modify"


def _granted_scopes(tokens: Dict[str, Any]) -> List[str]:
    return [s for s in (tokens.get("scope", "") or "").split(" ") if s]


def _can_modify(tokens: Dict[str, Any]) -> bool:
    """Whether THIS account's stored grant allows writes.

    Per account, never per app. Accounts authorised before MX.4 hold
    `gmail.readonly` and keep working read-only; a user is not silently
    upgraded, and the UI must not draw a control the grant cannot serve.
    """
    return MODIFY_SCOPE in _granted_scopes(tokens)


class AccountInfo(BaseModel):
    email: str
    expires_at: int                  # unix seconds
    has_refresh_token: bool
    last_refreshed_at: Optional[int] = None
    # MX.4 — what this account's grant actually permits.
    can_modify: bool = False


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
    # Phase MX.10 — where to resume, PER ACCOUNT.
    #
    # A universal inbox merges N independent Gmail result sets, so there is no
    # single cursor: each account is at its own depth and they exhaust at
    # different times. An account that runs out simply drops out of this dict,
    # and when the dict is empty there is nothing older anywhere.
    next_page_tokens: Dict[str, str] = Field(default_factory=dict)


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
                can_modify=_can_modify(t),
            ))
    return AccountsList(
        accounts=items,
        client_secret_present=CLIENT_SECRET_PATH.exists(),
    )


@router.post("/accounts/add", response_model=AddAccountResult)
async def add_account(access: str = "modify") -> AddAccountResult:
    """Run OAuth loopback flow for a new Google account. Long-running
    (≤5 min while user completes consent in browser).
    """
    # Unknown values fall back to the WIDER grant rather than erroring, because
    # the alternative is a typo silently producing a read-only account whose
    # controls then quietly do nothing — the failure mode this whole phase is
    # about. Google's consent screen is the real gate either way.
    requested_scope = READONLY_SCOPE if access.lower() == "readonly" else MODIFY_SCOPE

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
                # MX.4 — `access` decides. Default is `modify`, because a mail
                # client that cannot archive is a feed reader; Google's consent
                # screen names exactly what is being granted, so the user sees
                # and approves the difference. `readonly` remains available for
                # a caller that wants the narrower grant.
                "scope": f"{requested_scope} openid email profile",
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
    # Gmail's own cursor for "the next page of THIS query for THIS account".
    # Empty string means this account has nothing older left.
    next_page_token: str = ""


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
    page_token: str = "",
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
            # Gmail ignores an empty pageToken, so the first page and the Nth
            # go through exactly one code path.
            **({"pageToken": page_token} if page_token else {}),
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
    listing = list_resp.json()
    msg_refs = listing.get("messages", [])
    next_token = listing.get("nextPageToken", "") or ""

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
    return _FetchOutcome(
        messages=messages,
        dropped=len(metas) - len(messages),
        next_page_token=next_token,
    )


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
        next_page_tokens=({email: outcome.next_page_token}
                          if outcome.next_page_token else {}),
    )


async def _fetch_all_accounts(
    q: str,
    max_per_account: int,
    page_tokens: Optional[Dict[str, str]] = None,
) -> EmailsResult:
    """Fan out one query across every authorized account and merge the
    results newest-first.

    Errors are captured per account rather than raised, so one broken account
    (revoked refresh token, say) degrades that column instead of taking down
    the whole inbox — the same contract the unread fan-out has always had.
    """
    account_emails = _authorized_account_emails()
    if not account_emails:
        return EmailsResult(emails=[], accounts=[])

    tokens = page_tokens or {}
    # A CONTINUATION asks only the accounts that still have pages. An account
    # that already ran out has no token, and re-listing it from the top would
    # re-deliver its newest mail as though it were older — duplicate rows
    # appearing BELOW the ones they duplicate, which reads as corruption.
    targets = [em for em in account_emails if em in tokens] if tokens else account_emails
    if not targets:
        return EmailsResult(emails=[], accounts=account_emails)

    errors: Dict[str, str] = {}
    all_emails: List[GmailMessage] = []
    next_tokens: Dict[str, str] = {}

    async with httpx.AsyncClient() as client:
        async def _safe_fetch(em: str) -> List[GmailMessage]:
            try:
                outcome = await _fetch_messages_for(
                    client, em, max_per_account, q=q, page_token=tokens.get(em, ""))
            except HTTPException as e:
                errors[em] = str(e.detail)
                return []
            except Exception as e:  # noqa: BLE001
                errors[em] = str(e)
                return []
            if outcome.dropped:
                errors[em] = _dropped_note(outcome.dropped)
            if outcome.next_page_token:
                next_tokens[em] = outcome.next_page_token
            return outcome.messages

        results = await asyncio.gather(*(_safe_fetch(em) for em in targets))

    for chunk in results:
        all_emails.extend(chunk)

    return EmailsResult(
        emails=_newest_first(all_emails),
        accounts=targets,
        errors=errors,
        next_page_tokens=next_tokens,
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


def _decode_page_tokens(raw: str) -> Dict[str, str]:
    """`page_tokens` arrives as a JSON object in a query string.

    A malformed value is treated as "no cursor" rather than as an error: the
    worst case is the caller gets page one again, which is recoverable and
    obvious. Refusing the whole request because a cursor was garbled would
    take the inbox down over a resumption detail.
    """
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except (ValueError, TypeError):
        return {}
    if not isinstance(parsed, dict):
        return {}
    return {str(k): str(v) for k, v in parsed.items() if v}


@router.get("/emails/unread/all", response_model=EmailsResult)
async def fetch_unread_all_accounts(
    max_per_account: int = 20,
    page_tokens: str = "",
) -> EmailsResult:
    """Universal-inbox path: parallel-fetch unread emails from every
    authorized account, merged newest-first.

    `page_tokens` is a JSON object of accountEmail → Gmail pageToken, echoed
    back from a previous response's `next_page_tokens`. Omit it for page one.
    """
    return await _fetch_all_accounts(
        DEFAULT_UNREAD_QUERY, max_per_account, _decode_page_tokens(page_tokens))


@router.get("/emails/search", response_model=EmailsResult)
async def search_emails_all_accounts(
    q: str = "",
    max_results: int = 25,
    page_tokens: str = "",
) -> EmailsResult:
    """Run a Gmail query across EVERY authorized account, merged newest-first.

    `max_results` is per account, not per call — the merged list can be
    (accounts × max_results) long. The name is the one the caller contract
    uses; its unread twin above calls the same thing `max_per_account`.

    Accounts that fail are reported in `errors` and the rest still return, so
    a search never comes back empty just because one token went stale.
    """
    return await _fetch_all_accounts(
        _normalize_query(q), max_results, _decode_page_tokens(page_tokens))


# ── Message BODIES (Phase MX.2) ────────────────────────────────────────────
#
# ⚠️ READ THIS BEFORE TOUCHING ANYTHING BELOW. ⚠️
#
# Everything above this line is METADATA ONLY, on purpose, and the module
# docstring says so. This section is the one exception, and it exists because
# a mail reader that cannot show the message is not a mail reader — the macOS
# AI Inbox could only ever render Gmail's ~200-character snippet and then told
# the user to "open in Gmail for full message".
#
# THE RULE THAT MAKES THIS SAFE IS NOT IN THIS FILE.
#
# Message bodies are attacker-controlled text: anyone can mail you, and the
# 2026 literature on this is not theoretical — zero-click exfiltration via
# white-on-white HTML aimed at a mailbox-connected agent is a demonstrated
# attack, and the payload hides in HTML, in MIME structure and in headers.
# The metadata routes above feed AGENTS. This route feeds a HUMAN, through a
# quarantined WKWebView, and the split is enforced on the Swift side:
#
#   * `AIInboxAppletVerbs.verbs` does NOT list a body verb, and a test fails
#     if one ever appears there. An agent cannot reach this route.
#   * `MailBodyService` is the only Swift caller. It hands the result to
#     `QuarantinedMailBodyView` (JavaScript off, remote images blocked, every
#     navigation cancelled and routed to the in-app browser).
#   * Anything that later summarises a body runs `MailTextSanitizer` FIRST,
#     which strips hidden/zero-width/colour-matched text before a prompt is
#     ever built, and wraps what survives as labelled untrusted data.
#
# So: do not add a body field to `GmailMessage`. Do not widen the list routes
# to `format=full`. Do not "helpfully" call this from a verb. Each of those is
# one line of diff and each one undoes the whole boundary. If you need bodies
# somewhere new, the question to answer first is who reads the result — a
# person, or a model that can act.


class MailAttachment(BaseModel):
    """One attachment, by reference. The bytes are NOT inlined.

    A 20 MB PDF base64'd into a JSON response is 27 MB of string that has to
    cross the loopback socket and be parsed before a single word of the email
    renders. `attachmentId` is enough to fetch it on demand, when and if the
    user asks.
    """
    attachmentId: Optional[str] = None
    filename: str = ""
    mimeType: str = ""
    size: int = 0
    # Inline images referenced by the HTML as `cid:<contentId>`.
    contentId: Optional[str] = None
    isInline: bool = False


class MailBody(BaseModel):
    id: str
    threadId: str
    accountEmail: str
    # Both parts when the message carries both — the client decides. text is
    # the safe default; html is what the quarantined view renders.
    text: str = ""
    html: str = ""
    attachments: List[MailAttachment] = Field(default_factory=list)
    # Recipients live here rather than on the metadata model because they are
    # only needed once you are READING a message, and a reply needs them.
    to: str = ""
    cc: str = ""
    reply_to: str = ""
    # True when Gmail truncated us — a caller that renders a partial body
    # without saying so is lying by omission.
    truncated: bool = False


def _b64url_decode(data: str) -> bytes:
    """Gmail returns base64url WITHOUT padding. `base64.urlsafe_b64decode`
    raises on that, so pad it back rather than letting a body fail to decode
    for a reason that has nothing to do with the mail."""
    if not data:
        return b""
    pad = "=" * (-len(data) % 4)
    try:
        return base64.urlsafe_b64decode(data + pad)
    except Exception:
        return b""


def _decode_part_text(part: Dict[str, Any]) -> str:
    """Body bytes of one MIME part, as a string.

    Decodes with the part's declared charset and falls back to utf-8 with
    replacement. `errors="replace"` rather than `"ignore"`: a visible U+FFFD
    tells the reader a byte was mangled, whereas silently dropping it can
    change what a sentence says.
    """
    raw = _b64url_decode(part.get("body", {}).get("data", ""))
    if not raw:
        return ""
    charset = "utf-8"
    for h in part.get("headers", []) or []:
        if h.get("name", "").lower() == "content-type":
            value = h.get("value", "")
            if "charset=" in value.lower():
                charset = value.lower().split("charset=", 1)[1]
                charset = charset.split(";")[0].strip().strip('"').strip("'")
            break
    try:
        return raw.decode(charset, errors="replace")
    except (LookupError, TypeError):
        return raw.decode("utf-8", errors="replace")


def _walk_parts(payload: Dict[str, Any]) -> tuple[str, str, List[MailAttachment]]:
    """Depth-first MIME walk → (text, html, attachments).

    Gmail nests arbitrarily (multipart/mixed wrapping multipart/alternative
    wrapping the actual parts), so this recurses rather than looking one level
    down. FIRST text/plain and FIRST text/html win: `multipart/alternative`
    orders parts worst-to-best, and taking the first of each type per branch
    avoids concatenating a plain-text fallback onto the HTML that replaced it.
    """
    text_out, html_out = "", ""
    attachments: List[MailAttachment] = []

    def visit(part: Dict[str, Any]) -> None:
        nonlocal text_out, html_out
        mime = (part.get("mimeType") or "").lower()
        filename = part.get("filename") or ""
        body = part.get("body", {}) or {}
        headers = {
            (h.get("name") or "").lower(): (h.get("value") or "")
            for h in (part.get("headers") or [])
        }
        disposition = headers.get("content-disposition", "").lower()
        content_id = headers.get("content-id", "").strip("<>") or None

        if part.get("parts"):
            for child in part["parts"]:
                visit(child)
            return

        # An attachment is anything with a filename or an explicit attachment
        # disposition — NOT "anything that isn't text". A text/plain file the
        # sender attached is an attachment, and a bare inline image is not.
        if filename or "attachment" in disposition or body.get("attachmentId"):
            attachments.append(MailAttachment(
                attachmentId=body.get("attachmentId"),
                filename=filename,
                mimeType=part.get("mimeType") or "application/octet-stream",
                size=int(body.get("size") or 0),
                contentId=content_id,
                isInline=("inline" in disposition) or bool(content_id),
            ))
            return

        if mime == "text/plain" and not text_out:
            text_out = _decode_part_text(part)
        elif mime == "text/html" and not html_out:
            html_out = _decode_part_text(part)

    visit(payload)
    return text_out, html_out, attachments


@router.get("/accounts/{email}/messages/{message_id}/body", response_model=MailBody)
async def fetch_message_body(email: str, message_id: str) -> MailBody:
    """The full body of ONE message, for a HUMAN to read.

    Deliberately NOT reachable from `AIInboxAppletVerbs` — see the block
    comment above this section for the whole reasoning. The route lives under
    `/messages/` rather than `/emails/` so that it is visibly not a sibling of
    the metadata routes, and so no future wildcard under `/emails/` picks it
    up by accident.
    """
    access_token = await _get_valid_access_token(email)
    async with httpx.AsyncClient() as client:
        r = await client.get(
            GMAIL_GET_URL_FMT.format(id=message_id),
            headers={"Authorization": f"Bearer {access_token}"},
            params={"format": "full"},
            timeout=30,
        )
    if r.status_code == 404:
        raise HTTPException(status_code=404, detail=f"No message {message_id} in {email}.")
    if r.status_code != 200:
        raise HTTPException(
            status_code=r.status_code,
            detail=f"Gmail body fetch for {email} failed: {r.text[:300]}",
        )

    d = r.json()
    payload = d.get("payload", {}) or {}
    headers_dict = {
        (h.get("name") or "").lower(): (h.get("value") or "")
        for h in payload.get("headers", [])
    }
    text, html, attachments = _walk_parts(payload)

    # A `full` fetch with neither part is not an error, but it IS worth being
    # honest about: Gmail returns this for some calendar invites and encrypted
    # messages. Fall back to the snippet so the reader shows SOMETHING true
    # rather than an empty page that looks like a rendering failure.
    if not text and not html:
        text = d.get("snippet", "") or ""

    return MailBody(
        id=d["id"],
        threadId=d.get("threadId", d["id"]),
        accountEmail=email,
        text=text,
        html=html,
        attachments=attachments,
        to=headers_dict.get("to", ""),
        cc=headers_dict.get("cc", ""),
        reply_to=headers_dict.get("reply-to", ""),
        truncated=False,
    )


@router.get("/accounts/{email}/threads/{thread_id}", response_model=EmailsResult)
async def fetch_thread(email: str, thread_id: str) -> EmailsResult:
    """Every message in one thread, oldest-first, METADATA ONLY.

    Threading was the other half of "this is not a reader": `threadId` has
    always been carried on each message and never used to group anything, so
    a ten-message conversation drew ten unrelated rows. This is the read that
    turns them into one.

    Metadata only, like its siblings — the reader fetches each message's body
    lazily, and only the ones the user actually expands. A thread route that
    returned ten full bodies would pull megabytes to render a list.
    """
    access_token = await _get_valid_access_token(email)
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"https://gmail.googleapis.com/gmail/v1/users/me/threads/{thread_id}",
            headers={"Authorization": f"Bearer {access_token}"},
            params={
                "format": "metadata",
                "metadataHeaders": ["Subject", "From", "Date", "To"],
            },
            timeout=20,
        )
    if r.status_code == 404:
        raise HTTPException(status_code=404, detail=f"No thread {thread_id} in {email}.")
    if r.status_code != 200:
        raise HTTPException(
            status_code=r.status_code,
            detail=f"Gmail thread fetch for {email} failed: {r.text[:300]}",
        )

    messages: List[GmailMessage] = []
    for d in r.json().get("messages", []) or []:
        hd = {
            h["name"]: h["value"]
            for h in d.get("payload", {}).get("headers", [])
        }
        messages.append(GmailMessage(
            id=d["id"],
            threadId=d.get("threadId", thread_id),
            accountEmail=email,
            sender=hd.get("From", ""),
            subject=hd.get("Subject", ""),
            date=hd.get("Date", ""),
            snippet=d.get("snippet", "") or "",
            labelIds=d.get("labelIds", []) or [],
            internalDate=d.get("internalDate"),
        ))
    # Oldest first — a thread reads top to bottom, unlike an inbox.
    messages.sort(key=lambda m: int(m.internalDate or 0))
    return EmailsResult(emails=messages, accounts=[email], errors={})



# ── Mutations (Phase MX.4) ─────────────────────────────────────────────────
#
# WHAT THIS CAN AND CANNOT DO, precisely.
#
# `gmail.modify` covers label changes and trash. It does NOT cover permanent
# delete — that needs the full `https://mail.google.com/` scope, which this
# service never requests. So "delete" here means MOVE TO TRASH: reversible by
# the user, in Gmail, for 30 days, without us. A mail client that can
# irreversibly destroy mail on behalf of an agent is a different risk category,
# and declining the scope is how we stay out of it.
#
# PER-ACCOUNT ENFORCEMENT. Every route below checks the stored grant for THAT
# mailbox and 403s with a specific, actionable message when it is read-only.
# Accounts authorised before MX.4 hold `gmail.readonly` and are refused here —
# they are not silently upgraded, and the Mac UI reads `can_modify` so the
# control is not drawn in the first place. This check is the backstop for the
# case where it is.


class ModifyRequest(BaseModel):
    message_ids: List[str]
    add_label_ids: List[str] = Field(default_factory=list)
    remove_label_ids: List[str] = Field(default_factory=list)


class ModifyResult(BaseModel):
    modified: List[str]
    failed: Dict[str, str] = Field(default_factory=dict)


async def _require_modify(email: str) -> str:
    """Access token for an account that may write, or a 403 that says why."""
    tokens = _read_tokens(email)
    if not _can_modify(tokens):
        raise HTTPException(
            status_code=403,
            detail=(
                f"{email} is authorised read-only. Remove it in AI Inbox → Accounts "
                "and add it again to grant permission to archive, star and trash. "
                "Google's consent screen is the only thing that can grant this."
            ),
        )
    return await _get_valid_access_token(email)


@router.post("/accounts/{email}/messages/modify", response_model=ModifyResult)
async def modify_messages(email: str, req: ModifyRequest) -> ModifyResult:
    """Add/remove labels on one or more messages in one account.

    Archive is `remove_label_ids: ["INBOX"]`. Mark-read is removing `UNREAD`.
    Star is adding `STARRED`. The CALLER names the labels rather than this
    service growing a verb per action, because Gmail's label model already is
    the vocabulary and a `/archive` route would just be a rename of one call.

    Uses batchModify: one request for N messages, so archiving a selection is
    one round trip rather than N.
    """
    if not req.message_ids:
        return ModifyResult(modified=[], failed={})
    access_token = await _require_modify(email)
    async with httpx.AsyncClient() as client:
        r = await client.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify",
            headers={"Authorization": f"Bearer {access_token}"},
            json={
                "ids": req.message_ids,
                "addLabelIds": req.add_label_ids,
                "removeLabelIds": req.remove_label_ids,
            },
            timeout=20,
        )
    if r.status_code not in (200, 204):
        raise HTTPException(
            status_code=r.status_code,
            detail=f"Gmail batchModify for {email} failed: {r.text[:300]}",
        )
    # batchModify returns 204 with no body: it succeeded for all ids or it
    # failed for all of them. Reporting every id as modified is therefore
    # accurate here, and is NOT a guess.
    return ModifyResult(modified=req.message_ids, failed={})


@router.post("/accounts/{email}/messages/trash", response_model=ModifyResult)
async def trash_messages(email: str, req: ModifyRequest) -> ModifyResult:
    """Move messages to Trash. Recoverable in Gmail for 30 days.

    One call per message: Gmail has no batch trash. Failures are reported
    PER MESSAGE rather than aborting, so trashing twelve messages with one
    bad id moves eleven and tells you which one did not — the alternative is
    an all-or-nothing error and a user who does not know what happened.
    """
    if not req.message_ids:
        return ModifyResult(modified=[], failed={})
    access_token = await _require_modify(email)
    headers = {"Authorization": f"Bearer {access_token}"}
    modified: List[str] = []
    failed: Dict[str, str] = {}

    async with httpx.AsyncClient() as client:
        async def _trash(mid: str) -> None:
            try:
                r = await client.post(
                    f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{mid}/trash",
                    headers=headers,
                    timeout=20,
                )
            except Exception as e:  # noqa: BLE001
                failed[mid] = str(e)
                return
            if r.status_code == 200:
                modified.append(mid)
            else:
                failed[mid] = f"{r.status_code}: {r.text[:160]}"

        await asyncio.gather(*(_trash(m) for m in req.message_ids))

    return ModifyResult(modified=modified, failed=failed)


@router.post("/accounts/{email}/messages/untrash", response_model=ModifyResult)
async def untrash_messages(email: str, req: ModifyRequest) -> ModifyResult:
    """Undo a trash. The other half of a reversible destructive action —
    shipped WITH it, because an undo added later is an undo nobody trusts."""
    if not req.message_ids:
        return ModifyResult(modified=[], failed={})
    access_token = await _require_modify(email)
    headers = {"Authorization": f"Bearer {access_token}"}
    modified: List[str] = []
    failed: Dict[str, str] = {}

    async with httpx.AsyncClient() as client:
        async def _untrash(mid: str) -> None:
            try:
                r = await client.post(
                    f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{mid}/untrash",
                    headers=headers,
                    timeout=20,
                )
            except Exception as e:  # noqa: BLE001
                failed[mid] = str(e)
                return
            if r.status_code == 200:
                modified.append(mid)
            else:
                failed[mid] = f"{r.status_code}: {r.text[:160]}"

        await asyncio.gather(*(_untrash(m) for m in req.message_ids))

    return ModifyResult(modified=modified, failed=failed)
