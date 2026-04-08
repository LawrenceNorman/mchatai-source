"""Google Contacts Manager — mChatAI microservice for Google Workspace CLI (gws)."""

import json
import subprocess
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


# ── Models ──

class ContactsOutput(BaseModel):
    contacts: List[Dict[str, Any]]

class CreateContactInput(BaseModel):
    name: str = Field(..., description="Contact full name")
    email: Optional[str] = None
    phone: Optional[str] = None
    organization: Optional[str] = None
    notes: Optional[str] = None

class OperationOutput(BaseModel):
    success: bool
    message: str


# ── Helpers ──

def run_gws_command(args: List[str], parse_json: bool = True) -> Any:
    cmd = ["gws"] + args
    if parse_json:
        cmd.append("--format=json")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            error_msg = result.stderr.strip() or result.stdout.strip()
            raise HTTPException(status_code=500, detail=f"gws command failed: {error_msg}")
        stdout = result.stdout.strip()
        if parse_json and stdout:
            try:
                return json.loads(stdout)
            except json.JSONDecodeError:
                return [{"raw": line} for line in stdout.split("\n") if line]
        return stdout
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="gws CLI not installed")


# ── Endpoints ──

@router.get("/contacts", response_model=ContactsOutput)
async def list_contacts(max_results: int = 50, query: Optional[str] = None):
    """List Google Contacts."""
    args = ["contacts", "list", "--limit", str(max_results)]
    if query:
        args.extend(["--query", query])
    data = run_gws_command(args)
    if not isinstance(data, list):
        data = [data] if data else []
    return ContactsOutput(contacts=data)


@router.post("/contacts/search", response_model=ContactsOutput)
async def search_contacts(query: str, max_results: int = 20):
    """Search contacts by name or email."""
    args = ["contacts", "list", "--query", query, "--limit", str(max_results)]
    data = run_gws_command(args)
    if not isinstance(data, list):
        data = [data] if data else []
    return ContactsOutput(contacts=data)


@router.post("/contacts/create", response_model=OperationOutput)
async def create_contact(body: CreateContactInput):
    """Create a new contact."""
    args = ["contacts", "create", body.name]
    if body.email:
        args.extend(["--email", body.email])
    if body.phone:
        args.extend(["--phone", body.phone])
    if body.organization:
        args.extend(["--organization", body.organization])
    output = run_gws_command(args, parse_json=False)
    return OperationOutput(success=True, message=str(output))


@router.post("/contacts/delete", response_model=OperationOutput)
async def delete_contact(contact_id: str):
    """Delete a contact by ID."""
    output = run_gws_command(["contacts", "delete", contact_id], parse_json=False)
    return OperationOutput(success=True, message=str(output))
