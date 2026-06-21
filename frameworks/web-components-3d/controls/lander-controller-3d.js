// BEGIN mChatAI Web Component: controls.lander-controller-3d
//
// Thrust-vector descent flight model + multi-criteria soft-landing verdict for
// lunar-lander / VTOL / capsule-recovery games. PURE scalar physics -- NO
// three.js, NO WebGL, NO DOM, NO external deps. Operates on plain numbers and a
// plain state object so it drops into a three.js game, a software-rendered Canvas
// 2D game, or a Node test harness unchanged, and is trivially offline-safe.
// DELTA-TIME based throughout; the HOST maps the output state onto any mesh
// transform + HUD. NO pointer lock (control is plain thrust/tilt key flags).
//
// THIS IS A DISTINCT GENRE with no prior Lego coverage: kinematic-body-3d is the
// ball/kart swept-AABB collision core (no thrust vector, no fuel, no landing
// quality gate). This module is the thrust-vs-gravity flight model -- a lander
// thrusts ALONG ITS OWN ORIENTATION (a tilted lander pushes sideways), burns a
// finite fuel budget, and a touchdown only counts if it is over a pad, slow,
// not drifting, and upright. It was re-derived from scratch by lunar-descent-3d
// (3D pitch/roll, landerUp, crashReason, padAt, SAFE_VY/SAFE_TILT) and
// wizard.recovered.5304f773 (the 2D single-angle proposal). Both are deduped and
// generalized into THIS one module.
//
// THE THREE PROVEN IDEAS, generalized:
//   1. landerUp(pitch, roll) -- the orientation-derived UP vector. Thrust is
//      applied along this, so a tilted lander accelerates sideways. Works in 2D
//      (single roll/angle -> {ux,uy}) and 3D (pitch+roll -> {ux,uy,uz}).
//   2. updateLander(state, controls, dt, cfg, terrainH, padAt) -- one frame:
//      apply constant gravity, add thrust along landerUp while thrust held AND
//      fuel>0 (burning fuel, cutting thrust at empty), ease pitch/roll toward the
//      tilt input with an auto-level fall-off when input is released, integrate
//      velocity into position, soft-clamp/bounce off horizontal walls, and on
//      ground contact (terrainH callback) run the SAFE-LANDING gate.
//   3. landingVerdict(...) -- the multi-criteria gate: require (a) over a pad
//      (padAt callback), (b) descent speed |vy| <= SAFE_VY, (c) lateral speed
//      <= SAFE_VH, (d) tilt within SAFE_TILT. Returns { landed, crashed, reason }
//      with a precise human-readable reason ('missed pad' / 'too fast' /
//      'too much drift' / 'too tilted'), plus a gentleness-weighted score =
//      pad.points + softness bonus (low velocity) + remaining-fuel bonus, scaled
//      by the per-pad difficulty MULTIPLIER.
//
// EVERYTHING IS INJECTED / PARAMETERIZED so the model is decoupled from any
// specific terrain or game:
//   - terrainH(x [,z]) -> ground height under the lander (callback you supply).
//   - padAt(x [,z]) -> a pad object (or null) under the lander. A pad may carry
//       { points, mult } to drive scoring; both default sensibly if absent.
//   - cfg / opts carry ALL physics constants: gravity G, THRUST, ROT/TILTRATE,
//       BURN, FUEL_MAX, MAXTILT, AUTOLVL, SAFE_VY, SAFE_VH, SAFE_TILT, FOOT,
//       bounds, wallBounce. No magic numbers are baked into the algorithm.
//
// State is a plain object you own:
//   { pos:{x,y[,z]}, vel:{x,y[,z]}, pitch, roll, fuel }
// In 2D, set up `dim:2` (or pass 2D pos/vel) and use only `roll`.
//
// USAGE (2D, single tilt angle -- the wizard.recovered case)
//   import { makeLanderState, updateLander, landerUp }
//     from './controls/lander-controller-3d.js';
//   const cfg = { dim:2, G:2.2, THRUST:6.2, BURN:13, FUEL_MAX:100,
//                 TILTRATE:1.7, AUTOLVL:0, SAFE_VY:5, SAFE_VH:4, SAFE_TILT:0.30,
//                 FOOT:2.3 };
//   const s = makeLanderState({ pos:{x:-18, y:74}, fuel:100 }, cfg);
//   function frame(dt){
//     const r = updateLander(s,
//       { thrust: keys.thrust, rollInput: (keys.left?1:0)+(keys.right?-1:0) },
//       dt, cfg, (x) => terrainH(x), (x) => padAt(x));
//     mesh.position.set(s.pos.x, s.pos.y, 0);
//     mesh.rotation.z = s.roll;
//     if (r.landed)  showWin(r.reason, r.score);
//     if (r.crashed) showCrash(r.reason);
//   }
//
// USAGE (3D, pitch + roll -- the lunar-descent case)
//   const cfg = { dim:3, G:3.0, THRUST:7.6, BURN:13.5, FUEL_MAX:100,
//                 TILTRATE:2.0, AUTOLVL:2.4, MAXTILT:0.5,
//                 SAFE_VY:4.4, SAFE_VH:3.0, SAFE_TILT:0.20, FOOT:2.6,
//                 bounds:{ x:114, z:114 }, wallBounce:0.4 };
//   const s = makeLanderState({ pos:{x:0,y:92,z:0}, vel:{x:2,y:0,z:1} }, cfg);
//   const r = updateLander(s,
//     { thrust: input.thrust, pitchInput: input.pitch, rollInput: input.roll },
//     dt, cfg, (x,z) => terrainH(x,z), (x,z) => padAt(x,z));
//   const up = landerUp(s.pitch, s.roll);  // align mesh / draw exhaust along -up
//
// CONTRACTS
//   landerUp(pitch, roll) -> { ux, uy, uz }  (uz omitted-as-0 acceptable in 2D)
//   updateLander(state, controls, dt, cfg, terrainH, padAt) -> verdict
//     controls: { thrust:bool, pitchInput:-1..1, rollInput:-1..1,
//                 tiltLeft?:bool, tiltRight?:bool }  (bools are an alt to inputs)
//     returns the same shape as landingVerdict once it touches down; otherwise
//     { landed:false, crashed:false, reason:'', score:0, contact:false }.
//   No GPU/DOM/listeners are owned, so there is intentionally no dispose().

