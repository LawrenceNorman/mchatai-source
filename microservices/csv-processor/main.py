"""CSV Processor — mChatAI microservice for parsing and analyzing CSV data."""

import csv
import json
from io import StringIO
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


# ── Models ──

class FileInput(BaseModel):
    file_path: str = Field(..., min_length=1)

class ParseInput(BaseModel):
    file_path: str = Field(..., min_length=1)
    limit: int = Field(default=100, ge=1, le=10000)

class ParseOutput(BaseModel):
    columns: list[str]
    rows: list[dict[str, str]]
    total_rows: int

class SummaryOutput(BaseModel):
    columns: list[str]
    row_count: int
    file_size_bytes: int

class QueryInput(BaseModel):
    file_path: str = Field(..., min_length=1)
    column: str = Field(..., min_length=1)
    value: str

class QueryOutput(BaseModel):
    matches: list[dict[str, str]]
    count: int

class ConvertInput(BaseModel):
    file_path: str = Field(..., min_length=1)
    output_path: str = Field(..., min_length=1)

class ConvertOutput(BaseModel):
    output_path: str
    row_count: int


# ── Helpers ──

def _read_csv(file_path: str) -> tuple[list[str], list[dict[str, str]]]:
    path = Path(file_path).expanduser()
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")
    text = path.read_text(encoding="utf-8", errors="replace")
    reader = csv.DictReader(StringIO(text))
    columns = reader.fieldnames or []
    rows = list(reader)
    return columns, rows


# ── Endpoints ──

@router.post("/parse", response_model=ParseOutput)
async def parse_csv(body: ParseInput):
    columns, rows = _read_csv(body.file_path)
    return ParseOutput(columns=columns, rows=rows[:body.limit], total_rows=len(rows))


@router.post("/summary", response_model=SummaryOutput)
async def csv_summary(body: FileInput):
    path = Path(body.file_path).expanduser()
    columns, rows = _read_csv(body.file_path)
    return SummaryOutput(
        columns=columns, row_count=len(rows), file_size_bytes=path.stat().st_size
    )


@router.post("/query", response_model=QueryOutput)
async def query_csv(body: QueryInput):
    columns, rows = _read_csv(body.file_path)
    if body.column not in columns:
        raise HTTPException(status_code=400, detail=f"Column '{body.column}' not found. Available: {columns}")
    matches = [r for r in rows if r.get(body.column) == body.value]
    return QueryOutput(matches=matches, count=len(matches))


@router.post("/to-json", response_model=ConvertOutput)
async def csv_to_json(body: ConvertInput):
    _, rows = _read_csv(body.file_path)
    out = Path(body.output_path).expanduser()
    out.write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")
    return ConvertOutput(output_path=str(out), row_count=len(rows))
