# LLM Catalog — Schema

> Where every consumer in the mChatAI platform learns which models exist, what
> they cost, and which to fall back to when a SKU retires.

This directory is the **single source of truth** for the LLM model catalog.
Per CLAUDE.md ABSOLUTE RULE #1, shipped binaries (mChatAI+ macOS, mChatAI iOS,
mchataiweb Cloud Functions) contain only generic infrastructure — the actual
model list lives here, in mchatai-source. Updates ship in seconds via `git
push`, not weeks via App Store review.

## Layout

```
llm-catalog/
├── SCHEMA.md                        ← this file
├── schema/
│   └── provider.schema.json         ← JSON Schema (Draft 2020-12)
├── providers/
│   ├── anthropic.json               ← one file per provider
│   ├── apple.json                   ← on-device, syncSource: hand-maintained
│   ├── deepseek.json
│   ├── google.json
│   ├── mistral.json
│   ├── ollama.json                  ← hand-maintained (user-local models)
│   ├── openai.json
│   ├── openrouter.json
│   ├── perplexity.json
│   ├── together.json
│   └── xai.json
└── _index.json                      ← top-level: escalation ladders, version
                                       (added in Phase P3)
```

`mchataiCloud` is intentionally NOT a file. Its model list is computed by
consumers from the underlying providers (Anthropic / OpenAI / Google) times
a single markup multiplier (currently `1.20`) declared in code. Keeping it
computed avoids drift between the cloud file and the upstream providers it
resells.

## ⚠️ Upstream dependence — OpenRouter is the source of truth

This catalog is a **weekly mirror of OpenRouter's `/api/v1/models` response**,
not a hand-maintained list. The cron at
`mchataiweb/functions/src/model-catalog-sync.js`:

1. Fetches `https://openrouter.ai/api/v1/models` every Monday 09:00 UTC.
2. For each `syncSource: "cron"` provider file, mirrors OpenRouter's listing
   for that provider, preserving hand-curated overlay fields (see below).
3. Commits direct-to-main when something meaningful changed.

**Why we trust OpenRouter for this:**
- Free, no-auth read endpoint (no per-provider API keys to manage).
- Up-to-date pricing (cross-checked vs. provider pricing pages — matches as
  of 2026-05-14 for sampled SKUs).
- Aggregates every major provider in one shape.

**Risks worth knowing:**

| Risk | Mitigation |
|---|---|
| OpenRouter goes out of business / `/api/v1/models` URL changes | Bundled fallback catalogs ship inside mChatAI+. Direct API calls still work. Admin dashboard health pill (see below) goes red if cron hasn't run in 14+ days. |
| OpenRouter response shape changes silently | Cron will throw on schema mismatch (`data not array`). Health pill goes red, last-error surfaces on the admin dashboard. |
| Provider rebrands a model under a new name (e.g., `gemini-2.0-flash` → `gemini-2.0-flash-001`) | Cron uses OpenRouter's name. Old entries are retained verbatim in the file (not deleted), pricing not refreshed; surfaced in the dashboard summary so a human can hand-retire/replace. |
| OpenRouter pricing diverges from provider-direct pricing | Possible but rare. Firestore `DynamicConfigService.modelCatalogOverrides` is the hot-patch escape hatch; consumer can also hard-code a price override per model. |
| Provider exits OpenRouter entirely (model disappears) | Models in current catalog but absent from OpenRouter snapshot are **retained verbatim** — never auto-removed. Surfaced in the commit message and admin summary for human review. |

### Health-check contract (admin dashboard)

The cron writes a status doc to Firestore at `system_status/modelCatalogSync`
on every run — success, no-op, and failure paths all write. Shape:

```js
{
  lastRanAt: <serverTimestamp>,
  lastRanAtISO: "2026-05-14T09:00:13.221Z",
  lastOutcome: "success" | "no-op" | "failure",
  lastError: null | "OpenRouter /models: HTTP 503",
  lastErrorStack: null | "...",
  openRouterModelsSeen: 364,
  lastSummaryMarkdown: "# Model Catalog Sync — 2026-05-14 ...",
  lastCommits: [
    { providerID, sha, commitURL, addedCount, priceChangedCount, retainedCount }
  ],
  lastProviderResults: { /* per-provider summary */ }
}
```

