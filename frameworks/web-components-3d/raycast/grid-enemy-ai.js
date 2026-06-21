// BEGIN mChatAI Web Component: raycast.grid-enemy-ai
//
// Grid-space enemy movement brains (pursuit + targeting) for raycaster AND
// 2D top-down dungeon games: grid-space pursuit (BFS path-find + sampled
// line-of-sight + axis-separated tile collision), delta-time, renderer-agnostic.
//
// PURE math over a tile array. NO canvas, NO three.js, NO DOM, ZERO external
// deps -- it never imports anything, so it is offline-safe and equally at home
// in a Wolfenstein-style raycaster or a flat top-down crawler. It only MOVES
// and TARGETS plain enemy objects; you keep owning rendering, sprites, sound,
// health, win/lose. Pairs with raycast.grid-map (BFS map helpers) and
// raycast.player-controller (the same axis-separated slide). Distinct from
// systems.spawn-wave-3d, which only SCHEDULES spawns -- this one decides where
// each living enemy walks and when it bites.
//
// Three composable per-enemy "brains" (call one per frame, per enemy):
//   stepStalker(enemy, target, grid, dt, cfg)  -- relentless BFS pursuer that
//       re-paths every ~cfg.repathInterval and walks the path one cell at a
//       time. Corridor-correct; never loses you behind a wall. (asylum
//       "the Resident": bfsNext + updateEnemy.)
//   stepChaser(enemy, target, grid, dt, cfg)   -- sampled line-of-sight gate,
//       then beelines toward the target with a close-range speed bump, plus
//       melee contact damage and optional ranged advance-and-fire with a
//       distance hit-probability falloff. (catacomb imps / crypt skeletons /
//       bunker guards.)
//   stepShamble(enemy, target, grid, dt, cfg)  -- moves toward the target PLUS
//       a sinusoidal lateral wobble (perpendicular * sin(phase)) for a
//       staggering zombie gait. (bunker-z shambler.)
//
// Shared exports:
//   lineClear(grid, x0,y0, x1,y1, isSolidFn) -> bool
//       Sampled (not DDA) line-of-sight raymarch between two world points.
//   enemyMove(enemy, dx,dy, grid, radius, isSolidFn) -> { movedX, movedY }
//       Axis-separated grid move with wall slide (same technique the player
//       controller uses), so enemies never tunnel through walls or wedge in
//       corners.
//   bfsNextStep(grid, sx,sy, tx,ty, isSolidFn, maxNodes) -> [cx,cy] | null
//       Breadth-first next cell center toward a goal. (Re-exported so a game
//       can pair this with raycast.grid-map; identical contract.)
//   makeIsSolid(grid, solidValues) -> isSolidFn
//       Convenience: turn a grid + a set/list/predicate of "solid" tile values
//       into the (x,y)->bool predicate every helper here expects.
//   attackCooldown(enemy, target, dt, cfg, onHit) -> damageEvent | null
//       Decrements enemy.atkCd; when the target is within cfg.meleeRange and
//       the cooldown is up, returns { amount, kind:'melee', enemy } (and calls
//       onHit if given). It NEVER touches the player's health -- you apply the
//       damage from the event. Use it standalone or let stepChaser call it.
//   GridEnemyAI.defaults -- the clamped default cfg block (override per type).
//
// An enemy is just a plain object you own:
//   { x, y, angle?, speed?, atkCd?, phase?, _path?, _repathT?, alert? }
// Only x and y are required; the steppers create the bookkeeping fields they
// need (_path, _repathT, phase, atkCd) the first time they run, so you can pass
// a freshly spawned { x, y } and it just works. A game picks a brain per enemy
// type and may switch brains at runtime (e.g. shamble until alerted, then chase).
//
// Usage:
//   import {
//     stepStalker, stepChaser, stepShamble,
//     lineClear, enemyMove, bfsNextStep, makeIsSolid, attackCooldown
//   } from './raycast/grid-enemy-ai.js';
//
//   // grid is a 2D array; pick what counts as a wall:
//   const solid = makeIsSolid(grid, [1, '#', 'T']); // numbers OR map chars
//   const player = { x: 2.5, y: 2.5 };
//
//   // per frame, per enemy:
//   for (const e of stalkers) stepStalker(e, player, grid, dt, { speed: 1.05, isSolid: solid });
//   for (const e of imps) {
//     const hit = stepChaser(e, player, grid, dt, {
//       speed: 1.9, speedBump: 1.5, bumpRange: 4, meleeRange: 0.7,
//       meleeDamage: 12, atkInterval: 0.6, isSolid: solid
//     });
//     if (hit) player.health -= hit.amount;        // YOU apply the damage
//   }
//   for (const e of zombies) stepShamble(e, player, grid, dt, { speed: 1.0, wobble: 0.45, isSolid: solid });
//
//   // ranged guard (advance-and-fire with LOS + hit-probability falloff):
//   const shot = stepChaser(guard, player, grid, dt, {
//     speed: 0.55, keepDistance: 2.5, sightRange: 9.5,
//     ranged: true, rangedDamage: 9, fireInterval: 1.15,
//     hitChanceNear: 0.7, hitChanceFar: 0.16, hitFalloff: 0.05,
//     isSolid: solid
//   });
//   if (shot && shot.kind === 'ranged') player.health -= shot.amount;
//
// Contracts:
//   - grid is `grid[y][x]` (row-major). Out-of-bounds reads as solid.
//   - isSolidFn(x, y) -> bool takes WORLD coords (it floors internally). If you
//     omit cfg.isSolid, a fallback treats truthy / '#' / 'T' / 'D' tiles as solid.
//   - All movement is delta-time scaled (units per second). Stable 0..0.05s dt.
//   - Steppers MUTATE enemy.x / enemy.y / enemy.angle / enemy.atkCd in place
//     and RETURN a damage event (or null). They never read or write the target's
//     health -- emit/return only, exactly as the spec requires.
//   - No GPU/DOM/listeners are owned, so there is no dispose() to call. (The
//     dispose() convention applies to modules that hold canvases/listeners.)
//
// Renderer-agnostic, dependency-free, delta-time. ASCII only.

