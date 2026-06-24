// BEGIN mChatAI Web Component: systems.softbody-blob
//
// A 2D VERLET soft-body BLOB: a closed ring of point-masses tied together by
// perimeter springs + a couple of cross-braces + a radial PRESSURE / volume
// term toward the centroid. The player (or any caller) can INFLATE it -- it
// rounds out, gets stiff and bouncy -- or DEFLATE it -- it goes soft, splats,
// and oozes. Roll it left / right; it spins as it rolls. It collides with a
// caller-described world (a ground/floor function, solid wall AABBs, and a
// fair "squeeze-through gap" check), all swept so a fast blob can't tunnel.
//
// The whole point of this lego is the TUNED RECIPE that makes a verlet blob
// feel RESPONSIVE instead of soupy:
//   * FIXED timestep accumulator (substeps) so behaviour is identical at 30,
//     60 or 144 fps and a tab-resume can't explode it.
//   * HIGH perimeter-spring stiffness (edgeStiffness ~0.92) so it holds shape.
//   * Several CLAMPED constraint-relaxation ITERATIONS per substep (default 6,
//     clamped 1..12) -- enough to converge, capped so a pathological world
//     can't melt it into goo or cost unbounded time.
//   * Strong velocity DAMPING (air retention) + ground FRICTION so jitter
//     bleeds off instead of accumulating.
//   * Pressure / radial-stiffness / restitution all RAMP with inflate, so one
//     0..1 'inflate' input continuously morphs between tense-bouncy and
//     soft-splat without retuning anything else.
//
// Pure 2D verlet -- NO three.js, NO p5, NO external physics lib, NO DOM /
// canvas / WebGL. The CALLER owns rendering: read blob.points[] (each {x,y})
// to draw the outline, and blob.measure() for the centroid + bounding span.
// DELTA-TIME based; you pass dt in seconds. Units are pixels & seconds, with
// gravity in px/s^2 (so the same numbers read naturally on a canvas).
//
// Exports:
//   stepBlob(blob, dt, world, input)   functional one-shot: advance a plain
//                                       blob state object by dt
//   SoftBodyBlob                        stateful wrapper (build the ring, hold
//                                       opts + the fixed-step accumulator,
//                                       expose measure() / collisions / gap-fit)
//   makeBlob(opts)                      build a fresh blob state object
//   fitsThroughGap(blob, gap)           DETERMINISTIC bounding-span gap check
//   DEFAULT_BLOB_OPTS                   the tunable defaults (read-only)
//
// Usage (stateful -- the common case):
//   import { SoftBodyBlob } from './systems/softbody-blob.js';
//   const blob = new SoftBodyBlob({ cx: 220, cy: 400, radius: 30, pointCount: 12 });
//   const world = {
//     floorAt: (x) => (x > pitX && x < pitX + pitW) ? null : floorY, // null = gap
//     walls:   [{ x: 600, y: -200, w: 60, h: 540 }],                  // solid AABBs
//   };
//   // each frame:
//   const r = blob.update(dt, world, {
//     inflate: pointerHeld,       // hold = inflate, release = deflate
//     roll: (right?1:0) - (left?1:0),
//   });
//   if (r.landed && r.landImpact > 2) playBoing(r.landImpact);
//   // draw it yourself:
//   ctx.beginPath();
//   const P = blob.points;
//   // ...moveTo/quadraticCurveTo around P, fill...
//   const m = blob.measure(); drawEyes(m.cx, m.cy);
//
// Usage (deterministic fair squeeze-through):
//   import { fitsThroughGap } from './systems/softbody-blob.js';
//   if (fitsThroughGap(blob, { height: ceilingGapPx })) { /* clean pass */ }
//   // -> compares the blob's CURRENT bounding HEIGHT (squished while deflated)
//   //    against the gap; deflate to fit, inflate and you're too tall.
//
// Usage (functional one-shot, no class):
//   import { makeBlob, stepBlob } from './systems/softbody-blob.js';
//   const b = makeBlob({ cx: 100, cy: 100, radius: 24 });
//   stepBlob(b, dt, world, { inflate: true, roll: 1 });
//
// Contracts:
//   - A "blob" is a plain object: {
//       points:  [{ x, y, px, py }, ...]   point-masses (px/py = prev position)
//       edges:   [[i, j, rest], ...]        spring constraints (rest length px)
//       inflate: 0..1                        current inflate state (eased)
//       opts:    resolved options (see DEFAULT_BLOB_OPTS)
//       _acc:    fixed-step time accumulator (seconds, internal)
//     }
//     Build one with makeBlob(opts) or new SoftBodyBlob(opts).
//   - stepBlob(blob, dt, world, input) advances the blob by dt seconds using a
//     FIXED-timestep accumulator (opts.fixedStep). Mutates blob in place.
//     Returns a result { cx, cy, minX, maxX, minY, maxY, width, height,
//     vy (centroid vertical speed, px/s), landed, landImpact, blockedX } so the
//     caller can drive sound / camera / scoring without re-measuring.
//   - input (all optional): {
//       inflate : boolean | 0..1   true (or >=0.5) eases toward inflated;
//                                  false eases toward deflated. A number sets
//                                  the inflate TARGET directly.
//       roll    : -1 | 0 | +1      horizontal roll force + spin (negative=left)
//       anchor  : { x, y, k }      optional point the centroid is pulled toward
//                                  with stiffness k (0..1) -- e.g. a grabbed
//                                  rope node / slingshot tether.
//     }
//   - world (all optional): {
//       floorAt(x) -> number|null  ground Y at world-x; return null for a GAP
//                                  (the blob falls through). Omit => no floor.
//       walls : [{ x, y, w, h }]   solid AABBs; the blob is pushed out along
//                                  the shallowest axis (swept per substep).
//       gravity : number           px/s^2 override for this world (else opts).
//     }
//   - blob.measure() / the result expose centroid (cx,cy) + bounding box
//     (minX..maxY) + span (width,height). Rendering reads these; physics never
//     touches the DOM / canvas / GPU.
//   - fitsThroughGap(blob, gap) is DETERMINISTIC: it compares the blob's
//     current bounding span to gap.height (and optionally gap.width). It does
//     NOT mutate -- it answers "would I fit RIGHT NOW", so squeeze gameplay is
//     fair and predictable (deflate to shrink the span, then pass).
//   - Renderer-agnostic & deps-free: nothing to dispose -- no dispose().
//
// Extracted + generalized from the Rope Runner physics() / integrate() /
// relax() / collide() soft-body loop (the inflate-bounce / deflate-squish blob).

