"""Gmail Manager — mChatAI microservice wrapping gws CLI (v0.22+)."""

import asyncio
import json
import os
import shutil
import subprocess
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


# ── Models ──

class EmailsOutput(BaseModel):
    emails: List[Dict[str, Any]]

class BatchOperationInput(BaseModel):
    query: str = Field(..., description="Gmail search query for matching emails")

class OperationOutput(BaseModel):
    success: bool
    message: str

class AuthStatus(BaseModel):
    gws_installed: bool
    authenticated: bool
    account: Optional[str] = None
    token_valid: bool = False
    services: List[str] = []
    error: Optional[str] = None

class AuthLoginInput(BaseModel):
    services: List[str] = Field(
        default=["gmail", "calendar", "drive", "tasks", "people", "sheets", "docs"],
        description="Google Workspace services to request scopes for",
    )
    readonly: bool = Field(default=True, description="Request read-only scopes when supported")


class SendEmailInput(BaseModel):
    """Body for POST /emails/send.

    `to`/`cc`/`bcc` are comma-separated address lists — that is `gws gmail
    +send`'s own contract, not ours. Pass bare addresses: a display-name form
    with a comma inside it (`"Doe, Jane" <jane@example.com>`) splits in the
    wrong place and mails a stranger.
    """
    to: str = Field(..., description="Recipient address(es), comma-separated")
    subject: str = Field(..., description="Subject line")
    body: str = Field(..., description="Message body (plain text)")
    cc: Optional[str] = Field(default=None, description="CC address(es), comma-separated")
    bcc: Optional[str] = Field(default=None, description="BCC address(es), comma-separated")
    # Optional send-as alias. The attribute is `from_address` because `from`
    # is a Python keyword; the JSON key stays `from` (and `populate_by_name`
    # keeps `from_address` working too) so neither spelling is silently
    # dropped by a caller that guessed the other one.
    from_address: Optional[str] = Field(
        default=None,
        alias="from",
        description="send-as alias to send from; omit to use the account default",
    )

    model_config = {"populate_by_name": True}


class ReplyEmailInput(BaseModel):
    """Body for POST /emails/reply.

    Only the message id and the new text are required — `gws gmail +reply`
    sets In-Reply-To / References / threadId and quotes the original itself,
    so we never hand-roll threading headers here.
    """
    message_id: str = Field(..., description="Gmail message ID being replied to")
    body: str = Field(..., description="Reply body (plain text)")
    cc: Optional[str] = Field(default=None, description="CC address(es), comma-separated")
    bcc: Optional[str] = Field(default=None, description="BCC address(es), comma-separated")
    from_address: Optional[str] = Field(
        default=None,
        alias="from",
        description="send-as alias to reply from; omit to use the account default",
    )

    model_config = {"populate_by_name": True}


class SendResult(BaseModel):
    """What a completed send or reply returns.

    `messageId` is Gmail's own id for the message that now exists in Sent —
    it is the *evidence* the send happened, not a status flag we set. That is
    why the send endpoints raise instead of returning this shape when gws
    gives us no id (VERB_AUTHORING.md rule 6: never report success for work
    that did not happen).

    No web URL is returned on purpose: a Gmail deep link needs the account
    (`?authuser=`) or the browser's profile index (`/u/N/`), and this service
    is single-account via gws and knows neither reliably. The caller that
    knows which mailbox it asked about builds the link.
    """
    messageId: str
    threadId: Optional[str] = None
    labelIds: List[str] = Field(default_factory=list)


# ── Helpers ──

def gws_path() -> Optional[str]:
    """Resolve the gws binary, returning an absolute path or None.

    Falls back to common install locations because GUI-app subprocesses inherit
    launchd's minimal PATH, which usually omits Homebrew dirs.
    """
    found = shutil.which("gws")
    if found:
        return found
    for candidate in ("/opt/homebrew/bin/gws", "/usr/local/bin/gws", "/usr/bin/gws"):
        if os.access(candidate, os.X_OK):
            return candidate
    return None


