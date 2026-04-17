# mChatAI Wizard — CLI Agent Context

## Project Root
The mChatAI platform lives at: `/Users/lawrencenorman/mystuff/src/mchatai_platform`

## Visual Assets — READ BEFORE GENERATING ANY UI CODE
Asset packs with CSS, SVG, pixel-art sprites, and JS helpers live in:
`/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/`

### For arcade/retro/shooter games:
1. **Read** `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/packs/arcade-retro.json` — contains renderSprite() function, 5 pixel-art sprite grids (ALIEN_1, ALIEN_2, ALIEN_3, PLAYER_SHIP, UFO_SHIP), explosion CSS, bullet CSS, shield builder, starfield generator
2. **Read** `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/packs/mandatory-starters/arcade-shooter-starter.js` — copy-paste ready JS with all sprite constants + renderSprite()
3. **Read** `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/scaffolds/space-invaders-scaffold.html` — complete HTML scaffold with all CSS + sprites pre-loaded. EXTEND this file instead of building from scratch.

### For board games:
- **Read** `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/packs/board-game.json`

### For card games:
- **Read** `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/packs/casino-card-game.json`

### Genre mapping:
- **Read** `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/genre-mapping.json` — maps game keywords to the right asset pack

## Quality Rules
- **Read** `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/wisdom/packs/visual-quality.json` — CRITICAL rules: never use plain colored rectangles for game entities
- **Read** `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/wisdom/packs/arcade-games.json` — arcade game quality rules (keyboard input, rAF game loop, collision detection)

## Output Format
Build a single-file HTML mini-app. All CSS, JS, and SVG must be inline in one HTML file. The file must be self-contained — no external dependencies.

## CRITICAL RULES
1. **NEVER use plain colored rectangles** for game entities. Use renderSprite() with pixel grid arrays, SVG paths, or CSS clip-path shapes.
2. **READ the asset pack files above FIRST** before writing any rendering code. They contain tested, working code you should copy.
3. Every game entity must be visually distinct — different shapes AND colors for each type.
4. Use requestAnimationFrame for the game loop, not setInterval.
5. Arrow keys + space bar for controls. preventDefault on arrow keys.
