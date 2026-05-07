---
artifact:
  type: pipeline
  id: official.pipeline.meeting-agenda-builder
  name: Meeting Agenda Builder
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-06
  updated_at: 2026-05-06

purpose:
  summary: Takes a plain-language meeting description and produces a structured agenda with timing and action item template.
  problem_solved: Writing a good agenda takes time most people skip; this produces a professional one in seconds.
  intended_users: Anyone running meetings who wants a structured, time-boxed agenda without writing it from scratch.

architecture:
  language: json
  frameworks: [pipeline-engine]
  platform: mchatai-plus
  has_ui: false
  requires_auth: false

dependencies:
  external_apis: []
  internal_services: [builtin.llmGenerate, builtin.saveArtifact]
  storage: artifacts

development:
  main_file: pipeline.json
  config_file: manifest.json
  entry_points: [steps[0].config.userPrompt]
  build_command: none
  test_command: "tunnel runPipeline 'Meeting Agenda Builder' --input 'Q2 planning meeting with product and engineering, 4 people, need to align on roadmap priorities and ship dates'"
  deploy_command: "refreshMchataisourceCache in mChatAI+"

tags: [writing, meeting, agenda, productivity, document]
---

## What This Does

Takes a plain-language description of a meeting (goal, attendees, topics) and outputs a structured markdown agenda: title, objectives, timed agenda table with owners, pre-meeting prep, and a follow-up action item template.

## How to Continue Building This

- **Send via email**: Append `builtin.gmail` with `gmailMode: "send"` to distribute the agenda to attendees automatically.
- **Pull from calendar**: Add a `builtin.googleCalendar` step first to extract the meeting details, then feed into `llmGenerate`.
- **Customize for meeting type**: Create variants with different `userPrompt` templates — 1:1 check-in, design review, retrospective, board meeting.

### Critical Entry Points
- **`steps[0].config.userPrompt`** — the entire agenda structure is here. The timing table and action item template are intentional; remove them if your meetings don't use that format.
- The "front-load decision items" rule in the prompt is a productivity pattern — remove it if you want a different meeting structure.

### Key Concepts
- Input can be very brief (one sentence) or detailed (several paragraphs). The LLM fills in reasonable defaults for anything not specified.
- `llmMaxTokens: "1600"` is enough for a typical 6-8 item agenda. Increase for very long meetings with many agenda items.
