// BEGIN mchatai-web-components: ui.level-select-screen (ui/LevelSelectScreen.js)

// LevelSelectScreen - a level picker grid for multi-level / campaign games.
//
// Companion to entities/LevelContentData (the level DATA + unlock/best-score
// persistence) and entities/LevelProgression (runtime STATE). Renders a grid of
// level cards: unlocked levels are tappable, locked levels are dimmed with a
// lock glyph, each card shows a difficulty badge, target score, and the player's
// best. Fires onSelect(index) when an unlocked card is chosen.
//
// Why this exists: multi-level games today either skip a picker entirely (player
// can only ever play level 1 -> N linearly, no replay of a cleared level for a
// better score) or hand-roll a bespoke menu each time. A data-driven picker lets
// a generated game expose its whole campaign with one call.
//
// Mobile-first: cards are >=88px tap targets, the grid is responsive
// (auto-fill, minmax), keyboard accessible (Enter/Space on focused card).
// Uses canonical --mchat-* swatch tokens with inline fallbacks so it renders
// correctly before applySwatchVariables() runs (FOUC-safe).
//
// Usage:
//   import { LevelContentData } from "../../entities/LevelContentData.js";
//   import { LevelSelectScreen } from "../../ui/LevelSelectScreen.js";
//   const data = LevelContentData.generate({ count: 12, baseTarget: 1500 });
//   const picker = new LevelSelectScreen({
//     host: "[data-app]",
//     data,
//     title: "Select Level",
//     onSelect: (i) => startLevel(data.level(i)),
//   });
//   picker.show();          // render + reveal
//   picker.hide();          // when a level starts
//   picker.refresh();       // re-read unlock/best state after a clear

const LEVEL_SELECT_STYLE_ID = "mchatai-level-select-styles";
const LEVEL_SELECT_ROOT_CLASS = "mchatai-level-select";

const LEVEL_SELECT_STYLE_CSS = `
.${LEVEL_SELECT_ROOT_CLASS} {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  overflow-y: auto;
  background: var(--mchat-bg, #1b1726);
  color: var(--mchat-text, #f4f1ea);
  box-sizing: border-box;
}
.${LEVEL_SELECT_ROOT_CLASS}[hidden] { display: none; }
.${LEVEL_SELECT_ROOT_CLASS}__title {
  font-size: clamp(20px, 5vw, 30px);
  font-weight: 700;
  text-align: center;
  margin: 4px 0 6px;
}
.${LEVEL_SELECT_ROOT_CLASS}__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 12px;
}
.${LEVEL_SELECT_ROOT_CLASS}__card {
  position: relative;
  min-height: 88px;
  border-radius: 14px;
  border: none;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  font: inherit;
  color: var(--mchat-text, #f4f1ea);
  background: linear-gradient(160deg, var(--mchat-surface, #2c2740), var(--mchat-surface-2, #221d33));
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 6px rgba(0,0,0,0.3);
  transition: transform 120ms ease, box-shadow 120ms ease;
}
.${LEVEL_SELECT_ROOT_CLASS}__card:hover,
.${LEVEL_SELECT_ROOT_CLASS}__card:focus-visible {
  transform: translateY(-2px);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.12), 0 6px 14px rgba(0,0,0,0.4);
  outline: 2px solid var(--mchat-accent, #e0a96d);
  outline-offset: 2px;
}
.${LEVEL_SELECT_ROOT_CLASS}__card[data-locked="true"] {
  cursor: default;
  opacity: 0.45;
  filter: grayscale(0.5);
}
.${LEVEL_SELECT_ROOT_CLASS}__num { font-size: 22px; font-weight: 800; }
.${LEVEL_SELECT_ROOT_CLASS}__name { font-size: 11px; opacity: 0.8; text-align: center; }
.${LEVEL_SELECT_ROOT_CLASS}__best { font-size: 11px; color: var(--mchat-accent, #e0a96d); font-weight: 700; }
.${LEVEL_SELECT_ROOT_CLASS}__diff {
  position: absolute; top: 6px; right: 8px;
  font-size: 10px; letter-spacing: 1px;
  color: var(--mchat-accent, #e0a96d);
}
.${LEVEL_SELECT_ROOT_CLASS}__lock { position: absolute; top: 6px; left: 8px; font-size: 13px; opacity: 0.8; }
`;

