---
artifact:
  type: pipeline
  id: official.pipeline.codebase-pattern-report
  name: Codebase Pattern Report
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-06
  updated_at: 2026-05-06

purpose:
  summary: Greps a codebase for a pattern and synthesizes an AI-analyzed report with priorities.
  problem_solved: Raw grep output lists matches but offers no interpretation of severity or patterns.
  intended_users: Developers doing tech debt audits, security sweeps, or refactor planning.

architecture:
  language: json
  frameworks: [pipeline-engine]
  platform: mchatai-plus
  has_ui: false
  requires_auth: false

dependencies:
  external_apis: []
  internal_services: [builtin.findInFiles, builtin.llmGenerate, builtin.saveArtifact]
  storage: artifacts

development:
  main_file: pipeline.json
  config_file: manifest.json
  entry_points: [steps[0].config.searchString, steps[0].config.directoryPath, steps[1].config.userPrompt]
  build_command: none
  test_command: "tunnel runPipeline 'Codebase Pattern Report'"
  deploy_command: "refreshMchataisourceCache in mChatAI+"

tags: [dev, code, search, analysis, refactor]
---

## What This Does

Recursively greps a directory for a configurable string/pattern, passes the match list to an LLM, and produces a structured report: summary stats, per-file breakdown, priority actions, and recurring themes.

## How to Continue Building This

- **Security sweep variant**: Change `searchString` to `"TODO: security"` or `"FIXME"` or `"force_cast"`.
- **Multiple patterns**: Add a second `findInFiles` step with a different pattern, then merge in the LLM prompt.
- **Scope to one directory**: Change `directoryPath` to a specific module or `src/` subdirectory.
- **Add notify**: Append `builtin.notify` so you get a ping when the report is done.

### Critical Entry Points
- **`steps[0].config.searchString`** — the grep pattern. Supports simple strings; not regex by default.
- **`steps[0].config.directoryPath`** — root of the search. Default is user home — change to your project root.
- **`steps[0].config.fileExtensions`** — comma-separated list. Extend or narrow to match your stack.
- **`steps[1].config.llmMaxInputChars: "6000"`** — large codebases can produce thousands of matches. This cap prevents overflow; the LLM will still analyze the visible subset.
