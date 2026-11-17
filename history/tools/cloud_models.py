#!/usr/bin/env python3
"""Model calls through mChatAI's compute-proxy, billed to the signed-in account's compute tokens.

  cloud_models.py ping [<role>] [--backend claude-code]
                                    one tiny call (20 output tokens) to prove the session and the role;
                                    with --backend claude-code, that `claude -p` runs on the author's plan

The session is a JSON file, {idToken, refreshToken, apiKey, at}, named by the env MCHATAI_SESSION
(`at` is when the ID token was minted: epoch milliseconds, epoch seconds or ISO time). The ID token
is refreshed through Google's securetoken endpoint when it is older than tokenRefreshMinutes, and on
a 401, and written back to the file (mode 600). No token is ever printed or logged.

The roles (provider, model, maxOutputTokens) are content: history/cloud-writer.json. The request's
SHAPE (max_tokens or max_completion_tokens, whether a temperature or a reasoning effort is sent) is
content too: llm-catalog/request-shapes.json, matched as web-api's learningModels.js `shapeFor`
matches it. No model id and no model-family test lives here.

Library:

    client = Client()                                   # cloud-writer.json, request-shapes.json, MCHATAI_SESSION
    r = client.chat("writer", system, user, stage="ch10.write")
    r["text"], r["finishReason"], r["tokensUsed"], r["model"]
    client.tally                                        # {stage: {"tokens", "calls"}}

A 429 or 5xx is retried twice with backoff; a 402 raises ModelError with the proxy's type
(insufficient_tokens, sign_in_required); an empty reply cut off by its budget raises ModelError
`output_budget`, naming the role whose maxOutputTokens to raise.

Grant mode (a server job billing a user through an ED.6 capped grant, EDUCATION_CLOUD_SERVICES.md §7):
when the env MCHATAI_GRANT names a grant id, every call carries `x-mchatai-grant: <id>` and
`authorization: Bearer <Google-signed OIDC ID token>` instead of a user's session. The token is minted
for the audience MCHATAI_GRANT_AUDIENCE (compute-proxy's GRANT_AUDIENCE; the proxy URL when unset) by
the Cloud Run metadata server, as the job's service account, and cached until five minutes before it
expires. Off Google Cloud, MCHATAI_GOOGLE_ID_TOKEN supplies one for testing (`gcloud auth
print-identity-token --impersonate-service-account=… --audiences=…`). A grant call always sets
max_tokens (the proxy caps a grant call's cost by it; a shape that takes max_completion_tokens gets
both, equal), never streams and asks for one completion. A 402 grant_exhausted, grant_revoked or
grant_expired stops the run with what the user must do; book_job.py pauses the job on it.
"""
import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import HISTORY, load_json  # noqa: E402

CONFIG = os.path.join(HISTORY, "cloud-writer.json")
SHAPES = os.path.join(os.path.dirname(HISTORY), "llm-catalog", "request-shapes.json")
REFRESH_URL = "https://securetoken.googleapis.com/v1/token"
METADATA_IDENTITY_URL = ("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/"
                         "default/identity")
# compute-proxy's grants.cjs GRANT_ID_RE: Firestore reserves ids matching __.*__.
GRANT_ID_RE = re.compile(r"(?!__.*__$)[A-Za-z0-9_-]{1,128}")

# Error codes a job waits out rather than fails on: the user approves more tokens, a new grant, or buys
# tokens, and the job resumes from its checkpoint. And codes a rerun may clear on its own.
PAUSE_CODES = frozenset({"grant_exhausted", "grant_revoked", "grant_expired", "insufficient_tokens"})
RETRYABLE_CODES = frozenset({"model_unavailable", "rate_limited", "identity_unavailable"})


class ModelError(Exception):
    """A call that did not produce an answer. `code` is the proxy's error type where it gave one;
    `tokensUsed` is what the call was charged all the same (an empty reply still thought)."""

    def __init__(self, code, message, status=None, tokens_used=0):
        super().__init__(message)
        self.code = code
        self.status = status
        self.tokensUsed = tokens_used


