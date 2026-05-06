// BoardShake — the universal "no-go / wrong answer / illegal move" feedback
// shake. Works on any container element: a match-3 board (invalid swap), a
// password input (wrong code), a chess square (illegal move), a quiz button
// (wrong answer). Without this beat, players can't tell whether the input
// failed or the game is just slow.
//
// Wisdom rule: anim-negative-feedback (universal.json) — illegal/invalid
// inputs need an immediate motion response (~350ms is the sweet spot).
//
// Usage:
//   import { BoardShake } from "../../effects/BoardShake.js";
//   BoardShake.injectCss();
//   BoardShake.shake(boardEl);            // 350ms shake
//   BoardShake.shake(inputEl, { intensity: "strong" });

const CSS = `
.shake-fx {
  animation: shakeFx 0.35s ease;
}
@keyframes shakeFx {
  0%, 100% { transform: translate(0, 0); }
  20%      { transform: translate(-4px, 2px); }
  40%      { transform: translate(5px, -1px); }
  60%      { transform: translate(-3px, 2px); }
  80%      { transform: translate(3px, 0); }
}
.shake-fx-strong {
  animation: shakeFxStrong 0.5s ease;
}
@keyframes shakeFxStrong {
  0%, 100% { transform: translate(0, 0) rotate(0); }
  15%      { transform: translate(-8px, 3px) rotate(-1deg); }
  30%      { transform: translate(9px, -2px) rotate(1deg); }
  45%      { transform: translate(-7px, 4px) rotate(-1deg); }
  60%      { transform: translate(7px, -1px) rotate(1deg); }
  80%      { transform: translate(-3px, 2px); }
}
`;

let _cssInjected = false;

export const BoardShake = {
  css: CSS,

  /** Inject the .shake-fx + .shake-fx-strong styles + keyframes once. */
  injectCss(doc = document) {
    if (_cssInjected) return;
    const style = doc.createElement("style");
    style.dataset.lego = "BoardShake";
    style.textContent = CSS;
    doc.head.appendChild(style);
    _cssInjected = true;
  },

  /**
   * Apply a shake animation to `el` for ~350ms (or 500ms if intensity is
   * "strong"). Auto-cleans the class so subsequent calls retrigger it.
   */
  shake(el, { intensity = "normal", durationMs } = {}) {
    if (!el) return;
    if (!_cssInjected) BoardShake.injectCss();
    const cls = intensity === "strong" ? "shake-fx-strong" : "shake-fx";
    const ttl = durationMs ?? (intensity === "strong" ? 520 : 380);
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ttl);
  },
};

export default BoardShake;
