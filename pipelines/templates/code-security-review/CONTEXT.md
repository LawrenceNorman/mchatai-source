---
artifact:
  type: pipeline
  id: official.pipeline.code-security-review
  name: Code Security Review
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-06
  updated_at: 2026-05-06

purpose:
  summary: Reads a source file and produces a structured security and bug review report.
  problem_solved: Security reviews are often skipped because they're slow; this automates a first pass.
  intended_users: Developers who want a quick automated pre-review before submitting code.

architecture:
  language: json
  frameworks: [pipeline-engine]
  platform: mchatai-plus
  has_ui: false
  requires_auth: false

dependencies:
  external_apis: []
  internal_services: [builtin.readFile, builtin.llmGenerate, builtin.saveArtifact]
  storage: artifacts

development:
  main_file: pipeline.json
  config_file: manifest.json
  entry_points: [steps[0].config.path, steps[1].config.userPrompt]
  build_command: none
  test_command: "Set path to a real source file. Run pipeline. Verify report artifact is saved."
  deploy_command: "refreshMchataisourceCache in mChatAI+"

tags: [dev, security, code-review, bugs, analysis]
---

## What This Does

Reads a configured file path, runs the code through a security-focused LLM review prompt, and saves a structured report covering: security issues (with severity ratings), bugs/logic errors, and code quality observations.

## How to Continue Building This

- **Review a whole directory**: Replace `readFile` with `findInFiles` to gather code snippets, then pass to `llmGenerate`.
- **Add a notify**: Append `builtin.notify` so you get a ping when the review completes.
- **Scope the review**: Change the `userPrompt` to focus on a specific concern — e.g. "focus only on SQL injection and authentication bypasses" or "focus only on memory safety in Swift."
- **CI integration**: Wire via `shell.cliExecute` to trigger on `git commit` by calling the pipeline from a git hook script.

### Critical Entry Points
- **`steps[0].config.path`** — absolute path to the file to review. Must be accessible to mChatAIShell.
- **`steps[1].config.llmMaxInputChars: "8000"`** — limits file size passed to LLM. Large files (>500 lines) may be truncated; for those, consider splitting the file first.
- **`steps[1].config.userPrompt`** — the review framework. The severity scale (Critical/High/Medium/Low) and "None found" instruction are load-bearing — keep them for consistent output.

### Key Concepts
- LLM security review is a first-pass tool, not a replacement for a human security audit or SAST tool. Treat findings as leads to investigate.
- `llmMaxTokens: "2400"` gives enough budget for a detailed report on a typical 100-300 line file.
