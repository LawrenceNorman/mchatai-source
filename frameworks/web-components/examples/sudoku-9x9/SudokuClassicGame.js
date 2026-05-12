import { SudokuBoard } from "../../entities/SudokuBoard.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";

/**
 * SudokuClassicGame — Lego golden-assembly composition.
 *
 * Wires:
 *   - entities.sudoku-board (SudokuBoard) — 9x9 grid w/ locked clues, notes, conflicts
 *   - ui.scoreboard (ScoreBoard) — moves counter + best (lowest)
 *   - resources.swatches — palette tokens
 *
 * Renders a DOM grid (81 cells + 3x3 subgrid borders), 1-9 numpad, difficulty
 * pills. Tap cell to select; tap a numpad button to set. Locked clue cells
 * are visually distinct and reject input.
 */
export class SudokuClassicGame {
  constructor(options = {}) {
    this.rootSelector = options.root || "[data-web-component-example='sudoku-9x9']";
    this.root = document.querySelector(this.rootSelector);

    const swatch = options.swatch || getSwatchByID("retro-neon");
    if (this.root && swatch) {
      applySwatchVariables(this.root, swatch);
    }

    this.board = new SudokuBoard();
    this.scoreBoard = new ScoreBoard({
      target: options.hudTarget || "#hudMount",
      scoreLabel: "Moves",
      highScoreLabel: "Best",
      storageKey: "sudoku-9x9.bestMoves",
      persistHighScore: true
    });

    this.boardMount = document.querySelector(options.boardTarget || "#boardMount");
    this.meta = document.querySelector(options.metaTarget || "#metaMount");
    this.difficultyContainer = document.querySelector(options.difficultyContainer || ".sudoku-difficulty");
    this.numpadContainer = document.querySelector(options.numpadContainer || "#numpadMount");

    this.selected = null; // { row, col }
    this.moves = 0;
    this.difficulty = "easy";
  }

  start() {
    this._renderBoard();
    this._bindInputs();
    this._loadPuzzle(this.difficulty);
  }

  _loadPuzzle(difficulty) {
    this.difficulty = difficulty;
    const puzzle = SudokuBoard.generatePuzzle(difficulty);
    this.board.loadPuzzle(puzzle);
    this.moves = 0;
    this.scoreBoard.setScore(0);
    this.selected = null;
    this._renderBoard();
    this._updateMeta();
  }

  _renderBoard() {
    if (!this.boardMount) return;
    this.boardMount.innerHTML = "";
    for (let r = 0; r < 9; r += 1) {
      for (let c = 0; c < 9; c += 1) {
        const cell = this.board.get(r, c);
        const el = document.createElement("button");
        el.type = "button";
        el.className = "cell";
        el.dataset.row = String(r);
        el.dataset.col = String(c);
        if (cell.locked) el.classList.add("locked");
        if (r % 3 === 0) el.classList.add("subgrid-top");
        if (c % 3 === 0) el.classList.add("subgrid-left");
        if (r === 8) el.classList.add("subgrid-bottom");
        if (c === 8) el.classList.add("subgrid-right");
        if (this.selected && this.selected.row === r && this.selected.col === c) {
          el.classList.add("selected");
        }
        el.textContent = cell.value > 0 ? String(cell.value) : "";
        this.boardMount.appendChild(el);
      }
    }
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
        const cell = this.board.get(r, c);
        if (cell.locked) return;
        this.selected = { row: r, col: c };
        this._renderBoard();
      });
    }

    if (this.numpadContainer) {
      this.numpadContainer.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-num]");
        if (!btn) return;
        const n = +btn.dataset.num;
        this._onNumber(n);
      });
    }

    if (this.difficultyContainer) {
      this.difficultyContainer.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-difficulty]");
        if (!btn) return;
        for (const p of this.difficultyContainer.querySelectorAll(".pill")) {
          p.classList.remove("active");
        }
        btn.classList.add("active");
        this._loadPuzzle(btn.dataset.difficulty);
      });
    }

    window.addEventListener("keydown", (e) => {
      if (e.key >= "0" && e.key <= "9") {
        this._onNumber(+e.key);
      } else if (e.key === "Backspace" || e.key === "Delete") {
        this._onNumber(0);
      }
    });
  }

  _onNumber(n) {
    if (!this.selected) return;
    const ok = this.board.setCell(this.selected.row, this.selected.col, n);
    if (!ok) return;
    this.moves += 1;
    this.scoreBoard.setScore(this.moves);
    this._renderBoard();
    this._updateMeta();
    if (this.board.isComplete()) {
      this._updateMeta(`✓ Solved in ${this.moves} moves!`);
    }
  }

  _updateMeta(text) {
    if (!this.meta) return;
    if (text) {
      this.meta.textContent = text;
      return;
    }
    this.meta.textContent = `Difficulty: ${this.difficulty}  •  Moves ${this.moves}`;
  }
}
