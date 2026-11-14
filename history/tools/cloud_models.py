#!/usr/bin/env python3
"""Model calls through mChatAI's compute-proxy, billed to the signed-in account's compute tokens.

  cloud_models.py ping [<role>]     one tiny call (20 output tokens) to prove the session and the role

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
"""
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


class ModelError(Exception):
    """A call that did not produce an answer. `code` is the proxy's error type where it gave one;
    `tokensUsed` is what the call was charged all the same (an empty reply still thought)."""

    def __init__(self, code, message, status=None, tokens_used=0):
        super().__init__(message)
        self.code = code
        self.status = status
        self.tokensUsed = tokens_used


# ── content ──────────────────────────────────────────────────────────────────

def load_config(path=None):
    path = path or os.environ.get("MCHATAI_CLOUD_WRITER") or CONFIG
    cfg = load_json(path)
    if not cfg or not isinstance(cfg.get("roles"), dict):
        raise SystemExit(f"{path} is missing or has no roles")
    return cfg


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


def build_body(role, system, user, shape, max_output_tokens=None):
    """The OpenAI-style body compute-proxy takes, shaped for the role's model."""
    body = {"model": role["model"],
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "stream": False}
    key = "max_completion_tokens" if shape.get("tokenParameter") == "max_completion_tokens" else "max_tokens"
    body[key] = int(max_output_tokens or role.get("maxOutputTokens") or 2000)
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


# ── the client ───────────────────────────────────────────────────────────────

_402 = {
    "insufficient_tokens": "the signed-in mChatAI account is out of compute tokens. Buy tokens, then rerun: the run "
                           "resumes from its files",
    "sign_in_required": "the session is not a signed-in mChatAI account. Sign in again and write a fresh session file",
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
                 sleep=time.sleep, clock=time.time, proxy_url=None):
        self.cfg = cfg or load_config()
        self.shapes = shapes if shapes is not None else load_shapes()
        self.transport = transport
        self.sleep = sleep
        self.session = session or Session(session_path, transport=transport, clock=clock,
                                          refresh_minutes=self.cfg.get("tokenRefreshMinutes", 50))
        self.proxy_url = (proxy_url or os.environ.get("COMPUTE_PROXY_URL") or self.cfg.get("proxyUrl")
                          or "https://api.mchatai.com").rstrip("/")
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
        body = build_body(r, system, user, shape, max_output_tokens)
        budget = body.get("max_completion_tokens") or body.get("max_tokens")
        data = json.dumps(body).encode("utf-8")
        retry = self.cfg.get("retries") or {}
        tries, waits = int(retry.get("count", 2)), list(retry.get("backoffSeconds") or [5, 20])
        timeout = self.cfg.get("timeoutSeconds", 900)
        url = self.proxy_url + "/v1/chat/completions"
        attempt, refreshed = 0, False
        while True:
            headers = {"content-type": "application/json", "authorization": "Bearer " + self.session.token()}
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
                    raise ModelError(kind, f"compute-proxy refused the call (402 {kind}): "
                                           f"{_402.get(kind, 'the account cannot pay for this call')}", status=402)
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


# ── command line ─────────────────────────────────────────────────────────────

def main(argv):
    if len(argv) >= 2 and argv[1] == "ping":
        role = argv[2] if len(argv) > 2 else "writer"
        client = Client()
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
              f"(finish {r['finishReason']}, {r['tokensUsed']} compute tokens)")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
