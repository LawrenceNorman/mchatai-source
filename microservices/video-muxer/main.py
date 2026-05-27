"""Video Muxer — headless A/V muxing microservice for the marketing-video pipeline.

Mounts at `/svc/video-muxer/*` inside the mChatAIShell FastAPI sidecar. See
MICROSERVICE.md for the design contract and CONTEXT.md for extension guidance.

Wraps `ffmpeg` to combine a screen recording (MP4) with narration audio (WAV)
into a YouTube-ready MP4. Deliberately small surface: mux + optional fades + gain.
"""

from __future__ import annotations

import json
import shlex
import shutil
import subprocess
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


# --------------------------- Request / response shapes -----------------------


class MuxOptions(BaseModel):
    fade_in_ms: int = Field(default=0, ge=0, le=10_000)
    fade_out_ms: int = Field(default=0, ge=0, le=10_000)
    audio_gain_db: float = Field(default=0.0, ge=-30.0, le=30.0)
    # If true (default), output duration is min(video, audio). False = pad shorter stream.
    shortest: bool = True
    audio_bitrate_kbps: int = Field(default=192, ge=64, le=320)


class MuxRequest(BaseModel):
    video_path: str
    audio_path: str
    output_path: str
    options: MuxOptions = Field(default_factory=MuxOptions)


class MuxResponse(BaseModel):
    status: str
    output_path: str
    duration_sec: float
    video_codec: str
    audio_codec: str
    size_bytes: int


class ProbeRequest(BaseModel):
    path: str


# --------------------------- Helpers ----------------------------------------


def _which_ffmpeg() -> str:
    """Locate the ffmpeg binary; HTTP 503 if missing."""
    binary = shutil.which("ffmpeg")
    if not binary:
        raise HTTPException(
            status_code=503,
            detail="ffmpeg not found on PATH. Install via `brew install ffmpeg` (macOS) or your package manager.",
        )
    return binary


def _which_ffprobe() -> str:
    binary = shutil.which("ffprobe")
    if not binary:
        raise HTTPException(
            status_code=503,
            detail="ffprobe not found on PATH. It ships with ffmpeg.",
        )
    return binary


def _validate_input(path_str: str, kind: str) -> Path:
    """Return a validated absolute path or raise HTTP 400."""
    if not path_str:
        raise HTTPException(status_code=400, detail=f"{kind}_path is required")
    path = Path(path_str).expanduser()
    if not path.is_absolute():
        raise HTTPException(
            status_code=400,
            detail=f"{kind}_path must be absolute, got: {path_str}",
        )
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"{kind}_path not found: {path}")
    if not path.is_file():
        raise HTTPException(
            status_code=400, detail=f"{kind}_path is not a regular file: {path}"
        )
    return path


def _validate_output(path_str: str) -> Path:
    """Return a validated absolute output path; create parent dir if needed."""
    if not path_str:
        raise HTTPException(status_code=400, detail="output_path is required")
    path = Path(path_str).expanduser()
    if not path.is_absolute():
        raise HTTPException(
            status_code=400,
            detail=f"output_path must be absolute, got: {path_str}",
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _build_audio_filter(options: MuxOptions, audio_duration_sec: float) -> Optional[str]:
    """Construct an ffmpeg -af filter chain from options, or None if no filtering needed."""
    parts: list[str] = []
    if options.audio_gain_db != 0.0:
        parts.append(f"volume={options.audio_gain_db:.2f}dB")
    if options.fade_in_ms > 0:
        parts.append(f"afade=t=in:st=0:d={options.fade_in_ms / 1000.0:.3f}")
    if options.fade_out_ms > 0:
        fade_start = max(0.0, audio_duration_sec - options.fade_out_ms / 1000.0)
        parts.append(
            f"afade=t=out:st={fade_start:.3f}:d={options.fade_out_ms / 1000.0:.3f}"
        )
    return ",".join(parts) if parts else None


def _ffprobe_json(path: Path) -> dict:
    """Return ffprobe's JSON output for a media file."""
    ffprobe = _which_ffprobe()
    cmd = [
        ffprobe,
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"ffprobe failed: {result.stderr.strip()[:500]}",
        )
    return json.loads(result.stdout)


def _duration_sec(probe: dict) -> float:
    try:
        return float(probe.get("format", {}).get("duration", 0.0))
    except (TypeError, ValueError):
        return 0.0


def _codec_of_type(probe: dict, codec_type: str) -> str:
    for stream in probe.get("streams", []):
        if stream.get("codec_type") == codec_type:
            return str(stream.get("codec_name", "unknown"))
    return "none"


# --------------------------- Endpoints --------------------------------------


@router.get("/healthz")
def healthz() -> dict:
    return {"status": "ok", "service": "video-muxer"}


@router.get("/info")
def info() -> dict:
    ffmpeg = shutil.which("ffmpeg")
    version = "unavailable"
    if ffmpeg:
        try:
            out = subprocess.run(
                [ffmpeg, "-version"], capture_output=True, text=True, timeout=5
            )
            version = out.stdout.splitlines()[0] if out.stdout else "unknown"
        except (subprocess.TimeoutExpired, OSError):
            version = "probe-failed"
    return {
        "service": "video-muxer",
        "version": "0.1.0",
        "ffmpeg_available": bool(ffmpeg),
        "ffmpeg_version": version,
        "default_options": MuxOptions().model_dump(),
        "supported_features": [
            "h264-copy-passthrough",
            "aac-audio-reencode",
            "afade-in",
            "afade-out",
            "volume-gain",
            "shortest-truncation",
        ],
    }


@router.post("/probe", response_model=dict)
def probe(req: ProbeRequest) -> dict:
    path = _validate_input(req.path, "media")
    return _ffprobe_json(path)


@router.post("/mux", response_model=MuxResponse)
def mux(req: MuxRequest) -> MuxResponse:
    ffmpeg = _which_ffmpeg()

    video = _validate_input(req.video_path, "video")
    audio = _validate_input(req.audio_path, "audio")
    output = _validate_output(req.output_path)

    # Probe audio so we know how long it actually is (needed for fade-out timing).
    audio_probe = _ffprobe_json(audio)
    audio_duration = _duration_sec(audio_probe)

    af = _build_audio_filter(req.options, audio_duration)

    cmd: list[str] = [
        ffmpeg,
        "-y",  # overwrite output
        "-loglevel",
        "error",
        "-i",
        str(video),
        "-i",
        str(audio),
        # Video: copy stream (no re-encode → fast, lossless).
        "-c:v",
        "copy",
        # Audio: re-encode to AAC for broad YouTube/iOS compatibility.
        "-c:a",
        "aac",
        "-b:a",
        f"{req.options.audio_bitrate_kbps}k",
        # Map first video stream from input 0, first audio stream from input 1.
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
    ]
    if af:
        cmd.extend(["-af", af])
    if req.options.shortest:
        cmd.append("-shortest")
    # Ensure faststart so YouTube can begin playback before full download.
    cmd.extend(["-movflags", "+faststart"])
    cmd.append(str(output))

    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=(
                f"ffmpeg failed (exit {result.returncode}). "
                f"Command: {shlex.join(cmd)}\n"
                f"Stderr: {result.stderr.strip()[:1000]}"
            ),
        )

    out_probe = _ffprobe_json(output)
    return MuxResponse(
        status="ok",
        output_path=str(output),
        duration_sec=_duration_sec(out_probe),
        video_codec=_codec_of_type(out_probe, "video"),
        audio_codec=_codec_of_type(out_probe, "audio"),
        size_bytes=output.stat().st_size,
    )
