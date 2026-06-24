# harness/meta/ — Meta-Harness self-optimization

This directory holds the **content** that drives the Meta-Harness loop: a proposer coding agent that reads raw execution traces and rewrites the harness's own content surfaces, scored on a Pareto frontier of build accuracy vs context-token cost. Inspired by *Meta-Harness: End-to-End Optimization of Model Harnesses* (Lee et al.) — adapted so the proposer rewrites **content** (this repo), never the Swift binary (RULE #1).

Read alongside `../self-learn/` (the sibling nightly QA-flywheel loop — same composer pattern, different proposer).

## Files

| File | Purpose | Read by |
|---|---|---|
| `config.json` | Master policy: double-lock gate, mutable surfaces, budget, benchmark catalog, scoring axes, keep-bar, apply posture. | `MetaHarnessConfig.swift` via `MchataisourceCacheService.loadJSONPublic` |
| `proposer.md` | The proposer coding-agent's instructions (its "brain"). Hot-patchable. | `MetaHarnessProposer.swift` (templated into the CLI goal) |
| `protected-invariants.json` | Immutable allowlist — sections the proposer may never remove/contradict. | `MetaHarnessProtectedSections.swift` |
| `objectives/*.json` | Objective templates. `explore-frontier.json` = freeform Pareto exploration (default). | `MetaHarnessCoordinator` + proposer prompt |

The benchmark catalog lives at `../../qa-flywheel/qaflywheel-metaharness-catalog.json`.

## How a campaign runs (mechanism is Swift; ALL policy is here)

1. **Snapshot** the live `mutable_surfaces` into a campaign baseline; benchmark baseline → seed frontier.
2. For each iteration × candidate: materialize a candidate dir from baseline → run the **proposer** (Claude Code CLI, `--add-dir` candidate + read-only trace corpus + archive) → it edits content + writes `proposal.json`.
3. **Gate** the candidate deterministically: write-scope ∧ schema-decode ∧ suspicious-scan ∧ protected-invariants. Reject (never half-apply) on any failure.
4. **Activate** the candidate as a `resolvePath` overlay → invalidate content caches → run the benchmark batch in-process (`tunnelRunWizard`) → deactivate → collect land-rate + context-token cost by `sessionID`.
5. **Score** + write to the Pareto **archive** (the filesystem the proposer reads next iteration).
6. **Keep-bar** on the held-out split → auto-open one **draft** PR per PR-eligible frontier knee (gated by `metaHarnessAutoPR`, default OFF; a human merges).

## Safety posture (non-negotiable)

- **Double-lock**: `config.enabled` AND FeatureFlag `metaHarnessEnabled` must BOTH be true for a live campaign. Dry-run always works.
- **Local-only** (RULE #2): proposer CLI, benchmark, and traces are all on the user's machine. Only the merged content (a PR) ever leaves.
- **Accelerator, not gate** (RULE #3): un-benchmarked genres are surfaced as `coverage-gap` flags on the PR, never excluded.
- **Human merges** every PR. The loop never merges.

## To retune (zero rebuild)

PR a change to any file here, then `refreshMchataisourceCache`. The Swift binary carries only frozen `_fallback_only` defaults for `protected-invariants.json`, so a missing/corrupt file can never *open* the safety gate.
