// BEGIN mChatAI Web Component: controls.fps-controller
//
// Drop-in first-person controller: pointer-lock mouse-look (yaw/pitch) + WASD
// movement + optional gravity/jump + a collision hook + a built-in "click to
// play" overlay. Renderer-agnostic — the math is plain yaw/pitch/position, with
// `applyToCamera()` for three.js and raw `yaw/pitch/position` getters for a
// hand-rolled WebGL/canvas camera. This is the piece the CLI kept failing to
// assemble from scratch for Doom/dogfight/maze-FPS builds; import it instead.
//
// Extracted + generalized from the proven `voxel-sandbox` overnight build
// (pointer-lock + WASD that actually landed), made three.js-friendly.
//
// USAGE (three.js)
//   import { FPSController } from './fps-controller.js';
//   const fps = new FPSController(renderer.domElement, {
//     position: [0, 1.7, 8], eyeHeight: 1.7, speed: 5.5, gravity: 26, jumpSpeed: 8,
//     collide: (next, prev) => resolveAgainstWalls(next, prev),  // optional
//   });
//   function frame(dt){ fps.update(dt); fps.applyToCamera(camera); renderer.render(scene,camera); }
//
// USAGE (raw WebGL / canvas)
//   fps.update(dt);
//   const eye = fps.position, dir = fps.forward();   // build your own lookAt
//
// CONTROLS: click to lock the pointer, mouse to look, WASD to move, Shift to
// sprint, Space to jump (when not flying), Esc to release. Set `fly:true` for
// noclip/creative movement (no gravity, W/S follow look direction).

export class FPSController {
  constructor(domElement, opts = {}) {
    this.el = domElement;
    this.speed = opts.speed ?? 5.5;
    this.sprintMult = opts.sprintMult ?? 1.8;
    this.gravity = opts.gravity ?? 26;
    this.jumpSpeed = opts.jumpSpeed ?? 8;
    this.eyeHeight = opts.eyeHeight ?? 1.7;
    this.sensitivity = opts.sensitivity ?? 0.0024;
    this.fly = opts.fly ?? false;
    this.collide = opts.collide ?? null;          // (next[3], prev[3]) -> corrected[3]
    this.colliders = opts.colliders ?? null;      // [{min:[x,y,z], max:[x,y,z]}] walls/boxes
    this.radius = opts.radius ?? 0.3;             // player capsule radius for wall slide
    this.groundY = opts.groundY ?? 0;             // floor height (feet); eye sits eyeHeight above
    this.autoOverlay = opts.overlay !== false;    // built-in click-to-play overlay

    const p = opts.position ?? [0, this.eyeHeight + this.groundY, 0];
    this.position = [p[0], p[1], p[2]];
    this.velY = 0;
    this.onGround = true;
    this.yaw = opts.yaw ?? 0;                      // radians, around +Y
    this.pitch = opts.pitch ?? 0;                  // radians, clamped +/-~90deg
    this.keys = {};
    this.locked = false;
    this._listeners = [];
    this._overlayEl = null;

    this._installInput();
    if (this.autoOverlay) this._installOverlay();
  }

  // ---- input ----
  _on(target, type, fn, opt) { target.addEventListener(type, fn, opt); this._listeners.push([target, type, fn, opt]); }

