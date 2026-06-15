// BEGIN mChatAI Web Component: controls.virtual-joystick-3d
//
// VirtualJoystick3D - on-screen analog joystick for three.js 3D games.
//
// Populates a single unified input-state object shared by every control source
// in the web-components-3d kit:
//
//   { move: { x, y }, look: { x, y }, actionA: false, actionB: false }
//
//   move.x  -1 (left)  .. +1 (right)
//   move.y  -1 (back)   .. +1 (forward)   (screen-up = forward)
//   look.x / look.y     reserved for camera-look sources (mouse, second stick)
//   actionA / actionB   boolean buttons (jump / fire / brake etc.)
//
// Genre logic NEVER branches on device. It reads state.move / state.actionA and
// this module fills them from pointer (touch + mouse drag on the on-screen pad)
// OR keyboard (WASD / arrows / space / shift) as a fallback - both write the same
// fields, so a game is playable on phone and desktop with identical code.
//
// All values are ASCII. No external imports, no network, offline-safe under file://.

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

export class VirtualJoystick3D {
  // options:
  //   state        - shared input-state object to populate (one is created if omitted)
  //   mount        - DOM element to attach the joystick to (default document.body)
  //   side         - "left" | "right" placement of the pad (default "left")
  //   size         - base diameter in CSS px (default 120)
  //   maxDistance  - knob travel radius in px (default size * 0.4)
  //   keyboard     - enable WASD/arrow fallback (default true)
  //   pointer      - enable on-screen pad (default true)
  //   visible      - show the pad UI (default true; set false for keyboard-only)
  constructor(options = {}) {
    this.state = options.state || {
      move: { x: 0, y: 0 },
      look: { x: 0, y: 0 },
      actionA: false,
      actionB: false,
    };
    // Defensive: guarantee the nested shape exists even if a caller passed a bare object.
    if (!this.state.move) this.state.move = { x: 0, y: 0 };
    if (!this.state.look) this.state.look = { x: 0, y: 0 };
    if (typeof this.state.actionA !== "boolean") this.state.actionA = false;
    if (typeof this.state.actionB !== "boolean") this.state.actionB = false;

    this.mount = options.mount || (typeof document !== "undefined" ? document.body : null);
    this.side = options.side === "right" ? "right" : "left";
    this.size = Number.isFinite(options.size) ? Math.max(60, options.size) : 120;
    this.maxDistance = Number.isFinite(options.maxDistance)
      ? options.maxDistance
      : this.size * 0.4;
    this.enableKeyboard = options.keyboard !== false;
    this.enablePointer = options.pointer !== false;
    this.visible = options.visible !== false;

    // Pointer drag bookkeeping.
    this._activePointerId = null;
    this._originX = 0;
    this._originY = 0;
    this._padMove = { x: 0, y: 0 };

    // Keyboard bookkeeping.
    this._keys = Object.create(null);

    // Bound handlers so we can remove them on dispose.
    this._onPointerDown = (e) => this._handlePointerDown(e);
    this._onPointerMove = (e) => this._handlePointerMove(e);
    this._onPointerUp = (e) => this._handlePointerUp(e);
    this._onKeyDown = (e) => this._handleKey(e, true);
    this._onKeyUp = (e) => this._handleKey(e, false);

    this.base = null;
    this.knob = null;
    this._disposed = false;

    if (this.enablePointer && this.visible && this.mount) {
      this._buildPad();
    }
    this._attach();
  }

  // -- public API -----------------------------------------------------------

  // Returns the shared input-state object. Read state.move / state.actionA in update(dt).
  getState() {
    return this.state;
  }

  // Recompute state.move from current pointer + keyboard input. Call once per frame
  // BEFORE consuming the state in game logic. Pointer takes precedence when active;
  // otherwise keyboard fills move. actionA/actionB are edge-set by keys and may be
  // augmented by external button components (one-button-action, fire-button).
  update() {
    if (this._disposed) return this.state;

    let mx = 0;
    let my = 0;

    const pointerActive = this._activePointerId !== null;
    if (pointerActive) {
      mx = this._padMove.x;
      my = this._padMove.y;
    } else if (this.enableKeyboard) {
      const k = this._keys;
      if (k["a"] || k["arrowleft"]) mx -= 1;
      if (k["d"] || k["arrowright"]) mx += 1;
      // Screen-up = forward = +y in our convention.
      if (k["w"] || k["arrowup"]) my += 1;
      if (k["s"] || k["arrowdown"]) my -= 1;
      // Normalize diagonal so keyboard and stick have the same max magnitude.
      const mag = Math.hypot(mx, my);
      if (mag > 1) {
        mx /= mag;
        my /= mag;
      }
    }

    this.state.move.x = clamp(mx, -1, 1);
    this.state.move.y = clamp(my, -1, 1);

    // Keyboard action keys are level-set here; pointer buttons (other components)
    // OR into these between frames and are cleared by their own update.
    if (this.enableKeyboard) {
      const k = this._keys;
      if (k[" "] || k["space"] || k["enter"]) this.state.actionA = true;
      if (k["shift"] || k["e"] || k["f"]) this.state.actionB = true;
    }

    return this.state;
  }

