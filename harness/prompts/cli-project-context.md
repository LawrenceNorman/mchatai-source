# mChatAI Harness — CLI Agent Project Context

You are a coding CLI (Claude Code / Codex / Gemini) running under the mChatAI Harness. This file tells you WHERE to find reference assets, quality rules, and scaffolds.

## Project Root
`/Users/lawrencenorman/mystuff/src/mchatai_platform`

## Read Order (FOLLOW THIS)

**Before writing ANY UI code**, read these in order:

1. **Quality rules (always):**
   - `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/wisdom/packs/universal.json`
   - `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/wisdom/packs/visual-quality.json`

2. **Pick your genre, then read the matching asset pack:**

### Arcade shooters (Space Invaders, Galaga, Asteroids, etc.)
- `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/packs/arcade-retro.json` — CSS + sprite grids
- `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/packs/mandatory-starters/arcade-shooter-starter.js` — copy-paste renderSprite() + all sprite constants
- `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/scaffolds/space-invaders-scaffold.html` — complete HTML skeleton with renderSprite pre-loaded. **EXTEND this file** instead of building from scratch.
- `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/wisdom/packs/arcade-games.json` — keyboard input, rAF loop, collision detection

### Snake-style games (Snake, Worm, etc.)
- `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/scaffolds/snake-scaffold.html` — complete Snake game with grid, food, collision, scoring, high-score, game-over. **EXTEND this file** — add power-ups, walls, multiple foods, etc.

### Brick-breaker / paddle games (Breakout, Arkanoid, Pong)
- `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/scaffolds/breakout-scaffold.html` — paddle + ball physics + rainbow brick rows + lives + level progression. **EXTEND this file** with power-ups, special bricks, boss levels, etc.

### Card games (Hearts, Spades, Bridge, Poker, Blackjack, Cribbage, etc.)
- `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/scaffolds/card-game-scaffold.html` — **complete Hearts game** with full deck, sorting, table layout, CPU AI, pass phase, trick-taking, scoring, high-contrast toasts. **EXTEND this file** for other card games — change rules in `isLegalPlay()`, `trickPoints()`, `cpuPickCard()`. The scaffold already complies with vq-005, vq-006, vq-007, vq-008.
- `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/packs/casino-card-game.json` — additional card rendering helpers (felt backgrounds, chip stacks)
- **CRITICAL card-game rules** (auto-injected from visual-quality.json):
  - vq-006: Card ranks must show `'10'`, NEVER `'T'`
  - vq-007: CPU opponents MUST auto-play with `setTimeout(() => cpuPlayTurn(), 500)`
  - vq-008: Hearts (♥) and Diamonds (♦) MUST be RED (#dc2626); Spades (♠) and Clubs (♣) BLACK
  - vq-005: Toasts must be high-contrast — white on dark, never gray-on-gray

### Board games (Chess, Checkers, Backgammon, Go, etc.)
- `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/packs/board-game.json`

### Productivity apps (dashboards, trackers, todo, etc.)
- `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/packs/productivity-ui.json`

3. **Genre keyword matching:** `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/genre-mapping.json`

## CRITICAL RULES (violations will fail evaluation)

### Visual quality
1. **NEVER use plain colored rectangles** for game entities. Use renderSprite() with pixel grid arrays, SVG, or CSS clip-path shapes. Read the asset pack files above — they have working code to copy.
2. **Contrast matters.** Toasts, tooltips, overlays: white text on dark backgrounds OR black text on light backgrounds. NEVER gray-on-gray. (WCAG AA = 4.5:1 ratio minimum)
3. **Distinct entity types.** At least 3 visually different enemy/card/piece types. Different shapes AND colors.

### Interactivity
4. **Human player must interact.** Never ship an app that runs on autopilot with no user input.
5. **Turn-based games need real CPU logic.** If it's the CPU's turn: pick a legal move, execute with 300-800ms delay, advance to next turn. No "Waiting for [name]" dead-ends.
6. **Keyboard controls:** Use `keydown` (not `keypress`). `preventDefault()` on arrow keys to stop page scroll.

### Code quality
7. **No placeholder functions.** Every function must have real, working logic. No `// TODO:` stubs.
8. **Use requestAnimationFrame** for game loops, not setInterval.
9. **Output format:** Single-file HTML mini-app. All CSS, JS, SVG inline. Self-contained.

## Output
Build a single-file `index.html`. Output the COMPLETE file content in a ```miniapp fenced JSON block. The JSON must have `id`, `name`, `manifest`, and `html` fields.

## Fence example
```miniapp
{
  "id": "com.mchatai.wizard.space-invaders",
  "name": "Space Invaders",
  "manifest": "Classic arcade shooter with pixel-art sprites",
  "html": "<!DOCTYPE html>..."
}
```
