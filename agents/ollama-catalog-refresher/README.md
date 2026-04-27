# Ollama Catalog Refresher

Weekly agent that scans [ollama.com/library](https://ollama.com/library) for new models and opens a PR against this repo to keep [`harness/ollama-catalog.json`](../../harness/ollama-catalog.json) current. The mChatAI Discover Models sheet reads that catalog at runtime, so a merged PR ships to every installed app on its next launch — no rebuild required.

## Why this exists

Without this agent, the catalog drifts: Ollama publishes new models multiple times per month and the curated list bit-rots quickly. Hardcoding the list in the Swift binary used to be the bottleneck — that was fixed by [Phase A–C of the Ollama catalog migration](../../../mchatai_macOS/mChatAI/mChatAI/Services/OllamaModelCatalog.swift). This agent automates the *content* refresh that the new architecture makes safe.

## What it does, week by week

1. Fetch the library listing from `https://ollama.com/library` (HTML scrape — Ollama doesn't expose a JSON listing API today).
2. Parse out each model's `name`, approximate size, and tag list.
3. Diff against `harness/ollama-catalog.json`:
   - **New model** → add a draft entry (see metadata rules below).
   - **Existing model, size changed >10%** → update `sizeGb` and `sizeLabel`.
   - **Existing model, listing dropped** → leave it. Don't auto-remove. Models can disappear briefly during library updates; manual review handles real removals.
4. Validate the resulting JSON parses + every model has a known `family` and `tag`.
5. Open a PR titled `chore(ollama): catalog refresh YYYY-MM-DD` with the diff and a changelog body.

A human reviews and merges. On merge, every running mChatAI install picks up the new catalog within 6h via [`MchataisourceCacheService`](../../../mchatai_macOS/mChatAI/mChatAI/Services/MchataisourceCacheService.swift) (the periodic-refresh timer) — or immediately on next app launch.

## Metadata defaults for new models

The agent doesn't make permanent judgments — those belong to a human reviewer. For every new model the agent marks:

| Field | Default | Why |
|---|---|---|
| `recommended` | `false` | Recommendation is editorial. Promote to `true` only after manual review. |
| `wizardRole` | `null` | Routing/vision/embedding role assignments need explicit testing. |
| `tag` | inferred from size | tiny <2GB, small <4GB, medium <10GB, large <25GB, huge ≥25GB |
| `capabilities` | `["chat"]` plus any inferred from name | "vl"/"vision" → vision, "coder"/"code" → code, "embed" → embedding |
| `releaseDate` | today (UTC) | Drives the "NEW" badge in the browser sheet. |
| `family` | extracted from name prefix | `qwen3:8b` → `qwen`, `llama3.3:70b` → `llama`, etc. Fall back to `unknown` and let the reviewer fix. |
| `description` | one sentence from the agent | Short, factual. Reviewer can polish before merging. |

## Failure modes (and what the agent does)

| Failure | Behavior |
|---|---|
| ollama.com unreachable / parse fails | Open a tracking issue: `tracking: ollama-catalog-refresher needs human attention`. Exit non-zero. No PR opened. |
| Generated JSON fails schema validation | Validate; reject; re-ask the LLM once. If the second attempt also fails, file a tracking issue and exit. |
| No new models or size changes detected | No PR. Log "no-op". |
| Network flakes (intermittent 5xx) | Retry up to 3 times with backoff. |

The "no silent staleness" rule: the agent never opens a misleading "all good" PR; it either ships a real diff or visibly fails so a human knows to look.

## How to schedule

Run-once registration via the `/schedule` skill in Claude Code:

```
/schedule create \
  --cron "0 10 * * 0" \
  --name ollama-catalog-refresh \
  --prompt-file mchatai-source/agents/ollama-catalog-refresher/prompt.md
```

`0 10 * * 0` = every Sunday at 10:00 UTC. Adjust if you want a different cadence — Ollama's library updates a few times a week so anything between daily and biweekly is reasonable.

## How to dry-run

Before letting the agent open real PRs, do one manual run:

```
claude /schedule run-once ollama-catalog-refresh --dry-run
```

It will produce the diff + draft commit message but not push. Eyeball it. If it looks reasonable, switch to live runs.

## Where the catalog data lives

The single source of truth is [`mchatai-source/harness/ollama-catalog.json`](../../harness/ollama-catalog.json). All four mChatAI client apps (macOS, iOS, Windows Tauri, Linux Tauri) read from this same file via their respective `MchataisourceCacheService` equivalents. The agent never edits client code — only the JSON.