// ---------- private helpers (dependency-free) ----------
function _clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function _num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

// ---------- config defaults (every value overridable via cfg/opts) ----------
// These mirror the proven lunar-descent-3d tuning; the 2D source used slightly
// different numbers (see the USAGE block) -- both are passed in, never baked.
const DEFAULTS = {
  dim: 3,            // 2 = single-angle (roll) plane game, 3 = pitch+roll
  G: 3.0,            // constant downward gravity (units/s^2)
  THRUST: 7.6,       // engine acceleration along landerUp while burning
  BURN: 13.5,        // fuel units burned per second of thrust
  FUEL_MAX: 100,     // starting / full fuel
  MAXTILT: 0.5,      // clamp on pitch / roll magnitude (radians)
  TILTRATE: 2.0,     // how fast pitch/roll eases toward the tilt input (rad/s)
  AUTOLVL: 2.4,      // auto-level rate back to 0 when input released (rad/s)
  ROT: null,         // alias for TILTRATE when no auto-level (single-angle games)
  SAFE_VY: 4.4,      // max descent speed for a safe landing
  SAFE_VH: 3.0,      // max lateral speed for a safe landing
  SAFE_TILT: 0.20,   // max tilt (radians) for a safe landing
  FOOT: 2.6,         // foot clearance below pos.y at which ground is "touched"
  wallBounce: 0.4,   // |vel| multiplier (and sign flip) on a soft wall clamp
  bounds: null,      // { x:halfX, z:halfZ } soft horizontal walls; null = none
  // scoring weights (gentleness-weighted; honor per-pad multiplier)
  scoreBase: 600,    // base points for any clean landing (added to pad.points)
  scoreSoft: 900,    // max softness bonus (scaled by how gentle the touchdown)
  scoreFuel: 9,      // points per remaining fuel unit
};

