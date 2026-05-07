---
artifact:
  type: pipeline
  id: official.pipeline.telegram-kb-bot
  name: Telegram Knowledge Base Bot
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-06
  updated_at: 2026-05-06

purpose:
  summary: Polls Telegram for incoming messages, searches your personal knowledge base, and sends an AI reply.
  problem_solved: Lets you query your own notes and knowledge base via Telegram from anywhere.
  intended_users: Power users who want a personal AI assistant accessible from their phone.

architecture:
  language: json
  frameworks: [pipeline-engine]
  platform: mchatai-plus
  has_ui: false
  requires_auth: true

dependencies:
  external_apis: [telegram-bot-api]
  internal_services: [builtin.telegram, builtin.memorySearch, builtin.llmGenerate]
  storage: none

development:
  main_file: pipeline.json
  config_file: manifest.json
  entry_points: [steps[2].config.systemPrompt, steps[0].config.offsetStoreKey]
  build_command: none
  test_command: "Send a message to your Telegram bot, run pipeline, verify reply arrives."
  deploy_command: "refreshMchataisourceCache in mChatAI+. Schedule as recurring automation."

tags: [telegram, bot, knowledge-base, messaging, ai-assistant]
---

## What This Does

Four-step loop: poll Telegram for new messages → search personal knowledge base with the message as a query → generate a reply grounded in the knowledge base results → send the reply back via Telegram. Designed to run on a schedule (e.g. every 5 minutes).

## How to Continue Building This

- **Schedule it**: Set a recurring 5-minute trigger so it continuously polls.
- **Skip KB lookup**: Remove the `memorySearch` step and pass the Telegram message directly to `llmGenerate` for a general-purpose assistant.
- **Add web search**: Replace `memorySearch` with `builtin.webSearch` for live web-grounded answers.
- **Multi-step routing**: Add a `builtin.condition` step to route urgent keywords (e.g. "URGENT") to a different response path.

### Critical Entry Points
- **`steps[0].config.skipStepsIfNoMessage: "2"`** — if no new Telegram messages, skip 2 steps (the memorySearch and llmGenerate) and go straight to the no-op send. This prevents empty responses.
- **`steps[0].config.offsetStoreKey`** — unique key per bot instance. Change if running multiple Telegram bot pipelines to avoid offset collision.
- **`steps[2].config.systemPrompt`** — customize the bot's persona and rules here.

### Key Concepts
- Requires Telegram Bot Token in AI Automation → Network → Telegram.
- `persistOffset: "true"` ensures the bot doesn't re-process old messages on each run.
- The `skipStepsIfNoMessage` mechanism means this pipeline is safe to run on a tight schedule — it exits quickly when idle.
