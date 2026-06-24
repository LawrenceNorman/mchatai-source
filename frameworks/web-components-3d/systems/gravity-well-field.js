// BEGIN mChatAI Web Component: systems.gravity-well-field-3d
//
// A 3D N-BODY GRAVITY-WELL FIELD with a TRAJECTORY-ARC PREDICTOR. Place any
// number of point-mass "wells" in space; a small body (marble / ship / puck /
// comet) flies through the summed inverse-square field. The headline feature is
// that the dotted PREVIEW ARC and the actual FLIGHT are produced by the SAME
// integrator stepping the SAME field -- so the predicted path is exactly what
// the body will fly (no drift between "where the dots said" and "where it went").
// One primitive covers a LOT of space-physics furniture:
//   - a gravity mini-golf / slingshot putt curving around planets into a goal
//   - an orbital "thread the needle" puzzle (place wells, aim, watch the arc)
//   - a comet / probe trajectory planner with a live predicted path
//   - a repulsor field (negative mass) that pushes the body away
//   - moving wells (a drifting planet) the caller animates between steps
//
// A WELL is a PLAIN object { pos:[x,y,z], r, mass }:
//   pos   world position of the well (array of 3 numbers; you mutate pos to
//         move a well between steps -- the field re-reads it every step).
//   r     physical radius (for softening + the optional collision bounce).
//   mass  attractor mass. POSITIVE pulls the body in, NEGATIVE pushes it away
//         (a repulsor). Strength scales with G * mass / dist^2 (softened).
//
// RENDERER-AGNOSTIC PURE MATH: no three.js, no canvas, no DOM, no WebGL, no
// external deps. The CALLER owns rendering -- read body.pos to draw the body,
// and walk the returned preview points to draw a dotted polyline (in three.js:
// a Line/Points BufferGeometry; in 2D canvas: project + moveTo/lineTo). three.js
// is OPTIONAL and only ever for *drawing* the preview line, never for the math.
// Vectors are plain [x, y, z] number arrays so this is framework-free.
//
// FIXED-TIMESTEP SEMI-IMPLICIT EULER: stepField() integrates one fixed sub-step
// (accelerate -> damp -> move) and reports terminal events (sink / out-of-bounds
// / collision-with-well / wall-bounce). Run several sub-steps per rendered frame
// for stability; computePreview() replays the EXACT same stepField from the
// current launch state to draw the arc. Same code path => the arc never lies.
//
// Exports:
//   makeField(opts)                 build a field { wells, opts, ... } (the world)
//   gravAccel(field, pos, out)      summed N-body (+ optional goal-pull) accel at pos
//   stepField(field, body, dt)      integrate one sub-step; mutates body; returns
//                                   an EVENT code (NONE/SINK/OUT/HIT_WELL/BOUNCE)
//   computePreview(field, start, vel, opts)  replay stepField -> sampled arc points
//   launchVelocity(dir, power, opts) map an aim dir + 0..1 power to a launch vel
//   EVENT                           { NONE, SINK, OUT, HIT_WELL, BOUNCE } codes
//   GravityWellField                stateful wrapper: holds field + a live body,
//                                   exposes aim()/preview()/launch()/update()
//   DEFAULT_FIELD_OPTS              tunable defaults (read-only reference)
//
// Usage (gravity slingshot with a matching predicted arc -- three.js for DRAW only):
//   import { makeField, computePreview, stepField, launchVelocity, EVENT }
//     from './systems/gravity-well-field.js';
//   const field = makeField({
//     wells: [{ pos:[0,0,0], r:3.2, mass:11 }, { pos:[7,7,0], r:2.6, mass:-9 }],
//     goal: [15,-1,-2], goalCaptureR: 1.75, bounds: 50,
//   });
//   const body = { pos:[-15,1,2], vel:[0,0,0] };
//   // while aiming, draw the dotted arc (renderer-agnostic point list):
//   const vel = launchVelocity(aimDir, power, { min:5, max:30 });
//   const arc = computePreview(field, body.pos, vel, { steps:220, sample:3, dt:1/70 });
//   // ...draw arc.points (arc.count of them) however you like, e.g. THREE.Points...
//   // on launch:
//   body.vel = vel;
//   // each rendered frame, run a few fixed sub-steps:
//   for (let s = 0; s < subSteps; s++) {
//     const ev = stepField(field, body, 1/120);
//     if (ev === EVENT.SINK)  { onSunk(); break; }
//     if (ev === EVENT.OUT)   { onLost(); break; }
//     if (ev === EVENT.HIT_WELL) { onCrash(); break; }   // or ignore to let it bounce
//   }
//   // ...draw your mesh at body.pos...
//
// Usage (a repulsor + a moving well animated by the caller):
//   field.wells[1].mass = -11;                 // turn well 1 into a repulsor
//   // each frame BEFORE stepping, move a well:
//   field.wells[0].pos[1] = baseY + Math.sin(t * 0.7) * 7;   // drifts up & down
//
// Usage (stateful, with a live body and one-call frame update):
//   const sim = new GravityWellField({ wells, goal, bounds });
//   sim.place([-15, 1, 2]);                     // set the body at the tee
//   sim.aim(dir, power, { min:5, max:30 });     // arms a launch + builds the arc
//   const arc = sim.previewPoints;              // draw these dots
//   sim.launch();                               // commit the armed velocity
//   const ev = sim.update(dt);                  // runs sub-steps; returns terminal EVENT or NONE
//
// Contracts:
//   - makeField(opts) returns { wells, goal, opts } where wells is the live array
//     you read/mutate to move attractors. opts (all optional, merged over
//     DEFAULT_FIELD_OPTS):
//       wells          : [{ pos:[x,y,z], r, mass }] (mass<0 = repulsor). Default [].
//       G              : gravitational constant / overall field strength. Default 46.
//       damping        : per-sub-step velocity retention (drag). 1 = none. Default 0.9986.
//       bodyRadius     : the flying body's radius (for collision). Default 0.45.
//       restitution    : bounce energy kept when colliding with a well (0..1). Default 0.62.
//       bounds         : OUT-of-bounds sphere radius around origin. Default 50. (0 = no bound.)
//       softening      : extra added to each well's (r) before squaring, so the
//                        field never blows up at the surface. Default 0.6.
//       goal           : OPTIONAL [x,y,z] target. Adds a gentle pull near it and
//                        enables the SINK event. Default null (no goal).
//       goalPullR      : radius within which the goal pulls. Default 7.
//       goalMass       : strength of the goal's assist pull. Default 5.5.
//       goalCaptureR   : radius within which the body is captured (SINK). Default 1.75.
//   - gravAccel(field, pos, out): writes the summed acceleration at world point
//     `pos` into `out` ([x,y,z], created if omitted) and returns it. Inverse-square
//     per well with surface softening; negative mass repels; adds the goal assist
//     if a goal is set. Reads each well's CURRENT pos, so moving a well just works.
//   - stepField(field, body, dt): one fixed sub-step on body = { pos:[x,y,z],
//     vel:[x,y,z] }. Semi-implicit Euler: vel += a*dt; vel *= damping; pos += vel*dt.
//     Then resolves, in order: well collision (push-out + reflect, returns BOUNCE),
//     goal capture (SINK), out-of-bounds (OUT). Mutates body.pos/body.vel in place.
//     Returns an EVENT code; NONE means keep going. dt is seconds (a sub-step, not a
//     whole frame).
//   - computePreview(field, startPos, startVel, opts): replays stepField from a
//     COPY of (startPos, startVel) -- it never touches your live body -- and returns
//     { points:Float32Array, count, event } where points holds count*3 sampled
//     coordinates of the predicted arc and event is the terminal EVENT (or NONE if
//     it ran to maxSteps). opts: { dt:1/70, steps:220, sample:3, maxPoints:90 }.
//     Because it calls the SAME stepField, the arc is exactly the future flight.
//   - launchVelocity(dir, power, opts): returns a velocity [x,y,z] = normalize(dir)
//     * (min + power*(max-min)). power is clamped 0..1. opts { min:5, max:30 }.
//   - EVENT is a frozen enum: NONE 0, SINK 1, OUT 2, HIT_WELL 3, BOUNCE 4. (HIT_WELL
//     is reserved for callers that want a crash instead of a bounce; stepField
//     itself bounces and returns BOUNCE -- map BOUNCE->crash yourself if desired.)
//   - Renderer-agnostic: this module never touches the DOM/canvas/GPU and owns
//     nothing to dispose -- there is intentionally no dispose(). Vectors are plain
//     [x,y,z] arrays; convert to THREE.Vector3 at the draw boundary if you wish.

