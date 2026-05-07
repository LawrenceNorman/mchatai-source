---
artifact:
  type: pipeline
  id: official.pipeline.weekly-status-report
  name: Weekly Status Report
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-06
  updated_at: 2026-05-06

purpose:
  summary: Reads all todo projects and generates a formatted weekly status report.
  problem_solved: Writing status updates manually is tedious; todos already contain the raw data.
  intended_users: Professionals, freelancers, and team leads who send weekly updates.

architecture:
  language: json
  frameworks: [pipeline-engine]
  platform: mchatai-plus
  has_ui: false
  requires_auth: false

dependencies:
  external_apis: []
  internal_services: [builtin.todoList, builtin.llmGenerate, builtin.saveArtifact]
  storage: artifacts

development:
  main_file: pipeline.json
  config_file: manifest.json
  entry_points: [steps[1].config.userPrompt]
  build_command: none
  test_command: "tunnel runPipeline 'Weekly Status Report'"
  deploy_command: "refreshMchataisourceCache in mChatAI+"

tags: [todos, productivity, report, weekly, status]
---

## What This Does

Reads all todo projects (including completed items) and produces a structured weekly status report with four sections: Completed, In Progress, Planned Next Week, and Blockers.

## How to Continue Building This

- **Email the report**: Append `builtin.gmail` with `gmailMode: "send"` to auto-send to a recipient.
- **Add audio**: Append TTS chain to produce a spoken version for commute listening.
- **Schedule it**: Wire to a cron trigger in the Automation scheduler to run every Friday at 4pm.
- **Scope to one project**: Add a `userPrompt` prefix that instructs the LLM to focus on a specific project name.

### Critical Entry Points
- **`steps[0].config.includeCompleted: "true"`** — required to show finished work; set to `"false"` for an in-progress-only view.
- **`steps[1].config.userPrompt`** — the four-section structure. Edit to match your team's format.

### Key Concepts
- `todoList` returns all projects; if you have many projects the output can be long. The LLM will consolidate.
- `includeNotes: "true"` gives the LLM richer context but increases token usage.
