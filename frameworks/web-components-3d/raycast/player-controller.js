// BEGIN mChatAI Web Component: raycast.player-controller
//
// GridCameraController - the first-person MOVER for grid raycasters. This is the
// 2D-grid equivalent of controls.fps-controller: it does NOT drive a THREE.Camera.
// It mutates a plain {px, py, angle} heading over a tile array (the px/py grid
// position + facing angle that a raycaster render loop reads to cast columns).
//
// THREE DESIGN GUARANTEES (read these before changing anything):
//   1. LOOK IS ACCUMULATED POINTER-DRAG, NOT POINTER LOCK. The look angle is
//      changed only while a pointer is held down and dragged across the canvas
//      (pointerdown -> pointermove -> pointerup, plus touchmove for mobile).
//      There is NO requestPointerLock(), NO movementX-when-locked guard, and NO
//      pointer-lock polyfill (the BATON.PLSHIM) dependence. This is the exact
//      model crypt-of-the-bone-lord shipped (pa += (clientX - lastX) * sens) and
//      it is the only model that works in the mChatAI+ WKWebView preview, where
//      pointer lock is unavailable.
//   2. EVERYTHING IS DELTA-TIME BASED. Turning, forward/back and strafe all
//      multiply their rate by dt (seconds), so motion is frame-rate independent.
//   3. WALL COLLISION IS AXIS-SEPARATED SWEPT-AABB SLIDE WITH A RADIUS PROBE.
//      The candidate new X is tested (with a +/- radius probe along X)
//      INDEPENDENTLY from the candidate new Y. Whichever axis is clear is
//      committed; the blocked axis is held. The player therefore SLIDES along a
//      wall instead of sticking to it when moving diagonally into it.
//
// PURE 2D / ZERO DEPENDENCIES: no three.js, no WebGL, no imports, no network.
// Offline-safe under file:// and inside WKWebView.
//
// KEY EXPORTS
//   GridCameraController - class. Owns DOM listeners + an optional touch d-pad.
//   createGridCameraController(state?, config?) - convenience factory.
//
// PUBLIC API
//   const gc = new GridCameraController({ px:1.5, py:1.5, angle:0 }, {
//     turnSpeed:2.4, moveSpeed:2.6, strafeSpeed:2.6, radius:0.22, lookSensitivity:0.006
//   });
//   gc.attach(canvas);                 // install drag-look + WASD/arrows + Q/E listeners
//   gc.mountTouchControls(container);  // OPTIONAL on-screen d-pad + turn buttons
//   // in your raycaster loop, with `grid` = tile array and `isSolid(x,y)`:
//   gc.update(dt, grid, isSolid);      // mutates gc.state {px, py, angle}
//   castColumns(gc.state.px, gc.state.py, gc.state.angle, ...);
//   gc.dispose();                      // remove every listener + touch DOM
//
// CONTRACTS
//   - state          : plain { px:Number, py:Number, angle:Number } (radians).
//                      Exposed as gc.state; you may read/write it directly.
//   - input          : plain flag object gc.input { f,b,sl,sr,tl,tr } (1/0).
//   - solidity test  : INJECTED. update(dt, grid, isSolidFn). isSolidFn(x,y) -> bool
//                      receives INTEGER tile coords; return true if that tile blocks
//                      the player. Wire it to raycast.grid-map.solidAt or any caller
//                      callback so the controller is map-format-agnostic. `grid` is
//                      passed through to isSolidFn as the second-style fallback and
//                      is otherwise opaque to this module.
//   - look           : accumulated drag only. NEVER pointer lock.
//   - units          : px/py are in TILES (1.0 == one grid cell); angle in radians;
//                      moveSpeed/turnSpeed are tiles-or-radians PER SECOND.
//
// EXTRACTED FROM (and generalized): crypt-of-the-bone-lord (drag-look model +
// axis-separated radius-probe tryMove) and catacomb-carnage (clean
// forward/strafe-in-heading math). All game-specific content removed.

