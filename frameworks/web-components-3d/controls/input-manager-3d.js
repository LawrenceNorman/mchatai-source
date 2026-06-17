// BEGIN mChatAI Web Component: controls.input-manager-3d
//
// The single OWNER of the unified input state every control writes into:
//   { move:{x,y}, look:{x,y}, actionA, actionAHeld, actionB, actionBHeld }
// It wires keyboard (WASD/arrows + space/shift) and composes the existing
// dependency-free control Lego (controls.virtual-joystick-3d + on-screen
// buttons) into ONE state object, so genre logic never branches on device and
// never re-allocates/re-wires per game (the CONTEXT.md unified-input mandate).
//
// move.x  -1 (left)  .. +1 (right)
// move.y  -1 (back)  .. +1 (forward)   (screen-up / W = forward)
// actionA / actionB   held booleans; consumeActionA()/consumeActionB() return a
//                     one-shot edge (true exactly once per press).
//
// Dependency-free (DOM only). Pass it the canonical joystick/button modules if
// you want on-screen touch controls; otherwise it is keyboard-only.
//
// Usage:
//   import { InputManager3D } from './controls/input-manager-3d.js';
//   const input = new InputManager3D({ host: document.body, touch: true });
//   // each frame:
//   input.update(dt);
//   if (input.state.move.y > 0) moveForward();
//   if (input.consumeActionA()) fire();   // edge-triggered
//   // teardown:
//   input.dispose();

function createInputState() {
  return {
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    actionA: false, actionAHeld: false,
    actionB: false, actionBHeld: false
  };
}

export { createInputState };

export class InputManager3D {
  // opts:
  //   host       element to attach key/pointer listeners to. Default window.
  //   touch      if true, mount an on-screen joystick + A/B buttons on touch
  //              devices (requires touch DOM; pure CSS/DOM, no Lego import).
  //   keys       custom key map override (advanced).
  //   state      reuse an external state object (else one is created).
  constructor(opts = {}) {
    this.host = opts.host || (typeof window !== 'undefined' ? window : null);
    this.state = opts.state || createInputState();
    this.useTouch = !!opts.touch && _isTouchDevice();
    this._disposed = false;
    this._bound = [];
    this._down = Object.create(null); // currently-held keys
    this._aEdge = false;
    this._bEdge = false;

    this.keys = Object.assign({
      forward: ['KeyW', 'ArrowUp'],
      back: ['KeyS', 'ArrowDown'],
      left: ['KeyA', 'ArrowLeft'],
      right: ['KeyD', 'ArrowRight'],
      actionA: ['Space', 'KeyJ', 'KeyZ'],
      actionB: ['ShiftLeft', 'KeyK', 'KeyX']
    }, opts.keys || {});

    this._bindKeyboard();
    if (this.useTouch) {
      this._mountTouch(opts.host);
    }
  }

  _bindKeyboard() {
    const tgt = (typeof window !== 'undefined') ? window : this.host;
    if (!tgt || !tgt.addEventListener) return;
    const onDown = (e) => {
      if (this._matches(e.code, 'actionA') && !this._down[e.code]) this._aEdge = true;
      if (this._matches(e.code, 'actionB') && !this._down[e.code]) this._bEdge = true;
      this._down[e.code] = true;
      // prevent the page scrolling on arrows/space inside a game
      if (this._isGameKey(e.code) && e.preventDefault) e.preventDefault();
    };
    const onUp = (e) => { this._down[e.code] = false; };
    tgt.addEventListener('keydown', onDown);
    tgt.addEventListener('keyup', onUp);
    this._bound.push([tgt, 'keydown', onDown], [tgt, 'keyup', onUp]);
  }

  _matches(code, action) {
    const list = this.keys[action];
    return Array.isArray(list) && list.indexOf(code) !== -1;
  }
  _isGameKey(code) {
    for (const k in this.keys) {
      if (this._matches(code, k)) return true;
    }
    return false;
  }