# ── content ──────────────────────────────────────────────────────────────────

def load_config(path=None, backend=None):
    """cloud-writer.json. `backend` (or the env HISTORY_WRITER_BACKEND) names an entry of its
    `backends`: that entry's roles are laid over the base roles, field by field, and its other keys
    over the base keys. With neither, the base config (compute-proxy) is returned unchanged."""
    path = path or os.environ.get("MCHATAI_CLOUD_WRITER") or CONFIG
    cfg = load_json(path)
    if not cfg or not isinstance(cfg.get("roles"), dict):
        raise SystemExit(f"{path} is missing or has no roles")
    backend = backend or os.environ.get("HISTORY_WRITER_BACKEND")
    if backend:
        over = (cfg.get("backends") or {}).get(backend)
        if not isinstance(over, dict):
            raise SystemExit(f"{path} has no backend {backend!r} (it has {', '.join(cfg.get('backends') or {}) or 'none'})")
        roles = {k: dict(v) for k, v in cfg["roles"].items()}
        for k, v in (over.get("roles") or {}).items():
            roles[k] = {**roles.get(k, {}), **v}
        cfg = {**cfg, **{k: v for k, v in over.items() if k not in ("roles",) and not k.startswith("_")},
               "roles": roles, "backend": backend}
    return cfg


def make_client(cfg, **kw):
    """The client for cfg's backend: Claude Code on the author's plan, or compute-proxy."""
    if cfg.get("backend") == "claude-code":
        return ClaudeCodeClient(cfg=cfg, **{k: v for k, v in kw.items() if k in ("run", "sleep")})
    return Client(cfg=cfg, **kw)


def load_shapes(path=None):
    """llm-catalog/request-shapes.json. Missing is an error: a guessed shape 400s a model that
    refuses a temperature, and that failure is exactly what the file exists to prevent."""
    path = path or os.environ.get("MCHATAI_REQUEST_SHAPES") or SHAPES
    shapes = load_json(path)
    if not shapes or not isinstance(shapes.get("rules"), list):
        raise SystemExit(f"{path} is missing or has no rules: the request shape must come from content")
    return shapes


def prompt_text(value):
    """A prompt in content: a string, or a list of lines."""
    if isinstance(value, list):
        return "\n".join(str(v) for v in value)
    return value or ""


def fill(template, **values):
    """`{name}` placeholders filled by plain replacement, so a JSON example's braces survive."""
    out = prompt_text(template)
    for k, v in values.items():
        out = out.replace("{" + k + "}", str(v))
    return out


# ── the request shape (learningModels.js shapeFor, ported) ───────────────────

def _leading_int(s):
    m = re.match(r"\s*([+-]?\d+)", s)
    return int(m.group(1)) if m else 0


def shape_for(shapes, provider, model):
    """The first rule whose provider matches (case-insensitive; a rule with none matches any) and
    whose `modelPrefix` is a prefix of the lowercased model id, or whose `family` + `minMajorVersion`
    matches '<family>-<N>…' with N at least the minimum; then the same with the provider's alias;
    else the file's default."""
    if not shapes:
        return {"tokenParameter": "max_tokens", "acceptsTemperature": True}
    m = str(model).lower()

    def first(prov):
        for r in shapes.get("rules", []):
            if r.get("provider") and r["provider"].lower() != str(prov).lower():
                continue
            prefixes = r.get("modelPrefix")
            if isinstance(prefixes, list) and any(m.startswith(str(x).lower()) for x in prefixes):
                return r
            fam, low = r.get("family"), r.get("minMajorVersion")
            if fam and isinstance(low, (int, float)) and not isinstance(low, bool):
                at = m.find(f"{fam.lower()}-")
                if at >= 0 and _leading_int(m[at + len(fam) + 1:]) >= low:
                    return r
        return None

    alias = next((k for k in (shapes.get("providerAliases") or {}) if k.lower() == str(provider).lower()), None)
    return first(provider) or (alias and first(shapes["providerAliases"][alias])) or shapes.get("default") or {}


