"""qz-media-processing — FFmpeg-based audio/video processing (0 tokens, pure compute)."""

import os
import re
import base64
import logging
import tempfile
import subprocess
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()
logger = logging.getLogger(__name__)


def _check_ffmpeg():
    """Verify FFmpeg is available."""
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


FFMPEG_AVAILABLE = _check_ffmpeg()


# ── Models ──

class SpliceAudioInput(BaseModel):
    audio_segments_base64: list[str] = Field(..., min_length=1)
    format: str = Field(default="mp3")

class SpliceAudioOutput(BaseModel):
    audio_base64: str
    format: str = "mp3"
    duration_seconds: float = 0.0

class NormalizeAudioInput(BaseModel):
    audio_base64: str
    target_db: float = Field(default=-20.0, ge=-40.0, le=0.0)
    format: str = Field(default="mp3")

class NormalizeAudioOutput(BaseModel):
    audio_base64: str
    format: str = "mp3"

class AttachAudioInput(BaseModel):
    video_base64: str
    audio_base64: str
    video_format: str = Field(default="mp4")
    audio_format: str = Field(default="mp3")

class AttachAudioOutput(BaseModel):
    video_base64: str
    format: str = "mp4"

class AddTextOverlayInput(BaseModel):
    video_base64: str
    text_segments: list[dict] = Field(
        ...,
        description="List of {text, start_seconds, end_seconds, position, font_size}"
    )
    video_format: str = Field(default="mp4")

class AddTextOverlayOutput(BaseModel):
    video_base64: str
    format: str = "mp4"

class SplitTextInput(BaseModel):
    text: str = Field(..., min_length=1)
    max_tokens: int = Field(default=2048, ge=100, le=8192)
    model: str = Field(default="gpt-4o-mini")

class SplitTextOutput(BaseModel):
    chunks: list[str]
    count: int

class AudioInfoInput(BaseModel):
    audio_base64: str
    format: str = Field(default="mp3")

class AudioInfoOutput(BaseModel):
    duration_seconds: float
    sample_rate: int = 0
    channels: int = 0
    format: str = ""


# ── Helpers ──

def _require_ffmpeg():
    if not FFMPEG_AVAILABLE:
        raise HTTPException(status_code=503, detail="FFmpeg is not available on this instance")


def _write_temp(data: bytes, suffix: str) -> Path:
    f = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    f.write(data)
    f.close()
    return Path(f.name)


def _read_and_cleanup(path: Path) -> bytes:
    data = path.read_bytes()
    path.unlink(missing_ok=True)
    return data


