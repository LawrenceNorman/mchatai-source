# learning/

Content for the mchatai.com education services (Phase ED, `mchatai_macOS/docs/EDUCATION_CLOUD_SERVICES.md`):
quizzes made from a source text, checked by a second model family, and answers graded against a rubric. web-api
(`mchataiweb/cloudrun/services/web-api/src/learning*.js`) reads these files over HTTPS every 5 minutes, so a change
here ships with no redeploy.

| File | What it holds |
|---|---|
| `cloud-services.json` | Which model plays each role (from `llm-catalog/providers/`), limits, review intervals |
| `prompts/quiz-writer.md` | How questions are written: quoted evidence, levels, fair distractors |
| `prompts/quiz-checker.md` | The blind check by a different model family, open-book and closed-book |
| `prompts/grade-answer.md` | Rubric grading of short, essay and spoken answers |
| `schemas/quiz-set.v2.schema.json` | Quiz set v2, a superset of the Quiznect applet's question |

Before changing a model: `python3 learning/tools/check_services.py` (the model must be active in the catalog, and the
checker must stay a different provider from the writer). After changing anything here, refresh web-api's frozen
fallback copy: `node mchataiweb/cloudrun/services/web-api/scripts/snapshot-learning.mjs`.
