"""qz-metadata — Pure-compute metadata operations for quiz data (no LLM, 0 tokens)."""

import re
import uuid
import unicodedata
from collections import Counter

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()

# ── Stopwords for tag generation ──

STOPWORDS = frozenset(
    "a an the and or but in on at to for of is it this that was were be been "
    "being have has had do does did will would shall should may might can could "
    "i me my we our you your he him his she her they them their its not no nor "
    "so if then than too very just about above after again all also am any are "
    "as because before between both by during each few from how into more most "
    "other out over own same some such through under until up what when where "
    "which while who whom why with im like get got go goes going one two three".split()
)


# ── Models ──

class Question(BaseModel):
    question: str
    options: list[str]
    correctAnswer: str
    explanation: str = ""
    url: str = ""
    tags: list[str] = []
    difficulty: str = ""
    topic: str = ""
    id: str = ""

class AddTagsInput(BaseModel):
    questions: list[dict]
    tags: list[str]

class AddTagsOutput(BaseModel):
    questions: list[dict]
    count: int

class WrapMetadataInput(BaseModel):
    questions: list[dict]
    quiz_name: str = Field(default="")
    subject: str = Field(default="")
    tags: list[str] = Field(default=[])

class WrapMetadataOutput(BaseModel):
    metadata: dict
    questions: list[dict]
    question_count: int

class CountTokensInput(BaseModel):
    text: str = Field(..., min_length=1)
    model: str = Field(default="gpt-4o-mini")

class CountTokensOutput(BaseModel):
    token_count: int
    model: str

class GenerateTagsInput(BaseModel):
    text: str = Field(..., min_length=1)

class GenerateTagsOutput(BaseModel):
    tags: list[str]

class AddIdsInput(BaseModel):
    questions: list[dict]

class AddIdsOutput(BaseModel):
    questions: list[dict]
    count: int

class SearchKeywordsInput(BaseModel):
    quiz_name: str = Field(default="")
    tags: list[str] = Field(default=[])
    questions: list[dict] = Field(default=[])

class SearchKeywordsOutput(BaseModel):
    keywords: list[str]


# ── Endpoints ──

@router.post("/add-tags", response_model=AddTagsOutput)
async def add_tags(body: AddTagsInput):
    """Attach tags to each question in the set."""
    for q in body.questions:
        existing = q.get("tags", [])
        q["tags"] = list(set(existing + body.tags))
    return AddTagsOutput(questions=body.questions, count=len(body.questions))


@router.post("/wrap-metadata", response_model=WrapMetadataOutput)
async def wrap_metadata(body: WrapMetadataInput):
    """Wrap questions with metadata structure for storage/display."""
    # Collect all tags from questions
    all_tags = set(body.tags)
    for q in body.questions:
        all_tags.update(q.get("tags", []))

    # Generate search keywords
    keywords = set()
    for word in body.quiz_name.lower().split():
        if word not in STOPWORDS and len(word) >= 3:
            keywords.add(word)
    for tag in all_tags:
        for word in tag.lower().split():
            if word not in STOPWORDS and len(word) >= 3:
                keywords.add(word)

    metadata = {
        "quizName": body.quiz_name or body.subject,
        "subject": body.subject,
        "tags": sorted(all_tags),
        "questionCount": len(body.questions),
        "searchKeywords": sorted(keywords),
    }

    return WrapMetadataOutput(
        metadata=metadata,
        questions=body.questions,
        question_count=len(body.questions),
    )


@router.post("/count-tokens", response_model=CountTokensOutput)
async def count_tokens(body: CountTokensInput):
    """Count tokens in text using tiktoken."""
    try:
        import tiktoken
        try:
            encoding = tiktoken.encoding_for_model(body.model)
        except KeyError:
            encoding = tiktoken.get_encoding("cl100k_base")
        count = len(encoding.encode(body.text))
    except ImportError:
        # Fallback: rough estimate of ~4 chars per token
        count = len(body.text) // 4

    return CountTokensOutput(token_count=count, model=body.model)


@router.post("/generate-tags", response_model=GenerateTagsOutput)
async def generate_tags(body: GenerateTagsInput):
    """Generate tags from text by extracting meaningful keywords."""
    normalized = "".join(
        c for c in unicodedata.normalize("NFD", body.text)
        if unicodedata.category(c) != "Mn"
    )
    cleaned = re.sub(r"[^\w\s]", "", normalized)
    words = cleaned.lower().split()
    tags = list({w for w in words if w not in STOPWORDS and len(w) >= 3})
    return GenerateTagsOutput(tags=sorted(tags))


@router.post("/add-ids", response_model=AddIdsOutput)
async def add_ids(body: AddIdsInput):
    """Add unique UUIDs to questions that don't have an ID."""
    for q in body.questions:
        if not q.get("id"):
            q["id"] = str(uuid.uuid4())
    return AddIdsOutput(questions=body.questions, count=len(body.questions))


@router.post("/search-keywords", response_model=SearchKeywordsOutput)
async def extract_search_keywords(body: SearchKeywordsInput):
    """Extract search keywords from quiz name, tags, and question tags."""
    keywords = set()
    for word in body.quiz_name.lower().split():
        if word not in STOPWORDS and len(word) >= 3:
            keywords.add(word)
    for tag in body.tags:
        for word in tag.lower().split():
            if word not in STOPWORDS and len(word) >= 3:
                keywords.add(word)
    for q in body.questions:
        for tag in q.get("tags", []):
            for word in tag.lower().split():
                if word not in STOPWORDS and len(word) >= 3:
                    keywords.add(word)
    return SearchKeywordsOutput(keywords=sorted(keywords))
