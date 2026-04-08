"""Google Drive Manager — mChatAI microservice wrapping gws CLI (v0.22+)."""

import json
import subprocess
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


# ── Models ──

class FilesOutput(BaseModel):
    files: List[Dict[str, Any]]

class OperationOutput(BaseModel):
    success: bool
    message: str


# ── Helpers ──

def run_gws(args: List[str], timeout: int = 30) -> Any:
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
        return {}
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="gws CLI not installed")


# ── Endpoints ──

@router.get("/files", response_model=FilesOutput)
async def list_files(page_size: int = 15):
    """List recently modified files."""
    params = {"pageSize": page_size, "orderBy": "modifiedTime desc",
              "fields": "files(id,name,mimeType,modifiedTime,owners,size)"}
    data = run_gws(["drive", "files", "list", "--params", json.dumps(params)])
    files = data.get("files", []) if isinstance(data, dict) else data if isinstance(data, list) else []
    return FilesOutput(files=files)


@router.get("/files/search", response_model=FilesOutput)
async def search_files(query: str, page_size: int = 10):
    """Search for files by name or content."""
    params = {"q": query, "pageSize": page_size,
              "fields": "files(id,name,mimeType,modifiedTime,owners)"}
    data = run_gws(["drive", "files", "list", "--params", json.dumps(params)])
    files = data.get("files", []) if isinstance(data, dict) else data if isinstance(data, list) else []
    return FilesOutput(files=files)


@router.get("/files/{file_id}")
async def get_file_info(file_id: str):
    """Get metadata for a specific file."""
    params = {"fileId": file_id, "fields": "id,name,mimeType,modifiedTime,owners,size,webViewLink"}
    data = run_gws(["drive", "files", "get", "--params", json.dumps(params)])
    return data


@router.get("/files/shared", response_model=FilesOutput)
async def shared_with_me(page_size: int = 10):
    """List files shared with the user."""
    params = {"q": "sharedWithMe=true", "pageSize": page_size,
              "fields": "files(id,name,mimeType,modifiedTime,owners)"}
    data = run_gws(["drive", "files", "list", "--params", json.dumps(params)])
    files = data.get("files", []) if isinstance(data, dict) else []
    return FilesOutput(files=files)


@router.post("/files/upload", response_model=OperationOutput)
async def upload_file(local_path: str, name: Optional[str] = None):
    """Upload a local file to Drive via +upload helper."""
    args = ["drive", "+upload", local_path]
    if name:
        args.extend(["--name", name])
    output = run_gws(args)
    return OperationOutput(success=True, message=str(output)[:200])
