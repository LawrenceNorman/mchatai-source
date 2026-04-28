# Ollama Catalog Refresher

Reference material for the **in-app** weekly Ollama catalog discovery feature in mChatAI+. This directory used to describe a `/schedule` Claude Code routine — that approach was scrapped in favor of building the discovery into mChatAI+ itself, where every user with the toggle on contributes to keeping the catalog current.

The Swift implementation lives in [`mchatai_macOS/mChatAI/mChatAI/Services/OllamaCatalogDiscoveryService.swift`](../../../mchatai_macOS/mChatAI/mChatAI/Services/OllamaCatalogDiscoveryService.swift). The settings toggle is in [`AIAutomation/OllamaDiscoveryToggleRow.swift`](../../../mchatai_macOS/mChatAI/mChatAI/AIAutomation/OllamaDiscoveryToggleRow.swift).

## What the in-app feature does

1. User flips on **AI Automation → Ollama (Local AI) → "Auto-discover new Ollama models weekly"**.
2. mChatAI+ scrapes [ollama.com/library?sort=newest](https://ollama.com/library?sort=newest) on app launch and every 6h thereafter, but the actual fetch is gated to "last fetch > 7 days ago" — effectively weekly.
3. The diff finds every model on ollama.com whose base name isn't in `harness/ollama-catalog.json`.
4. Discoveries appear in the **Discover Models** browser as a horizontal strip of "Provisional · community-discovered" cards above the canonical catalog.
5. The user clicks **Suggest** on a provisional card → mChatAI+ opens a pre-filled GitHub issue against the `mchatai-source` repo with the model's name, sizes, and description.
6. A reviewer (Lawrence or any maintainer) reads the issue, fills in the metadata per the rules below, and opens a PR adding the entry to `harness/ollama-catalog.json`.
7. On merge, every running mChatAI+ install picks up the catalog update on its next 6h refresh — no rebuild required.

## Why in-app instead of a scheduled remote agent

The original Phase D plan was a `/schedule` routine. Three things were wrong with that:

- Only the registrant could run it. Lawrence's account had to be active for the catalog to refresh.
- End users got zero benefit — they couldn't help discover new models.
- It needed external infrastructure to ship discoveries (PR auth, etc.).

The in-app version is a **distributed discovery network**. Every user opted in is a sensor. False positives are cheap (just an issue) and the human-in-the-loop review prevents the catalog from getting polluted by misidentified models.

## Metadata rules for human reviewers

When you process an "ollama-discovery" issue and add the model to `harness/ollama-catalog.json`, follow these defaults:

| Field | Default | Why |
|---|---|---|
| `recommended` | `false` | Recommendation is editorial. Promote to `true` only after testing. |
| `wizardRole` | `null` | Routing/vision/embedding role assignments need explicit testing for whether the model is good at that role. |
| `tag` | inferred from size | tiny <2GB, small <4GB, medium <10GB, large <25GB, huge ≥25GB |
| `capabilities` | `["chat"]` plus inferred from name/description | "vl"/"vision" → vision, "coder"/"code" → code, "embed" → embedding (replace), "tools"/"agentic" → tools, description mentions "reasoning"/"thinking" → reasoning, "multilingual" → multilingual |
| `releaseDate` | today (UTC) | Drives the "NEW" badge in the browser sheet for 90 days. |
| `family` | existing family id when name prefix matches | `qwen3:8b` → `qwen`, `llama3.3:70b` → `llama`, `glm-4.7-flash` → `glm`. If genuinely new (rare), add a new entry to `families[]` first. |
| `description` | one factual sentence | What the model is, what it's good at. No marketing language. The provisional card already shows the upstream description — borrow as needed. |
| `sizeGb` / `sizeLabel` | exact value from the model's tags table on ollama.com | Don't estimate — the `Suggest` issue doesn't include exact sizes. Click through to the Ollama page. |

## Failure modes

- **ollama.com unreachable / parse fails** — `OllamaCatalogDiscoveryService.runDiscoveryNow` throws `parseFailed`. The toggle UI surfaces an orange status banner. The user retries via "Check Now" or waits a week. No silent staleness.
- **Page structure changed** — the regex in `parseListingHTML` returns []; the service treats this as `parseFailed("zero models extracted")`. Fix: update the regex in the Swift source. Ship a new build.
- **A discovery is wrong** (e.g. a typo in a model name on ollama.com) — user dismisses it from their local strip. The dismissal is per-user; doesn't affect anyone else.

## When to remove this directory

When every model in `mchatai-source/harness/ollama-catalog.json` is sourced from a merged "ollama-discovery" issue, this directory's prompt content (the metadata rules) belongs in the Swift source as inline comments instead of here. Until then, this README is the one place a reviewer can find the rules without diving into Swift.
