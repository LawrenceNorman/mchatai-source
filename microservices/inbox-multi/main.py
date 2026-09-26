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
from html import unescape as _unescape_html
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

# Phase GW.2 — the Workspace scopes, added so ONE account list can serve mail,
# Drive and Tasks instead of the app holding a second Google auth via the `gws`
# CLI. Both are `.readonly` on purpose: this service's whole contract is that
# nothing it holds can write to the user's Google account, and Drive write is a
# RESTRICTED scope that would drag the user's OAuth client into verification.
#
# These are ADDITIVE. An account authorised before GW.2 has neither, keeps
# working for mail, and reports `can_read_drive/can_read_tasks = False` so the
# UI can offer a re-consent instead of showing a broken Drive tab.
DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly"
TASKS_SCOPE = "https://www.googleapis.com/auth/tasks.readonly"

CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly"
CONTACTS_SCOPE = "https://www.googleapis.com/auth/contacts.readonly"

# Phase GW2 — the two scopes that are NOT readonly-shaped.
#
# `tasks` (no suffix) is read AND write; Google has no "tasks.write". It is the
# only write scope this service requests, and it is requested because a task
# list you cannot add to is a report, not a to-do list. Note what it still
# cannot do: it grants nothing outside Google Tasks, so the blast radius of a
# mistake is a wrong row in the user's own task list, recoverable by deleting
# it. That is a different category from `gmail.send`, which this service
# deliberately never holds (see the module docstring).
TASKS_RW_SCOPE = "https://www.googleapis.com/auth/tasks"

# Drive read/write. OPT-IN, and never part of a normal connect.
#
# Google has no delete-only or trash-only Drive scope: `drive.file` covers only
# files this app itself created, which is useless for the user's existing
# Drive, so trashing one file needs FULL read/write over everything. That is a
# real escalation from the service's default posture — the whole point of
# holding `drive.readonly` is that nothing here CAN modify a user's Drive.
#
# So it is requested only when the user explicitly asks for editing on a
# specific account (`services=drive-rw`), and every account reports
# `can_write_drive` separately. An account connected for mail stays read-only
# on Drive forever unless its owner says otherwise.
#
# Even with it, this service only ever TRASHES. Drive's trash is recoverable
# for 30 days; `?supportsAllDrives` + DELETE would be permanent, and there is
# deliberately no route that does that.
DRIVE_RW_SCOPE = "https://www.googleapis.com/auth/drive"
DRIVE_ACTIVITY_SCOPE = "https://www.googleapis.com/auth/drive.activity.readonly"

# What `services=` on /accounts/add may name, and the scope each one adds.
SERVICE_SCOPES = {
    "drive": DRIVE_SCOPE,
    "tasks": TASKS_SCOPE,
    "calendar": CALENDAR_SCOPE,
    "contacts": CONTACTS_SCOPE,
    # GW2 — "tasks" now asks for READ/WRITE. An account that granted the old
    # readonly scope keeps working for reads and reports canWriteTasks=false,
    # so the Add-task control is not drawn for it rather than failing on click.
    "tasks-rw": TASKS_RW_SCOPE,
    "activity": DRIVE_ACTIVITY_SCOPE,
    "drive-rw": DRIVE_RW_SCOPE,
}


def _granted_scopes(tokens: Dict[str, Any]) -> List[str]:
    return [s for s in (tokens.get("scope", "") or "").split(" ") if s]


def _can_modify(tokens: Dict[str, Any]) -> bool:
    """Whether THIS account's stored grant allows writes.

    Per account, never per app. Accounts authorised before MX.4 hold
    `gmail.readonly` and keep working read-only; a user is not silently
    upgraded, and the UI must not draw a control the grant cannot serve.
    """
    return MODIFY_SCOPE in _granted_scopes(tokens)


def _can_read_drive(tokens: Dict[str, Any]) -> bool:
    # The full `drive` scope is a superset of `drive.readonly`, so an account
    # that opted into editing must not report that it cannot read.
    granted = _granted_scopes(tokens)
    return DRIVE_SCOPE in granted or DRIVE_RW_SCOPE in granted


def _can_read_tasks(tokens: Dict[str, Any]) -> bool:
    # Either scope reads. `tasks` is a superset of `tasks.readonly`, and an
    # account holding only the wider one would otherwise report that it cannot
    # read — a false negative that hides a working account.
    granted = _granted_scopes(tokens)
    return TASKS_SCOPE in granted or TASKS_RW_SCOPE in granted


def _can_write_tasks(tokens: Dict[str, Any]) -> bool:
    return TASKS_RW_SCOPE in _granted_scopes(tokens)


def _can_read_activity(tokens: Dict[str, Any]) -> bool:
    return DRIVE_ACTIVITY_SCOPE in _granted_scopes(tokens)


def _can_write_drive(tokens: Dict[str, Any]) -> bool:
    return DRIVE_RW_SCOPE in _granted_scopes(tokens)


def _can_read_calendar(tokens: Dict[str, Any]) -> bool:
    return CALENDAR_SCOPE in _granted_scopes(tokens)


def _can_read_contacts(tokens: Dict[str, Any]) -> bool:
    return CONTACTS_SCOPE in _granted_scopes(tokens)


class AccountInfo(BaseModel):
    email: str
    expires_at: int                  # unix seconds
    has_refresh_token: bool
    last_refreshed_at: Optional[int] = None
    # MX.4 — what this account's grant actually permits.
    can_modify: bool = False
    # GW.2 — same idea, for the Workspace services. False on every account
    # authorised before GW.2, which is why the UI asks rather than assumes.
    can_read_drive: bool = False
    can_read_tasks: bool = False
    can_read_calendar: bool = False
    can_read_contacts: bool = False
    can_write_tasks: bool = False
    can_read_activity: bool = False
    can_write_drive: bool = False


class AccountsList(BaseModel):
    accounts: List[AccountInfo]
    client_secret_present: bool


class AddAccountResult(BaseModel):
    email: str
    already_existed: bool
    # GW.2 — what Google actually granted, which is not always what was asked
    # for: the user can untick scopes on the consent screen. The caller reads
    # these rather than assuming the request succeeded in full.
    can_modify: bool = False
    can_read_drive: bool = False
    can_read_tasks: bool = False
    can_read_calendar: bool = False
    can_read_contacts: bool = False
    can_write_tasks: bool = False
    can_read_activity: bool = False
    can_write_drive: bool = False


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
                can_read_drive=_can_read_drive(t),
                can_read_tasks=_can_read_tasks(t),
                can_read_calendar=_can_read_calendar(t),
                can_read_contacts=_can_read_contacts(t),
                can_write_tasks=_can_write_tasks(t),
                can_read_activity=_can_read_activity(t),
                can_write_drive=_can_write_drive(t),
            ))
    return AccountsList(
        accounts=items,
        client_secret_present=CLIENT_SECRET_PATH.exists(),
    )


@router.post("/accounts/add", response_model=AddAccountResult)
async def add_account(access: str = "modify", services: str = "mail") -> AddAccountResult:
    """Run OAuth loopback flow for a new Google account. Long-running
    (≤5 min while user completes consent in browser).
    """
    # Unknown values fall back to the WIDER grant rather than erroring, because
    # the alternative is a typo silently producing a read-only account whose
    # controls then quietly do nothing — the failure mode this whole phase is
    # about. Google's consent screen is the real gate either way.
    requested_scope = READONLY_SCOPE if access.lower() == "readonly" else MODIFY_SCOPE

    # GW.2 — `services` widens the grant beyond mail. Mail is always included:
    # this service's other routes assume it, and an account here that cannot
    # read mail would be a row the inbox lists and cannot fill.
    #
    # An unrecognised name is IGNORED rather than fatal, deliberately: the
    # alternative is that a newer app build naming a service this (older)
    # microservice has not learned about fails the whole consent flow, instead
    # of granting what it can. The response reports what was actually granted,
    # so the caller finds out by reading, not by guessing.
    extra_scopes = []
    for name in (services or "").split(","):
        scope = SERVICE_SCOPES.get(name.strip().lower())
        if scope and scope not in extra_scopes:
            extra_scopes.append(scope)
    scope_str = " ".join([requested_scope] + extra_scopes)

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
                "scope": f"{scope_str} openid email profile",
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

    # GW.2 — report the grant Google actually made, read back off the blob we
    # just stored rather than off what we asked for. A user who unticks Drive on
    # the consent screen gets `can_read_drive: False` here, and the applet shows
    # a re-consent offer instead of a Drive tab that 403s on first click.
    return AddAccountResult(
        email=email,
        already_existed=already_existed,
        can_modify=_can_modify(token_blob),
        can_read_drive=_can_read_drive(token_blob),
        can_read_tasks=_can_read_tasks(token_blob),
        can_read_calendar=_can_read_calendar(token_blob),
        can_read_contacts=_can_read_contacts(token_blob),
        can_write_tasks=_can_write_tasks(token_blob),
        can_read_activity=_can_read_activity(token_blob),
        can_write_drive=_can_write_drive(token_blob),
    )


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


