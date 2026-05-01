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

@router.get("/emails/unread", response_model=EmailsOutput)
async def fetch_unread(max_results: int = 15):
    """Fetch unread emails via gws gmail +triage."""
    data = run_gws(["gmail", "+triage", "--max", str(max_results)])
    if isinstance(data, list):
        return EmailsOutput(emails=data)
    if isinstance(data, dict) and "messages" in data:
        return EmailsOutput(emails=data["messages"])
    return EmailsOutput(emails=[data] if data else [])


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
