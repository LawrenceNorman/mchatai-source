"""MakeQuiz and QuickQuiz workflow definitions."""

from engine import Step, FanOutStep


def _extract_topics(ctx):
    """Extract flat list of topics from quiz structure."""
    structure = ctx.results.get("structure", {})
    topics = []
    for cat in structure.get("categories", []):
        cat_name = cat.get("name", "")
        for sub in cat.get("subCategories", []):
            sub_name = sub.get("name", "")
            for topic in sub.get("topics", []):
                topics.append({
                    "category": cat_name,
                    "sub_category": sub_name,
                    "name": topic.get("name", ""),
                    "description": topic.get("description", ""),
                })
    return topics


def _flatten_batch_results(ctx):
    """Flatten fan-out batch question results into a single list."""
    batches = ctx.results.get("batch_questions", [])
    all_questions = []
    for batch in batches:
        all_questions.extend(batch.get("questions", []))
    return all_questions


# ── Full Quiz Workflow ──

MAKE_QUIZ_STEPS = [
    Step(
        name="validate_topic",
        service="qz-topic-validator",
        endpoint="/validate",
        input_map=lambda ctx: {"query": ctx.input["subject"]},
        estimated_tokens=0.1,
    ),
    Step(
        name="structure",
        service="qz-quiz-generator",
        endpoint="/structure",
        input_map=lambda ctx: {
            "subject": ctx.input["subject"],
            "tags": ctx.input.get("tags", []),
        },
        depends_on=["validate_topic"],
        condition=lambda ctx: ctx.results.get("validate_topic", {}).get("valid", False),
        estimated_tokens=0.5,
    ),
    Step(
        name="example_question",
        service="qz-quiz-generator",
        endpoint="/example-question",
        input_map=lambda ctx: {"subject": ctx.input["subject"]},
        depends_on=["structure"],
        estimated_tokens=0.1,
    ),
    FanOutStep(
        name="batch_questions",
        service="qz-quiz-generator",
        endpoint="/batch-questions",
        items_from=_extract_topics,
        input_map=lambda ctx, item: {
            "subject": ctx.input["subject"],
            "topic": item["name"],
            "category": item["category"],
            "sub_category": item["sub_category"],
            "example_question": ctx.results.get("example_question", {}),
            "num_questions": 10,
        },
        depends_on=["example_question"],
        max_concurrency=5,
        estimated_tokens_per_item=1.5,
        allow_partial_failure=True,
    ),
    Step(
        name="deduplicate",
        service="qz-question-quality",
        endpoint="/deduplicate",
        input_map=lambda ctx: {"questions": _flatten_batch_results(ctx), "threshold": 0.95},
        depends_on=["batch_questions"],
        estimated_tokens=0,
    ),
    Step(
        name="verify_content",
        service="qz-question-quality",
        endpoint="/verify-content",
        input_map=lambda ctx: {"questions": ctx.results.get("deduplicate", {}).get("questions", [])},
        depends_on=["deduplicate"],
        estimated_tokens=0,
    ),
    FanOutStep(
        name="validate_questions",
        service="qz-question-quality",
        endpoint="/validate",
        items_from=lambda ctx: ctx.results.get("verify_content", {}).get("questions", []),
        input_map=lambda ctx, item: {
            "question": item.get("question", ""),
            "explanation": item.get("explanation", ""),
            "correctAnswer": item.get("correctAnswer", ""),
            "options": item.get("options", []),
        },
        depends_on=["verify_content"],
        max_concurrency=10,
        estimated_tokens_per_item=0.1,
        allow_partial_failure=True,
    ),
    FanOutStep(
        name="enhance_explanations",
        service="qz-question-quality",
        endpoint="/enhance-explanation",
        items_from=lambda ctx: [
            r for r in ctx.results.get("validate_questions", [])
            if r.get("status") == "VALID"
        ],
        input_map=lambda ctx, item: {"question": item.get("question", "")},
        depends_on=["validate_questions"],
        max_concurrency=10,
        estimated_tokens_per_item=0.2,
        allow_partial_failure=True,
    ),
    Step(
        name="clean_explanations",
        service="qz-question-quality",
        endpoint="/clean-explanations-batch",
        input_map=lambda ctx: {
            "questions": ctx.results.get("verify_content", {}).get("questions", []),
        },
        depends_on=["enhance_explanations"],
        estimated_tokens=0,
    ),
    Step(
        name="add_tags",
        service="qz-metadata",
        endpoint="/add-tags",
        input_map=lambda ctx: {
            "questions": ctx.results.get("clean_explanations", {}).get("questions", []),
            "tags": ctx.input.get("tags", []),
        },
        depends_on=["clean_explanations"],
        estimated_tokens=0,
    ),
    Step(
        name="add_ids",
        service="qz-metadata",
        endpoint="/add-ids",
        input_map=lambda ctx: {
            "questions": ctx.results.get("add_tags", {}).get("questions", []),
        },
        depends_on=["add_tags"],
        estimated_tokens=0,
    ),
    Step(
        name="wrap_metadata",
        service="qz-metadata",
        endpoint="/wrap-metadata",
        input_map=lambda ctx: {
            "questions": ctx.results.get("add_ids", {}).get("questions", []),
            "quiz_name": ctx.input.get("subject", ""),
            "subject": ctx.input.get("subject", ""),
            "tags": ctx.input.get("tags", []),
        },
        depends_on=["add_ids"],
        estimated_tokens=0,
    ),
]


# ── Quick Quiz Workflow (lightweight, 2-4 tokens) ──

QUICK_QUIZ_STEPS = [
    Step(
        name="validate_topic",
        service="qz-topic-validator",
        endpoint="/validate",
        input_map=lambda ctx: {"query": ctx.input["subject"]},
        estimated_tokens=0.1,
    ),
    Step(
        name="batch_questions",
        service="qz-quiz-generator",
        endpoint="/batch-questions",
        input_map=lambda ctx: {
            "subject": ctx.input["subject"],
            "topic": ctx.input["subject"],
            "num_questions": ctx.input.get("num_questions", 10),
        },
        depends_on=["validate_topic"],
        condition=lambda ctx: ctx.results.get("validate_topic", {}).get("valid", False),
        estimated_tokens=1.5,
    ),
    Step(
        name="verify_content",
        service="qz-question-quality",
        endpoint="/verify-content",
        input_map=lambda ctx: {
            "questions": ctx.results.get("batch_questions", {}).get("questions", []),
        },
        depends_on=["batch_questions"],
        estimated_tokens=0,
    ),
    Step(
        name="add_ids",
        service="qz-metadata",
        endpoint="/add-ids",
        input_map=lambda ctx: {
            "questions": ctx.results.get("verify_content", {}).get("questions", []),
        },
        depends_on=["verify_content"],
        estimated_tokens=0,
    ),
    Step(
        name="wrap_metadata",
        service="qz-metadata",
        endpoint="/wrap-metadata",
        input_map=lambda ctx: {
            "questions": ctx.results.get("add_ids", {}).get("questions", []),
            "quiz_name": ctx.input.get("subject", ""),
            "subject": ctx.input.get("subject", ""),
            "tags": ctx.input.get("tags", []),
        },
        depends_on=["add_ids"],
        estimated_tokens=0,
    ),
]
