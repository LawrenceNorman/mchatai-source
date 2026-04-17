# Visual Assets — READ THESE FILES BEFORE WRITING CODE

Asset pack files have been placed in `{{assetDir}}/` in the working directory.

**BEFORE writing any rendering code, you MUST:**

1. **Read `{{assetDir}}/arcade-shooter-starter.js`** (if it exists) — it contains the `renderSprite()` function and all sprite grid constants (ALIEN_1, ALIEN_2, ALIEN_3, PLAYER_SHIP, UFO_SHIP). Copy this code VERBATIM as the first lines of your `<script>` tag.

2. **Read any `.json` files in `{{assetDir}}/`** — they contain CSS for CRT effects, explosions, bullets, shields, starfield backgrounds, and other visual assets. Use the CSS and JS from these files.

3. **Use `renderSprite()` for every game entity** — NEVER use plain colored rectangles (`<div style="background:red">`). Each entity type must have a distinct, recognizable pixel-art shape.

4. **Search for reference implementations** if the starter code doesn't cover your use case. Use web search or GitHub to find open-source examples of the game you're building, then adapt the rendering approach.

## Entity Rendering Cheat Sheet

- Alien row 1: `element.innerHTML = renderSprite(ALIEN_1, {1:'#ff0040'}, 4);`
- Alien row 2: `element.innerHTML = renderSprite(ALIEN_2, {1:'#00d4ff'}, 3);`
- Alien row 3: `element.innerHTML = renderSprite(ALIEN_3, {1:'#aa00ff'}, 3);`
- Player ship: `element.innerHTML = renderSprite(PLAYER_SHIP, {1:'#00ff41'}, 3);`
- UFO bonus: `element.innerHTML = renderSprite(UFO_SHIP, {1:'#ff6600'}, 3);`
- Explosion: Add CSS `@keyframes explode` + `.exploding` class on hit
- Bullets: Use `.bullet` / `.enemy-bullet` CSS classes (3px wide, glowing)
