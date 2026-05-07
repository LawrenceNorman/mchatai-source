---
artifact:
  type: pipeline
  id: official.pipeline.csv-to-report
  name: CSV to Report
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-06
  updated_at: 2026-05-06

purpose:
  summary: Analyzes pasted CSV data with an LLM and produces a structured insights report.
  problem_solved: Raw CSV data requires manual analysis; LLM can extract stats and patterns instantly.
  intended_users: Anyone handling data exports from tools (CRMs, analytics, spreadsheets) who wants fast insights.

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
  test_command: "tunnel runPipeline 'CSV to Report' --input 'name,score,date\\nAlice,92,2026-01\\nBob,78,2026-02'"
  deploy_command: "refreshMchataisourceCache in mChatAI+"

tags: [data, csv, analysis, report, insights]
---

## What This Does

Paste CSV as input text. LLM analyzes the data and outputs a structured report: dataset overview, key statistics per column, patterns and insights, and recommended actions. Saved as a markdown artifact.

## How to Continue Building This

- **Read from file**: Replace text input with `builtin.readFile` step to load a CSV from disk, then pipe into `llmGenerate`.
- **Add a chart description**: Ask the LLM to also describe what charts would best visualize the data.
- **Domain-specific analysis**: Customize the prompt for specific data types — sales data, survey results, server logs, A/B test results.

### Critical Entry Points
- **`steps[0].config.llmMaxInputChars: "8000"`** — CSV can be large. This cap keeps it within token budget. For wide/long CSVs, consider pre-processing to sample rows.
- **`steps[0].config.userPrompt`** — adjust the analysis format for your domain. The default is general-purpose.

### Key Concepts
- This pipeline uses `llmGenerate` directly on CSV text — no parsing step. The LLM infers column types from the data. Works well for clean CSV; for messy data consider adding a `builtin.csvTable` step first to normalize.
- `llmMaxTokens: "2400"` handles reports for datasets up to ~200 rows comfortably.
