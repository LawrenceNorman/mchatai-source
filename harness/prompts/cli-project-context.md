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

### Card games (Hearts, Spades, Poker, Blackjack, Cribbage, etc.)
- `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/packs/casino-card-game.json` — card rendering, suit symbols, felt backgrounds
- **CRITICAL card-game rules** (from visual-quality.json):
  - Card ranks must show `'10'`, NEVER `'T'` (users mistake 'T' for 'Trump')
  - CPU opponents MUST have real turn logic — never get stuck on "Waiting for [CPU]"
  - Implement: detect CPU's turn → pick legal move → execute after 300-800ms delay → advance

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
