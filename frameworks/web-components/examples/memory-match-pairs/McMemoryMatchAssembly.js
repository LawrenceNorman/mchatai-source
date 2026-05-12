import { MemoryMatchBoard, MEMORY_DEFAULT_SYMBOLS } from "../../entities/MemoryMatchBoard.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";

const DIFFICULTIES = {
  easy:   { rows: 3, cols: 4, name: "3×4" },
  medium: { rows: 4, cols: 4, name: "4×4" },
  hard:   { rows: 4, cols: 5, name: "4×5" }
};

/**
 * McMemoryMatchAssembly — Lego golden-assembly composition.
 *
 * Wires:
 *   - entities.memory-match-board (MemoryMatchBoard, MEMORY_DEFAULT_SYMBOLS)
 *   - ui.scoreboard (ScoreBoard) — moves + best
 *   - resources.swatches — palette tokens
 *
 * Renders a DOM grid of cards with purple-pink gradient backs. Tap to flip;
 * mismatched pairs flip back after a short delay. Difficulty pills change
 * the grid size. Mobile-first 4×4 default.
 */
export class McMemoryMatchAssembly {
  constructor(options = {}) {
    this.rootSelector = options.root || "[data-web-component-example='memory-match-pairs']";
    this.root = document.querySelector(this.rootSelector);

    const swatch = options.swatch || getSwatchByID("retro-neon");
    if (this.root && swatch) {
      applySwatchVariables(this.root, swatch);
    }

    this.difficulty = "medium";
    this.board = null;
    this.scoreBoard = new ScoreBoard({
      target: options.hudTarget || "#hudMount",
      scoreLabel: "Moves",
      highScoreLabel: "Best",
      storageKey: "memory-match-pairs.bestMoves",
      persistHighScore: true
    });

    this.boardMount = document.querySelector(options.boardTarget || "#boardMount");
    this.meta = document.querySelector(options.metaTarget || "#metaMount");
    this.message = document.querySelector(options.messageTarget || "#messageMount");
    this.difficultyContainer = document.querySelector(options.difficultyContainer || ".memory-difficulty");
    this.restartBtn = document.getElementById(options.restartBtnId || "restartBtn");

    this.moves = 0;
    this.pendingResolveTimer = null;
  }

  start() {
    this._newRound();
    this._bindInputs();
  }

  _newRound() {
    const { rows, cols } = DIFFICULTIES[this.difficulty];
    this.board = new MemoryMatchBoard({ rows, cols });
    const deck = MemoryMatchBoard.buildShuffledDeck(MEMORY_DEFAULT_SYMBOLS, rows * cols);
    this.board.setCards(deck);
    this.moves = 0;
    this.scoreBoard.setScore(0);
    this._hideMessage();
    this._renderBoard();
    this._updateMeta();
  }

  _bindInputs() {
    if (this._inputsBound) return;
    this._inputsBound = true;

    if (this.boardMount) {
      this.boardMount.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-row]");
        if (!btn) return;
        const r = +btn.dataset.row;
        const c = +btn.dataset.col;
        this._onFlip(r, c);
      });
    }

    if (this.difficultyContainer) {
      this.difficultyContainer.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-difficulty]");
        if (!btn) return;
        for (const p of this.difficultyContainer.querySelectorAll(".pill")) p.classList.remove("active");
        btn.classList.add("active");
        this.difficulty = btn.dataset.difficulty;
        this._newRound();
      });
    }

    if (this.restartBtn) {
      this.restartBtn.addEventListener("click", () => this._newRound());
    }
  }

  _onFlip(r, c) {
    const result = this.board.flipCard(r, c);
    this._renderBoard();
    if (result.state === "first" || result.state === "match" || result.state === "mismatch") {
      this.moves += 1;
      this.scoreBoard.setScore(this.moves);
      this._updateMeta();
    }
    if (result.state === "mismatch") {
      clearTimeout(this.pendingResolveTimer);
      this.pendingResolveTimer = setTimeout(() => {
        this.board.resolveMismatch();
        this._renderBoard();
      }, 800);
    }
    if (this.board.isComplete()) {
      this._showMessage(`✓ Solved in ${this.moves} moves!`);
    }
  }

  _renderBoard() {
    if (!this.boardMount || !this.board) return;
    this.boardMount.innerHTML = "";
    this.boardMount.style.gridTemplateColumns = `repeat(${this.board.cols}, 1fr)`;
    for (let r = 0; r < this.board.rows; r += 1) {
      for (let c = 0; c < this.board.cols; c += 1) {
        const cell = this.board.get(r, c);
        const el = document.createElement("button");
        el.type = "button";
        el.className = "card";
        el.dataset.row = String(r);
        el.dataset.col = String(c);
        if (cell.state === "up") {
          el.classList.add("face-up");
          el.textContent = cell.value;
        } else if (cell.state === "matched") {
          el.classList.add("matched");
          el.textContent = cell.value;
        } else {
          el.classList.add("face-down");
          el.textContent = "";
        }
        this.boardMount.appendChild(el);
      }
    }
  }

  _updateMeta() {
    if (!this.meta) return;
    const total = this.board ? (this.board.rows * this.board.cols) / 2 : 0;
    const matched = this.board ? (this.board.cells.flat().filter(c => c.state === "matched").length / 2) : 0;
    this.meta.textContent = `Pairs ${matched}/${total}  •  Moves ${this.moves}`;
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
