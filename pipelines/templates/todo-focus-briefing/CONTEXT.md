---
artifact:
  type: pipeline
  id: official.pipeline.todo-focus-briefing
  name: Todo Focus Briefing
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-06
  updated_at: 2026-05-06

purpose:
  summary: Scans pending todos and fires a 3-line notification naming exactly what to focus on today.
  problem_solved: Too many todos; user needs a decisive nudge, not another report.
  intended_users: Anyone who wants a quick morning prioritization push.

architecture:
  language: json
  frameworks: [pipeline-engine]
  platform: mchatai-plus
  has_ui: false
  requires_auth: false

dependencies:
  external_apis: []
  internal_services: [builtin.todoList, builtin.llmGenerate, builtin.notify]
  storage: none

development:
  main_file: pipeline.json
  config_file: manifest.json
  entry_points: [steps[1].config.userPrompt]
  build_command: none
  test_command: "tunnel runPipeline 'Todo Focus Briefing'"
  deploy_command: "refreshMchataisourceCache in mChatAI+"

tags: [todos, productivity, focus, daily, notify]
---

## What This Does

Reads pending todos, asks the LLM to pick one primary focus and two secondary tasks, then fires a desktop notification with exactly three lines. Designed to run in under 10 seconds as a morning trigger.

## How to Continue Building This

- **Schedule it**: Set a 9am daily trigger in the Automation scheduler.
- **Add audio**: Append a `builtin.ttsGenerate` step to read the focus aloud.
- **Widen scope**: Change prompt to also pull calendar events — add a `builtin.googleCalendar` step before `llmGenerate` and merge both inputs in the prompt.

### Critical Entry Points
- **`steps[1].config.userPrompt`** — the three-line constraint is intentional. The notification body has limited space; longer output gets clipped on macOS. Keep `llmMaxTokens` at `"600"` or below.
- **`steps[2].config.notifyBody: "{{INPUT}}"`** — the notify skill reads `data.text` via `{{INPUT}}` here.

### Key Concepts
- `llmMaxTokens: "600"` is deliberately tight — forces brevity. Increase only if you add sections.
- No `saveArtifact` step — this is a fire-and-forget notification pipeline, no document stored.