def build_body(role, system, user, shape, max_output_tokens=None, grant=False):
    """The OpenAI-style body compute-proxy takes, shaped for the role's model. A grant call (`grant`)
    always carries max_tokens too, the bound the proxy reserves the call's cost by, and leaves `n`
    unset (one completion)."""
    body = {"model": role["model"],
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "stream": False}
    key = "max_completion_tokens" if shape.get("tokenParameter") == "max_completion_tokens" else "max_tokens"
    body[key] = int(max_output_tokens or role.get("maxOutputTokens") or 2000)
    if grant:
        body["max_tokens"] = body[key]
    if shape.get("acceptsTemperature") is not False:
        t = role.get("temperature")
        body["temperature"] = 0 if t is None else t
    # Where a model takes its effort setting comes from the shape too: Claude 4.7+ and 5.x read
    # output_config.effort (thinking cannot be turned off on Opus 5.5, only made shallower).
    if role.get("reasoningEffort") and shape.get("effortParameter") == "output_config.effort":
        body["output_config"] = {"effort": role["reasoningEffort"]}
    elif role.get("reasoningEffort") and shape.get("acceptsReasoningEffort") is True:
        body["reasoning_effort"] = role["reasoningEffort"]
    return body


# ── transport ────────────────────────────────────────────────────────────────

def urllib_transport(method, url, headers, body, timeout):
    """(status, {lowercased header: value}, body bytes). An HTTP error is a status, not a raise;
    a dropped connection raises OSError."""
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status, {k.lower(): v for k, v in res.headers.items()}, res.read()
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in (e.headers or {}).items()}, e.read() or b""


def _json(raw):
    try:
        return json.loads(raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else raw)
    except (ValueError, AttributeError):
        return None


# ── the session ──────────────────────────────────────────────────────────────

def _epoch(at):
    if isinstance(at, bool):
        return 0.0
    if isinstance(at, (int, float)):
        return at / 1000.0 if at > 1e11 else float(at)
    if isinstance(at, str) and at.strip():
        try:
            return _epoch(float(at))
        except ValueError:
            pass
        try:
            d = datetime.fromisoformat(at.strip().replace("Z", "+00:00"))
            return (d if d.tzinfo else d.replace(tzinfo=timezone.utc)).timestamp()
        except ValueError:
            return 0.0
    return 0.0


def _stamp_like(old, now):
    """`now` written the way the file wrote `at`, so another tool reading it keeps working."""
    if isinstance(old, (int, float)) and not isinstance(old, bool):
        return int(now * 1000) if old > 1e11 else int(now)
    if isinstance(old, str) and re.fullmatch(r"\s*\d+(\.\d+)?\s*", old or ""):
        return str(int(now * 1000)) if float(old) > 1e11 else str(int(now))
    return datetime.fromtimestamp(now, timezone.utc).isoformat(timespec="seconds")