def run_gws_raw(args: List[str], timeout: int = 30) -> Tuple[int, str, str]:
    """Run a gws CLI command and return (returncode, stdout, stderr).

    Raises FileNotFoundError if gws is missing — callers decide how to surface that.

    `--format=json` is appended for commands that accept it. The `auth`
    subcommand family (status/login/logout/setup/export) does NOT accept it
    in gws v0.22+ — they return JSON natively, and adding the flag errors with
    "unexpected argument '--format' found".

    BLOCKING: callers from `async def` handlers MUST wrap this in
    `asyncio.to_thread(...)` so a long-running gws (like `auth login` which
    waits up to 5 min for browser consent) doesn't block FastAPI's event
    loop and starve every other endpoint.
    """
    binary = gws_path()
    if binary is None:
        raise FileNotFoundError("gws CLI not on PATH or in known install locations")
    cmd = [binary] + list(args)
    if not args or args[0] != "auth":
        cmd.append("--format=json")
    result = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=timeout)
    return result.returncode, result.stdout.strip(), result.stderr.strip()


async def run_gws_raw_async(args: List[str], timeout: int = 30) -> Tuple[int, str, str]:
    """Async wrapper. Use this from `async def` route handlers — `to_thread`
    dispatches the blocking subprocess call to a worker thread so other
    requests on the event loop keep flowing while gws runs.
    """
    return await asyncio.to_thread(run_gws_raw, args, timeout)


def run_gws(args: List[str], timeout: int = 30) -> Any:
    """Run a gws CLI command and return parsed JSON."""
    try:
        rc, stdout, stderr = run_gws_raw(args, timeout=timeout)
        if rc != 0:
            error = stderr or stdout
            raise HTTPException(status_code=500, detail=f"gws failed: {error[:300]}")
        if stdout:
            try:
                return json.loads(stdout)
            except json.JSONDecodeError:
                return [{"raw": line} for line in stdout.split("\n") if line]
        return []
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="gws CLI not installed. Install: brew install gws")


# ── Endpoints ──

async def _fetch_message_metadata(message_id: str) -> Dict[str, Any]:
    """Per-message follow-up call that returns Gmail's `snippet`, `labelIds`,
    `threadId`. The bulk `+triage` endpoint omits those fields, but the AI
    Inbox UX is unreadable without snippet previews and the triage logic
    needs labels to classify. Cheaper than fetching full bodies (METADATA
    format skips the MIME parts).
    """
    try:
        rc, stdout, _ = await run_gws_raw_async(
            [
                "gmail", "users", "messages", "get",
                "--params", json.dumps({
                    "userId": "me",
                    "id": message_id,
                    "format": "METADATA",
                    "metadataHeaders": ["Subject", "From", "Date"],
                }),
            ],
            timeout=15,
        )
        if rc != 0 or not stdout:
            return {}
        parsed = json.loads(stdout)
        return {
            "snippet": parsed.get("snippet", "") or "",
            "labelIds": parsed.get("labelIds", []) or [],
            "threadId": parsed.get("threadId", message_id),
            "internalDate": parsed.get("internalDate"),
        }
    except (json.JSONDecodeError, Exception):
        return {}


@router.get("/emails/unread", response_model=EmailsOutput)
async def fetch_unread(max_results: int = 15):
    """Fetch unread emails via `gws gmail +triage`, then parallel-fetch
    METADATA per message so each row has a snippet + labels for the UI.

    Total calls: 1 list + N metadata. asyncio.gather runs them concurrently
    so 15 messages take ~1 round trip's worth of wallclock, not 15.
    """
    data = run_gws(["gmail", "+triage", "--max", str(max_results)])

    if isinstance(data, list):
        emails = data
    elif isinstance(data, dict) and "messages" in data:
        emails = data["messages"]
    elif data:
        emails = [data]
    else:
        emails = []

    # Enrich each email with snippet + labelIds + threadId.
    ids = [e.get("id") for e in emails if isinstance(e, dict) and e.get("id")]
    if ids:
        metas = await asyncio.gather(*(_fetch_message_metadata(i) for i in ids))
        meta_by_id = dict(zip(ids, metas))
        for email in emails:
            if not isinstance(email, dict):
                continue
            extra = meta_by_id.get(email.get("id")) or {}
            for k, v in extra.items():
                # Don't clobber existing fields if +triage already set them
                # (it doesn't today, but cheap insurance for forward-compat).
                email.setdefault(k, v)

    return EmailsOutput(emails=emails)


