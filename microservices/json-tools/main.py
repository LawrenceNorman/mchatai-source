"""JSON Tools — mChatAI microservice for JSON validation, formatting, querying, and diffing."""

import json
import re
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


# ── Models ──

class ValidateInput(BaseModel):
    json_string: str = Field(..., min_length=1)

class ValidateOutput(BaseModel):
    valid: bool
    error: str | None
    parsed_type: str | None

class FormatInput(BaseModel):
    json_string: str = Field(..., min_length=1)
    minify: bool = False
    indent: int = Field(default=2, ge=1, le=8)

class FormatOutput(BaseModel):
    result: str

class QueryInput(BaseModel):
    data: Any
    path: str = Field(..., min_length=1)

class QueryOutput(BaseModel):
    result: Any
    type: str

class DiffChange(BaseModel):
    path: str
    from_val: Any = Field(alias="from")
    to_val: Any = Field(alias="to")

    model_config = {"populate_by_name": True}

class DiffInput(BaseModel):
    a: Any
    b: Any

class DiffOutput(BaseModel):
    added: list[str]
    removed: list[str]
    changed: list[dict[str, Any]]


# ── Helpers ──

def _resolve_path(data: Any, path: str) -> Any:
    """Resolve a dot-path like 'users[0].name' against data."""
    parts = re.split(r'\.|\[(\d+)\]', path)
    parts = [p for p in parts if p is not None and p != ""]
    current = data
    for part in parts:
        if isinstance(current, list):
            idx = int(part)
            if idx >= len(current):
                raise IndexError(f"Index {idx} out of range")
            current = current[idx]
        elif isinstance(current, dict):
            if part not in current:
                raise KeyError(f"Key '{part}' not found")
            current = current[part]
        else:
            raise TypeError(f"Cannot index into {type(current).__name__}")
    return current


def _diff_objects(a: dict, b: dict) -> DiffOutput:
    a_keys = set(a.keys()) if isinstance(a, dict) else set()
    b_keys = set(b.keys()) if isinstance(b, dict) else set()
    added = sorted(b_keys - a_keys)
    removed = sorted(a_keys - b_keys)
    changed = []
    for key in sorted(a_keys & b_keys):
        if a[key] != b[key]:
            changed.append({"path": key, "from": a[key], "to": b[key]})
    return DiffOutput(added=added, removed=removed, changed=changed)


# ── Endpoints ──

@router.post("/validate", response_model=ValidateOutput)
async def validate_json(body: ValidateInput):
    try:
        parsed = json.loads(body.json_string)
        return ValidateOutput(valid=True, error=None, parsed_type=type(parsed).__name__)
    except json.JSONDecodeError as e:
        return ValidateOutput(valid=False, error=str(e), parsed_type=None)


@router.post("/format", response_model=FormatOutput)
async def format_json(body: FormatInput):
    try:
        parsed = json.loads(body.json_string)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {e}")
    if body.minify:
        result = json.dumps(parsed, separators=(",", ":"), ensure_ascii=False)
    else:
        result = json.dumps(parsed, indent=body.indent, ensure_ascii=False)
    return FormatOutput(result=result)


@router.post("/query", response_model=QueryOutput)
async def query_json(body: QueryInput):
    try:
        result = _resolve_path(body.data, body.path)
        return QueryOutput(result=result, type=type(result).__name__)
    except (KeyError, IndexError, TypeError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/diff", response_model=DiffOutput)
async def diff_json(body: DiffInput):
    if not isinstance(body.a, dict) or not isinstance(body.b, dict):
        raise HTTPException(status_code=400, detail="Both inputs must be JSON objects")
    return _diff_objects(body.a, body.b)
