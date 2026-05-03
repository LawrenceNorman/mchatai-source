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

1. Prefer the socket DebugTunnel transport for Lego QA:
   `MCHATAI_TUNNEL_SOCKET=1`.
   The legacy file transport can hang or return stale payloads when the app
   container is under load.
2. If testing local uncommitted `mchatai-source` edits, sync them into the app source cache before the run.
   When direct filesystem copies into the container hang, use the tunnel command
   `writeMchataisourceCacheFile` to write each changed file into
   `source-cache/mchatai-source`, then run `invalidateMchataisourceCaches`.
3. Run `diagHarnessContext` for `aiwizard-miniapp` and confirm the web-components layer selected the expected recipe.
4. Use `maxTurns >= 2` for Codex-backed runs so Codex has enough turns to inspect context and write output.
5. Inspect the tunnel session log and wizard workdir `session.log` if the result appears to come from a fallback backend.
6. Run `node tests/check_component_usage.mjs <installed index.html> <expected recipe-id>`.
7. Treat checker failure as a Harness failure, even if the preview looks good.

Fast catalog-selection QA:

```bash
MCHATAI_TUNNEL_SOCKET=1 node mchatai-source/frameworks/web-components/tests/run_catalog_recipe_diagnostics.mjs
```

This drives `diagHarnessContext` through the DebugTunnel for every known-good family in `tests/catalog_recipe_cases.json`, including continuation prompts that rely on `recentUserMessages`.

End-to-end generation canaries:

```bash
MCHATAI_TUNNEL_SOCKET=1 node mchatai-source/frameworks/web-components/tests/run_catalog_generation_canaries.mjs --smoke
MCHATAI_TUNNEL_SOCKET=1 node mchatai-source/frameworks/web-components/tests/run_catalog_generation_canaries.mjs --case defender
MCHATAI_TUNNEL_SOCKET=1 node mchatai-source/frameworks/web-components/tests/run_catalog_generation_canaries.mjs --all
```

The canary runner reads installed HTML through the socket command
`readInstalledMiniAppHTML` in socket mode. That avoids direct reads from
`Application Support/mChatAI/MiniApps/installed`, which can block from external
automation in this sandbox setup.

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
- **Prompt-only compliance miss:** Even with the correct recipe context, OpenAI/local models can still emit a playable monolith. The hard gate catches this; retry prompts include a concrete Lego repair marker/import block, and golden assembly fallback should repair known recipe families when available.
- **No-artifact CLI/model exit:** A backend can spend its first turn exploring files or exit with no parseable mini-app block. If a Web Components recipe and matching golden assembly are selected, the Harness should synthesize/install the assembly even when there is no rejected mini-app artifact for `enforceWebComponentGate` to inspect.
- **Import shell:** A model can output the exact marker/import scaffold but no meaningful game surface. The gate should reject skeletal module-import shells; add a golden assembly for that recipe rather than loosening the checker.
- **Cross-recipe golden assembly drift:** A fallback assembly must never be reused across recipes. A Wordle golden assembly relabeled as `recipe.arcade-grid` can pass marker checks while visibly producing Word Quest for a Frogger prompt. Constrain golden assembly fallback to `assembly.recipeID == selectedRecipe.id` and add semantic identity checks for clone canaries.
- **Tunnel not attached:** Launching the app process is not enough if the Harness view model is not initialized. The ready file can be stale; verify with a cheap `listSkills` request before running catalog diagnostics or canaries.
- **L2 CLI detour:** Catalog clone prompts such as Defender should not depend
  on Claude/Codex CLI output. If a Web Components recipe is selected, the
  Harness should prefer the API/gate/golden-assembly path so the deterministic
  Lego repair can run. Otherwise CLI limits or no-artifact exits can fail the
  session before the component gate sees an artifact.
- **Stale gate rejection after repair:** If an early generation was rejected but
  a retry later installs a compliant Lego artifact, clear the prior
  `lastFailureReason`. The accepted component-checked install must be the
  tunnel truth source.
- **Evaluator drift:** Text evaluator/autofix can mutate a component-compliant
  artifact back into a markerless monolith. Once a Web Components artifact
  passes the hard gate, skip text evaluator drift and rely on catalog validation
  plus auto-play/visual QA.

Harness status as of 2026-05-02:

- A hard Lego gate exists in `AIHarness+MiniAppOps`: if a recipe is selected and the generated artifact omits the marker/imports/canonical inline component bodies, the mini-app is rejected before install.
- Tunnel results should report `status:error`, `phase:failed`, and a `failureReason` beginning with `Web Components Lego gate rejected...` for rejected artifacts.
- `diagHarnessContext` supports `recentUserMessages` so QA can verify continuation turns still select the correct component recipe.
- Gate-rejection retries include the original user goal plus an exact marker/import block via `webComponentRetryInstruction(sessionID:)`.
- Web Components recipe requests skip CLI-first generation and route through the
  API/gate path so golden assembly fallback can deterministically repair
  markerless output.
- If all generator backends fail to emit a parseable mini-app artifact, `tunnelRunWizard`
  can synthesize the selected Web Components golden assembly directly before
  returning the tunnel result.
- A successful component-compliant install clears stale Lego rejection state, so
  tunnel responses return the accepted `miniAppID`.
- Text evaluator/autofix is skipped for gate-compliant Lego artifacts; the hard
  component checker is the composition authority.
- Generation canaries may include semantic `mustContain`/`mustNotContain`
  checks. Passing the component marker/import checker is necessary but not
  sufficient if the installed artifact clearly belongs to another game.
- Golden assemblies are the practical absorption target. Starter components are
  useful, but every production recipe should eventually have a known-good
  assembly fallback that reconstitutes a playable app from canonical modules.

Validated on 2026-05-03:

- Recipe diagnostics: 24/24 catalog prompts passed.
- Generation canaries: Word Quest/Wordle, Mastermind, Minesweeper 99, Pong,
  Defender, Blackjack, Texas Holdem Poker, Candy Match, Frogger, Pac-Man,
  Checkers, Chess, Piano, Tower Defense, Plumber Platformer, Pyramid Hopper,
  NYT Mini Crossword, and Atari Adventure all passed `check_component_usage.mjs`
  through the socket tunnel.
- Visual screenshot spot checks passed for Candy Match and Chess after adding
  their golden assemblies.

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
