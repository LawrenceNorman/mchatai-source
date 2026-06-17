// BEGIN mChatAI Web Component: controls.camera-rig-3d
//
// One camera controller with selectable modes, so genre code never hand-rolls a
// bespoke camera per game. Hand-rolled cameras are the top cause of the "camera
// pointed away from the action" failure (tjs-017/tjs-021): they clip, jitter,
// never follow, or frame empty space. This rig keeps the target and the threats
// in frame with smoothed motion on every genre.
//
// Modes:
//   CHASE        trail behind + above the target, looking slightly ahead of its
//                velocity. The default action-game camera (runner, flight, racer).
//   FOLLOW       a fixed angled overhead lock (top-down-ish RPG / strategy).
//   ORBIT        spherical drag / wheel / pinch + optional auto-spin around the
//                target. The showpiece / diorama camera.
//   RISE         climb with the target's height (towers, jumpers).
//   FIRST_PERSON pass-through: the rig stops driving the camera so you can use
//                controls.fps-controller (the canonical FPS camera). Provided so
//                a recipe can declare ONE camera component and switch modes.
//
// IMPORTANT compose-order: if you also use effects.screen-shake, call
// shake.update(dt, camera) AFTER rig.update(dt) so the shake offset is layered
// on top of the base pose this rig sets, then reverted next frame.
//
// Offline-safe: imports only the canonical bare 'three' specifier.
//
// Usage:
//   import { CameraRig, CHASE, FOLLOW, ORBIT } from './controls/camera-rig-3d.js';
//   const rig = new CameraRig({ camera, mode: CHASE, target: player, dom: renderer.domElement });
//   // each frame (inside onRender or onUpdate):
//   rig.update(dt);
//   // shake.update(dt, camera);   // <- after rig.update if you shake

import * as THREE from 'three';

export const CHASE = 'chase';
export const FOLLOW = 'follow';
export const ORBIT = 'orbit';
export const RISE = 'rise';
export const FIRST_PERSON = 'first-person';

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}
function num(value, fallback) {
  return isFiniteNumber(value) ? value : fallback;
}
// Frame-rate-independent exponential smoothing factor (tjs-006). damping is the
// fraction of the gap closed per ~16ms; we convert to a per-dt factor.
function smoothFactor(damping, dt) {
  const d = Math.max(0.0001, Math.min(1, damping));
  return 1 - Math.pow(1 - d, Math.max(0, dt) * 60);
}

export class CameraRig {
  // opts:
  //   camera    (required) the THREE.PerspectiveCamera to drive.
  //   mode      one of CHASE/FOLLOW/ORBIT/RISE/FIRST_PERSON. Default CHASE.
  //   target    Object3D the camera frames (its .position / .quaternion).
  //   dom        element for ORBIT pointer input. Default window.
  //   distance  base distance from target. Default 8.
  //   height    base height above target. Default 4.
  //   lookAhead world units to bias the look point toward target velocity. Default 3.
  //   damping   0..1 position/look smoothing per ~16ms. Default 0.12.
  //   minPolar/maxPolar  ORBIT vertical clamp (radians). Defaults 0.15 / 1.5.
  //   autoSpin  ORBIT auto-rotation rad/s when idle. Default 0.
  constructor(opts = {}) {
    this.camera = opts.camera || null;
    this.mode = opts.mode || CHASE;
    this.target = opts.target || null;
    this.dom = opts.dom || (typeof window !== 'undefined' ? window : null);

    this.distance = num(opts.distance, 8);
    this.height = num(opts.height, 4);
    this.lookAhead = num(opts.lookAhead, 3);
    this.damping = num(opts.damping, 0.12);
    this.minPolar = num(opts.minPolar, 0.15);
    this.maxPolar = num(opts.maxPolar, 1.5);
    this.autoSpin = num(opts.autoSpin, 0);

    // Smoothed working state.
    this._camPos = new THREE.Vector3();
    this._lookAt = new THREE.Vector3();
    this._prevTargetPos = new THREE.Vector3();
    this._velocity = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._initialized = false;
    this._disposed = false;

    // ORBIT spherical state.
    this._azimuth = num(opts.azimuth, 0);
    this._polar = num(opts.polar, 0.9);
    this._orbitDistance = this.distance;
    this._dragging = false;
    this._lastX = 0;
    this._lastY = 0;
    this._idleTime = 0;

    if (this.target && this.target.position) {
      this._prevTargetPos.copy(this.target.position);
    }
    this._bound = [];
    if (this.mode === ORBIT) {
      this._bindOrbit();
    }
  }

  setTarget(obj) {
    this.target = obj;
    if (obj && obj.position) {
      this._prevTargetPos.copy(obj.position);
    }
    return this;
  }

  setMode(mode) {
    if (mode === this.mode) {
      return this;
    }
    // Tear down ORBIT listeners when leaving ORBIT; bind them when entering.
    if (this.mode === ORBIT && mode !== ORBIT) {
      this._unbind();
    }
    this.mode = mode;
    if (mode === ORBIT) {
      this._bindOrbit();
    }
    return this;
  }