// ---------------------------------------------------------------------------
// Clamped defaults. Per RULE #1 these are conservative fallbacks only; a game
// (or mchatai-source content) overrides any field via the per-call cfg.
// ---------------------------------------------------------------------------
const DEFAULTS = Object.freeze({
  // shared
  speed: 1.2,            // cells per second
  radius: 0.25,          // collision half-extent for axis-separated move
  sightRange: 12,        // max LOS distance the brain will react within
  losStep: 0.1,          // sampled LOS marching step (world units)
  // stalker (BFS)
  repathInterval: 0.4,   // seconds between BFS recomputes
  maxNodes: 1024,        // BFS expansion cap (keeps it cheap on big maps)
  arriveEps: 0.0001,     // "close enough" to the next cell center
  // chaser (LOS beeline)
  speedBump: 0,          // extra cells/sec added when within bumpRange
  bumpRange: 4,          // distance under which speedBump applies
  requireLOS: true,      // only chase when the target is visible
  keepDistance: 0,       // ranged enemies stop advancing inside this radius
  // shamble (wobble)
  wobble: 0.45,          // lateral wobble amplitude
  wobbleRate: 4,         // wobble phase speed (radians/sec)
  // melee
  meleeRange: 0.75,      // contact distance for a bite
  meleeDamage: 10,
  atkInterval: 0.8,      // melee cooldown (seconds)
  knockback: 0,          // optional shove on the ATTACKER's contact (cells)
  // ranged advance-and-fire
  ranged: false,
  rangedDamage: 9,
  fireInterval: 1.0,     // ranged cooldown (seconds)
  fireJitter: 0.3,       // +/- random fraction added to fireInterval
  hitChanceNear: 0.7,    // probability when adjacent
  hitChanceFar: 0.16,    // floor probability at range
  hitFalloff: 0.05,      // probability lost per cell of distance
  rng: Math.random       // injectable RNG for deterministic tests
});

function num(v, d) { return (typeof v === 'number' && Number.isFinite(v)) ? v : d; }
function pick(cfg, key) { return (cfg && cfg[key] !== undefined) ? cfg[key] : DEFAULTS[key]; }

// ---------------------------------------------------------------------------
// Solidity predicate
// ---------------------------------------------------------------------------

// Default "is this tile a wall?" used when a game does not supply cfg.isSolid.
// Treats truthy numbers and the common dungeon glyphs as solid; OOB == solid.
function defaultIsSolid(grid, x, y) {
  const cx = Math.floor(x), cy = Math.floor(y);
  if (cy < 0 || cx < 0 || !grid[cy] || cx >= grid[cy].length) return true;
  const c = grid[cy][cx];
  if (c === 0 || c === '.' || c === ' ' || c === null || c === undefined || c === false) return false;
  if (c === '#' || c === 'T' || c === 'D') return true;
  return !!c; // any other truthy tile (numbered walls etc.)
}

