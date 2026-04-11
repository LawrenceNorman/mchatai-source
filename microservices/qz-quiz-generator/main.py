"""qz-quiz-generator — Core quiz generation: structures, questions, learning plans."""

import json
import logging

from fastapi import APIRouter
from pydantic import BaseModel, Field

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "qz-shared"))
from llm_client import llm_chat, llm_chat_json

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Models ──

class Topic(BaseModel):
    name: str
    description: str = ""

class SubCategory(BaseModel):
    name: str
    topics: list[Topic] = []

class Category(BaseModel):
    name: str
    subCategories: list[SubCategory] = []

class QuizStructure(BaseModel):
    subject: str
    categories: list[Category]

class QuestionOut(BaseModel):
    question: str
    options: list[str]
    correctAnswer: str
    tags: list[str] = []
    topic: str = ""

# ── Input/Output schemas ──

class StructureInput(BaseModel):
    subject: str = Field(..., min_length=1, max_length=500)
    tags: list[str] = Field(default=[])
    job_id: str = Field(default="")

class StructureOutput(BaseModel):
    subject: str
    categories: list[dict]

class ExampleQuestionInput(BaseModel):
    subject: str = Field(..., min_length=1, max_length=500)
    job_id: str = Field(default="")

class ExampleQuestionOutput(BaseModel):
    question: str
    options: list[str]
    correctAnswer: str

class BatchQuestionsInput(BaseModel):
    subject: str = Field(..., min_length=1, max_length=500)
    topic: str = Field(..., min_length=1)
    category: str = Field(default="")
    sub_category: str = Field(default="")
    example_question: dict | None = None
    used_questions: list[str] = Field(default=[])
    used_answers: list[str] = Field(default=[])
    num_questions: int = Field(default=10, ge=1, le=50)
    job_id: str = Field(default="")

class BatchQuestionsOutput(BaseModel):
    questions: list[dict]
    count: int

class EvaluateGoalInput(BaseModel):
    learning_goal: str = Field(..., min_length=1, max_length=1000)
    job_id: str = Field(default="")

class EvaluateGoalOutput(BaseModel):
    evaluation_score: float
    feedback: str
    learning_plan: dict

class LearningPlanInput(BaseModel):
    subject: str = Field(..., min_length=1, max_length=500)
    structure: dict = Field(..., description="Quiz structure with categories/subcategories/topics")
    job_id: str = Field(default="")

class LearningPlanItem(BaseModel):
    milestone: str
    subCategory: str
    topic: str
    description: str
    learningContent: str

class LearningPlanOutput(BaseModel):
    segments: list[dict]
    count: int


# ── Endpoints ──

@router.post("/structure", response_model=StructureOutput)
async def generate_structure(body: StructureInput):
    """Generate hierarchical quiz structure (categories -> subcategories -> topics)."""
    logger.info(f"Generating structure for: {body.subject}")

    tags_str = ", ".join(f'"{t}"' for t in body.tags) if body.tags else "none"
    prompt = f"""Generate a detailed structure for a trivia quiz based on the subject '{body.subject}' with additional tags: {tags_str}.
The structure should be hierarchical:
{{
    "subject": "{body.subject}",
    "categories": [
        {{
            "name": "Category Name",
            "subCategories": [
                {{
                    "name": "Sub-Category Name",
                    "topics": [
                        {{"name": "Topic Name", "description": "Brief description"}}
                    ]
                }}
            ]
        }}
    ]
}}
Include meaningful names and descriptions. Return only valid JSON."""

    result = await llm_chat_json(
        messages=[
            {"role": "system", "content": "You are a helpful assistant designed to output JSON."},
            {"role": "user", "content": prompt},
        ],
        model="gpt-4o-mini",
        job_id=body.job_id,
    )

    return StructureOutput(
        subject=result.get("subject", body.subject),
        categories=result.get("categories", []),
    )


@router.post("/example-question", response_model=ExampleQuestionOutput)
async def generate_example_question(body: ExampleQuestionInput):
    """Generate a single example trivia question for a subject."""
    logger.info(f"Generating example question for: {body.subject}")

    prompt = f"""Generate one example trivia question with four multiple choice answers about '{body.subject}'.
Return JSON: {{"question": "...", "options": ["A", "B", "C", "D"], "correctAnswer": "..."}}"""

    result = await llm_chat_json(
        messages=[
            {"role": "system", "content": "You are a helpful assistant designed to output JSON."},
            {"role": "user", "content": prompt},
        ],
        model="gpt-4o-mini",
        job_id=body.job_id,
    )

    return ExampleQuestionOutput(
        question=result.get("question", ""),
        options=result.get("options", []),
        correctAnswer=result.get("correctAnswer", ""),
    )


