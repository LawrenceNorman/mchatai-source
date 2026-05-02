# Web Component Absorption Process

The template system keeps complete known-good mini-apps. The Lego system extracts reusable primitives from those same apps.

## Flow

1. Promote or select a known-good game in the template catalog.
2. Add or update its entry in `catalog/good-games.json`.
3. Extract one primitive at a time into `core/`, `entities/`, `ui/`, or `resources/`.
4. Add the block to `_index.json` with contracts and `goodFits`.
5. Reassemble a golden example from modules before marking the block `ready`.

## Quality Bar

- Vanilla ES6 modules only.
- No global state unless it is explicitly bridge/runtime state.
- Constructor options must be small and documented in `_index.json`.
- Blocks should degrade outside mChatAI: use localStorage/WebAudio/browser APIs when the platform bridge is absent.
- Prefer small primitives over giant genre engines. A local LLM should compose `GridBoard + TurnBasedManager + CheckersRules`, not edit a 2,000-line checkers app.
- Generated artifacts must include `<script type="application/json" id="mchatai-web-components-used">...` and either use module imports for selected component paths or inline selected source bodies with `// BEGIN mChatAI Web Component: ...` markers. Matching class names alone is not enough; that allows playable monoliths to masquerade as Lego compositions.

## QA Loop

1. Run `node tests/check_component_usage.mjs <generated index.html> <recipe-id>` on each candidate artifact.
2. Treat missing markers, missing imports, or missing canonical source bodies as a generation miss, even when the game is playable.
3. Promote a new component only after a known-good game can be reassembled with the component and the checker passes.

## Agent Runbook

When an agent is asked to expand the Lego catalog:

1. Pick one game family and one representative known-good app.
2. Extract the smallest reusable primitive that improves future generation.
3. Add the module under `core/`, `entities/`, `ui/`, or `resources/`.
4. Add or update `_index.json` with the component contract, import path, recipe membership, and good-fit prompts.
5. Reassemble a golden example from the components.
6. Run the usage checker against the example and any AIWizard canary output.
7. Only mark the component ready after the checker passes and the app still plays.

Do not promote components because a generated app merely used similar class names. The point is reusable source provenance, not naming convention.

## Harness Canary Runbook

For live AIWizard canaries:

1. If testing local uncommitted `mchatai-source` edits, sync them into the app source cache before the run.
2. Run `diagHarnessContext` for `aiwizard-miniapp` and confirm the web-components layer selected the expected recipe.
3. Use `maxTurns >= 2` for Codex-backed runs so Codex has enough turns to inspect context and write output.
4. Inspect the tunnel session log and wizard workdir `session.log` if the result appears to come from a fallback backend.
5. Run `node tests/check_component_usage.mjs <installed index.html> <expected recipe-id>`.
6. Treat checker failure as a Harness failure, even if the preview looks good.

Useful inspection paths:

- Tunnel session log: `~/Library/Containers/com.sevenhillsstudio.mChatAImac/Data/Library/Application Support/mChatAI/DebugTunnel/sessions/<requestID>.session-log`
- Wizard workdir: `~/Library/Containers/com.sevenhillsstudio.mChatAImac/Data/tmp/wizard-<slug>/`
- Installed mini-apps: `~/Library/Containers/com.sevenhillsstudio.mChatAImac/Data/Library/Application Support/mChatAI/MiniApps/installed/`
- Source cache: `~/Library/Containers/com.sevenhillsstudio.mChatAImac/Data/Library/Application Support/mChatAI/source-cache/mchatai-source`

## Known Failure Modes

- **Playable monolith:** The app works but has no `mchatai-web-components-used` marker.
- **Spoofed marker:** The marker exists but there are no real module imports or canonical inline component bodies.
- **Class-name mimicry:** The generated app defines local `GameManager`, `SpaceShip`, or `Asteroid` classes instead of using catalog modules.
- **Backend fallback:** Codex or a local model fails, then another provider produces a playable app that did not receive or follow the same component constraints.
- **Stale source cache:** The app uses older cached `_index.json` or prompt files because local `mchatai-source` edits were not synced into the container source cache.

The required next Harness improvement is a hard gate: if a Web Components recipe is selected and `check_component_usage.mjs` fails, the Harness should auto-fix or retry before the session can be marked complete.

## Current Families

- `arcade-top-down`: Asteroids, Alien Abduction, Centipede-style mashups.
- `arcade-physics`: Pong, Breakout-style variants.
- `arcade-grid`: Frogger, Pac-Man, maze chase, lane dodge.
- `platformer`: Plumber, Pyramid Hopper.
- `puzzle-grid`: Minesweeper, Candy Match, Word Quest.
- `card-game`: Blackjack, Texas Holdem, solitaire variants.
- `board-game`: Checkers, Chess, Connect Four.
- `strategy-realtime`: Tower Defense.
- `music`: Piano and synth toys.