def _get_duration(path: Path) -> float:
    """Get audio/video duration using ffprobe."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
            capture_output=True, text=True, check=True,
        )
        return float(result.stdout.strip())
    except Exception:
        return 0.0


# ── Endpoints ──

@router.post("/splice-audio", response_model=SpliceAudioOutput)
async def splice_audio(body: SpliceAudioInput):
    """Concatenate multiple audio segments into one file."""
    _require_ffmpeg()
    logger.info(f"Splicing {len(body.audio_segments_base64)} audio segments")

    temp_files = []
    try:
        # Write each segment to a temp file
        for i, seg_b64 in enumerate(body.audio_segments_base64):
            seg_bytes = base64.b64decode(seg_b64)
            path = _write_temp(seg_bytes, f".{body.format}")
            temp_files.append(path)

        # Create concat list file
        list_file = _write_temp(
            "\n".join(f"file '{p}'" for p in temp_files).encode(),
            ".txt"
        )

        output_path = Path(tempfile.mktemp(suffix=f".{body.format}"))

        subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(list_file),
             "-c", "copy", str(output_path)],
            capture_output=True, check=True,
        )

        duration = _get_duration(output_path)
        result_bytes = _read_and_cleanup(output_path)
        list_file.unlink(missing_ok=True)

        return SpliceAudioOutput(
            audio_base64=base64.b64encode(result_bytes).decode("utf-8"),
            format=body.format,
            duration_seconds=round(duration, 2),
        )
    finally:
        for f in temp_files:
            f.unlink(missing_ok=True)


@router.post("/normalize-audio", response_model=NormalizeAudioOutput)
async def normalize_audio(body: NormalizeAudioInput):
    """Normalize audio levels to a target dB using FFmpeg loudnorm."""
    _require_ffmpeg()
    logger.info(f"Normalizing audio to {body.target_db}dB")

    audio_bytes = base64.b64decode(body.audio_base64)
    input_path = _write_temp(audio_bytes, f".{body.format}")
    output_path = Path(tempfile.mktemp(suffix=f".{body.format}"))

    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(input_path),
             "-af", f"loudnorm=I={body.target_db}:TP=-1.5:LRA=11",
             str(output_path)],
            capture_output=True, check=True,
        )

        result_bytes = _read_and_cleanup(output_path)
        return NormalizeAudioOutput(
            audio_base64=base64.b64encode(result_bytes).decode("utf-8"),
            format=body.format,
        )
    finally:
        input_path.unlink(missing_ok=True)


@router.post("/attach-audio", response_model=AttachAudioOutput)
async def attach_audio(body: AttachAudioInput):
    """Combine audio and video into a single file."""
    _require_ffmpeg()
    logger.info("Attaching audio to video")

    video_bytes = base64.b64decode(body.video_base64)
    audio_bytes = base64.b64decode(body.audio_base64)
    video_path = _write_temp(video_bytes, f".{body.video_format}")
    audio_path = _write_temp(audio_bytes, f".{body.audio_format}")
    output_path = Path(tempfile.mktemp(suffix=f".{body.video_format}"))

    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(video_path), "-i", str(audio_path),
             "-c:v", "copy", "-c:a", "aac", "-shortest", str(output_path)],
            capture_output=True, check=True,
        )

        result_bytes = _read_and_cleanup(output_path)
        return AttachAudioOutput(
            video_base64=base64.b64encode(result_bytes).decode("utf-8"),
            format=body.video_format,
        )
    finally:
        video_path.unlink(missing_ok=True)
        audio_path.unlink(missing_ok=True)


@router.post("/add-text-overlays", response_model=AddTextOverlayOutput)
async def add_text_overlays(body: AddTextOverlayInput):
    """Add text overlays to a video using FFmpeg drawtext filter."""
    _require_ffmpeg()
    logger.info(f"Adding {len(body.text_segments)} text overlays")

    video_bytes = base64.b64decode(body.video_base64)
    video_path = _write_temp(video_bytes, f".{body.video_format}")
    output_path = Path(tempfile.mktemp(suffix=f".{body.video_format}"))

    try:
        # Build drawtext filter chain
        filters = []
        for seg in body.text_segments:
            text = seg.get("text", "").replace("'", "\\'").replace(":", "\\:")
            start = seg.get("start_seconds", 0)
            end = seg.get("end_seconds", start + 3)
            font_size = seg.get("font_size", 24)
            position = seg.get("position", "center")

            if position == "center":
                x, y = "(w-text_w)/2", "(h-text_h)/2"
            elif position == "bottom_center":
                x, y = "(w-text_w)/2", "h-text_h-40"
            elif position == "top_center":
                x, y = "(w-text_w)/2", "40"
            else:
                x, y = "(w-text_w)/2", "(h-text_h)/2"

            filters.append(
                f"drawtext=text='{text}':fontsize={font_size}:fontcolor=white"
                f":x={x}:y={y}:enable='between(t,{start},{end})'"
                f":borderw=2:bordercolor=black"
            )

        filter_str = ",".join(filters) if filters else "null"

        subprocess.run(
            ["ffmpeg", "-y", "-i", str(video_path),
             "-vf", filter_str, "-c:a", "copy", str(output_path)],
            capture_output=True, check=True,
        )

        result_bytes = _read_and_cleanup(output_path)
        return AddTextOverlayOutput(
            video_base64=base64.b64encode(result_bytes).decode("utf-8"),
            format=body.video_format,
        )
    finally:
        video_path.unlink(missing_ok=True)


@router.post("/split-text", response_model=SplitTextOutput)
async def split_text(body: SplitTextInput):
    """Split text into token-bounded chunks using tiktoken."""
    try:
        import tiktoken
        try:
            encoding = tiktoken.encoding_for_model(body.model)
        except KeyError:
            encoding = tiktoken.get_encoding("cl100k_base")

        tokens = encoding.encode(body.text)
        chunks = []
        for start in range(0, len(tokens), body.max_tokens):
            chunk_tokens = tokens[start:start + body.max_tokens]
            chunks.append(encoding.decode(chunk_tokens))

    except ImportError:
        # Fallback: split by character count estimate (~4 chars/token)
        max_chars = body.max_tokens * 4
        chunks = [body.text[i:i + max_chars] for i in range(0, len(body.text), max_chars)]

    return SplitTextOutput(chunks=chunks, count=len(chunks))


@router.post("/audio-info", response_model=AudioInfoOutput)
async def audio_info(body: AudioInfoInput):
    """Get audio file information (duration, sample rate, channels)."""
    _require_ffmpeg()

    audio_bytes = base64.b64decode(body.audio_base64)
    audio_path = _write_temp(audio_bytes, f".{body.format}")

    try:
        duration = _get_duration(audio_path)

        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries",
             "stream=sample_rate,channels", "-of", "json", str(audio_path)],
            capture_output=True, text=True,
        )

        info = {}
        if result.returncode == 0:
            import json
            data = json.loads(result.stdout)
            streams = data.get("streams", [{}])
            if streams:
                info = streams[0]

        return AudioInfoOutput(
            duration_seconds=round(duration, 2),
            sample_rate=int(info.get("sample_rate", 0)),
            channels=int(info.get("channels", 0)),
            format=body.format,
        )
    finally:
        audio_path.unlink(missing_ok=True)
