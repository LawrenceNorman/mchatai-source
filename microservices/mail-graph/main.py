"""Mail Graph — Outlook.com, Hotmail, Live and Microsoft 365 mail for AI Inbox.

The Microsoft half of the universal inbox (Phase MX.8). `inbox-multi` speaks
Gmail; this speaks Microsoft Graph. Its routes deliberately mirror
inbox-multi's (`/accounts`, `/emails/unread/all`, `/emails/search`,
`/accounts/{email}/threads/{id}`, `/accounts/{email}/messages/{id}/body`) so
the Mac side is two thin translators over one shape, not two clients.

What is different from Gmail, and why it shapes this file:

* NO CLIENT SECRET. To Microsoft a desktop app is a "public client": sign-in
  is the authorization-code flow with PKCE over a loopback redirect, and the
  client ID is a public identifier. That is why one app registration can ship
  for every user (`client.json`, beside this file) where Gmail makes each user
  bring their own OAuth client.
* REFRESH TOKENS ROTATE. Every refresh returns a new one, and it is written
  back before anything else uses the account.
* A MOVE CHANGES A MESSAGE'S ID. Archive and trash are folder moves in
  Outlook, and Graph's default ids are per folder. `Prefer: IdType=
  "ImmutableId"` would avoid that, but it breaks `webLink` (the "open in
  Outlook" URL) and is not documented for personal accounts. So this service
  keeps the default ids and remembers where it moved things — see `_MOVES`.
* THE QUERY GRAMMAR IS GMAIL'S. The app's saved searches and its "this week"
  chat scope are written as Gmail queries (`is:unread in:inbox`,
  `newer_than:7d`), and people type Gmail operators into the search box. This
  service accepts that grammar and translates it (`_plan`), so the Mac never
  needs to know which provider a query is going to. The translation lives
  here, in mchatai-source, so improving it needs no app rebuild.

Same safety posture as inbox-multi (docs/AI_INBOX_ARCHITECTURE.md §5). The
list, search and thread routes are METADATA ONLY: sender, recipients,
subject, date, and Outlook's own 255-character `bodyPreview` (the counterpart
of Gmail's snippet). Bodies come only from `/messages/{id}/body`, which feeds a
human reader behind a quarantined view and is reachable from no agent verb.
Nothing here can send mail: `Mail.Send` is never requested, and nothing here
can permanently delete — "trash" is a move to Deleted Items.
"""

import asyncio
import base64
import hashlib
import html
import json
import os
import re
import secrets
import shutil
import socket
import threading
import time
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, NamedTuple, Optional
from urllib.parse import parse_qs, quote, urlencode, urlparse

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


# ── Paths and configuration ──

SERVICE_DIR = Path(__file__).resolve().parent

# The app registration this service signs in with. It ships BESIDE THIS FILE so
# a new client ID reaches every install with the next mchatai-source refresh,
# with no app rebuild. A file at LOCAL_CLIENT_PATH wins over it: that is for a
# user who registers their own app, and for testing a registration before it
# ships.
BUNDLED_CLIENT_PATH = SERVICE_DIR / "client.json"
LOCAL_CLIENT_PATH = Path.home() / ".config" / "mchatai" / "mail-graph" / "client.json"

# One directory per mailbox — inbox-multi's layout, in a sibling directory so
# the two services can never read each other's tokens.
ACCOUNTS_DIR = Path.home() / ".config" / "mchatai" / "mail-graph-accounts"

GRAPH = "https://graph.microsoft.com/v1.0"
LOGIN_HOST_PREFIX = "https://login.microsoftonline.com/"
DEFAULT_AUTHORITY = LOGIN_HOST_PREFIX + "common"

# `offline_access` is what makes Microsoft issue a refresh token at all; an
# account added without it stops working an hour later. `User.Read` is what
# lets us ask who just signed in.
REQUIRED_SCOPES = ["offline_access", "User.Read"]
DEFAULT_SCOPES = REQUIRED_SCOPES + ["Mail.ReadWrite"]

# Compared against the granted scopes after stripping any resource prefix
# (`https://graph.microsoft.com/Mail.ReadWrite`) and lower-casing.
MODIFY_SCOPE = "mail.readwrite"

# Graph's documented per-mailbox concurrency limit for one app. Going over it
# earns 429s, so every call for one mailbox queues behind this.
MAILBOX_CONCURRENCY = 4

# Per-account ceiling for one call, matching inbox-multi.
MAX_RESULTS_PER_ACCOUNT = 50
MAX_QUERY_CHARS = 1024

# Metadata only. `bodyPreview` is Outlook's own 255-character preview — the
# same category as Gmail's snippet. `body` and `uniqueBody` are NEVER here.
SELECT_FIELDS = ",".join([
    "id", "conversationId", "subject", "from", "toRecipients", "ccRecipients",
    "receivedDateTime", "bodyPreview", "isRead", "flag", "hasAttachments",
    "parentFolderId", "inferenceClassification", "importance", "webLink",
    "categories",
])

# Well-known folder names Graph resolves per mailbox. Needed to label messages
# and to keep Deleted Items and Junk out of "all mail", as Gmail does.
WELL_KNOWN_FOLDERS = ("inbox", "archive", "deleteditems", "junkemail", "sentitems", "drafts")
HIDDEN_BY_DEFAULT = ("deleteditems", "junkemail")

# The oldest date Graph will accept, used as the leading `$filter` clause.
# Graph refuses `$orderby=receivedDateTime` unless `receivedDateTime` is also
# the FIRST property in `$filter` ("The restriction or sort order is too
# complex for this operation"), so every filtered list starts with a clause
# that excludes nothing.
EPOCH = datetime(1900, 1, 1, tzinfo=timezone.utc)


def _client_config() -> Dict[str, Any]:
    """The app registration to sign in with, or {} when none is configured.

    The authority must be Microsoft's login host. It is where the browser is
    sent and where the authorization code is redeemed, and a config file must
    not be able to point either anywhere else.
    """
    for source, path in (("local", LOCAL_CLIENT_PATH), ("bundled", BUNDLED_CLIENT_PATH)):
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text())
        except (OSError, ValueError):
            continue
        if not isinstance(data, dict):
            continue
        client_id = str(data.get("client_id") or "").strip()
        if not client_id:
            continue
        authority = str(data.get("authority") or DEFAULT_AUTHORITY).strip().rstrip("/")
        if not authority.startswith(LOGIN_HOST_PREFIX):
            authority = DEFAULT_AUTHORITY
        scopes = [s.strip() for s in (data.get("scopes") or DEFAULT_SCOPES)
                  if isinstance(s, str) and s.strip()]
        for required in reversed(REQUIRED_SCOPES):
            if required not in scopes:
                scopes.insert(0, required)
        return {"client_id": client_id, "authority": authority,
                "scopes": scopes, "source": source}
    return {}


def _require_client() -> Dict[str, Any]:
    """The registration, or a 412 that says exactly what to do.

    412 rather than 500 for the same reason inbox-multi uses it for a missing
    client_secret.json: the Mac turns it into "set this up first", not
    "something broke".
    """
    config = _client_config()
    if not config:
        raise HTTPException(
            status_code=412,
            detail=(
                "Microsoft sign-in is not set up yet: no app registration client ID. "
                "Register an app in the Azure portal (Microsoft Entra ID → App registrations), "
                f"then put its Application (client) ID in {BUNDLED_CLIENT_PATH} "
                f"or {LOCAL_CLIENT_PATH}."
            ),
        )
    return config