def _snippet(d: Dict[str, Any]) -> str:
    """Gmail's snippet, as plain text.

    Gmail returns snippets HTML-ESCAPED (`You&#39;re`, `&gt;`, `&amp;`), and
    every reader — the inbox rows, the mail verbs, the chat scope — showed the
    codes verbatim. Decoded once, here at the source, so no consumer has to
    know. Safe: it is text before and after, and nothing renders it as HTML.
    """
    return _unescape_html(d.get("snippet", "") or "")


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
            snippet=_snippet(d),
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
    only_account: Optional[str] = None,
) -> EmailsResult:
    """Fan out one query across every authorized account and merge the
    results newest-first.

    Errors are captured per account rather than raised, so one broken account
    (revoked refresh token, say) degrades that column instead of taking down
    the whole inbox — the same contract the unread fan-out has always had.
    """
    if only_account:
        # ONE mailbox, through the same paged fan-out. The per-account routes
        # below cannot page (no `page_tokens`), so the reader's single-account
        # view used them and could never get past page one — or skipped them
        # and showed every account. An unknown address 404s naming the real
        # ones (`_read_tokens`).
        _read_tokens(only_account)
        account_emails = [only_account]
    else:
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
        snippet=_snippet(d),
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
    account: str = "",
) -> EmailsResult:
    """Universal-inbox path: parallel-fetch unread emails from every
    authorized account, merged newest-first. `account` narrows it to one
    mailbox (1.11.0) — with paging, unlike /accounts/{email}/emails/unread.

    `page_tokens` is a JSON object of accountEmail → Gmail pageToken, echoed
    back from a previous response's `next_page_tokens`. Omit it for page one.
    """
    return await _fetch_all_accounts(
        DEFAULT_UNREAD_QUERY, max_per_account, _decode_page_tokens(page_tokens),
        account or None)


@router.get("/emails/search", response_model=EmailsResult)
async def search_emails_all_accounts(
    q: str = "",
    max_results: int = 25,
    page_tokens: str = "",
    account: str = "",
) -> EmailsResult:
    """Run a Gmail query across EVERY authorized account, merged newest-first.

    `max_results` is per account, not per call — the merged list can be
    (accounts × max_results) long. The name is the one the caller contract
    uses; its unread twin above calls the same thing `max_per_account`.

    Accounts that fail are reported in `errors` and the rest still return, so
    a search never comes back empty just because one token went stale.
    `account` narrows it to one mailbox, WITH paging (1.11.0).
    """
    return await _fetch_all_accounts(
        _normalize_query(q), max_results, _decode_page_tokens(page_tokens),
        account or None)


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
            snippet=_snippet(d),
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


# ══════════════════════════════════════════════════════════════════════════
# Phase GW — Drive and Tasks
# ══════════════════════════════════════════════════════════════════════════
#
# WHY THESE LIVE HERE rather than in a service of their own, or behind the
# `gws` CLI the Google Workspace applet used to shell out to:
#
#   1. ONE account list. The applet previously kept its own accounts in
#      UserDefaults while `gws` held a single global session, so "multi-account"
#      was three different answers depending on who you asked. Everything below
#      is keyed on the same `_account_dir(email)` the inbox already uses, so an
#      account is connected once and every Google surface sees it.
#   2. ONE token refresh. `_get_valid_access_token` already handles expiry,
#      rotation and revocation with the right error text. A second auth path
#      would have to reimplement all of it and drift.
#   3. No `Process()` from inside the sandboxed app. The old bridge spawned
#      /opt/homebrew/bin/gws directly, which is hostile to the sandbox and
#      invisible to the shell's own service management.
#
# READ ONLY, like the rest of this service. Both scopes are `.readonly` and
# there is deliberately no create/update/delete route in this section.

DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"
DRIVE_EXPORT_URL_FMT = "https://www.googleapis.com/drive/v3/files/{id}/export"
TASKS_LISTS_URL = "https://tasks.googleapis.com/tasks/v1/users/@me/lists"
TASKS_URL_FMT = "https://tasks.googleapis.com/tasks/v1/lists/{list_id}/tasks"

# The metadata we ask Drive for. Narrow on purpose: every field here is drawn
# in the list or the detail header, and `fields` is what keeps a 200-file page
# from being a megabyte of JSON we throw away.
DRIVE_FIELDS = (
    "nextPageToken,files(id,name,mimeType,modifiedTime,createdTime,size,"
    "webViewLink,iconLink,thumbnailLink,owners(displayName,emailAddress),"
    "shared,starred,trashed,parents)"
)

# The same field set, for a call that returns ONE file rather than a list.
#
# Derived from DRIVE_FIELDS instead of being typed out again: two copies drift,
# and the drift is silent — a field added to the listing but missing here would
# make a renamed file come back with, say, no `starred`, quietly losing the star
# in the row the UI then re-renders from this response.
DRIVE_FIELDS_SINGLE = DRIVE_FIELDS.split("files(", 1)[1].rstrip(")")

# Google Docs/Sheets/Slides have no bytes to download — they export. Anything
# not in here is a real file with a real size.
GOOGLE_NATIVE_EXPORTS = {
    "application/vnd.google-apps.document": "text/plain",
    "application/vnd.google-apps.spreadsheet": "text/csv",
    "application/vnd.google-apps.presentation": "text/plain",
}


class DriveFileOwner(BaseModel):
    displayName: str = Field(default="")
    emailAddress: str = Field(default="")


class DriveFile(BaseModel):
    id: str
    accountEmail: str
    name: str = Field(default="")
    mimeType: str = Field(default="")
    modifiedTime: str = Field(default="")
    createdTime: str = Field(default="")
    size: Optional[str] = None
    webViewLink: str = Field(default="")
    iconLink: str = Field(default="")
    thumbnailLink: str = Field(default="")
    owners: List[DriveFileOwner] = Field(default_factory=list)
    shared: bool = False
    starred: bool = False
    # True when the file is a Google-native doc, i.e. it exports rather than
    # downloads. The reader uses this to decide whether a text preview is even
    # possible before offering the control.
    isGoogleNative: bool = False


class DriveFilesResult(BaseModel):
    files: List[DriveFile] = Field(default_factory=list)
    accounts: List[str] = Field(default_factory=list)
    errors: Dict[str, str] = Field(default_factory=dict)
    next_page_tokens: Dict[str, str] = Field(default_factory=dict)


class TaskList(BaseModel):
    id: str
    accountEmail: str
    title: str = Field(default="")
    updated: str = Field(default="")


class TaskItem(BaseModel):
    id: str
    accountEmail: str
    listId: str = Field(default="")
    listTitle: str = Field(default="")
    title: str = Field(default="")
    notes: str = Field(default="")
    status: str = Field(default="needsAction")
    due: str = Field(default="")
    completed: str = Field(default="")
    updated: str = Field(default="")
    parent: str = Field(default="")
    position: str = Field(default="")


class TasksResult(BaseModel):
    tasks: List[TaskItem] = Field(default_factory=list)
    lists: List[TaskList] = Field(default_factory=list)
    accounts: List[str] = Field(default_factory=list)
    errors: Dict[str, str] = Field(default_factory=dict)


async def _token_for_service(email: str, scope: str, service: str) -> str:
    """Access token for `email`, but only if the grant actually covers `service`.

    The 403 carries a STRUCTURED detail rather than a sentence, because the
    caller has to tell "you never granted this" apart from "Google said no" in
    order to offer the right fix. The first is a re-consent button; the second
    is an error. A prose message would make the app parse English to find out.
    """
    tokens = _read_tokens(email)
    if scope not in _granted_scopes(tokens):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "scope_missing",
                "service": service,
                "email": email,
                "message": (
                    f"{email} was connected before {service} access existed. "
                    f"Reconnect the account to grant it."
                ),
            },
        )
    return await _get_valid_access_token(email)


