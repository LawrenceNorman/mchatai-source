"""OCR Reader — mChatAI microservice for extracting text from images via Tesseract."""

import base64
import subprocess
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


# ── Models ──

class ExtractB64Input(BaseModel):
    image_b64: str = Field(..., min_length=1)
    language: str = Field(default="eng")

class ExtractFileInput(BaseModel):
    file_path: str = Field(..., min_length=1)
    language: str = Field(default="eng")

class OCROutput(BaseModel):
    text: str
    confidence: float
    language: str

class LanguagesOutput(BaseModel):
    languages: list[str]


# ── Helpers ──

def _ocr_image(image_bytes: bytes, language: str) -> OCROutput:
    try:
        import pytesseract
        from PIL import Image
    except ImportError:
        raise HTTPException(status_code=503, detail="pytesseract or Pillow not installed")

    img = Image.open(BytesIO(image_bytes))
    text = pytesseract.image_to_string(img, lang=language)
    data = pytesseract.image_to_data(img, lang=language, output_type=pytesseract.Output.DICT)

    confidences = [int(c) for c in data["conf"] if int(c) > 0]
    avg_conf = sum(confidences) / len(confidences) if confidences else 0.0

    return OCROutput(text=text.strip(), confidence=round(avg_conf, 1), language=language)


# ── Endpoints ──

@router.post("/extract", response_model=OCROutput)
async def extract_from_b64(body: ExtractB64Input):
    try:
        image_bytes = base64.b64decode(body.image_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data")
    return _ocr_image(image_bytes, body.language)


@router.post("/extract-file", response_model=OCROutput)
async def extract_from_file(body: ExtractFileInput):
    path = Path(body.file_path).expanduser()
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {body.file_path}")
    return _ocr_image(path.read_bytes(), body.language)


@router.get("/languages", response_model=LanguagesOutput)
async def list_languages():
    try:
        result = subprocess.run(
            ["tesseract", "--list-langs"],
            capture_output=True, text=True, timeout=5
        )
        langs = [l.strip() for l in result.stdout.strip().split("\n")[1:] if l.strip()]
        return LanguagesOutput(languages=langs)
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="Tesseract not installed")
