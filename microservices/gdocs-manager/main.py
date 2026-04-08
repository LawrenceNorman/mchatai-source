"""Google Docs Manager — mChatAI microservice for Google Workspace CLI (gws)."""

import json
import subprocess
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


# ── Models ──

class DocsOutput(BaseModel):
    documents: List[Dict[str, Any]]

class DocContentOutput(BaseModel):
    content: str
    title: str = ""
    doc_id: str = ""

class CreateDocInput(BaseModel):
    title: str = Field(..., description="Document title")
    content: Optional[str] = Field(None, description="Initial content (plain text or markdown)")
    folder_id: Optional[str] = None

class AppendDocInput(BaseModel):
    doc_id: str = Field(..., description="Google Doc ID")
    content: str = Field(..., description="Content to append")

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

@router.get("/documents", response_model=DocsOutput)
async def list_documents(max_results: int = 20):
    """List recent Google Docs."""
    args = ["docs", "list", "--limit", str(max_results)]
    data = run_gws_command(args)
    if not isinstance(data, list):
        data = [data] if data else []
    return DocsOutput(documents=data)


@router.get("/documents/{doc_id}", response_model=DocContentOutput)
async def get_document(doc_id: str):
    """Get the content of a Google Doc."""
    data = run_gws_command(["docs", "get", doc_id])
    if isinstance(data, dict):
        return DocContentOutput(
            content=data.get("body", data.get("content", str(data))),
            title=data.get("title", ""),
            doc_id=doc_id,
        )
    return DocContentOutput(content=str(data), doc_id=doc_id)


@router.post("/documents/create", response_model=OperationOutput)
async def create_document(body: CreateDocInput):
    """Create a new Google Doc."""
    args = ["docs", "create", body.title]
    if body.content:
        args.extend(["--content", body.content])
    if body.folder_id:
        args.extend(["--parent", body.folder_id])
    output = run_gws_command(args, parse_json=False)
    return OperationOutput(success=True, message=str(output))


@router.post("/documents/append", response_model=OperationOutput)
async def append_to_document(body: AppendDocInput):
    """Append content to an existing Google Doc."""
    args = ["docs", "append", body.doc_id, "--content", body.content]
    output = run_gws_command(args, parse_json=False)
    return OperationOutput(success=True, message=str(output))
