"""Workflow registry — maps actionID to step definitions."""

from workflows.make_quiz import MAKE_QUIZ_STEPS, QUICK_QUIZ_STEPS
from workflows.make_podcast import MAKE_PODCAST_STEPS, MAKE_STUDY_GUIDE_STEPS

WORKFLOW_REGISTRY: dict[str, dict] = {
    "quiznect_make_quiz": {
        "steps": MAKE_QUIZ_STEPS,
        "estimated_tokens": 12,
        "description": "Generate a full quiz with validated, enhanced questions",
    },
    "quiznect_quick_quiz": {
        "steps": QUICK_QUIZ_STEPS,
        "estimated_tokens": 3,
        "description": "Quick 10-question quiz on a single topic",
    },
    "quiznect_make_podcast": {
        "steps": MAKE_PODCAST_STEPS,
        "estimated_tokens": 8,
        "description": "Generate a podcast from content with TTS audio",
    },
    "quiznect_make_study_guide": {
        "steps": MAKE_STUDY_GUIDE_STEPS,
        "estimated_tokens": 6,
        "description": "Generate a study guide with learning plan and questions",
    },
}