function resolveHost(target) {
  if (typeof document === "undefined") return null;
  if (!target) return document.body;
  if (typeof target === "string") return document.querySelector(target);
  return target;
}

function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(LEVEL_SELECT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = LEVEL_SELECT_STYLE_ID;
  style.textContent = LEVEL_SELECT_STYLE_CSS;
  document.head.appendChild(style);
}

export class LevelSelectScreen {
  /** @param {{host?, data, title?, onSelect?, diffGlyph?: string}} options */
  constructor(options = {}) {
    this.data = options.data;
    if (!this.data || typeof this.data.count !== "number") {
      throw new Error("[LevelSelectScreen] requires a LevelContentData instance as `data`.");
    }
    this.host = resolveHost(options.host);
    this.title = options.title || "Select Level";
    this.onSelect = typeof options.onSelect === "function" ? options.onSelect : () => {};
    this.diffGlyph = options.diffGlyph || "*";
    this.root = null;
    ensureStyles();
  }

  _diffBadge(level) {
    const d = Math.max(1, Math.min(5, level.difficulty || 1));
    return this.diffGlyph.repeat(d);
  }

  _buildCard(i) {
    const level = this.data.level(i);
    const unlocked = this.data.isUnlocked(i);
    const best = this.data.bestScore(i);
    const card = document.createElement("button");
    card.type = "button";
    card.className = `${LEVEL_SELECT_ROOT_CLASS}__card`;
    card.setAttribute("data-locked", String(!unlocked));
    card.setAttribute("aria-label",
      `${level.name}${unlocked ? "" : " (locked)"}${best ? `, best ${best}` : ""}`);
    if (!unlocked) card.disabled = true;

    const diff = document.createElement("span");
    diff.className = `${LEVEL_SELECT_ROOT_CLASS}__diff`;
    diff.textContent = this._diffBadge(level);
    card.appendChild(diff);

    if (!unlocked) {
      const lock = document.createElement("span");
      lock.className = `${LEVEL_SELECT_ROOT_CLASS}__lock`;
      lock.textContent = "[L]";
      card.appendChild(lock);
    }

    const num = document.createElement("span");
    num.className = `${LEVEL_SELECT_ROOT_CLASS}__num`;
    num.textContent = String(i + 1);
    card.appendChild(num);

    const name = document.createElement("span");
    name.className = `${LEVEL_SELECT_ROOT_CLASS}__name`;
    name.textContent = level.name;
    card.appendChild(name);

    if (best > 0) {
      const b = document.createElement("span");
      b.className = `${LEVEL_SELECT_ROOT_CLASS}__best`;
      b.textContent = `best ${best.toLocaleString()}`;
      card.appendChild(b);
    }

    if (unlocked) card.addEventListener("click", () => this.onSelect(i, level));
    return card;
  }

  render() {
    if (!this.host) return null;
    if (!this.root) {
      this.root = document.createElement("div");
      this.root.className = LEVEL_SELECT_ROOT_CLASS;
      this.host.appendChild(this.root);
    }
    this.root.textContent = "";
    const h = document.createElement("div");
    h.className = `${LEVEL_SELECT_ROOT_CLASS}__title`;
    h.textContent = this.title;
    this.root.appendChild(h);
    const grid = document.createElement("div");
    grid.className = `${LEVEL_SELECT_ROOT_CLASS}__grid`;
    for (let i = 0; i < this.data.count; i++) grid.appendChild(this._buildCard(i));
    this.root.appendChild(grid);
    return this.root;
  }

  /** Re-read unlock/best state and re-render in place (call after a level clear). */
  refresh() { if (this.root) this.render(); }

  show() { this.render(); if (this.root) this.root.hidden = false; return this.root; }
  hide() { if (this.root) this.root.hidden = true; }
}

// END mchatai-web-components: ui.level-select-screen
