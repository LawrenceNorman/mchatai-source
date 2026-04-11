"""qz-topic-validator — Validates whether a query is a legitimate learning topic."""

import json
import logging

from fastapi import APIRouter
from pydantic import BaseModel, Field

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "qz-shared"))
from llm_client import llm_chat_json

router = APIRouter()
logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a strict classifier that decides whether a user's query is an appropriate LEARNING TOPIC.
Return JSON with keys:
  valid: true/false
  normalized_topic: short title if valid else ""
  reason: short human-readable reason if not valid, empty string if valid.
A learning topic is a skill, an academic subject, a language, a tool, or a framework the user might want to master.
Reject jokes, casual chit-chat, or requests unrelated to learning."""


# ── Models ──

class ValidateInput(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    job_id: str = Field(default="", description="mChatAI job ID for billing attribution")

class ValidateOutput(BaseModel):
    valid: bool
    normalized_topic: str
    reason: str


# ── Endpoints ──

@router.post("/validate", response_model=ValidateOutput)
async def validate_topic(body: ValidateInput):
    """Validate whether a query is a legitimate learning topic via LLM."""
    logger.info(f"Validating topic: {body.query[:80]}")

    result = await llm_chat_json(
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": body.query},
        ],
        model="gpt-4o-mini",
        job_id=body.job_id,
    )

    return ValidateOutput(
        valid=result.get("valid", False),
        normalized_topic=result.get("normalized_topic", ""),
        reason=result.get("reason", ""),
    )
