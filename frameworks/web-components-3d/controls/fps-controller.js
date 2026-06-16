// BEGIN mChatAI Web Component: controls.fps-controller
//
// Universal first-person / third-person controller that WORKS WITHOUT POINTER
// LOCK — so it is playable inside the mChatAI+ WKWebView preview (which does NOT
// grant pointer lock) AND on mobile AND on the published hub. Default look mode
// is DRAG-TO-LOOK (hold + drag the view; touch-drag on phones); pointer lock is
// an opt-in for desktop-hub builds that want it. Includes built-in on-screen
// TOUCH CONTROLS (a movement joystick + action buttons) that auto-appear on
// touch devices, so the same game is mobile-ready.
//
// WHY: pointer-lock FPS games render fine but are UNPLAYABLE in the preview
// (you can't aim) and on mobile. Drag-look + touch fixes both. Movement: WASD on
// desktop, the on-screen joystick on touch. Aim: drag the view. Shoot/jump: a
// quick tap/click (no drag) fires the primary action, or use the action buttons
// / Space, all routed through onAction(id).
//
// USAGE (three.js)
//   import { FPSController } from './fps-controller.js';
//   const fps = new FPSController(renderer.domElement, {
//     position:[0,1.7,8], eyeHeight:1.7, speed:5.5, gravity:26, jumpSpeed:8,
//     colliders: wallBoxes,                 // optional [{min,max}] -> wall-slide
//     actions:[{id:'shoot',label:'FIRE'},{id:'jump',label:'JUMP'}],
//     onAction:(id)=>{ if(id==='shoot') fire(); if(id==='jump') fps.jump(); },
//   });
//   function frame(dt){ fps.update(dt); fps.applyToCamera(camera); renderer.render(scene,camera); }
//
// CONTROLS: drag the view to look · WASD / on-screen stick to move · tap/click
// (no drag) or the FIRE button or Space to act · Shift to sprint.

export class FPSController {
  constructor(domElement, opts = {}) {
    this.el = domElement;
    this.lookMode = opts.lookMode || 'drag';        // 'drag' (default) | 'pointerlock'
    this.speed = opts.speed ?? 5.5;
    this.sprintMult = opts.sprintMult ?? 1.7;
    this.gravity = opts.gravity ?? 26;
    this.jumpSpeed = opts.jumpSpeed ?? 8;
    this.eyeHeight = opts.eyeHeight ?? 1.7;
    this.sensitivity = opts.sensitivity ?? 0.0026;   // mouse-drag look
    this.touchLookSensitivity = opts.touchLookSensitivity ?? 0.005;
    this.fly = opts.fly ?? false;
    this.colliders = opts.colliders ?? null;
    this.radius = opts.radius ?? 0.3;
    this.groundY = opts.groundY ?? 0;
    this.collide = opts.collide ?? null;
    this.actions = opts.actions ?? [];               // [{id,label}]
    this.onAction = opts.onAction ?? null;
    this.touchControls = opts.touchControls ?? true; // on-screen stick + buttons (touch)
    this.tapThreshold = opts.tapThreshold ?? 8;      // px: a drag shorter than this = a tap/shoot

    const p = opts.position ?? [0, this.eyeHeight + this.groundY, 0];
    this.position = [p[0], p[1], p[2]];
    this.yaw = opts.yaw ?? 0;
    this.pitch = opts.pitch ?? 0;
    this.velY = 0; this.onGround = true;
    this.keys = {};
    this.move = [0, 0];     // joystick vector x,z in [-1,1]
    this._listeners = [];
    this._dragId = null; this._lastX = 0; this._lastY = 0; this._dragDist = 0;

    this._installLook();
    this._installKeys();
    if (this._isTouch() && this.touchControls) this._installTouchUI();
  }

