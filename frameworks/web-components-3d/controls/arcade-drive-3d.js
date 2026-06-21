// BEGIN mChatAI Web Component: controls.arcade-drive-3d
//
// Arcade drift drive: forward/lateral grip decomposition + drift-charge boost.
// Delta-time, PURE scalar/trig math. NO rendering, NO three.js, NO WebGL, NO
// DOM, NO external deps. Operates on plain numbers/objects so it drops into a
// three.js game, a raw-WebGL game, or a Node test harness unchanged, and is
// trivially offline-safe.
//
// THIS IS THE MISSING ARCADE-RACING CORE. controls.fps-controller is a humanoid
// walk; systems.kinematic-body-3d is gravity / substep ball-vs-AABB collision.
// NEITHER models a ground vehicle's forward-vs-lateral grip, so every kart /
// hover / racer build re-derives drift handling from scratch. This module is
// that handling, extracted + generalized from low-poly-kart-racer (its drive(),
// driftCharge meter, and ACC / BRK / STEER / ROADMAX / GRASSMAX constants).
//
// THE PROVEN IDEAS, generalized (all constants are cfg, never hardcoded):
//   1. drive(state, input, dt, cfg) -- work in the vehicle LOCAL frame: decompose
//      world velocity into FORWARD (along yaw) and LATERAL (sideways) parts.
//      Throttle/brake act on forward; exponential drag bleeds forward; an
//      exponential lateral GRIP kills sideways slide, but LOOSENS while drifting
//      (e.g. exp(-2.3*dt) drifting vs exp(-13*dt) gripping) so the kart slides
//      through corners. Steering rate scales with speed (and rises while
//      drifting) and respects travel direction so reversing steers correctly.
//      Mutates state {x,z,yaw,vx,vz,speed,forward}.
//   2. driftCharge -> release-boost: holding drift while turning ABOVE a speed
//      threshold accumulates a charge meter; releasing converts charge into a
//      forward velocity IMPULSE plus a temporary top-speed-cap multiplier
//      (boostFlash). drive() reads state.boost.flash to lift the cap; the
//      meter math lives in updateDriftCharge() / releaseBoost(), exposed on
//      state.driftCharge and state.boost.
//   3. surfaceMaxSpeed(cfg, surface) -- surface-aware caps (road vs grass vs
//      arbitrary named surfaces). Caller supplies a surface query each frame;
//      the slower cap drags a kart off the racing line into the rough.
//   4. smoothSteer(prev, target, dt, cfg) -- an input low-pass so digital
//      key steering ramps instead of snapping (the source steerSmooth filter).
//
// HOVER / ANTI-GRAV VARIANT (alternative grip profile, e.g. neon-canyon):
//   A hovercraft is the SAME model with a much looser lateral grip and a higher
//   drag (it floats / coasts). Set cfg.gripGrip and cfg.gripDrift close together
//   and small (e.g. both ~ -1.5..-3) for a constant gliding "gripK lateral-kill",
//   and apply boost-pad thrust by calling addThrust(state, force, dt). No new
//   code path needed -- it is a tuning of the same scalars.
//
// USAGE (three.js or raw-WebGL kart)
//   import { createVehicle, drive, defaultDriveConfig }
//     from './arcade-drive-3d.js';
//
//   const cfg  = defaultDriveConfig();          // tune any field
//   const kart = createVehicle({ x:0, z:0, yaw:0 });
//
//   function frame(dt){
//     const input = {
//       throttle: keys.up ? 1 : 0,
//       brake:    keys.down ? 1 : 0,
//       steer:    smoothSteer(kart.steerSmooth ?? 0,
//                   (keys.right?1:0)-(keys.left?1:0), dt, cfg),
//       drift:    keys.space,
//     };
//     kart.steerSmooth = input.steer;
//     const surface = onRoad(kart.x, kart.z) ? 'road' : 'grass';
//     drive(kart, input, dt, cfg, surface);     // mutates kart in place
//     mesh.position.set(kart.x, mesh.position.y, kart.z);
//     mesh.rotation.y = kart.yaw;               // host maps yaw onto any mesh
//   }
//
// USAGE (Node test -- pure, no DOM)
//   const k = createVehicle();
//   drive(k, { throttle:1, steer:1, drift:true }, 1/60, defaultDriveConfig());
//   // k.x / k.z / k.yaw / k.speed / k.driftCharge are now advanced.
//
// CONTRACTS
//   - state is a plain object; drive() reads/writes {x,z,yaw,vx,vz,speed,forward,
//     driftCharge,boost}. createVehicle() seeds them; you may pass your own.
//   - x/z are the ground plane (XZ, +Y up); yaw is radians, 0 facing +Z, the
//     same convention as the source (forward = sin(yaw),cos(yaw)). The host
//     maps state.{x,z,yaw} onto any mesh transform.
//   - everything is delta-time: drag / grip use exp(rate*dt); call once/frame.
//   - ALL handling constants are in cfg / opts; nothing is hardcoded.