class Session:
    """The signed-in account: an ID token for compute-proxy, refreshed from the refresh token."""

    def __init__(self, path=None, transport=urllib_transport, clock=time.time, refresh_minutes=50, timeout=60):
        self.path = path
        self.transport = transport
        self.clock = clock
        self.refresh_minutes = refresh_minutes
        self.timeout = timeout
        self.data = None

    def _load(self):
        if self.data is not None:
            return
        path = self.path or os.environ.get("MCHATAI_SESSION")
        if not path:
            raise ModelError("no_session", "set MCHATAI_SESSION to the session file ({idToken, refreshToken, apiKey, at})")
        if not os.path.exists(path):
            raise ModelError("no_session", f"the session file {path} does not exist (MCHATAI_SESSION)")
        self.path = path
        data = load_json(path) or {}
        missing = [k for k in ("idToken", "refreshToken", "apiKey") if not data.get(k)]
        if missing:
            raise ModelError("no_session", f"the session file {path} lacks {', '.join(missing)}")
        self.data = data

    def age_seconds(self):
        self._load()
        return self.clock() - _epoch(self.data.get("at"))

    def token(self):
        self._load()
        if self.age_seconds() > self.refresh_minutes * 60:
            self.refresh()
        return self.data["idToken"]

    def refresh(self):
        self._load()
        url = REFRESH_URL + "?" + urllib.parse.urlencode({"key": self.data["apiKey"]})
        form = urllib.parse.urlencode({"grant_type": "refresh_token", "refresh_token": self.data["refreshToken"]}).encode()
        try:
            status, _, raw = self.transport("POST", url, {"content-type": "application/x-www-form-urlencoded"}, form, self.timeout)
        except OSError as e:
            raise ModelError("refresh_failed", f"could not reach the token service to refresh the session: {type(e).__name__}")
        j = _json(raw) or {}
        if status != 200 or not j.get("id_token"):
            why = ((j.get("error") or {}).get("message") if isinstance(j.get("error"), dict) else None) or f"HTTP {status}"
            raise ModelError("refresh_failed", f"the session's refresh token was refused ({why}): sign in to mChatAI again "
                                               "and write a fresh session file", status=status)
        self.data["idToken"] = j["id_token"]
        if j.get("refresh_token"):
            self.data["refreshToken"] = j["refresh_token"]
        self.data["at"] = _stamp_like(self.data.get("at"), self.clock())
        self.save()

    def save(self):
        tmp = self.path + ".part"
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(self.data, fh, indent=1)
            fh.write("\n")
        os.chmod(tmp, 0o600)
        os.replace(tmp, self.path)
        os.chmod(self.path, 0o600)


def jwt_expiry(token):
    """The `exp` (epoch seconds) a JWT's payload claims, read without verifying it; None if unreadable.
    The proxy verifies the token; this only decides when to mint the next one."""
    try:
        part = token.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))
        exp = claims.get("exp")
        return float(exp) if isinstance(exp, (int, float)) and not isinstance(exp, bool) else None
    except (IndexError, ValueError, AttributeError, TypeError):
        return None


class GoogleIdentity:
    """A grant job's identity for compute-proxy: a Google-signed OIDC ID token of the service account the
    job runs as, minted for `audience` by the metadata server, or MCHATAI_GOOGLE_ID_TOKEN when set (a
    token minted elsewhere, for testing off Google Cloud). The same two calls as Session: token() and,
    after a 401, refresh()."""

    def __init__(self, audience, transport=urllib_transport, clock=time.time, sleep=time.sleep,
                 early_seconds=300, timeout=10, static_token=None, metadata_url=METADATA_IDENTITY_URL):
        self.audience = audience
        self.transport = transport
        self.clock = clock
        self.sleep = sleep
        self.early = early_seconds
        self.timeout = timeout
        self.static = static_token if static_token is not None else os.environ.get("MCHATAI_GOOGLE_ID_TOKEN")
        self.metadata_url = metadata_url
        self._token, self._exp = None, 0.0
        self.mints = 0

    def token(self):
        if self._token and self.clock() < self._exp - self.early:
            return self._token
        return self._mint()

    def refresh(self):
        """After a 401: a token from the environment cannot be renewed here, so that is the end."""
        if self.static:
            raise ModelError("auth_rejected", "compute-proxy refused the Google ID token in MCHATAI_GOOGLE_ID_TOKEN "
                                              f"(401): it must be minted for the audience {self.audience!r} (one of "
                                              "compute-proxy's GRANT_AUDIENCE) and be unexpired", status=401)
        self._token, self._exp = None, 0.0
        return self._mint()

    def _mint(self):
        now = self.clock()
        if self.static:
            exp = jwt_expiry(self.static)
            if exp is not None and now >= exp:
                raise ModelError("identity_expired", "the Google ID token in MCHATAI_GOOGLE_ID_TOKEN has expired: mint "
                                                     "a new one (gcloud auth print-identity-token "
                                                     "--impersonate-service-account=<the job's account> "
                                                     f"--audiences={self.audience})")
            self._token, self._exp = self.static, exp if exp is not None else now + 600
            return self._token
        url = self.metadata_url + "?" + urllib.parse.urlencode({"audience": self.audience, "format": "full"})
        why = None
        for attempt in range(3):
            if attempt:
                self.sleep(attempt * 2)
            try:
                status, _, raw = self.transport("GET", url, {"Metadata-Flavor": "Google"}, None, self.timeout)
            except OSError as e:
                why = f"could not reach the metadata server ({type(e).__name__})"
                continue
            tok = (raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else str(raw or "")).strip()
            if status == 200 and tok.count(".") == 2:
                self.mints += 1
                exp = jwt_expiry(tok)
                self._token, self._exp = tok, exp if exp is not None else now + 600
                return self._token
            why = f"the metadata server answered {status} for an ID token"
            if status and status < 500:
                break
        raise ModelError("identity_unavailable", f"{why}. A grant job runs on Google Cloud as the service account on "
                                                 "compute-proxy's GRANT_CALLERS; off it, set MCHATAI_GOOGLE_ID_TOKEN")


