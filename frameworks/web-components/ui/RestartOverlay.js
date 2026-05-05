// RestartOverlay — visible game-over / play-again affordance.
//
// Why this exists: user feedback on shipped Lunar Lander, Pong, BurgerTime, Joust
// all hit the same complaint — games show "GAME OVER" as static HUD text and
// expect players to discover Cmd+N from the menu bar to restart. The on-screen
// button is the primary affordance; menu shortcuts can stay as a power-user nicety.
//
// Wisdom rules: bg-restart-button (CRITICAL), ag-restart-button (CRITICAL),
// u-029 (every game with a terminal phase must mount this).
//
// Usage:
//   import { RestartOverlay } from "../../ui/RestartOverlay.js";
//   const overlay = new RestartOverlay({ host: "[data-app]", onRestart: () => game.reset() });
//   // on game over:
//   overlay.show({ title: "Game Over", subtitle: `Score: ${score}`, buttonLabel: "Play Again" });
//   // on restart:
//   overlay.hide();   // or overlay.show() returns automatically when button is tapped
//
// Mobile-first: the button is large (≥60×220px), the overlay dims the canvas so
// the button is unmistakable, Enter/Space triggers it from keyboard.

const STYLE_ID = "mchatai-restart-overlay-styles";
const ROOT_CLASS = "mchatai-restart-overlay";

const STYLE_CSS = `
.${ROOT_CLASS} {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 16px;
  background: rgba(8, 12, 22, 0.78);
  backdrop-filter: blur(2px);
  z-index: 1000;
  color: #f8fafc;
  text-align: center;
  pointer-events: auto;
  animation: mchatai-restart-fade-in 200ms ease-out both;
}
.${ROOT_CLASS}[hidden] { display: none; }
.${ROOT_CLASS}__title {
  margin: 0;
  font-size: clamp(1.4rem, 5vw, 2.2rem);
  font-weight: 800;
  letter-spacing: -0.01em;
}
.${ROOT_CLASS}__subtitle {
  margin: 0;
  font-size: clamp(0.95rem, 3vw, 1.15rem);
  opacity: 0.85;
  max-width: 32rem;
}
.${ROOT_CLASS}__button {
  min-width: 200px;
  min-height: 60px;
  padding: 14px 28px;
  border-radius: 14px;
  border: 0;
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  color: #1a0e00;
  font-size: 1.1rem;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 12px 30px rgba(251, 191, 36, 0.32);
  transition: transform 120ms ease, box-shadow 120ms ease;
}
.${ROOT_CLASS}__button:hover,
.${ROOT_CLASS}__button:focus-visible {
  transform: translateY(-2px);
  box-shadow: 0 16px 36px rgba(251, 191, 36, 0.42);
  outline: 2px solid #fef3c7;
  outline-offset: 3px;
}
.${ROOT_CLASS}__button:active { transform: translateY(0); }
.${ROOT_CLASS}__hint {
  margin: 0;
  font-size: 0.78rem;
  opacity: 0.55;
}
@keyframes mchatai-restart-fade-in {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}
`.trim();

function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLE_CSS;
  document.head.appendChild(style);
}

function resolveTarget(target) {
  if (!target || typeof document === "undefined") return null;
  return typeof target === "string" ? document.querySelector(target) : target;
}

export class RestartOverlay {
  constructor(options = {}) {
    ensureStyles();
    this.onRestart = typeof options.onRestart === "function" ? options.onRestart : () => {};
    this.host = resolveTarget(options.host) || (typeof document !== "undefined" ? document.body : null);
    // Ensure the host can position the overlay absolutely.
    if (this.host && typeof window !== "undefined") {
      const computed = window.getComputedStyle(this.host);
      if (computed && computed.position === "static") {
        this.host.style.position = "relative";
      }
    }
    this.element = this._create();
    this.element.hidden = true;
    if (this.host && this.element) this.host.appendChild(this.element);
    this._boundKeyDown = (event) => this._handleKeyDown(event);
    if (typeof window !== "undefined") window.addEventListener("keydown", this._boundKeyDown);
  }

  /**
   * Show the overlay. Replaces title/subtitle/buttonLabel content if provided.
   * Re-calling show() while already visible is safe — it just updates content.
   */
  show(options = {}) {
    if (!this.element) return;
    const title = options.title || "Game Over";
    const subtitle = options.subtitle || "";
    const buttonLabel = options.buttonLabel || "Play Again";
    if (this.titleEl) this.titleEl.textContent = title;
    if (this.subtitleEl) {
      if (subtitle) {
        this.subtitleEl.textContent = subtitle;
        this.subtitleEl.hidden = false;
      } else {
        this.subtitleEl.hidden = true;
      }
    }
    if (this.buttonEl) this.buttonEl.textContent = buttonLabel;
    this.element.hidden = false;
    // Focus the button so keyboard users can tab/Enter immediately.
    if (this.buttonEl && typeof this.buttonEl.focus === "function") {
      try { this.buttonEl.focus(); } catch (_) {}
    }
    return this;
  }

  hide() {
    if (this.element) this.element.hidden = true;
    return this;
  }

  destroy() {
    if (this.element) this.element.remove();
    if (typeof window !== "undefined" && this._boundKeyDown) {
      window.removeEventListener("keydown", this._boundKeyDown);
    }
  }

  isVisible() {
    return !!this.element && this.element.hidden === false;
  }

  _handleKeyDown(event) {
    if (!this.isVisible()) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this._fire();
    }
  }

  _fire() {
    // Hide first so user gets immediate feedback even if onRestart is slow.
    this.hide();
    try {
      this.onRestart();
    } catch (err) {
      if (typeof console !== "undefined") console.error("[RestartOverlay] onRestart threw", err);
    }
  }

  _create() {
    if (typeof document === "undefined") {
      return { hidden: true, remove() {}, querySelector() { return null; } };
    }
    const root = document.createElement("div");
    root.className = ROOT_CLASS;
    root.dataset.component = "restart-overlay";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.innerHTML = `
      <h2 class="${ROOT_CLASS}__title"></h2>
      <p class="${ROOT_CLASS}__subtitle"></p>
      <button type="button" class="${ROOT_CLASS}__button"></button>
      <p class="${ROOT_CLASS}__hint">Press Enter to play again</p>
    `;
    this.titleEl = root.querySelector(`.${ROOT_CLASS}__title`);
    this.subtitleEl = root.querySelector(`.${ROOT_CLASS}__subtitle`);
    this.buttonEl = root.querySelector(`.${ROOT_CLASS}__button`);
    if (this.buttonEl) this.buttonEl.addEventListener("click", () => this._fire());
    return root;
  }
}

/**
 * Convenience factory — mounts an overlay against the given host and returns the
 * RestartOverlay instance. Handy for inline glue code.
 *
 *   const overlay = mountRestartOverlay("[data-app]", () => game.reset());
 */
export function mountRestartOverlay(host, onRestart) {
  return new RestartOverlay({ host, onRestart });
}