# ── Models ──

class AccountInfo(BaseModel):
    email: str
    display_name: str = ""
    expires_at: int = 0
    has_refresh_token: bool = False
    last_refreshed_at: Optional[int] = None
    can_modify: bool = False


class AccountsList(BaseModel):
    accounts: List[AccountInfo]
    client_configured: bool
    client_source: str = ""


class AddAccountResult(BaseModel):
    email: str
    already_existed: bool
    display_name: str = ""
    # What Microsoft actually granted. The consent screen can be declined in
    # part, so the caller reads this rather than assuming.
    can_modify: bool = False


class OutlookMessage(BaseModel):
    id: str
    threadId: str                    # Graph's conversationId
    accountEmail: str
    sender: str = ""                 # `"Name" <address>`, the shape the Mac parses
    to: str = ""
    cc: str = ""
    subject: str = ""
    receivedDateTime: str = ""       # ISO 8601, UTC — assigned by the server
    snippet: str = ""                # bodyPreview
    isRead: bool = False
    isFlagged: bool = False
    hasAttachments: bool = False
    # Outlook-native facts, PREFIXED so no Gmail label rule can mistake one of
    # them for its own: folder:inbox, inference:focused, importance:high,
    # category:<name>.
    labels: List[str] = Field(default_factory=list)
    # Outlook on the web's URL for this message, from Graph itself.
    webLink: str = ""


class EmailsResult(BaseModel):
    emails: List[OutlookMessage]
    accounts: List[str]
    errors: Dict[str, str] = Field(default_factory=dict)
    # Where to resume, PER ACCOUNT — inbox-multi's MX.10 contract. The value is
    # Graph's own @odata.nextLink. An account that runs out drops out of the
    # map, and an empty map means there is nothing older anywhere.
    next_page_tokens: Dict[str, str] = Field(default_factory=dict)


class MailAttachment(BaseModel):
    """One attachment, by reference. The bytes are never inlined."""
    attachmentId: Optional[str] = None
    filename: str = ""
    mimeType: str = ""
    size: int = 0
    contentId: Optional[str] = None
    isInline: bool = False


class MailBody(BaseModel):
    id: str
    threadId: str
    accountEmail: str
    text: str = ""
    html: str = ""
    attachments: List[MailAttachment] = Field(default_factory=list)
    to: str = ""
    cc: str = ""
    reply_to: str = ""
    truncated: bool = False


class IdsRequest(BaseModel):
    message_ids: List[str]


class ReadRequest(IdsRequest):
    read: bool = True


class FlagRequest(IdsRequest):
    flagged: bool = True


class MoveRequest(IdsRequest):
    # "archive" or "trash". Semantic names, not Outlook folder names: the Mac
    # says what the user asked for and this service decides what that means
    # in Outlook.
    destination: str


class ModifyResult(BaseModel):
    modified: List[str]
    failed: Dict[str, str] = Field(default_factory=dict)
    # The id we were given → the id the message has now, for every message
    # whose id a move changed.
    moved: Dict[str, str] = Field(default_factory=dict)


# ── Token storage ──

def _account_dir(email: str) -> Path:
    """Storage for one mailbox. Keyed on the LOWER-CASED address: Microsoft
    can report `LawrenceNorman@hotmail.com` on one sign-in and the lower-case
    form on the next, and those must not become two accounts."""
    if "/" in email or ".." in email or not email.strip():
        raise HTTPException(status_code=400, detail=f"Invalid account email: {email!r}")
    return ACCOUNTS_DIR / email.strip().lower()


def _authorized_account_emails() -> List[str]:
    if not ACCOUNTS_DIR.exists():
        return []
    return sorted(
        d.name for d in ACCOUNTS_DIR.iterdir()
        if d.is_dir() and (d / "token.json").exists()
    )


def _read_tokens(email: str) -> Dict[str, Any]:
    token_file = _account_dir(email) / "token.json"
    if not token_file.exists():
        # A lookup miss names the accounts that DO exist, so a caller holding a
        # typo can correct itself instead of reporting "no mail".
        known = _authorized_account_emails()
        hint = (f" Authorized Microsoft accounts: {', '.join(known)}."
                if known else " No Microsoft accounts are authorized yet.")
        raise HTTPException(status_code=404, detail=f"Account {email} is not authorized.{hint}")
    return json.loads(token_file.read_text())


def _write_tokens(email: str, tokens: Dict[str, Any]) -> None:
    """Atomic, mode 0600: write a sibling file and rename it, so a crash
    mid-write cannot leave a half-written token that bricks the account."""
    d = _account_dir(email)
    d.mkdir(parents=True, exist_ok=True)
    target = d / "token.json"
    tmp = d / "token.json.tmp"
    tmp.write_text(json.dumps(tokens, indent=2))
    os.chmod(tmp, 0o600)
    tmp.replace(target)


def _granted(tokens: Dict[str, Any]) -> set:
    return {s.rsplit("/", 1)[-1].lower() for s in (tokens.get("scope") or "").split() if s}


def _can_modify(tokens: Dict[str, Any]) -> bool:
    return MODIFY_SCOPE in _granted(tokens)


_REFRESH_LOCKS: Dict[str, asyncio.Lock] = {}


async def _get_valid_access_token(email: str) -> str:
    """A live access token for `email`, refreshing when it is within a minute
    of expiry.

    Serialized per account. Microsoft rotates the refresh token on every use,
    and two concurrent refreshes would each write back a different one.
    """
    lock = _REFRESH_LOCKS.setdefault(email.lower(), asyncio.Lock())
    async with lock:
        tokens = _read_tokens(email)
        now = int(time.time())
        if tokens.get("access_token") and tokens.get("expires_at", 0) - 60 > now:
            return tokens["access_token"]

        refresh_token = tokens.get("refresh_token")
        if not refresh_token:
            raise HTTPException(
                status_code=401,
                detail=f"{email} has no refresh token. Remove it in AI Inbox → Accounts and add it again.",
            )
        # A token belongs to the registration that issued it, and refreshing it
        # under any other client ID fails. So an account keeps the client ID it
        # was added with, and a later change to client.json cannot strand it.
        client_id = tokens.get("client_id") or _require_client()["client_id"]
        authority = tokens.get("authority") or DEFAULT_AUTHORITY
        scopes = tokens.get("requested_scopes") or DEFAULT_SCOPES
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{authority}/oauth2/v2.0/token",
                data={
                    "client_id": client_id,
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                    "scope": " ".join(scopes),
                },
            )
        if resp.status_code != 200:
            # invalid_grant here nearly always means the user revoked the app
            # on account.microsoft.com, or the token aged out unused.
            raise HTTPException(
                status_code=401,
                detail=f"Token refresh for {email} failed (HTTP {resp.status_code}): {resp.text[:300]}",
            )
        new = resp.json()
        tokens["access_token"] = new["access_token"]
        tokens["expires_at"] = now + int(new.get("expires_in", 3600))
        tokens["last_refreshed_at"] = now
        if new.get("refresh_token"):
            tokens["refresh_token"] = new["refresh_token"]
        if new.get("scope"):
            tokens["scope"] = new["scope"]
        _write_tokens(email, tokens)
        return tokens["access_token"]


# ── Graph calls ──