  // Position the camera. Call once per frame. FIRST_PERSON is a no-op so the
  // fps-controller can own the camera.
  update(dt) {
    if (this._disposed || !this.camera || this.mode === FIRST_PERSON) {
      return this;
    }
    const t = this.target && this.target.position ? this.target.position : null;
    if (!t) {
      return this;
    }

    // Estimate target velocity from frame delta (for look-ahead).
    if (dt > 0) {
      this._velocity.copy(t).sub(this._prevTargetPos).multiplyScalar(1 / dt);
    }
    this._prevTargetPos.copy(t);

    let desiredPos = this._tmp;
    let desiredLook = this._tmp2;

    if (this.mode === ORBIT) {
      this._idleTime += dt;
      if (this.autoSpin && !this._dragging && this._idleTime > 1.5) {
        this._azimuth += this.autoSpin * dt;
      }
      const sinP = Math.sin(this._polar);
      desiredPos.set(
        t.x + this._orbitDistance * sinP * Math.sin(this._azimuth),
        t.y + this._orbitDistance * Math.cos(this._polar),
        t.z + this._orbitDistance * sinP * Math.cos(this._azimuth)
      );
      desiredLook.copy(t);
    } else if (this.mode === FOLLOW) {
      // Angled overhead lock; ignores target heading.
      desiredPos.set(t.x, t.y + this.height, t.z + this.distance);
      desiredLook.copy(t);
    } else if (this.mode === RISE) {
      // Behind + above, but follows height directly (no lag on Y for towers).
      desiredPos.set(t.x, t.y + this.height, t.z + this.distance);
      desiredLook.set(t.x, t.y, t.z);
    } else {
      // CHASE: trail behind the target's facing/velocity, look ahead of it.
      const heading = this._headingDir();
      desiredPos.set(
        t.x - heading.x * this.distance,
        t.y + this.height,
        t.z - heading.z * this.distance
      );
      desiredLook.set(
        t.x + heading.x * this.lookAhead,
        t.y + this.height * 0.25,
        t.z + heading.z * this.lookAhead
      );
    }

    if (!this._initialized) {
      this._camPos.copy(desiredPos);
      this._lookAt.copy(desiredLook);
      this._initialized = true;
    } else {
      const f = smoothFactor(this.damping, dt);
      this._camPos.lerp(desiredPos, f);
      this._lookAt.lerp(desiredLook, f);
    }

    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._lookAt);
    return this;
  }

  // Unit horizontal heading: prefer the target's facing (rotation.y), fall back
  // to velocity, else +Z.
  _headingDir() {
    const h = this._velocity;
    const speed = Math.hypot(h.x, h.z);
    if (this.target.rotation && isFiniteNumber(this.target.rotation.y)) {
      // Object faces -Z by default in three; map yaw to a forward vector.
      const yaw = this.target.rotation.y;
      return { x: Math.sin(yaw), z: Math.cos(yaw) };
    }
    if (speed > 0.05) {
      return { x: h.x / speed, z: h.z / speed };
    }
    return { x: 0, z: 1 };
  }

  // ----- ORBIT pointer input -----
  _bindOrbit() {
    const el = this.dom;
    if (!el || !el.addEventListener) {
      return;
    }
    const down = (x, y) => {
      this._dragging = true;
      this._lastX = x;
      this._lastY = y;
      this._idleTime = 0;
    };
    const moveTo = (x, y) => {
      if (!this._dragging) {
        return;
      }
      const dx = x - this._lastX;
      const dy = y - this._lastY;
      this._lastX = x;
      this._lastY = y;
      this._azimuth -= dx * 0.005;
      this._polar = Math.max(this.minPolar, Math.min(this.maxPolar, this._polar - dy * 0.005));
      this._idleTime = 0;
    };
    const up = () => {
      this._dragging = false;
    };

    const onMouseDown = (e) => down(e.clientX, e.clientY);
    const onMouseMove = (e) => moveTo(e.clientX, e.clientY);
    const onMouseUp = () => up();
    const onWheel = (e) => {
      this._orbitDistance = Math.max(1, Math.min(200, this._orbitDistance + Math.sign(e.deltaY) * this._orbitDistance * 0.1));
      this._idleTime = 0;
    };
    const onTouchStart = (e) => {
      if (e.touches.length === 1) {
        down(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const onTouchMove = (e) => {
      if (e.touches.length === 1) {
        moveTo(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const add = (target, type, fn, optsArg) => {
      target.addEventListener(type, fn, optsArg);
      this._bound.push([target, type, fn]);
    };
    add(el, 'mousedown', onMouseDown);
    add(window, 'mousemove', onMouseMove);
    add(window, 'mouseup', onMouseUp);
    add(el, 'wheel', onWheel, { passive: true });
    add(el, 'touchstart', onTouchStart, { passive: true });
    add(el, 'touchmove', onTouchMove, { passive: true });
    add(window, 'touchend', onMouseUp);
  }

  _unbind() {
    for (const [target, type, fn] of this._bound) {
      target.removeEventListener(type, fn);
    }
    this._bound = [];
  }

  dispose() {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    this._unbind();
  }
}

// END mChatAI Web Component: controls.camera-rig-3d