def _drive_file_from(d: Dict[str, Any], email: str) -> DriveFile:
    mime = d.get("mimeType", "") or ""
    return DriveFile(
        id=d.get("id", ""),
        accountEmail=email,
        name=d.get("name", "") or "",
        mimeType=mime,
        modifiedTime=d.get("modifiedTime", "") or "",
        createdTime=d.get("createdTime", "") or "",
        size=d.get("size"),
        webViewLink=d.get("webViewLink", "") or "",
        iconLink=d.get("iconLink", "") or "",
        thumbnailLink=d.get("thumbnailLink", "") or "",
        owners=[
            DriveFileOwner(
                displayName=(o.get("displayName") or ""),
                emailAddress=(o.get("emailAddress") or ""),
            )
            for o in (d.get("owners") or [])
        ],
        shared=bool(d.get("shared", False)),
        starred=bool(d.get("starred", False)),
        isGoogleNative=mime in GOOGLE_NATIVE_EXPORTS,
    )


async def _drive_files_for(
    email: str, q: str, page_size: int, page_token: Optional[str]
) -> tuple[List[DriveFile], Optional[str]]:
    access_token = await _token_for_service(email, DRIVE_SCOPE, "drive")
    params: Dict[str, Any] = {
        "pageSize": max(1, min(page_size, 100)),
        "orderBy": "modifiedTime desc",
        "fields": DRIVE_FIELDS,
        # Shared drives too — a work account whose files all live in one would
        # otherwise show an empty Drive tab and look broken.
        "supportsAllDrives": "true",
        "includeItemsFromAllDrives": "true",
        # Trashed files are not "my files"; Gmail's equivalent is already
        # excluded from the inbox, so match that.
        "q": f"trashed = false and ({q})" if q else "trashed = false",
    }
    if page_token:
        params["pageToken"] = page_token

    async with httpx.AsyncClient() as client:
        r = await client.get(
            DRIVE_FILES_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            params=params,
            timeout=30,
        )
    if r.status_code != 200:
        raise HTTPException(
            status_code=r.status_code,
            detail=f"Drive list for {email} failed: {r.text[:300]}",
        )
    d = r.json()
    files = [_drive_file_from(f, email) for f in (d.get("files") or [])]
    return files, d.get("nextPageToken")


# ── Folders ──
#
# Drive already returned `parents` on every file; nothing read it, so the applet
# showed one flat newest-first feed of the user's entire Drive. Lawrence:
# *"Is there any folder structure here? Seems like everything is one big feed
# and its hard to see the organization."*
#
# Drive's hierarchy is not a filesystem — a file can have several parents, and a
# "shared with me" item often has none the user can see. So this serves a
# BROWSE view: the children of one folder, folders first, which is the question
# a person actually asks. It does not pretend to be a tree.


class DriveBreadcrumb(BaseModel):
    id: str
    name: str


class DriveFolderListing(BaseModel):
    folderId: str
    folderName: str
    accountEmail: str
    breadcrumbs: List[DriveBreadcrumb] = Field(default_factory=list)
    folders: List[DriveFile] = Field(default_factory=list)
    files: List[DriveFile] = Field(default_factory=list)
    errors: Dict[str, str] = Field(default_factory=dict)


async def _breadcrumbs(client, headers, folder_id: str) -> List[DriveBreadcrumb]:
    """Walk up via `parents` to build a path.

    Capped at 12 hops. Drive permits a file to have MULTIPLE parents, so the
    graph can contain a cycle; an uncapped walk would hang the request rather
    than fail it. First parent wins, which matches what Drive's own web UI shows.
    """
    trail: List[DriveBreadcrumb] = []
    current = folder_id
    seen = set()
    for _ in range(12):
        if not current or current in seen or current == "root":
            break
        seen.add(current)
        r = await client.get(
            f"{DRIVE_FILES_URL}/{current}",
            headers=headers,
            params={"fields": "id,name,parents", "supportsAllDrives": "true"},
        )
        if r.status_code != 200:
            break
        d = r.json()
        trail.append(DriveBreadcrumb(id=d.get("id", current), name=d.get("name", "")))
        parents = d.get("parents") or []
        current = parents[0] if parents else ""
    trail.reverse()
    return trail


@router.get("/accounts/{email}/drive/folder", response_model=DriveFolderListing)
async def browse_folder(email: str, folder_id: str = "root") -> DriveFolderListing:
    """The children of one folder: sub-folders first, then files."""
    access_token = await _token_for_service(email, DRIVE_SCOPE, "drive")
    headers = {"Authorization": f"Bearer {access_token}"}

    async with httpx.AsyncClient(timeout=45) as client:
        r = await client.get(
            DRIVE_FILES_URL,
            headers=headers,
            params={
                "q": f"'{folder_id}' in parents and trashed = false",
                "pageSize": 200,
                # Folders first, then newest-modified. Drive honours a
                # multi-key orderBy, so the UI does not have to re-sort.
                "orderBy": "folder,modifiedTime desc",
                "fields": DRIVE_FIELDS,
                "supportsAllDrives": "true",
                "includeItemsFromAllDrives": "true",
            },
        )
        if r.status_code != 200:
            raise HTTPException(
                status_code=r.status_code,
                detail=f"Drive folder listing for {email} failed: {r.text[:300]}")

        items = [_drive_file_from(f, email) for f in (r.json().get("files") or [])]
        crumbs = [] if folder_id == "root" else await _breadcrumbs(client, headers, folder_id)

        name = "My Drive"
        if folder_id != "root":
            name = crumbs[-1].name if crumbs else folder_id
            # The walk ends at the Drive root, whose own name Google returns
            # localised ("My Drive", "Mon Drive", …). Normalising it here means
            # the client never has to guess which crumb is the root.
            if crumbs:
                crumbs[0] = DriveBreadcrumb(id="root", name="My Drive")

    folder_mime = "application/vnd.google-apps.folder"
    return DriveFolderListing(
        folderId=folder_id,
        folderName=name,
        accountEmail=email,
        breadcrumbs=crumbs,
        folders=[f for f in items if f.mimeType == folder_mime],
        files=[f for f in items if f.mimeType != folder_mime],
    )


@router.get("/accounts/{email}/drive/files", response_model=DriveFilesResult)
async def drive_files_for_account(
    email: str,
    q: str = "",
    page_size: int = 50,
    page_token: str = "",
) -> DriveFilesResult:
    """Recent Drive files for ONE account, newest-modified first."""
    files, next_token = await _drive_files_for(email, q, page_size, page_token or None)
    return DriveFilesResult(
        files=files,
        accounts=[email],
        next_page_tokens={email: next_token} if next_token else {},
    )


@router.get("/drive/files", response_model=DriveFilesResult)
async def drive_files_all_accounts(
    q: str = "",
    page_size: int = 25,
    page_tokens: str = "",
) -> DriveFilesResult:
    """Drive across every connected account, merged newest-modified first.

    Mirrors `/emails` exactly, including the failure posture: one account
    erroring does NOT fail the request. Its reason lands in `errors[email]` and
    every other account still returns, because a work account whose admin
    disabled the API must not blank out a personal Drive.
    """
    emails = _authorized_account_emails()
    if not emails:
        return DriveFilesResult()

    tokens_in = _decode_page_tokens(page_tokens) if page_tokens else {}
    files: List[DriveFile] = []
    errors: Dict[str, str] = {}
    next_tokens: Dict[str, str] = {}

    async def _one(email: str) -> None:
        try:
            got, nxt = await _drive_files_for(
                email, q, page_size, tokens_in.get(email)
            )
        except HTTPException as e:
            errors[email] = (
                e.detail.get("message", str(e.detail))
                if isinstance(e.detail, dict)
                else str(e.detail)
            )
            return
        except Exception as e:  # noqa: BLE001
            errors[email] = str(e)
            return
        files.extend(got)
        if nxt:
            next_tokens[email] = nxt

    await asyncio.gather(*(_one(e) for e in emails))
    files.sort(key=lambda f: f.modifiedTime, reverse=True)
    return DriveFilesResult(
        files=files, accounts=emails, errors=errors, next_page_tokens=next_tokens
    )