# ── the client ───────────────────────────────────────────────────────────────

_402 = {
    "insufficient_tokens": "the signed-in mChatAI account is out of compute tokens. Buy tokens, then rerun: the run "
                           "resumes from its files",
    "sign_in_required": "the session is not a signed-in mChatAI account. Sign in again and write a fresh session file",
}
_402_GRANT = {
    "grant_exhausted": "the grant is used up (the compute tokens the user approved are spent, or this call's "
                       "worst-case cost would pass them); the job pauses until the user approves more",
    "grant_revoked": "the grant is revoked (the user cancelled the job); the job pauses",
    "grant_expired": "the grant has expired; the job pauses until the user approves a new one",
    "grant_not_found": "compute-proxy has no grant with this id (MCHATAI_GRANT)",
    "grant_invalid": "the grant's record is malformed; web-api must create a new one",
    "insufficient_tokens": "the user's account is out of compute tokens; the job pauses until they buy more",
}
_403_GRANT = {
    "grant_caller_forbidden": "the job's service account is not on compute-proxy's GRANT_CALLERS (or its unique id "
                              "is not on GRANT_CALLER_IDS)",
    "grant_path_disabled": "compute-proxy's grant path is off (GRANT_CALLERS or GRANT_AUDIENCE is unset)",
}


def _content_text(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):   # content parts
        return "".join(p.get("text", "") for p in content if isinstance(p, dict) and isinstance(p.get("text"), str))
    return ""


def _tokens(headers):
    raw = (headers or {}).get("x-mchatai-tokens-used")
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return 0
    return int(v) if v.is_integer() else v