export class GridCameraController {
  constructor(state = {}, config = {}) {
    // mutable heading state - plain object, caller may read/write
    this.state = {
      px: state.px ?? 1.5,
      py: state.py ?? 1.5,
      angle: state.angle ?? 0,
    };

    // config (all rates are PER SECOND; consumed against dt in update())
    this.config = {
      turnSpeed: config.turnSpeed ?? 2.4,        // radians / s (keyboard turn)
      moveSpeed: config.moveSpeed ?? 2.6,        // tiles / s (forward/back)
      strafeSpeed: config.strafeSpeed ?? (config.moveSpeed ?? 2.6), // tiles / s
      radius: config.radius ?? 0.22,             // collision probe half-width (tiles)
      lookSensitivity: config.lookSensitivity ?? 0.006, // radians per dragged px
    };

    // input flags - 1 while held, 0 otherwise. Exposed for HUD / debugging.
    this.input = { f: 0, b: 0, sl: 0, sr: 0, tl: 0, tr: 0 };

    // whether update() applies movement at all (caller can pause the mover)
    this.enabled = true;

    // internal
    this._canvas = null;
    this._listeners = [];        // [target, type, fn, opts] for clean dispose
    this._touchEls = [];         // mounted touch DOM to remove on dispose
    this._dragging = false;
    this._dragId = null;         // pointerId / touch identifier owning the drag
    this._lastX = 0;

    // key -> input flag. WASD + arrows move; Left/Right arrows OR Q/E turn.
    // (Both schemes are offered so a game can pick either binding feel.)
    this._keymap = {
      KeyW: 'f', ArrowUp: 'f',
      KeyS: 'b', ArrowDown: 'b',
      KeyA: 'sl', KeyD: 'sr',     // A/D strafe (catacomb-carnage feel)
      ArrowLeft: 'tl', ArrowRight: 'tr',
      KeyQ: 'tl', KeyE: 'tr',     // Q/E turn (crypt-of-the-bone-lord feel)
    };

    // bound handlers (so add/remove reference the same function objects)
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onPointerUp = this._handlePointerUp.bind(this);
    this._onTouchStart = this._handleTouchStart.bind(this);
    this._onTouchMove = this._handleTouchMove.bind(this);
    this._onTouchEnd = this._handleTouchEnd.bind(this);
  }

  // --- listener bookkeeping -------------------------------------------------
  _add(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this._listeners.push([target, type, fn, opts]);
  }

  _hasTouch() {
    return (typeof window !== 'undefined') &&
      (('ontouchstart' in window) || (navigator && navigator.maxTouchPoints > 0));
  }

  // --- attach: install all listeners ---------------------------------------
  // attach(canvas) - drag-look on the canvas, WASD/arrows + Q/E on the window.
  attach(canvas) {
    if (this._canvas) this._detachListeners(); // idempotent re-attach
    this._canvas = canvas || (typeof document !== 'undefined' ? document.body : null);

    // keyboard: movement + keyboard turn flags
    this._add(window, 'keydown', this._onKeyDown);
    this._add(window, 'keyup', this._onKeyUp);

    if (this._canvas) {
      // ACCUMULATED DRAG-LOOK. Pointer events cover mouse + pen + touch on most
      // browsers; we also bind raw touch* for WKWebView reliability. NEVER call
      // requestPointerLock and NEVER gate on movementX/pointer-lock state.
      this._add(this._canvas, 'pointerdown', this._onPointerDown);
      this._add(window, 'pointermove', this._onPointerMove);
      this._add(window, 'pointerup', this._onPointerUp);
      this._add(window, 'pointercancel', this._onPointerUp);

      // explicit touch fallback (some WKWebView builds drop synthetic pointer*)
      this._add(this._canvas, 'touchstart', this._onTouchStart, { passive: false });
      this._add(window, 'touchmove', this._onTouchMove, { passive: false });
      this._add(window, 'touchend', this._onTouchEnd);
      this._add(window, 'touchcancel', this._onTouchEnd);

      this._add(this._canvas, 'contextmenu', (e) => e.preventDefault());
    }
    return this;
  }

  // --- drag-look handlers ---------------------------------------------------
  // Generalized from crypt-of-the-bone-lord lines ~180-183:
  //   dragging=true; lastX=e.clientX;  ...  pa += (e.clientX - lastX) * 0.006
  _beginDrag(x, id) {
    this._dragging = true;
    this._dragId = id;
    this._lastX = x;
  }
  _dragLook(x, id) {
    if (!this._dragging || id !== this._dragId) return;
    this.state.angle += (x - this._lastX) * this.config.lookSensitivity;
    this._lastX = x;
  }
  _endDrag(id) {
    if (id !== this._dragId) return;
    this._dragging = false;
    this._dragId = null;
  }