// Build an isSolidFn(x,y) from a grid plus a description of which tiles block.
//   solidValues: a function (c)->bool, an Array/Set of blocking tile values,
//   or omitted (uses defaultIsSolid). Always reports OOB as solid.
export function makeIsSolid(grid, solidValues) {
  if (typeof solidValues === 'function') {
    return function (x, y) {
      const cx = Math.floor(x), cy = Math.floor(y);
      if (cy < 0 || cx < 0 || !grid[cy] || cx >= grid[cy].length) return true;
      return !!solidValues(grid[cy][cx], cx, cy);
    };
  }
  if (Array.isArray(solidValues) || solidValues instanceof Set) {
    const set = solidValues instanceof Set ? solidValues : new Set(solidValues);
    return function (x, y) {
      const cx = Math.floor(x), cy = Math.floor(y);
      if (cy < 0 || cx < 0 || !grid[cy] || cx >= grid[cy].length) return true;
      return set.has(grid[cy][cx]);
    };
  }
  return function (x, y) { return defaultIsSolid(grid, x, y); };
}

function resolveSolid(grid, cfg) {
  const fn = cfg && cfg.isSolid;
  if (typeof fn === 'function') return fn;
  return function (x, y) { return defaultIsSolid(grid, x, y); };
}

// ---------------------------------------------------------------------------
// lineClear -- sampled (DDA-free) line-of-sight raymarch
// (bunker / catacomb / crypt all used this exact shape: march fixed steps,
// fail on the first solid sample.)
// ---------------------------------------------------------------------------
export function lineClear(grid, x0, y0, x1, y1, isSolidFn, step) {
  const solid = (typeof isSolidFn === 'function')
    ? isSolidFn
    : function (x, y) { return defaultIsSolid(grid, x, y); };
  const dx = x1 - x0, dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const s = num(step, DEFAULTS.losStep);
  const steps = Math.max(1, Math.ceil(dist / s));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (solid(x0 + dx * t, y0 + dy * t)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// enemyMove -- axis-separated grid move with wall slide
// (crypt's enemyMove + bunker's per-axis guard: try X, then Y, each gated by a
// radius probe in the direction of travel, so a blocked axis still slides.)
// Returns how far it actually moved on each axis (0 when blocked).
// ---------------------------------------------------------------------------
export function enemyMove(enemy, dx, dy, grid, radius, isSolidFn) {
  const solid = (typeof isSolidFn === 'function')
    ? isSolidFn
    : function (x, y) { return defaultIsSolid(grid, x, y); };
  const r = num(radius, DEFAULTS.radius);
  let movedX = 0, movedY = 0;
  if (dx !== 0) {
    const nx = enemy.x + dx;
    const probe = nx + (dx > 0 ? r : -r);
    if (!solid(probe, enemy.y)) { enemy.x = nx; movedX = dx; }
  }
  if (dy !== 0) {
    const ny = enemy.y + dy;
    const probe = ny + (dy > 0 ? r : -r);
    if (!solid(enemy.x, probe)) { enemy.y = ny; movedY = dy; }
  }
  return { movedX: movedX, movedY: movedY };
}

// ---------------------------------------------------------------------------
// bfsNextStep -- breadth-first next cell-center toward a goal.
// (asylum bfsNext, generalized: any grid, any solidity predicate, node cap.)
// Returns [cellX + 0.5, cellY + 0.5] for the FIRST cell to walk into, or the
// target's own world point if already in the goal cell, or null if unreachable.
// Contract matches raycast.grid-map.bfsNextStep so the two are interchangeable.
// ---------------------------------------------------------------------------
export function bfsNextStep(grid, sx, sy, tx, ty, isSolidFn, maxNodes) {
  const solid = (typeof isSolidFn === 'function')
    ? isSolidFn
    : function (x, y) { return defaultIsSolid(grid, x, y); };
  const startX = Math.floor(sx), startY = Math.floor(sy);
  const goalX = Math.floor(tx), goalY = Math.floor(ty);
  if (startX === goalX && startY === goalY) return [tx, ty];

  const cap = num(maxNodes, DEFAULTS.maxNodes);
  const queue = [[startX, startY]];
  const prev = Object.create(null);
  prev[startX + ',' + startY] = null;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let head = 0, expanded = 0, found = false;

  while (head < queue.length && expanded < cap) {
    expanded++;
    const cur = queue[head++];
    if (cur[0] === goalX && cur[1] === goalY) { found = true; break; }
    for (let k = 0; k < 4; k++) {
      const nx = cur[0] + dirs[k][0];
      const ny = cur[1] + dirs[k][1];
      const key = nx + ',' + ny;
      if (prev[key] !== undefined) continue;
      // sample the cell center; solid cells are not walkable
      if (solid(nx + 0.5, ny + 0.5)) continue;
      prev[key] = cur;
      queue.push([nx, ny]);
    }
  }
  if (!found) return null;

  // walk the parent chain back to the cell adjacent to the start
  let node = [goalX, goalY];
  let p = prev[goalX + ',' + goalY];
  while (p && !(p[0] === startX && p[1] === startY)) {
    node = p;
    p = prev[p[0] + ',' + p[1]];
  }
  return [node[0] + 0.5, node[1] + 0.5];
}

// ---------------------------------------------------------------------------
// attackCooldown / contact-damage helper
// Decrements enemy.atkCd; when the target is within meleeRange and the cooldown
// has elapsed, resets the cooldown and RETURNS a damage event. Does NOT modify
// the target. Optionally applies knockback to the ATTACKER's facing (push the
// enemy back a hair on contact -- generalized from crypt resolveSwing knockback,
// here as an attacker-side option). Calls onHit(event) if provided.
// ---------------------------------------------------------------------------
export function attackCooldown(enemy, target, dt, cfg, onHit) {
  cfg = cfg || {};
  if (typeof enemy.atkCd !== 'number') enemy.atkCd = 0;
  if (enemy.atkCd > 0) enemy.atkCd -= dt;

  const dx = target.x - enemy.x, dy = target.y - enemy.y;
  const dist = Math.hypot(dx, dy);
  const range = pick(cfg, 'meleeRange');
  if (dist > range || enemy.atkCd > 0) return null;

  enemy.atkCd = pick(cfg, 'atkInterval');
  const kb = pick(cfg, 'knockback');
  if (kb > 0 && dist > 1e-6) {
    // shove the attacker back along the contact normal (away from target)
    enemy.x -= (dx / dist) * kb;
    enemy.y -= (dy / dist) * kb;
  }
  const event = { amount: pick(cfg, 'meleeDamage'), kind: 'melee', enemy: enemy, distance: dist };
  if (typeof onHit === 'function') onHit(event);
  return event;
}

// ---------------------------------------------------------------------------
// stepStalker -- relentless BFS pursuer (asylum "the Resident").
// Every ~repathInterval seconds it recomputes a BFS path to the target, then
// each frame walks toward the stored next cell at `speed`. Corridor-correct:
// it follows walls around to reach you instead of pushing into them.
// Returns a melee damage event when it touches the target (or null).
// ---------------------------------------------------------------------------
export function stepStalker(enemy, target, grid, dt, cfg) {
  cfg = cfg || {};
  const solid = resolveSolid(grid, cfg);
  if (typeof enemy._repathT !== 'number') enemy._repathT = 0;

  enemy._repathT -= dt;
  if (enemy._repathT <= 0 || enemy._path === undefined) {
    enemy._path = bfsNextStep(
      grid, enemy.x, enemy.y, target.x, target.y, solid, pick(cfg, 'maxNodes')
    );
    enemy._repathT = pick(cfg, 'repathInterval');
  }
  // fall back to a direct heading if BFS found nothing this tick (e.g. target
  // momentarily inside a wall cell) -- keeps the stalker pressing forward.
  const goal = enemy._path || [target.x, target.y];

  const gx = goal[0] - enemy.x, gy = goal[1] - enemy.y;
  const d = Math.hypot(gx, gy);
  const speed = pick(cfg, 'speed') * dt;
  if (d > pick(cfg, 'arriveEps')) {
    const stepLen = Math.min(speed, d);
    const mx = (gx / d) * stepLen;
    const my = (gy / d) * stepLen;
    enemy.angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
    enemyMove(enemy, mx, my, grid, pick(cfg, 'radius'), solid);
  }
  return attackCooldown(enemy, target, dt, cfg);
}

// ---------------------------------------------------------------------------
// stepChaser -- LOS-gated beeline with close-range speed bump + attacks.
// Generalizes catacomb imps (LOS gate + bumpRange burst + melee cooldown),
// crypt skeletons (proximity chase + melee), and bunker guards (ranged
// advance-and-fire with keepDistance + LOS + distance hit-probability falloff).
// Set cfg.ranged:true for the gun behavior; leave it false for melee chasers.
// Returns a damage event { kind:'melee'|'ranged', amount, enemy } or null.
// ---------------------------------------------------------------------------
export function stepChaser(enemy, target, grid, dt, cfg) {
  cfg = cfg || {};
  const solid = resolveSolid(grid, cfg);
  const rng = (typeof cfg.rng === 'function') ? cfg.rng : DEFAULTS.rng;
  if (typeof enemy.atkCd !== 'number') enemy.atkCd = 0;
  if (typeof enemy.fireCd !== 'number') enemy.fireCd = 0;
  if (enemy.fireCd > 0) enemy.fireCd -= dt;

  const dx = target.x - enemy.x, dy = target.y - enemy.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return null;

  const sight = pick(cfg, 'sightRange');
  const hasLOS = lineClear(grid, enemy.x, enemy.y, target.x, target.y, solid, pick(cfg, 'losStep'));
  const visible = hasLOS && dist <= sight;
  if (visible) enemy.alert = true; // sticky aggro: once seen, keep coming

  enemy.angle = Math.atan2(dy, dx);

  // ---- movement ----
  const requireLOS = pick(cfg, 'requireLOS');
  const canAdvance = enemy.alert && (!requireLOS || hasLOS);
  if (canAdvance) {
    const keep = pick(cfg, 'keepDistance');
    if (dist > keep) {
      let speed = pick(cfg, 'speed');
      if (dist < pick(cfg, 'bumpRange')) speed += pick(cfg, 'speedBump'); // close-range burst
      const stepLen = speed * dt;
      const nx = dx / dist, ny = dy / dist;
      enemyMove(enemy, nx * stepLen, ny * stepLen, grid, pick(cfg, 'radius'), solid);
    }
  }

  // ---- attack ----
  if (pick(cfg, 'ranged')) {
    // advance-and-fire: needs LOS + within sight + cooldown elapsed
    if (enemy.alert && hasLOS && dist <= sight && enemy.fireCd <= 0) {
      const jitter = pick(cfg, 'fireJitter');
      enemy.fireCd = pick(cfg, 'fireInterval') * (1 - jitter + rng() * jitter * 2);
      // distance hit-probability falloff (bunker updateGuards):
      // near -> hitChanceNear, dropping hitFalloff per cell, floored at hitChanceFar
      const near = pick(cfg, 'hitChanceNear');
      const far = pick(cfg, 'hitChanceFar');
      const pHit = Math.max(far, Math.min(near, near - dist * pick(cfg, 'hitFalloff')));
      if (rng() < pHit) {
        return { amount: pick(cfg, 'rangedDamage'), kind: 'ranged', enemy: enemy, distance: dist, pHit: pHit };
      }
      return { amount: 0, kind: 'miss', enemy: enemy, distance: dist, pHit: pHit };
    }
    return null;
  }
  // melee contact
  return attackCooldown(enemy, target, dt, cfg);
}

// ---------------------------------------------------------------------------
// stepShamble -- staggering zombie gait (bunker-z shambler).
// Moves toward the target, but adds a sinusoidal LATERAL wobble
// (perpendicular * sin(phase)) so the walk weaves drunkenly. Per-enemy phase is
// stored on enemy.phase so a crowd does not march in lockstep.
// Returns a melee damage event when it touches the target (or null).
// ---------------------------------------------------------------------------
export function stepShamble(enemy, target, grid, dt, cfg) {
  cfg = cfg || {};
  const solid = resolveSolid(grid, cfg);
  if (typeof enemy.phase !== 'number') enemy.phase = 0;

  const dx = target.x - enemy.x, dy = target.y - enemy.y;
  const dist = Math.hypot(dx, dy);
  if (dist > 1e-6) {
    enemy.phase += dt * pick(cfg, 'wobbleRate');
    const wob = Math.sin(enemy.phase) * pick(cfg, 'wobble');
    const fx = dx / dist, fy = dy / dist;            // forward unit
    // perpendicular = (-fy, fx); add wobble * perpendicular to the heading
    const speed = pick(cfg, 'speed') * dt;
    const mx = (fx + -fy * wob) * speed;
    const my = (fy + fx * wob) * speed;
    enemy.angle = Math.atan2(dy, dx);
    enemyMove(enemy, mx, my, grid, pick(cfg, 'radius'), solid);
  }
  return attackCooldown(enemy, target, dt, cfg);
}

// Namespaced bundle for callers that prefer a single import. Carries the
// clamped defaults so games can read/clone them.
export const GridEnemyAI = Object.freeze({
  stepStalker: stepStalker,
  stepChaser: stepChaser,
  stepShamble: stepShamble,
  lineClear: lineClear,
  enemyMove: enemyMove,
  bfsNextStep: bfsNextStep,
  makeIsSolid: makeIsSolid,
  attackCooldown: attackCooldown,
  defaults: DEFAULTS
});

// END mChatAI Web Component: raycast.grid-enemy-ai