class Client:
    def __init__(self, cfg=None, shapes=None, session=None, session_path=None, transport=urllib_transport,
                 sleep=time.sleep, clock=time.time, proxy_url=None, grant=None, audience=None):
        """`grant` (default: the env MCHATAI_GRANT) bills an ED.6 grant as the job's Google identity;
        without one, the signed-in session (MCHATAI_SESSION) is billed."""
        self.cfg = cfg or load_config()
        self.shapes = shapes if shapes is not None else load_shapes()
        self.transport = transport
        self.sleep = sleep
        self.proxy_url = (proxy_url or os.environ.get("COMPUTE_PROXY_URL") or self.cfg.get("proxyUrl")
                          or "https://api.mchatai.com").rstrip("/")
        self.grant = str(grant if grant is not None else os.environ.get("MCHATAI_GRANT") or "").strip() or None
        if self.grant and not GRANT_ID_RE.fullmatch(self.grant):
            raise ModelError("bad_grant", "MCHATAI_GRANT is not a grant id (letters, digits, _ and -, at most 128)")
        if self.grant:
            audience = audience or os.environ.get("MCHATAI_GRANT_AUDIENCE") or self.proxy_url
            self.session = session or GoogleIdentity(audience, transport=transport, clock=clock, sleep=sleep)
        else:
            self.session = session or Session(session_path, transport=transport, clock=clock,
                                              refresh_minutes=self.cfg.get("tokenRefreshMinutes", 50))
        self.tally = {}

    def role(self, role):
        """A role by name from cloud-writer.json (with its name), or a role dict as given."""
        if isinstance(role, dict):
            return {"name": role.get("name") or role.get("model"), **role}
        r = self.cfg["roles"].get(role)
        if not r:
            raise ModelError("no_role", f"cloud-writer.json has no role {role!r} (it has {', '.join(self.cfg['roles'])})")
        return {"name": role, **r}

    def _count(self, stage, used):
        t = self.tally.setdefault(stage, {"tokens": 0, "calls": 0})
        t["tokens"] = round(t["tokens"] + (used or 0), 4)
        t["calls"] += 1

    def chat(self, role, system, user, stage=None, max_output_tokens=None):
        r = self.role(role)
        stage = stage or r["name"]
        shape = shape_for(self.shapes, r.get("provider", ""), r["model"])
        body = build_body(r, system, user, shape, max_output_tokens, grant=bool(self.grant))
        budget = body.get("max_completion_tokens") or body.get("max_tokens")
        data = json.dumps(body).encode("utf-8")
        retry = self.cfg.get("retries") or {}
        tries, waits = int(retry.get("count", 2)), list(retry.get("backoffSeconds") or [5, 20])
        timeout = self.cfg.get("timeoutSeconds", 900)
        url = self.proxy_url + "/v1/chat/completions"
        attempt, refreshed = 0, False
        while True:
            headers = {"content-type": "application/json", "authorization": "Bearer " + self.session.token()}
            if self.grant:
                headers["x-mchatai-grant"] = self.grant
            try:
                status, h, raw = self.transport("POST", url, headers, data, timeout)
            except OSError as e:
                status, h, raw = None, {}, f"{type(e).__name__}".encode()
            if status == 401 and not refreshed:
                self.session.refresh()
                refreshed = True
                continue
            if status is None or status == 429 or status >= 500:
                if attempt < tries:
                    after = _leading_int(str((h or {}).get("retry-after") or ""))
                    if not after:
                        after = waits[min(attempt, len(waits) - 1)] if waits else 1
                    self.sleep(after)
                    attempt += 1
                    continue
                what = "rate limited (429)" if status == 429 else (f"answered {status}" if status else
                                                                   f"could not be reached ({raw.decode()})")
                raise ModelError("rate_limited" if status == 429 else "model_unavailable",
                                 f"compute-proxy {what} for the {r['name']} role after {tries + 1} tries", status=status)
            if status >= 400:
                err = (_json(raw) or {}).get("error")
                err = err if isinstance(err, dict) else {}
                if status == 402:
                    kind = err.get("type") or "insufficient_tokens"
                    if self.grant:
                        why = _402_GRANT.get(kind) or f"the grant cannot pay for this call ({err.get('message') or kind})"
                    else:
                        why = _402.get(kind, "the account cannot pay for this call")
                    raise ModelError(kind, f"compute-proxy refused the call (402 {kind}): {why}", status=402)
                if status in (401, 403) and self.grant:
                    kind = err.get("type") or "auth_rejected"
                    if kind in _403_GRANT:
                        why = _403_GRANT[kind]
                    elif status == 401:
                        why = ("the job's Google ID token was refused after a fresh one was minted: its audience "
                               f"({getattr(self.session, 'audience', None)!r}, MCHATAI_GRANT_AUDIENCE) must be one of "
                               "compute-proxy's GRANT_AUDIENCE")
                    else:
                        why = str(err.get("message") or "")[:300]
                    raise ModelError(kind, f"compute-proxy refused the grant call ({status} {kind}): {why}", status=status)
                if status in (401, 403):
                    raise ModelError(err.get("type") or "auth_rejected",
                                     f"compute-proxy rejected the session ({status}) after a token refresh: sign in again",
                                     status=status)
                detail = str(err.get("message") or "")[:300]
                raise ModelError(err.get("type") or "bad_request",
                                 f"compute-proxy answered {status} for the {r['name']} role ({r['model']}): {detail}",
                                 status=status)
            break

        used = _tokens(h)
        self._count(stage, used)
        j = _json(raw) or {}
        choice = (j.get("choices") or [{}])[0] or {}
        text = _content_text((choice.get("message") or {}).get("content"))
        finish = choice.get("finish_reason")
        if not text.strip():
            if finish == "length":
                raise ModelError("output_budget",
                                 f"the {r['name']} role ({r['model']}) spent all {budget} "
                                 "output tokens thinking and wrote nothing (finish_reason 'length'): raise "
                                 f"roles.{r['name']}.maxOutputTokens in history/cloud-writer.json",
                                 tokens_used=used)
            raise ModelError("empty_reply", f"the {r['name']} role ({r['model']}) returned no text "
                                            f"(finish_reason {finish!r})", tokens_used=used)
        return {"text": text, "finishReason": finish, "tokensUsed": used, "model": j.get("model") or r["model"],
                "usage": j.get("usage")}