_SEMAPHORES: Dict[str, asyncio.Semaphore] = {}


def _mailbox_slot(email: str) -> asyncio.Semaphore:
    return _SEMAPHORES.setdefault(email.lower(), asyncio.Semaphore(MAILBOX_CONCURRENCY))


async def _graph(
    client: httpx.AsyncClient,
    email: str,
    method: str,
    url: str,
    *,
    params: Optional[Dict[str, str]] = None,
    json_body: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
    timeout: float = 20.0,
) -> httpx.Response:
    """One Graph request for one mailbox: a live token, a slot under the
    per-mailbox concurrency cap, and one polite retry when Graph says to back
    off. It returns the response rather than raising, so each caller can say
    what IT was doing when a request failed."""
    token = await _get_valid_access_token(email)
    merged = {"Authorization": f"Bearer {token}"}
    if headers:
        merged.update(headers)
    response: Optional[httpx.Response] = None
    async with _mailbox_slot(email):
        for attempt in range(2):
            response = await client.request(
                method, url, params=params, json=json_body, headers=merged, timeout=timeout)
            if response.status_code in (429, 503) and attempt == 0:
                try:
                    wait = float(response.headers.get("Retry-After", "2"))
                except ValueError:
                    wait = 2.0
                await asyncio.sleep(max(0.5, min(wait, 10.0)))
                continue
            break
    assert response is not None
    return response


def _graph_error(response: httpx.Response, what: str) -> HTTPException:
    """A failed Graph response as an HTTPException naming the operation and
    Graph's own error code, which is the part a person can act on."""
    detail = response.text[:300]
    try:
        err = (response.json() or {}).get("error") or {}
        if err.get("message"):
            detail = f"{err.get('code', '')}: {err['message']}"[:300]
    except ValueError:
        pass
    status = response.status_code if 400 <= response.status_code < 600 else 502
    return HTTPException(status_code=status, detail=f"{what} failed (HTTP {response.status_code}): {detail}")


def _message_url(message_id: str) -> str:
    return f"{GRAPH}/me/messages/{quote(message_id, safe='')}"


def _odata_str(value: str) -> str:
    """A string literal for `$filter`: single quotes are doubled, per OData."""
    return value.replace("'", "''")


def _iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


_FOLDERS: Dict[str, Dict[str, str]] = {}


async def _folder_names(client: httpx.AsyncClient, email: str) -> Dict[str, str]:
    """folder id → well-known name, for one mailbox. Cached for the life of
    the process: a mailbox's system folders do not change ids.

    A folder the mailbox lacks (not every account has Archive) is simply
    absent. The map is only cached once Inbox resolved, so a failed first
    lookup is retried rather than remembered.
    """
    key = email.lower()
    if key in _FOLDERS:
        return _FOLDERS[key]

    async def one(name: str):
        r = await _graph(client, email, "GET", f"{GRAPH}/me/mailFolders/{name}",
                         params={"$select": "id"})
        if r.status_code == 200:
            return (r.json() or {}).get("id"), name
        return None, name

    pairs = await asyncio.gather(*(one(n) for n in WELL_KNOWN_FOLDERS))
    mapping = {fid: name for fid, name in pairs if fid}
    if "inbox" in mapping.values():
        _FOLDERS[key] = mapping
    return mapping


# ── Message shaping ──

def _format_address(entry: Optional[Dict[str, Any]]) -> str:
    """`{"emailAddress": {"name", "address"}}` → `"Name" <address>`.

    Always quoted when there is a name, because display names carry commas
    ("Norman, Lawrence") and the Mac splits recipient lists on unquoted ones.
    """
    ea = (entry or {}).get("emailAddress") or {}
    address = (ea.get("address") or "").strip()
    name = (ea.get("name") or "").strip().replace('"', "'")
    if not address:
        return name
    if not name or name.lower() == address.lower():
        return address
    return f'"{name}" <{address}>'


def _format_list(entries: Optional[List[Dict[str, Any]]]) -> str:
    return ", ".join(s for s in (_format_address(e) for e in (entries or [])) if s)


def _message(d: Dict[str, Any], email: str, folders: Dict[str, str]) -> OutlookMessage:
    labels: List[str] = []
    folder = folders.get(d.get("parentFolderId") or "")
    if folder:
        labels.append(f"folder:{folder}")
    if d.get("inferenceClassification"):
        labels.append(f"inference:{d['inferenceClassification']}")
    if (d.get("importance") or "").lower() == "high":
        labels.append("importance:high")
    labels.extend(f"category:{c}" for c in (d.get("categories") or []) if c)
    return OutlookMessage(
        id=d["id"],
        threadId=d.get("conversationId") or d["id"],
        accountEmail=email,
        sender=_format_address(d.get("from")),
        to=_format_list(d.get("toRecipients")),
        cc=_format_list(d.get("ccRecipients")),
        subject=d.get("subject") or "",
        receivedDateTime=d.get("receivedDateTime") or "",
        snippet=d.get("bodyPreview") or "",
        isRead=bool(d.get("isRead")),
        isFlagged=((d.get("flag") or {}).get("flagStatus") == "flagged"),
        hasAttachments=bool(d.get("hasAttachments")),
        labels=labels,
        webLink=d.get("webLink") or "",
    )


def _newest_first(messages: List[OutlookMessage]) -> List[OutlookMessage]:
    # ISO 8601 in UTC sorts correctly as a string; a missing date sorts last.
    return sorted(messages, key=lambda m: m.receivedDateTime or "", reverse=True)


# ── Query translation (Gmail grammar → Graph) ──
#
# What is honoured, and how:
#
#   is:unread / is:read            isRead
#   is:starred / is:flagged        flag/flagStatus (Outlook's "flag" is its star)
#   is:important                   importance eq 'high'
#   has:attachment                 hasAttachments
#   in:/label: inbox sent drafts   that folder; `in:anywhere` searches every
#     trash spam archive anywhere  folder INCLUDING Deleted Items and Junk,
#                                  which are otherwise left out, as in Gmail
#   newer_than: / older_than:      receivedDateTime (d, h, m = 30 days, y)
#   after: / before:               receivedDateTime (YYYY/MM/DD)
#   category:primary               Focused  (Outlook's own split of the inbox)
#   category:promotions|social|    Other. So `-category:promotions` means
#     updates|forums               Focused — the closest honest analogue of
#                                  "leave out Gmail's bulk tabs".
#   from:<full address>            exact sender filter
#   from: to: cc: bcc: subject:    Graph's KQL search on that property
#   anything else, and -negations  KQL search terms (`-x` becomes `NOT x`)
#
# Filters and KQL search cannot be combined freely in one Graph request, so a
# query with any search terms runs as $search and applies the filters to each
# page locally (`_matches`). An unknown folder name is ignored rather than
# refused: it widens the search instead of failing it.

_TOKEN = re.compile(r'(-?)(?:([A-Za-z_]+):)?("[^"]*"|\S+)')

FOLDER_ALIASES = {
    "inbox": "inbox",
    "sent": "sentitems", "sentitems": "sentitems",
    "drafts": "drafts", "draft": "drafts",
    "trash": "deleteditems", "bin": "deleteditems", "deleted": "deleteditems",
    "spam": "junkemail", "junk": "junkemail",
    "archive": "archive", "archived": "archive",
}
BULK_CATEGORIES = {"promotions", "social", "updates", "forums"}
KQL_PROPERTIES = {"from", "to", "cc", "bcc", "subject"}


