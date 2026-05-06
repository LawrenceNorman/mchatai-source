// ScoreRise — the floating "+50" / "+100" / "★ COMBO" popup that rises
// above a tile as points are awarded. Universal positive feedback for any
// score event in any genre: tile games, breakout, shoot-em-ups, idle/clicker,
// even quiz games on correct-answer.
//
// Wisdom rule: anim-positive-feedback (universal.json) — every score event
// needs a brief visual confirmation at the location of the action.
//
// Usage:
//   import { ScoreRise } from "../../effects/ScoreRise.js";
//   ScoreRise.injectCss();
//   ScoreRise.show(cellEl, "+50");
//   ScoreRise.show(boardEl, "★ COMBO ×3", { color: "#ffd766", fontSize: 18 });

const CSS = `
.score-popup {
  position: absolute;
  pointer-events: none;
  font-weight: 900;
  font-size: 14px;
  color: #fff;
  text-shadow: 0 0 8px #ff7eb6, 0 1px 0 #000;
  animation: scoreRise 0.9s ease-out forwards;
  z-index: 30;
  left: 50%;
  top: 50%;
  white-space: nowrap;
}
@keyframes scoreRise {
  0%   { transform: translate(-50%, 0) scale(0.6); opacity: 0; }
  20%  { transform: translate(-50%, -6px) scale(1.1); opacity: 1; }
  100% { transform: translate(-50%, -46px) scale(1); opacity: 0; }
}
`;

let _cssInjected = false;

export const ScoreRise = {
  css: CSS,

  /** Inject the .score-popup style + keyframes once. Idempotent. */
  injectCss(doc = document) {
    if (_cssInjected) return;
    const style = doc.createElement("style");
    style.dataset.lego = "ScoreRise";
    style.textContent = CSS;
    doc.head.appendChild(style);
    _cssInjected = true;
  },

  /**
   * Append a floating score popup to `parentEl`. The popup rises and fades
   * over 900ms, then auto-removes.
   * @param {HTMLElement} parentEl  must have position: relative or absolute
   * @param {string} text           e.g. "+50", "COMBO ×3", "GREAT!"
   * @param {{ color?: string, fontSize?: number, ttlMs?: number, className?: string }} [opts]
   */
  show(parentEl, text, { color, fontSize, ttlMs = 950, className = "score-popup" } = {}) {
    if (!parentEl) return null;
    if (!_cssInjected) ScoreRise.injectCss();
    const popup = document.createElement("div");
    popup.className = className;
    popup.textContent = text;
    if (color) popup.style.color = color;
    if (fontSize) popup.style.fontSize = `${fontSize}px`;
    parentEl.appendChild(popup);
    setTimeout(() => popup.remove(), ttlMs);
    return popup;
  },
};

export default ScoreRise;
