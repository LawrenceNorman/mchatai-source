"""qz-podcast — Podcast script generation, smoothing, TTS, and text segment timing."""

import re
import json
import logging
import base64

from fastapi import APIRouter
from pydantic import BaseModel, Field

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "qz-shared"))
from llm_client import llm_chat, llm_chat_json, tts_generate

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Models ──

class GenerateScriptInput(BaseModel):
    title: str = Field(default="")
    subject: str = Field(default="")
    topics: list[str] = Field(default=[])
    content: str = Field(default="", description="Raw quiz/learning content to convert to podcast script")
    important_info: str = Field(default="")
    job_id: str = Field(default="")

class GenerateScriptOutput(BaseModel):
    script: str
    estimated_duration_seconds: int

class SmoothScriptInput(BaseModel):
    script: str = Field(..., min_length=1)
    job_id: str = Field(default="")

class SmoothScriptOutput(BaseModel):
    script: str

class TextToSpeechInput(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)
    voice: str = Field(default="alloy", description="Voice: alloy, onyx, nova, shimmer, echo, fable")
    model: str = Field(default="gpt-4o-mini-tts")
    job_id: str = Field(default="")

class TextToSpeechOutput(BaseModel):
    audio_base64: str
    format: str = "mp3"

class GenerateSegmentsInput(BaseModel):
    text: str = Field(..., min_length=1)
    words_per_minute: int = Field(default=150, ge=80, le=250)
    audio_duration_seconds: float | None = Field(default=None, ge=1.0)

class TextSegment(BaseModel):
    text: str
    start_seconds: float
    end_seconds: float

class GenerateSegmentsOutput(BaseModel):
    segments: list[TextSegment]
    total_duration_seconds: float

class SplitTextInput(BaseModel):
    text: str = Field(..., min_length=1)
    max_chars: int = Field(default=2000, ge=100, le=10000)

class SplitTextOutput(BaseModel):
    chunks: list[str]
    count: int

class BatchTTSInput(BaseModel):
    chunks: list[str]
    voice: str = Field(default="alloy")
    model: str = Field(default="gpt-4o-mini-tts")
    job_id: str = Field(default="")

class BatchTTSOutput(BaseModel):
    audio_segments_base64: list[str]
    format: str = "mp3"
    count: int


# ── Endpoints ──

@router.post("/generate-script", response_model=GenerateScriptOutput)
async def generate_script(body: GenerateScriptInput):
    """Generate a podcast script from quiz/learning content."""
    logger.info(f"Generating podcast script for: {body.title or body.subject}")

    content_summary = body.content[:3000] if body.content else ""
    topics_str = ", ".join(body.topics[:10]) if body.topics else ""

    prompt = f"""Create an engaging podcast script for a 2-5 minute educational podcast episode.

Title: {body.title or body.subject}
Subject: {body.subject}
Topics covered: {topics_str}
Key content: {content_summary}
Important info: {body.important_info}

The script should:
- Open with a brief, engaging introduction
- Cover key points conversationally
- Include transitions between topics
- End with a summary and call to action
- Be written as narration text (no stage directions, no speaker labels)
- Be 300-800 words (suitable for 2-5 minutes of audio)

Return the script as plain text (not JSON)."""

    script = await llm_chat(
        messages=[
            {"role": "system", "content": "You are a skilled podcast scriptwriter who creates engaging educational content."},
            {"role": "user", "content": prompt},
        ],
        model="gpt-4o-mini",
        job_id=body.job_id,
        json_mode=False,
    )

    word_count = len(script.split())
    est_duration = int(word_count / 150 * 60)  # 150 wpm

    return GenerateScriptOutput(
        script=script,
        estimated_duration_seconds=est_duration,
    )


@router.post("/smooth-script", response_model=SmoothScriptOutput)
async def smooth_script(body: SmoothScriptInput):
    """Rewrite a podcast script for natural-sounding narration."""
    logger.info("Smoothing podcast script")

    prompt = f"""Rewrite the following podcast script to sound more natural and engaging when read aloud.
Fix any awkward phrasing, improve flow between topics, and ensure it sounds conversational.
Keep the same content and length. Return only the improved script text.

Script:
{body.script[:4000]}"""

    smoothed = await llm_chat(
        messages=[
            {"role": "system", "content": "You are a skilled podcast editor who makes scripts sound natural when read aloud."},
            {"role": "user", "content": prompt},
        ],
        model="gpt-4o-mini",
        job_id=body.job_id,
        json_mode=False,
    )

    return SmoothScriptOutput(script=smoothed)


@router.post("/text-to-speech", response_model=TextToSpeechOutput)
async def text_to_speech(body: TextToSpeechInput):
    """Convert text to MP3 audio via compute-proxy TTS."""
    logger.info(f"TTS: {len(body.text)} chars, voice={body.voice}")

    audio_bytes = await tts_generate(
        text=body.text,
        voice=body.voice,
        model=body.model,
        job_id=body.job_id,
    )

    return TextToSpeechOutput(
        audio_base64=base64.b64encode(audio_bytes).decode("utf-8"),
        format="mp3",
    )


@router.post("/generate-segments", response_model=GenerateSegmentsOutput)
async def generate_segments(body: GenerateSegmentsInput):
    """Split text into timed segments for synced display."""
    sentences = re.split(r"(?<=[.!?])\s+", body.text.strip())
    if not sentences:
        sentences = [body.text.strip()]

    # Estimate total duration from word count if not provided
    total_words = sum(len(s.split()) for s in sentences)
    if body.audio_duration_seconds:
        total_duration = body.audio_duration_seconds
    else:
        total_duration = total_words / body.words_per_minute * 60

    segments = []
    current_time = 0.0

    for sentence in sentences:
        word_count = len(sentence.split())
        if total_words > 0:
            duration = (word_count / total_words) * total_duration
        else:
            duration = 1.0

        segments.append(TextSegment(
            text=sentence,
            start_seconds=round(current_time, 2),
            end_seconds=round(current_time + duration, 2),
        ))
        current_time += duration

    return GenerateSegmentsOutput(
        segments=segments,
        total_duration_seconds=round(current_time, 2),
    )


@router.post("/split-text", response_model=SplitTextOutput)
async def split_text(body: SplitTextInput):
    """Split text into chunks by sentences, respecting max char limit."""
    sentences = re.split(r"(?<=[.!?])\s+", body.text.strip())
    chunks = []
    current_chunk = ""

    for sentence in sentences:
        if len(current_chunk) + len(sentence) + 1 <= body.max_chars:
            current_chunk = f"{current_chunk} {sentence}" if current_chunk else sentence
        else:
            if current_chunk:
                chunks.append(current_chunk)
            current_chunk = sentence

    if current_chunk:
        chunks.append(current_chunk)

    return SplitTextOutput(chunks=chunks, count=len(chunks))


@router.post("/batch-tts", response_model=BatchTTSOutput)
async def batch_tts(body: BatchTTSInput):
    """Generate TTS audio for multiple text chunks."""
    logger.info(f"Batch TTS: {len(body.chunks)} chunks, voice={body.voice}")

    audio_segments = []
    for chunk in body.chunks:
        audio_bytes = await tts_generate(
            text=chunk,
            voice=body.voice,
            model=body.model,
            job_id=body.job_id,
        )
        audio_segments.append(base64.b64encode(audio_bytes).decode("utf-8"))

    return BatchTTSOutput(
        audio_segments_base64=audio_segments,
        format="mp3",
        count=len(audio_segments),
    )