def _duration(value: str) -> Optional[timedelta]:
    m = re.fullmatch(r"(\d+)([dhmy])", value.strip().lower())
    if not m:
        return None
    n, unit = int(m.group(1)), m.group(2)
    return {"h": timedelta(hours=n), "d": timedelta(days=n),
            "m": timedelta(days=30 * n), "y": timedelta(days=365 * n)}[unit]


def _day(value: str) -> Optional[datetime]:
    for fmt in ("%Y/%m/%d", "%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(value.strip(), fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _plan(q: Optional[str], now: Optional[datetime] = None) -> Dict[str, Any]:
    """Translate a Gmail-grammar query into what Graph needs.

    `q=None` is the default inbox view — inbox-multi's `is:unread in:inbox`.
    """
    plan: Dict[str, Any] = {
        "folder": None, "anywhere": False, "unread": None, "flagged": None,
        "attachments": None, "focused": None, "important": None,
        "since": None, "before": None, "from": None, "kql": [],
    }
    if q is None:
        plan["folder"] = "inbox"
        plan["unread"] = True
        return plan

    now = now or datetime.now(timezone.utc)
    for neg, op, raw in _TOKEN.findall(q):
        negated = neg == "-"
        op_l = op.lower()
        value = raw.strip('"').strip()
        v_l = value.lower()
        if not value:
            continue

        if op_l == "is":
            if v_l == "unread":
                plan["unread"] = not negated
            elif v_l == "read":
                plan["unread"] = negated
            elif v_l in ("starred", "flagged"):
                plan["flagged"] = not negated
            elif v_l == "important":
                plan["important"] = not negated
            continue
        if op_l == "has":
            if v_l in ("attachment", "attachments"):
                plan["attachments"] = not negated
            continue
        if op_l in ("in", "label"):
            if negated:
                continue
            if v_l in ("anywhere", "all"):
                plan["folder"], plan["anywhere"] = None, True
            elif v_l in ("starred", "flagged"):
                plan["flagged"] = True
            elif v_l == "unread":
                plan["unread"] = True
            elif v_l in FOLDER_ALIASES:
                plan["folder"] = FOLDER_ALIASES[v_l]
            continue
        if op_l == "category":
            if v_l == "primary":
                plan["focused"] = not negated
            elif v_l in BULK_CATEGORIES:
                plan["focused"] = negated
            continue
        if op_l in ("newer_than", "older_than"):
            span = _duration(value)
            if span is not None:
                plan["since" if op_l == "newer_than" else "before"] = now - span
            continue
        if op_l in ("after", "before"):
            day = _day(value)
            if day is not None:
                plan["since" if op_l == "after" else "before"] = day
            continue

        # Everything left is a search term. Graph's KQL takes `prop:value` and
        # bare words; embedded quotes are dropped, so a quoted phrase becomes
        # its words — a little broader, never narrower.
        words = [w for w in re.split(r"\s+", value.replace('"', "")) if w]
        if op_l == "from" and not negated and len(words) == 1 and "@" in words[0]:
            plan["from"] = words[0]
            continue
        prefix = f"{op_l}:" if op_l in KQL_PROPERTIES else ""
        for word in words:
            term = f"{prefix}{word}"
            plan["kql"].append(f"NOT {term}" if negated else term)
    return plan


def _odata_clauses(plan: Dict[str, Any]) -> List[str]:
    """`$filter` clauses for a plan with no search terms. The date anchor is
    FIRST, always — see EPOCH."""
    clauses = [f"receivedDateTime ge {_iso(plan['since'] or EPOCH)}"]
    if plan["before"]:
        clauses.append(f"receivedDateTime lt {_iso(plan['before'])}")
    if plan["unread"] is not None:
        clauses.append(f"isRead eq {'false' if plan['unread'] else 'true'}")
    if plan["flagged"] is not None:
        clauses.append(f"flag/flagStatus {'eq' if plan['flagged'] else 'ne'} 'flagged'")
    if plan["attachments"] is not None:
        clauses.append(f"hasAttachments eq {'true' if plan['attachments'] else 'false'}")
    if plan["focused"] is not None:
        clauses.append(f"inferenceClassification eq '{'focused' if plan['focused'] else 'other'}'")
    if plan["important"] is not None:
        clauses.append(f"importance {'eq' if plan['important'] else 'ne'} 'high'")
    if plan["from"]:
        clauses.append(f"from/emailAddress/address eq '{_odata_str(plan['from'])}'")
    return clauses


def _kql(plan: Dict[str, Any]) -> str:
    terms = list(plan["kql"])
    if plan["from"]:
        terms.append(f"from:{plan['from']}")
    return " ".join(terms)


def _matches(d: Dict[str, Any], plan: Dict[str, Any], hidden_folder_ids: set) -> bool:
    """The plan's filters, applied to one message locally.

    Used on $search pages, where Graph would not take them as `$filter`, and
    on every page for the Deleted Items / Junk exclusion. Harmless to re-apply
    to a page `$filter` already narrowed: it agrees with it by construction.
    """
    if hidden_folder_ids and d.get("parentFolderId") in hidden_folder_ids:
        return False
    if plan["unread"] is not None and bool(d.get("isRead")) == plan["unread"]:
        return False
    if plan["flagged"] is not None:
        if ((d.get("flag") or {}).get("flagStatus") == "flagged") != plan["flagged"]:
            return False
    if plan["attachments"] is not None and bool(d.get("hasAttachments")) != plan["attachments"]:
        return False
    if plan["focused"] is not None:
        if (d.get("inferenceClassification") == "focused") != plan["focused"]:
            return False
    if plan["important"] is not None:
        if ((d.get("importance") or "").lower() == "high") != plan["important"]:
            return False
    received = _parse_iso(d.get("receivedDateTime"))
    if received is not None:
        if plan["since"] and received < plan["since"]:
            return False
        if plan["before"] and received >= plan["before"]:
            return False
    return True


def _normalize_query(q: Optional[str]) -> str:
    text = (q or "").strip()
    if not text:
        raise HTTPException(
            status_code=400,
            detail=("Missing `q`. Pass a search in Gmail's grammar — e.g. "
                    "`from:someone@example.com newer_than:30d`. For the plain unread "
                    "inbox call /emails/unread/all instead."),
        )
    if len(text) > MAX_QUERY_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Query is {len(text)} characters; the limit here is {MAX_QUERY_CHARS}.",
        )
    return text


def _clamp(n: int) -> int:
    return max(1, min(int(n), MAX_RESULTS_PER_ACCOUNT))


def _decode_page_tokens(raw: str) -> Dict[str, str]:
    """`page_tokens` is a JSON object in a query string. Malformed means "no
    cursor" — the worst case is page one again, which is obvious and
    recoverable; refusing the request over a garbled cursor is not."""
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except (ValueError, TypeError):
        return {}
    if not isinstance(parsed, dict):
        return {}
    return {str(k).lower(): str(v) for k, v in parsed.items() if v}


def _is_graph_next_link(token: str) -> bool:
    """A continuation token is a URL this service will GET with the user's
    bearer token, and it came back from a client — so it must be Graph, and
    it must be a message listing. Graph sometimes rewrites `/me/` as
    `/users/<id>/` in its own next links, so the path is checked for
    `/messages` rather than for a fixed prefix; the token's own scopes are
    what bound it to this mailbox."""
    if not token.startswith(f"{GRAPH}/"):
        return False
    return urlparse(token).path.rstrip("/").endswith("/messages")


