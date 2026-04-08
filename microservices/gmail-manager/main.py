"""Gmail Manager — mChatAI microservice wrapping gws CLI (v0.22+)."""

import json
import subprocess
from typing import Any, Dict, List

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


# ── Helpers ──

def run_gws(args: List[str], timeout: int = 30) -> Any:
    """Run a gws CLI command and return parsed JSON."""
    cmd = ["gws"] + args + ["--format=json"]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=timeout)
        if result.returncode != 0:
            error = result.stderr.strip() or result.stdout.strip()
            raise HTTPException(status_code=500, detail=f"gws failed: {error[:300]}")
        stdout = result.stdout.strip()
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