async def _task_lists_for(email: str) -> List[TaskList]:
    access_token = await _token_for_service(email, TASKS_SCOPE, "tasks")
    async with httpx.AsyncClient() as client:
        r = await client.get(
            TASKS_LISTS_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            params={"maxResults": 100},
            timeout=20,
        )
    if r.status_code != 200:
        raise HTTPException(
            status_code=r.status_code,
            detail=f"Task lists for {email} failed: {r.text[:300]}",
        )
    return [
        TaskList(
            id=item.get("id", ""),
            accountEmail=email,
            title=item.get("title", "") or "",
            updated=item.get("updated", "") or "",
        )
        for item in (r.json().get("items") or [])
    ]


async def _tasks_in_list(
    email: str, tl: TaskList, show_completed: bool
) -> List[TaskItem]:
    access_token = await _token_for_service(email, TASKS_SCOPE, "tasks")
    params: Dict[str, Any] = {
        "maxResults": 100,
        "showCompleted": "true" if show_completed else "false",
        "showHidden": "false",
    }
    if show_completed:
        params["showHidden"] = "true"
    async with httpx.AsyncClient() as client:
        r = await client.get(
            TASKS_URL_FMT.format(list_id=tl.id),
            headers={"Authorization": f"Bearer {access_token}"},
            params=params,
            timeout=20,
        )
    if r.status_code != 200:
        raise HTTPException(
            status_code=r.status_code,
            detail=f"Tasks in {tl.title} for {email} failed: {r.text[:300]}",
        )
    return [
        TaskItem(
            id=item.get("id", ""),
            accountEmail=email,
            listId=tl.id,
            listTitle=tl.title,
            title=item.get("title", "") or "",
            notes=item.get("notes", "") or "",
            status=item.get("status", "needsAction") or "needsAction",
            due=item.get("due", "") or "",
            completed=item.get("completed", "") or "",
            updated=item.get("updated", "") or "",
            parent=item.get("parent", "") or "",
            position=item.get("position", "") or "",
        )
        for item in (r.json().get("items") or [])
    ]


@router.get("/accounts/{email}/tasks/lists", response_model=TasksResult)
async def task_lists_for_account(email: str) -> TasksResult:
    """The task LISTS for one account, without fetching their contents."""
    lists = await _task_lists_for(email)
    return TasksResult(lists=lists, accounts=[email])


@router.get("/tasks", response_model=TasksResult)
async def tasks_all_accounts(show_completed: bool = False) -> TasksResult:
    """Every task across every connected account, due-soonest first.

    Undated tasks sort LAST rather than first. A blank `due` string would sort
    before every real date, which would bury the overdue work this view exists
    to surface under the backlog.
    """
    emails = _authorized_account_emails()
    if not emails:
        return TasksResult()

    all_lists: List[TaskList] = []
    all_tasks: List[TaskItem] = []
    errors: Dict[str, str] = {}

    async def _one(email: str) -> None:
        try:
            lists = await _task_lists_for(email)
        except HTTPException as e:
            errors[email] = (
                e.detail.get("message", str(e.detail))
                if isinstance(e.detail, dict)
                else str(e.detail)
            )
            return
        except Exception as e:  # noqa: BLE001
            errors[email] = str(e)
            return

        all_lists.extend(lists)
        results = await asyncio.gather(
            *(_tasks_in_list(email, tl, show_completed) for tl in lists),
            return_exceptions=True,
        )
        for tl, res in zip(lists, results):
            if isinstance(res, BaseException):
                # One list failing must not lose the others for this account.
                errors[f"{email}/{tl.title}"] = str(res)
                continue
            all_tasks.extend(res)

    await asyncio.gather(*(_one(e) for e in emails))
    all_tasks.sort(key=lambda t: (t.due == "", t.due))
    return TasksResult(
        tasks=all_tasks, lists=all_lists, accounts=emails, errors=errors
    )


# ── Drive document TEXT — for a HUMAN to read ──
#
# This is the Drive equivalent of `/messages/{id}/body`, and it follows the same
# rule for the same reason. File CONTENT is authored by whoever shared the file,
# so it is attacker-controlled text on a path that feeds an assistant. The
# metadata routes above are safe to hand an agent; this one is not.
#
# So, exactly as with mail bodies:
#   * it lives under `/documents/` rather than `/drive/`, so it is visibly not a
#     sibling of the listing routes and no later wildcard picks it up by accident;
#   * it is NOT reachable from the applet's verbs — a person clicking a file in
#     the reader is the only caller;
#   * what comes back is rendered through the app's quarantined body view, which
#     strips scripts, blocks remote loads and intercepts links.
#
# Do not "just add this to the verb table". The whole point is that an agent
# summarising a folder cannot pull a prompt-injection payload out of a shared
# document without a human having opened it first.

class DriveDocumentText(BaseModel):
    id: str
    accountEmail: str
    name: str = Field(default="")
    mimeType: str = Field(default="")
    text: str = Field(default="")
    # True when the export was cut short by MAX_EXPORT_CHARS. The reader says so
    # rather than silently showing a document that stops mid-sentence.
    truncated: bool = False


# A Google Doc has no size limit that matters to us, and the reader is a preview
# pane, not a word processor. Past this we stop and say so.
MAX_EXPORT_CHARS = 200_000


@router.get("/accounts/{email}/documents/{file_id}/text",
            response_model=DriveDocumentText)
async def fetch_document_text(email: str, file_id: str) -> DriveDocumentText:
    """Plain text of ONE Google-native document, for a human to read.

    Only Docs/Sheets/Slides: a binary file has no text to export, and answering
    "" for a PDF would look like an empty document rather than the wrong
    question. The caller checks `isGoogleNative` on the listing first.
    """
    access_token = await _token_for_service(email, DRIVE_SCOPE, "drive")
    headers = {"Authorization": f"Bearer {access_token}"}

    async with httpx.AsyncClient() as client:
        meta = await client.get(
            f"{DRIVE_FILES_URL}/{file_id}",
            headers=headers,
            params={"fields": "id,name,mimeType", "supportsAllDrives": "true"},
            timeout=20,
        )
        if meta.status_code == 404:
            raise HTTPException(
                status_code=404, detail=f"No file {file_id} in {email}."
            )
        if meta.status_code != 200:
            raise HTTPException(
                status_code=meta.status_code,
                detail=f"Drive metadata for {file_id} failed: {meta.text[:300]}",
            )
        info = meta.json()
        mime = info.get("mimeType", "") or ""
        export_as = GOOGLE_NATIVE_EXPORTS.get(mime)
        if not export_as:
            raise HTTPException(
                status_code=415,
                detail=(
                    f"{info.get('name', file_id)} is {mime}, which has no text "
                    f"export. Open it in Drive."
                ),
            )

        exported = await client.get(
            DRIVE_EXPORT_URL_FMT.format(id=file_id),
            headers=headers,
            params={"mimeType": export_as},
            timeout=45,
        )
    if exported.status_code != 200:
        raise HTTPException(
            status_code=exported.status_code,
            detail=f"Drive export for {file_id} failed: {exported.text[:300]}",
        )

    text = exported.text
    truncated = len(text) > MAX_EXPORT_CHARS
    if truncated:
        text = text[:MAX_EXPORT_CHARS]

    return DriveDocumentText(
        id=file_id,
        accountEmail=email,
        name=info.get("name", "") or "",
        mimeType=mime,
        text=text,
        truncated=truncated,
    )


# ── Calendar and Contacts ──
#
# These two exist so that nothing NARROWS when the Google Workspace applet stops
# shelling out to the `gws` CLI. The CCAA personal-context model already ingests
# calendar events and contacts through `GoogleWorkspaceDataBridge.injectIntoCCAA`
# (called from every `PersonalContextModel.ingest()` pass), so removing the gws
# fetch without a replacement would have silently emptied a feed the assistant
# reads — the behaviour-removal trap this platform has a rule about.
#
# Read-only, metadata-shaped, and agent-safe: an event summary and a contact name
# are the kind of thing the old bridge already put in front of the model. Event
# DESCRIPTIONS are attacker-authored in exactly the way mail bodies are, so they
# are deliberately not returned here.

