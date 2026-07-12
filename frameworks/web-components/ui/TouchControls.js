// ui.touch-controls -- the CANONICAL on-screen mobile control surface for
// mini-app games: a d-pad plus configurable action buttons in ONE container
// carrying the platform marker data-mchatai="touch-controls".
//
// THE CONTRACT (why this component exists):
//   1. The container self-hides on desktop pointers (no coarse pointer, no
//      touch) -- on-screen controls are clutter when a keyboard is present.
//   2. The container hides while a NATIVE controller overlay is up: the
//      mChatAI iOS app dispatches  window CustomEvent "mchatai:virtualgamepad"
//      with detail {active:true|false} when the user summons/dismisses its
//      built-in D-Pad. Double control surfaces are worse than none.
//   3. Input is delivered as synthesized KeyboardEvents (keydown/keyup with
//      keyCode/which patched), so the game's EXISTING keyboard handlers work
//      unchanged -- which also means the game stays fully playable when this
//      surface is hidden (desktop keyboard, native D-Pad).
// Wrap ANY hand-rolled control surface in the same marker to inherit the
// platform hide/show behavior (wisdom mob-013); this component is the
// ready-made version.
//
// USAGE
//   import { TouchControls } from "./TouchControls.js";
//   const controls = TouchControls.mount(document.body, {
//     dpad: ["up", "down", "left", "right"],          // omit to skip the d-pad
//     actions: [{ label: "HOP", key: " " }],           // right-side buttons
//     onInput: (key, isDown) => {}                     // optional, fires too
//   });
//   controls.destroy();                                // remove + unlisten
//
// Every axis your game logic reads MUST have a control here (a runner that
// only steers is boring -- give it its forward button). Keys use standard
// KeyboardEvent.key values: "ArrowUp", "ArrowDown", "ArrowLeft",
// "ArrowRight", " ", "Enter", "w", "a", "s", "d", ...

/* BEGIN mChatAI Web Component: ui.touch-controls */
export const TouchControls = {
  mount(host, { dpad, actions, target, onInput, bottom } = {}) {
    if (!host) host = document.body;
    const existing = host.querySelector('[data-mchatai="touch-controls"]');
    if (existing) return existing.__mchataiTouchControls || null;

    const KEY_CODES = {
      ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39,
      " ": 32, Enter: 13, Escape: 27, Shift: 16,
      w: 87, a: 65, s: 83, d: 68
    };
    const dispatchTarget = target || document;
    function fireKey(key, isDown) {
      const type = isDown ? "keydown" : "keyup";
      const ev = new KeyboardEvent(type, { key: key, bubbles: true, cancelable: true });
      const code = KEY_CODES[key] || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
      try {
        Object.defineProperty(ev, "keyCode", { get: () => code });
        Object.defineProperty(ev, "which", { get: () => code });
      } catch (e) { /* older engines: key-only games still work */ }
      dispatchTarget.dispatchEvent(ev);
      if (onInput) onInput(key, isDown);
    }

    const wrap = document.createElement("div");
    wrap.setAttribute("data-mchatai", "touch-controls");
    wrap.style.cssText = [
      "position:fixed", "left:0", "right:0",
      "bottom:" + (bottom || "calc(12px + env(safe-area-inset-bottom, 0px))"),
      "display:flex", "justify-content:space-between", "align-items:flex-end",
      "padding:0 calc(14px + env(safe-area-inset-left, 0px)) 0 calc(14px + env(safe-area-inset-right, 0px))",
      "z-index:9998", "pointer-events:none", "user-select:none",
      "-webkit-user-select:none", "touch-action:none"
    ].join(";");

    function makeButton(label, key, size) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.setAttribute("aria-label", key === " " ? "Space" : key);
      b.style.cssText = [
        "pointer-events:auto", "touch-action:none",
        "width:" + size, "height:" + size, "border-radius:16px",
        "border:2px solid rgba(15,23,42,0.8)",
        "background:var(--mchat-surface, rgba(255,255,255,0.35))",
        "color:var(--mchat-text, #fff)",
        "font:600 15px/1 system-ui,sans-serif",
        "display:flex", "align-items:center", "justify-content:center",
        "box-shadow:0 2px 5px rgba(0,0,0,0.25)"
      ].join(";");
      let down = false;
      const press = (e) => { e.preventDefault(); if (down) return; down = true; fireKey(key, true); };
      const release = (e) => { if (e) e.preventDefault(); if (!down) return; down = false; fireKey(key, false); };
      b.addEventListener("pointerdown", press);
      b.addEventListener("pointerup", release);
      b.addEventListener("pointercancel", release);
      b.addEventListener("pointerleave", release);
      b.addEventListener("contextmenu", (e) => e.preventDefault());
      return b;
    }

    // ︎ forces TEXT presentation -- iOS renders bare geometric glyphs
    // as emoji that ignore CSS color (gotcha: emoji-presentation glyphs).
    const DPAD_GLYPHS = {
      up: "▲︎", down: "▼︎",
      left: "◀︎", right: "▶︎"
    };
    const DPAD_KEYS = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };
    const dirs = dpad === undefined ? ["up", "down", "left", "right"] : (dpad || []);
    if (dirs.length) {
      const grid = document.createElement("div");
      grid.style.cssText = "display:grid;grid-template-columns:repeat(3,52px);grid-template-rows:repeat(3,52px);gap:4px;pointer-events:none";
      const cell = { up: 2, left: 4, right: 6, down: 8 };
      const cells = new Array(9).fill(null);
      dirs.forEach((d) => { if (cell[d] !== undefined) cells[cell[d] - 1] = d; });
      cells.forEach((d) => {
        if (!d) { grid.appendChild(document.createElement("span")); return; }
        grid.appendChild(makeButton(DPAD_GLYPHS[d], DPAD_KEYS[d], "52px"));
      });
      wrap.appendChild(grid);
    }
    const acts = actions || [];
    if (acts.length) {
      const col = document.createElement("div");
      col.style.cssText = "display:flex;flex-direction:column;gap:10px;pointer-events:none";
      acts.forEach((a) => col.appendChild(makeButton(a.label || a.key, a.key, a.size || "64px")));
      wrap.appendChild(col);
    }

    // Visibility contract: show only for coarse-pointer/touch devices, and
    // never while the native controller overlay is active.
    let nativeGamepad = false;
    function isTouchy() {
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
      return "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;
    }
    function applyVisibility() {
      wrap.style.display = (nativeGamepad || !isTouchy()) ? "none" : "flex";
    }
    const onGamepad = (e) => { nativeGamepad = !!(e && e.detail && e.detail.active); applyVisibility(); };
    window.addEventListener("mchatai:virtualgamepad", onGamepad);
    let mq = null;
    if (window.matchMedia) {
      mq = window.matchMedia("(pointer: coarse)");
      if (mq.addEventListener) mq.addEventListener("change", applyVisibility);
    }
    applyVisibility();

    host.appendChild(wrap);
    const api = {
      element: wrap,
      setVisible(v) { wrap.style.display = v ? "flex" : "none"; },
      destroy() {
        window.removeEventListener("mchatai:virtualgamepad", onGamepad);
        if (mq && mq.removeEventListener) mq.removeEventListener("change", applyVisibility);
        wrap.remove();
      }
    };
    wrap.__mchataiTouchControls = api;
    return api;
  }
};
/* END mChatAI Web Component: ui.touch-controls */
