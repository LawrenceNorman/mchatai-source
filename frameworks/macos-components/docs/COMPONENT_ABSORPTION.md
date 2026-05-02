# macOS Component Absorption Process

The native macOS Lego system extracts reusable SwiftUI/AppKit/SpriteKit source files from known-good generated apps.

## Flow

1. Promote or select a known-good native macOS app.
2. Extract one small primitive at a time into `components/<family>/`.
3. Add the component to `_index.json` with exports, contracts, recipe membership, and good-fit prompts.
4. Reassemble a golden example from copied components plus thin app-specific glue.
5. Run `tests/check_macos_component_usage.mjs` against the example before marking the component ready.

## Quality Bar

- Components are plain Swift source files copied into the generated SwiftPM target.
- Components must not define `@main`; the generated app owns scenes and app lifecycle.
- Components should compile without extra SPM packages unless the recipe explicitly declares dependency requirements.
- Component APIs should be narrow and documented in `_index.json`.
- Generated artifacts must include `mchatai-macos-components-used.json`.
- Copied component files must preserve the canonical `BEGIN mChatAI macOS Component` markers.
- Matching type names are not enough. The checker must find the canonical component source bodies.

## QA Loop

Before running a full AIWizard canary, prove the Harness selects the native
component recipe:

```bash
node mchatai-source/frameworks/macos-components/tests/run_catalog_recipe_diagnostics.mjs
```

Run:

```bash
node mchatai-source/frameworks/macos-components/tests/check_macos_component_usage.mjs <generated-app-dir-or-json> <expected-recipe-id>
```

Treat checker failure as a Harness failure even if the Swift app compiles and launches. A compiling monolith is not a successful Lego composition.

## Current Families

- `recipe.native-word-game`: native five-letter word guessing apps with reusable engine, dictionary, keyboard, and smoke-test helpers.
- `recipe.native-crossword`: NYT Mini-style crossword apps with reusable grid, clue, selection, and validation helpers.
- `recipe.mastermind`: code-breaker games with reusable duplicate-safe peg scoring and turn history.
- `recipe.minesweeper`: mine, flag, adjacency, reveal, and flood-fill puzzle apps.
- `recipe.match3`: Candy Match-style tile swapping, match detection, collapse, refill, and cascades.
- `recipe.arcade-asteroids`: Asteroids and Alien Abduction-style top-down vector shooter apps.
- `recipe.arcade-pong`: Pong/paddle-ball apps with reusable ball/paddle/scoring physics.
- `recipe.arcade-adventure`: Atari Adventure-style castle/key/treasure grid adventures.
- `recipe.arcade-grid`: Frogger-style lane and traffic grid arcade games.
- `recipe.maze-arcade`: PacMan-style maze/pellet games.
- `recipe.platformer`: Mario/plumber and Pyramid Hopper-style platformers.
- `recipe.tower-defense`: path, wave, tower, targeting, credits, and lives tower-defense apps.
- `recipe.blackjack`: blackjack table flow, dealer policy, bankroll, and settlement.
- `recipe.poker`: Texas Holdem helpers with card/deck primitives and poker hand evaluation.
- `recipe.checkers`: 8x8 checkers with forced captures and kinging.
- `recipe.chess`: chess setup, normal legal moves, check, and checkmate helpers.
- `recipe.music-piano`: piano note metadata and active-key state for native synth toys.

## Planned Families

- Desktop shell: settings scenes, sidebar-detail shells, command routing, and menu-bar affordances.
- SpriteKit rendering adapters for arcade engines that need richer animation than SwiftUI Canvas.
- Audio adapters for piano and arcade SFX using AVAudioEngine.