// ---------- private helpers (dependency-free) ----------
function _clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function _num(v, dflt) { return (typeof v === 'number' && isFinite(v)) ? v : dflt; }

/**
 * Default arcade handling config. Every field is overridable; pass a partial to
 * defaultDriveConfig(overrides) or just mutate the returned object. The numbers
 * mirror the proven low-poly-kart-racer feel (ACC 58, BRK 42, STEER 2.5,
 * ROADMAX 47, GRASSMAX 17, grip exp(-2.3) drifting / exp(-13) gripping).
 *
 * @param {object} [overrides]  partial config merged over the defaults
 * @returns {object} a fresh config object
 */
export function defaultDriveConfig(overrides = {}) {
  const c = {
    accel: 58,            // forward acceleration when throttle held (units/s^2)
    brake: 42,            // forward deceleration when brake held (units/s^2)
    steer: 2.5,           // base yaw rate at speed (rad/s, scaled by speed)
    steerDriftMult: 1.55, // extra yaw rate multiplier while drifting
    drag: 0.7,            // forward exponential drag rate (per second)
    gripGrip: 13,         // lateral grip rate while NOT drifting (per second)
    gripDrift: 2.3,       // lateral grip rate while drifting (looser = slides)
    steerSpeedRef: 8,     // forward speed at which steering reaches full rate
    surfaceMax: { road: 47, grass: 17 }, // named surface top speeds (units/s)
    defaultSurface: 'road',
    reverseCapFactor: 0.4, // reverse top speed = cap * this
    // drift-charge boost loop
    driftMinSpeed: 10,    // |forward| must exceed this to charge
    driftMinSteer: 0.25,  // |steer| must exceed this to charge
    driftChargeRate: 1.0, // charge accrued per second of valid drift
    driftChargeMax: 1.7,  // charge meter ceiling
    boostMinCharge: 0.45, // release below this fizzles (no boost)
    boostImpulse: 8,      // forward velocity impulse per unit charge released
    boostCapMult: 1.38,   // top-speed-cap multiplier while a boost is flashing
    boostFlashTime: 0.55, // seconds the cap multiplier lasts after release
    // input steering smoothing
    steerSmooth: 12,      // low-pass rate for digital steer input (per second)
  };
  for (const k in overrides) {
    if (k === 'surfaceMax' && overrides.surfaceMax) {
      c.surfaceMax = Object.assign({}, c.surfaceMax, overrides.surfaceMax);
    } else {
      c[k] = overrides[k];
    }
  }
  return c;
}

/**
 * Make a fresh vehicle state seeded with the fields drive() reads and writes.
 * You can also hand drive() your own object; it only needs x,z,yaw to start.
 *
 * @param {object} [init]  initial {x,z,yaw,vx,vz}
 * @returns {object} state {x,z,yaw,vx,vz,speed,forward,driftCharge,boost,steerSmooth}
 */
export function createVehicle(init = {}) {
  return {
    x: _num(init.x, 0),
    z: _num(init.z, 0),
    yaw: _num(init.yaw, 0),
    vx: _num(init.vx, 0),
    vz: _num(init.vz, 0),
    speed: 0,            // |velocity| (units/s), recomputed each drive()
    forward: 0,          // signed forward-component speed (units/s)
    driftCharge: 0,      // accumulated drift charge meter (0..driftChargeMax)
    boost: { flash: 0 }, // boost.flash > 0 => cap multiplier is active
    steerSmooth: 0,      // host's last smoothed steer (for smoothSteer chaining)
  };
}

/**
 * Resolve the surface top-speed cap for a named surface. Unknown surfaces fall
 * back to cfg.defaultSurface, then to the road cap. Caller decides the surface
 * each frame (e.g. lateral distance from the track centerline => 'road'/'grass').
 *
 * @param {object} cfg  handling config (defaultDriveConfig)
 * @param {string} [surface]  surface name to look up in cfg.surfaceMax
 * @returns {number} the top-speed cap for that surface (units/s)
 */