export const DEFAULT_FIELD_OPTS = Object.freeze({
  G: 46,
  damping: 0.9986,
  bodyRadius: 0.45,
  restitution: 0.62,
  bounds: 50,
  softening: 0.6,
  goalPullR: 7,
  goalMass: 5.5,
  goalCaptureR: 1.75,
});

/** Terminal-event codes returned by stepField / computePreview. */
export const EVENT = Object.freeze({
  NONE: 0,      // keep integrating
  SINK: 1,      // captured by the goal
  OUT: 2,       // left the bounds sphere
  HIT_WELL: 3,  // reserved: collided with a well and caller wants a crash
  BOUNCE: 4,    // collided with a well; push-out + reflection applied
});

function num(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

// Resolve effective options by layering caller opts over the defaults.
function resolveOpts(opts) {
  const o = {};
  for (const k in DEFAULT_FIELD_OPTS) o[k] = DEFAULT_FIELD_OPTS[k];
  if (opts) {
    for (const k in DEFAULT_FIELD_OPTS) {
      if (k in opts) o[k] = num(opts[k], o[k]);
    }
  }
  return o;
}

// Normalize a caller well into the internal shape with a live pos array.
function normalizeWell(w) {
  const p = (w && w.pos) || [0, 0, 0];
  return {
    pos: [num(p[0], 0), num(p[1], 0), num(p[2], 0)],
    r: num(w && w.r, 1),
    mass: num(w && w.mass, 1),
  };
}

/**
 * Build a gravity-well field (the "world").
 * @param {object} opts see the makeField contract above
 * @returns {{wells:Array, goal:Array|null, opts:object}}
 */
export function makeField(opts = {}) {
  const o = resolveOpts(opts);
  const wells = Array.isArray(opts.wells) ? opts.wells.map(normalizeWell) : [];
  let goal = null;
  if (Array.isArray(opts.goal) && opts.goal.length >= 3) {
    goal = [num(opts.goal[0], 0), num(opts.goal[1], 0), num(opts.goal[2], 0)];
  }
  return { wells, goal, opts: o };
}

// Scratch vectors so the hot path allocates nothing per call.
const _d = [0, 0, 0];
const _n = [0, 0, 0];

/**
 * Summed N-body acceleration at world point `pos` (+ optional goal assist).
 * Inverse-square per well with surface softening; negative mass repels.
 * @param {object} field from makeField
 * @param {number[]} pos world point [x,y,z]
 * @param {number[]} [out] destination [x,y,z] (created if omitted)
 * @returns {number[]} out
 */
export function gravAccel(field, pos, out) {
  const o = out || [0, 0, 0];
  o[0] = 0; o[1] = 0; o[2] = 0;
  const opt = field.opts;
  const G = opt.G;
  const wells = field.wells;
  for (let i = 0; i < wells.length; i++) {
    const a = wells[i];
    _d[0] = a.pos[0] - pos[0];
    _d[1] = a.pos[1] - pos[1];
    _d[2] = a.pos[2] - pos[2];
    const r2 = _d[0] * _d[0] + _d[1] * _d[1] + _d[2] * _d[2];
    let soft = a.r + opt.softening; soft = soft * soft;
    const denom = r2 < soft ? soft : r2;
    const len = Math.sqrt(r2) || 1e-6;
    const f = (G * a.mass / denom) / len; // (G*m/denom) * (d/len)
    o[0] += _d[0] * f;
    o[1] += _d[1] * f;
    o[2] += _d[2] * f;
  }
  // goal assist: a gentle pull when near the target
  const goal = field.goal;
  if (goal) {
    _d[0] = goal[0] - pos[0];
    _d[1] = goal[1] - pos[1];
    _d[2] = goal[2] - pos[2];
    const rg2 = _d[0] * _d[0] + _d[1] * _d[1] + _d[2] * _d[2];
    const pr = opt.goalPullR;
    if (rg2 < pr * pr) {
      const dd = rg2 < 1 ? 1 : rg2;
      const len = Math.sqrt(rg2) || 1e-6;
      const f = (G * opt.goalMass / dd) / len;
      o[0] += _d[0] * f;
      o[1] += _d[1] * f;
      o[2] += _d[2] * f;
    }
  }
  return o;
}

const _acc = [0, 0, 0];

/**
 * Advance a body by one fixed sub-step through the field. Semi-implicit Euler,
 * then resolve well collision / goal capture / out-of-bounds. Mutates body.
 * @param {object} field from makeField
 * @param {{pos:number[], vel:number[]}} body the flying body (pos & vel [x,y,z])
 * @param {number} dt seconds for THIS sub-step
 * @returns {number} an EVENT code (NONE means keep going)
 */
export function stepField(field, body, dt) {
  const d = num(dt, 0);
  if (d <= 0) return EVENT.NONE;
  const opt = field.opts;
  const pos = body.pos, vel = body.vel;

  gravAccel(field, pos, _acc);
  vel[0] += _acc[0] * d; vel[1] += _acc[1] * d; vel[2] += _acc[2] * d;
  vel[0] *= opt.damping; vel[1] *= opt.damping; vel[2] *= opt.damping;
  pos[0] += vel[0] * d; pos[1] += vel[1] * d; pos[2] += vel[2] * d;

  // well collision: push the body out to the surface and reflect inward velocity
  const wells = field.wells;
  for (let i = 0; i < wells.length; i++) {
    const a = wells[i];
    _n[0] = pos[0] - a.pos[0];
    _n[1] = pos[1] - a.pos[1];
    _n[2] = pos[2] - a.pos[2];
    const minD = a.r + opt.bodyRadius;
    const dist = Math.sqrt(_n[0] * _n[0] + _n[1] * _n[1] + _n[2] * _n[2]);
    if (dist < minD && dist > 1e-4) {
      const inv = 1 / dist;
      _n[0] *= inv; _n[1] *= inv; _n[2] *= inv;
      pos[0] = a.pos[0] + _n[0] * (minD + 0.001);
      pos[1] = a.pos[1] + _n[1] * (minD + 0.001);
      pos[2] = a.pos[2] + _n[2] * (minD + 0.001);
      const vn = vel[0] * _n[0] + vel[1] * _n[1] + vel[2] * _n[2];
      if (vn < 0) {
        const k = -(1 + opt.restitution) * vn;
        vel[0] += _n[0] * k; vel[1] += _n[1] * k; vel[2] += _n[2] * k;
      }
      return EVENT.BOUNCE;
    }
  }

  // goal capture (SINK)
  const goal = field.goal;
  if (goal) {
    const gx = pos[0] - goal[0], gy = pos[1] - goal[1], gz = pos[2] - goal[2];
    const cr = opt.goalCaptureR;
    if (gx * gx + gy * gy + gz * gz < cr * cr) return EVENT.SINK;
  }

  // out of bounds (OUT)
  if (opt.bounds > 0) {
    if (pos[0] * pos[0] + pos[1] * pos[1] + pos[2] * pos[2] > opt.bounds * opt.bounds) {
      return EVENT.OUT;
    }
  }

  return EVENT.NONE;
}

/**
 * Predict the flight arc by REPLAYING stepField from a copy of the launch state.
 * Never mutates your live body. Returns sampled points + the terminal event, so
 * the dotted arc you draw is exactly the path the body will fly.
 * @param {object} field from makeField
 * @param {number[]} startPos launch position [x,y,z]
 * @param {number[]} startVel launch velocity [x,y,z]
 * @param {object} [opts] { dt:1/70, steps:220, sample:3, maxPoints:90 }
 * @returns {{points:Float32Array, count:number, event:number}}
 */
export function computePreview(field, startPos, startVel, opts = {}) {
  const dt = num(opts.dt, 1 / 70);
  const steps = Math.max(1, Math.floor(num(opts.steps, 220)));
  const sample = Math.max(1, Math.floor(num(opts.sample, 3)));
  const maxPoints = Math.max(2, Math.floor(num(opts.maxPoints, 90)));

  const body = { pos: [startPos[0], startPos[1], startPos[2]],
                 vel: [startVel[0], startVel[1], startVel[2]] };
  const points = new Float32Array(maxPoints * 3);
  let idx = 0;
  let event = EVENT.NONE;

  for (let s = 0; s < steps && idx < maxPoints; s++) {
    const ev = stepField(field, body, dt);
    if (s % sample === 0) {
      points[idx * 3] = body.pos[0];
      points[idx * 3 + 1] = body.pos[1];
      points[idx * 3 + 2] = body.pos[2];
      idx++;
    }
    if (ev === EVENT.SINK || ev === EVENT.OUT || ev === EVENT.HIT_WELL) {
      // include the terminal point so the arc reaches the goal / edge
      if (idx < maxPoints) {
        points[idx * 3] = body.pos[0];
        points[idx * 3 + 1] = body.pos[1];
        points[idx * 3 + 2] = body.pos[2];
        idx++;
      }
      event = ev;
      break;
    }
  }
  return { points, count: idx, event };
}

/**
 * Map an aim direction + a 0..1 power to a launch velocity [x,y,z].
 * @param {number[]} dir aim direction [x,y,z] (need not be unit length)
 * @param {number} power 0..1 (clamped)
 * @param {object} [opts] { min:5, max:30 }
 * @returns {number[]} velocity [x,y,z]
 */
export function launchVelocity(dir, power, opts = {}) {
  const min = num(opts.min, 5);
  const max = num(opts.max, 30);
  let p = num(power, 0);
  if (p < 0) p = 0; else if (p > 1) p = 1;
  const speed = min + p * (max - min);
  let dx = num(dir && dir[0], 0), dy = num(dir && dir[1], 0), dz = num(dir && dir[2], 0);
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
  const k = speed / len;
  return [dx * k, dy * k, dz * k];
}

/**
 * Stateful wrapper. Holds the field plus a live body and an "armed" launch, so
 * per-frame you just call update(dt). Mirrors the functional core; aim() builds
 * the preview arc with the SAME integrator update() will fly.
 */
export class GravityWellField {
  // opts: the makeField opts (wells, goal, G, bounds, ...).
  constructor(opts = {}) {
    this.field = makeField(opts);
    this.body = { pos: [0, 0, 0], vel: [0, 0, 0] };
    this.armedVel = null;       // [x,y,z] velocity set by aim(), committed by launch()
    this.previewPoints = new Float32Array(0);
    this.previewCount = 0;
    this.previewEvent = EVENT.NONE;
    this.moving = false;        // true between launch() and a terminal event
  }

  get wells() { return this.field.wells; }
  get goal() { return this.field.goal; }

  // Place the body (resets velocity + armed launch + preview).
  place(pos) {
    this.body.pos[0] = num(pos && pos[0], 0);
    this.body.pos[1] = num(pos && pos[1], 0);
    this.body.pos[2] = num(pos && pos[2], 0);
    this.body.vel[0] = 0; this.body.vel[1] = 0; this.body.vel[2] = 0;
    this.armedVel = null;
    this.previewCount = 0;
    this.moving = false;
    return this;
  }

  // Move/replace a well by index (or push a new one). Returns the well.
  setWell(i, well) {
    const w = normalizeWell(well);
    if (i >= 0 && i < this.field.wells.length) this.field.wells[i] = w;
    else this.field.wells.push(w);
    return w;
  }

  // Arm a launch from the current body position and (re)build the preview arc.
  // dir: aim direction [x,y,z]; power: 0..1. launchOpts -> launchVelocity opts;
  // previewOpts -> computePreview opts.
  aim(dir, power, launchOpts = {}, previewOpts = {}) {
    if (this.moving) return this;
    this.armedVel = launchVelocity(dir, power, launchOpts);
    const pv = computePreview(this.field, this.body.pos, this.armedVel, previewOpts);
    this.previewPoints = pv.points;
    this.previewCount = pv.count;
    this.previewEvent = pv.event;
    return this;
  }

  // Commit the armed velocity: the body starts flying. No-op if nothing armed.
  launch() {
    if (!this.armedVel) return this;
    this.body.vel[0] = this.armedVel[0];
    this.body.vel[1] = this.armedVel[1];
    this.body.vel[2] = this.armedVel[2];
    this.armedVel = null;
    this.previewCount = 0;
    this.moving = true;
    return this;
  }

  // Advance the live body by `dt` seconds using `subSteps` fixed sub-steps. Runs
  // until a terminal EVENT or the sub-steps are exhausted. Returns the EVENT
  // (NONE if still flying). Clears `moving` on a terminal event.
  update(dt, subSteps = 8, subDt = 1 / 120) {
    if (!this.moving) return EVENT.NONE;
    let d = num(dt, 0);
    if (d <= 0) return EVENT.NONE;
    if (d > 0.05) d = 0.05;                 // clamp tab-resume spikes
    const n = Math.min(Math.max(1, subSteps),
                       Math.max(1, Math.round(d / subDt)));
    const sdt = d / n;
    for (let s = 0; s < n; s++) {
      const ev = stepField(this.field, this.body, sdt);
      if (ev === EVENT.SINK || ev === EVENT.OUT) { this.moving = false; return ev; }
      // BOUNCE keeps the body moving; HIT_WELL is never returned by stepField.
    }
    return EVENT.NONE;
  }

  // Current speed of the body (units/s) -- e.g. to detect "settled".
  speed() {
    const v = this.body.vel;
    return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  }
}

// END mChatAI Web Component: systems.gravity-well-field-3d
