---
artifact:
  type: pipeline
  id: official.pipeline.web-research-brief
  name: Web Research Brief
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-06
  updated_at: 2026-05-06

purpose:
  summary: Searches the web for a topic and synthesizes results into a sourced research brief.
  problem_solved: Manual web research is slow; this automates the search-read-summarize cycle.
  intended_users: Anyone who needs fast, sourced answers on a topic without deep-diving manually.

architecture:
  language: json
  frameworks: [pipeline-engine]
  platform: mchatai-plus
  has_ui: false
  requires_auth: false

dependencies:
  external_apis: [web-search, any-public-url]
  internal_services: [builtin.webSearch, builtin.webExtract, builtin.llmGenerate, builtin.saveArtifact]
  storage: artifacts

development:
  main_file: pipeline.json
  config_file: manifest.json
  entry_points: [steps[0].config.maxResults, steps[2].config.userPrompt]
  build_command: none
  test_command: "tunnel runPipeline 'Web Research Brief' --input 'latest developments in AI agents'"
  deploy_command: "refreshMchataisourceCache in mChatAI+"

tags: [research, web, search, summarize, intelligence]
---

## What This Does

Three-step research pipeline: web search → extract top page content → LLM synthesizes a structured brief with summary, key findings, sources, and suggested follow-ups. Output saved as a markdown artifact.

## How to Continue Building This

- **Add audio**: Append TTS chain to produce a spoken version of the brief.
- **Deeper extraction**: Add multiple `webExtract` steps (one per URL from search results) before the synthesis step to get richer source material.
- **Perplexity variant**: Replace `builtin.webSearch` + `builtin.webExtract` with `builtin.perplexitySearch` for a single-step web research call with citations built in.
- **Save to memory**: Append `builtin.memorySearch` (write mode) to index the brief for future recall.

### Critical Entry Points
- **`steps[0].config.maxResults: "5"`** — number of search results fetched. More = richer context but longer runtime and more tokens.
- **`steps[1].config.maxChars: "40000"`** — cap on extracted page content. Reduce if hitting token limits.
- **`steps[2].config.llmMaxInputChars: "12000"`** — secondary safety cap at the LLM step. Search results + page content can be large.

### Key Concepts
- `webSearch` output feeds `webExtract` — the search returns URLs, extract reads their content.
- The "do not hallucinate" instruction in the prompt is load-bearing for research briefs — keep it.
- `includeMetadata: "true"` on webExtract preserves source URLs in the output for the Sources section.
