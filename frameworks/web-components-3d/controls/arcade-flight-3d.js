// BEGIN mChatAI Web Component: controls.arcade-flight-3d
//
// Arcade BANKING flight model for a glider / plane / dragon / spaceship. This is
// a distinct locomotion archetype: it does NOT walk (fps-controller), it is NOT a
// camera (camera-rig-3d), and it does NOT roll on the ground (kinematic-body-3d).
// It couples ROLL -> YAW (a coordinated banked turn) and trades PITCH <-> SPEED
// through a simple energy model (diving accelerates, climbing bleeds speed back
// toward a cruise value), then advances position along the forward vector.
//
// Pure math on a plain state object. ZERO three.js / WebGL / external deps and
// fully offline-safe, so it drops straight into a three.js scene (feed pos + the
// yaw/pitch/roll euler to a mesh) OR into a raw 2D canvas projection unchanged.
//
// Input: arrow keys / WASD OR pointer DRAG (works on mouse and touch). It NEVER
// calls requestPointerLock and never gates on it -- drag is mapped from the
// pointer offset within the element, so it works in the mChatAI+ WKWebView.
//
// Every constant (roll ease rate, yaw coupling, pitch clamp, cruise speed,
// dive/climb energy factors, camera distances) is a cfg field with a documented
// default; the binary ships no magic numbers. All motion is delta-time based.
//
// Key exports:
//   flightUpdate(state, input, dt, cfg)   advance the flight one step
//   FlightInput                            keyboard + drag reader (DOM)
//   chaseCamera(state, dt, cfg)            optional smooth chase-cam helper
//   autopilot(state, target, dt, cfg)      steer-toward-target for demo loops
//   resetFlight(state, target, cfg)        spawn behind + aligned to a target
//   defaultFlightConfig()                  a fresh, fully-populated cfg object
//   smooth, smoothA, norm, fwd, clamp, lerp   math helpers (re-exported)
//
// Contracts:
//   - state = { pos:[x,y,z], yaw, pitch, roll, speed }. flightUpdate mutates it
//     in place and returns it. yaw is radians (atan2(x,z) convention, 0 = +Z).
//   - input = { bank:-1..1, climb:-1..1 }. bank>0 banks right; climb>0 noses up.
//   - dt is seconds since last update; everything is exp/dt smoothed so it is
//     frame-rate independent.
//   - cfg is optional; missing fields fall back to defaultFlightConfig().
//   - target = { pos:[x,y,z], normal?:[x,y,z], reach? } for autopilot/resetFlight.
//
// Usage (three.js):
//   import { flightUpdate, FlightInput, chaseCamera, resetFlight } from './controls/arcade-flight-3d.js';
//   const cfg = undefined; // or pass overrides, e.g. { cruise: 80 }
//   const state = { pos:[0,40,0], yaw:0, pitch:0, roll:0, speed:64 };
//   const input = new FlightInput({ element: renderer.domElement });
//   function frame(dt) {
//     flightUpdate(state, input.read(), dt, cfg);
//     mesh.position.set(state.pos[0], state.pos[1], state.pos[2]);
//     mesh.rotation.set(state.pitch, state.yaw, -state.roll, 'YXZ');
//     const c = chaseCamera(state, dt, cfg);
//     camera.position.set(c.camPos[0], c.camPos[1], c.camPos[2]);
//     camera.lookAt(c.camLook[0], c.camLook[1], c.camLook[2]);
//   }
//   // on teardown: input.dispose();

var TAU = Math.PI * 2;

// ---- math helpers (pure) ---------------------------------------------------

export function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

export function lerp(a, b, t) { return a + (b - a) * t; }

// Frame-rate independent exponential ease toward a target (linear quantity).
export function smooth(cur, tgt, rate, dt) {
  return cur + (tgt - cur) * (1 - Math.exp(-rate * dt));
}

