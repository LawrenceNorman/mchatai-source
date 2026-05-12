// SpawnDrop — entry & exit micro-animations for tiles in any grid game.
// Two CSS classes cover the "this token just appeared" and "this token is
// being destroyed" beats. Used by match-3 (refill rows), mahjong (deal),
// solitaire (placement), gem-roguelikes (orb spawn). Most tile games hand-
// roll these two classes and get the timing wrong; this Lego picks one
// canonical curve (cubic-bezier(.34,1.56,.64,1) — slight overshoot) so
// every tile game looks juicy without thinking.
//
// Wisdom rule: anim-squash-stretch-falling-landing (visual-quality.json)
// — entry/exit motions need easing curves that overshoot, not linear.
//
// Usage:
//   import { SpawnDrop } from "../../effects/SpawnDrop.js";
//   SpawnDrop.injectCss();
//   tileEl.classList.add("spawn");           // when newly added
//   // elsewhere, on match:
//   await SpawnDrop.pop(tileEl);             // animates + removes node
//
// CSS contracts:
//   .spawn   — apply once when the tile is created. Auto-cleans via
//              animationend listener after 350ms.
//   .popping — apply when the tile should disappear; node remains visible
//              for ~260ms (the pop animation), then is up to the caller to
//              remove. Use SpawnDrop.pop() for the auto-remove path.

const SPAWN_DROP_CSS = `
.spawn {
  animation: spawnPop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
@keyframes spawnPop {
  0%   { transform: scale(0.2); opacity: 0; }
  60%  { transform: scale(1.12); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
.popping {
  animation: tilePop 0.26s ease-in forwards;
  pointer-events: none;
}
@keyframes tilePop {
  0%   { transform: scale(1) rotate(0); opacity: 1; }
  50%  {
    transform: scale(1.35) rotate(8deg);
    opacity: 0.95;
    filter: drop-shadow(0 0 12px #fff) brightness(1.4);
  }
  100% { transform: scale(0); opacity: 0; }
}
`;

let _spawn_dropInjected = false;

export const SpawnDrop = {
  css: SPAWN_DROP_CSS,

  /** Inject keyframes + .spawn / .popping styles once. Idempotent. */
  injectCss(doc = document) {
    if (_spawn_dropInjected) return;
    const style = doc.createElement("style");
    style.dataset.lego = "SpawnDrop";
    style.textContent = SPAWN_DROP_CSS;
    doc.head.appendChild(style);
    _spawn_dropInjected = true;
  },

  /**
   * Add the spawn class and auto-clear it after the animation. Caller
   * should append the element to the DOM first.
   */
  spawn(tileEl, { className = "spawn", durationMs = 360 } = {}) {
    if (!tileEl) return;
    if (!_spawn_dropInjected) SpawnDrop.injectCss();
    tileEl.classList.add(className);
    setTimeout(() => tileEl.classList.remove(className), durationMs);
  },

  /**
   * Trigger the popping animation and remove the node when done. Returns a
   * promise that resolves after the node is removed (so callers can await
   * before refilling the slot).
   */
  pop(tileEl, { className = "popping", durationMs = 280 } = {}) {
    if (!tileEl) return Promise.resolve();
    if (!_spawn_dropInjected) SpawnDrop.injectCss();
    tileEl.classList.add(className);
    return new Promise((resolve) => {
      setTimeout(() => {
        tileEl.remove();
        resolve();
      }, durationMs);
    });
  },
};