export const DEFAULT_BLOB_OPTS = Object.freeze({
  // --- shape ---
  pointCount: 12,        // ring point-masses (8..24 reasonable)
  radius: 30,            // resting radius (px) at neutral inflate
  crossBraces: true,     // add a few diameter springs for structural rigidity
  crossRest: 0.98,       // cross-spring rest as a fraction of the diameter

  // --- fixed-step integration ---
  fixedStep: 1 / 120,    // physics substep size (s). Smaller = stabler/costlier
  maxSubsteps: 6,        // cap substeps per frame (stops a long stall spiral)
  iterations: 6,         // constraint relaxation passes per substep (clamped 1..12)

  // --- forces / damping (px & seconds) ---
  gravity: 1512,         // px/s^2 downward (~0.42 px per 1/120s frame, squared)
  airDamping: 4.0,       // velocity retention coefficient; higher = more drag
  edgeStiffness: 0.92,   // perimeter spring stiffness (HIGH = holds shape)

  // --- inflate dynamics (one 0..1 input drives all three) ---
  inflateRate: 4.5,      // how fast inflate eases toward 1 when held (per s)
  deflateRate: 5.1,      // how fast inflate eases toward 0 when released (per s)
  radiusMin: 0.74,       // radius multiplier at inflate=0 (squished span)
  radiusGain: 0.55,      // extra radius multiplier per unit inflate
  radialStiffMin: 0.05,  // pressure stiffness at inflate=0 (soft / oozy)
  radialStiffGain: 0.42, // extra pressure stiffness per unit inflate (tense)
  restitutionMin: 0.12,  // floor bounce at inflate=0 (a splat)
  restitutionGain: 0.52, // extra bounce per unit inflate (a beach ball)

  // --- ground / rolling ---
  groundFriction: 0.78,  // tangential velocity retained on floor contact
  rollAccel: 1512,       // horizontal roll force (px/s^2) from input.roll
  rollSpin: 1.44,        // rolling spin rate around centroid (rad/s @ |roll|=1)
  maxRollSpeed: 750,     // horizontal speed clamp while rolling (px/s)

  // --- gap fit ---
  gapMargin: 2           // px slack subtracted from the gap before comparing
});