// Wrap an angle into (-PI, PI].
export function norm(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

// Exponential ease toward a target ANGLE, taking the short way around.
export function smoothA(cur, tgt, rate, dt) {
  return cur + norm(tgt - cur) * (1 - Math.exp(-rate * dt));
}

// Unit forward vector for a yaw/pitch. yaw=0 points +Z; +x is right.
export function fwd(yaw, pitch) {
  var cp = Math.cos(pitch);
  return [cp * Math.sin(yaw), Math.sin(pitch), cp * Math.cos(yaw)];
}

// ---- configuration ---------------------------------------------------------

// A fresh, fully-populated config. Every tunable lives here; callers pass an
// overrides object and missing keys fall back to these.
export function defaultFlightConfig() {
  return {
    // banking / turning
    maxRoll: 0.52,        // radians of roll at full bank deflection
    rollEase: 3.4,        // how fast roll eases toward the banked target
    yawCoupling: 1.15,    // roll -> yaw rate; bigger = tighter coordinated turn
    // pitch
    maxPitch: 0.42,       // target pitch (rad) at full climb deflection
    pitchEase: 2.3,       // how fast pitch eases toward target
    pitchClamp: 0.5,      // hard clamp on pitch magnitude (rad)
    // speed / energy model
    cruise: 64,           // speed the craft settles toward in level flight
    diveAccel: 40,        // -sin(pitch)*diveAccel: diving speeds up, climbing slows
    cruisePull: 0.28,     // how strongly speed returns toward cruise per second
    minSpeed: 44,
    maxSpeed: 128,
    // soft world bounds (set floor=-Infinity / ceil=Infinity to disable)
    floor: -Infinity,     // y the craft cannot sink below
    floorRecover: 6,      // gentle nose-up ease rate when riding the floor
    ceil: Infinity,       // y the craft cannot climb above
    // chase camera
    camDist: 16,          // distance the camera trails behind the craft
    camHeight: 5,         // vertical lift of the camera above the craft
    camEase: 6.5,         // position/yaw follow rate
    camPitchEase: 5.5,
    camPitchFraction: 0.8,// fraction of craft pitch the cam adopts
    camRollEase: 5,
    camRollFraction: 0.42,// fraction of craft roll the cam leans with
    camLookAhead: 1.0,    // how far ahead (units of speed*dt-ish) the cam looks
    // autopilot gains
    apBankGain: 1.6,      // yaw error -> bank command
    apClimbGain: 3.2,     // pitch error -> climb command
    apMaxPitch: 0.36,     // clamp on the pitch autopilot will aim for
    apReach: 26,          // distance at which a target counts as reached
    // spawn
    spawnBack: 72,        // distance behind the target to spawn at
    spawnMinY: 14         // minimum spawn altitude
  };
}

// Merge caller overrides over the defaults (shallow; one level is enough here).
function resolveCfg(cfg) {
  var d = defaultFlightConfig();
  if (!cfg) return d;
  for (var k in d) { if (cfg[k] !== undefined && cfg[k] !== null) d[k] = cfg[k]; }
  return d;
}

// ---- core flight step ------------------------------------------------------

// Advance one flight step. Mutates `state` in place and returns it.
//   state = { pos:[x,y,z], yaw, pitch, roll, speed }
//   input = { bank:-1..1, climb:-1..1 }
//   dt    = seconds
//   cfg   = overrides (optional)
export function flightUpdate(state, input, dt, cfg) {
  var c = resolveCfg(cfg);
  var bank = clamp((input && input.bank) || 0, -1, 1);
  var climb = clamp((input && input.climb) || 0, -1, 1);

  // 1. Bank: roll eases toward the commanded bank angle.
  state.roll = smooth(state.roll || 0, bank * c.maxRoll, c.rollEase, dt);

  // 2. Coordinated turn: a banked craft yaws. Roll drives yaw rate.
  state.yaw = (state.yaw || 0) + state.roll * c.yawCoupling * dt;

  // 3. Pitch: ease toward the commanded climb, then hard-clamp.
  var targetPitch = climb * c.maxPitch;
  state.pitch = smooth(state.pitch || 0, targetPitch, c.pitchEase, dt);
  state.pitch = clamp(state.pitch, -c.pitchClamp, c.pitchClamp);

  // 4. Energy trade: nose-down accelerates, nose-up bleeds speed; in level
  //    flight speed relaxes back toward cruise.
  var s = (typeof state.speed === 'number') ? state.speed : c.cruise;
  s += (-Math.sin(state.pitch)) * c.diveAccel * dt;
  s += (c.cruise - s) * c.cruisePull * dt;
  state.speed = clamp(s, c.minSpeed, c.maxSpeed);

  // 5. Advance position along the forward vector.
  var F = fwd(state.yaw, state.pitch);
  if (!state.pos) state.pos = [0, 0, 0];
  state.pos[0] += F[0] * state.speed * dt;
  state.pos[1] += F[1] * state.speed * dt;
  state.pos[2] += F[2] * state.speed * dt;

  // 6. Soft world bounds: ride the floor with a gentle nose-up; cap the ceiling.
  if (state.pos[1] < c.floor) {
    state.pos[1] = c.floor;
    if (state.pitch < 0.04) state.pitch = smooth(state.pitch, 0.12, c.floorRecover, dt);
  }
  if (state.pos[1] > c.ceil) {
    state.pos[1] = c.ceil;
  }

  return state;
}

// ---- optional chase camera -------------------------------------------------

// Smooth chase camera that trails behind the craft and leans with a fraction of
// its roll. Stateless across calls except for the persisted `_cam` it stores on
// `state` (so the smoothing has memory). Returns { camPos, camLook, roll }.
// Entirely optional -- callers that drive their own camera can ignore it.
export function chaseCamera(state, dt, cfg) {
  var c = resolveCfg(cfg);
  var cf = fwd(state.yaw || 0, state.pitch || 0);
  var p = state.pos || [0, 0, 0];

  // desired camera position: behind the craft along forward, lifted up.
  var tx = p[0] - cf[0] * c.camDist;
  var ty = p[1] - cf[1] * c.camDist + c.camHeight;
  var tz = p[2] - cf[2] * c.camDist;

  var cam = state._cam;
  if (!cam) {
    // First call: snap to the desired pose so we do not lerp in from origin.
    cam = state._cam = {
      pos: [tx, ty, tz],
      yaw: state.yaw || 0,
      pitch: (state.pitch || 0) * c.camPitchFraction,
      roll: (state.roll || 0) * c.camRollFraction
    };
  } else {
    cam.pos[0] = smooth(cam.pos[0], tx, c.camEase, dt);
    cam.pos[1] = smooth(cam.pos[1], ty, c.camEase, dt);
    cam.pos[2] = smooth(cam.pos[2], tz, c.camEase, dt);
    cam.yaw = smoothA(cam.yaw, state.yaw || 0, c.camEase, dt);
    cam.pitch = smooth(cam.pitch, (state.pitch || 0) * c.camPitchFraction, c.camPitchEase, dt);
    cam.roll = smooth(cam.roll, (state.roll || 0) * c.camRollFraction, c.camRollEase, dt);
  }

  // look point: a little ahead of the craft so the horizon sits naturally.
  var look = [
    p[0] + cf[0] * c.camLookAhead,
    p[1] + cf[1] * c.camLookAhead,
    p[2] + cf[2] * c.camLookAhead
  ];

  return { camPos: [cam.pos[0], cam.pos[1], cam.pos[2]], camLook: look, roll: cam.roll };
}

// ---- autopilot -------------------------------------------------------------

// Produce a { bank, climb } command that steers `state` toward `target.pos`.
// Drives an attract/demo loop or an AI wingman. Returns clamped -1..1 commands
// that you feed straight into flightUpdate.
//   target = { pos:[x,y,z] }
export function autopilot(state, target, dt, cfg) {
  var c = resolveCfg(cfg);
  var t = (target && target.pos) || [0, 0, 0];
  var p = state.pos || [0, 0, 0];

  var dx = t[0] - p[0];
  var dz = t[2] - p[2];
  var dy = t[1] - p[1];

  var desiredYaw = Math.atan2(dx, dz);
  var yawErr = norm(desiredYaw - (state.yaw || 0));

  var horiz = Math.sqrt(dx * dx + dz * dz) + 0.01;
  var desiredPitch = clamp(Math.atan2(dy, horiz), -c.apMaxPitch, c.apMaxPitch);

  return {
    bank: clamp(yawErr * c.apBankGain, -1, 1),
    climb: clamp((desiredPitch - (state.pitch || 0)) * c.apClimbGain, -1, 1)
  };
}

// True once the craft is within cfg.apReach of the target (handy for advancing
// to the next waypoint in a demo loop).
export function reachedTarget(state, target, cfg) {
  var c = resolveCfg(cfg);
  var t = (target && target.pos) || [0, 0, 0];
  var p = state.pos || [0, 0, 0];
  var dx = t[0] - p[0], dy = t[1] - p[1], dz = t[2] - p[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz) < c.apReach;
}

// ---- spawn -----------------------------------------------------------------

// Place the craft behind and aligned with a target (e.g. the first gate/ring),
// at cruise speed and level. target.normal (if given) is the direction the
// target "faces"; we spawn that far back along it. Mutates and returns state.
//   target = { pos:[x,y,z], normal?:[x,y,z] }
export function resetFlight(state, target, cfg) {
  var c = resolveCfg(cfg);
  var t = (target && target.pos) || [0, 0, 0];
  var n = (target && target.normal) || null;

  if (n) {
    var nl = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) || 1;
    var nx = n[0] / nl, ny = n[1] / nl, nz = n[2] / nl;
    state.pos = [
      t[0] - nx * c.spawnBack,
      Math.max(c.spawnMinY, t[1] - ny * c.spawnBack),
      t[2] - nz * c.spawnBack
    ];
    state.yaw = Math.atan2(nx, nz);
  } else {
    state.pos = [t[0], Math.max(c.spawnMinY, t[1]), t[2] - c.spawnBack];
    state.yaw = 0;
  }
  state.pitch = 0;
  state.roll = 0;
  state.speed = c.cruise;
  state._cam = null; // force the chase camera to re-snap on next call
  return state;
}

