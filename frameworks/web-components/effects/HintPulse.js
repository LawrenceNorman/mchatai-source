// HintPulse — idle-aware hint glow for tile games (match-3, sudoku, mahjong,
// solitaire, any swap/select-puzzle). After IDLE_MS of player inactivity,
// surface a hint by toggling the `.hint` class on a small set of cell
// elements. Cancel on next interaction. Manual `.now()` triggers an immediate
// hint that auto-fades after `holdMs`.
//
// Wisdom rule: game-idle-hint-pulse (board-games.json) — applies to any tile
// puzzle where there's a discoverable next-move and the player gets stuck.
//
// Why a Lego: every tile puzzle reinvents this and gets 1-3 of the corner
// cases wrong (forgetting to cancel on tap, leaking timers across game-over,
// flashing on every render). One audited helper avoids that.
//
// Usage:
//   import { HintPulse } from "../../effects/HintPulse.js";
//   const hints = new HintPulse({
//     boardEl: document.getElementById("board"),
//     findHint: () => game.findAnyValidSwap(),  // returns [{row,col},{row,col}] | null
//     idleMs: 6000,                              // optional, default 6000
//     holdMs: 2400,                              // optional, hint visible duration on .now()
//     selectorFor: ({row,col}) => `[data-row="${row}"][data-col="${col}"]`
//   });
//   hints.schedule();   // start the idle countdown — call after each successful move
//   hints.cancel();     // user moved, abort countdown
//   hints.now();        // explicit hint button
//   hints.dispose();    // game over / unmount
//
// CSS: call `HintPulse.injectCss()` once before constructing instances and
// the default `.hint` keyframes will be available; or override `hintClass`
// in the constructor and supply your own.

const HINT_PULSE_CSS = `
@keyframes hintPulse {
  0%, 100% {
    transform: scale(1);
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.5));
  }
  50% {
    transform: scale(1.12);
    filter: drop-shadow(0 0 10px #fff) drop-shadow(0 0 16px #ffe066);
  }
}
.hint {
  animation: hintPulse 1.1s ease-in-out infinite;
}
`;

let _hint_pulseInjected = false;

export class HintPulse {
  static css = CSS;

  /** Inject default .hint keyframes once. Idempotent. */
  static injectCss(doc = document) {
    if (_hint_pulseInjected) return;
    const style = doc.createElement("style");
    style.dataset.lego = "HintPulse";
    style.textContent = HINT_PULSE_CSS;
    doc.head.appendChild(style);
    _hint_pulseInjected = true;
  }

  constructor({ boardEl, findHint, idleMs = 6000, holdMs = 2400, selectorFor, hintClass = "hint" } = {}) {
    if (typeof findHint !== "function") {
      throw new Error("HintPulse: `findHint` callback is required");
    }
    this.boardEl = boardEl || null;
    this.findHint = findHint;
    this.idleMs = idleMs;
    this.holdMs = holdMs;
    this.hintClass = hintClass;
    this.selectorFor = selectorFor || (({ row, col }) => `[data-row="${row}"][data-col="${col}"]`);
    this._idleTimer = null;
    this._holdTimer = null;
    this._cells = [];
  }

  /** Start (or restart) the idle countdown; surfaces a hint after idleMs. */
  schedule() {
    this.cancel();
    this._idleTimer = setTimeout(() => this._showFound(false), this.idleMs);
  }

  /** Cancel any pending idle hint and remove any visible glow. */
  cancel() {
    if (this._idleTimer) { clearTimeout(this._idleTimer); this._idleTimer = null; }
    if (this._holdTimer) { clearTimeout(this._holdTimer); this._holdTimer = null; }
    this._toggleGlow(false);
    this._cells = [];
  }

  /** Show a hint immediately. Auto-fades after holdMs (override via opt arg). */
  now(holdMs = this.holdMs) {
    this.cancel();
    this._showFound(true, holdMs);
  }

  /** Tear down all timers + glow; safe to call multiple times. */
  dispose() {
    this.cancel();
    this.boardEl = null;
    this.findHint = () => null;
  }

  // ---- internal ----
  _showFound(autoFade, holdMs) {
    const found = this.findHint();
    if (!found || !Array.isArray(found) || found.length === 0) return;
    this._cells = found;
    this._toggleGlow(true);
    if (autoFade) {
      this._holdTimer = setTimeout(() => this.cancel(), holdMs);
    }
  }

  _toggleGlow(on) {
    if (!this.boardEl) return;
    for (const cell of this._cells) {
      const el = this.boardEl.querySelector(this.selectorFor(cell));
      if (el) el.classList.toggle(this.hintClass, on);
    }
  }
}