@router.get("/emails/search", response_model=EmailsOutput)
async def search_emails(query: str = "is:unread", max_results: int = 15):
    """Search emails with a Gmail query."""
    data = run_gws(["gmail", "+triage", "--query", query, "--max", str(max_results)])
    if isinstance(data, list):
        return EmailsOutput(emails=data)
    if isinstance(data, dict) and "messages" in data:
        return EmailsOutput(emails=data["messages"])
    return EmailsOutput(emails=[data] if data else [])


@router.get("/emails/{message_id}")
async def read_email(message_id: str):
    """Read a specific email by message ID."""
    data = run_gws(["gmail", "+read", message_id])
    return data


# ── Send path ──
#
# Kept apart from the read endpoints above on purpose. Everything else in this
# service runs happily on a read-only Google scope; these two need a write
# scope and therefore a fresh consent (POST /auth/login with readonly=false).
# Someone reading this file should be able to see at a glance which half of it
# can change the user's mailbox.
#
# Declared after `GET /emails/{message_id}` and that is safe only because the
# methods differ — FastAPI would otherwise route `GET /emails/send` into the
# catch-all. Any *GET* added under /emails/ must go above that route.
#
# Deliberate omission: `gws gmail +send` and `+reply` both take a `--draft`
# flag and we do NOT expose it. In the verb surface `mail.draft` means "queue
# an AssistantProposal for a human to approve", not "put a draft in Gmail". A
# second endpoint called /emails/draft invites wiring the approval gate to the
# wrong one, and the failure mode there is mail leaving without anyone having
# approved it. If a real Gmail draft is ever wanted, give it a name that
# cannot be mistaken for the approval step.

# Deliberately more generous than the 30s default the read endpoints use. A
# send is the one call where a timeout is genuinely *ambiguous* — the message
# may or may not have left — so waiting longer is much cheaper than handing
# the user an "unknown" and making them go check Sent.
SEND_TIMEOUT_SECONDS = 60

# Markers that mean "the credential is the problem", so the error can name the
# fix instead of the symptom. Matched case-insensitively against gws's own
# error text; the 401/403 codes are checked numerically off the error envelope.
_REAUTH_MARKERS = (
    "insufficient",
    "scope",
    "permission",
    "forbidden",
    "unauthorized",
    "invalid_grant",
    "authentication failed",
    "autherror",
)

_REAUTH_HINT = (
    " — Gmail send needs a write scope and this service's /auth/login defaults to "
    "read-only. Re-run POST /auth/login with {\"readonly\": false} and complete the "
    "browser consent again."
)


def _flag(name: str, value: str) -> str:
    """Build a single `--name=value` argv token.

    Always the `=` form, never two separate tokens. gws's parser treats a
    value beginning with `-` as another flag, and none of this text is ours —
    an agent composes it from email it just read, which is attacker-reachable
    content. A body that starts with `--` has to stay a body.

    (There is no shell here — subprocess gets an argv list — so this guards
    flag injection, not shell injection.)
    """
    return f"--{name}={value}"


def _require_nonempty(raw: Optional[str], field: str, *, keep_whitespace: bool = False) -> str:
    """Reject blank required text with a 422 that says which field and why.

    A send with an empty subject or body is never what anyone meant; it means
    the message was assembled wrong upstream. Failing here is recoverable,
    whereas a blank email in someone's inbox is not.
    """
    text = raw or ""
    if not text.strip():
        raise HTTPException(
            status_code=422,
            detail=f"`{field}` must not be empty — refusing to send a message with no {field}.",
        )
    return text if keep_whitespace else text.strip()