export function surfaceMaxSpeed(cfg, surface) {
  const map = cfg.surfaceMax || {};
  if (surface != null && map[surface] != null) return map[surface];
  const dflt = cfg.defaultSurface;
  if (dflt != null && map[dflt] != null) return map[dflt];
  return _num(map.road, 47);
}

/**
 * Low-pass an input steer target so digital key steering ramps in/out instead of
 * snapping (the source steerSmooth filter). Frame-rate independent: the blend
 * factor is 1 - exp(-rate*dt) clamped to 1. Returns the new smoothed value;
 * store it and feed it back next frame.
 *
 * @param {number} prev    last smoothed steer (-1..1)
 * @param {number} target  raw target this frame (e.g. right-left key as -1/0/1)
 * @param {number} dt      frame delta seconds
 * @param {object} [cfg]   uses cfg.steerSmooth (per-second rate)
 * @returns {number} the new smoothed steer value
 */
export function smoothSteer(prev, target, dt, cfg = {}) {
  const rate = _num(cfg.steerSmooth, 12);
  const t = _clamp(rate * dt, 0, 1);
  return prev + (target - prev) * t;
}

/**
 * Accumulate / decay the drift-charge meter for ONE frame. Charge grows only
 * while drifting AND turning hard enough AND moving fast enough (the source
 * `drift && |fwd|>10 && |steer|>0.25` gate); otherwise it does NOT change here
 * (release is handled by releaseBoost()). Pure meter math -- no movement.
 *
 * @param {object} state  vehicle state (state.driftCharge mutated)
 * @param {object} input  {drift, steer}
 * @param {number} dt     frame delta seconds
 * @param {object} cfg    uses driftMinSpeed, driftMinSteer, driftChargeRate, driftChargeMax
 * @returns {number} the new driftCharge value
 */
export function updateDriftCharge(state, input, dt, cfg) {
  const drifting = !!input.drift;
  const steer = _num(input.steer, 0);
  const charging = drifting &&
    Math.abs(state.forward) > _num(cfg.driftMinSpeed, 10) &&
    Math.abs(steer) > _num(cfg.driftMinSteer, 0.25);
  if (charging) {
    state.driftCharge = Math.min(
      state.driftCharge + _num(cfg.driftChargeRate, 1.0) * dt,
      _num(cfg.driftChargeMax, 1.7)
    );
  }
  return state.driftCharge;
}

/**
 * Convert the current drift charge into a forward velocity IMPULSE plus a
 * temporary top-speed-cap multiplier (boostFlash), then zero the meter. Call
 * this the instant drift is released. Below cfg.boostMinCharge the charge just
 * fizzles (meter clears, no boost). Mutates state.vx/vz (impulse) and
 * state.boost.flash; returns the impulse magnitude applied (0 if it fizzled).
 *
 * @param {object} state  vehicle state (vx,vz,boost,driftCharge mutated)
 * @param {object} cfg    uses boostMinCharge, boostImpulse, driftChargeMax, boostFlashTime
 * @returns {number} forward impulse magnitude applied (0 = fizzled)
 */
export function releaseBoost(state, cfg) {
  const charge = state.driftCharge;
  let applied = 0;
  if (charge > _num(cfg.boostMinCharge, 0.45)) {
    const c = Math.min(charge, _num(cfg.driftChargeMax, 1.7));
    applied = c * _num(cfg.boostImpulse, 8);
    state.vx += Math.sin(state.yaw) * applied;
    state.vz += Math.cos(state.yaw) * applied;
    state.boost.flash = _num(cfg.boostFlashTime, 0.55);
  }
  state.driftCharge = 0;
  return applied;
}

/**
 * Add a raw forward thrust impulse along the current yaw (boost pads, ramps,
 * speed strips, the hover/anti-grav variant's pad thrust). Delta-time scaled.
 * Mutates state.vx/vz.
 *
 * @param {object} state  vehicle state (vx,vz mutated)
 * @param {number} force  thrust acceleration (units/s^2)
 * @param {number} dt     frame delta seconds
 */
export function addThrust(state, force, dt) {
  const f = force * dt;
  state.vx += Math.sin(state.yaw) * f;
  state.vz += Math.cos(state.yaw) * f;
}