CALENDAR_LIST_URL = "https://www.googleapis.com/calendar/v3/users/me/calendarList"
CALENDAR_EVENTS_URL_FMT = (
    "https://www.googleapis.com/calendar/v3/calendars/{cal_id}/events"
)
PEOPLE_CONNECTIONS_URL = "https://people.googleapis.com/v1/people/me/connections"


class CalendarEvent(BaseModel):
    id: str
    accountEmail: str
    calendarId: str = Field(default="")
    calendarTitle: str = Field(default="")
    summary: str = Field(default="")
    location: str = Field(default="")
    start: str = Field(default="")
    end: str = Field(default="")
    allDay: bool = False
    attendees: List[str] = Field(default_factory=list)
    organizer: str = Field(default="")
    htmlLink: str = Field(default="")
    status: str = Field(default="")


class CalendarResult(BaseModel):
    events: List[CalendarEvent] = Field(default_factory=list)
    accounts: List[str] = Field(default_factory=list)
    errors: Dict[str, str] = Field(default_factory=dict)


class Contact(BaseModel):
    id: str
    accountEmail: str
    displayName: str = Field(default="")
    emails: List[str] = Field(default_factory=list)
    organization: str = Field(default="")


class ContactsResult(BaseModel):
    contacts: List[Contact] = Field(default_factory=list)
    accounts: List[str] = Field(default_factory=list)
    errors: Dict[str, str] = Field(default_factory=dict)


def _rfc3339_now_window(days: int) -> tuple[str, str]:
    """`timeMin`/`timeMax` for the next `days` days, UTC, RFC 3339.

    Built with `time.gmtime` rather than a local-time string because Google
    rejects a naive timestamp, and a timezone we guessed wrong would silently
    shift every event by hours.
    """
    now = time.time()
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    return (
        time.strftime(fmt, time.gmtime(now)),
        time.strftime(fmt, time.gmtime(now + max(1, days) * 86400)),
    )


async def _calendar_events_for(email: str, days: int, max_results: int) -> List[CalendarEvent]:
    access_token = await _token_for_service(email, CALENDAR_SCOPE, "calendar")
    headers = {"Authorization": f"Bearer {access_token}"}
    time_min, time_max = _rfc3339_now_window(days)

    async with httpx.AsyncClient() as client:
        cal_resp = await client.get(
            CALENDAR_LIST_URL, headers=headers,
            params={"maxResults": 50, "minAccessRole": "reader"}, timeout=20,
        )
        if cal_resp.status_code != 200:
            raise HTTPException(
                status_code=cal_resp.status_code,
                detail=f"Calendar list for {email} failed: {cal_resp.text[:300]}",
            )
        calendars = cal_resp.json().get("items") or []

        async def _events(cal: Dict[str, Any]) -> List[CalendarEvent]:
            cal_id = cal.get("id", "")
            if not cal_id:
                return []
            r = await client.get(
                CALENDAR_EVENTS_URL_FMT.format(cal_id=cal_id),
                headers=headers,
                params={
                    "timeMin": time_min,
                    "timeMax": time_max,
                    "maxResults": max_results,
                    "singleEvents": "true",
                    "orderBy": "startTime",
                },
                timeout=20,
            )
            if r.status_code != 200:
                return []
            out: List[CalendarEvent] = []
            for item in (r.json().get("items") or []):
                start_obj = item.get("start", {}) or {}
                end_obj = item.get("end", {}) or {}
                # An all-day event carries `date`; a timed one carries
                # `dateTime`. Collapsing them to one field loses the
                # distinction the UI needs to avoid printing "00:00".
                all_day = "date" in start_obj and "dateTime" not in start_obj
                out.append(CalendarEvent(
                    id=item.get("id", ""),
                    accountEmail=email,
                    calendarId=cal_id,
                    calendarTitle=cal.get("summary", "") or "",
                    summary=item.get("summary", "") or "",
                    location=item.get("location", "") or "",
                    start=start_obj.get("dateTime") or start_obj.get("date", "") or "",
                    end=end_obj.get("dateTime") or end_obj.get("date", "") or "",
                    allDay=all_day,
                    attendees=[
                        a.get("email", "")
                        for a in (item.get("attendees") or [])
                        if a.get("email")
                    ],
                    organizer=(item.get("organizer", {}) or {}).get("email", "") or "",
                    htmlLink=item.get("htmlLink", "") or "",
                    status=item.get("status", "") or "",
                ))
            return out

        results = await asyncio.gather(
            *(_events(c) for c in calendars), return_exceptions=True
        )

    events: List[CalendarEvent] = []
    for res in results:
        if isinstance(res, BaseException):
            # One calendar failing must not lose the others. A shared calendar
            # the user can no longer read is common and is not an error worth
            # taking the whole agenda down for.
            continue
        events.extend(res)
    events.sort(key=lambda e: e.start)
    return events


@router.get("/calendar/events", response_model=CalendarResult)
async def calendar_events_all_accounts(
    days: int = 7, max_results: int = 50
) -> CalendarResult:
    """Upcoming events across every connected account, soonest first."""
    emails = _authorized_account_emails()
    if not emails:
        return CalendarResult()

    events: List[CalendarEvent] = []
    errors: Dict[str, str] = {}

    async def _one(email: str) -> None:
        try:
            events.extend(await _calendar_events_for(email, days, max_results))
        except HTTPException as e:
            errors[email] = (
                e.detail.get("message", str(e.detail))
                if isinstance(e.detail, dict) else str(e.detail)
            )
        except Exception as e:  # noqa: BLE001
            errors[email] = str(e)

    await asyncio.gather(*(_one(e) for e in emails))
    events.sort(key=lambda e: e.start)
    return CalendarResult(events=events, accounts=emails, errors=errors)


@router.get("/contacts", response_model=ContactsResult)
async def contacts_all_accounts(page_size: int = 100) -> ContactsResult:
    """Connections across every account. Names, addresses and org only."""
    emails = _authorized_account_emails()
    if not emails:
        return ContactsResult()

    contacts: List[Contact] = []
    errors: Dict[str, str] = {}

    async def _one(email: str) -> None:
        try:
            access_token = await _token_for_service(email, CONTACTS_SCOPE, "contacts")
        except HTTPException as e:
            errors[email] = (
                e.detail.get("message", str(e.detail))
                if isinstance(e.detail, dict) else str(e.detail)
            )
            return
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(
                    PEOPLE_CONNECTIONS_URL,
                    headers={"Authorization": f"Bearer {access_token}"},
                    params={
                        "pageSize": max(1, min(page_size, 1000)),
                        "personFields": "names,emailAddresses,organizations",
                    },
                    timeout=30,
                )
        except Exception as e:  # noqa: BLE001
            errors[email] = str(e)
            return
        if r.status_code != 200:
            errors[email] = f"People API failed: {r.text[:200]}"
            return
        for person in (r.json().get("connections") or []):
            names = person.get("names") or []
            orgs = person.get("organizations") or []
            contacts.append(Contact(
                id=person.get("resourceName", ""),
                accountEmail=email,
                displayName=(names[0].get("displayName", "") if names else ""),
                emails=[
                    e.get("value", "")
                    for e in (person.get("emailAddresses") or [])
                    if e.get("value")
                ],
                organization=(orgs[0].get("name", "") if orgs else ""),
            ))

    await asyncio.gather(*(_one(e) for e in emails))
    contacts.sort(key=lambda c: c.displayName.lower())
    return ContactsResult(contacts=contacts, accounts=emails, errors=errors)


# ══════════════════════════════════════════════════════════════════════════
# Phase GW2 — file BYTES, Drive Activity, and Tasks writes
# ══════════════════════════════════════════════════════════════════════════

# ── File content, for the real previewers ──
#
# WHY BASE64 IN JSON RATHER THAN A PATH.
#
# This service runs inside mChatAIShell, which is UNSANDBOXED. mChatAI+ is
# SANDBOXED. A path this process writes is a path the app cannot open, so
# "return a file path" — the obvious design — silently fails for every user
# with a normal build. The bytes therefore travel in the response and the app
# writes them into its own container.
#
# The cost is ~33% inflation and holding the file in memory twice, which is why
# MAX_CONTENT_BYTES exists and is not large. This is a PREVIEW path, not a sync
# engine: something too big to preview should open in Drive instead, and says so.