function _cfg(cfg) {
  const c = cfg || {};
  const out = {};
  for (const k in DEFAULTS) out[k] = _num(c[k], DEFAULTS[k]);
  out.dim = (c.dim === 2 || c.dim === 3) ? c.dim : DEFAULTS.dim;
  out.bounds = c.bounds || DEFAULTS.bounds;
  // ROT is a single-angle alias for TILTRATE (the 2D source named it ROT).
  if (typeof c.ROT === 'number' && typeof c.TILTRATE !== 'number') {
    out.TILTRATE = c.ROT;
  }
  return out;
}

/**
 * Orientation-derived UP vector. Thrust is applied along this vector, so a
 * tilted lander accelerates sideways -- the core "thrust along your own nose"
 * feel of the genre. In 2D pass roll only (pitch defaults to 0); the {uz} term
 * is then 0 and can be ignored by the caller.
 *
 * Generalized from lunar-descent-3d's
 *   landerUp(p,r) = (-cos(p)*sin(r), cos(p)*cos(r), sin(p))
 * and the 2D wizard.recovered case
 *   up = (-sin(angle), cos(angle)).
 * Setting pitch=0 in the 3D form yields exactly the 2D form in {ux,uy}.
 *
 * @param {number} pitch  forward/back lean (radians); 0 for single-angle games
 * @param {number} [roll=0]  left/right lean (radians); the single tilt axis in 2D
 * @returns {{ux:number, uy:number, uz:number}} unit-ish up vector (cos/sin terms)
 */
export function landerUp(pitch, roll) {
  const p = _num(pitch, 0);
  const r = _num(roll, 0);
  const cp = Math.cos(p);
  return { ux: -cp * Math.sin(r), uy: cp * Math.cos(r), uz: Math.sin(p) };
}

/**
 * The tilt angle of the lander from vertical (radians), derived from landerUp.
 * Used by the landing gate (tilt must be within SAFE_TILT) and handy for a HUD
 * attitude readout. acos of the up vector's Y component.
 *
 * @param {number} pitch
 * @param {number} [roll=0]
 * @returns {number} angle from straight-up in radians (0 = perfectly upright)
 */
export function tiltAngle(pitch, roll) {
  const up = landerUp(pitch, roll);
  return Math.acos(_clamp(up.uy, -1, 1));
}

/**
 * Build / normalize a lander state object. State is plain and host-owned; this
 * just fills in the pieces the integrator needs so callers do not have to.
 *
 * @param {object} [init]  partial state: { pos, vel, pitch, roll, fuel }
 * @param {object} [cfg]   used only for FUEL_MAX default and dim
 * @returns {{pos:object, vel:object, pitch:number, roll:number, fuel:number}}
 */
export function makeLanderState(init, cfg) {
  const c = _cfg(cfg);
  const i = init || {};
  const pos = i.pos || {};
  const vel = i.vel || {};
  return {
    pos: { x: _num(pos.x, 0), y: _num(pos.y, 0), z: _num(pos.z, 0) },
    vel: { x: _num(vel.x, 0), y: _num(vel.y, 0), z: _num(vel.z, 0) },
    pitch: _num(i.pitch, 0),
    roll: _num(i.roll, 0),
    fuel: _num(i.fuel, c.FUEL_MAX),
  };
}

// Resolve the -1..1 pitch/roll inputs from either explicit numbers or the
// boolean tiltLeft/tiltRight flags (accumulated key flags; NO pointer lock).
function _resolveInputs(controls) {
  const c = controls || {};
  let pitch = _num(c.pitchInput, 0);
  let roll = _num(c.rollInput, 0);
  // boolean alternates (touch buttons / single key flags)
  if (c.tiltLeft) roll += 1;
  if (c.tiltRight) roll -= 1;
  if (c.tiltForward) pitch -= 1;
  if (c.tiltBack) pitch += 1;
  return { thrust: !!c.thrust, pitch: _clamp(pitch, -1, 1), roll: _clamp(roll, -1, 1) };
}