# ── Listing ──

class _Page(NamedTuple):
    messages: List[OutlookMessage]
    next_token: str


async def _list_page(
    client: httpx.AsyncClient,
    email: str,
    plan: Dict[str, Any],
    limit: int,
    page_token: str = "",
) -> _Page:
    folders = await _folder_names(client, email)
    hidden = set()
    if plan["folder"] is None and not plan["anywhere"]:
        hidden = {fid for fid, name in folders.items() if name in HIDDEN_BY_DEFAULT}

    if page_token:
        if not _is_graph_next_link(page_token):
            raise HTTPException(status_code=400, detail="Invalid page token.")
        response = await _graph(client, email, "GET", page_token)
    else:
        if plan["folder"]:
            base = f"{GRAPH}/me/mailFolders/{plan['folder']}/messages"
        else:
            base = f"{GRAPH}/me/messages"
        params = {"$top": str(limit), "$select": SELECT_FIELDS}
        kql = _kql(plan) if plan["kql"] else ""
        if kql:
            params["$search"] = f'"{kql}"'
        else:
            params["$filter"] = " and ".join(_odata_clauses(plan))
            params["$orderby"] = "receivedDateTime desc"
        response = await _graph(client, email, "GET", base, params=params)

    if response.status_code == 404 and plan["folder"]:
        # A mailbox without that folder (no Archive, say) has nothing in it.
        return _Page([], "")
    if response.status_code != 200:
        raise _graph_error(response, f"Outlook list for {email}")
    body = response.json() or {}
    messages = [
        _message(d, email, folders)
        for d in (body.get("value") or [])
        if d.get("id") and _matches(d, plan, hidden)
    ]
    return _Page(messages, body.get("@odata.nextLink") or "")


async def _fetch_all(
    plan: Dict[str, Any],
    max_per_account: int,
    page_tokens: Dict[str, str],
    only_account: Optional[str] = None,
) -> EmailsResult:
    """Fan one query out across every authorized mailbox (or one), merged
    newest-first. Per-account failures are reported in `errors` rather than
    raised, so one broken account never takes the others down."""
    if only_account:
        _read_tokens(only_account)          # 404 naming the real accounts
        account_emails = [only_account.strip().lower()]
    else:
        account_emails = _authorized_account_emails()
    if not account_emails:
        return EmailsResult(emails=[], accounts=[])

    # A CONTINUATION asks only the accounts that still have pages. Re-listing
    # an exhausted one from the top would re-deliver its newest mail BELOW the
    # rows it duplicates (inbox-multi, MX.10).
    targets = [em for em in account_emails if em in page_tokens] if page_tokens else account_emails
    if not targets:
        return EmailsResult(emails=[], accounts=account_emails)

    errors: Dict[str, str] = {}
    next_tokens: Dict[str, str] = {}
    collected: List[OutlookMessage] = []

    async with httpx.AsyncClient() as client:
        async def one(em: str) -> List[OutlookMessage]:
            try:
                page = await _list_page(client, em, plan, max_per_account, page_tokens.get(em, ""))
            except HTTPException as e:
                errors[em] = str(e.detail)
                return []
            except Exception as e:  # noqa: BLE001
                errors[em] = str(e)
                return []
            if page.next_token:
                next_tokens[em] = page.next_token
            return page.messages

        for chunk in await asyncio.gather(*(one(em) for em in targets)):
            collected.extend(chunk)

    return EmailsResult(emails=_newest_first(collected), accounts=targets,
                        errors=errors, next_page_tokens=next_tokens)


# ── Routes: status and accounts ──

@router.get("/healthz")
async def healthz() -> Dict[str, Any]:
    return {"status": "ok"}


@router.get("/client/status")
async def client_status() -> Dict[str, Any]:
    """Whether sign-in can start, and which registration it would use."""
    config = _client_config()
    return {
        "client_configured": bool(config),
        "client_source": config.get("source", ""),
        "authority": config.get("authority", ""),
        "bundled_client_path": str(BUNDLED_CLIENT_PATH),
        "local_client_path": str(LOCAL_CLIENT_PATH),
        "accounts_dir": str(ACCOUNTS_DIR),
    }


@router.get("/accounts", response_model=AccountsList)
async def list_accounts() -> AccountsList:
    """Authorized mailboxes. Never returns a token."""
    items: List[AccountInfo] = []
    for email in _authorized_account_emails():
        try:
            t = json.loads((ACCOUNTS_DIR / email / "token.json").read_text())
        except (OSError, ValueError):
            # Corrupt token file: listed, and flagged as unable to refresh, so
            # the UI offers to re-add it instead of hiding it.
            items.append(AccountInfo(email=email))
            continue
        items.append(AccountInfo(
            email=email,
            display_name=t.get("display_name") or "",
            expires_at=int(t.get("expires_at", 0)),
            has_refresh_token=bool(t.get("refresh_token")),
            last_refreshed_at=t.get("last_refreshed_at"),
            can_modify=_can_modify(t),
        ))
    config = _client_config()
    return AccountsList(accounts=items, client_configured=bool(config),
                        client_source=config.get("source", ""))


def _find_free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _pkce_pair() -> tuple:
    """(verifier, S256 challenge). 64 random bytes → an 86-character verifier,
    inside PKCE's 43–128 range."""
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


# ── Sign-in ────────────────────────────────────────────────────────────────
#
# A sign-in is a FLOW, not a request. Microsoft's consent page can take the
# user minutes, and every hop between the app and this service has its own
# clock: mChatAIShell gives up on a forwarded call after 120 seconds and
# answers a bare "request timed out" that reads exactly like failure, while
# the sign-in goes on and may well succeed. So POST /accounts/add STARTS the
# flow and returns at once, and the app polls GET /accounts/add/{flow_id}.
# That also makes cancel real: POST /accounts/add/{flow_id}/cancel closes the
# loopback listener instead of merely no longer listening for the answer.

SIGN_IN_SECONDS = 300
MAX_REMEMBERED_FLOWS = 10
_FLOWS: "OrderedDict[str, Dict[str, Any]]" = OrderedDict()


class SignInFlow(BaseModel):
    flow_id: str
    # waiting → done | error | cancelled | expired
    state: str
    email: str = ""
    display_name: str = ""
    already_existed: bool = False
    # What Microsoft actually granted; the consent can be declined in part.
    can_modify: bool = False
    detail: str = ""


def _flow_view(flow_id: str, flow: Dict[str, Any]) -> SignInFlow:
    fields = {k: v for k, v in flow.items() if k in SignInFlow.model_fields and k != "flow_id"}
    return SignInFlow(flow_id=flow_id, **fields)


async def _open_in_browser(url: str) -> None:
    """Open Microsoft's consent page in the default browser. A seam, so tests
    never open one. mChatAIShell is unsandboxed, which is why this works."""
    await asyncio.create_subprocess_exec("/usr/bin/open", url)