function num(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

// Layer caller opts over the frozen defaults; coerce numerics, validate counts.
function resolveOpts(opts) {
  const o = {};
  for (const k in DEFAULT_BLOB_OPTS) o[k] = DEFAULT_BLOB_OPTS[k];
  if (opts) {
    for (const k in DEFAULT_BLOB_OPTS) {
      if (k in opts) {
        const dv = DEFAULT_BLOB_OPTS[k];
        o[k] = (typeof dv === 'boolean') ? !!opts[k] : num(opts[k], dv);
      }
    }
  }
  o.pointCount = Math.max(3, Math.round(o.pointCount));
  o.iterations = clamp(Math.round(o.iterations), 1, 12);       // the clamp that matters
  o.maxSubsteps = clamp(Math.round(o.maxSubsteps), 1, 16);
  if (!(o.fixedStep > 0)) o.fixedStep = DEFAULT_BLOB_OPTS.fixedStep;
  return o;
}

/**
 * Build a fresh blob state object: a ring of point-masses + perimeter springs
 * (+ optional cross-braces), centred at (opts.cx, opts.cy).
 * @param {object} [opts] see DEFAULT_BLOB_OPTS plus { cx, cy } spawn centre.
 * @returns {object} a blob state object (drive it with stepBlob).
 */
export function makeBlob(opts) {
  const o = resolveOpts(opts);
  const cx = num(opts && opts.cx, 0);
  const cy = num(opts && opts.cy, 0);
  const n = o.pointCount;
  const points = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = cx + Math.cos(a) * o.radius;
    const y = cy + Math.sin(a) * o.radius;
    points.push({ x, y, px: x, py: y }); // px/py = previous position (verlet)
  }
  const edges = [];
  // Perimeter springs: each point to its neighbour, rest = actual gap.
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    edges.push([i, j, dist(points[i], points[j])]);
  }
  // A few cross-braces (diameters) so the ring resists collapsing flat.
  if (o.crossBraces) {
    const half = Math.floor(n / 2);
    for (let i = 0; i < n; i++) {
      const j = (i + half) % n;
      if (i < j) edges.push([i, j, dist(points[i], points[j]) * o.crossRest]);
    }
  }
  return { points, edges, inflate: 0, opts: o, _acc: 0 };
}

function dist(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy) || 0.0001;
}

// Centroid + axis-aligned bounding box of the current point cloud.
function measureBlob(blob) {
  const P = blob.points;
  const n = P.length;
  let sx = 0, sy = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = P[i];
    sx += p.x; sy += p.y;
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  return {
    cx: sx / n, cy: sy / n,
    minX: x0, maxX: x1, minY: y0, maxY: y1,
    width: x1 - x0, height: y1 - y0
  };
}

// --- VERLET integrate: one substep of size h (seconds). Mutates points. ----
// Velocity is implicit (current - previous). We apply exponential air damping,
// the horizontal roll force, gravity, then advance. dragMul precomputed by the
// caller from airDamping*h so we don't recompute Math.exp per point.
function integrate(blob, h, rollDir, gravity, dragMul, maxRoll) {
  const P = blob.points;
  const o = blob.opts;
  const rollA = rollDir * o.rollAccel * h;          // velocity added this substep
  const maxStepX = maxRoll * h;                      // horizontal speed -> per-step cap
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    // implicit velocity * damping
    let vx = (p.x - p.px) * dragMul;
    let vy = (p.y - p.py) * dragMul;
    p.px = p.x; p.py = p.y;
    // horizontal roll force + clamp
    vx += rollA;
    if (vx > maxStepX) vx = maxStepX;
    else if (vx < -maxStepX) vx = -maxStepX;
    // integrate (gravity is an acceleration: + a*h applied to the step)
    p.x += vx;
    p.y += vy + gravity * h * h;
  }
  // Rolling spin: rotate every point a little around the centroid so the blob
  // visibly tumbles in the roll direction (purely a position nudge).
  if (rollDir) {
    const m = measureBlob(blob);
    const ang = o.rollSpin * rollDir * h;            // rad this substep
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      const rx = p.x - m.cx, ry = p.y - m.cy;
      p.x += -ang * ry;
      p.y += ang * rx;
    }
  }
}