// Ease one tilt axis toward its target, with an auto-level fall-off to 0 when no
// input. Matches lunar-descent-3d's clamp-rate easing exactly.
function _easeTilt(cur, axisInput, c, dt) {
  if (axisInput !== 0) {
    const target = axisInput * c.MAXTILT;
    cur += _clamp(target - cur, -c.TILTRATE * dt, c.TILTRATE * dt);
  } else if (c.AUTOLVL > 0) {
    cur -= _clamp(cur, -c.AUTOLVL * dt, c.AUTOLVL * dt);
  }
  return _clamp(cur, -c.MAXTILT, c.MAXTILT);
}

/**
 * The multi-criteria soft-landing verdict. PURE -- mutates nothing. Given the
 * touchdown velocities, tilt, and the pad under the lander, decide landed vs
 * crashed, produce a precise human-readable reason, and (on success) a
 * gentleness-weighted score honoring the pad's difficulty multiplier.
 *
 * Requirements for a clean landing (all four must hold):
 *   (a) over a pad           -- pad != null
 *   (b) soft descent         -- |vy| <= SAFE_VY
 *   (c) low lateral drift    -- vh   <= SAFE_VH
 *   (d) upright              -- tilt <= SAFE_TILT
 *
 * Score (only when landed) =
 *   (scoreBase + softness*scoreSoft + fuel*scoreFuel) * pad.mult  + pad.points
 * where softness = (1 - |vy|/SAFE_VY) * (1 - vh/SAFE_VH), clamped to [0,1].
 *
 * @param {object} args
 * @param {number} args.vy        descent speed magnitude at touchdown (>=0)
 * @param {number} args.vh        lateral speed magnitude at touchdown (>=0)
 * @param {number} args.tilt      tilt angle from upright (radians, >=0)
 * @param {object|null} args.pad  pad under the lander, or null; may carry
 *                                { points, mult }
 * @param {number} args.fuel      remaining fuel
 * @param {object} cfg            config (SAFE_VY/SAFE_VH/SAFE_TILT + score*)
 * @returns {{landed:boolean, crashed:boolean, reason:string, score:number,
 *           pad:(object|null), vy:number, vh:number, tilt:number}}
 */
export function landingVerdict(args, cfg) {
  const c = _cfg(cfg);
  const vy = Math.abs(_num(args && args.vy, 0));
  const vh = Math.abs(_num(args && args.vh, 0));
  const tilt = Math.abs(_num(args && args.tilt, 0));
  const pad = (args && args.pad) || null;
  const fuel = _num(args && args.fuel, 0);

  const overPad = !!pad;
  const soft = vy <= c.SAFE_VY;
  const slow = vh <= c.SAFE_VH;
  const upright = tilt <= c.SAFE_TILT;

  if (overPad && soft && slow && upright) {
    const points = _num(pad.points, 0);
    const mult = _num(pad.mult, 1);
    const softness = _clamp(
      Math.max(0, 1 - vy / Math.max(1e-6, c.SAFE_VY)) *
      Math.max(0, 1 - vh / Math.max(1e-6, c.SAFE_VH)),
      0, 1
    );
    const score = Math.round(
      (c.scoreBase + softness * c.scoreSoft + fuel * c.scoreFuel) * mult
    ) + points;
    return {
      landed: true, crashed: false, reason: 'clean landing',
      score, pad, vy, vh, tilt,
    };
  }

  // Precise crash reason in priority order (matches both source artifacts).
  let reason;
  if (!overPad) reason = 'missed pad';
  else if (!soft) reason = 'too fast';
  else if (!slow) reason = 'too much drift';
  else reason = 'too tilted';

  return { landed: false, crashed: true, reason, score: 0, pad, vy, vh, tilt };
}