  _isTouch() { return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0); }
  _on(t, ev, fn, opt) { t.addEventListener(ev, fn, opt); this._listeners.push([t, ev, fn, opt]); }

  jump() { if (!this.fly && this.onGround) { this.velY = this.jumpSpeed; this.onGround = false; } }

  // ---- look: drag (default) or optional pointer-lock ----
  _installLook() {
    if (this.lookMode === 'pointerlock') {
      this._on(this.el, 'click', () => { if (document.pointerLockElement !== this.el) this.el.requestPointerLock?.(); });
      this._on(document, 'mousemove', (e) => {
        if (document.pointerLockElement !== this.el) return;
        this._applyLook(e.movementX, e.movementY, this.sensitivity);
      });
      return;
    }
    // DRAG-LOOK (works everywhere). A short press with no drag = a tap (primary action).
    const start = (x, y, id) => { this._dragId = id; this._lastX = x; this._lastY = y; this._dragDist = 0; };
    const moveTo = (x, y, sens) => {
      if (this._dragId === null) return;
      const dx = x - this._lastX, dy = y - this._lastY;
      this._dragDist += Math.abs(dx) + Math.abs(dy);
      this._applyLook(dx, dy, sens);
      this._lastX = x; this._lastY = y;
    };
    const end = () => {
      if (this._dragId !== null && this._dragDist < this.tapThreshold) this._emit(this.actions[0]?.id || 'shoot');
      this._dragId = null;
    };
    this._on(this.el, 'mousedown', (e) => { e.preventDefault(); start(e.clientX, e.clientY, 'mouse'); });
    this._on(window, 'mousemove', (e) => { if (this._dragId === 'mouse') moveTo(e.clientX, e.clientY, this.sensitivity); });
    this._on(window, 'mouseup', () => { if (this._dragId === 'mouse') end(); });
    this._on(this.el, 'contextmenu', (e) => e.preventDefault());
    // touch look (on the canvas; the joystick/buttons stop-propagation so they don't rotate the view)
    this._on(this.el, 'touchstart', (e) => { const t = e.changedTouches[0]; start(t.clientX, t.clientY, t.identifier); e.preventDefault(); }, { passive: false });
    this._on(this.el, 'touchmove', (e) => {
      for (const t of e.changedTouches) if (t.identifier === this._dragId) moveTo(t.clientX, t.clientY, this.touchLookSensitivity);
      e.preventDefault();
    }, { passive: false });
    this._on(this.el, 'touchend', (e) => { for (const t of e.changedTouches) if (t.identifier === this._dragId) end(); }, { passive: false });
  }

  _applyLook(dx, dy, sens) {
    this.yaw -= dx * sens;
    this.pitch -= dy * sens;
    const lim = Math.PI / 2 - 0.02;
    if (this.pitch > lim) this.pitch = lim;
    if (this.pitch < -lim) this.pitch = -lim;
  }

  _installKeys() {
    this._on(window, 'keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'w' || k === 'a' || k === 's' || k === 'd') e.preventDefault();
      this.keys[k] = true;
      if (k === ' ') { this.jump(); this._emit(this.actions[0]?.id || 'shoot'); }
    });
    this._on(window, 'keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
  }

  _emit(id) { if (id && this.onAction) this.onAction(id); }

  // ---- on-screen touch controls: movement joystick (left) + action buttons (right) ----
  _installTouchUI() {
    if (!document.getElementById('mchatai-fps-touch-style')) {
      const st = document.createElement('style');
      st.id = 'mchatai-fps-touch-style';
      st.textContent = `
.fpsc-stick{position:fixed;left:18px;bottom:18px;width:120px;height:120px;border-radius:50%;
  background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);z-index:60;touch-action:none}
.fpsc-knob{position:absolute;left:35px;top:35px;width:50px;height:50px;border-radius:50%;
  background:rgba(255,255,255,.32);transition:none}
.fpsc-btns{position:fixed;right:18px;bottom:24px;display:flex;flex-direction:column;gap:12px;z-index:60}
.fpsc-btn{width:74px;height:74px;border-radius:50%;background:rgba(255,255,255,.14);
  border:1px solid rgba(255,255,255,.25);color:#fff;font:700 13px system-ui;touch-action:none;
  display:flex;align-items:center;justify-content:center;-webkit-user-select:none;user-select:none}
.fpsc-btn:active{background:rgba(255,255,255,.3)}`;
      document.head.appendChild(st);
    }
    // joystick
    const stick = document.createElement('div'); stick.className = 'fpsc-stick';
    const knob = document.createElement('div'); knob.className = 'fpsc-knob'; stick.appendChild(knob);
    let sid = null, cx = 0, cy = 0;
    const setKnob = (dx, dy) => { knob.style.left = (35 + dx) + 'px'; knob.style.top = (35 + dy) + 'px'; };
    this._on(stick, 'touchstart', (e) => { const r = stick.getBoundingClientRect(); cx = r.left + 60; cy = r.top + 60; sid = e.changedTouches[0].identifier; e.stopPropagation(); e.preventDefault(); }, { passive: false });
    this._on(stick, 'touchmove', (e) => {
      for (const t of e.changedTouches) if (t.identifier === sid) {
        let dx = t.clientX - cx, dy = t.clientY - cy; const m = Math.hypot(dx, dy), max = 42;
        if (m > max) { dx = dx / m * max; dy = dy / m * max; }
        setKnob(dx, dy); this.move = [dx / max, dy / max];
      }
      e.stopPropagation(); e.preventDefault();
    }, { passive: false });
    const stickEnd = (e) => { for (const t of e.changedTouches) if (t.identifier === sid) { sid = null; this.move = [0, 0]; setKnob(0, 0); } e.stopPropagation(); };
    this._on(stick, 'touchend', stickEnd, { passive: false });
    document.body.appendChild(stick);

    // action buttons (default a FIRE button if no actions given)
    const btnWrap = document.createElement('div'); btnWrap.className = 'fpsc-btns';
    const acts = this.actions.length ? this.actions : [{ id: 'shoot', label: 'FIRE' }];
    for (const a of acts) {
      const b = document.createElement('div'); b.className = 'fpsc-btn'; b.textContent = a.label || a.id;
      this._on(b, 'touchstart', (e) => { this._emit(a.id); if (a.id === 'jump') this.jump(); e.stopPropagation(); e.preventDefault(); }, { passive: false });
      btnWrap.appendChild(b);
    }
    document.body.appendChild(btnWrap);
    this._touchEls = [stick, btnWrap];
  }

  // ---- per-frame ----
  update(dt) {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    // keyboard
    let mf = 0, mr = 0;
    if (this.keys['w']) mf += 1; if (this.keys['s']) mf -= 1;
    if (this.keys['d']) mr += 1; if (this.keys['a']) mr -= 1;
    // joystick (x = strafe, y = forward; up on stick = forward)
    mr += this.move[0]; mf += -this.move[1];
    let mx = fx * mf + rx * mr, mz = fz * mf + rz * mr;
    const ml = Math.hypot(mx, mz);
    const spd = this.speed * (this.keys['shift'] ? this.sprintMult : 1);
    const prev = [this.position[0], this.position[1], this.position[2]];
    const next = [prev[0], prev[1], prev[2]];
    if (ml > 0) { next[0] += (mx / ml) * spd * dt * Math.min(1, ml); next[2] += (mz / ml) * spd * dt * Math.min(1, ml); }

    if (this.fly) {
      if (this.keys[' ']) next[1] += spd * dt;
      if (this.keys['control'] || this.keys['c']) next[1] -= spd * dt;
    } else {
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

  _resolveColliders(next, prev) {
    const r = this.radius, head = next[1], feet = next[1] - this.eyeHeight;
    const hits = (x, z) => {
      for (const b of this.colliders) {
        if (x + r > b.min[0] && x - r < b.max[0] && head > b.min[1] && feet < b.max[1] &&
            z + r > b.min[2] && z - r < b.max[2]) return true;
      }
      return false;
    };
    if (hits(next[0], prev[2])) next[0] = prev[0];
    if (hits(next[0], next[2])) next[2] = prev[2];
  }

  forward() {
    const cp = Math.cos(this.pitch);
    return [-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp];
  }

  applyToCamera(camera) {
    camera.position.set(this.position[0], this.position[1], this.position[2]);
    if (camera.rotation) {
      camera.rotation.order = 'YXZ';
      camera.rotation.y = this.yaw; camera.rotation.x = this.pitch; camera.rotation.z = 0;
    }
  }

  dispose() {
    for (const [t, ev, fn, opt] of this._listeners) t.removeEventListener(ev, fn, opt);
    this._listeners = [];
    if (this._touchEls) for (const el of this._touchEls) el.remove();
  }
}

// END mChatAI Web Component: controls.fps-controller
