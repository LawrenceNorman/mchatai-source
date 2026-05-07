---
artifact:
  type: pipeline
  id: official.pipeline.run-shell-and-summarize
  name: Run Shell & Summarize
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-06
  updated_at: 2026-05-06

purpose:
  summary: Runs a shell command and delivers an AI-written plain-English summary as a desktop notification.
  problem_solved: Shell output is verbose and cryptic; LLM translation makes it actionable at a glance.
  intended_users: Developers and power users who run scripts or diagnostics and want instant readable results.

architecture:
  language: json
  frameworks: [pipeline-engine]
  platform: mchatai-plus
  has_ui: false
  requires_auth: false

dependencies:
  external_apis: []
  internal_services: [builtin.shell.cliExecute, builtin.llmGenerate, builtin.notify]
  storage: none

development:
  main_file: pipeline.json
  config_file: manifest.json
  entry_points: [steps[0].config.command, steps[1].config.userPrompt]
  build_command: none
  test_command: "tunnel runPipeline 'Run Shell & Summarize'"
  deploy_command: "refreshMchataisourceCache in mChatAI+"

tags: [shell, dev, automation, notify, cli]
---

## What This Does

Runs a configurable shell command via mChatAIShell, passes the stdout output to an LLM for a plain-English 2-4 sentence summary, then fires a desktop notification with the result.

## How to Continue Building This

- **Save output**: Insert `builtin.saveArtifact` between `llmGenerate` and `notify` to keep a log.
- **Common commands to wire up**: `git status`, `df -h`, `npm test`, `xcodebuild ... | tail -20`, `ping -c 4 host`.
- **Error branch**: Add a `builtin.condition` step after `cliExecute` to check for non-zero exit codes and route to a different notify message.

### Critical Entry Points
- **`steps[0].config.command`** — replace the placeholder with your actual command. Commands run in mChatAIShell's environment (not sandboxed).
- **`steps[1].config.llmMaxInputChars: "4000"`** — shell output can be very long (e.g. build logs). This cap prevents token overflow. Increase if you need more context.

### Key Concepts
- `builtin.shell.cliExecute` runs via mChatAIShell (unsandboxed). The command has access to the user's full shell environment.
- `notifyBody: "{{INPUT}}"` in the notify step uses the LLM summary, not the raw shell output — macOS notification size limit makes this correct.
- macOS 26 App Management TCC may block execution of binaries in another app's container — see `gotchas_macos26_app_management_blocks_container_exec.md`.
