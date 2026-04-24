---
id: qa-flywheel
kind: meta
purpose: Versioned catalog of test goals driving the QAFlywheel — forces breadth across every artifact type + difficulty level so Phase LEARN's rubric ledger + proposer see enough diverse failure modes to learn from.
owner: platform
last_touched: 2026-04-23
---

# qa-flywheel — diverse test-goal catalog

## Purpose

Every entry in [`goal-catalog.json`](goal-catalog.json) is a prompt that gets fired at AIWizard (or a pipeline / agent / skill) by the [`qaflywheel_run_catalog.py`](../../mchatai_macOS/scripts/qaflywheel_run_catalog.py) harness. Results flow into:

1. A **per-run JSONL log** (`mchatai_macOS/scripts/qaflywheel_runs/*.jsonl`) capturing status, duration, `capabilities_found/missing`, and the `mchatai_source_head` SHA so rubric regressions can be bisected.
2. The existing **Phase LEARN rubric ledger** — `diagRubricTrend proposerNow` after each run cycle queues wisdom-rule proposals; `diagLearnPR dryRun:false` opens the draft PR to this repo.

The catalog is checked into `mchatai-source` on purpose: it hot-reloads via `refreshMchataisourceCache` and evolves alongside the content it tests. If we ever want the app itself to surface example prompts to users, the same file is the source.

## Coverage target (v1.0 ≈ 400 entries)

| Artifact type | L1 | L2 | L3 | Total |
|---|---|---|---|---|
| miniApp | 25 | 25 | 20 | 70 |
| webSPA | 15 | 20 | 15 | 50 |
| unityGame | 10 | 15 | 15 | 40 |
| pythonMicroservice | 15 | 20 | 15 | 50 |
| macOSApp | 15 | 15 | 15 | 45 |
| electronApp | 8 | 10 | 7 | 25 |
| androidApp | 8 | 12 | 10 | 30 |
| reactNativeApp | 8 | 12 | 10 | 30 |
| generic | 3 | 4 | 3 | 10 |
| pipelines | 5 | 5 | 5 | 15 |
| agents | 3 | 4 | 3 | 10 |
| endproducts | 10 | 10 | 5 | 25 |
| **Total** | **125** | **152** | **123** | **~400** |

v1.0 ships miniApp only. Other slices land as they're authored; each bump increments `catalog_version`.

## Difficulty rubric

- **L1** — Simple CRUD / single view / static content. <150 LOC target. Finishes in ≤ 1 wizard turn with a small maxTokens budget.
- **L2** — Non-trivial glue: state management, 2+ screens, one external API or framework primitive. Usually 1–2 turns.
- **L3** — Framework-heavy or stateful: shaders, audio graphs, ECS, multi-agent orchestration, persistent storage, network sync, MIDI, device sensors, live preview. Budget 3–4 turns + extended timeouts.

Rule of thumb when proposing a new entry: *"If I described this to a competent dev, how many hours would they budget?"* L1 ≈ <1h, L2 ≈ 1–4h, L3 ≈ 4h+.

## Per-entry schema

### Required
| Field | Type | Notes |
|---|---|---|
| `id` | string (slug) | Stable — never renumber. Convention: `<type-short>-<level>-<topic>-<NNN>`. |
| `goal` | string | The natural-language prompt passed to the tunnel. Write it how a real user would. |
| `artifact_type` | enum | One of: `miniApp`, `webSPA`, `unityGame`, `pythonMicroservice`, `macOSApp`, `electronApp`, `androidApp`, `reactNativeApp`, `generic`, `pipeline`, `agent`, `skill`, `endproduct-image`, `endproduct-tts`, `endproduct-quiz`, `endproduct-podcast`, `endproduct-article`, `endproduct-icon`. |
| `category` | enum | Domain tag. miniApp uses the 8 Swift-side values (`productivity`, `education`, `games`, `creative`, `utility`, `finance`, `health`, `social`); game genres mirror [`genres/catalog.json`](../genres/catalog.json) keys (`game-arcade`, `game-card`, `game-puzzle`, `game-word`, `game-roguelike`, `game-action-adventure`, `game-tower-defense`); microservices/agents use `research`, `media`, `devops`, `data` etc. |
| `difficulty` | `L1` \| `L2` \| `L3` | |
| `dispatch` | `runWizard` \| `runPipeline` \| `runAgent` \| `runSkill` | Drives which tunnel command the harness uses. |