// --- relax: one constraint-satisfaction pass (run iterations times) ---------
// 1) perimeter + cross springs pull point pairs to rest length (stiffness).
// 2) a radial PRESSURE term pushes every point toward/away from the centroid
//    to restore the target (inflate-scaled) radius -- this is the "volume".
// 3) an optional anchor pulls the whole centroid toward a caller point.
function relax(blob, restRadius, radialStiff, anchor) {
  const P = blob.points;
  const E = blob.edges;
  const stiff = blob.opts.edgeStiffness;
  // 1) springs
  for (let e = 0; e < E.length; e++) {
    const a = P[E[e][0]], b = P[E[e][1]], rest = E[e][2];
    let dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    const diff = ((d - rest) / d) * 0.5 * stiff;     // split correction both ends
    dx *= diff; dy *= diff;
    a.x += dx; a.y += dy;
    b.x -= dx; b.y -= dy;
  }
  // 2) radial pressure toward the centroid (the "inflate volume" term)
  const m = measureBlob(blob);
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    let dx = p.x - m.cx, dy = p.y - m.cy;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    const diff = ((restRadius - d) / d) * radialStiff;
    p.x += dx * diff;
    p.y += dy * diff;
  }
  // 3) anchor tether (slingshot / grab): pull centroid toward anchor.{x,y}
  if (anchor) {
    const k = clamp(num(anchor.k, 0.6), 0, 1);
    const ax = num(anchor.x, m.cx), ay = num(anchor.y, m.cy);
    const dx = (ax - m.cx) * k, dy = (ay - m.cy) * k;
    if (dx || dy) for (let i = 0; i < P.length; i++) { P[i].x += dx; P[i].y += dy; }
  }
}