def _clean_address_list(raw: Optional[str], field: str, *, required: bool) -> Optional[str]:
    """Normalise a comma-separated address list, or 422.

    Splitting on commas is gws's contract (see SendEmailInput). We only check
    for an `@` — full RFC 5322 validation here would reject addresses Gmail
    accepts, and Gmail is the authority anyway. The leading-`-` check is
    belt-and-braces against a future rewrite that stops using `_flag`.
    """
    if raw is None:
        if required:
            raise HTTPException(status_code=422, detail=f"`{field}` is required.")
        return None

    parts = [p.strip() for p in raw.split(",")]
    parts = [p for p in parts if p]
    if not parts:
        if required:
            raise HTTPException(status_code=422, detail=f"`{field}` is required.")
        return None

    bad = [p for p in parts if "@" not in p or p.startswith("-")]
    if bad:
        raise HTTPException(
            status_code=422,
            detail=f"`{field}` is not a usable address list: {bad}. Use bare, comma-separated addresses.",
        )
    return ",".join(parts)


def _gws_error_detail(stdout: str, stderr: str, rc: int) -> str:
    """Turn a failed gws invocation into a message that names the fix.

    gws prints a structured `{"error": {code, message, reason}}` envelope on
    stdout *and* a one-line human version on stderr, and it exits non-zero for
    both kinds of failure (observed on v0.22.5: rc 3 for a bad flag, rc 2 for
    an auth failure). Prefer the envelope — it carries the HTTP code — and
    fall back to stderr when stdout is not JSON.
    """
    code: Optional[int] = None
    message = ""
    reason = ""
    try:
        parsed = json.loads(stdout) if stdout else None
    except json.JSONDecodeError:
        parsed = None

    if isinstance(parsed, dict) and isinstance(parsed.get("error"), dict):
        err = parsed["error"]
        raw_code = err.get("code")
        code = raw_code if isinstance(raw_code, int) else None
        message = str(err.get("message") or "").strip()
        reason = str(err.get("reason") or "").strip()

    if message:
        detail = f"[{code or 'error'}/{reason or 'unknown'}] {message}"
    else:
        detail = (stderr or stdout or f"gws exited {rc} with no output").strip()
    detail = detail[:400]

    haystack = " ".join([message, reason, stderr]).lower()
    if code in (401, 403) or any(marker in haystack for marker in _REAUTH_MARKERS):
        detail += _REAUTH_HINT
    return detail


def _candidate_objects(payload: Any, depth: int = 0) -> List[Dict[str, Any]]:
    """Depth-limited walk yielding every dict that could carry the sent message."""
    if depth > 2 or payload is None:
        return []
    if isinstance(payload, dict):
        found = [payload]
        for key in ("message", "result", "data", "response", "body"):
            nested = payload.get(key)
            if nested is not None:
                found.extend(_candidate_objects(nested, depth + 1))
        return found
    if isinstance(payload, list):
        found: List[Dict[str, Any]] = []
        for item in payload[:3]:
            found.extend(_candidate_objects(item, depth + 1))
        return found
    return []


def _extract_sent_ids(payload: Any) -> Tuple[Optional[str], Optional[str], List[str]]:
    """Pull (messageId, threadId, labelIds) out of whatever gws printed.

    `users.messages.send` returns a bare Gmail Message resource — `{"id",
    "threadId", "labelIds"}` — and gws passes API responses straight through
    (auth_status above reads `emailAddress` right off getProfile the same way).
    We still peek one level into the wrapper keys gws uses elsewhere, because
    the machine this was written on has no send scope, so the *success* shape
    could not be observed live. Tolerating the plausible wrappers costs
    nothing; hard-coding one shape and silently finding no id would turn every
    successful send into a spurious failure — and a retried duplicate email.
    """
    for node in _candidate_objects(payload):
        raw_id = node.get("id") or node.get("messageId")
        if not isinstance(raw_id, str) or not raw_id.strip():
            continue
        thread = node.get("threadId") or node.get("thread_id")
        labels = node.get("labelIds")
        return (
            raw_id.strip(),
            thread.strip() if isinstance(thread, str) and thread.strip() else None,
            [label for label in labels if isinstance(label, str)] if isinstance(labels, list) else [],
        )
    return None, None, []


