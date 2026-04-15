# mchatai-source/harness/

**Phase HX — Harness Engineering**

This directory holds the content layer for the AIWizard "harness" — the parts the app
reads at runtime to decide *how* to run a generation, without needing a Swift rebuild.

See `mchatai_macOS/docs/HARNESS_ENGINEERING_SPEC.md` for the architectural rationale.

## Layout

```
harness/
├── README.md                  # this file
├── stages.json                # canonical HarnessStage enum + metadata
├── routing/
│   ├── default.json           # fallback ladder — general non-coding tasks
│   ├── coding-task.json       # Swift / JS / Python / Kotlin / etc. code generation
│   └── memory-agent.json      # Proactive Memory Agent (Phase MA) — small-model tier
└── context-recipes/           # (populated in Phase HX.2)
```

## Loading order (mirrors wisdom + prompts)

1. Live cache:     `~/Library/Application Support/mChatAI/source-cache/mchatai-source/harness/...`
2. Bundled snapshot: `Bundle.main/Resources/mchatai-source-snapshot/harness/...`
3. Firestore hot-patch (Phase HX Stage D+ via `DynamicConfigService`)
4. Swift bundled default (last-resort; lives in `Harness/*.swift` as `RoutingPolicy` literals)

On Swift side: `RoutingPolicyStore` (actor) reads routing/*.json, caches in memory, and
drops the cache on `invalidate()` (called after each successful mchatai-source pull).

## RoutingPolicy schema

Each `routing/<name>.json` conforms to:

```json
{
  "version": 1,
  "description": "Short human-readable description (optional)",
  "qualityBias": "bestQuality | lowestCost | lowestLatency | learned",
  "ladders": {
    "<ladder-name>": [
      { "backend": "claude-cli",   "condition": "cli.available",         "reason": "local-first, no token cost" },
      { "backend": "api:anthropic","condition": "credentials.anthropic", "reason": "cloud fallback" }
    ]
  }
}
```

### Backend ID conventions

| Form                                | Meaning                                              |
|-------------------------------------|------------------------------------------------------|
| `claude-cli`                        | Claude Code CLI via ShellBridge                      |
| `codex-cli`                         | OpenAI Codex CLI via ShellBridge                     |
| `gemini-cli`                        | Gemini CLI via ShellBridge                           |
| `api:anthropic`                     | Anthropic API, model chosen by routing bias          |
| `api:anthropic:claude-opus-4-6`     | Anthropic API, specific model pinned                 |
| `api:openai`                        | OpenAI API                                           |
| `api:google`                        | Google Gemini API                                    |
| `api:openrouter`                    | OpenRouter (any compatible model)                    |
| `ollama:<model>`                    | Local Ollama, e.g. `ollama:qwen3:32b`                |
| `apple-foundation-models`           | On-device Apple Intelligence (Phase AA.SLM)          |

### Condition vocabulary (v1)

Conditions are evaluated by the router (Swift side, Phase HX.1 P6+). Each condition is a
single string — there is no AND/OR syntax yet. If you need combined gates, split into
multiple ladder steps with the same backend and different reasons.

| Condition                      | Meaning                                                             |
|--------------------------------|---------------------------------------------------------------------|
| `always` *(or null/missing)*   | Step is always eligible                                             |
| `cli.available`                | The named CLI binary is present on PATH (detected via ShellBridge)  |
| `credentials.<provider>`       | API key for `<provider>` is present in the Keychain                 |
| `fallback`                     | Terminal catch-all — matches when no earlier step was eligible      |

### qualityBias semantics (when multiple steps pass their condition)

| Bias              | Chooses                                                            |
|-------------------|--------------------------------------------------------------------|
| `bestQuality`     | First step in declaration order (assumes authors ranked by quality)|
| `lowestCost`      | Cheapest backend from ProviderConfigService cost tiers             |
| `lowestLatency`   | Backend with best recent probe latency (BackendHealthStore)        |
| `learned`         | ModelQualityScorer winner for the current task category (HX.5)     |

## How to make a change

**All changes flow through a PR to this repo.** Zero Swift rebuild needed.

1. Edit the JSON.
2. `git add` + `git commit` + push.
3. On the next mchatai-source pull, `RoutingPolicyStore.invalidate()` is called and the
   new policy applies to the NEXT wizard turn.
4. For urgent rollbacks pre-PR, use the Firestore hot-patch path (reserved for HX Stage D+).

## Related specs

- `docs/HARNESS_ENGINEERING_SPEC.md` — architectural foundation
- `docs/HARNESS_GEARSHIFT_SPEC.md` — HX.3 capability grid + manual override
- `docs/PROACTIVE_MEMORY_AGENT_SPEC.md` — Phase MA (consumes `memory-agent.json`)