### Optional
| Field | Type | Notes |
|---|---|---|
| `framework_hint` | string | Soft hint only (`three.js`, `audiokit`, `jetpack-compose`). **Never injected as a constraint** — purely analytical so the coverage report can slice by framework. |
| `expected_capabilities` | string[] | Substrings the harness greps in the generated artifact as a deterministic structural floor. Use real token/symbol names: `"localStorage"`, `"AudioContext"`, `"@Query"`. |
| `expected_wisdom_packs` | string[] | Packs we expect the wizard to fetch. Analytical only. |
| `max_turns` | integer | Override default (2 for L1/L2, 3–4 for L3). |
| `timeout_seconds` | integer | Override default (240 for L1/L2, 360–420 for L3). |
| `genre` | string | Required for `unityGame` and game-category miniApps. Must match a key in [`genres/catalog.json`](../genres/catalog.json). |
| `pipeline_name` | string | Required when `dispatch: runPipeline`. |
| `skill_id` | string | Required when `dispatch: runSkill`. |
| `skill_config` | object | Optional when `dispatch: runSkill`. |
| `notes` | string | Freeform — why this case is in the catalog, or why it's flaky. |
| `flaky` | bool | **New 2026-04-24.** Marks entries that have failed repeatedly in batch runs. Rotation strategies should **deprioritize** flaky entries until reworked — don't burn compute on a known hard case. Flip to false once the entry has a clean run post-rework. |
| `flaky_history` | array | **New 2026-04-24.** Append-only list of failure snapshots: `{run: "<ISO-stamp-slug>", tier: "L?", outcome: "<desc>", concurrency: N, note: "..."}`. Lets the coverage report + rotation picker see the failure pattern without scanning JSONL logs. |

## Non-negotiables

1. **Harness MUST NOT pass `provider` or `model`.** The capability grid + cascade ladder are authoritative ([feedback_qaflywheel_no_router_overrides.md](../../../../.claude/projects/-Users-lawrencenorman-mystuff-src-mchatai-platform/memory/feedback_qaflywheel_no_router_overrides.md), [gotchas_wizard_tunnel_openai_empty.md](../../../../.claude/projects/-Users-lawrencenorman-mystuff-src-mchatai-platform/memory/gotchas_wizard_tunnel_openai_empty.md)). The old `batch_wizard_use_cases.sh` script violated this — do not emulate. Harness ships with a hard assertion blocking those keys.
2. **Inbox protocol only.** `tunnel_send` from [`scripts/tunnel_helper.sh`](../../mchatai_macOS/scripts/tunnel_helper.sh). Never the legacy single-slot `request.json` — concurrent canaries will clobber each other.
3. **No Swift changes driven by this catalog.** Every failure is signal that content (mchatai-source, Firestore) or the skeleton's runtime loading needs improvement. If a goal seems to demand a Swift fix, that's the bug — file it and the LEARN loop will propose the content patch instead.
4. **`framework_hint` is a soft label, not a constraint.** The wizard's keyword-index does the framework lookup at runtime from the goal text; we're measuring that path, not bypassing it.

## Authoring workflow

1. Write entries as a diff to `goal-catalog.json`, bump `catalog_version` (date-a, date-b, …).
2. Run `python3 mchatai_macOS/scripts/qaflywheel_validate_catalog.py` (validator — ships with the harness) to confirm schema + unique IDs + genre cross-reference.
3. Smoke-test one entry: `./scripts/qaflywheel_run_catalog.sh --id <new-id> --count 1`.
4. Commit + push. Next `refreshMchataisourceCache` in a DEBUG build picks it up — no rebuild.

## Running a slice

```bash
# Daily miniApp rotation — 20 cases from L1+L2
./scripts/qaflywheel_run_catalog.sh \
  --artifact-type miniApp --difficulty L1 --difficulty L2 \
  --count 20 --shuffle --concurrency 2
```

See the harness `--help` for the full arg surface and [`docs/TUNNEL_COMMANDS.md`](../../mchatai_macOS/docs/TUNNEL_COMMANDS.md) for the underlying tunnel payloads.

## Closing the LEARN loop

Weekly ritual (Fri evening):
1. `./scripts/qaflywheel_coverage_report.sh` — see weakest artifact × criterion cells.
2. `diagRubricTrend` with `action:"pending"` — review queued wisdom-rule proposals.
3. Approve 1–3 with `diagLearnPR dryRun:false` — draft PRs land in this repo.
4. Review + merge. Next week's rotation measures the improvement.
