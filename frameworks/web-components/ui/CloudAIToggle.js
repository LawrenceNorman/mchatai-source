// CloudAIToggle — three-button difficulty selector for board/strategy games.
// Easy (random) / Medium (local AI) / Strong (cloud LLM).
//
// Wisdom rule: bg-007 (board games should expose Strong-AI cloud option with
// token-cost badge; fall back gracefully on cloud absence).
//
// Usage:
//   import { CloudAIToggle } from "../../ui/CloudAIToggle.js";
//   const toggle = new CloudAIToggle({
//     target: "#difficulty",
//     onChange: (level) => game.setDifficulty(level),
//     defaultLevel: "medium",
//     tokenCost: 1   // tokens per game (or per move, your call)
//   });
//
// Levels:
//   "easy"   — random / weak AI (game wires SimpleOpponent or low-depth)
//   "medium" — local minimax AI at default depth
//   "strong" — CloudOpponent calls window.mChatAI.cloud.llm()
//
// The Strong button is disabled and tooltip-explained when cloud bridge is
// unavailable. Toggle never throws; never network-calls itself (the game's
// AI wiring handles that based on the level value).

const STYLE_ID = "mchatai-cloud-ai-toggle-styles";
const ROOT_CLASS = "mchatai-cloud-ai-toggle";
const LEVELS = ["easy", "medium", "strong"];
const LABELS = { easy: "Easy", medium: "Medium", strong: "⚡ Strong" };

const STYLE_CSS = `
.${ROOT_CLASS} {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
}
.${ROOT_CLASS}__btn {
  padding: 6px 14px;
  border-radius: 999px;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.${ROOT_CLASS}__btn:hover { background: rgba(255, 255, 255, 0.06); }
.${ROOT_CLASS}__btn--active {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  color: #1a0e00;
  box-shadow: 0 4px 12px rgba(251, 191, 36, 0.32);
}
.${ROOT_CLASS}__btn[disabled] {
  opacity: 0.45;
  cursor: not-allowed;
}
.${ROOT_CLASS}__cost {
  font-size: 0.7rem;
  opacity: 0.7;
  font-weight: 500;
}
.${ROOT_CLASS}__btn--active .${ROOT_CLASS}__cost { opacity: 0.85; }
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

function isCloudAvailable() {
  const cloud = globalThis?.window?.mChatAI?.cloud;
  if (!cloud || typeof cloud.llm !== "function") return false;
  if (typeof cloud.isAvailable === "function") return cloud.isAvailable() === true;
  return true;
}

export class CloudAIToggle {
  constructor(options = {}) {
    ensureStyles();
    this.onChange = typeof options.onChange === "function" ? options.onChange : () => {};
    this.level = LEVELS.includes(options.defaultLevel) ? options.defaultLevel : "medium";
    this.tokenCost = typeof options.tokenCost === "number" ? options.tokenCost : 1;
    this.tokenCostUnit = options.tokenCostUnit || "/ game";
    this.element = this._create();
    const mount = resolveTarget(options.target);
    if (mount) mount.appendChild(this.element);
    // If cloud is unavailable and user picked "strong" as default, downgrade silently.
    if (this.level === "strong" && !isCloudAvailable()) {
      this.level = "medium";
      this._render();
    }
  }

  getLevel() { return this.level; }

  setLevel(level) {
    if (!LEVELS.includes(level)) return;
    if (level === "strong" && !isCloudAvailable()) return;
    if (level === this.level) return;
    this.level = level;
    this._render();
    try { this.onChange(this.level); } catch (err) {
      if (typeof console !== "undefined") console.error("[CloudAIToggle] onChange threw", err);
    }
  }

  destroy() { if (this.element) this.element.remove(); }

  _create() {
    if (typeof document === "undefined") {
      return { remove() {}, querySelectorAll: () => [] };
    }
    const root = document.createElement("div");
    root.className = ROOT_CLASS;
    root.setAttribute("role", "radiogroup");
    root.setAttribute("aria-label", "AI Difficulty");
    LEVELS.forEach((level) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `${ROOT_CLASS}__btn`;
      btn.dataset.level = level;
      btn.setAttribute("role", "radio");
      btn.innerHTML = `<span>${LABELS[level]}</span>${level === "strong" ? `<span class="${ROOT_CLASS}__cost">${this.tokenCost} ${this.tokenCostUnit}</span>` : ""}`;
      if (level === "strong" && !isCloudAvailable()) {
        btn.disabled = true;
        btn.title = "Strong AI requires an mChatAI+ account with compute tokens.";
      }
      btn.addEventListener("click", () => this.setLevel(level));
      root.appendChild(btn);
    });
    this._buttons = root.querySelectorAll(`.${ROOT_CLASS}__btn`);
    this._render(root);
    return root;
  }

  _render(rootArg) {
    const root = rootArg || this.element;
    if (!root || !this._buttons) return;
    this._buttons.forEach((btn) => {
      const isActive = btn.dataset.level === this.level;
      btn.classList.toggle(`${ROOT_CLASS}__btn--active`, isActive);
      btn.setAttribute("aria-checked", isActive ? "true" : "false");
    });
  }
}