  _handlePointerDown(e) {
    this._beginDrag(e.clientX, e.pointerId != null ? e.pointerId : 'mouse');
  }
  _handlePointerMove(e) {
    this._dragLook(e.clientX, e.pointerId != null ? e.pointerId : 'mouse');
  }
  _handlePointerUp(e) {
    this._endDrag(e.pointerId != null ? e.pointerId : 'mouse');
  }

  _handleTouchStart(e) {
    if (this._dragging) return; // pointer events already own the drag
    const t = e.changedTouches[0];
    if (!t) return;
    this._beginDrag(t.clientX, 't' + t.identifier);
    e.preventDefault();
  }
  _handleTouchMove(e) {
    for (const t of e.changedTouches) {
      if (('t' + t.identifier) === this._dragId) { this._dragLook(t.clientX, this._dragId); e.preventDefault(); }
    }
  }
  _handleTouchEnd(e) {
    for (const t of e.changedTouches) this._endDrag('t' + t.identifier);
  }

  // --- keyboard handlers ----------------------------------------------------
  _handleKeyDown(e) {
    const flag = this._keymap[e.code];
    if (flag !== undefined) { e.preventDefault(); this.input[flag] = 1; }
  }
  _handleKeyUp(e) {
    const flag = this._keymap[e.code];
    if (flag !== undefined) { e.preventDefault(); this.input[flag] = 0; }
  }

  // --- per-frame update -----------------------------------------------------
  // update(dt, grid, isSolidFn) -> mutates {px, py, angle}.
  //   dt        : seconds since last frame.
  //   grid      : opaque tile array (passed through to isSolidFn).
  //   isSolidFn : (tileX, tileY) -> bool. INTEGER tile coords. Required for
  //               collision; if omitted, the player moves with no walls.
  update(dt, grid, isSolidFn) {
    if (!this.enabled || !(dt > 0)) return this.state;
    const c = this.config, inp = this.input, s = this.state;

    // 1) keyboard turn (delta-time). crypt: turn = 2.4*dt; tl: pa-=turn; tr: pa+=turn
    const turn = c.turnSpeed * dt;
    if (inp.tl) s.angle -= turn;
    if (inp.tr) s.angle += turn;

    // 2) build a movement vector in HEADING SPACE (catacomb-carnage math):
    //    forward = (cos a, sin a); strafe-left = (sin a, -cos a).
    const dirx = Math.cos(s.angle), diry = Math.sin(s.angle);
    let mvx = 0, mvy = 0;
    if (inp.f) { mvx += dirx; mvy += diry; }
    if (inp.b) { mvx -= dirx; mvy -= diry; }
    if (inp.sl) { mvx += diry; mvy -= dirx; }     // strafe left
    if (inp.sr) { mvx -= diry; mvy += dirx; }     // strafe right

    const len = Math.hypot(mvx, mvy);
    if (len > 0) {
      // normalize so diagonals are not faster; scale by per-second speed * dt.
      // forward/back vs strafe can have distinct speeds; pick the dominant
      // intent for the rate (forward/back wins when both pressed).
      const moving = (inp.f || inp.b);
      const rate = (moving ? c.moveSpeed : c.strafeSpeed) * dt;
      const stepx = (mvx / len) * rate;
      const stepy = (mvy / len) * rate;
      this._tryMove(s.px + stepx, s.py + stepy, isSolidFn, grid);
    }
    return this.state;
  }

  // SIGNATURE axis-separated swept-AABB slide with a radius probe.
  // Generalized from crypt-of-the-bone-lord tryMove():
  //   test new X with a +/- radius probe at the CURRENT y, commit if clear;
  //   then test new Y with a +/- radius probe at the (now possibly updated) x,
  //   commit if clear. Because the axes are tested INDEPENDENTLY, a diagonal
  //   move into a wall keeps the unblocked axis -> the player slides.
  _tryMove(nx, ny, isSolidFn, grid) {
    const r = this.config.radius, s = this.state;
    if (typeof isSolidFn !== 'function') { s.px = nx; s.py = ny; return; }
    const solid = (x, y) => !!isSolidFn(Math.floor(x), Math.floor(y), grid);
    // X axis: probe both sides of the candidate X at the current Y.
    if (!solid(nx + r, s.py) && !solid(nx - r, s.py)) s.px = nx;
    // Y axis: probe both sides of the candidate Y at the (updated) X.
    if (!solid(s.px, ny + r) && !solid(s.px, ny - r)) s.py = ny;
  }