async def _run_send(args: List[str], action: str, *, failure_hint: str = "") -> SendResult:
    """Run one `gws gmail +<action>` and turn its output into a SendResult — or raise.

    There is deliberately no third outcome. This function never returns a
    success shape for a message that did not leave: if we cannot point at
    Gmail's own id for the sent message, we raise and let the caller decide.
    `run_gws` is not reused here because it treats any zero exit as success,
    which is exactly the check a send cannot skip.
    """
    try:
        rc, stdout, stderr = await run_gws_raw_async(args, timeout=SEND_TIMEOUT_SECONDS)
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="gws CLI not installed. Install: brew install gws")
    except subprocess.TimeoutExpired:
        # Not a failure — an unknown. gws may well have handed the message to
        # Gmail before we stopped waiting. Reporting "failed" here invites a
        # retry that sends the same email twice, which is worse than the wait.
        raise HTTPException(
            status_code=504,
            detail=(
                f"gws gmail +{action} did not finish within {SEND_TIMEOUT_SECONDS}s. "
                "The outcome is UNKNOWN — the message may already have been sent. "
                "Check the Sent folder before retrying."
            ),
        )

    if rc != 0:
        raise HTTPException(
            status_code=500,
            detail=f"gws gmail +{action} failed: {_gws_error_detail(stdout, stderr, rc)}{failure_hint}",
        )

    try:
        parsed: Any = json.loads(stdout) if stdout else None
    except json.JSONDecodeError:
        parsed = None

    # gws has exited non-zero for every failure we could provoke, but it still
    # prints the error envelope. Check it on a zero exit too: a future gws that
    # reports a soft failure this way would otherwise read as a clean send.
    if isinstance(parsed, dict) and isinstance(parsed.get("error"), dict):
        raise HTTPException(
            status_code=500,
            detail=f"gws gmail +{action} failed: {_gws_error_detail(stdout, stderr, rc)}{failure_hint}",
        )

    # The --dry-run envelope describes a request, not a result. We never pass
    # --dry-run, but a wrapper script or env default could; nothing was sent,
    # so it must not be allowed to look like a send.
    if isinstance(parsed, dict) and parsed.get("dry_run"):
        raise HTTPException(
            status_code=500,
            detail=f"gws gmail +{action} ran in dry-run mode — nothing was sent.",
        )

    message_id, thread_id, labels = _extract_sent_ids(parsed)
    if not message_id:
        raise HTTPException(
            status_code=500,
            detail=(
                f"gws gmail +{action} exited 0 but returned no message id, so the send "
                f"cannot be confirmed — treating it as NOT sent. gws said: "
                f"{(stdout or stderr or '<no output>')[:300]}"
            ),
        )
    return SendResult(messageId=message_id, threadId=thread_id, labelIds=labels)


@router.post("/emails/send", response_model=SendResult)
async def send_email(payload: SendEmailInput) -> SendResult:
    """Send a new email via `gws gmail +send`. There is no undo.

    **This endpoint does not and cannot enforce human approval.** A
    microservice sees an HTTP request, not who made it. The approval gate
    lives one layer up, in the Swift verb surface: `mail.send` refuses unless
    it is handed an approved AssistantProposal id, and `mail.draft` is what an
    agent is allowed to call. Keep it that way — if this endpoint ever becomes
    reachable without that gate, an agent that read an attacker's email can
    send mail as the user, which is the exact injection path the Assistant SDK
    architecture warns about.

    Returns Gmail's own message/thread ids on success; raises on anything else.
    """
    to = _clean_address_list(payload.to, "to", required=True) or ""
    subject = _require_nonempty(payload.subject, "subject")
    # keep_whitespace: a body's leading indentation is content, not noise. We
    # only assert it is not blank.
    body_text = _require_nonempty(payload.body, "body", keep_whitespace=True)
    cc = _clean_address_list(payload.cc, "cc", required=False)
    bcc = _clean_address_list(payload.bcc, "bcc", required=False)
    sender = (payload.from_address or "").strip() or None

    args: List[str] = [
        "gmail", "+send",
        _flag("to", to),
        _flag("subject", subject),
        _flag("body", body_text),
    ]
    if cc:
        args.append(_flag("cc", cc))
    if bcc:
        args.append(_flag("bcc", bcc))
    if sender:
        args.append(_flag("from", sender))

    return await _run_send(args, "send")


