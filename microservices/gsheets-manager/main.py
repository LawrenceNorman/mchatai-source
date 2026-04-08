"""Google Sheets Manager — mChatAI microservice wrapping gws CLI (v0.22+)."""

import json
import subprocess
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


# ── Models ──

class SheetDataOutput(BaseModel):
    values: List[List[str]]
    spreadsheet_id: str = ""

class ReadRangeInput(BaseModel):
    spreadsheet_id: str = Field(..., description="Spreadsheet ID")
    range: str = Field(..., description="A1 notation (e.g., 'Sheet1!A1:C10')")

class WriteRangeInput(BaseModel):
    spreadsheet_id: str
    range: str
    values: List[List[str]]

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

@router.post("/read", response_model=SheetDataOutput)
async def read_range(body: ReadRangeInput):
    """Read values from a spreadsheet range."""
    params = {"spreadsheetId": body.spreadsheet_id, "range": body.range}
    data = run_gws(["sheets", "spreadsheets.values", "get", "--params", json.dumps(params)])
    values = data.get("values", []) if isinstance(data, dict) else []
    return SheetDataOutput(values=values, spreadsheet_id=body.spreadsheet_id)


@router.post("/write", response_model=OperationOutput)
async def write_range(body: WriteRangeInput):
    """Write values to a spreadsheet range."""
    params = {"spreadsheetId": body.spreadsheet_id, "range": body.range, "valueInputOption": "USER_ENTERED"}
    req_body = {"values": body.values}
    output = run_gws(["sheets", "spreadsheets.values", "update", "--params", json.dumps(params), "--json", json.dumps(req_body)])
    return OperationOutput(success=True, message=str(output)[:200])


@router.get("/spreadsheet/{spreadsheet_id}")
async def get_spreadsheet(spreadsheet_id: str):
    """Get spreadsheet metadata (sheet names, etc.)."""
    params = {"spreadsheetId": spreadsheet_id}
    return run_gws(["sheets", "spreadsheets", "get", "--params", json.dumps(params)])
