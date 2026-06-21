// BEGIN mChatAI Web Component: systems.boid-flock
//
// Classic Reynolds boids -- animated schools of fish, flocks of birds, bat
// swarms, insect clouds, and enemy-swarm AI. For each agent it blends:
//   COHESION  steer toward the local centroid (group stays together)
//   ALIGNMENT match the average neighbor velocity (group moves as one)
//   SEPARATION push away from too-close neighbors (sum of 1/d repulsion)
//   AVOIDANCE flee caller-supplied avoidPoints[] (e.g. the player startles
//             the school -> a temporary 'startled' speed boost)
//   OBSTACLE  steer around caller-supplied obstacles[] (circles / spheres)
//   BOUNDS    soft steering back inside the world box
//   WANDER    idle cos/sin*phase jitter so a still flock still breathes
//   CLAMP     min-speed kick + a max speed that is raised while startled
//
// Agents are PLAIN objects { x, y, vx, vy } with OPTIONAL z / vz, so the SAME
// code drives a 2D side-scroller or a fully 3D scene -- the z axis is only
// touched when an agent actually has it. PURE math: no three.js, no WebGL, no
// canvas, no DOM, no external deps. You own rendering (draw each agent yourself
// from its x/y[/z] and velocity heading). DELTA-TIME based, so motion is the
// same at 30 or 144 fps. Extracted + generalized from the reef-explorer
// updateFish boid loop.
//
// Neighbor queries are O(n^2) per flock -- fine for typical schools (up to a
// few hundred). For large counts pass opts.spatialGrid (a hook described under
// CONTRACTS) to supply only nearby agents and skip the full scan.
//
// Exports:
//   updateFlock(agents, dt, opts)   functional one-shot update of an array
//   BoidFlock                       stateful wrapper that remembers opts + a
//                                   per-agent phase, and tracks startle timers
//   DEFAULT_BOID_OPTS               the tunable defaults (read-only reference)
//
// Usage (2D school that scatters from the player):
//   import { updateFlock } from './systems/boid-flock.js';
//   const fish = [];
//   for (let i = 0; i < 24; i++) fish.push({ x: rand(), y: rand(), vx: 0, vy: 0 });
//   // each frame:
//   updateFlock(fish, dt, {
//     bounds: { minX: 0, maxX: 800, minY: 0, maxY: 600 },
//     avoidPoints: [{ x: player.x, y: player.y, radius: 160 }],
//     obstacles: rocks, // [{ x, y, radius }]
//   });
//   for (const f of fish) drawFish(f.x, f.y, Math.atan2(f.vy, f.vx), f.startled > 0);
//
// Usage (3D flock -- agents simply carry z / vz):
//   const birds = [];
//   for (let i = 0; i < 60; i++) birds.push({ x:0, y:0, z:0, vx:0, vy:0, vz:0 });
//   const flock = new BoidFlock({ bounds: { minX:-50, maxX:50, minY:0, maxY:40, minZ:-50, maxZ:50 } });
//   // each frame:
//   flock.update(birds, dt, { avoidPoints: [{ x:px, y:py, z:pz, radius: 12 }] });
//
// Contracts:
//   - updateFlock(agents, dt, opts): agents is an array of { x, y, vx, vy }
//     with optional { z, vz }. dt is seconds. Mutates each agent's position
//     and velocity in place; returns the same array. 3D is auto-detected per
//     agent (z !== undefined). Safe with 0 or 1 agent.
//   - opts (all optional, merged over DEFAULT_BOID_OPTS):
//       cohesion, alignment, separation : k-weights (per-second).
//       perception      : neighbor radius for cohesion + alignment.
//       separationRadius: distance under which separation repulsion applies.
//       avoidPoints []  : [{ x, y, z?, radius }] reactive flee targets. Any
//                         agent inside radius gets pushed away AND startled.
//       avoidStrength   : push weight for avoidPoints.
//       obstacles []    : [{ x, y, z?, radius }] circles/spheres to steer
//                         around (agents do not get startled by these).
//       obstacleStrength, obstaclePadding : obstacle push weight + extra margin.
//       bounds          : { minX, maxX, minY, maxY, minZ?, maxZ? } soft box.
//       boundsStrength, boundsMargin : how hard / how early bounds steer back.
//       wander, wanderFreq : idle jitter amplitude + frequency.
//       minSpeed, maxSpeed : speed clamp. Below min -> a kick toward minSpeed.
//       startleDuration : seconds an agent stays startled after an avoidPoint hit.
//       startleSpeedMult: maxSpeed multiplier while startled (the fear boost).
//       maxForce        : caps the total steering magnitude (smooths turns).
//       time            : optional running clock (seconds) for wander phase; if
//                         omitted, an internal clock advanced by dt is used.
//       spatialGrid     : optional { neighbors(agent) -> iterable<agent> } hook.
//                         When present, cohesion/alignment/separation iterate
//                         only the returned agents instead of the full array
//                         (you keep the grid up to date). Returned agents must
//                         be members of `agents`.
//   - Each agent may gain a `startled` field (seconds remaining > 0) and a
//     `_phase` field (stable wander phase). Read `agent.startled > 0` to render
//     a fear pose / boosted animation. Neither is required as input.
//   - Renderer-agnostic: this module never reads or writes the DOM/canvas/GPU,
//     so it owns nothing to dispose -- there is intentionally no dispose().