// ---- input reader (DOM) ----------------------------------------------------

// Reads keyboard (arrows / WASD) and pointer DRAG into { bank, climb }. Drag is
// derived from the pointer offset within the bound element and works for mouse
// AND touch -- it NEVER uses requestPointerLock. Call read() each frame.
//   opts.element   element to listen on for drag (default: window/document body)
//   opts.dragGainX horizontal drag sensitivity (default 1.5)
//   opts.dragGainY vertical drag sensitivity (default 1.4)
//   opts.invertY   flip climb so dragging down = nose up (default false)
export class FlightInput {
  constructor(opts) {
    opts = opts || {};
    this.element = opts.element || (typeof document !== 'undefined' ? document.body : null);
    this.dragGainX = typeof opts.dragGainX === 'number' ? opts.dragGainX : 1.5;
    this.dragGainY = typeof opts.dragGainY === 'number' ? opts.dragGainY : 1.4;
    this.invertY = !!opts.invertY;

    this.keys = {};
    this.drag = { on: false, x: 0, y: 0 };
    this._disposed = false;

    var self = this;
    this._onKeyDown = function (e) { self.keys[e.key] = true; };
    this._onKeyUp = function (e) { self.keys[e.key] = false; };
    this._onDown = function (e) { self.drag.on = true; self._steer(e.clientX, e.clientY); };
    this._onMove = function (e) { if (self.drag.on) self._steer(e.clientX, e.clientY); };
    this._onUp = function () { self.drag.on = false; self.drag.x = 0; self.drag.y = 0; };

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('keyup', this._onKeyUp);
    }
    if (this.element) {
      this.element.addEventListener('pointerdown', this._onDown);
      this.element.addEventListener('pointermove', this._onMove);
      this.element.addEventListener('pointerup', this._onUp);
      this.element.addEventListener('pointercancel', this._onUp);
      this.element.addEventListener('pointerleave', this._onUp);
    }
  }

  // Map an absolute pointer position to normalized -1..1 drag steering relative
  // to the element center. Works the same for mouse and touch.
  _steer(cx, cy) {
    var rect = (this.element && this.element.getBoundingClientRect)
      ? this.element.getBoundingClientRect()
      : { left: 0, top: 0, width: 1, height: 1 };
    var w = rect.width || 1, h = rect.height || 1;
    var nx = ((cx - rect.left) / w) * 2 - 1;
    var ny = ((cy - rect.top) / h) * 2 - 1;
    this.drag.x = clamp(nx * this.dragGainX, -1, 1);
    // screen-down is +ny; default maps drag-up -> climb-up.
    this.drag.y = clamp(-ny * this.dragGainY, -1, 1);
  }

  // Returns { bank, climb } in -1..1. Keyboard and drag combine.
  read() {
    var bank = 0, climb = 0;
    var k = this.keys;
    if (k.ArrowLeft || k.a || k.A) bank -= 1;
    if (k.ArrowRight || k.d || k.D) bank += 1;
    if (k.ArrowUp || k.w || k.W) climb += 1;
    if (k.ArrowDown || k.s || k.S) climb -= 1;
    if (this.drag.on) {
      bank = clamp(bank + this.drag.x, -1, 1);
      climb = clamp(climb + this.drag.y, -1, 1);
    }
    if (this.invertY) climb = -climb;
    return { bank: bank, climb: climb };
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this._onKeyDown);
      window.removeEventListener('keyup', this._onKeyUp);
    }
    if (this.element) {
      this.element.removeEventListener('pointerdown', this._onDown);
      this.element.removeEventListener('pointermove', this._onMove);
      this.element.removeEventListener('pointerup', this._onUp);
      this.element.removeEventListener('pointercancel', this._onUp);
      this.element.removeEventListener('pointerleave', this._onUp);
    }
    this.keys = {};
    this.drag = { on: false, x: 0, y: 0 };
  }
}

// Functional input reader for callers that prefer not to manage an instance.
// Pass the keys map and drag object you maintain; returns { bank, climb }.
export function readInput(keys, drag, invertY) {
  keys = keys || {};
  var bank = 0, climb = 0;
  if (keys.ArrowLeft || keys.a || keys.A) bank -= 1;
  if (keys.ArrowRight || keys.d || keys.D) bank += 1;
  if (keys.ArrowUp || keys.w || keys.W) climb += 1;
  if (keys.ArrowDown || keys.s || keys.S) climb -= 1;
  if (drag && drag.on) {
    bank = clamp(bank + (drag.x || 0), -1, 1);
    climb = clamp(climb + (drag.y || 0), -1, 1);
  }
  if (invertY) climb = -climb;
  return { bank: bank, climb: climb };
}

// END mChatAI Web Component: controls.arcade-flight-3d