# ── Claude Code: the author's own plan ───────────────────────────────────────

# Env that would move a `claude -p` call off the author's subscription onto an API key.
API_ENV = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")
PLAN_LIMIT = re.compile(r"usage limit|weekly limit|hit your (?:weekly |session )?limit|limit (?:reached|resets)|"
                        r"rate.?limit", re.I)


def subprocess_run(cmd, stdin, env, cwd, timeout):
    import subprocess
    p = subprocess.run(cmd, input=stdin, capture_output=True, text=True, env=env, cwd=cwd, timeout=timeout)
    return p.returncode, p.stdout, p.stderr


class ClaudeCodeClient:
    """The same calls as Client, made with Claude Code (`claude -p`) on the author's subscription
    instead of compute-proxy: Lawrence, 2026-11-16, "Use my claude code subscription", after the
    learning service had billed his compute tokens for his own book.

    Each call is one turn with no tools and no MCP servers, in an empty folder (no CLAUDE.md, no
    memory, no session saved), with the role's prompt as the whole system prompt. Never `--bare`,
    and ANTHROPIC_API_KEY is removed: either would bill an API key. The model and effort are the
    role's (`model` is a Claude Code alias such as opus or sonnet; content, never code).
    `tokensUsed` is 0, since no compute token is spent; `planTokens` is what the turn used of the
    plan (input, cache writes, cache reads and output, as the CLI reports them)."""

    def __init__(self, cfg=None, run=subprocess_run, sleep=time.sleep):
        self.cfg = cfg or load_config(backend="claude-code")
        self.run = run
        self.sleep = sleep
        self.binary = os.environ.get("CLAUDE_BIN") or self.cfg.get("claudeBinary") or "claude"
        self.tally = {}

    role = Client.role

    def _count(self, stage, plan):
        t = self.tally.setdefault(stage, {"tokens": 0, "calls": 0, "planTokens": 0})
        t["calls"] += 1
        t["planTokens"] += int(plan or 0)

    def command(self, r, system_file):
        cmd = [self.binary, "-p", "--output-format", "json", "--max-turns", "1", "--model", str(r["model"]),
               "--tools", "", "--strict-mcp-config", "--no-session-persistence", "--system-prompt-file", system_file]
        effort = r.get("effort") or r.get("reasoningEffort")
        if effort:
            cmd += ["--effort", str(effort)]
        return cmd

    def chat(self, role, system, user, stage=None, max_output_tokens=None):
        import tempfile
        r = self.role(role)
        stage = stage or r["name"]
        env = {k: v for k, v in os.environ.items() if k not in API_ENV}
        if max_output_tokens or r.get("maxOutputTokens"):
            env["CLAUDE_CODE_MAX_OUTPUT_TOKENS"] = str(max_output_tokens or r["maxOutputTokens"])
        retry = self.cfg.get("retries") or {}
        tries, waits = int(retry.get("count", 2)), list(retry.get("backoffSeconds") or [5, 20])
        timeout = self.cfg.get("timeoutSeconds", 900)
        with tempfile.TemporaryDirectory(prefix="hw-claude-") as cwd:
            system_file = os.path.join(cwd, "system.md")
            with open(system_file, "w", encoding="utf-8") as fh:
                fh.write(system)
            attempt = 0
            while True:
                try:
                    code, out, err = self.run(self.command(r, system_file), user, env, cwd, timeout)
                except Exception as e:   # a timeout or a missing binary
                    code, out, err = None, "", f"{type(e).__name__}: {e}"
                env_json = _json(out.encode("utf-8")) if out and out.lstrip().startswith("{") else None
                failed = code != 0 or not isinstance(env_json, dict) or env_json.get("is_error")
                if not failed:
                    break
                said = str((env_json or {}).get("result") or err or out or "no output")[-400:]
                if PLAN_LIMIT.search(said):
                    raise ModelError("plan_limit", f"Claude Code refused the {r['name']} call: {said}")
                if attempt < tries:
                    self.sleep(waits[min(attempt, len(waits) - 1)] if waits else 1)
                    attempt += 1
                    continue
                raise ModelError("cli_failed", f"claude -p failed for the {r['name']} role after {tries + 1} tries "
                                               f"(exit {code}): {said}")
        usage = env_json.get("usage") or {}
        by_model = env_json.get("modelUsage") or {}
        # Every model the turn used (the CLI may make a small side call on another model), else the main usage.
        plan = sum(int(m.get(k) or 0) for m in by_model.values() if isinstance(m, dict)
                   for k in ("inputTokens", "outputTokens", "cacheReadInputTokens", "cacheCreationInputTokens")) \
            or sum(int(usage.get(k) or 0) for k in ("input_tokens", "cache_creation_input_tokens",
                                                     "cache_read_input_tokens", "output_tokens"))
        self._count(stage, plan)
        text = env_json.get("result") or ""
        finish = "length" if env_json.get("stop_reason") == "max_tokens" else (env_json.get("stop_reason") or "stop")
        if not text.strip():
            raise ModelError("empty_reply", f"the {r['name']} role ({r['model']}) on Claude Code returned no text "
                                            f"(stop_reason {env_json.get('stop_reason')!r})")
        # The model that wrote the reply: the one with the most output, not a side call's.
        model = max(by_model, key=lambda k: int((by_model[k] or {}).get("outputTokens") or 0)) if by_model else r["model"]
        # Claude Code does not stop at CLAUDE_CODE_MAX_OUTPUT_TOKENS: it asks the model to go on in a second message,
        # and `result` holds only that one, with stop_reason end_turn. Chapter 5's first write came back as the tail
        # of a chapter, starting mid-sentence, at 340K plan tokens against a normal 120K (2026-11-17). One message
        # cannot pass the cap, so output at or over it means the reply was cut: report it as "length", which the
        # writer stops on, instead of passing the tail on as the reply.
        cap = int(max_output_tokens or r.get("maxOutputTokens") or 0)
        wrote = int((by_model.get(model) or {}).get("outputTokens") or 0) if by_model else int(usage.get("output_tokens") or 0)
        if cap and wrote >= cap:
            finish = "length"
        return {"text": text, "finishReason": finish, "tokensUsed": 0, "planTokens": plan, "model": model,
                "usage": usage}


# ── command line ─────────────────────────────────────────────────────────────

def main(argv):
    if len(argv) >= 2 and argv[1] == "ping":
        role = argv[2] if len(argv) > 2 and not argv[2].startswith("--") else "writer"
        backend = argv[argv.index("--backend") + 1] if "--backend" in argv else None
        client = make_client(load_config(backend=backend))
        try:
            r = client.chat(role, "Reply with the single word: ready.", "Are you there?", stage="ping", max_output_tokens=20)
        except ModelError as e:
            if e.code == "output_budget":   # 20 tokens is too few for a model that thinks first; the session worked
                print(f"ping {role}: the session and the proxy work; the model thought past 20 tokens "
                      f"({e.tokensUsed} compute tokens)")
                return 0
            print(f"ping {role}: {e.code}: {e}")
            return 1
        print(f"ping {role}: {r['model']} answered {r['text'].strip()[:40]!r} "
              f"(finish {r['finishReason']}, {r['tokensUsed']} compute tokens"
              + (f", {r['planTokens']:,} plan tokens)" if 'planTokens' in r else ")"))
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
