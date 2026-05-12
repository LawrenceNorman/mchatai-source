import { SwipeTileGrid } from "../../entities/SwipeTileGrid.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";

const TILE_COLORS = {
  2:    { bg: "#eee4da", fg: "#776e65" },
  4:    { bg: "#ede0c8", fg: "#776e65" },
  8:    { bg: "#f2b179", fg: "#f9f6f2" },
  16:   { bg: "#f59563", fg: "#f9f6f2" },
  32:   { bg: "#f67c5f", fg: "#f9f6f2" },
  64:   { bg: "#f65e3b", fg: "#f9f6f2" },
  128:  { bg: "#edcf72", fg: "#f9f6f2" },
  256:  { bg: "#edcc61", fg: "#f9f6f2" },
  512:  { bg: "#edc850", fg: "#f9f6f2" },
  1024: { bg: "#edc53f", fg: "#f9f6f2" },
  2048: { bg: "#edc22e", fg: "#f9f6f2" }
};

/**
 * McSwipeMergeAssembly — Lego golden-assembly composition.
 *
 * Wires:
 *   - entities.swipe-tile-grid (SwipeTileGrid) — 4x4 swipe-to-merge mechanics
 *   - ui.scoreboard (ScoreBoard) — score + best
 *   - resources.swatches — palette tokens
 *
 * Renders DOM tile grid with classic 2048 beige palette. Swipe gestures
 * (touch) + arrow keys (keyboard). Spawns 2 starting tiles, then one new
 * tile per move.
 */
export class McSwipeMergeAssembly {
  constructor(options = {}) {
    this.rootSelector = options.root || "[data-web-component-example='swipe-merge-2048']";
    this.root = document.querySelector(this.rootSelector);

    const swatch = options.swatch || getSwatchByID("retro-neon");
    if (this.root && swatch) {
      applySwatchVariables(this.root, swatch);
    }

    this.grid = new SwipeTileGrid({ rows: 4, cols: 4 });
    this.scoreBoard = new ScoreBoard({
      target: options.hudTarget || "#hudMount",
      scoreLabel: "Score",
      highScoreLabel: "Best",
      storageKey: "swipe-merge-2048.bestScore",
      persistHighScore: true
    });

    this.boardMount = document.querySelector(options.boardTarget || "#boardMount");
    this.meta = document.querySelector(options.metaTarget || "#metaMount");
    this.message = document.querySelector(options.messageTarget || "#messageMount");
    this.restartBtn = document.getElementById(options.restartBtnId || "restartBtn");

    this.touchStart = null;
  }

  start() {
    this.grid.newGame();
    this.scoreBoard.setScore(0);
    this._hideMessage();
    this._renderBoard();
    this._updateMeta();
    this._bindInputs();
  }

  _bindInputs() {
    if (this._inputsBound) return;
    this._inputsBound = true;

    window.addEventListener("keydown", (e) => {
      const map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
      const dir = map[e.code];
      if (!dir) return;
      e.preventDefault();
      this._onSwipe(dir);
    }, { passive: false });

    if (this.boardMount) {
      this.boardMount.addEventListener("pointerdown", (e) => {
        this.touchStart = { x: e.clientX, y: e.clientY };
      }, { passive: true });
      this.boardMount.addEventListener("pointerup", (e) => {
        if (!this.touchStart) return;
        const dx = e.clientX - this.touchStart.x;
        const dy = e.clientY - this.touchStart.y;
        this.touchStart = null;
        if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
        this._onSwipe(dir);
      }, { passive: true });
    }

    if (this.restartBtn) {
      this.restartBtn.addEventListener("click", () => this.start());
    }
  }

  _onSwipe(dir) {
    const result = this.grid.swipe(dir);
    if (result.moved) {
      this.grid.spawnRandomTile();
      this.scoreBoard.setScore(this.grid.score);
      this._renderBoard();
      this._updateMeta();
      if (this.grid.bestTile >= 2048) this._showMessage("🎉 2048! Keep going for more.");
      else if (!this.grid.canMove()) this._showMessage(`Game Over — score ${this.grid.score}.`);
    }
  }

  _renderBoard() {
    if (!this.boardMount) return;
    this.boardMount.innerHTML = "";
    for (let r = 0; r < this.grid.rows; r += 1) {
      for (let c = 0; c < this.grid.cols; c += 1) {
        const v = this.grid.get(r, c);
        const el = document.createElement("div");
        el.className = "tile";
        if (v > 0) {
          const colors = TILE_COLORS[v] || { bg: "#3c3a32", fg: "#f9f6f2" };
          el.style.background = colors.bg;
          el.style.color = colors.fg;
          el.textContent = String(v);
          el.classList.add("filled");
        }
        this.boardMount.appendChild(el);
      }
    }
  }

  _updateMeta() {
    if (!this.meta) return;
    this.meta.textContent = `Best Tile ${this.grid.bestTile}`;
  }

  _showMessage(text) {
    if (!this.message) return;
    this.message.textContent = text;
    this.message.classList.remove("is-hidden");
  }

  _hideMessage() {
    if (!this.message) return;
    this.message.classList.add("is-hidden");
  }
}
