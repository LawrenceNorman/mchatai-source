// SpritePresets — bundled pixel-art sprites for common mini-app entities.
//
// All sprites use the SpriteRenderer.js format: 2D arrays of palette indices
// (0 = transparent). Default palettes are exported alongside each sprite so
// you can use them out of the box, OR override the palette to match your theme.
//
// Usage:
//   import { drawSprite } from "./SpriteRenderer.js";
//   import { KNIGHT, KNIGHT_PALETTE } from "./SpritePresets.js";
//   drawSprite(ctx, KNIGHT, KNIGHT_PALETTE, { x: 100, y: 100, scale: 4, anchor: "center" });
//
// Pattern: every sprite is small enough (≤16x16) to draw at scale 3-6 without
// looking pixelated, but detailed enough that the entity is recognizable.

// =============================================================================
// ADVENTURE — knight, dragon, treasure, key, gate
// =============================================================================

// KNIGHT: 12 wide × 14 tall, facing forward
export const KNIGHT = [
  [0,0,0,0,2,2,2,2,0,0,0,0],
  [0,0,0,2,1,1,1,1,2,0,0,0],
  [0,0,2,1,3,3,3,3,1,2,0,0],
  [0,2,1,1,1,1,1,1,1,1,2,0],
  [0,2,1,4,1,1,1,1,4,1,2,0],
  [0,2,1,1,1,5,5,1,1,1,2,0],
  [0,0,2,2,2,2,2,2,2,2,0,0],
  [0,0,1,6,6,6,6,6,6,1,0,0],
  [0,2,6,6,7,7,7,7,6,6,2,0],
  [0,2,6,7,7,8,8,7,7,6,2,0],
  [0,2,6,6,7,7,7,7,6,6,2,0],
  [0,0,2,2,2,2,2,2,2,2,0,0],
  [0,0,9,9,0,0,0,0,9,9,0,0],
  [0,0,9,9,0,0,0,0,9,9,0,0]
];
export const KNIGHT_PALETTE = {
  1: "#c8d4e0",  // helmet light
  2: "#5a6c7a",  // armor outline
  3: "#1a1f29",  // visor shadow
  4: "#0a0e14",  // eye holes
  5: "#dc2626",  // mouth
  6: "#9aa9b8",  // body armor
  7: "#fef3c7",  // tabard
  8: "#dc2626",  // tabard cross
  9: "#3b2514"   // boots
};