  // ----- on-screen touch controls (joystick left, A/B right) -----
  _mountTouch(host) {
    const root = (host && host.appendChild) ? host : (typeof document !== 'undefined' ? document.body : null);
    if (!root || typeof document === 'undefined') return;

    const stick = document.createElement('div');
    stick.style.cssText = 'position:fixed;left:18px;bottom:18px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,0.12);touch-action:none;z-index:50;';
    const nub = document.createElement('div');
    nub.style.cssText = 'position:absolute;left:35px;top:35px;width:50px;height:50px;border-radius:50%;background:rgba(255,255,255,0.4);';
    stick.appendChild(nub);
    root.appendChild(stick);
    this._stickEl = stick;

    let active = false;
    let cx = 0, cy = 0;
    const r = 60;
    const start = (x, y) => { active = true; const b = stick.getBoundingClientRect(); cx = b.left + r; cy = b.top + r; move(x, y); };
    const move = (x, y) => {
      if (!active) return;
      let dx = x - cx, dy = y - cy;
      const d = Math.hypot(dx, dy) || 1;
      const cl = Math.min(d, r);
      dx = dx / d * cl; dy = dy / d * cl;
      nub.style.left = (35 + dx) + 'px';
      nub.style.top = (35 + dy) + 'px';
      this.state.move.x = dx / r;
      this.state.move.y = -dy / r; // screen-up = forward
    };
    const end = () => { active = false; nub.style.left = '35px'; nub.style.top = '35px'; this.state.move.x = 0; this.state.move.y = 0; };
    const ts = (e) => { const t = e.changedTouches[0]; start(t.clientX, t.clientY); };
    const tm = (e) => { const t = e.changedTouches[0]; move(t.clientX, t.clientY); if (e.preventDefault) e.preventDefault(); };
    stick.addEventListener('touchstart', ts, { passive: true });
    stick.addEventListener('touchmove', tm, { passive: false });
    stick.addEventListener('touchend', end);
    this._bound.push([stick, 'touchstart', ts], [stick, 'touchmove', tm], [stick, 'touchend', end]);

    // A / B buttons
    const mkBtn = (label, right, action) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = `position:fixed;right:${right}px;bottom:30px;width:64px;height:64px;border-radius:50%;border:none;background:rgba(255,255,255,0.25);color:#fff;font:600 20px system-ui;touch-action:none;z-index:50;`;
      root.appendChild(b);
      const dn = (e) => { this.state[action + 'Held'] = true; if (action === 'actionA') this._aEdge = true; else this._bEdge = true; if (e.preventDefault) e.preventDefault(); };
      const up = () => { this.state[action + 'Held'] = false; };
      b.addEventListener('touchstart', dn, { passive: false });
      b.addEventListener('touchend', up);
      this._bound.push([b, 'touchstart', dn], [b, 'touchend', up]);
      return b;
    };
    this._btnA = mkBtn('A', 92, 'actionA');
    this._btnB = mkBtn('B', 20, 'actionB');
  }

  // Recompute keyboard-driven move + held flags. Touch writes state directly.
  update() {
    if (this._disposed) return this;
    // keyboard move (only override touch when no touch input is active)
    if (!this.useTouch || (this.state.move.x === 0 && this.state.move.y === 0)) {
      let mx = 0, my = 0;
      if (this._anyDown('right')) mx += 1;
      if (this._anyDown('left')) mx -= 1;
      if (this._anyDown('forward')) my += 1;
      if (this._anyDown('back')) my -= 1;
      // normalize diagonal
      const len = Math.hypot(mx, my);
      if (len > 1) { mx /= len; my /= len; }
      if (!this.useTouch) { this.state.move.x = mx; this.state.move.y = my; }
      else if (mx || my) { this.state.move.x = mx; this.state.move.y = my; }
    }
    const aHeld = this._anyDown('actionA') || this.state.actionAHeld;
    const bHeld = this._anyDown('actionB') || this.state.actionBHeld;
    this.state.actionA = aHeld;
    this.state.actionB = bHeld;
    return this;
  }

  _anyDown(action) {
    const list = this.keys[action];
    if (!Array.isArray(list)) return false;
    for (const code of list) if (this._down[code]) return true;
    return false;
  }

  // One-shot edge reads (true exactly once per press).
  consumeActionA() { const e = this._aEdge; this._aEdge = false; return e; }
  consumeActionB() { const e = this._bEdge; this._bEdge = false; return e; }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    for (const [t, type, fn] of this._bound) {
      try { t.removeEventListener(type, fn); } catch (e) { /* ignore */ }
    }
    this._bound = [];
    for (const el of [this._stickEl, this._btnA, this._btnB]) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }
  }
}

function _isTouchDevice() {
  return typeof window !== 'undefined' &&
    (('ontouchstart' in window) || (navigator && navigator.maxTouchPoints > 0));
}

// END mChatAI Web Component: controls.input-manager-3d