The admin dashboard reads this doc and shows a colored status pill:

- **🟢 Green** — `lastRanAt` within the last 8 days, `lastOutcome != "failure"`.
- **🟡 Yellow** — `lastRanAt` between 8 and 14 days ago (one missed cycle).
- **🔴 Red** — `lastRanAt` more than 14 days ago, OR `lastOutcome === "failure"`.

The pill is clickable; the detail view shows `lastSummaryMarkdown` and links
to the commits in `lastCommits`. Admin can also force a wet run via the
`runModelCatalogSyncOnDemand` callable function (defaults to dry-run for
safety — pass `{ dryRun: false }` to actually commit).

If you see red on the pill, the runbook at
`mchataiweb/docs/MODEL_CATALOG_SYNC.md` covers diagnosis + recovery.

## Provider file shape (`providers/<id>.json`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `providerID` | string | yes | Must match the filename. `^[a-z][a-z0-9-]*$`. |
| `displayName` | string | yes | Human label. |
| `apiBaseURL` | string (URI) | yes | The chat-completions endpoint. |
| `apiStyle` | enum | yes | `anthropic` / `openai` / `google` / `ollama`. |
| `keychainKey` | string | yes | macOS/iOS Keychain key. Node consumers ignore. |
| `defaultModel` | string | yes | Must be the `name` of an `active` model in this file. |
| `lastSyncedAt` | date | yes | When the cron last touched (or the date of the most recent hand-edit). |
| `syncSource` | enum | yes | `cron` (sync may rewrite) / `hand-maintained` (cron leaves alone). |
| `models[]` | array | yes | One or more model entries. |

### Per-model fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Provider SKU. Unique within this file. |
| `displayName` | string | yes | Human label shown in pickers. |
| `status` | enum | yes | `active` / `deprecated` / `retired`. |
| `addedAt` | date | optional¹ | When the model first appeared. |
| `deprecatedAt` | date | conditional | Required when `status == "deprecated"`. |
| `retiredAt` | date | conditional | Required when `status == "retired"`. |
| `replacedBy` | string | conditional | Required when `status == "retired"`. Names another model (same or `providerID:name`). |
| `inputPerMillion` | number | yes | USD per 1M input tokens. |
| `outputPerMillion` | number | yes | USD per 1M output tokens. |
| `pricingSource` | enum | optional | `openrouter` / `provider-direct` / `hand-maintained` / `on-device` / `unknown`. |
| `costTier` | enum | yes | `low` / `medium` / `high` — picker bucket. |
| `equivalentTier` | enum | yes | `T0-fast` / `T1-balanced` / `T2-power` — ladder rung. |
| `capabilities[]` | enum array | yes | Subset of `chat, vision, thinking, reasoning, search, code, audio, file`. |
| `contextTokens` | integer | optional | Max input window. |
| `maxOutputTokens` | integer | optional | Provider cap on output. |
| `notes` | string | optional | Free-form, never read by code. |

¹ `addedAt` is optional for legacy entries (we don't know when each existing
model first shipped). The cron sets it whenever it inserts a fresh model.

### Status semantics (the contract every consumer must honor)

- **`active`** — pickers offer it freely. This is the default state.
- **`deprecated`** — still callable. Pickers may show a badge. The cross-provider
  failover ladder should prefer `active` siblings over `deprecated` ones at the
  same tier. Planner / wizard shouldn't pick `deprecated` for new work.
- **`retired`** — *not callable anymore*. A request for a `retired` model name
  MUST be transparently resolved to `replacedBy` before sending. This is the
  fix for the gemini-2.0-flash-lite class of 404s.

`replacedBy` may be a bare model name (same provider, e.g. `gemini-2.5-flash`)
or a `providerID:name` cross-provider hop (e.g. `anthropic:claude-sonnet-4-6`)
when the provider has fully exited a tier.

### Capabilities — `thinking` vs `reasoning`

Distinct on purpose:

- **`thinking`** — Gemini-style extended-thinking with a token budget that
  counts against `maxTokens`. Consumer code budgets 800+ tokens for validation
  steps (see `CLAUDE.md` § Common Pitfalls #2).
- **`reasoning`** — o-series (OpenAI), R1 (DeepSeek), Sonar-Reasoning
  (Perplexity). Hidden chain-of-thought; consumer doesn't manage the budget.

A model is one, the other, or neither. None is both today.

## Who writes to this directory

| Path | Writer | Cadence |
|---|---|---|
| `providers/<id>.json` where `syncSource == "cron"` | `scheduledModelCatalogSync` Cloud Function | Weekly (Mon 09:00 UTC) — mirrors OpenRouter's listing |
| `providers/apple.json`, `providers/ollama.json` | Humans only, via PR | When models change |
| `providers/together.json` | Humans only (name-mismatch with OpenRouter prevents auto-sync) | When models change |
| `schema/provider.schema.json` | Humans only, via PR | Rarely (schema versioning) |
| `_index.json` | Humans for ladders; cron for `lastSyncedAt` | Weekly |
| `SCHEMA.md` | Humans only, via PR | When the schema changes |

### Hand-curated overlay fields (cron preserves these across rebuilds)

When the cron rebuilds a provider file, it carries forward these fields
**by name match** so human curation isn't lost:

- `displayName` — your preferred label (without "Google:" prefix etc.)
- `status` — `active` / `deprecated` / `retired`
- `replacedBy`, `deprecatedAt`, `retiredAt` — lifecycle metadata
- `addedAt` — when the entry first appeared
- `costTier`, `equivalentTier` — picker bucket + ladder rung
- `capabilities[]` — capability flags
- `notes` — free-form humans-only context

The cron refreshes only `inputPerMillion`, `outputPerMillion`, `pricingSource`
(set to `"openrouter"`), and `contextTokens`. For models seen for the first
time, the cron uses heuristics for `costTier`/`equivalentTier` and stamps a
`notes` field asking for human review.

The cron uses the existing `MCHATAI_SOURCE_GITHUB_TOKEN` Firebase Functions
secret and commits direct-to-main via Octokit — same pattern as
`mchataiweb/functions/src/template-promotion.js`. No PRs. Each cron commit
is attributed `Co-Authored-By: ModelCatalogSync CloudFunction
<noreply@mchatai.com>` so it's easy to revert if a sync misbehaves.

## Who reads from this directory

| Consumer | Path | Mechanism |
|---|---|---|
| mChatAI+ macOS | `ProviderCatalogService` extends `ModelCatalogService` | mchatai-source cache, hot-patched via Firestore `DynamicConfigService.modelCatalogOverrides` |
| mChatAI iOS | Same Service via CloudKit sync from macOS | Same |
| mchataiweb Cloud Functions | `getProviderCatalog()` in `src/lib/llmCatalog.js` | raw.githubusercontent fetch + 5min TTL + bundled fallback |
| `LLMCostTracker.swift` | Reads pricing from `ProviderCatalogService` | Same as mChatAI+ |
| `OpenRouterCatalogService.swift` | Reads from `providers/openrouter.json` | Same as mChatAI+ (no separate fallback file) |

Bundled `Resources/.../model-catalog.json` becomes a **frozen offline
first-launch fallback only**, carrying `_fallback_only: true` and
`_source_of_truth: "llm-catalog/providers/"` — same convention as bundled
wisdom packs. Don't hand-edit it.

## Validation

Every PR that touches `providers/*.json` must validate against
`schema/provider.schema.json`:

```bash
jsonschema -i providers/google.json schema/provider.schema.json
# (exit 0 = valid)
```

CI (added in Phase P3) runs the same check for every file in `providers/`.

## Override / hot-patch escape hatch

Anything in this directory can be overridden at runtime via Firestore
(`DynamicConfigService.modelCatalogOverrides`) without a git push or rebuild.
Override shape mirrors the per-model shape; consumer merges source-cache then
applies Firestore patches (Firestore wins).

Use this when a provider retires a model faster than the weekly cron can
react. Once the retirement lands in this directory on the next cron cycle,
delete the Firestore patch to keep the override surface small.

## Versioning

The schema is unversioned for now. The catalog is forward-additive: adding
new optional fields, new enum members, or new providers is always safe.
Removing or renaming a required field is breaking and requires a coordinated
ship across all consumers — that should go through a real RFC.