async def _redeem(config: Dict[str, Any], code: str, redirect_uri: str, verifier: str) -> AddAccountResult:
    """Authorization code → tokens → who signed in → stored account."""
    async with httpx.AsyncClient(timeout=20) as client:
        token_resp = await client.post(
            f"{config['authority']}/oauth2/v2.0/token",
            data={
                "client_id": config["client_id"],
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "code_verifier": verifier,
                "scope": " ".join(config["scopes"]),
            },
        )
        if token_resp.status_code != 200:
            raise HTTPException(status_code=token_resp.status_code,
                                detail=f"Token exchange failed: {token_resp.text[:300]}")
        tokens = token_resp.json()

        me_resp = await client.get(
            f"{GRAPH}/me",
            params={"$select": "mail,userPrincipalName,displayName"},
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        if me_resp.status_code != 200:
            raise HTTPException(status_code=me_resp.status_code,
                                detail=f"Couldn't read who signed in: {me_resp.text[:300]}")
        me = me_resp.json() or {}

    # `mail` is the primary address; personal accounts sometimes leave it null,
    # and then the sign-in name IS the address.
    email = (me.get("mail") or me.get("userPrincipalName") or "").strip()
    if not email or "@" not in email:
        raise HTTPException(status_code=500, detail="Microsoft didn't return an email address for this account.")

    already_existed = (_account_dir(email) / "token.json").exists()
    now = int(time.time())
    blob = {
        "email": email,
        "display_name": me.get("displayName") or "",
        "access_token": tokens["access_token"],
        "refresh_token": tokens.get("refresh_token"),
        "expires_at": now + int(tokens.get("expires_in", 3600)),
        "scope": tokens.get("scope", ""),
        "token_type": tokens.get("token_type", "Bearer"),
        "last_refreshed_at": now,
        # Kept with the account so it refreshes under the registration that
        # issued it (see `_get_valid_access_token`).
        "client_id": config["client_id"],
        "authority": config["authority"],
        "requested_scopes": config["scopes"],
    }
    _write_tokens(email, blob)
    _FOLDERS.pop(email.lower(), None)
    return AddAccountResult(email=email.lower(), already_existed=already_existed,
                            display_name=blob["display_name"], can_modify=_can_modify(blob))


async def _run_sign_in(flow_id: str, config: Dict[str, Any]) -> None:
    """One browser sign-in, start to finish. Always leaves the flow in a
    terminal state — a flow stuck at "waiting" would block every later
    attempt (see `add_account`)."""
    flow = _FLOWS[flow_id]
    try:
        verifier, challenge = _pkce_pair()
        state = secrets.token_urlsafe(24)
        port = _find_free_port()
        # Microsoft ignores the port when matching a localhost redirect URI,
        # so the registration names `http://localhost` once and any free port
        # works here.
        redirect_uri = f"http://localhost:{port}"
        holder: Dict[str, Optional[str]] = {"code": None, "error": None}

        class CallbackHandler(BaseHTTPRequestHandler):
            def do_GET(self):  # noqa: N802
                qs = parse_qs(urlparse(self.path).query)

                # No OAuth parameters at all: the browser fetching
                # /favicon.ico after the success page, or a probe. Checked
                # FIRST — inbox-multi learned (2026-09-18) that treating a
                # missing state as a mismatched one throws away a completed
                # sign-in.
                if not qs.get("code") and not qs.get("error") and not qs.get("state"):
                    self.send_response(204)
                    self.end_headers()
                    return
                # Once a code is captured the flow is over; nothing late may
                # overwrite a success with a failure.
                if holder["code"] is not None:
                    self.send_response(204)
                    self.end_headers()
                    return

                if "code" in qs and qs.get("state", [""])[0] == state:
                    holder["code"] = qs["code"][0]
                    page = ("<h2>✅ Outlook account added to mChatAI Inbox</h2>"
                            "<p>You can close this tab and switch back to mChatAI+.</p>")
                elif "error" in qs:
                    holder["error"] = qs["error"][0]
                    reason = (qs.get("error_description") or qs["error"])[0]
                    # Escaped: this text comes from the query string.
                    page = f"<h2>Sign-in did not complete</h2><p>{html.escape(reason)}</p>"
                else:
                    holder["error"] = "state_mismatch"
                    page = "<h2>State mismatch — possible CSRF attempt; aborted.</h2>"

                body = ("<html><body style='font-family:sans-serif;text-align:center;padding:48px;'>"
                        f"{page}</body></html>").encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args, **kwargs):
                pass

        server = HTTPServer(("127.0.0.1", port), CallbackHandler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            auth_url = f"{config['authority']}/oauth2/v2.0/authorize?" + urlencode({
                "client_id": config["client_id"],
                "response_type": "code",
                "redirect_uri": redirect_uri,
                "response_mode": "query",
                "scope": " ".join(config["scopes"] + ["openid", "profile", "email"]),
                "state": state,
                "code_challenge": challenge,
                "code_challenge_method": "S256",
                # Adding a SECOND Microsoft account is the point of this flow,
                # and without this the browser silently reuses whichever
                # account it is already signed in to.
                "prompt": "select_account",
            })
            flow["redirect_uri"] = redirect_uri
            await _open_in_browser(auth_url)

            deadline = time.time() + SIGN_IN_SECONDS
            while holder["code"] is None and holder["error"] is None:
                if flow.get("cancel"):
                    flow.update(state="cancelled", detail="Sign-in cancelled.")
                    return
                if time.time() > deadline:
                    flow.update(state="expired",
                                detail="Sign-in timed out after 5 minutes. If no browser tab opened, check your default browser.")
                    return
                await asyncio.sleep(0.25)
        finally:
            # Off the event loop: shutdown() waits for serve_forever's poll.
            await asyncio.to_thread(server.shutdown)
            server.server_close()

        if holder["error"]:
            flow.update(state="error", detail=f"Microsoft sign-in error: {holder['error']}")
            return
        result = await _redeem(config, holder["code"] or "", redirect_uri, verifier)
        flow.update(state="done", email=result.email, display_name=result.display_name,
                    already_existed=result.already_existed, can_modify=result.can_modify)
    except HTTPException as e:
        flow.update(state="error", detail=str(e.detail))
    except Exception as e:  # noqa: BLE001
        flow.update(state="error", detail=f"{type(e).__name__}: {e}")


def _waiting_flow() -> Optional[str]:
    for flow_id, flow in reversed(list(_FLOWS.items())):
        task = flow.get("task")
        if flow.get("state") == "waiting" and task is not None and not task.done():
            return flow_id
    return None


@router.post("/accounts/add", response_model=SignInFlow)
async def add_account() -> SignInFlow:
    """START a Microsoft sign-in: browser consent, loopback redirect, PKCE.
    Returns at once with a `flow_id`; poll GET /accounts/add/{flow_id}.

    One sign-in at a time. A second start while one is waiting returns THAT
    flow rather than opening a second consent tab, which would leave the user
    with two tabs and no way to tell which one matters.
    """
    config = _require_client()
    existing = _waiting_flow()
    if existing:
        return _flow_view(existing, _FLOWS[existing])

    flow_id = secrets.token_urlsafe(12)
    _FLOWS[flow_id] = {"state": "waiting", "started_at": int(time.time())}
    while len(_FLOWS) > MAX_REMEMBERED_FLOWS:
        _FLOWS.popitem(last=False)
    # The reference is kept on the flow so the task cannot be collected
    # mid-sign-in.
    _FLOWS[flow_id]["task"] = asyncio.create_task(_run_sign_in(flow_id, config))
    return _flow_view(flow_id, _FLOWS[flow_id])


@router.get("/accounts/add/{flow_id}", response_model=SignInFlow)
async def sign_in_status(flow_id: str) -> SignInFlow:
    flow = _FLOWS.get(flow_id)
    if flow is None:
        raise HTTPException(
            status_code=404,
            detail="That sign-in is not known here — the Outlook mail service may have restarted. Start it again.",
        )
    return _flow_view(flow_id, flow)


@router.post("/accounts/add/{flow_id}/cancel", response_model=SignInFlow)
async def cancel_sign_in(flow_id: str) -> SignInFlow:
    flow = _FLOWS.get(flow_id)
    if flow is None:
        raise HTTPException(status_code=404, detail="That sign-in is not known here.")
    if flow.get("state") == "waiting":
        flow["cancel"] = True
    return _flow_view(flow_id, flow)


@router.delete("/accounts/{email}")
async def remove_account(email: str) -> Dict[str, Any]:
    """Forget a mailbox on this Mac. The consent itself stays on the user's
    Microsoft account until they revoke it at account.microsoft.com."""
    d = _account_dir(email)
    if not d.exists():
        raise HTTPException(status_code=404, detail=f"Account {email} not found")
    shutil.rmtree(d)
    key = email.strip().lower()
    for table in (_FOLDERS, _MOVES, _ORIGINS, _SEMAPHORES, _REFRESH_LOCKS):
        table.pop(key, None)
    return {"removed": key}


# ── Routes: reading ──

@router.get("/emails/unread/all", response_model=EmailsResult)
async def fetch_unread_all_accounts(
    max_per_account: int = 20,
    page_tokens: str = "",
    account: str = "",
) -> EmailsResult:
    """The default inbox view: unread mail in every mailbox's Inbox, merged.
    `account` narrows it to one mailbox."""
    return await _fetch_all(_plan(None), _clamp(max_per_account),
                            _decode_page_tokens(page_tokens), account or None)


@router.get("/emails/search", response_model=EmailsResult)
async def search_all_accounts(
    q: str = "",
    max_results: int = 25,
    page_tokens: str = "",
    account: str = "",
) -> EmailsResult:
    """A Gmail-grammar query across every mailbox (or `account`), translated
    for Graph — see the block comment above `_plan`."""
    return await _fetch_all(_plan(_normalize_query(q)), _clamp(max_results),
                            _decode_page_tokens(page_tokens), account or None)


@router.get("/accounts/{email}/threads/{thread_id}", response_model=EmailsResult)
async def fetch_thread(email: str, thread_id: str) -> EmailsResult:
    """Every message in one conversation, oldest first, METADATA ONLY.

    Spans folders, like a Gmail thread — your own replies live in Sent Items —
    but leaves out Deleted Items and Junk.
    """
    async with httpx.AsyncClient() as client:
        folders = await _folder_names(client, email)
        r = await _graph(client, email, "GET", f"{GRAPH}/me/messages", params={
            "$filter": f"conversationId eq '{_odata_str(thread_id)}'",
            "$select": SELECT_FIELDS,
            "$top": "100",
        })
    if r.status_code != 200:
        raise _graph_error(r, f"Outlook conversation fetch for {email}")
    hidden = {fid for fid, name in folders.items() if name in HIDDEN_BY_DEFAULT}
    messages = [
        _message(d, email.lower(), folders)
        for d in ((r.json() or {}).get("value") or [])
        if d.get("id") and d.get("parentFolderId") not in hidden
    ]
    messages.sort(key=lambda m: m.receivedDateTime or "")
    return EmailsResult(emails=messages, accounts=[email.lower()], errors={})


# ── Message BODIES ─────────────────────────────────────────────────────────
#
# The one route that returns what a sender wrote. Read inbox-multi's MX.2
# block comment before touching it; every word applies here. A body is
# attacker-controlled text. It goes to a HUMAN, through the quarantined
# reader, and to nothing an agent can call. Do not add `body` to
# SELECT_FIELDS, and do not call this from a verb.

@router.get("/accounts/{email}/messages/{message_id}/body", response_model=MailBody)
async def fetch_message_body(email: str, message_id: str) -> MailBody:
    current = _current_id(email, message_id)
    url = _message_url(current)
    async with httpx.AsyncClient() as client:
        # Both renderings, asked of Graph directly: its HTML-to-text is
        # better than anything we would write, and the plain text is what the
        # reader falls back to when HTML is off.
        html_r, text_r = await asyncio.gather(
            _graph(client, email, "GET", url,
                   params={"$select": "id,conversationId,body,toRecipients,ccRecipients,replyTo,hasAttachments,bodyPreview"},
                   headers={"Prefer": 'outlook.body-content-type="html"'}, timeout=30),
            _graph(client, email, "GET", url, params={"$select": "body"},
                   headers={"Prefer": 'outlook.body-content-type="text"'}, timeout=30),
        )
        if html_r.status_code == 404:
            raise HTTPException(status_code=404, detail=f"No message {message_id} in {email}.")
        if html_r.status_code != 200:
            raise _graph_error(html_r, f"Outlook body fetch for {email}")
        d = html_r.json() or {}

        attachments: List[MailAttachment] = []
        if d.get("hasAttachments"):
            # Names and sizes only — never `contentBytes`, which would inline
            # every file as base64.
            ar = await _graph(client, email, "GET", f"{url}/attachments",
                              params={"$select": "id,name,contentType,size,isInline"})
            if ar.status_code == 200:
                for a in (ar.json() or {}).get("value") or []:
                    attachments.append(MailAttachment(
                        attachmentId=a.get("id"),
                        filename=a.get("name") or "",
                        mimeType=a.get("contentType") or "application/octet-stream",
                        size=int(a.get("size") or 0),
                        isInline=bool(a.get("isInline")),
                    ))

    body = d.get("body") or {}
    is_html = (body.get("contentType") or "").lower() == "html"
    html_part = (body.get("content") or "") if is_html else ""
    text_part = ""
    if text_r.status_code == 200:
        text_part = ((text_r.json() or {}).get("body") or {}).get("content") or ""
    if not is_html and not text_part:
        text_part = body.get("content") or ""
    if not text_part and not html_part:
        # Something true rather than an empty page that looks broken.
        text_part = d.get("bodyPreview") or ""

    return MailBody(
        id=current,
        threadId=d.get("conversationId") or current,
        accountEmail=email.lower(),
        text=text_part,
        html=html_part,
        attachments=attachments,
        to=_format_list(d.get("toRecipients")),
        cc=_format_list(d.get("ccRecipients")),
        reply_to=_format_list(d.get("replyTo")),
        truncated=False,
    )


# ── Mutations ──────────────────────────────────────────────────────────────
#
# `Mail.ReadWrite` covers flags, read state and moves. Nothing here deletes:
# "trash" is a move to Deleted Items, which the user can recover in Outlook.
#
# MOVES CHANGE IDS. Every move is recorded (`_MOVES`, old id → new id) along
# with the folder the message came from (`_ORIGINS`), so undo can put it back
# where it was and an id the Mac is still holding keeps working. The memory
# is the process's own: after a sidecar restart an old id 404s, and the
# reader's next refresh brings fresh ones.

MAX_REMEMBERED_MOVES = 2000
_MOVES: Dict[str, "OrderedDict[str, str]"] = {}
_ORIGINS: Dict[str, "OrderedDict[str, str]"] = {}

MOVE_DESTINATIONS = {"archive": "archive", "trash": "deleteditems"}


def _remember(table: Dict[str, "OrderedDict[str, str]"], email: str, key: str, value: str) -> None:
    entries = table.setdefault(email.lower(), OrderedDict())
    entries[key] = value
    entries.move_to_end(key)
    while len(entries) > MAX_REMEMBERED_MOVES:
        entries.popitem(last=False)


def _current_id(email: str, message_id: str) -> str:
    """Follow recorded moves from an id we handed out to the id it has now."""
    entries = _MOVES.get(email.lower()) or {}
    seen = set()
    while message_id in entries and message_id not in seen:
        seen.add(message_id)
        message_id = entries[message_id]
    return message_id


async def _require_modify(email: str) -> None:
    tokens = _read_tokens(email)
    if not _can_modify(tokens):
        raise HTTPException(
            status_code=403,
            detail=(f"{email} was authorised read-only. Remove it in AI Inbox → Accounts and "
                    "add it again to allow archive, flag and trash."),
        )


async def _for_each(
    email: str,
    ids: List[str],
    op: Callable[[httpx.AsyncClient, str], Awaitable[str]],
) -> ModifyResult:
    """Run `op` on every id and report PER MESSAGE: one bad id fails alone
    and is named, rather than failing the batch or vanishing from it."""
    result = ModifyResult(modified=[], failed={}, moved={})
    async with httpx.AsyncClient() as client:
        async def run(mid: str) -> None:
            try:
                now_id = await op(client, mid)
            except HTTPException as e:
                result.failed[mid] = str(e.detail)
                return
            except Exception as e:  # noqa: BLE001
                result.failed[mid] = str(e)
                return
            result.modified.append(mid)
            if now_id and now_id != mid:
                result.moved[mid] = now_id

        await asyncio.gather(*(run(m) for m in ids))
    return result


@router.post("/accounts/{email}/messages/read", response_model=ModifyResult)
async def mark_read(email: str, req: ReadRequest) -> ModifyResult:
    if not req.message_ids:
        return ModifyResult(modified=[])
    await _require_modify(email)

    async def op(client: httpx.AsyncClient, mid: str) -> str:
        current = _current_id(email, mid)
        r = await _graph(client, email, "PATCH", _message_url(current), json_body={"isRead": req.read})
        if r.status_code != 200:
            raise _graph_error(r, "Mark as read" if req.read else "Mark as unread")
        return current

    return await _for_each(email, req.message_ids, op)


@router.post("/accounts/{email}/messages/flag", response_model=ModifyResult)
async def flag_messages(email: str, req: FlagRequest) -> ModifyResult:
    """Outlook's flag is the counterpart of Gmail's star."""
    if not req.message_ids:
        return ModifyResult(modified=[])
    await _require_modify(email)
    status = "flagged" if req.flagged else "notFlagged"

    async def op(client: httpx.AsyncClient, mid: str) -> str:
        current = _current_id(email, mid)
        r = await _graph(client, email, "PATCH", _message_url(current),
                         json_body={"flag": {"flagStatus": status}})
        if r.status_code != 200:
            raise _graph_error(r, "Flag" if req.flagged else "Clear flag")
        return current

    return await _for_each(email, req.message_ids, op)


@router.post("/accounts/{email}/messages/move", response_model=ModifyResult)
async def move_messages(email: str, req: MoveRequest) -> ModifyResult:
    """Archive or trash.

    ARCHIVE MEANS "OUT OF THE INBOX", as it does in Gmail, where it removes one
    label and touches nothing else. A conversation holds your own replies from
    Sent Items too, and moving THOSE into Archive would empty your Sent folder
    of that conversation. So archive moves only what is in the Inbox and
    counts the rest as already done. Trash moves everything it is given, as
    Gmail's trash does.
    """
    destination = MOVE_DESTINATIONS.get(req.destination.strip().lower())
    if destination is None:
        raise HTTPException(status_code=400,
                            detail=f"Unknown destination {req.destination!r}; use one of {sorted(MOVE_DESTINATIONS)}.")
    if not req.message_ids:
        return ModifyResult(modified=[])
    await _require_modify(email)

    async with httpx.AsyncClient() as lookup:
        folders = await _folder_names(lookup, email)
    inbox_ids = {fid for fid, name in folders.items() if name == "inbox"}

    async def op(client: httpx.AsyncClient, mid: str) -> str:
        current = _current_id(email, mid)
        before = await _graph(client, email, "GET", _message_url(current),
                              params={"$select": "parentFolderId"})
        if before.status_code != 200:
            raise _graph_error(before, "Look up message")
        origin = (before.json() or {}).get("parentFolderId") or ""
        if destination == "archive" and inbox_ids and origin not in inbox_ids:
            return current
        r = await _graph(client, email, "POST", f"{_message_url(current)}/move",
                         json_body={"destinationId": destination})
        if r.status_code not in (200, 201):
            raise _graph_error(r, "Archive" if destination == "archive" else "Move to Deleted Items")
        new_id = (r.json() or {}).get("id") or current
        if new_id != current:
            _remember(_MOVES, email, current, new_id)
        if origin:
            _remember(_ORIGINS, email, new_id, origin)
        return new_id

    return await _for_each(email, req.message_ids, op)


@router.post("/accounts/{email}/messages/restore", response_model=ModifyResult)
async def restore_messages(email: str, req: IdsRequest) -> ModifyResult:
    """Undo an archive or a trash: put each message back in the folder THIS
    service moved it out of.

    A message with no record is looked up where it is. If it is still there,
    this service never moved it (archive skips anything not in the Inbox), so
    there is nothing to undo. If it cannot be found, it moved while this
    process was not watching, and that is reported as a failure — never as a
    restore that did not happen. One case falls back: with NO records at all
    for the mailbox (the sidecar restarted since the move) a message found in
    Archive or Deleted Items goes back to the Inbox, which is where every
    archive and trash from the inbox view took it from.
    """
    if not req.message_ids:
        return ModifyResult(modified=[])
    await _require_modify(email)
    origins = _ORIGINS.setdefault(email.lower(), OrderedDict())
    recorded_any = bool(origins) or bool(_MOVES.get(email.lower()))
    async with httpx.AsyncClient() as lookup:
        folders = await _folder_names(lookup, email)

    async def op(client: httpx.AsyncClient, mid: str) -> str:
        current = _current_id(email, mid)
        destination = origins.get(current)
        if destination is None:
            probe = await _graph(client, email, "GET", _message_url(current),
                                 params={"$select": "parentFolderId"})
            if probe.status_code == 404:
                raise HTTPException(
                    status_code=404,
                    detail=("This message has moved since it was listed, and its new id is not "
                            "known here. Refresh the inbox, or move it back in Outlook."),
                )
            if probe.status_code != 200:
                raise _graph_error(probe, "Undo")
            folder = folders.get((probe.json() or {}).get("parentFolderId") or "")
            if recorded_any or folder not in ("archive", "deleteditems"):
                return current
            destination = "inbox"
        r = await _graph(client, email, "POST", f"{_message_url(current)}/move",
                         json_body={"destinationId": destination})
        if r.status_code not in (200, 201):
            raise _graph_error(r, "Undo")
        new_id = (r.json() or {}).get("id") or current
        origins.pop(current, None)
        if new_id != current:
            _remember(_MOVES, email, current, new_id)
        return new_id

    return await _for_each(email, req.message_ids, op)
