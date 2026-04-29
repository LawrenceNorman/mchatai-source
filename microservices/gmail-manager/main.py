"""Gmail Manager — mChatAI microservice wrapping gws CLI (v0.22+)."""

import json
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
    """Resolve the gws binary on PATH, returning None if not installed."""
    return shutil.which("gws")


def run_gws_raw(args: List[str], timeout: int = 30) -> Tuple[int, str, str]:
    """Run a gws CLI command and return (returncode, stdout, stderr).

    Raises FileNotFoundError if gws is missing — callers decide how to surface that.
    """
    cmd = ["gws"] + args + ["--format=json"]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=timeout)
    return result.returncode, result.stdout.strip(), result.stderr.strip()


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
    """
    if gws_path() is None:
        return AuthStatus(gws_installed=False, authenticated=False, error="gws CLI not installed")

    try:
        rc, stdout, stderr = run_gws_raw(["auth", "status"], timeout=15)
    except FileNotFoundError:
        return AuthStatus(gws_installed=False, authenticated=False, error="gws CLI not installed")
    except subprocess.TimeoutExpired:
        return AuthStatus(gws_installed=True, authenticated=False, error="gws auth status timed out")

    if rc != 0:
        # gws is installed but no session (or other error). Treat as not authenticated.
        msg = (stderr or stdout)[:300]
        return AuthStatus(gws_installed=True, authenticated=False, error=msg or None)

    if not stdout:
        return AuthStatus(gws_installed=True, authenticated=False)

    try:
        parsed = json.loads(stdout)
    except json.JSONDecodeError:
        return AuthStatus(gws_installed=True, authenticated=False, error="Could not parse gws auth status output")

    token_valid = bool(parsed.get("token_valid", False))
    account = parsed.get("account")
    services = parsed.get("services", []) or []
    return AuthStatus(
        gws_installed=True,
        authenticated=token_valid and bool(account),
        account=account,
        token_valid=token_valid,
        services=services if isinstance(services, list) else [],
    )


@router.post("/auth/login", response_model=AuthStatus)
async def auth_login(body: Optional[AuthLoginInput] = None):
    """Run interactive `gws auth login`. Blocks until user completes browser consent.

    Long-running — Mac client should use a 5-minute timeout for this call.
    Returns the post-login auth status.
    """
    if gws_path() is None:
        raise HTTPException(status_code=503, detail="gws CLI not installed. Install: brew install gws")

    payload = body or AuthLoginInput()
    args: List[str] = ["auth", "login"]
    if payload.readonly:
        args.append("--readonly")
    if payload.services:
        args.extend(["--services", ",".join(payload.services)])

    try:
        rc, _stdout, stderr = run_gws_raw(args, timeout=300)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="gws auth login timed out after 5 minutes")
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="gws CLI not installed")

    if rc != 0:
        raise HTTPException(status_code=500, detail=f"gws auth login failed: {(stderr or '')[:300]}")

    return await auth_status()


@router.post("/auth/logout", response_model=OperationOutput)
async def auth_logout():
    """Clear the local gws session."""
    if gws_path() is None:
        raise HTTPException(status_code=503, detail="gws CLI not installed")
    try:
        rc, _stdout, stderr = run_gws_raw(["auth", "logout"], timeout=15)
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