@router.post("/batch-questions", response_model=BatchQuestionsOutput)
async def generate_batch_questions(body: BatchQuestionsInput):
    """Generate N trivia questions for a specific topic, avoiding duplicates."""
    logger.info(f"Generating {body.num_questions} questions for topic: {body.topic}")

    used_q = ", ".join(f'"{q}"' for q in body.used_questions[:20]) if body.used_questions else "none"
    used_a = ", ".join(f'"{a}"' for a in body.used_answers[:20]) if body.used_answers else "none"

    example_str = ""
    if body.example_question:
        eq = body.example_question
        example_str = f"""Example question for reference:
Question: {eq.get('question', '')}
Options: {eq.get('options', [])}
Correct Answer: {eq.get('correctAnswer', '')}
"""

    prompt = f"""Generate {body.num_questions} unique trivia questions with four multiple choice answers about '{body.subject}' focusing on the topic '{body.topic}'.
{example_str}
Already used questions (do NOT repeat): [{used_q}]
Already used answers (do NOT repeat): [{used_a}]
Return JSON: {{"questions": [{{"question": "...", "options": ["A","B","C","D"], "correctAnswer": "..."}}]}}
No prefixes (A., B.) before options. Return only valid JSON."""

    result = await llm_chat_json(
        messages=[
            {"role": "system", "content": "You are a helpful assistant designed to output JSON."},
            {"role": "user", "content": prompt},
        ],
        model="gpt-4o-mini",
        job_id=body.job_id,
    )

    # Handle various response shapes from the LLM
    questions = []
    if isinstance(result, dict):
        for key in ("questions", "triviaQuestions", "trivia", "data", "trivia_questions"):
            if key in result:
                questions = result[key]
                break
        if not questions and isinstance(result, list):
            questions = result
    elif isinstance(result, list):
        questions = result

    # Add tags to each question
    tags = [t for t in [body.category, body.sub_category, body.topic] if t]
    for q in questions:
        q["tags"] = tags
        q["topic"] = body.topic

    return BatchQuestionsOutput(questions=questions, count=len(questions))


@router.post("/evaluate-goal", response_model=EvaluateGoalOutput)
async def evaluate_goal(body: EvaluateGoalInput):
    """Evaluate a learning goal and generate an initial learning plan outline."""
    logger.info(f"Evaluating learning goal: {body.learning_goal[:80]}")

    prompt = f"""Evaluate the following learning goal: "{body.learning_goal}".
Respond with JSON:
{{
    "evaluation_score": float 0.0-1.0 indicating validity,
    "feedback": "Brief acknowledgement if valid (score > 0.65), or ask user to refine if not",
    "learning_plan": {{
        "outline": "General outline of topics and milestones to achieve proficiency"
    }}
}}"""

    result = await llm_chat_json(
        messages=[
            {"role": "system", "content": "You are a helpful assistant designed to evaluate learning goals and generate learning plans."},
            {"role": "user", "content": prompt},
        ],
        model="gpt-4o-mini",
        job_id=body.job_id,
    )

    return EvaluateGoalOutput(
        evaluation_score=float(result.get("evaluation_score", 0.0)),
        feedback=result.get("feedback", ""),
        learning_plan=result.get("learning_plan", {}),
    )


@router.post("/learning-plan", response_model=LearningPlanOutput)
async def generate_learning_plan(body: LearningPlanInput):
    """Generate a detailed learning plan from subject + quiz structure."""
    logger.info(f"Generating learning plan for: {body.subject}")

    segments = []
    categories = body.structure.get("categories", [])

    for category in categories:
        cat_name = category.get("name", "")
        for sub_cat in category.get("subCategories", []):
            sub_name = sub_cat.get("name", "")
            for topic in sub_cat.get("topics", []):
                topic_name = topic.get("name", "")
                topic_desc = topic.get("description", "")

                prompt = f"""Provide a detailed explanation and important information about '{topic_name}' in the context of '{body.subject}'.
Include key facts, important concepts, and practical examples.
Return JSON: {{"content": "Your detailed explanation here"}}"""

                result = await llm_chat_json(
                    messages=[
                        {"role": "system", "content": "You are a helpful assistant designed to output JSON."},
                        {"role": "user", "content": prompt},
                    ],
                    model="gpt-4o-mini",
                    job_id=body.job_id,
                )

                segments.append({
                    "milestone": cat_name,
                    "subCategory": sub_name,
                    "topic": topic_name,
                    "description": topic_desc,
                    "learningContent": result.get("content", ""),
                })

    return LearningPlanOutput(segments=segments, count=len(segments))