/**
 * Advance the lander one frame and, on ground contact, run the landing gate.
 * DELTA-TIME based; mutates `state` in place. Returns a verdict object every
 * frame so the host can react: while airborne it is a no-contact stub, and on
 * the frame of touchdown it is the full landingVerdict result.
 *
 * Per frame:
 *   1. ease pitch/roll toward the tilt input (auto-level when released),
 *   2. apply constant downward gravity to vel.y,
 *   3. if thrust held AND fuel>0: add THRUST*dt along landerUp, burn fuel,
 *      cutting thrust the instant fuel hits 0,
 *   4. integrate vel into pos,
 *   5. soft-clamp/bounce off the optional horizontal walls (cfg.bounds),
 *   6. ground contact: pos.y - FOOT <= terrainH(...) -> snap to ground and run
 *      the SAFE-LANDING gate via landingVerdict.
 *
 * @param {object} state  { pos:{x,y[,z]}, vel:{x,y[,z]}, pitch, roll, fuel }
 * @param {object} controls  { thrust, pitchInput, rollInput, tiltLeft, tiltRight }
 * @param {number} dt  frame delta in seconds (clamp upstream, e.g. min 1/30)
 * @param {object} cfg  physics constants (see DEFAULTS / the USAGE block)
 * @param {(x:number, z?:number)=>number} terrainH  ground height under the lander
 * @param {(x:number, z?:number)=>(object|null)} padAt  pad under the lander, or null
 * @returns {{landed:boolean, crashed:boolean, reason:string, score:number,
 *           contact:boolean, pad:(object|null), vy:number, vh:number, tilt:number}}
 */
export function updateLander(state, controls, dt, cfg, terrainH, padAt) {
  const c = _cfg(cfg);
  const s = state;
  const inp = _resolveInputs(controls);
  const stub = {
    landed: false, crashed: false, reason: '', score: 0,
    contact: false, pad: null, vy: 0, vh: 0, tilt: 0,
  };
  if (!(dt > 0)) return stub;

  // 1. ease tilt toward input (pitch only matters in 3D)
  if (c.dim === 3) s.pitch = _easeTilt(s.pitch, inp.pitch, c, dt);
  else s.pitch = 0;
  s.roll = _easeTilt(s.roll, inp.roll, c, dt);

  // 2. gravity
  s.vel.y -= c.G * dt;

  // 3. thrust along landerUp, burning fuel (cut at empty)
  let thrusting = false;
  if (inp.thrust && s.fuel > 0) {
    thrusting = true;
    const up = landerUp(s.pitch, s.roll);
    s.vel.x += up.ux * c.THRUST * dt;
    s.vel.y += up.uy * c.THRUST * dt;
    if (c.dim === 3) s.vel.z += up.uz * c.THRUST * dt;
    s.fuel = Math.max(0, s.fuel - c.BURN * dt);
  }
  s.thrusting = thrusting;

  // 4. integrate
  s.pos.x += s.vel.x * dt;
  s.pos.y += s.vel.y * dt;
  if (c.dim === 3) s.pos.z += s.vel.z * dt;

  // 5. soft horizontal walls (clamp + dampened bounce)
  if (c.bounds) {
    const bx = _num(c.bounds.x, Infinity);
    if (isFinite(bx) && Math.abs(s.pos.x) > bx) {
      s.pos.x = _clamp(s.pos.x, -bx, bx);
      s.vel.x = -s.vel.x * c.wallBounce;
    }
    if (c.dim === 3) {
      const bz = _num(c.bounds.z, Infinity);
      if (isFinite(bz) && Math.abs(s.pos.z) > bz) {
        s.pos.z = _clamp(s.pos.z, -bz, bz);
        s.vel.z = -s.vel.z * c.wallBounce;
      }
    }
  }

  // 6. ground contact -> landing gate
  const gh = (c.dim === 3) ? terrainH(s.pos.x, s.pos.z) : terrainH(s.pos.x);
  if (s.pos.y - c.FOOT <= gh) {
    s.pos.y = gh + c.FOOT;
    const vy = Math.abs(s.vel.y);
    const vh = (c.dim === 3)
      ? Math.sqrt(s.vel.x * s.vel.x + s.vel.z * s.vel.z)
      : Math.abs(s.vel.x);
    const tilt = tiltAngle(s.pitch, s.roll);
    const pad = (c.dim === 3) ? padAt(s.pos.x, s.pos.z) : padAt(s.pos.x);
    const v = landingVerdict({ vy, vh, tilt, pad, fuel: s.fuel }, c);
    v.contact = true;
    // zero out velocity on touchdown so a settled lander stays put
    s.vel.x = 0; s.vel.y = 0; s.vel.z = 0;
    return v;
  }

  return stub;
}

// END mChatAI Web Component: controls.lander-controller-3d