/**
 * Advance a ground vehicle by `dt` seconds with arcade drift handling. Works in
 * the vehicle LOCAL frame: decomposes velocity into FORWARD (along yaw) and
 * LATERAL (sideways), applies throttle/brake to forward, exponential drag,
 * exponential lateral grip that loosens while drifting (so it slides through
 * corners), speed-scaled + drift-boosted + direction-aware steering, the
 * surface-aware top-speed cap, and the drift-charge/release-boost loop. Then
 * recomposes world velocity and integrates position. Mutates state in place:
 * {x,z,yaw,vx,vz,speed,forward,driftCharge,boost}.
 *
 * Drift-charge: this function calls updateDriftCharge() while drift is held and
 * releaseBoost() on the rising edge of release (drift went true->false). Track
 * the previous drift in state so it knows; createVehicle() handles seeding.
 *
 * @param {object} state  vehicle state (mutated). Needs x,z,yaw to start.
 * @param {object} input  { throttle, brake, steer, drift } -- throttle/brake are
 *        0..1 (or truthy), steer is -1..1, drift is boolean.
 * @param {number} dt     frame delta seconds (clamp upstream, e.g. <= 1/20)
 * @param {object} cfg    handling config (defaultDriveConfig)
 * @param {string} [surface]  surface name for the speed cap (surfaceMaxSpeed)
 * @returns {object} state (for chaining)
 */
export function drive(state, input, dt, cfg, surface) {
  const thr = _num(input.throttle, 0) ? Math.min(_num(input.throttle, 1) || 1, 1) : 0;
  const brk = _num(input.brake, 0) ? Math.min(_num(input.brake, 1) || 1, 1) : 0;
  const steer = _clamp(_num(input.steer, 0), -1, 1);
  const drift = !!input.drift;

  // --- drift-charge meter + release-on-edge ---
  if (drift) {
    updateDriftCharge(state, input, dt, cfg);
  } else if (state._wasDrift) {
    releaseBoost(state, cfg);
  }
  state._wasDrift = drift;

  // decay the boost flash window
  if (state.boost.flash > 0) state.boost.flash = Math.max(0, state.boost.flash - dt);

  // --- decompose world velocity into local FORWARD + LATERAL ---
  let s = Math.sin(state.yaw), c = Math.cos(state.yaw);
  let fwd = state.vx * s + state.vz * c;   // along the heading
  let lat = state.vx * c - state.vz * s;   // sideways

  // throttle / brake act on the forward component
  if (thr) fwd += _num(cfg.accel, 58) * thr * dt;
  if (brk) fwd -= _num(cfg.brake, 42) * brk * dt;

  // exponential forward drag (coast-down)
  fwd *= Math.exp(-_num(cfg.drag, 0.7) * dt);

  // steering: rate scales with speed, rises while drifting, respects direction
  const sgn = fwd >= 0 ? 1 : -1;                       // reverse steers correctly
  const speedFactor = Math.min(Math.abs(fwd) / _num(cfg.steerSpeedRef, 8), 1);
  const steerRate = _num(cfg.steer, 2.5) * (drift ? _num(cfg.steerDriftMult, 1.55) : 1.0);
  state.yaw += steer * steerRate * dt * speedFactor * sgn;

  // exponential lateral GRIP: tight when gripping, loose (slides) when drifting
  const gripRate = drift ? _num(cfg.gripDrift, 2.3) : _num(cfg.gripGrip, 13);
  lat *= Math.exp(-gripRate * dt);

  // surface-aware top-speed cap, lifted by an active boost flash
  let cap = surfaceMaxSpeed(cfg, surface != null ? surface : cfg.defaultSurface);
  if (state.boost.flash > 0) cap *= _num(cfg.boostCapMult, 1.38);
  if (fwd > cap) fwd = cap;
  const revCap = -cap * _num(cfg.reverseCapFactor, 0.4);
  if (fwd < revCap) fwd = revCap;

  // --- recompose world velocity from the (possibly re-yawed) local frame ---
  s = Math.sin(state.yaw); c = Math.cos(state.yaw);
  state.vx = s * fwd + c * lat;
  state.vz = c * fwd - s * lat;

  // integrate position
  state.x += state.vx * dt;
  state.z += state.vz * dt;

  state.forward = fwd;
  state.speed = Math.sqrt(state.vx * state.vx + state.vz * state.vz);
  return state;
}

// END mChatAI Web Component: controls.arcade-drive-3d
