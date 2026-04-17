// MANDATORY STARTER CODE — Copy this EXACTLY into your game's <script> tag.
// Do NOT replace this with plain colored rectangles.

// Pixel sprite renderer — converts grid arrays to SVG
function renderSprite(grid, colors, scale) {
  scale = scale || 4;
  const h = grid.length, w = grid[0].length;
  let svg = '<svg viewBox="0 0 ' + (w*scale) + ' ' + (h*scale) + '" xmlns="http://www.w3.org/2000/svg" style="display:block">';
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = colors[grid[y][x]];
      if (c) svg += '<rect x="' + (x*scale) + '" y="' + (y*scale) + '" width="' + scale + '" height="' + scale + '" fill="' + c + '"/>';
    }
  return svg + '</svg>';
}

// === ALIEN SPRITES (use these for enemies) ===
const ALIEN_1 = [[0,0,0,1,1,0,0,0],[0,0,1,1,1,1,0,0],[0,1,1,1,1,1,1,0],[1,1,0,1,1,0,1,1],[1,1,1,1,1,1,1,1],[0,0,1,0,0,1,0,0],[0,1,0,1,1,0,1,0],[1,0,1,0,0,1,0,1]];
const ALIEN_2 = [[0,0,1,0,0,0,0,0,1,0,0],[0,0,0,1,0,0,0,1,0,0,0],[0,0,1,1,1,1,1,1,1,0,0],[0,1,1,0,1,1,1,0,1,1,0],[1,1,1,1,1,1,1,1,1,1,1],[1,0,1,1,1,1,1,1,1,0,1],[1,0,1,0,0,0,0,0,1,0,1],[0,0,0,1,1,0,1,1,0,0,0]];
const ALIEN_3 = [[0,0,0,0,1,1,1,1,0,0,0,0],[0,1,1,1,1,1,1,1,1,1,1,0],[1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,0,0,1,1,0,0,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1],[0,0,0,1,1,0,0,1,1,0,0,0],[0,0,1,1,0,1,1,0,1,1,0,0],[1,1,0,0,0,0,0,0,0,0,1,1]];
const PLAYER_SHIP = [[0,0,0,0,0,0,1,0,0,0,0,0,0],[0,0,0,0,0,1,1,1,0,0,0,0,0],[0,0,0,0,0,1,1,1,0,0,0,0,0],[0,1,1,1,1,1,1,1,1,1,1,1,0],[1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1,1,1,1]];
const UFO_SHIP = [[0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0],[0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0],[0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],[0,1,1,0,1,1,0,1,1,0,1,1,0,1,1,0],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[0,0,1,1,1,0,0,1,1,0,0,1,1,1,0,0],[0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0]];

// === HOW TO RENDER ENTITIES ===
// Alien row 1 (top):    element.innerHTML = renderSprite(ALIEN_1, {1:'#ff0040'}, 4);  // red squid
// Alien row 2 (middle): element.innerHTML = renderSprite(ALIEN_2, {1:'#00d4ff'}, 3);  // cyan crab
// Alien row 3 (bottom): element.innerHTML = renderSprite(ALIEN_3, {1:'#aa00ff'}, 3);  // purple octopus
// Player ship:          element.innerHTML = renderSprite(PLAYER_SHIP, {1:'#00ff41'}, 3); // green ship
// UFO bonus:            element.innerHTML = renderSprite(UFO_SHIP, {1:'#ff6600'}, 3);  // orange UFO

// === EXPLOSION EFFECT ===
// Add this CSS: @keyframes explode { 0%{transform:scale(1);opacity:1} 100%{transform:scale(2);opacity:0} }
// On hit: element.style.animation = 'explode 0.3s forwards'; setTimeout(() => element.remove(), 300);