# 200MB. Raised from 25MB, which refused a 99MB .wav that was perfectly
# previewable — and the refusal was the SERVER's, so a bigger client cache
# would not have helped.
#
# This number is only affordable because of `dest_path` below: when the caller
# names a destination, the bytes are STREAMED to disk in 1MB chunks and peak
# memory is a chunk, not the file. Over the base64 path a 200MB file would be
# ~267MB of JSON held several times over, which is why that path keeps its own
# much lower ceiling.
MAX_CONTENT_BYTES = 200 * 1024 * 1024

# What the BASE64 path will carry. Anything larger must supply `dest_path`.
# Inline transfer inflates by a third and is buffered end to end, so this stays
# where the old global limit was.
MAX_INLINE_BYTES = 25 * 1024 * 1024

# What a Google-native file becomes when it has to leave Google.
#
# Chosen so the app's EXISTING viewers light up without new code: the artifact
# preview registry already renders pdf (PDFKit), md/txt/csv (text + MarkdownUI)
# and images, keyed on file extension. So a Doc exports to markdown rather than
# plain text (headings and lists survive), a Sheet to CSV (which Ledger can also
# import verbatim), and Slides to PDF (the only export that keeps the layout).
NATIVE_EXPORT_FORMATS = {
    # PDF rather than markdown, and the difference matters: "browse my Drive"
    # means seeing the document as it LOOKS — tables, images, page breaks,
    # headers. Markdown is smaller and reads fine, but it silently drops every
    # image and mangles multi-column tables, which is a worse answer for a
    # viewer. The AI Write import is unaffected: it uses the separate
    # `/documents/{id}/text` route, which still asks for text/plain.
    "application/vnd.google-apps.document": ("application/pdf", "pdf"),
    # CSV, not PDF: a spreadsheet's value is its DATA, and `.csv` is what makes
    # DataTableViewerProvider draw a sortable grid and what Ledger imports.
    "application/vnd.google-apps.spreadsheet": ("text/csv", "csv"),
    "application/vnd.google-apps.presentation": ("application/pdf", "pdf"),
    "application/vnd.google-apps.drawing": ("image/png", "png"),
    "application/vnd.google-apps.form": ("application/pdf", "pdf"),
    "application/vnd.google-apps.script": ("application/json", "json"),
}

# Extension of last resort, by mime type.
#
# Needed because the viewers downstream resolve on FILE EXTENSION, and plenty of
# real Drive files have none in their name ("Scan 2026-03-14", "IMG_0421").
# Without this they land on disk extensionless, QuickLook cannot type them, and
# a perfectly renderable PDF or photo shows nothing — which is most of what
# "so many things do not render" turned out to be.
MIME_EXTENSION_FALLBACK = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif",
    "image/heic": "heic", "image/tiff": "tiff", "image/webp": "webp",
    "image/x-nikon-nef": "nef", "image/x-canon-cr2": "cr2",
    "image/x-canon-cr3": "cr3", "image/x-sony-arw": "arw",
    "image/x-adobe-dng": "dng", "image/x-olympus-orf": "orf",
    "image/x-fuji-raf": "raf", "image/x-panasonic-rw2": "rw2",
    "text/plain": "txt", "text/csv": "csv", "text/tab-separated-values": "tsv",
    "text/markdown": "md", "text/html": "html", "application/rtf": "rtf",
    "application/json": "json", "application/xml": "xml", "application/zip": "zip",
    "application/epub+zip": "epub",
    "application/msword": "doc",
    "application/vnd.ms-excel": "xls",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/vnd.apple.pages": "pages",
    "application/vnd.apple.numbers": "numbers",
    "application/vnd.apple.keynote": "key",
    "video/mp4": "mp4", "video/quicktime": "mov",
    "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/wav": "wav",
    "audio/flac": "flac",
}


def _extension_for(name: str, mime: str) -> str:
    """The extension the file should land on disk with.

    Name first (it is what the user sees and what Drive round-trips), then the
    mime map, then the mime subtype as a last guess — `image/avif` yields
    "avif", which is right more often than nothing.
    """
    if "." in name:
        candidate = name.rsplit(".", 1)[-1].strip().lower()
        # Guard against a name like "Q3 2026. Final" producing an extension of
        # " final", which would make every downstream matcher miss.
        if candidate and len(candidate) <= 8 and candidate.isalnum():
            return candidate
    if mime in MIME_EXTENSION_FALLBACK:
        return MIME_EXTENSION_FALLBACK[mime]
    subtype = mime.split("/")[-1].split("+")[0].strip().lower()
    return subtype if subtype.isalnum() and len(subtype) <= 8 else ""


class _TooLarge(Exception):
    """Raised mid-stream to abandon a download past the cap."""

    def __init__(self, written: int):
        super().__init__(written)
        self.written = written


def _quiet_remove(path: str) -> None:
    try:
        os.remove(path)
    except OSError:
        pass


class DriveFileContent(BaseModel):
    id: str
    accountEmail: str
    name: str
    mimeType: str           # the mime of the BYTES returned, not of the Drive file
    sourceMimeType: str     # what it is in Drive
    suggestedExtension: str
    sizeBytes: int
    base64: str
    # True when the file was too large. `base64` is empty and the caller shows
    # the Open-in-Drive path instead of a broken viewer.
    tooLarge: bool = False
    limitBytes: int = MAX_CONTENT_BYTES
    # GW7 — set when the bytes were streamed to `dest_path` instead of being
    # returned inline. `base64` is empty in that case; the caller reads the file.
    writtenToPath: bool = False
    path: str = ""


@router.get("/accounts/{email}/documents/{file_id}/content",
            response_model=DriveFileContent)