@router.post("/emails/reply", response_model=SendResult)
async def reply_email(payload: ReplyEmailInput) -> SendResult:
    """Reply to an existing message via `gws gmail +reply`. There is no undo.

    gws derives In-Reply-To / References / threadId from the message id and
    quotes the original, so the reply lands in the existing thread instead of
    starting a new one — which is why this is a separate endpoint rather than
    /emails/send with a subject prefixed "Re:".

    Same approval rules as /emails/send: the gate is in the verb layer, not here.
    """
    message_id = _require_nonempty(payload.message_id, "message_id")
    if any(ch.isspace() for ch in message_id):
        # Callers reach for the subject line or a mail.google.com URL when they
        # cannot find the id. Say so here rather than letting gws 404 on it.
        raise HTTPException(
            status_code=422,
            detail=(
                f"`message_id` contains whitespace: {message_id!r}. Pass Gmail's raw message id "
                "(GET /emails/search returns one per row), not a subject or a URL."
            ),
        )
    body_text = _require_nonempty(payload.body, "body", keep_whitespace=True)
    cc = _clean_address_list(payload.cc, "cc", required=False)
    bcc = _clean_address_list(payload.bcc, "bcc", required=False)
    sender = (payload.from_address or "").strip() or None

    args: List[str] = [
        "gmail", "+reply",
        _flag("message-id", message_id),
        _flag("body", body_text),
    ]
    if cc:
        args.append(_flag("cc", cc))
    if bcc:
        args.append(_flag("bcc", bcc))
    if sender:
        args.append(_flag("from", sender))

    # A wrong id is the most likely caller mistake here, and gws reports it as
    # a flat 404. Point at the lookup that produces a right one rather than
    # leaving the agent to guess (VERB_AUTHORING.md rule 5).
    return await _run_send(
        args,
        "reply",
        failure_hint=" — if the message id is the problem, find a current one with GET /emails/search?query=...",
    )


# ── Auth Endpoints ──

@router.get("/auth/status", response_model=AuthStatus)
async def auth_status():
    """Report gws install + Google Workspace auth state.

    Never raises 503 for missing gws — callers need this endpoint to drive
    setup UX, so install state is data, not an error.

    Maps gws v0.22's `auth status` JSON shape onto our AuthStatus model:
    `auth_method != "none"` AND `credential_source != "none"` => authenticated.
    `client_config_exists == false` => OAuth client not configured (a separate
    setup step user has to do via `gws auth setup` or by dropping a
    `client_secret.json` into ~/.config/gws/).
    """
    if gws_path() is None:
        return AuthStatus(gws_installed=False, authenticated=False, error="gws CLI not installed")

    try:
        rc, stdout, stderr = await run_gws_raw_async(["auth", "status"], timeout=15)
    except FileNotFoundError:
        return AuthStatus(gws_installed=False, authenticated=False, error="gws CLI not installed")
    except subprocess.TimeoutExpired:
        return AuthStatus(gws_installed=True, authenticated=False, error="gws auth status timed out")

    if rc != 0:
        msg = (stderr or stdout)[:300]
        return AuthStatus(gws_installed=True, authenticated=False, error=msg or None)

    if not stdout:
        return AuthStatus(gws_installed=True, authenticated=False)

    try:
        parsed = json.loads(stdout)
    except json.JSONDecodeError:
        return AuthStatus(gws_installed=True, authenticated=False, error="Could not parse gws auth status output")

    auth_method = str(parsed.get("auth_method", "none"))
    cred_source = str(parsed.get("credential_source", "none"))
    client_configured = bool(parsed.get("client_config_exists", False))
    authenticated = auth_method != "none" and cred_source != "none"
    account = parsed.get("account") or parsed.get("user_email")

    err: Optional[str] = None
    if not authenticated and not client_configured:
        # Pre-OAuth setup step the user can't skip on a vanilla gws install.
        err = (
            "OAuth client not configured. Run `gws auth setup` (needs gcloud) or "
            "save a client_secret.json to ~/.config/gws/."
        )

    # gws v0.22's `auth status` doesn't include the user's email — only the
    # storage backend state. To answer "which inbox am I connected to?" we
    # call `gmail.users.getProfile(userId=me)` which is the cheapest
    # authoritative source. Skipping when not authenticated avoids a wasted
    # call that would error with "no credentials".
    if authenticated and not account:
        try:
            rc2, out2, _ = await run_gws_raw_async(
                [
                    "gmail", "users", "getProfile",
                    "--params", json.dumps({"userId": "me"}),
                ],
                timeout=10,
            )
            if rc2 == 0 and out2:
                try:
                    profile = json.loads(out2)
                    account = profile.get("emailAddress") or account
                except json.JSONDecodeError:
                    pass
        except Exception:
            # account stays None — UI will fall back to "Connected" without
            # an email rather than fail the whole status call.
            pass

    return AuthStatus(
        gws_installed=True,
        authenticated=authenticated,
        account=account,
        token_valid=authenticated,
        services=[],
        error=err,
    )