  // Free DOM nodes and detach all listeners. Idempotent.
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._detach();
    if (this.base && this.base.parentNode) {
      this.base.parentNode.removeChild(this.base);
    }
    this.base = null;
    this.knob = null;
    this._keys = Object.create(null);
    this._padMove.x = 0;
    this._padMove.y = 0;
    this._activePointerId = null;
  }

  // -- internals ------------------------------------------------------------

  _buildPad() {
    const base = document.createElement("div");
    base.setAttribute("data-mchatai-joystick", "3d");
    const s = this.size;
    base.style.cssText = [
      "position:fixed",
      "bottom:24px",
      this.side === "right" ? "right:24px" : "left:24px",
      "width:" + s + "px",
      "height:" + s + "px",
      "border-radius:50%",
      "background:rgba(255,255,255,0.12)",
      "border:2px solid rgba(255,255,255,0.35)",
      "touch-action:none",
      "z-index:50",
      "box-sizing:border-box",
      "user-select:none",
      "-webkit-user-select:none",
    ].join(";");

    const knob = document.createElement("div");
    const ks = Math.round(s * 0.45);
    knob.style.cssText = [
      "position:absolute",
      "left:50%",
      "top:50%",
      "width:" + ks + "px",
      "height:" + ks + "px",
      "margin-left:" + (-ks / 2) + "px",
      "margin-top:" + (-ks / 2) + "px",
      "border-radius:50%",
      "background:rgba(255,255,255,0.55)",
      "border:2px solid rgba(255,255,255,0.8)",
      "pointer-events:none",
      "transition:transform 0.05s linear",
      "box-sizing:border-box",
    ].join(";");

    base.appendChild(knob);
    this.mount.appendChild(base);
    this.base = base;
    this.knob = knob;
  }

  _attach() {
    if (typeof window === "undefined") return;

    if (this.enablePointer && this.base) {
      this.base.addEventListener("pointerdown", this._onPointerDown);
      window.addEventListener("pointermove", this._onPointerMove);
      window.addEventListener("pointerup", this._onPointerUp);
      window.addEventListener("pointercancel", this._onPointerUp);
    }

    if (this.enableKeyboard) {
      window.addEventListener("keydown", this._onKeyDown);
      window.addEventListener("keyup", this._onKeyUp);
    }
  }

  _detach() {
    if (typeof window === "undefined") return;

    if (this.base) {
      this.base.removeEventListener("pointerdown", this._onPointerDown);
    }
    window.removeEventListener("pointermove", this._onPointerMove);
    window.removeEventListener("pointerup", this._onPointerUp);
    window.removeEventListener("pointercancel", this._onPointerUp);
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
  }

  _handlePointerDown(e) {
    if (this._activePointerId !== null) return;
    this._activePointerId = e.pointerId;
    const rect = this.base.getBoundingClientRect();
    this._originX = rect.left + rect.width / 2;
    this._originY = rect.top + rect.height / 2;
    this._updateFromPointer(e.clientX, e.clientY);
    if (typeof this.base.setPointerCapture === "function") {
      try {
        this.base.setPointerCapture(e.pointerId);
      } catch (err) {
        // setPointerCapture can throw if the pointer is already gone; ignore.
      }
    }
    e.preventDefault();
  }

  _handlePointerMove(e) {
    if (e.pointerId !== this._activePointerId) return;
    this._updateFromPointer(e.clientX, e.clientY);
    e.preventDefault();
  }

  _handlePointerUp(e) {
    if (e.pointerId !== this._activePointerId) return;
    this._activePointerId = null;
    this._padMove.x = 0;
    this._padMove.y = 0;
    if (this.knob) {
      this.knob.style.transform = "translate(0px, 0px)";
    }
  }

  _updateFromPointer(clientX, clientY) {
    let dx = clientX - this._originX;
    let dy = clientY - this._originY;
    const dist = Math.hypot(dx, dy);
    const max = this.maxDistance;
    if (dist > max && dist > 0) {
      dx = (dx / dist) * max;
      dy = (dy / dist) * max;
    }
    // Normalize to -1..1. Screen y grows downward, but forward is screen-up,
    // so invert dy: dragging up -> move.y = +1 (forward).
    this._padMove.x = clamp(dx / max, -1, 1);
    this._padMove.y = clamp(-dy / max, -1, 1);
    if (this.knob) {
      this.knob.style.transform = "translate(" + dx.toFixed(1) + "px, " + dy.toFixed(1) + "px)";
    }
  }

  _handleKey(e, down) {
    if (!this.enableKeyboard) return;
    let key = (e.key || "").toLowerCase();
    if (key === "spacebar") key = " ";
    // Track both the raw key and a "space" alias for readability.
    this._keys[key] = down;
    if (key === " ") this._keys["space"] = down;
    // Prevent the page from scrolling on arrows / space during play.
    if (
      key === " " ||
      key === "arrowup" ||
      key === "arrowdown" ||
      key === "arrowleft" ||
      key === "arrowright"
    ) {
      e.preventDefault();
    }
  }
}

export default VirtualJoystick3D;
// END mChatAI Web Component: controls.virtual-joystick-3d
