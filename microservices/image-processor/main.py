"""Image Processor — mChatAI microservice for image manipulation."""

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


# ── Models ──

class FileInput(BaseModel):
    file_path: str = Field(..., min_length=1)

class InfoOutput(BaseModel):
    width: int
    height: int
    format: str
    mode: str
    file_size_bytes: int

class ResizeInput(BaseModel):
    file_path: str = Field(..., min_length=1)
    width: int = Field(..., gt=0, le=10000)
    height: int = Field(..., gt=0, le=10000)
    output_path: str = Field(..., min_length=1)

class ResizeOutput(BaseModel):
    output_path: str
    width: int
    height: int

class ConvertInput(BaseModel):
    file_path: str = Field(..., min_length=1)
    format: str = Field(..., min_length=1)
    output_path: str = Field(..., min_length=1)

class ConvertOutput(BaseModel):
    output_path: str
    format: str

class ThumbnailInput(BaseModel):
    file_path: str = Field(..., min_length=1)
    max_size: int = Field(default=256, gt=0, le=4096)
    output_path: str = Field(..., min_length=1)

class ThumbnailOutput(BaseModel):
    output_path: str
    width: int
    height: int


# ── Helpers ──

def _open_image(file_path: str):
    try:
        from PIL import Image
    except ImportError:
        raise HTTPException(status_code=503, detail="Pillow not installed")
    path = Path(file_path).expanduser()
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")
    return Image.open(str(path))


# ── Endpoints ──

@router.post("/info", response_model=InfoOutput)
async def image_info(body: FileInput):
    img = _open_image(body.file_path)
    path = Path(body.file_path).expanduser()
    return InfoOutput(
        width=img.width, height=img.height,
        format=img.format or "UNKNOWN", mode=img.mode,
        file_size_bytes=path.stat().st_size,
    )


@router.post("/resize", response_model=ResizeOutput)
async def resize_image(body: ResizeInput):
    from PIL import Image
    img = _open_image(body.file_path)
    resized = img.resize((body.width, body.height), Image.LANCZOS)
    out = Path(body.output_path).expanduser()
    resized.save(str(out))
    return ResizeOutput(output_path=str(out), width=body.width, height=body.height)


@router.post("/convert", response_model=ConvertOutput)
async def convert_image(body: ConvertInput):
    img = _open_image(body.file_path)
    if img.mode == "RGBA" and body.format.upper() in ("JPEG", "JPG"):
        img = img.convert("RGB")
    out = Path(body.output_path).expanduser()
    img.save(str(out), format=body.format.upper())
    return ConvertOutput(output_path=str(out), format=body.format.upper())


@router.post("/thumbnail", response_model=ThumbnailOutput)
async def make_thumbnail(body: ThumbnailInput):
    img = _open_image(body.file_path)
    img.thumbnail((body.max_size, body.max_size))
    out = Path(body.output_path).expanduser()
    img.save(str(out))
    return ThumbnailOutput(output_path=str(out), width=img.width, height=img.height)
