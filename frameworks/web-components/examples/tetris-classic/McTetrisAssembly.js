import { TetrisBoard } from "../../entities/TetrisBoard.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";

/**
 * McTetrisAssembly — Lego golden-assembly composition.
 *
 * Wires:
 *   - entities.tetris-board (TetrisBoard) — falling pieces, gravity, line clear, scoring
 *   - ui.scoreboard (ScoreBoard) — Score + Best
 *   - resources.swatches — palette tokens
 *
 * Draws play-field with ghost preview on canvas. Side panel shows next-piece,
 * lines cleared, current level. 5-button control pad (rotate / left / right /
 * down / hard-drop). Wait-for-first-input gate per lb-005.
 */
export class McTetrisAssembly {
  constructor(options = {}) {
    this.rootSelector = options.root || "[data-web-component-example='tetris-classic']";
    this.root = document.querySelector(this.rootSelector);

    const swatch = options.swatch || getSwatchByID("retro-neon");
    if (this.root && swatch) {
      applySwatchVariables(this.root, swatch);
    }

    this.board = new TetrisBoard({ rows: 20, cols: 10 });
    this.scoreBoard = new ScoreBoard({
      target: options.hudTarget || "#hudMount",
      scoreLabel: "Score",
      highScoreLabel: "Best",
      storageKey: "tetris-classic.bestScore",
      persistHighScore: true
    });

    this.canvas = document.getElementById(options.canvasId || "gameCanvas");
    this.ctx = this.canvas?.getContext("2d") ?? null;
    this.nextCanvas = document.getElementById(options.nextCanvasId || "nextCanvas");
    this.nextCtx = this.nextCanvas?.getContext("2d") ?? null;
    this.meta = document.querySelector(options.metaTarget || "#metaMount");
    this.message = document.querySelector(options.messageTarget || "#messageMount");
    this.linesEl = document.getElementById(options.linesElId || "linesValue");
    this.levelEl = document.getElementById(options.levelElId || "levelValue");
    this.controls = document.querySelector(options.controlsSelector || ".tetris-controls");

    this.tickHandle = null;
    this.awaitingFirstInput = true;
    this.cellSize = this.canvas ? Math.floor(this.canvas.width / this.board.cols) : 24;
  }

  start() {
    this.board.newGame();
    this.scoreBoard.setScore(0);
    this.awaitingFirstInput = true;
    this._showMessage("Press an arrow key or a control to start.");
    this._draw();
    this._drawNext();
    this._bindInputs();
    this._updateMeta();
  }

  _bindInputs() {
    if (this._inputsBound) return;
    this._inputsBound = true;

    window.addEventListener("keydown", (e) => {
      const map = { ArrowLeft: "left", ArrowRight: "right", ArrowDown: "down", ArrowUp: "rotate", Space: "drop" };
      const act = map[e.code];
      if (!act) return;
      e.preventDefault();
      this._onAction(act);
    }, { passive: false });

    if (this.controls) {
      this.controls.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-act]");
        if (!btn) return;
        this._onAction(btn.dataset.act);
      });
    }
  }

  _onAction(act) {
    if (this.board.gameOver) {
      this.start();
      return;
    }
    if (this.awaitingFirstInput) {
      this.awaitingFirstInput = false;
      this._hideMessage();
      this._scheduleTick();
    }
    switch (act) {
      case "left": this.board.move(0, -1); break;
      case "right": this.board.move(0, 1); break;
      case "down": this.board.move(1, 0); break;
      case "rotate": this.board.rotate(1); break;
      case "drop": this.board.hardDrop(); break;
    }
    this.scoreBoard.setScore(this.board.score);
    this._draw();
    this._drawNext();
    this._updateMeta();
    if (this.board.gameOver) this._showMessage(`Game Over — score ${this.board.score}. Tap to restart.`);
  }

  _scheduleTick() {
    clearTimeout(this.tickHandle);
    if (this.board.gameOver) return;
    this.tickHandle = setTimeout(() => this._tick(), this.board.gravityMs());
  }

  _tick() {
    this.board.tick();
    this.scoreBoard.setScore(this.board.score);
    this._draw();
    this._drawNext();
    this._updateMeta();
    if (this.board.gameOver) {
      this._showMessage(`Game Over — score ${this.board.score}. Tap to restart.`);
      return;
    }
    this._scheduleTick();
  }

  _draw() {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const ts = this.cellSize;
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Locked cells
    for (let r = 0; r < this.board.rows; r += 1) {
      for (let c = 0; c < this.board.cols; c += 1) {
        const v = this.board.get(r, c);
        if (v > 0) {
          ctx.fillStyle = TetrisBoard.COLORS[v] || "#94a3b8";
          ctx.fillRect(c * ts + 1, r * ts + 1, ts - 2, ts - 2);
        }
      }
    }

    // Ghost
    const ghost = this.board.ghostPosition();
    if (ghost) this._drawPiece(ctx, ghost, true);

    // Active
    if (this.board.active) this._drawPiece(ctx, this.board.active, false);
  }

  _drawPiece(ctx, piece, ghost) {
    const shape = TetrisBoard.TETROMINOES[piece.kind].rotations[piece.rot];
    const color = TetrisBoard.TETROMINOES[piece.kind].color;
    const fill = TetrisBoard.COLORS[color] || "#94a3b8";
    const ts = this.cellSize;
    for (let r = 0; r < shape.length; r += 1) {
      for (let c = 0; c < shape[r].length; c += 1) {
        if (!shape[r][c]) continue;
        if (ghost) {
          ctx.strokeStyle = fill;
          ctx.lineWidth = 1.5;
          ctx.strokeRect((piece.col + c) * ts + 1, (piece.row + r) * ts + 1, ts - 2, ts - 2);
        } else {
          ctx.fillStyle = fill;
          ctx.fillRect((piece.col + c) * ts + 1, (piece.row + r) * ts + 1, ts - 2, ts - 2);
        }
      }
    }
  }

  _drawNext() {
    if (!this.nextCtx || !this.nextCanvas) return;
    const ctx = this.nextCtx;
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
    if (!this.board.nextKind) return;
    const shape = TetrisBoard.TETROMINOES[this.board.nextKind].rotations[0];
    const color = TetrisBoard.TETROMINOES[this.board.nextKind].color;
    const fill = TetrisBoard.COLORS[color] || "#94a3b8";
    const ts = 14;
    const w = shape[0].length * ts;
    const h = shape.length * ts;
    const ox = Math.floor((this.nextCanvas.width - w) / 2);
    const oy = Math.floor((this.nextCanvas.height - h) / 2);
    for (let r = 0; r < shape.length; r += 1) {
      for (let c = 0; c < shape[r].length; c += 1) {
        if (!shape[r][c]) continue;
        ctx.fillStyle = fill;
        ctx.fillRect(ox + c * ts + 1, oy + r * ts + 1, ts - 2, ts - 2);
      }
    }
  }

  _updateMeta() {
    if (this.linesEl) this.linesEl.textContent = String(this.board.lines);
    if (this.levelEl) this.levelEl.textContent = String(this.board.level);
    if (this.meta) this.meta.textContent = `Gravity ${this.board.gravityMs()}ms`;
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
