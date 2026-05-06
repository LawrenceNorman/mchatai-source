// PopBurst — radial light flash for "tile destroyed / matched / cleared"
// feedback. Drop-in for match-3, mahjong, jewel-puzzle, line-clear games,
// gem-collector roguelikes. One audited helper avoids each tile game
// reinventing a fade-out CSS hack and forgetting to remove the DOM node.
//
// Wisdom rule: vq-burst-on-clear (visual-quality.json) — every tile-clear
// event needs a visible "thing happened here" beat or the board reads as
// silent and unsatisfying.
//
// Usage:
//   import { PopBurst } from "../../effects/PopBurst.js";
//   PopBurst.injectCss();                  // once on init
//   PopBurst.spawn(cellElement);           // each match
//
// Or pass your own parent + remove timing:
//   PopBurst.spawn(cell, { ttlMs: 600, className: "pop-fx" });

const CSS = `
.pop-fx {
  position: absolute;
  inset: 0;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: popBurst 0.5s ease-out forwards;
  z-index: 15;
}
.pop-fx::before {
  content: "";
  width: 60%;
  height: 60%;
  border-radius: 50%;
  background: radial-gradient(circle,
    #fff 0%,
    #ffec99 25%,
    rgba(255, 200, 80, 0.7) 45%,
    rgba(255, 90, 180, 0) 70%);
  filter: blur(2px);
}
@keyframes popBurst {
  0%   { transform: scale(0.4); opacity: 0.95; }
  100% { transform: scale(1.8); opacity: 0; }
}
`;

let _cssInjected = false;

export const PopBurst = {
  css: CSS,

  /** Inject the @keyframes + .pop-fx style block once. Idempotent. */
  injectCss(doc = document) {
    if (_cssInjected) return;
    const style = doc.createElement("style");
    style.dataset.lego = "PopBurst";
    style.textContent = CSS;
    doc.head.appendChild(style);
    _cssInjected = true;
  },

  /**
   * Spawn a burst overlay inside `parentEl` (typically a cell). Auto-removes
   * when the animation ends.
   * @param {HTMLElement} parentEl
   * @param {{ ttlMs?: number, className?: string }} [opts]
   * @returns {HTMLElement} the burst node (already attached)
   */
  spawn(parentEl, { ttlMs = 520, className = "pop-fx" } = {}) {
    if (!parentEl) return null;
    if (!_cssInjected) PopBurst.injectCss();
    const fx = document.createElement("div");
    fx.className = className;
    parentEl.appendChild(fx);
    setTimeout(() => fx.remove(), ttlMs);
    return fx;
  },
};

export default PopBurst;
