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