async def fetch_document_content(
    email: str, file_id: str, dest_path: str = ""
) -> DriveFileContent:
    """The BYTES of one Drive file, for a human to look at.

    Under `/documents/` with the text route, and for the same reason: this is
    file CONTENT, authored by whoever shared it, and it is not part of the
    agent-reachable metadata surface. No verb calls this.

    `dest_path` — WHY IT EXISTS. mChatAI+ is sandboxed and this service is not,
    so the obvious "return a path" design fails and the fallback was base64 in
    JSON. That works for a spreadsheet and falls apart for media: a 99MB .wav
    becomes ~132MB of JSON, buffered by Python, by the HTTP layer and again by
    the client. So the CALLER names a destination inside its own container —
    which this unsandboxed process can write to and the sandboxed app can read —
    and the bytes are streamed there in chunks. Peak memory is one chunk.

    The caller chooses the path, so nothing here has to know the app's layout.
    """
    access_token = await _token_for_service(email, DRIVE_SCOPE, "drive")
    headers = {"Authorization": f"Bearer {access_token}"}

    async with httpx.AsyncClient(timeout=90) as client:
        meta = await client.get(
            f"{DRIVE_FILES_URL}/{file_id}",
            headers=headers,
            params={"fields": "id,name,mimeType,size", "supportsAllDrives": "true"},
        )
        if meta.status_code == 404:
            raise HTTPException(status_code=404, detail=f"No file {file_id} in {email}.")
        if meta.status_code != 200:
            raise HTTPException(
                status_code=meta.status_code,
                detail=f"Drive metadata for {file_id} failed: {meta.text[:300]}")
        info = meta.json()
        source_mime = info.get("mimeType", "") or ""
        name = info.get("name", "") or file_id

        if source_mime == "application/vnd.google-apps.folder":
            raise HTTPException(status_code=415, detail=f"{name} is a folder.")

        export = NATIVE_EXPORT_FORMATS.get(source_mime)

        # A NON-native file reports its size up front, so refuse before
        # spending the download rather than after.
        if not export:
            declared = int(info.get("size") or 0)
            if declared > MAX_CONTENT_BYTES:
                return DriveFileContent(
                    id=file_id, accountEmail=email, name=name,
                    mimeType=source_mime, sourceMimeType=source_mime,
                    suggestedExtension=_extension_for(name, source_mime),
                    sizeBytes=declared, base64="", tooLarge=True)
            url, params = (f"{DRIVE_FILES_URL}/{file_id}",
                           {"alt": "media", "supportsAllDrives": "true"})
            out_mime, ext = source_mime, _extension_for(name, source_mime)
        else:
            out_mime, ext = export
            # A Google-native file has NO size field — it does not exist until
            # it is exported — so the cap can only be enforced after the fact.
            url, params = (DRIVE_EXPORT_URL_FMT.format(id=file_id),
                           {"mimeType": out_mime})

        # Streamed when the caller named a destination, buffered otherwise.
        if dest_path:
            written = 0
            tmp = f"{dest_path}.part"
            try:
                os.makedirs(os.path.dirname(dest_path) or ".", exist_ok=True)
                async with client.stream("GET", url, headers=headers,
                                         params=params) as resp:
                    if resp.status_code != 200:
                        body = (await resp.aread())[:300]
                        raise HTTPException(
                            status_code=resp.status_code,
                            detail=f"Drive content for {name} failed: {body!r}")
                    with open(tmp, "wb") as handle:
                        async for chunk in resp.aiter_bytes(1024 * 1024):
                            written += len(chunk)
                            if written > MAX_CONTENT_BYTES:
                                # Stop PULLING, not just stop writing: the point
                                # of the cap is to not spend the download.
                                raise _TooLarge(written)
                            handle.write(chunk)
                # Rename only after a complete write, so a cancelled download
                # can never leave a truncated file at the real path where the
                # cache would then serve it as complete.
                os.replace(tmp, dest_path)
            except _TooLarge as e:
                _quiet_remove(tmp)
                return DriveFileContent(
                    id=file_id, accountEmail=email, name=name,
                    mimeType=out_mime, sourceMimeType=source_mime,
                    suggestedExtension=ext, sizeBytes=e.written,
                    base64="", tooLarge=True)
            except HTTPException:
                _quiet_remove(tmp)
                raise
            except OSError as e:
                # Cannot write there — fall through to the inline path rather
                # than failing the preview outright.
                _quiet_remove(tmp)
                dest_path = ""
                if written == 0:
                    pass
                else:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Couldn't write {name} to {dest_path}: {e}")
            else:
                return DriveFileContent(
                    id=file_id, accountEmail=email, name=name,
                    mimeType=out_mime, sourceMimeType=source_mime,
                    suggestedExtension=ext, sizeBytes=written,
                    base64="", writtenToPath=True, path=dest_path)

        resp = await client.get(url, headers=headers, params=params)

    if resp.status_code != 200:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Drive content for {name} failed: {resp.text[:300]}")

    raw = resp.content
    # The INLINE ceiling, which is lower than the streamed one for the memory
    # reason in the docstring. The message says which limit was hit so the
    # caller can retry with a dest_path rather than guess.
    if len(raw) > MAX_INLINE_BYTES:
        return DriveFileContent(
            id=file_id, accountEmail=email, name=name,
            mimeType=out_mime, sourceMimeType=source_mime,
            suggestedExtension=ext, sizeBytes=len(raw), base64="", tooLarge=True,
            limitBytes=MAX_INLINE_BYTES)

    return DriveFileContent(
        id=file_id, accountEmail=email, name=name,
        mimeType=out_mime, sourceMimeType=source_mime,
        suggestedExtension=ext, sizeBytes=len(raw),
        base64=base64.b64encode(raw).decode("ascii"))


# ── Drive Activity ──
#
# The one thing this applet can say that no other surface can: what CHANGED,
# and who changed it. Metadata only — an actor, a verb, a target and a time.

DRIVE_ACTIVITY_URL = "https://driveactivity.googleapis.com/v2/activity:query"


class ActivityItem(BaseModel):
    id: str
    accountEmail: str
    timestamp: str = Field(default="")
    action: str = Field(default="")
    actor: str = Field(default="")
    targetName: str = Field(default="")
    targetId: str = Field(default="")
    targetMimeType: str = Field(default="")


class ActivityResult(BaseModel):
    activities: List[ActivityItem] = Field(default_factory=list)
    accounts: List[str] = Field(default_factory=list)
    errors: Dict[str, str] = Field(default_factory=dict)


def _activity_action(detail: Dict[str, Any]) -> str:
    """Google returns a one-key object naming the action. Take the key.

    Written as "first key wins" rather than a fixed list on purpose: the API
    adds action types, and an unknown one should surface under its own name
    rather than be dropped or labelled "unknown".
    """
    for key in (detail or {}):
        if key == "move":
            return "moved"
        if key == "rename":
            return "renamed"
        if key == "create":
            return "created"
        if key == "edit":
            return "edited"
        if key == "delete":
            return "deleted"
        if key == "restore":
            return "restored"
        if key == "permissionChange":
            return "shared"
        if key == "comment":
            return "commented"
        if key == "dlpChange":
            return "policy changed"
        if key == "reference":
            return "referenced"
        if key == "settingsChange":
            return "settings changed"
        return key
    return "changed"


@router.get("/drive/activity", response_model=ActivityResult)
async def drive_activity_all_accounts(page_size: int = 40) -> ActivityResult:
    """Recent Drive activity across every connected account, newest first."""
    emails = _authorized_account_emails()
    if not emails:
        return ActivityResult()

    items: List[ActivityItem] = []
    errors: Dict[str, str] = {}

    async def _one(email: str) -> None:
        try:
            access_token = await _token_for_service(
                email, DRIVE_ACTIVITY_SCOPE, "activity")
        except HTTPException as e:
            errors[email] = (e.detail.get("message", str(e.detail))
                             if isinstance(e.detail, dict) else str(e.detail))
            return
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.post(
                    DRIVE_ACTIVITY_URL,
                    headers={"Authorization": f"Bearer {access_token}"},
                    json={"pageSize": max(1, min(page_size, 100))})
        except Exception as e:  # noqa: BLE001
            errors[email] = str(e)
            return
        if r.status_code != 200:
            errors[email] = f"Drive Activity failed: {r.text[:200]}"
            return

        for n, act in enumerate(r.json().get("activities") or []):
            targets = act.get("targets") or []
            drive_item = (targets[0].get("driveItem") if targets else None) or {}
            actors = act.get("actors") or []
            who = ""
            if actors:
                known = (actors[0].get("user") or {}).get("knownUser") or {}
                who = "You" if known.get("isCurrentUser") else ""
            items.append(ActivityItem(
                id=f"{email}-{act.get('timestamp', '')}-{n}",
                accountEmail=email,
                timestamp=act.get("timestamp", "")
                    or (act.get("timeRange", {}) or {}).get("endTime", "") or "",
                action=_activity_action(act.get("primaryActionDetail") or {}),
                actor=who,
                targetName=drive_item.get("title", "") or "",
                targetId=(drive_item.get("name", "") or "").replace("items/", ""),
                targetMimeType=drive_item.get("mimeType", "") or ""))

    await asyncio.gather(*(_one(e) for e in emails))
    items.sort(key=lambda a: a.timestamp, reverse=True)
    return ActivityResult(activities=items, accounts=emails, errors=errors)


# ── Tasks: writes ──
#
# The only writes this service performs. Scoped to Google Tasks and nothing
# else, so the worst case is a wrong row in the user's own to-do list, which
# they can delete. Every route below re-checks the GRANT rather than trusting
# that the UI only drew the control for an account that has it — the control
# and the credential can disagree after a revoke.

class TaskWrite(BaseModel):
    title: str = Field(default="")
    notes: str = Field(default="")
    # RFC 3339. Google Tasks stores a DATE only and silently discards the time
    # component, which is worth knowing before wondering where 2pm went.
    due: str = Field(default="")


class TaskPatch(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    due: Optional[str] = None
    completed: Optional[bool] = None


async def _require_tasks_write(email: str) -> str:
    tokens = _read_tokens(email)
    if not _can_write_tasks(tokens):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "scope_missing",
                "service": "tasks-rw",
                "email": email,
                "message": (
                    f"{email} granted read-only access to Tasks. "
                    f"Reconnect the account to allow adding and editing tasks."
                ),
            })
    return await _get_valid_access_token(email)


