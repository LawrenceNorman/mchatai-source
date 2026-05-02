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

Fast catalog-selection QA:

```bash
node mchatai-source/frameworks/web-components/tests/run_catalog_recipe_diagnostics.mjs
```

This drives `diagHarnessContext` through the DebugTunnel for every known-good family in `tests/catalog_recipe_cases.json`, including continuation prompts that rely on `recentUserMessages`.

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
- **Continuation context drop:** A second-turn prompt such as "Yes, build it now" can lose obvious genre keywords unless the Harness matches Web Components against prior user prompts as well as the current prompt.
- **Template keyword contamination:** A wrong-but-plausible template seed can contain another recipe's keywords. Keep template-ID scoring separate from prompt/category keyword scoring so explicit prompts like Blackjack do not select Poker.
- **Prompt-only compliance miss:** Even with the correct recipe context, OpenAI/local models can still emit a playable monolith. The hard gate catches this; retry prompts now include a concrete Lego repair marker/import block, but this still needs live canary validation with the tunnel active.
- **Tunnel not attached:** Launching the app process is not enough if the Harness view model is not initialized. The ready file can be stale; verify with a cheap `listSkills` request before running catalog diagnostics or canaries.

Harness status as of 2026-05-02:

- A hard Lego gate exists in `AIHarness+MiniAppOps`: if a recipe is selected and the generated artifact omits the marker/imports/canonical inline component bodies, the mini-app is rejected before install.
- Tunnel results should report `status:error`, `phase:failed`, and a `failureReason` beginning with `Web Components Lego gate rejected...` for rejected artifacts.
- `diagHarnessContext` supports `recentUserMessages` so QA can verify continuation turns still select the correct component recipe.
- Gate-rejection retries include an exact marker/import block via `webComponentRetryInstruction(sessionID:)`.
- The next improvement is a true auto-fix/retry loop that starts from a pre-seeded module scaffold instead of another blank `index.html` prompt.

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
