# QA Flywheel — Quality Measurement & Saturation Gate (Move 2, 2026-06)

## Why this exists

The flywheel's original meter was **binary pass/fail + console-error count + auto-fix turns**. On the high-quality codex path all three pin to ceiling/floor regardless of the change under test — which is exactly why **PEEK.1's A/B was INCONCLUSIVE** (12/12 sessions ON and OFF both produced 0 errors / 1 turn). You can't tell "cool vs a failure" with a meter that's always reading the same number.

Move 2 adds the **un-saturated** signals that already live in the telemetry, plus a **saturation pre-flight gate** so a change is never A/B'd on a surface where the relevant metric can't move.

## The signals

| Metric | Lane | Source | Notes |
|---|---|---|---|
| `okRate` | performance | run `status` | Saturated within a controlled cell (codex → always 1). |
| `wizardTurns`, `durationSec`, `outputChars` | performance | run JSONL | Vary, but say nothing about *quality*. |
| `autoFixAttempts` | performance | session `autoTestFixAttempts` | Floor-pinned today (median 0). |
| **`capabilityCoverage`** | **quality** | run `capabilities_found / capabilities_expected` | A run can be `status=ok` yet find **0/2** expected capabilities (e.g. a "morse code" mini-app with no AudioContext). The strongest quality signal already present — **saturated on miniApp, has headroom on macOSApp.** |
| **`visionScore`** (0–10) | **quality** | run `vision_score` (when captured) | "Is the rendered artifact visually coherent + on-target?" The single highest-value addition to un-saturate the miniApp canary loop. `insufficient` until canaries capture it (see below). |
| **`publishRate`** | **quality** | session `publishedEndProductID` | The user's own "worth keeping" vote. Real-user lane only (canary IDs don't join). Pinned at low N (~1.6%). |
| **`continuationRate`** | **quality** | session has >1 user message | The user kept iterating. ~23.7% over the real corpus — **non-saturated**. Real-user lane only. |

**Quality vs performance** is the load-bearing distinction: the gate judges on **quality** metrics, because a varying `okRate`/`duration` tells you nothing about whether the artifact got better.

## Honest diagnosis (current baseline)

- **miniApp (the web-components canary surface): quality-headroom = 0.** `capabilityCoverage` is saturated; `publishRate`/`continuationRate` don't join per-run. **You cannot A/B a quality change on miniApp today** — this is the PEEK.1 trap, now measured rather than felt.
- **macOSApp: quality-headroom = 1** (`capabilityCoverage` varies) — the SRP-recommended pilot surface, confirmed unsaturated where miniApp is not.
- **Real-user corpus:** `continuationRate` is the one non-saturated quality signal (≈0.24); `publishRate` too rare at current scale; `autoFixAttempts` floor-pinned.

**Conclusion:** to make the *canary* loop measurable for quality, capture a **per-run vision score**. Until then, gate paper/prompt changes onto macOSApp (or use the real-user `continuationRate`).

## Files

- `qaflywheel_quality.py` — shared metric extractor (run lane + session lane).
- `qaflywheel_saturation.py` — writes `saturation-baseline.json`, runs the **pre-flight gate**.
- `qaflywheel_aggregate.py` — `success-rates.json` now carries `schemaVersion: 2` + per-bucket `qualitySignals` (all v1 fields unchanged, additive).
- `saturation-baseline.json` — per-(bucket × metric) distribution + saturation verdict + `sessionCorpus` real-user lane.

## The gate (run before any A/B or paper kickoff)

```bash
# Certify a pilot surface has >=2 non-saturated QUALITY metrics; exit 1 if not.
python3 mchatai_macOS/scripts/qaflywheel_saturation.py --pilot macOSApp        # PASS bar = quality lane
python3 mchatai_macOS/scripts/qaflywheel_saturation.py --pilot miniApp         # FAILs today (quality-headroom 0)
python3 mchatai_macOS/scripts/qaflywheel_saturation.py --pilot miniApp --include-performance   # escape hatch
```

This is the **mandatory pre-flight** the optimization plan requires before any queued paper (incl. the SRP signal check) or prompt change is evaluated. Wire it into the canary suite / CI as a blocking step.

## Populating `visionScore` (the un-saturator)

Two interchangeable ways — both feed a `vision_score` field onto the run record so the existing pipeline picks it up automatically:

1. **Python grader (zero-rebuild):** render the installed `index.html`, screenshot it, send the image to the app's existing `diagVisualEvaluator` tunnel command, store the returned 0–10 score as `vision_score` on the run JSONL. Requires mChatAI+ running.
2. **Batch-B `diagSessionQualityScores` tunnel command (Swift, needs rebuild):** fires `diagVisualEvaluator` automatically on session completion and stamps the score into telemetry. Deferred to the rebuild engagement.

Once `vision_score` is present on runs, `capabilityCoverage` is no longer the only quality metric and the miniApp gate can pass.