// --- collide: swept ground + wall resolution. Returns max landing speed. ----
// Floor: per point, query world.floorAt(x); if below it, snap up and reflect
// the implicit vertical velocity by restitution, shedding tangential speed by
// friction. Walls: eject a penetrating point back the way it CAME (using its
// previous position to pick the entry face), and only fall back to shallowest-
// axis when it was already inside last substep. This is the no-tunnel guard --
// a fast point gets pushed back to the face it crossed, never flushed out the
// far side -- so the blob is BLOCKED by a solid wall, not teleported through.
function collide(blob, world, restitution) {
  const P = blob.points;
  const o = blob.opts;
  const floorAt = world && typeof world.floorAt === 'function' ? world.floorAt : null;
  const walls = world && Array.isArray(world.walls) ? world.walls : null;
  let landImpact = 0;
  let blockedX = false;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    // ground (null floor = a gap -> fall through)
    if (floorAt) {
      const fy = floorAt(p.x);
      if (fy !== null && typeof fy === 'number' && p.y > fy) {
        const vy = p.y - p.py;          // implicit vertical velocity
        const vx = p.x - p.px;
        if (vy > landImpact) landImpact = vy;
        p.y = fy;
        p.py = p.y + vy * restitution;  // bounce: reflect & scale
        p.px = p.x - vx * o.groundFriction; // friction: shed tangential speed
      }
    }
    // solid wall AABBs: swept, velocity-aware ejection (no tunnelling).
    if (walls) {
      for (let w = 0; w < walls.length; w++) {
        const r = walls[w];
        if (!r) continue;
        const rx = num(r.x, 0), ry = num(r.y, 0), rw = num(r.w, 0), rh = num(r.h, 0);
        if (p.x > rx && p.x < rx + rw && p.y > ry && p.y < ry + rh) {
          // Which faces was the point OUTSIDE last substep? Eject back through
          // the face it actually CROSSED, so a fast point can't be flushed out
          // the opposite side. px/py is the previous (pre-integrate) position.
          const wasLeft = p.px <= rx;          // came from the left
          const wasRight = p.px >= rx + rw;    // came from the right
          const wasAbove = p.py <= ry;         // came from above
          const wasBelow = p.py >= ry + rh;    // came from below
          const dl = p.x - rx;                 // penetration depth per face
          const dr = (rx + rw) - p.x;
          const dt = p.y - ry;
          const db = (ry + rh) - p.y;
          // Prefer the crossed face; fall back to shallowest axis if it was
          // already inside last substep (no clean entry face to use).
          if (wasAbove && !wasLeft && !wasRight) { p.y = ry; p.py = p.y; }
          else if (wasBelow && !wasLeft && !wasRight) { p.y = ry + rh; p.py = p.y; }
          else if (wasLeft) { p.x = rx; p.px = p.x; blockedX = true; }
          else if (wasRight) { p.x = rx + rw; p.px = p.x; blockedX = true; }
          else {
            // already embedded: eject along the shallowest axis as a last resort
            const mMin = Math.min(dl, dr, dt, db);
            if (mMin === dt) { p.y = ry; p.py = p.y; }
            else if (mMin === db) { p.y = ry + rh; p.py = p.y; }
            else if (mMin === dl) { p.x = rx; p.px = p.x; blockedX = true; }
            else { p.x = rx + rw; p.px = p.x; blockedX = true; }
          }
        }
      }
    }
  }
  return { landImpact, blockedX };
}

/**
 * Advance a blob by dt seconds using a FIXED-timestep accumulator. Pure 2D
 * verlet; mutates the blob in place. See the CONTRACTS block for world/input.
 * @param {object} blob a blob state object from makeBlob / new SoftBodyBlob
 * @param {number} dt seconds since the last update
 * @param {object} [world] { floorAt(x)->y|null, walls:[{x,y,w,h}], gravity? }
 * @param {object} [input] { inflate:boolean|0..1, roll:-1|0|1, anchor?:{x,y,k} }
 * @returns {object} result { cx, cy, minX..maxY, width, height, vy, landed,
 *                            landImpact, blockedX }
 */
export function stepBlob(blob, dt, world, input) {
  const o = blob.opts;
  const h = o.fixedStep;

  // --- inflate easing: bool held -> ease toward 1, released -> toward 0; a
  //     number sets the TARGET directly. Done once per frame (not per substep).
  const inf = input ? input.inflate : undefined;
  let target;
  if (typeof inf === 'number') target = clamp(inf, 0, 1);
  else target = inf ? 1 : 0;
  const d = clamp(num(dt, 0), 0, 0.1); // clamp frame dt so a stall can't jump inflate
  const rate = (target > blob.inflate ? o.inflateRate : o.deflateRate) * d;
  if (target > blob.inflate) blob.inflate = Math.min(target, blob.inflate + rate);
  else blob.inflate = Math.max(target, blob.inflate - rate);
  const inflate = blob.inflate;

  // inflate drives radius / pressure stiffness / restitution together
  const restRadius = o.radius * (o.radiusMin + o.radiusGain * inflate);
  const radialStiff = o.radialStiffMin + o.radialStiffGain * inflate;
  const restitution = o.restitutionMin + o.restitutionGain * inflate;

  const rollDir = input ? clamp(num(input.roll, 0), -1, 1) : 0;
  const anchor = input && input.anchor ? input.anchor : null;
  const gravity = world && typeof world.gravity === 'number' ? world.gravity : o.gravity;
  // exponential air damping per substep (frame-rate independent)
  const dragMul = Math.exp(-o.airDamping * h);

  // record centroid before stepping so we can report vertical centroid speed
  const before = measureBlob(blob);

  // --- FIXED-TIMESTEP loop: drain the accumulator in equal h-sized substeps.
  blob._acc += d;
  let steps = 0;
  let maxImpact = 0;
  let blockedX = false;
  let didStep = false;
  while (blob._acc >= h && steps < o.maxSubsteps) {
    integrate(blob, h, rollDir, gravity, dragMul, o.maxRollSpeed);
    for (let k = 0; k < o.iterations; k++) relax(blob, restRadius, radialStiff, anchor);
    const c = collide(blob, world, restitution);
    if (c.landImpact > maxImpact) maxImpact = c.landImpact;
    if (c.blockedX) blockedX = true;
    blob._acc -= h;
    steps++;
    didStep = true;
  }
  // If we hit the substep cap (huge dt), drop the leftover so we don't spiral.
  if (steps >= o.maxSubsteps) blob._acc = 0;

  const after = measureBlob(blob);
  // landImpact is per-substep position delta; report it as px/s for the caller.
  const landImpactSpeed = maxImpact / h;
  return {
    cx: after.cx, cy: after.cy,
    minX: after.minX, maxX: after.maxX, minY: after.minY, maxY: after.maxY,
    width: after.width, height: after.height,
    vy: didStep ? (after.cy - before.cy) / d : 0,
    landed: maxImpact > 0,
    landImpact: landImpactSpeed,
    blockedX
  };
}

