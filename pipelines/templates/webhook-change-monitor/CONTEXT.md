---
artifact:
  type: pipeline
  id: official.pipeline.webhook-change-monitor
  name: Webhook Change Monitor
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-06
  updated_at: 2026-05-06

purpose:
  summary: Polls a URL on a schedule and fires a desktop notification when content changes meaningfully.
  problem_solved: Watching pages or endpoints for changes manually is tedious; LLM filtering eliminates noise.
  intended_users: Anyone monitoring status pages, pricing pages, job boards, or API endpoints for changes.

architecture:
  language: json
  frameworks: [pipeline-engine]
  platform: mchatai-plus
  has_ui: false
  requires_auth: false

dependencies:
  external_apis: [configurable-url]
  internal_services: [builtin.webExtract, builtin.llmGenerate, builtin.notify]
  storage: none

development:
  main_file: pipeline.json
  config_file: manifest.json
  entry_points: [steps[0].config.url, steps[1].config.userPrompt]
  build_command: none
  test_command: "Run pipeline twice against a page that has changed. Verify first run notifies, stable run is silent."
  deploy_command: "refreshMchataisourceCache in mChatAI+. Schedule on 30-60 minute interval."

tags: [monitor, webhook, web, alert, automation]
---

## What This Does

Fetches a configured URL, passes the content to an LLM that detects meaningful changes (not noise), and fires a notification if something changed. Returns `NO_CHANGE` silently when nothing noteworthy happened.

## How to Continue Building This

- **Track multiple URLs**: Duplicate the pipeline with different `url` values, or add a `forEachLoop` step over a list of URLs.
- **Save a change log**: Add `builtin.saveArtifact` when content changes so you have a history.
- **Add a condition gate**: Insert `builtin.condition` after `llmGenerate` to only proceed to notify when output is NOT `"NO_CHANGE"`.
- **Monitor a JSON API**: Change `webExtract` to `httpWebhook` with `method: "GET"` for API endpoints, then add `jsonTransform` to pull specific fields before the LLM step.

### Critical Entry Points
- **`steps[0].config.url`** — the URL to monitor. Replace the placeholder with your target.
- **`steps[1].config.userPrompt`** — the change detection logic. The `NO_CHANGE` sentinel keeps notifications clean. Customize "what counts as meaningful" for your use case.

### Key Concepts
- This pipeline has no memory of previous states — the LLM detects changes based on content analysis, not a diff. For true diff-based monitoring, you'd need to store previous content in a file and compare.
- Schedule at 30-60 minute intervals to avoid hammering targets. `builtin.webExtract` respects robots.txt.
