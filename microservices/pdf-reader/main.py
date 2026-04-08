"""PDF Reader — mChatAI microservice for extracting text and metadata from PDFs."""

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


# ── Models ──

class FileInput(BaseModel):
    file_path: str = Field(..., min_length=1)

class PageInput(BaseModel):
    file_path: str = Field(..., min_length=1)
    page: int = Field(..., ge=0)

class ExtractOutput(BaseModel):
    text: str
    pages: int
    characters: int

class MetadataOutput(BaseModel):
    title: str
    author: str
    pages: int
    creator: str
    producer: str

class PageOutput(BaseModel):
    text: str
    page: int
    total_pages: int


# ── Helpers ──

def _open_pdf(file_path: str):
    try:
        from PyPDF2 import PdfReader
    except ImportError:
        raise HTTPException(status_code=503, detail="PyPDF2 not installed")

    path = Path(file_path).expanduser()
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")
    return PdfReader(str(path))


# ── Endpoints ──

@router.post("/extract", response_model=ExtractOutput)
async def extract_text(body: FileInput):
    reader = _open_pdf(body.file_path)
    text = "\n\n".join(page.extract_text() or "" for page in reader.pages)
    return ExtractOutput(text=text, pages=len(reader.pages), characters=len(text))


@router.post("/metadata", response_model=MetadataOutput)
async def get_metadata(body: FileInput):
    reader = _open_pdf(body.file_path)
    meta = reader.metadata or {}
    return MetadataOutput(
        title=getattr(meta, "title", "") or "",
        author=getattr(meta, "author", "") or "",
        pages=len(reader.pages),
        creator=getattr(meta, "creator", "") or "",
        producer=getattr(meta, "producer", "") or "",
    )


@router.post("/page", response_model=PageOutput)
async def get_page(body: PageInput):
    reader = _open_pdf(body.file_path)
    if body.page >= len(reader.pages):
        raise HTTPException(status_code=400, detail=f"Page {body.page} out of range (0-{len(reader.pages)-1})")
    text = reader.pages[body.page].extract_text() or ""
    return PageOutput(text=text, page=body.page, total_pages=len(reader.pages))
