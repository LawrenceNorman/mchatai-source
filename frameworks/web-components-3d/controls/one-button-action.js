// BEGIN mChatAI Web Component: controls.one-button-action
//
// OneButtonAction - a single-action input for one-button 3D games (flappy-style
// flyer, endless jumper, tap-to-hop runner, tap-to-flip, one-button shooter).
//
// Feeds the SAME unified input-state object as every other web-components-3d
// control source:
//
//   { move: { x, y }, look: { x, y }, actionA: false, actionB: false }
//
// This module owns actionA (the primary button). Any input fires it:
//   - tap / click anywhere on the mount surface (touch + mouse)
//   - Space bar / Enter / ArrowUp on the keyboard
//   - the optional on-screen button it renders
//
// It exposes BOTH a held flag and an edge (pressed-this-frame) flag, because
// one-button games usually want the rising edge (one hop per tap), not a held
// state. Read state.actionA for held; call consumePress() for a single edge.
//
// ASCII only. No imports, no network, offline-safe under file://.

export class OneButtonAction {
  // options:
  //   state     - shared input-state object to populate (created if omitted)
  //   mount     - DOM element the tap surface listens on (default document.body)
  //   keyboard  - enable Space/Enter/ArrowUp fallback (default true)
  //   pointer   - enable tap-anywhere on the mount (default true)
  //   button    - render an on-screen circular button (default false; tap-anywhere
  //               is usually enough, but a visible button helps discoverability)
  //   label     - text on the on-screen button (default "TAP")
  //   side      - "left" | "right" | "center" placement of the button (default "right")
  //   target    - which state field to drive: "actionA" | "actionB" (default "actionA")
  constructor(options = {}) {
    this.state = options.state || {
      move: { x: 0, y: 0 },
      look: { x: 0, y: 0 },
      actionA: false,
      actionB: false,
    };
    if (!this.state.move) this.state.move = { x: 0, y: 0 };
    if (!this.state.look) this.state.look = { x: 0, y: 0 };
    if (typeof this.state.actionA !== "boolean") this.state.actionA = false;
    if (typeof this.state.actionB !== "boolean") this.state.actionB = false;

    this.field = options.target === "actionB" ? "actionB" : "actionA";
    this.mount = options.mount || (typeof document !== "undefined" ? document.body : null);
    this.enableKeyboard = options.keyboard !== false;
    this.enablePointer = options.pointer !== false;
    this.showButton = options.button === true;
    this.label = typeof options.label === "string" ? options.label : "TAP";
    this.side = ["left", "right", "center"].indexOf(options.side) >= 0 ? options.side : "right";

    // held = button currently down; _pressEdge = pressed since last consumePress().
    this._held = false;
    this._pressEdge = false;
    // Track active pointer ids so multi-touch release is correct.
    this._activePointers = new Set();
    // Track which keys are holding the action so keyup from one key does not
    // release it while another is still down.
    this._heldKeys = new Set();

    this._onPointerDown = (e) => this._press(e);
    this._onPointerUp = (e) => this._release(e);
    this._onKeyDown = (e) => this._handleKey(e, true);
    this._onKeyUp = (e) => this._handleKey(e, false);

    this.button = null;
    this._disposed = false;

    if (this.showButton && this.mount) {
      this._buildButton();
    }
    this._attach();
  }

  // -- public API -----------------------------------------------------------

  getState() {
    return this.state;
  }

  // True while the action is held down.
  get held() {
    return this._held;
  }

  // Returns true exactly once per discrete press, then clears the edge.
  // Use this for one-tap-one-action games (one hop / flap / flip per tap).
  consumePress() {
    if (this._pressEdge) {
      this._pressEdge = false;
      return true;
    }
    return false;
  }

  // Sync the shared state field with the held flag. Call once per frame.
  // Leaves the edge intact so consumePress() can be read separately.
  update() {
    if (this._disposed) return this.state;
    this.state[this.field] = this._held;
    return this.state;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._detach();
    if (this.button && this.button.parentNode) {
      this.button.parentNode.removeChild(this.button);
    }
    this.button = null;
    this._activePointers.clear();
    this._heldKeys.clear();
    this._held = false;
    this._pressEdge = false;
  }

  // -- internals ------------------------------------------------------------

  _buildButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("data-mchatai-onebutton", this.field);
    btn.textContent = this.label;
    let horiz;
    if (this.side === "left") horiz = "left:24px";
    else if (this.side === "center") horiz = "left:50%;margin-left:-44px";
    else horiz = "right:24px";
    btn.style.cssText = [
      "position:fixed",
      "bottom:32px",
      horiz,
      "width:88px",
      "height:88px",
      "border-radius:50%",
      "background:rgba(255,255,255,0.18)",
      "border:2px solid rgba(255,255,255,0.5)",
      "color:#fff",
      "font:700 16px/1 system-ui,sans-serif",
      "letter-spacing:1px",
      "touch-action:none",
      "z-index:50",
      "cursor:pointer",
      "user-select:none",
      "-webkit-user-select:none",
      "box-sizing:border-box",
    ].join(";");
    this.mount.appendChild(btn);
    this.button = btn;
  }

  _attach() {
    if (typeof window === "undefined") return;

    if (this.enablePointer) {
      // Listen on the dedicated button if present, otherwise tap-anywhere on mount.
      const surface = this.button || this.mount;
      if (surface) {
        surface.addEventListener("pointerdown", this._onPointerDown);
      }
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
    const surface = this.button || this.mount;
    if (surface) {
      surface.removeEventListener("pointerdown", this._onPointerDown);
    }
    window.removeEventListener("pointerup", this._onPointerUp);
    window.removeEventListener("pointercancel", this._onPointerUp);
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
  }

  _press(e) {
    if (e && typeof e.pointerId !== "undefined") {
      this._activePointers.add(e.pointerId);
    }
    this._setHeld(true);
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    }
  }

  _release(e) {
    if (e && typeof e.pointerId !== "undefined") {
      this._activePointers.delete(e.pointerId);
    }
    // Only release when no pointer and no key still holds the action.
    if (this._activePointers.size === 0 && this._heldKeys.size === 0) {
      this._setHeld(false);
    }
  }

  _handleKey(e, down) {
    const key = (e.key || "").toLowerCase();
    const isActionKey =
      key === " " ||
      key === "spacebar" ||
      key === "space" ||
      key === "enter" ||
      key === "arrowup";
    if (!isActionKey) return;

    if (down) {
      // Ignore auto-repeat so a held key does not machine-gun press edges.
      if (e.repeat) {
        e.preventDefault();
        return;
      }
      this._heldKeys.add(key);
      this._setHeld(true);
    } else {
      this._heldKeys.delete(key);
      if (this._activePointers.size === 0 && this._heldKeys.size === 0) {
        this._setHeld(false);
      }
    }
    e.preventDefault();
  }

  _setHeld(down) {
    if (down && !this._held) {
      // Rising edge: record a press for consumePress().
      this._pressEdge = true;
    }
    this._held = down;
  }
}

export default OneButtonAction;
// END mChatAI Web Component: controls.one-button-action