@router.post("/auth/login", response_model=AuthStatus)
async def auth_login(body: Optional[AuthLoginInput] = None):
    """Run interactive `gws auth login`. Blocks until user completes browser consent.

    Critical mechanic: `gws auth login` does NOT auto-open a browser — it
    prints "Open this URL in your browser..." followed by the OAuth URL,
    then waits for the redirect callback. We have to actively pipe stdout,
    detect the URL, and shell out `open <url>` so the user's browser
    actually launches. Without that, the user stares at a spinner while gws
    waits forever for a callback that can never come.

    Uses asyncio subprocess so the FastAPI event loop stays responsive
    while the 5-minute consent flow runs.

    Long-running — Mac client should use a 5-minute timeout for this call.
    Returns the post-login auth status.
    """
    binary = gws_path()
    if binary is None:
        raise HTTPException(status_code=503, detail="gws CLI not installed. Install: brew install gws")

    payload = body or AuthLoginInput()
    args: List[str] = [binary, "auth", "login"]
    if payload.readonly:
        args.append("--readonly")
    if payload.services:
        args.extend(["--services", ",".join(payload.services)])

    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )

    output_buffer: List[str] = []
    url_opened = False

    async def reader_loop() -> None:
        nonlocal url_opened
        assert proc.stdout is not None
        while True:
            chunk = await proc.stdout.readline()
            if not chunk:
                break
            line = chunk.decode("utf-8", errors="replace").strip()
            if line:
                output_buffer.append(line)
            # gws prints the OAuth URL on its own line. Detect it and shell
            # out `open` so the user's default browser launches. Without
            # this the URL just sits in our captured output and the consent
            # flow can never complete.
            if not url_opened and line.startswith("https://accounts.google.com/o/oauth2/auth"):
                try:
                    await asyncio.create_subprocess_exec("/usr/bin/open", line)
                    url_opened = True
                except Exception:
                    # Fall back to leaving the URL in the response body so
                    # the Mac can open it client-side as a last resort.
                    pass

    try:
        # 300s == gws's effective timeout. If the user doesn't complete
        # consent in 5 min, gws gives up; we kill the subprocess too.
        await asyncio.wait_for(reader_loop(), timeout=300)
        rc = await proc.wait()
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise HTTPException(
            status_code=504,
            detail="Sign-in timed out after 5 minutes. If a browser tab didn't open, check your default-browser setting and try again.",
        )

    if rc != 0:
        # Show the last few lines of output — gws's own error message is
        # almost always more useful than just the exit code.
        tail = "\n".join(output_buffer[-12:])[-500:]
        raise HTTPException(status_code=500, detail=f"gws auth login failed (exit {rc}): {tail}")

    return await auth_status()


def _find_installer(name: str) -> Optional[str]:
    """Locate `npm`/`brew` even when the calling process inherited launchd's
    minimal PATH (the typical case for subprocesses spawned by a GUI macOS app
    like mChatAIShell). Falls back to common Homebrew + system locations.
    """
    found = shutil.which(name)
    if found:
        return found
    candidates = [
        f"/opt/homebrew/bin/{name}",      # Apple Silicon Homebrew
        f"/usr/local/bin/{name}",         # Intel Homebrew
        f"/opt/homebrew/sbin/{name}",
        f"/usr/local/sbin/{name}",
    ]
    for p in candidates:
        if os.access(p, os.X_OK):
            return p
    return None


