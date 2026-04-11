"""qz-question-quality — Validate, enhance, clean, deduplicate, and verify quiz questions."""

import re
import json
import logging
from difflib import SequenceMatcher

from fastapi import APIRouter
from pydantic import BaseModel, Field

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "qz-shared"))
from llm_client import llm_chat_json

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Models ──

class ValidateInput(BaseModel):
    question: str
    explanation: str = ""
    correctAnswer: str = ""
    options: list[str] = []
    job_id: str = Field(default="")

class ValidateOutput(BaseModel):
    status: str  # "VALID" or "INVALID"
    question: str
    reason: str = ""
    fixable: bool = False
    suggested_fix: str = ""

class EnhanceExplanationInput(BaseModel):
    question: str
    job_id: str = Field(default="")

class EnhanceExplanationOutput(BaseModel):
    explanation: str
    url: str

class CleanExplanationInput(BaseModel):
    explanation: str

class CleanExplanationOutput(BaseModel):
    explanation: str

class CleanExplanationsBatchInput(BaseModel):
    questions: list[dict]

class CleanExplanationsBatchOutput(BaseModel):
    questions: list[dict]
    count: int

class DeduplicateInput(BaseModel):
    questions: list[dict]
    threshold: float = Field(default=0.95, ge=0.5, le=1.0)

class DuplicatePair(BaseModel):
    index1: int
    index2: int
    similarity: float

class DeduplicateOutput(BaseModel):
    questions: list[dict]
    removed_count: int
    duplicate_pairs: list[DuplicatePair]

class VerifyContentInput(BaseModel):
    questions: list[dict]

class VerifyContentOutput(BaseModel):
    questions: list[dict]
    valid_count: int
    removed_count: int

class ValidateBatchInput(BaseModel):
    questions: list[dict]
    job_id: str = Field(default="")

class ValidateBatchOutput(BaseModel):
    valid_questions: list[dict]
    invalid_questions: list[dict]
    valid_count: int
    invalid_count: int

class EnhanceBatchInput(BaseModel):
    questions: list[dict]
    job_id: str = Field(default="")

class EnhanceBatchOutput(BaseModel):
    questions: list[dict]
    enhanced_count: int


# ── Cleanup patterns ──

VALIDATION_PATTERNS = [
    r"The question is valid[.\s]",
    r"This answer is correct[.\s]",
    r"This is a valid question[.\s]",
    r"The correct answer is indeed[.\s]",
    r"This question is accurate[.\s]",
]
VALIDATION_RE = re.compile("|".join(VALIDATION_PATTERNS), re.IGNORECASE)


# ── Endpoints ──

@router.post("/validate", response_model=ValidateOutput)
async def validate_question(body: ValidateInput):
    """Validate a single question for accuracy via LLM."""
    logger.info(f"Validating question: {body.question[:60]}")

    prompt = f"""Given the following trivia question:

Question: "{body.question}"
Explanation: "{body.explanation}"
Correct Answer: "{body.correctAnswer}"

Determine whether the question is accurate and correctly answered.

If valid, respond: {{"status": "VALID", "question": "{body.question}"}}
If invalid, respond: {{"status": "INVALID", "question": "{body.question}", "reason": "...", "fixable": true/false, "suggested_fix": "..."}}

Return only valid JSON."""

    result = await llm_chat_json(
        messages=[
            {"role": "system", "content": "You are a helpful assistant designed to validate trivia questions."},
            {"role": "user", "content": prompt},
        ],
        model="gpt-4o-mini",
        job_id=body.job_id,
    )

    return ValidateOutput(
        status=result.get("status", "VALID"),
        question=result.get("question", body.question),
        reason=result.get("reason", ""),
        fixable=result.get("fixable", False),
        suggested_fix=result.get("suggested_fix", ""),
    )


@router.post("/enhance-explanation", response_model=EnhanceExplanationOutput)
async def enhance_explanation(body: EnhanceExplanationInput):
    """Add HTML explanation + Wikipedia URL for a question via LLM."""
    logger.info(f"Enhancing explanation for: {body.question[:60]}")

    prompt = f"""For the question: "{body.question}", provide a concise explanation in HTML format (max 500 characters).
Include a relevant citation URL from a reputable source (preferably Wikipedia).
Return JSON: {{"explanation": "<HTML explanation>", "url": "https://en.wikipedia.org/wiki/..."}}"""

    result = await llm_chat_json(
        messages=[
            {"role": "system", "content": "You are a helpful assistant designed to enhance explanations."},
            {"role": "user", "content": prompt},
        ],
        model="gpt-4o-mini",
        job_id=body.job_id,
    )

    return EnhanceExplanationOutput(
        explanation=result.get("explanation", ""),
        url=result.get("url", ""),
    )