  _installInput() {
    this._on(this.el, 'mousedown', () => { if (!this.locked) this.requestLock(); });
    this._on(this.el, 'contextmenu', (e) => e.preventDefault());
    this._on(document, 'pointerlockchange', () => {
      this.locked = (document.pointerLockElement === this.el);
      if (this._overlayEl) this._overlayEl.style.display = this.locked ? 'none' : '';
    });
    this._on(document, 'mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity;
      const lim = Math.PI / 2 - 0.02;
      if (this.pitch > lim) this.pitch = lim;
      if (this.pitch < -lim) this.pitch = -lim;
    });
    this._on(window, 'keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'w' || k === 'a' || k === 's' || k === 'd') e.preventDefault();
      this.keys[k] = true;
    });
    this._on(window, 'keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
  }

  _installOverlay() {
    const o = document.createElement('div');
    o.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,0.55);color:#fff;font:600 18px system-ui,sans-serif;cursor:pointer;z-index:9999;text-align:center';
    o.innerHTML = '<div>Click to play<br><span style="font-weight:400;font-size:14px;opacity:.8">WASD move · mouse look · Esc to release</span></div>';
    this._on(o, 'click', () => this.requestLock());
    (document.body || document.documentElement).appendChild(o);
    this._overlayEl = o;
  }

  requestLock() {
    if (!document.hasFocus()) return;
    const p = this.el.requestPointerLock?.();
    if (p && p.catch) p.catch(() => {});
  }

  // ---- per-frame ----
  /// Advance the controller by dt seconds. Reads WASD/sprint/jump, applies
  /// gravity (unless fly), and routes the candidate position through `collide`.
  update(dt) {
    // movement basis from yaw (XZ plane); forward is -Z at yaw 0
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx =  Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let mx = 0, mz = 0;
    if (this.keys['w']) { mx += fx; mz += fz; }
    if (this.keys['s']) { mx -= fx; mz -= fz; }
    if (this.keys['d']) { mx += rx; mz += rz; }
    if (this.keys['a']) { mx -= rx; mz -= rz; }
    const ml = Math.hypot(mx, mz);
    const spd = this.speed * (this.keys['shift'] ? this.sprintMult : 1);
    const prev = [this.position[0], this.position[1], this.position[2]];
    const next = [prev[0], prev[1], prev[2]];
    if (ml > 0) { next[0] += (mx / ml) * spd * dt; next[2] += (mz / ml) * spd * dt; }

    if (this.fly) {
      // vertical via look pitch on W/S would be surprising; use Space/Ctrl
      if (this.keys[' ']) next[1] += spd * dt;
      if (this.keys['control'] || this.keys['c']) next[1] -= spd * dt;
    } else {
      if (this.onGround && this.keys[' ']) { this.velY = this.jumpSpeed; this.onGround = false; }
      this.velY -= this.gravity * dt;
      next[1] += this.velY * dt;
      const floor = this.groundY + this.eyeHeight;
      if (next[1] <= floor) { next[1] = floor; this.velY = 0; this.onGround = true; }
    }

    if (this.collide) {
      const c = this.collide(next, prev);
      if (Array.isArray(c) && c.length === 3) { next[0] = c[0]; next[1] = c[1]; next[2] = c[2]; }
    } else if (this.colliders && this.colliders.length) {
      this._resolveColliders(next, prev);
    }
    this.position = next;
  }

  /// Built-in wall collision: axis-separated swept AABB. Try the X move (keeping
  /// the old Z), revert X if it enters any box; then try the Z move and revert Z
  /// if blocked. Reverting per-axis yields sliding along walls instead of
  /// stopping dead — the behavior the failed Doom/maze builds never assembled.
  /// Pass `colliders: [{min:[x,y,z], max:[x,y,z]}]` and it just works.
  _resolveColliders(next, prev) {
    const r = this.radius;
    const head = next[1], feet = next[1] - this.eyeHeight;
    const hits = (x, z) => {
      for (const b of this.colliders) {
        if (x + r > b.min[0] && x - r < b.max[0] &&
            head > b.min[1] && feet < b.max[1] &&
            z + r > b.min[2] && z - r < b.max[2]) return true;
      }
      return false;
    };
    if (hits(next[0], prev[2])) next[0] = prev[0];
    if (hits(next[0], next[2])) next[2] = prev[2];
  }

  /// Unit forward vector (where the camera is looking), including pitch.
  forward() {
    const cp = Math.cos(this.pitch);
    return [-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp];
  }

  /// Point a three.js PerspectiveCamera at the controller state. Uses YXZ euler
  /// order so yaw (Y) then pitch (X) compose like a standard FPS camera.
  applyToCamera(camera) {
    camera.position.set(this.position[0], this.position[1], this.position[2]);
    if (camera.rotation) {
      camera.rotation.order = 'YXZ';
      camera.rotation.y = this.yaw;
      camera.rotation.x = this.pitch;
      camera.rotation.z = 0;
    }
  }

  dispose() {
    for (const [t, type, fn, opt] of this._listeners) t.removeEventListener(type, fn, opt);
    this._listeners = [];
    if (this._overlayEl && this._overlayEl.parentNode) this._overlayEl.parentNode.removeChild(this._overlayEl);
    if (document.pointerLockElement === this.el) document.exitPointerLock?.();
  }
}

// END mChatAI Web Component: controls.fps-controller