/**
 * DETERMINISTIC fair gap-fit check. Compares the blob's CURRENT bounding span
 * against a gap; does NOT mutate or run physics, so squeeze gameplay is
 * predictable: deflate to shrink the span (height), then you pass.
 * @param {object} blob a blob state object
 * @param {object} gap { height?:number, width?:number } gap clearance in px.
 *   height = vertical clearance (default check); width = horizontal clearance.
 *   Omit a dimension to skip that axis.
 * @returns {boolean} true if the blob's span fits within the gap (minus margin)
 */
export function fitsThroughGap(blob, gap) {
  const m = measureBlob(blob);
  const margin = blob.opts ? blob.opts.gapMargin : DEFAULT_BLOB_OPTS.gapMargin;
  if (gap && typeof gap.height === 'number') {
    if (m.height > gap.height - margin) return false;
  }
  if (gap && typeof gap.width === 'number') {
    if (m.width > gap.width - margin) return false;
  }
  return true;
}

/**
 * Stateful soft-body blob. Builds the ring, holds opts + the fixed-step
 * accumulator, and exposes the geometry so you only own rendering.
 */
export class SoftBodyBlob {
  // opts: any of DEFAULT_BLOB_OPTS plus { cx, cy } spawn centre.
  constructor(opts = {}) {
    this._blob = makeBlob(opts);
  }

  /** The live array of point-masses ({ x, y, px, py }) -- draw the outline. */
  get points() { return this._blob.points; }
  /** Current eased inflate state, 0 (deflated) .. 1 (inflated). */
  get inflate() { return this._blob.inflate; }
  /** Resolved options (read-only reference). */
  get opts() { return this._blob.opts; }

  /** Centroid + bounding box + span of the current shape (read for drawing). */
  measure() { return measureBlob(this._blob); }

  /** Deterministic, non-mutating fair gap-fit check (see fitsThroughGap). */
  fitsThroughGap(gap) { return fitsThroughGap(this._blob, gap); }

  /**
   * Advance one frame. Returns the stepBlob result (centroid, span, landing).
   * @param {number} dt seconds
   * @param {object} [world] { floorAt(x)->y|null, walls, gravity? }
   * @param {object} [input] { inflate, roll, anchor? }
   */
  update(dt, world, input) {
    return stepBlob(this._blob, dt, world, input);
  }

  /** Re-spawn the blob as a fresh ring at (cx, cy) (e.g. on death/restart). */
  reset(cx, cy) {
    const o = Object.assign({}, this._blob.opts, { cx, cy });
    this._blob = makeBlob(o);
    return this;
  }

  /** Translate every point + its previous position by (dx, dy) (no velocity). */
  translate(dx, dy) {
    for (const p of this._blob.points) { p.x += dx; p.y += dy; p.px += dx; p.py += dy; }
    return this;
  }
}

// END mChatAI Web Component: systems.softbody-blob
