---
artifact:
  type: pipeline
  id: official.pipeline.daily-slack-summary
  name: Daily Slack Summary
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-06
  updated_at: 2026-05-06

purpose:
  summary: Reads pending todos and posts a standup-style daily summary to a Slack channel.
  problem_solved: Writing a daily standup manually takes time; todos already have the data.
  intended_users: Developers and team members who post daily standups in Slack.

architecture:
  language: json
  frameworks: [pipeline-engine]
  platform: mchatai-plus
  has_ui: false
  requires_auth: true

dependencies:
  external_apis: [slack-api]
  internal_services: [builtin.todoList, builtin.llmGenerate, builtin.slack]
  storage: none

development:
  main_file: pipeline.json
  config_file: manifest.json
  entry_points: [steps[2].config.channel, steps[1].config.userPrompt]
  build_command: none
  test_command: "Run pipeline, verify Slack message appears in target channel."
  deploy_command: "refreshMchataisourceCache in mChatAI+. Schedule at 9am daily."

tags: [slack, todos, productivity, standup, team]
---

## What This Does

Fetches pending todos, formats them as a standup-style Slack message (Slack markdown, emoji, 5-item cap), and posts to a configured channel. Best run on a 9am daily schedule.

## How to Continue Building This

- **Change channel**: Edit `steps[2].config.channel` — use `#dev`, `#standups`, or a DM channel ID.
- **Add yesterday's done items**: Change `includeCompleted: "true"` and update the prompt to include a "Completed yesterday" section.
- **Customize format**: Edit the `userPrompt` to match your team's standup format. Some teams prefer bullet tables; others prefer emoji-heavy summaries.
- **Add weather or news**: Insert a `webExtract` step before `llmGenerate` to include a morning news headline.

### Critical Entry Points
- **`steps[2].config.channel`** — the Slack channel to post to. Must match an existing channel the bot is a member of.
- **`steps[1].config.userPrompt`** — the standup format template. Slack markdown differs from GitHub markdown: use `*bold*` not `**bold**`, and `:emoji:` syntax.

### Key Concepts
- Requires Slack Bot Token in AI Automation → Network → Slack.
- `llmMaxTokens: "600"` enforces brevity — the standup should be quick to read.
- `includeCompleted: "false"` is intentional — only active work goes in a morning standup.