@router.post("/accounts/{email}/tasks/lists/{list_id}/tasks", response_model=TaskItem)
async def create_task(email: str, list_id: str, req: TaskWrite) -> TaskItem:
    title = req.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="A task needs a title.")
    access_token = await _require_tasks_write(email)

    body: Dict[str, Any] = {"title": title}
    if req.notes.strip():
        body["notes"] = req.notes.strip()
    if req.due.strip():
        body["due"] = req.due.strip()

    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(
            TASKS_URL_FMT.format(list_id=list_id),
            headers={"Authorization": f"Bearer {access_token}"},
            json=body)
    if r.status_code not in (200, 201):
        raise HTTPException(status_code=r.status_code,
                            detail=f"Creating the task failed: {r.text[:300]}")
    d = r.json()
    # Return the CREATED row, read back from Google rather than echoed from the
    # request — rule 6. If Google normalised the due date or rejected a field,
    # the caller sees what actually exists, not what we asked for.
    return TaskItem(
        id=d.get("id", ""), accountEmail=email, listId=list_id, listTitle="",
        title=d.get("title", "") or "", notes=d.get("notes", "") or "",
        status=d.get("status", "needsAction") or "needsAction",
        due=d.get("due", "") or "", completed=d.get("completed", "") or "",
        updated=d.get("updated", "") or "", parent=d.get("parent", "") or "",
        position=d.get("position", "") or "")


@router.patch("/accounts/{email}/tasks/lists/{list_id}/tasks/{task_id}",
              response_model=TaskItem)
async def update_task(email: str, list_id: str, task_id: str,
                      req: TaskPatch) -> TaskItem:
    access_token = await _require_tasks_write(email)

    body: Dict[str, Any] = {}
    if req.title is not None:
        body["title"] = req.title
    if req.notes is not None:
        body["notes"] = req.notes
    if req.due is not None:
        # "" clears the due date; Google needs an explicit null for that.
        body["due"] = req.due or None
    if req.completed is not None:
        body["status"] = "completed" if req.completed else "needsAction"
        # Re-opening a task must also clear `completed`, or Google keeps the
        # old completion timestamp on a row that is no longer completed.
        if not req.completed:
            body["completed"] = None
    if not body:
        raise HTTPException(status_code=400, detail="Nothing to update.")

    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.patch(
            f"{TASKS_URL_FMT.format(list_id=list_id)}/{task_id}",
            headers={"Authorization": f"Bearer {access_token}"},
            json=body)
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code,
                            detail=f"Updating the task failed: {r.text[:300]}")
    d = r.json()
    return TaskItem(
        id=d.get("id", ""), accountEmail=email, listId=list_id, listTitle="",
        title=d.get("title", "") or "", notes=d.get("notes", "") or "",
        status=d.get("status", "needsAction") or "needsAction",
        due=d.get("due", "") or "", completed=d.get("completed", "") or "",
        updated=d.get("updated", "") or "", parent=d.get("parent", "") or "",
        position=d.get("position", "") or "")


@router.delete("/accounts/{email}/tasks/lists/{list_id}/tasks/{task_id}")
async def delete_task(email: str, list_id: str, task_id: str) -> Dict[str, Any]:
    """Delete one task.

    Google Tasks has no trash and no undelete, so this is PERMANENT on their
    side. The app's undo therefore re-CREATES the row from the copy it kept,
    which is why `update_task` and `create_task` both return the full row: an
    undo needs every field, not an id.
    """
    access_token = await _require_tasks_write(email)
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.delete(
            f"{TASKS_URL_FMT.format(list_id=list_id)}/{task_id}",
            headers={"Authorization": f"Bearer {access_token}"})
    if r.status_code not in (200, 204):
        raise HTTPException(status_code=r.status_code,
                            detail=f"Deleting the task failed: {r.text[:300]}")
    return {"success": True, "deleted": task_id}


# ── Drive: trash and untrash ──
#
# The ONLY routes in this service that modify a user's Drive, and the only ones
# that need `DRIVE_RW_SCOPE`. Read the scope's comment before adding a third.
#
# TRASH, NOT DELETE. Drive keeps trashed files for 30 days and the user can
# restore them from Drive's own UI even if this app never offers it again.
# `DELETE /files/{id}` is permanent and irreversible; there is deliberately no
# route here that calls it, and adding one would remove the property that makes
# offering this at all defensible.
#
# Each route re-checks the GRANT rather than trusting that the UI only drew the
# control for an account that has it — a token can be revoked between the draw
# and the click.

async def _require_drive_write(email: str) -> str:
    tokens = _read_tokens(email)
    if not _can_write_drive(tokens):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "scope_missing",
                "service": "drive-rw",
                "email": email,
                "message": (
                    f"{email} has read-only access to Drive. Enable editing for "
                    f"this account to move files to Trash."
                ),
            })
    return await _get_valid_access_token(email)


class TrashResult(BaseModel):
    id: str
    accountEmail: str
    name: str = Field(default="")
    trashed: bool = False


async def _set_trashed(email: str, file_id: str, trashed: bool) -> TrashResult:
    access_token = await _require_drive_write(email)
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.patch(
            f"{DRIVE_FILES_URL}/{file_id}",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"supportsAllDrives": "true", "fields": "id,name,trashed"},
            json={"trashed": trashed},
        )
    if r.status_code == 404:
        raise HTTPException(status_code=404, detail=f"No file {file_id} in {email}.")
    if r.status_code != 200:
        raise HTTPException(
            status_code=r.status_code,
            detail=f"Drive {'trash' if trashed else 'restore'} failed: {r.text[:300]}")
    d = r.json()
    # Read the flag BACK from Google rather than echoing what we asked for.
    # A shared file the user can read but not edit returns 200 with the old
    # value, and echoing the request would report a delete that never happened.
    return TrashResult(
        id=d.get("id", file_id), accountEmail=email,
        name=d.get("name", "") or "", trashed=bool(d.get("trashed", trashed)))


class RenameRequest(BaseModel):
    name: str = Field(default="")


@router.post("/accounts/{email}/drive/files/{file_id}/rename",
             response_model=DriveFile)
async def rename_drive_file(email: str, file_id: str,
                            req: RenameRequest) -> DriveFile:
    """Rename one Drive file.

    Same `DRIVE_RW_SCOPE` as trash — no new consent — because Google has no
    finer-grained write scope. An account that opted into editing can rename;
    one that did not gets the same structured `scope_missing` refusal.

    Drive names are NOT filenames: slashes, colons and emoji are all legal, and
    two files in one folder may share a name. So the only rules enforced here
    are Google's own — non-empty, and under the 32k character limit — rather
    than filesystem rules that would reject names Drive is happy with.
    """
    new_name = req.name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="A file needs a name.")
    if len(new_name) > 32767:
        raise HTTPException(status_code=400, detail="That name is too long for Drive.")

    access_token = await _require_drive_write(email)
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.patch(
            f"{DRIVE_FILES_URL}/{file_id}",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"supportsAllDrives": "true", "fields": DRIVE_FIELDS_SINGLE},
            json={"name": new_name},
        )
    if r.status_code == 404:
        raise HTTPException(status_code=404, detail=f"No file {file_id} in {email}.")
    if r.status_code != 200:
        raise HTTPException(
            status_code=r.status_code,
            detail=f"Renaming failed: {r.text[:300]}")

    d = r.json()
    # Read the name BACK rather than echoing the request: a file the user can
    # see but not edit returns 200 with the OLD name, and echoing would report
    # a rename that never happened (rule 6).
    if (d.get("name") or "") != new_name:
        raise HTTPException(
            status_code=403,
            detail=f"Google did not rename that file; you may not have "
                   f"permission to modify it.")
    return _drive_file_from(d, email)


@router.post("/accounts/{email}/drive/files/{file_id}/trash",
             response_model=TrashResult)
async def trash_drive_file(email: str, file_id: str) -> TrashResult:
    """Move one Drive file to Trash. Recoverable for 30 days."""
    result = await _set_trashed(email, file_id, True)
    if not result.trashed:
        # Rule 6 — never report success for work that did not happen.
        raise HTTPException(
            status_code=403,
            detail=f"Google did not trash {result.name or file_id}; "
                   f"you may not have permission to modify it.")
    return result


@router.post("/accounts/{email}/drive/files/{file_id}/untrash",
             response_model=TrashResult)
async def untrash_drive_file(email: str, file_id: str) -> TrashResult:
    """Restore one file from Trash — the undo behind the trash action."""
    result = await _set_trashed(email, file_id, False)
    if result.trashed:
        raise HTTPException(
            status_code=403,
            detail=f"Google did not restore {result.name or file_id}.")
    return result
