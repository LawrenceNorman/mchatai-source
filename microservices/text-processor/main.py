"""Text Processor — mChatAI microservice for text analysis and transformation."""

import re
import string
from collections import Counter

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()

# ── Models ──

class TextInput(BaseModel):
    text: str = Field(..., min_length=1)

class StatsOutput(BaseModel):
    words: int
    sentences: int
    characters: int
    paragraphs: int
    reading_time_minutes: float

class KeywordInput(BaseModel):
    text: str = Field(..., min_length=1)
    top_n: int = Field(default=10, ge=1, le=100)

class KeywordItem(BaseModel):
    word: str
    count: int

class KeywordsOutput(BaseModel):
    keywords: list[KeywordItem]

class TransformInput(BaseModel):
    text: str = Field(..., min_length=1)
    mode: str = Field(default="uppercase")

class TransformOutput(BaseModel):
    result: str
    mode: str

# ── Stopwords ──

STOPWORDS = frozenset(
    "a an the and or but in on at to for of is it this that was were be been "
    "being have has had do does did will would shall should may might can could "
    "i me my we our you your he him his she her they them their its not no nor "
    "so if then than too very just about above after again all also am any are "
    "as because before between both by during each few from how into more most "
    "other out over own same some such through under until up what when where "
    "which while who whom why with".split()
)

# ── Endpoints ──

@router.post("/stats", response_model=StatsOutput)
async def text_stats(body: TextInput):
    text = body.text
    words = len(text.split())
    sentences = max(1, len(re.split(r'[.!?]+', text.strip())) - 1) if text.strip() else 0
    characters = len(text)
    paragraphs = len([p for p in text.split("\n\n") if p.strip()])
    reading_time = round(words / 250, 2)  # avg reading speed
    return StatsOutput(
        words=words,
        sentences=sentences,
        characters=characters,
        paragraphs=paragraphs,
        reading_time_minutes=reading_time,
    )


@router.post("/keywords", response_model=KeywordsOutput)
async def extract_keywords(body: KeywordInput):
    words = re.findall(r'\b[a-zA-Z]{2,}\b', body.text.lower())
    filtered = [w for w in words if w not in STOPWORDS]
    counts = Counter(filtered).most_common(body.top_n)
    return KeywordsOutput(
        keywords=[KeywordItem(word=w, count=c) for w, c in counts]
    )


@router.post("/transform", response_model=TransformOutput)
async def transform_text(body: TransformInput):
    text = body.text
    mode = body.mode.lower()

    if mode == "uppercase":
        result = text.upper()
    elif mode == "lowercase":
        result = text.lower()
    elif mode == "title":
        result = text.title()
    elif mode == "reverse":
        result = text[::-1]
    elif mode == "slug":
        result = re.sub(r'[^\w\s-]', '', text.lower())
        result = re.sub(r'[\s_]+', '-', result).strip('-')
    else:
        result = text  # passthrough for unknown modes

    return TransformOutput(result=result, mode=mode)