// DRAGON: 16 wide × 11 tall — wings, body, fire-breathing pose
export const DRAGON = [
  [0,0,0,0,3,3,0,0,0,0,1,1,0,0,0,0],
  [0,0,0,3,2,2,3,0,0,1,2,2,1,0,0,0],
  [0,0,3,2,2,2,2,3,1,2,2,4,2,1,0,0],
  [0,3,2,2,5,2,2,2,2,2,5,2,2,2,1,0],
  [3,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
  [3,2,4,2,2,2,2,2,2,2,2,2,2,4,2,1],
  [3,2,2,2,2,6,6,6,6,2,2,2,2,2,2,1],
  [0,3,2,2,2,2,2,2,2,2,2,2,2,2,1,0],
  [0,0,3,2,2,2,2,2,2,2,2,2,2,1,0,0],
  [0,0,0,7,7,0,7,7,0,7,7,0,7,7,0,0],
  [0,0,0,0,7,0,0,7,0,7,0,0,0,7,0,0]
];
export const DRAGON_PALETTE = {
  1: "#7a1f1f",  // body shadow (right wing)
  2: "#dc2626",  // body main red
  3: "#7a1f1f",  // outline
  4: "#fbbf24",  // eye yellow
  5: "#fbbf24",  // wing accents
  6: "#fde047",  // fire breath
  7: "#3b2514"   // claws
};

// TREASURE: 10 wide × 8 tall — chest with gold
export const TREASURE = [
  [0,2,2,2,2,2,2,2,2,0],
  [2,1,1,1,1,1,1,1,1,2],
  [2,1,3,3,3,3,3,3,1,2],
  [2,1,3,4,4,4,4,3,1,2],
  [2,1,3,4,5,5,4,3,1,2],
  [2,1,3,4,4,4,4,3,1,2],
  [2,1,3,3,3,3,3,3,1,2],
  [2,2,2,2,2,2,2,2,2,2]
];
export const TREASURE_PALETTE = {
  1: "#a16207",  // wood
  2: "#3b2514",  // outline
  3: "#fbbf24",  // gold
  4: "#fde68a",  // gold highlight
  5: "#dc2626"   // ruby/lock
};

// KEY: 8 wide × 4 tall — simple skeleton key
export const KEY = [
  [0,1,1,1,1,1,1,0],
  [1,2,2,1,1,2,2,1],
  [1,2,2,1,1,2,2,1],
  [0,1,1,1,1,1,1,0]
];
export const KEY_PALETTE = {
  1: "#fbbf24",  // gold
  2: "#a16207"   // gold outline
};

// GATE: 12 wide × 14 tall — castle gate
export const GATE = [
  [0,0,2,2,2,2,2,2,2,2,0,0],
  [0,2,1,1,1,1,1,1,1,1,2,0],
  [2,1,1,3,3,3,3,3,3,1,1,2],
  [2,1,3,3,4,4,4,4,3,3,1,2],
  [2,1,3,4,5,5,5,5,4,3,1,2],
  [2,1,3,4,5,5,5,5,4,3,1,2],
  [2,1,3,4,5,6,6,5,4,3,1,2],
  [2,1,3,4,5,5,5,5,4,3,1,2],
  [2,1,3,3,4,4,4,4,3,3,1,2],
  [2,1,1,3,3,3,3,3,3,1,1,2],
  [2,1,1,1,1,1,1,1,1,1,1,2],
  [2,1,1,1,1,1,1,1,1,1,1,2],
  [2,1,1,1,1,1,1,1,1,1,1,2],
  [2,2,2,2,2,2,2,2,2,2,2,2]
];
export const GATE_PALETTE = {
  1: "#78716c",  // stone
  2: "#1f1d1c",  // outline
  3: "#3b2514",  // wood frame
  4: "#5a3a1c",  // wood inner
  5: "#1a0f08",  // door dark
  6: "#fbbf24"   // keyhole
};

// =============================================================================
// PLATFORMER — plumber, goomba, coin, pipe, brick
// =============================================================================

// PLUMBER: 12 wide × 14 tall, facing right (red cap)
export const PLUMBER = [
  [0,0,0,0,1,1,1,1,1,0,0,0],
  [0,0,0,1,1,1,1,1,1,1,0,0],
  [0,0,2,2,2,3,3,3,1,1,0,0],
  [0,2,3,3,4,3,3,3,3,3,0,0],
  [0,2,3,4,4,4,3,3,3,3,1,0],
  [0,2,4,4,4,5,5,3,5,5,0,0],
  [0,0,4,4,4,4,4,4,4,0,0,0],
  [0,0,1,6,1,1,1,1,1,0,0,0],
  [0,1,1,1,1,1,7,1,1,1,0,0],
  [0,1,3,1,1,7,7,1,1,3,1,0],
  [0,3,3,3,1,7,7,1,3,3,3,0],
  [0,3,3,3,3,3,3,3,3,3,3,0],
  [0,0,2,2,2,0,0,2,2,2,0,0],
  [0,0,2,2,2,0,0,2,2,2,0,0]
];
export const PLUMBER_PALETTE = {
  1: "#dc2626",  // cap/shirt red
  2: "#1f0a0a",  // outline
  3: "#2563eb",  // overalls blue
  4: "#fde68a",  // skin
  5: "#3b2514",  // mustache/brows
  6: "#fbbf24",  // M emblem bg
  7: "#fbbf24"   // brass buckle
};

// COIN: 8 wide × 8 tall — golden coin (frame 1 of 4 for spin)
export const COIN_1 = [
  [0,0,2,2,2,2,0,0],
  [0,2,1,1,1,1,2,0],
  [2,1,3,1,1,3,1,2],
  [2,1,1,1,1,1,1,2],
  [2,1,1,1,1,1,1,2],
  [2,1,3,1,1,3,1,2],
  [0,2,1,1,1,1,2,0],
  [0,0,2,2,2,2,0,0]
];
export const COIN_2 = [
  [0,0,0,2,2,0,0,0],
  [0,0,2,1,1,2,0,0],
  [0,0,2,1,1,2,0,0],
  [0,0,2,1,1,2,0,0],
  [0,0,2,1,1,2,0,0],
  [0,0,2,1,1,2,0,0],
  [0,0,2,1,1,2,0,0],
  [0,0,0,2,2,0,0,0]
];
export const COIN_PALETTE = {
  1: "#fde68a",  // gold light
  2: "#a16207",  // gold dark/outline
  3: "#fbbf24"   // gold mid
};
export const COIN_FRAMES = [COIN_1, COIN_1, COIN_2, COIN_2];

// PIPE: 16 wide × 10 tall — green warp pipe
export const PIPE = [
  [0,2,2,2,2,2,2,2,2,2,2,2,2,2,2,0],
  [2,1,1,3,3,3,3,3,3,3,3,3,3,1,1,2],
  [2,1,3,3,3,3,3,3,3,3,3,3,3,3,1,2],
  [2,1,3,3,3,3,3,3,3,3,3,3,3,3,1,2],
  [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
  [0,0,2,1,3,3,3,3,3,3,3,3,1,2,0,0],
  [0,0,2,1,3,3,3,3,3,3,3,3,1,2,0,0],
  [0,0,2,1,3,3,3,3,3,3,3,3,1,2,0,0],
  [0,0,2,1,3,3,3,3,3,3,3,3,1,2,0,0],
  [0,0,2,1,3,3,3,3,3,3,3,3,1,2,0,0]
];
export const PIPE_PALETTE = {
  1: "#16a34a",  // pipe light
  2: "#0f3a18",  // outline
  3: "#22c55e"  // pipe mid
};

// BRICK: 8 wide × 8 tall
export const BRICK = [
  [2,2,2,2,2,2,2,2],
  [2,1,1,3,1,1,1,2],
  [2,1,1,3,1,1,1,2],
  [2,2,2,2,2,2,2,2],
  [2,1,3,1,1,3,1,2],
  [2,1,3,1,1,3,1,2],
  [2,1,3,1,1,3,1,2],
  [2,2,2,2,2,2,2,2]
];
export const BRICK_PALETTE = {
  1: "#c2410c",  // brick orange
  2: "#1c1917",  // mortar/outline
  3: "#7a2410"   // brick shadow
};

// GOOMBA: 12 wide × 10 tall
export const GOOMBA = [
  [0,0,2,2,2,2,2,2,2,2,0,0],
  [0,2,1,1,1,1,1,1,1,1,2,0],
  [2,1,1,3,3,1,1,3,3,1,1,2],
  [2,1,3,4,4,3,3,4,4,3,1,2],
  [2,1,3,4,4,3,3,4,4,3,1,2],
  [2,1,1,1,1,1,1,1,1,1,1,2],
  [0,2,2,2,2,2,2,2,2,2,2,0],
  [0,0,5,5,5,1,1,5,5,5,0,0],
  [0,0,5,5,5,1,1,5,5,5,0,0],
  [0,0,2,2,2,0,0,2,2,2,0,0]
];
export const GOOMBA_PALETTE = {
  1: "#a16207",  // body brown
  2: "#1c1009",  // outline
  3: "#fbf2e0",  // eye white
  4: "#1c1009",  // pupil
  5: "#3b2514"   // feet
};

// =============================================================================
// TOWER DEFENSE — 4 turret variants (top-down view, 14x14 each)
// =============================================================================

// TURRET_BASIC: simple gun — yellow/silver, single barrel
export const TURRET_BASIC = [
  [0,0,0,2,2,2,2,2,2,0,0,0,0,0],
  [0,0,2,1,1,1,1,1,1,2,0,0,0,0],
  [0,2,1,3,1,1,1,1,3,1,2,0,0,0],
  [2,1,1,1,1,1,1,1,1,1,1,2,0,0],
  [2,1,3,1,1,4,4,1,1,3,1,2,0,0],
  [2,1,1,1,1,4,4,1,1,1,1,2,2,2],
  [2,1,1,1,1,4,4,1,1,1,1,2,5,2],
  [2,1,3,1,1,4,4,1,1,3,1,2,5,2],
  [2,1,1,1,1,1,1,1,1,1,1,2,2,2],
  [0,2,1,3,1,1,1,1,3,1,2,0,0,0],
  [0,0,2,1,1,1,1,1,1,2,0,0,0,0],
  [0,0,0,2,2,2,2,2,2,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0]
];
export const TURRET_BASIC_PALETTE = {
  1: "#9aa3af",  // base silver
  2: "#1f2937",  // outline
  3: "#fbbf24",  // yellow accent
  4: "#374151",  // central dome
  5: "#1f2937"   // barrel inner
};

// TURRET_CANNON: chunky cannon — brown/grey, double-barrel
export const TURRET_CANNON = [
  [0,0,0,2,2,2,2,2,2,0,0,0,0,0],
  [0,0,2,1,1,1,1,1,1,2,0,0,0,0],
  [0,2,1,1,1,3,3,1,1,1,2,0,0,0],
  [2,1,1,3,3,4,4,3,3,1,1,2,0,0],
  [2,1,3,4,4,4,4,4,4,3,1,2,5,2],
  [2,1,3,4,4,4,4,4,4,3,1,2,5,2],
  [2,1,3,4,4,4,4,4,4,3,1,2,5,2],
  [2,1,3,4,4,4,4,4,4,3,1,2,5,2],
  [2,1,1,3,3,4,4,3,3,1,1,2,0,0],
  [0,2,1,1,1,3,3,1,1,1,2,0,0,0],
  [0,0,2,1,1,1,1,1,1,2,0,0,0,0],
  [0,0,0,2,2,2,2,2,2,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0]
];
export const TURRET_CANNON_PALETTE = {
  1: "#a16207",  // brass
  2: "#1c1917",  // outline
  3: "#451a03",  // dark wood
  4: "#1f2937",  // barrel grey
  5: "#451a03"   // barrel inner
};

// TURRET_FROST: ice tower — cyan/white, with crystal core
export const TURRET_FROST = [
  [0,0,0,2,2,2,2,2,2,0,0,0,0,0],
  [0,0,2,1,1,1,1,1,1,2,0,0,0,0],
  [0,2,1,1,3,3,3,3,1,1,2,0,0,0],
  [2,1,1,3,4,4,4,4,3,1,1,2,0,0],
  [2,1,3,4,5,5,5,5,4,3,1,2,3,2],
  [2,1,3,4,5,5,5,5,4,3,1,2,5,2],
  [2,1,3,4,5,5,5,5,4,3,1,2,5,2],
  [2,1,3,4,5,5,5,5,4,3,1,2,3,2],
  [2,1,1,3,4,4,4,4,3,1,1,2,0,0],
  [0,2,1,1,3,3,3,3,1,1,2,0,0,0],
  [0,0,2,1,1,1,1,1,1,2,0,0,0,0],
  [0,0,0,2,2,2,2,2,2,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0]
];
export const TURRET_FROST_PALETTE = {
  1: "#cffafe",  // ice white
  2: "#155e75",  // outline
  3: "#67e8f9",  // ice mid
  4: "#22d3ee",  // ice dark
  5: "#0e7490"   // crystal core
};

// TURRET_BEAM: laser tower — purple/magenta, energy emitter
export const TURRET_BEAM = [
  [0,0,0,2,2,2,2,2,2,0,0,0,0,0],
  [0,0,2,1,1,1,1,1,1,2,0,0,0,0],
  [0,2,1,3,4,4,4,4,3,1,2,0,0,0],
  [2,1,3,4,5,5,5,5,4,3,1,2,0,0],
  [2,1,4,5,6,6,6,6,5,4,1,2,5,2],
  [2,1,4,5,6,7,7,6,5,4,1,2,6,2],
  [2,1,4,5,6,7,7,6,5,4,1,2,6,2],
  [2,1,4,5,6,6,6,6,5,4,1,2,5,2],
  [2,1,3,4,5,5,5,5,4,3,1,2,0,0],
  [0,2,1,3,4,4,4,4,3,1,2,0,0,0],
  [0,0,2,1,1,1,1,1,1,2,0,0,0,0],
  [0,0,0,2,2,2,2,2,2,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0]
];
export const TURRET_BEAM_PALETTE = {
  1: "#1f0a3d",  // base dark
  2: "#0a0419",  // outline
  3: "#581c87",  // ring 1
  4: "#7e22ce",  // ring 2
  5: "#a855f7",  // ring 3
  6: "#c084fc",  // glow
  7: "#fae8ff"   // core white
};

// =============================================================================
// REGISTRY — for code that wants name → sprite/palette lookup
// =============================================================================

export const SPRITE_PRESETS = {
  // Adventure
  knight: { grid: KNIGHT, palette: KNIGHT_PALETTE },
  dragon: { grid: DRAGON, palette: DRAGON_PALETTE },
  treasure: { grid: TREASURE, palette: TREASURE_PALETTE },
  key: { grid: KEY, palette: KEY_PALETTE },
  gate: { grid: GATE, palette: GATE_PALETTE },
  // Platformer
  plumber: { grid: PLUMBER, palette: PLUMBER_PALETTE },
  coin: { grid: COIN_1, palette: COIN_PALETTE, frames: COIN_FRAMES },
  pipe: { grid: PIPE, palette: PIPE_PALETTE },
  brick: { grid: BRICK, palette: BRICK_PALETTE },
  goomba: { grid: GOOMBA, palette: GOOMBA_PALETTE },
  // Tower Defense
  turretBasic: { grid: TURRET_BASIC, palette: TURRET_BASIC_PALETTE },
  turretCannon: { grid: TURRET_CANNON, palette: TURRET_CANNON_PALETTE },
  turretFrost: { grid: TURRET_FROST, palette: TURRET_FROST_PALETTE },
  turretBeam: { grid: TURRET_BEAM, palette: TURRET_BEAM_PALETTE }
};

export function getSpritePreset(name) {
  return SPRITE_PRESETS[name] || null;
}