@router.post("/clean-explanation", response_model=CleanExplanationOutput)
async def clean_explanation(body: CleanExplanationInput):
    """Clean validation artifacts from an explanation (regex, no LLM)."""
    cleaned = VALIDATION_RE.sub("", body.explanation).strip()
    return CleanExplanationOutput(explanation=cleaned)


@router.post("/clean-explanations-batch", response_model=CleanExplanationsBatchOutput)
async def clean_explanations_batch(body: CleanExplanationsBatchInput):
    """Clean validation artifacts from all question explanations in a batch."""
    for q in body.questions:
        if "explanation" in q:
            q["explanation"] = VALIDATION_RE.sub("", q["explanation"]).strip()
    return CleanExplanationsBatchOutput(questions=body.questions, count=len(body.questions))


@router.post("/deduplicate", response_model=DeduplicateOutput)
async def deduplicate_questions(body: DeduplicateInput):
    """Identify and remove similar question pairs using SequenceMatcher (no LLM)."""
    questions = body.questions
    to_remove = set()
    pairs = []

    for i in range(len(questions)):
        if i in to_remove:
            continue
        for j in range(i + 1, len(questions)):
            if j in to_remove:
                continue
            q1 = questions[i].get("question", "")
            q2 = questions[j].get("question", "")
            similarity = SequenceMatcher(None, q1.lower(), q2.lower()).ratio()
            if similarity >= body.threshold:
                to_remove.add(j)
                pairs.append(DuplicatePair(index1=i, index2=j, similarity=round(similarity, 3)))

    deduped = [q for idx, q in enumerate(questions) if idx not in to_remove]

    return DeduplicateOutput(
        questions=deduped,
        removed_count=len(to_remove),
        duplicate_pairs=pairs,
    )


@router.post("/verify-content", response_model=VerifyContentOutput)
async def verify_content(body: VerifyContentInput):
    """Verify each question's correct answer is in its options (no LLM)."""
    valid = []
    removed = 0

    for q in body.questions:
        correct = q.get("correctAnswer", "")
        options = q.get("options", [])
        if correct and correct in options:
            valid.append(q)
        else:
            removed += 1
            logger.warning(f"Removed question: correct answer '{correct}' not in options")

    return VerifyContentOutput(
        questions=valid,
        valid_count=len(valid),
        removed_count=removed,
    )


@router.post("/validate-batch", response_model=ValidateBatchOutput)
async def validate_batch(body: ValidateBatchInput):
    """Validate a batch of questions via LLM, separating valid from invalid."""
    valid_list = []
    invalid_list = []

    for q in body.questions:
        result = await validate_question(ValidateInput(
            question=q.get("question", ""),
            explanation=q.get("explanation", ""),
            correctAnswer=q.get("correctAnswer", ""),
            options=q.get("options", []),
            job_id=body.job_id,
        ))
        if result.status == "VALID":
            valid_list.append(q)
        else:
            q["_validation_reason"] = result.reason
            q["_suggested_fix"] = result.suggested_fix
            invalid_list.append(q)

    return ValidateBatchOutput(
        valid_questions=valid_list,
        invalid_questions=invalid_list,
        valid_count=len(valid_list),
        invalid_count=len(invalid_list),
    )


@router.post("/enhance-batch", response_model=EnhanceBatchOutput)
async def enhance_batch(body: EnhanceBatchInput):
    """Enhance explanations for a batch of questions via LLM."""
    enhanced = 0
    for q in body.questions:
        question_text = q.get("question", "")
        if not question_text:
            continue
        result = await enhance_explanation(EnhanceExplanationInput(
            question=question_text,
            job_id=body.job_id,
        ))
        q["explanation"] = result.explanation
        q["url"] = result.url
        enhanced += 1

    return EnhanceBatchOutput(questions=body.questions, enhanced_count=enhanced)
