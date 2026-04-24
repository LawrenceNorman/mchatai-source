---
id: harness/self-learn
kind: content
purpose: Configuration + policy for Phase SelfLearn — the autonomous nightly QA Flywheel loop.
owner: platform
last_touched: 2026-04-24
phase: SelfLearn SL.1 (content files shipped; SL.2 coordinator pending)
---

# harness/self-learn — Autonomous Nightly QA Flywheel

## Purpose

SelfLearnCoordinator (Swift, shipping in SL.2) runs a slice of the goal catalog nightly, feeds results into the existing RubricLedger, and opens **draft PRs** to `mchatai-source` for wisdom/prompt improvements that clear confidence + sample-size gates. All policy lives here; the Swift side is pure mechanism.

See [docs/PHASE_SELFLEARN_SPEC.md](../../../mchatai_macOS/docs/PHASE_SELFLEARN_SPEC.md) in the app repo for the full phase plan.

## Files

### [`config.json`](config.json)

Top-level knobs:
- **`enabled`** — master switch (defaults false for SL.1; flip after SL.6 7-night soak passes)
- **`cadence.cron`** — when the coordinator fires (default 02:00 America/Los_Angeles)
- **`slice`** — what to pick from the catalog each run (artifact_types, difficulty_mix, entries_per_run, rotation_strategy)
- **`budget`** — hard cost cap per day + per entry; what to do on cap hit
- **`proposal_policy`** — confidence thresholds per proposal kind, auto-submit allowed, max PRs per night
- **`reporting`** — where nightly reports land (Firestore + local JSONL)
- **`safety`** — circuit breakers: consecutive-failure limits, revert-watch window, auto-downgrade of confidence on revert
- **`phased_rollout`** — written reminder of the week-by-week ship plan

### [`risk-matrix.json`](risk-matrix.json)

Maps proposal kinds (`wisdom_rule_add`, `planner_template_edit`, `complexity_tier_config`, etc.) → risk tier (low/medium/high/experimental) → auto-submit policy. Heart of the "what gets auto-PR'd vs. parked for human" decision. Overrides section tightens gates for outsized-blast-radius files like `wisdom/packs/universal.json`.

### [`rotation-strategies.json`](rotation-strategies.json)

How entries get picked each night. Five strategies:
1. **`weakest_first`** (default) — ledger-driven, targets compute where learning yields most
2. **`never_tested`** — catalog entries with zero ledger rows (quota-limited on top of primary)
3. **`recently_regressed`** — entries trending down, catches bad merges fast
4. **`balanced_mix`** — cold-start fallback, even-ish category spread
5. **`round_robin`** — for coordinator testing only

Composition rule: primary strategy fills most slots; quota strategies claim named slots; difficulty-mix filter enforces the blend.

## Non-negotiables

1. **Drafts only, never auto-merge.** Human clicks merge. Every time.
2. **`enable_gate_flag: selfLearnNightly` must be on** for the coordinator to even consider running. Flag defaults false.
3. **Budget ceiling is hard-enforced.** Coordinator aborts mid-run if spend crosses `daily_usd_cap`. No "just one more entry."
4. **Revert-watch window.** If any PR gets reverted within `safety.revert_watch_window_days` (7d), that proposal kind's confidence threshold auto-bumps by `auto_downgrade_confidence_on_revert` (0.10). Trust decays on bad patches.
5. **Three consecutive failed nights = auto-disable.** Prevents runaway cost when something fundamental breaks.

## Relationship to existing phases

- **Phase LEARN** (rubric ledger + wisdom-rule proposer + draft-PR) — SelfLearn consumes this.
- **Phase DF** (taste rubric) — provides the per-generation signal that feeds LEARN.
- **Fix 1** (L1 fast-path in `complexity-tiers.json`) — makes SelfLearn affordable. Without L1 fast-path, 12 entries/night ≈ 3 hours of CLI time. With it, same 12 ≈ ~12 min wall-clock.
- **Fix T1** (TaskLocal requestID) — prerequisite for SelfLearn's internal parallelism. The coordinator will fire entries with concurrency >1 once T1 is validated.
- **QA Flywheel catalog** (`qa-flywheel/goal-catalog.json`) — the source of entries. SelfLearn IS the nightly driver of this catalog.

## Tunable via PR, not rebuild

Every value in these three files hot-reloads via `refreshMchataisourceCache`. A proposal of the form "raise L1 share to 0.60 because L2 autofix loops are eating too much budget" is a 1-line PR to `config.json`, zero-rebuild, reversible instantly.

## Milestones (from PHASE_SELFLEARN_SPEC.md)

- **SL.1 ✅ this commit** — these three files + this doc
- **SL.2** — `SelfLearnCoordinator.swift` (~300 LOC Swift orchestrator)
- **SL.3** — `diagSelfLearn` tunnel command
- **SL.4** — cron-style scheduler (BackgroundTaskScheduler)
- **SL.5** — Firestore report shape + coverage integration
- **SL.6** — 7-night dry-run soak (auto_submit_draft_pr stays false)
- **SL.7** — flip auto_submit_draft_pr true; first real morning PR
- **SL.8** — extend to webSPA