def _augmented_path_env() -> Dict[str, str]:
    """Return a copy of os.environ with Homebrew bin dirs prepended to PATH.

    Required for `npm install -g` (and `brew install`) to find their own
    helper binaries (node, perl, etc.) when invoked from a launchd-spawned
    subprocess that has only `/usr/bin:/bin:/usr/sbin:/sbin` on PATH.
    """
    env = os.environ.copy()
    extras = ["/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin", "/usr/local/sbin"]
    current = env.get("PATH", "")
    parts = [p for p in extras if p not in current]
    if parts:
        env["PATH"] = ":".join(parts + ([current] if current else []))
    return env


@router.post("/install/gws", response_model=OperationOutput)
async def install_gws():
    """Install the gws CLI via npm (preferred) or Homebrew. Long-running (≤5 min).

    Returns success early if gws is already on PATH. Mirrors the gws-setup skill's
    run.sh ladder so AI Inbox + the existing setup skill stay in sync.
    """
    if gws_path() is not None:
        return OperationOutput(success=True, message="gws already installed")

    npm_bin = _find_installer("npm")
    brew_bin = _find_installer("brew")
    # Brew is preferred over npm here because the gws CLI is a self-contained
    # Rust binary on Brew, so it doesn't need `node` on PATH at install time.
    # When this microservice runs as a child of a launchd-spawned GUI app
    # (mChatAIShell), the inherited PATH usually doesn't include the user's
    # version-managed Node install (proto, nvm, fnm, asdf), so an `npm install
    # -g` would die with "env: node: No such file or directory" even though
    # `npm` itself is callable.
    if brew_bin is not None:
        cmd = [brew_bin, "install", "googleworkspace-cli"]
        method = "brew"
    elif npm_bin is not None:
        cmd = [npm_bin, "install", "-g", "@googleworkspace/cli"]
        method = "npm"
    else:
        raise HTTPException(
            status_code=412,
            detail="Neither Homebrew nor npm is available on this machine. Install Homebrew from https://brew.sh and try again.",
        )

    # to_thread keeps the FastAPI event loop responsive while npm/brew runs.
    # Without it, every other endpoint stalls behind the install for up to 5 min.
    try:
        result = await asyncio.to_thread(
            subprocess.run,
            cmd,
            capture_output=True,
            text=True,
            check=False,
            timeout=300,
            env=_augmented_path_env(),
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail=f"{method} install timed out after 5 minutes")

    if result.returncode != 0:
        tail = (result.stderr or result.stdout)[-500:]
        raise HTTPException(status_code=500, detail=f"{method} install failed: {tail}")

    if gws_path() is None:
        raise HTTPException(
            status_code=500,
            detail=f"{method} reported success but gws is not on PATH (try restarting mChatAIShell).",
        )

    return OperationOutput(success=True, message=f"Installed gws via {method}")


@router.post("/auth/logout", response_model=OperationOutput)
async def auth_logout():
    """Clear the local gws session."""
    if gws_path() is None:
        raise HTTPException(status_code=503, detail="gws CLI not installed")
    try:
        rc, _stdout, stderr = await run_gws_raw_async(["auth", "logout"], timeout=15)
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="gws CLI not installed")
    if rc != 0:
        return OperationOutput(success=False, message=(stderr or "gws auth logout failed")[:300])
    return OperationOutput(success=True, message="Signed out of Google Workspace")


@router.post("/emails/trash", response_model=OperationOutput)
async def trash_emails(body: BatchOperationInput):
    """Trash emails matching a query."""
    # Use the messages API to list then trash
    data = run_gws(["gmail", "users", "messages", "list", "--params", json.dumps({"userId": "me", "q": body.query, "maxResults": 10})])
    messages = data.get("messages", []) if isinstance(data, dict) else []
    trashed = 0
    for msg in messages[:10]:
        msg_id = msg.get("id", "")
        if msg_id:
            try:
                run_gws(["gmail", "users", "messages", "trash", "--params", json.dumps({"userId": "me", "id": msg_id})])
                trashed += 1
            except Exception:
                pass
    return OperationOutput(success=True, message=f"Trashed {trashed} of {len(messages)} matching emails")
