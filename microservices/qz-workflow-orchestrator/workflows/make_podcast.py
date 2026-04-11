"""MakePodcast and AudioStudyGuide workflow definitions."""

from engine import Step, FanOutStep


# ── Make Podcast Workflow ──

MAKE_PODCAST_STEPS = [
    Step(
        name="generate_script",
        service="qz-podcast",
        endpoint="/generate-script",
        input_map=lambda ctx: {
            "title": ctx.input.get("title", ""),
            "subject": ctx.input.get("subject", ""),
            "topics": ctx.input.get("topics", []),
            "content": ctx.input.get("content", ""),
            "important_info": ctx.input.get("important_info", ""),
        },
        estimated_tokens=0.5,
    ),
    Step(
        name="smooth_script",
        service="qz-podcast",
        endpoint="/smooth-script",
        input_map=lambda ctx: {
            "script": ctx.results.get("generate_script", {}).get("script", ""),
        },
        depends_on=["generate_script"],
        estimated_tokens=0.3,
    ),
    Step(
        name="split_text",
        service="qz-podcast",
        endpoint="/split-text",
        input_map=lambda ctx: {
            "text": ctx.results.get("smooth_script", {}).get("script", ""),
            "max_chars": 2000,
        },
        depends_on=["smooth_script"],
        estimated_tokens=0,
    ),
    FanOutStep(
        name="tts_chunks",
        service="qz-podcast",
        endpoint="/text-to-speech",
        items_from=lambda ctx: ctx.results.get("split_text", {}).get("chunks", []),
        input_map=lambda ctx, item: {
            "text": item,
            "voice": ctx.config.get("voice", "alloy"),
        },
        depends_on=["split_text"],
        max_concurrency=3,
        estimated_tokens_per_item=1.5,
    ),
    Step(
        name="splice_audio",
        service="qz-media-processing",
        endpoint="/splice-audio",
        input_map=lambda ctx: {
            "audio_segments_base64": [
                r.get("audio_base64", "") for r in ctx.results.get("tts_chunks", [])
            ],
        },
        depends_on=["tts_chunks"],
        estimated_tokens=0,
    ),
    Step(
        name="normalize_audio",
        service="qz-media-processing",
        endpoint="/normalize-audio",
        input_map=lambda ctx: {
            "audio_base64": ctx.results.get("splice_audio", {}).get("audio_base64", ""),
        },
        depends_on=["splice_audio"],
        estimated_tokens=0,
    ),
    Step(
        name="generate_segments",
        service="qz-podcast",
        endpoint="/generate-segments",
        input_map=lambda ctx: {
            "text": ctx.results.get("smooth_script", {}).get("script", ""),
            "audio_duration_seconds": ctx.results.get("splice_audio", {}).get("duration_seconds"),
        },
        depends_on=["smooth_script", "splice_audio"],
        estimated_tokens=0,
    ),
]


# ── Study Guide + Audio ──

MAKE_STUDY_GUIDE_STEPS = [
    Step(
        name="validate_topic",
        service="qz-topic-validator",
        endpoint="/validate",
        input_map=lambda ctx: {"query": ctx.input["subject"]},
        estimated_tokens=0.1,
    ),
    Step(
        name="evaluate_goal",
        service="qz-quiz-generator",
        endpoint="/evaluate-goal",
        input_map=lambda ctx: {"learning_goal": ctx.input["subject"]},
        depends_on=["validate_topic"],
        condition=lambda ctx: ctx.results.get("validate_topic", {}).get("valid", False),
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
        depends_on=["evaluate_goal"],
        estimated_tokens=0.5,
    ),
    Step(
        name="learning_plan",
        service="qz-quiz-generator",
        endpoint="/learning-plan",
        input_map=lambda ctx: {
            "subject": ctx.input["subject"],
            "structure": ctx.results.get("structure", {}),
        },
        depends_on=["structure"],
        estimated_tokens=2.0,
    ),
    Step(
        name="batch_questions",
        service="qz-quiz-generator",
        endpoint="/batch-questions",
        input_map=lambda ctx: {
            "subject": ctx.input["subject"],
            "topic": ctx.input["subject"],
            "num_questions": 10,
        },
        depends_on=["structure"],
        estimated_tokens=1.5,
    ),
    Step(
        name="wrap_metadata",
        service="qz-metadata",
        endpoint="/wrap-metadata",
        input_map=lambda ctx: {
            "questions": ctx.results.get("batch_questions", {}).get("questions", []),
            "quiz_name": ctx.input.get("subject", ""),
            "subject": ctx.input.get("subject", ""),
            "tags": ctx.input.get("tags", []),
        },
        depends_on=["batch_questions"],
        estimated_tokens=0,
    ),
]
