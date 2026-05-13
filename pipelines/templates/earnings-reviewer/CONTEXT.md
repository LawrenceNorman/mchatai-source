---
artifact:
  type: pipeline
  id: official.pipeline.earnings-reviewer
  name: Earnings Reviewer
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-12
  updated_at: 2026-05-12

purpose:
  summary: Searches public earnings materials and drafts a sourced finance research report for human review.
  problem_solved: Operators and analysts need a quick, defensible first pass over public earnings information without losing citations or missing-data caveats.
  intended_users: Operators, founders, finance teams, market researchers, and analysts who need sourced public-company earnings briefs.

architecture:
  language: json
  frameworks: [pipeline-engine, artifact-type-system]
  platform: mchatai-plus
  has_ui: false
  requires_auth: false

dependencies:
  external_apis: [public-web-search]
  internal_services: [builtin.llmGenerate, builtin.webSearch, builtin.saveArtifact]
  storage: [pipeline-artifacts, ATS, Vault, AIWrite]

development:
  main_file: pipeline.json
  config_file: manifest.json
  entry_points:
    - steps[0].config.userPrompt
    - steps[1].config.maxResults
    - steps[2].config.userPrompt
    - steps[3].config.userPrompt
    - steps[4].config.productType
  test_command: "DebugTestTunnel runPipeline 'Earnings Reviewer' with input 'Apple most recent quarterly earnings review'"
  deploy_command: "refreshMchataisourceCache in mChatAI+"

tags: [finance, earnings, research, public-company, analyst-workflow]
---

## What This Does

`Earnings Reviewer` is the first Finance Workflows lighthouse pipeline. It turns a company/ticker and optional period into a targeted public web search, fetches top-result excerpts through `builtin.webSearch`, drafts a structured earnings report, runs a validator/finalizer pass, and saves a typed research report artifact.

The final artifact uses `com.mchatai.product.research.report`, so it can route through the existing artifact system without introducing a finance-specific product type.

## Expected Input

Use a company, ticker, and period if known:

- `Apple Q2 2026 earnings review`
- `MSFT most recent quarterly earnings`
- `Tesla latest earnings call risks and guidance`

If the period is omitted, the search query step looks for the most recent public earnings materials.

## Output Contract

The final report must include:

- Scope with company/ticker, reporting period, prepared date, and source coverage.
- Executive summary.
- Source coverage table with URLs.
- Key metrics found table.
- Management commentary.
- Delta from prior period or expectations.
- Risks and watch items.
- Missing Data / Follow-Up.
- Review note: `Draft analysis for human review. Not investment, tax, legal, accounting, or compliance advice.`

## Design Notes

- The pipeline intentionally uses public web search first. Do not add credentialed finance APIs until the no-auth workflow proves useful.
- The analyst prompt is conservative by design. Missing metrics should be marked missing instead of guessed.
- The validation pass is required. Finance workflows should have a second pass that checks citations, dates, missing data, and human-review language.
- This is a public-data workflow, so `dataSensitivity` is `public`. CSV/accounting workflows added later should use `confidential` or `restricted`.

## Extension Points

- Add a SEC EDGAR fetch step when a first-class no-auth SEC skill/provider exists.
- Add a transcript-specific fetch step if the user provides a transcript URL.
- Add a feed briefing variant that saves `com.mchatai.product.feed.briefing` for AIFeed dashboards.
- Convert to a DAG when adding human approval, parallel source retrieval, or filing/transcript-specific branches.