  // --- optional on-screen touch d-pad + turn buttons -----------------------
  // mountTouchControls(container) - creates hold-to-set-flag buttons matching
  // crypt's pad (forward/back, strafe L/R, turn L/R). Each button sets/clears an
  // input flag while held. Returns the created root element. Call dispose() (or
  // unmountTouchControls()) to remove.
  mountTouchControls(container, opts = {}) {
    const host = container || (typeof document !== 'undefined' ? document.body : null);
    if (!host) return null;
    if (!document.getElementById('mchatai-gridcam-touch-style')) {
      const st = document.createElement('style');
      st.id = 'mchatai-gridcam-touch-style';
      st.textContent =
        '.gcam-pad{position:fixed;inset:0;pointer-events:none;z-index:60}' +
        '.gcam-btn{position:absolute;pointer-events:auto;display:flex;align-items:center;' +
        'justify-content:center;width:60px;height:60px;border-radius:50%;' +
        'background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.28);' +
        'color:#fff;font:700 22px system-ui;-webkit-user-select:none;user-select:none;' +
        'touch-action:none}' +
        '.gcam-btn:active{background:rgba(255,255,255,.30);transform:scale(.94)}' +
        '.gcam-bF{left:84px;bottom:150px}.gcam-bB{left:84px;bottom:24px}' +
        '.gcam-bSL{left:18px;bottom:87px}.gcam-bSR{left:150px;bottom:87px}' +
        '.gcam-bTL{right:150px;bottom:46px}.gcam-bTR{right:84px;bottom:46px}';
      document.head.appendChild(st);
    }
    const pad = document.createElement('div');
    pad.className = 'gcam-pad';
    // [class suffix, glyph (HTML entity, ASCII source), input flag].
    // Entities (not raw Unicode) keep this file pure-ASCII while still rendering
    // arrows/chevrons, mirroring crypt-of-the-bone-lord's pad (&#9650; etc).
    const defs = opts.buttons || [
      ['bF', '&#9650;', 'f'],    // up triangle - forward
      ['bB', '&#9660;', 'b'],    // down triangle - back
      ['bSL', '&#10094;', 'sl'], // left chevron - strafe left
      ['bSR', '&#10095;', 'sr'], // right chevron - strafe right
      ['bTL', '&#8634;', 'tl'],  // ccw arrow - turn left
      ['bTR', '&#8635;', 'tr'],  // cw arrow - turn right
    ];
    for (const [cls, glyph, flag] of defs) {
      const b = document.createElement('div');
      b.className = 'gcam-btn gcam-' + cls;
      b.innerHTML = glyph;
      const set = (e) => { e.preventDefault(); this.input[flag] = 1; };
      const clear = (e) => { if (e) e.preventDefault(); this.input[flag] = 0; };
      this._add(b, 'pointerdown', set);
      this._add(b, 'pointerup', clear);
      this._add(b, 'pointerleave', clear);
      this._add(b, 'pointercancel', clear);
      pad.appendChild(b);
    }
    host.appendChild(pad);
    this._touchEls.push(pad);
    return pad;
  }

  unmountTouchControls() {
    for (const el of this._touchEls) { if (el && el.remove) el.remove(); }
    this._touchEls = [];
  }

  // remove only the wired event listeners (keeps state)
  _detachListeners() {
    for (const [target, type, fn, opts] of this._listeners) {
      target.removeEventListener(type, fn, opts);
    }
    this._listeners = [];
    this._dragging = false;
    this._dragId = null;
    // clear held inputs so a re-attach starts clean
    this.input.f = this.input.b = this.input.sl = this.input.sr = this.input.tl = this.input.tr = 0;
  }

  // --- dispose: remove all listeners + touch DOM ---------------------------
  dispose() {
    this._detachListeners();
    this.unmountTouchControls();
    this._canvas = null;
  }
}

// Convenience factory mirroring the class constructor.
export function createGridCameraController(state, config) {
  return new GridCameraController(state, config);
}

export default GridCameraController;

// END mChatAI Web Component: raycast.player-controller
