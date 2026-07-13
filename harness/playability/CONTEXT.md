# harness/playability — Playability Gate prompts (Phase PG, 2026-06-25)

Content for the **Playability Gate**: a regression-prevention layer that PLAYS an
app (not just loads it) to verify its core interactions work. Built because the
install render-gate is load-only (`errorCount`/`looksUnplayable`), so a gameplay
regression with zero console errors — e.g. a branch that "added difficulty" but
broke chess piece-selection — passed silently.

## Flow
1. `contract-extractor.md` — an LLM reads the app's HTML → a JSON `PlayabilityContract`
   of 3–6 core interactions (steps + expected visible outcome), with concrete
   selectors from the source. Core-loop interactions are `critical:true`.
2. The Mac `PlayabilityProbe` (offscreen WKWebView in a hidden window) runs each
   assertion's steps (click by text/selector/coords, key presses) + screenshots.
3. `assertion-judge.md` — a vision model judges each after-screenshot PASS/FAIL.

## Gate semantics
- **Fresh builds:** any `critical` assertion that FAILS → autofix with the
  specific failure, bounded rounds.
- **Branches:** the contract runs against **v1 first (baseline)**; only features
  that PASSED in v1 and now FAIL in v2 count as **regressions** → autofix or keep
  v1. We never gate on a feature v1 itself lacked.

## RULE #1
These `.md` files are authoritative. The binary (`AIHarness+PlayabilityGate.swift`)
carries frozen `extractorFallback` / `judgeFallback` copies used only when the
cache lacks these files. Edit here + `refreshMchataisourceCache` — no rebuild.

## Tuning
`diagPlayability {miniAppID, goal?}` runs the gate against an installed app and
prints per-assertion pass/fail — use it to tune these prompts against real apps.

## Deep-play driver (PG.6 candidate — diagnostic today, gate later)
`deep-play-driver.js` drives a turn-based game move-by-move inside the probe
WKWebView and catches the failure classes the render gate + vision judge are
blind to: **turn-stealing** (double turn-advance consuming the human's turns),
**"prompted but nothing actionable" wedges**, **NaN/undefined quota text**, and
silent auto-passes. Found three shipped bugs in chaos-chess on 2026-07-12 that
had survived every existing gate.

Run it today with zero Swift changes — paste the file as the `js` payload of a
`diagProbeJS` tunnel command (`unmask:true, waitMs:6000`). It fast-forwards
`setTimeout`, drains `requestAnimationFrame` iteratively, auto-discovers the
game's `globalThis` debug surface (wisdom rule `bg-playtest-debug-surface`) to
subscribe to `turnchange`/`action` events, and returns a JSON report
(moves/wedges/turnSteals/nanText + HUD trace).

Known limits: a snapshot mid rAF animation is TRANSIENT, not a wedge (the
driver requires 3 identical stable states before flagging); selector fallbacks
are catalog-family level (`SELECTORS` header), not per-app. Wiring it into
`InstallGateChain` as an enforcing step needs a default-OFF feature flag and an
explicit decision — it changes install behavior for every game.