export const DEFAULT_BOID_OPTS = Object.freeze({
  cohesion: 0.9,
  alignment: 1.2,
  separation: 6.0,
  perception: 60,
  separationRadius: 22,
  avoidStrength: 70,
  obstacleStrength: 40,
  obstaclePadding: 14,
  boundsStrength: 50,
  boundsMargin: 36,
  wander: 8,
  wanderFreq: 1.0,
  minSpeed: 18,
  maxSpeed: 110,
  startleDuration: 0.9,
  startleSpeedMult: 2.1,
  maxForce: 600
});

function num(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

// Detect 3D once per call from the first agent that carries z.
function flockIs3D(agents) {
  for (let i = 0; i < agents.length; i++) {
    if (agents[i] && typeof agents[i].z === 'number') return true;
  }
  return false;
}

// Resolve effective options by layering caller opts over the defaults.
function resolveOpts(opts) {
  const o = {};
  for (const k in DEFAULT_BOID_OPTS) o[k] = DEFAULT_BOID_OPTS[k];
  if (opts) {
    for (const k in DEFAULT_BOID_OPTS) {
      if (k in opts) o[k] = num(opts[k], o[k]);
    }
    o.bounds = opts.bounds || null;
    o.avoidPoints = Array.isArray(opts.avoidPoints) ? opts.avoidPoints : null;
    o.obstacles = Array.isArray(opts.obstacles) ? opts.obstacles : null;
    o.spatialGrid = opts.spatialGrid && typeof opts.spatialGrid.neighbors === 'function'
      ? opts.spatialGrid : null;
    o.time = typeof opts.time === 'number' && Number.isFinite(opts.time) ? opts.time : null;
  } else {
    o.bounds = null; o.avoidPoints = null; o.obstacles = null;
    o.spatialGrid = null; o.time = null;
  }
  return o;
}

// Stable per-agent wander phase so each agent jitters independently.
function phaseOf(agent, index) {
  if (typeof agent._phase !== 'number') {
    agent._phase = (index * 2.39996323 + 0.5) % (Math.PI * 2); // golden-angle spread
  }
  return agent._phase;
}

// Internal clock used for wander when the caller does not supply opts.time.
let _internalClock = 0;

/**
 * Advance a flock by one delta-time step. Pure math; mutates agents in place.
 * @param {Array<{x:number,y:number,vx:number,vy:number,z?:number,vz?:number}>} agents
 * @param {number} dt seconds since last update
 * @param {object} [opts] see DEFAULT_BOID_OPTS + the CONTRACTS block above
 * @returns {Array} the same `agents` array
 */
export function updateFlock(agents, dt, opts) {
  if (!Array.isArray(agents) || agents.length === 0) return agents;
  const d = num(dt, 0);
  if (d <= 0) return agents;
  // Clamp dt so a tab-resume / long stall cannot launch agents to infinity.
  const step = d > 0.1 ? 0.1 : d;

  const o = resolveOpts(opts);
  const is3D = flockIs3D(agents);
  const n = agents.length;

  let t;
  if (o.time != null) {
    t = o.time;
  } else {
    _internalClock += step;
    t = _internalClock;
  }

  const perception2 = o.perception * o.perception;
  const sepR2 = o.separationRadius * o.separationRadius;

  for (let i = 0; i < n; i++) {
    const a = agents[i];
    if (!a) continue;
    const az = is3D ? num(a.z, 0) : 0;
    const avz = is3D ? num(a.vz, 0) : 0;

    // --- Neighbor accumulation: cohesion centroid + alignment average + separation push.
    let cenX = 0, cenY = 0, cenZ = 0;
    let alX = 0, alY = 0, alZ = 0;
    let sepX = 0, sepY = 0, sepZ = 0;
    let neighborCount = 0;

    const source = o.spatialGrid ? o.spatialGrid.neighbors(a) : agents;
    const useGrid = !!o.spatialGrid;
    const len = useGrid ? null : n;
    let idx = 0;
    // Iterate either the grid result or the full array, uniformly.
    const iterate = useGrid ? source[Symbol.iterator]() : null;
    while (true) {
      let b;
      if (useGrid) {
        const next = iterate.next();
        if (next.done) break;
        b = next.value;
      } else {
        if (idx >= len) break;
        b = agents[idx++];
      }
      if (!b || b === a) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dz = is3D ? az - num(b.z, 0) : 0;
      const dist2 = dx * dx + dy * dy + dz * dz;
      if (dist2 > 0 && dist2 < perception2) {
        cenX += b.x; cenY += b.y; if (is3D) cenZ += num(b.z, 0);
        alX += b.vx; alY += b.vy; if (is3D) alZ += num(b.vz, 0);
        neighborCount++;
        // Separation: 1/d falloff so closest neighbors push hardest.
        if (dist2 < sepR2) {
          const dist = Math.sqrt(dist2);
          const inv = 1 / dist;
          sepX += (dx * inv) * inv;
          sepY += (dy * inv) * inv;
          if (is3D) sepZ += (dz * inv) * inv;
        }
      }
    }

    // Steering accumulators (acceleration this step, applied below * step).
    let fx = 0, fy = 0, fz = 0;

    if (neighborCount > 0) {
      // COHESION: toward centroid.
      cenX /= neighborCount; cenY /= neighborCount; cenZ /= neighborCount;
      fx += (cenX - a.x) * o.cohesion;
      fy += (cenY - a.y) * o.cohesion;
      if (is3D) fz += (cenZ - az) * o.cohesion;
      // ALIGNMENT: match average neighbor velocity.
      alX /= neighborCount; alY /= neighborCount; alZ /= neighborCount;
      fx += (alX - a.vx) * o.alignment;
      fy += (alY - a.vy) * o.alignment;
      if (is3D) fz += (alZ - avz) * o.alignment;
      // SEPARATION: away from crowding.
      fx += sepX * o.separation;
      fy += sepY * o.separation;
      if (is3D) fz += sepZ * o.separation;
    }

    // --- Reactive AVOIDANCE of caller-supplied flee points (player, predator, ...).
    let startledThisFrame = false;
    if (o.avoidPoints) {
      for (let k = 0; k < o.avoidPoints.length; k++) {
        const p = o.avoidPoints[k];
        if (!p) continue;
        const r = num(p.radius, 0);
        if (r <= 0) continue;
        const dx = a.x - num(p.x, 0);
        const dy = a.y - num(p.y, 0);
        const dz = is3D ? az - num(p.z, 0) : 0;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < r && dist > 0) {
          const falloff = (r - dist) / r;       // 1 at center -> 0 at edge
          const push = falloff * o.avoidStrength;
          const inv = 1 / dist;
          fx += dx * inv * push;
          fy += dy * inv * push;
          if (is3D) fz += dz * inv * push;
          startledThisFrame = true;
        }
      }
    }
    // Startle timer: set on a fresh hit, otherwise decay.
    if (startledThisFrame) {
      a.startled = o.startleDuration;
    } else if (typeof a.startled === 'number' && a.startled > 0) {
      a.startled -= step;
      if (a.startled < 0) a.startled = 0;
    }

    // --- OBSTACLE avoidance (circles / spheres) -- steer around, no startle.
    if (o.obstacles) {
      for (let k = 0; k < o.obstacles.length; k++) {
        const ob = o.obstacles[k];
        if (!ob) continue;
        const lim = num(ob.radius, 0) + o.obstaclePadding;
        if (lim <= 0) continue;
        const dx = a.x - num(ob.x, 0);
        const dy = a.y - num(ob.y, 0);
        const dz = is3D ? az - num(ob.z, 0) : 0;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < lim && dist > 0) {
          const push = (lim - dist) / lim * o.obstacleStrength;
          const inv = 1 / dist;
          fx += dx * inv * push;
          fy += dy * inv * push;
          if (is3D) fz += dz * inv * push;
        }
      }
    }

    // --- Soft BOUNDS steering: ramp a return force inside boundsMargin.
    if (o.bounds) {
      const bn = o.bounds;
      const m = o.boundsMargin;
      const bs = o.boundsStrength;
      if (typeof bn.minX === 'number' && a.x < bn.minX + m) fx += (1 - (a.x - bn.minX) / m) * bs;
      if (typeof bn.maxX === 'number' && a.x > bn.maxX - m) fx -= (1 - (bn.maxX - a.x) / m) * bs;
      if (typeof bn.minY === 'number' && a.y < bn.minY + m) fy += (1 - (a.y - bn.minY) / m) * bs;
      if (typeof bn.maxY === 'number' && a.y > bn.maxY - m) fy -= (1 - (bn.maxY - a.y) / m) * bs;
      if (is3D) {
        if (typeof bn.minZ === 'number' && az < bn.minZ + m) fz += (1 - (az - bn.minZ) / m) * bs;
        if (typeof bn.maxZ === 'number' && az > bn.maxZ - m) fz -= (1 - (bn.maxZ - az) / m) * bs;
      }
    }

    // --- Idle WANDER: independent per-agent cos/sin jitter so a still flock breathes.
    const ph = phaseOf(a, i);
    const wf = o.wanderFreq;
    fx += Math.cos(t * wf + ph) * o.wander;
    fy += Math.sin(t * wf * 1.3 + ph) * o.wander;
    if (is3D) fz += Math.cos(t * wf * 0.7 + ph * 1.7) * o.wander;

    // --- Cap total steering force so turns stay smooth, then integrate (dt).
    if (o.maxForce > 0) {
      const fmag2 = fx * fx + fy * fy + fz * fz;
      const fmax2 = o.maxForce * o.maxForce;
      if (fmag2 > fmax2) {
        const scale = o.maxForce / Math.sqrt(fmag2);
        fx *= scale; fy *= scale; fz *= scale;
      }
    }

    let vx = a.vx + fx * step;
    let vy = a.vy + fy * step;
    let vz = avz + (is3D ? fz * step : 0);

    // --- Speed CLAMP: max (raised while startled) + a min-speed kick.
    const startled = typeof a.startled === 'number' && a.startled > 0;
    const maxS = startled ? o.maxSpeed * o.startleSpeedMult : o.maxSpeed;
    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (speed > maxS && speed > 0) {
      const s = maxS / speed;
      vx *= s; vy *= s; vz *= s;
    } else if (speed < o.minSpeed) {
      if (speed > 0.0001) {
        const s = o.minSpeed / speed;
        vx *= s; vy *= s; vz *= s;
      } else {
        // Dead-stopped agent: nudge it along its wander direction.
        vx = Math.cos(ph) * o.minSpeed;
        vy = Math.sin(ph) * o.minSpeed;
        if (is3D) vz = Math.cos(ph * 1.7) * o.minSpeed * 0.5;
      }
    }

    a.vx = vx; a.vy = vy;
    a.x += vx * step;
    a.y += vy * step;
    if (is3D) {
      a.vz = vz;
      a.z = az + vz * step;
    }
  }

  return agents;
}

/**
 * Stateful flock wrapper. Holds the base opts and seeds a stable wander phase
 * per agent, so per-frame you only pass the dynamic bits (avoidPoints, etc.).
 */
export class BoidFlock {
  // baseOpts: any of DEFAULT_BOID_OPTS plus bounds/obstacles you rarely change.
  constructor(baseOpts = {}) {
    this.opts = Object.assign({}, baseOpts);
    this._clock = 0;
  }

  // Update stored options (merged over existing). Returns this.
  configure(partial = {}) {
    Object.assign(this.opts, partial);
    return this;
  }

  // Advance the flock. frameOpts is merged over the stored base opts, so you
  // can pass the moving avoidPoints/obstacles each frame.
  update(agents, dt, frameOpts) {
    this._clock += (typeof dt === 'number' && dt > 0 ? Math.min(dt, 0.1) : 0);
    const merged = frameOpts ? Object.assign({}, this.opts, frameOpts) : this.opts;
    // Use our own monotonic clock for wander unless the caller overrides time.
    if (typeof merged.time !== 'number') merged.time = this._clock;
    return updateFlock(agents, dt, merged);
  }
}

// END mChatAI Web Component: systems.boid-flock
