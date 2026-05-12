import { SnakeGame } from "../../entities/SnakeGame.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";

/**
 * SnakeClassicGame — Lego golden-assembly composition.
 *
 * Glue code that wires together:
 *   - entities.snake-game (SnakeGame) — pure game-state machine on an NxN grid
 *   - ui.scoreboard (ScoreBoard) — Score + Best with localStorage persistence
 *   - resources.swatches — palette tokens for canvas + CSS vars
 *
 * Renders the SnakeGame's tile grid to a canvas, wires keyboard + on-screen
 * D-pad + swipe input, runs the tick loop with a wait-for-first-input gate
 * (wisdom rule lb-005), and shows a Game Over overlay with restart.
 *
 * The grid size is 18×18 by default; canvas is 360×360 so each cell renders
 * at 20px on mobile.
 */
export class SnakeClassicGame {
  constructor(options = {}) {
    this.canvas = document.getElementById(options.canvasId || "gameCanvas");
    this.ctx = this.canvas?.getContext("2d") ?? null;
    this.rootSelector = options.root || "[data-web-component-example='snake-classic']";
    this.root = document.querySelector(this.rootSelector);

    const swatch = options.swatch || getSwatchByID("retro-neon");
    if (this.root && swatch) {
      applySwatchVariables(this.root, swatch);
    }

    this.grid = new SnakeGame({
      size: options.gridSize ?? 18,
      startSpeedMs: 200,
      minSpeedMs: 80,
      speedupPerFood: 4
    });

    this.scoreBoard = new ScoreBoard({
      target: options.hudTarget || "#hudMount",
      scoreLabel: "Score",
      highScoreLabel: "Best",
      storageKey: "snake-classic.bestScore",
      persistHighScore: true
    });

    this.meta = document.querySelector(options.metaTarget || "#metaMount");
    this.message = document.querySelector(options.messageTarget || "#messageMount");
    this.controlsRoot = document.querySelector(options.controlsSelector || ".snake-controls");

    this.tileSize = this.canvas ? Math.floor(this.canvas.width / this.grid.cols) : 20;
    this.tickHandle = null;
    this.awaitingFirstInput = true;
    this.touchStart = null;
  }

  start() {
    this.grid.newGame();
    this.scoreBoard.setScore(0);
    this.awaitingFirstInput = true;
    this._showMessage("Tap or press an arrow key to start.");
    this._draw();
    this._bindInputs();
    this._updateMeta();
  }

  _bindInputs() {
    if (this._inputsBound) return;
    this._inputsBound = true;

    // Keyboard
    window.addEventListener("keydown", (e) => {
      const map = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
        KeyW: "up",    KeyS: "down",      KeyA: "left",      KeyD: "right"
      };
      const dir = map[e.code];
      if (!dir) return;
      e.preventDefault();
      this._onDirection(dir);
    }, { passive: false });

    // On-screen D-pad
    if (this.controlsRoot) {
      this.controlsRoot.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-dir]");
        if (!btn) return;
        this._onDirection(btn.getAttribute("data-dir"));
      });
    }

    // Swipe on canvas
    if (this.canvas) {
      this.canvas.addEventListener("pointerdown", (e) => {
        this.touchStart = { x: e.clientX, y: e.clientY };
      }, { passive: true });

      this.canvas.addEventListener("pointerup", (e) => {
        if (!this.touchStart) return;
        const dir = SnakeGame.directionFromSwipe(
          this.touchStart.x, this.touchStart.y, e.clientX, e.clientY, 24
        );
        this.touchStart = null;
        if (dir) this._onDirection(dir);
      }, { passive: true });
    }
  }

  _onDirection(dir) {
    if (this.grid.gameOver) {
      // Tap or arrow restarts after Game Over.
      this.start();
      return;
    }
    this.grid.setDirection(dir);
    if (this.awaitingFirstInput) {
      this.awaitingFirstInput = false;
      this._hideMessage();
      this._scheduleTick();
    }
  }

  _scheduleTick() {
    clearTimeout(this.tickHandle);
    if (this.grid.gameOver) return;
    this.tickHandle = setTimeout(() => this._tick(), this.grid.tickMs());
  }

  _tick() {
    const result = this.grid.tick();
    this.scoreBoard.setScore(this.grid.score);
    this._draw();
    this._updateMeta();
    if (result.died) {
      this._showMessage(`Game Over — score ${this.grid.score}. Tap to restart.`);
      return;
    }
    this._scheduleTick();
  }

  _draw() {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const ts = this.tileSize;
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Soft grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let r = 0; r <= this.grid.rows; r += 1) {
      ctx.beginPath();
      ctx.moveTo(0, r * ts); ctx.lineTo(this.canvas.width, r * ts);
      ctx.stroke();
    }
    for (let c = 0; c <= this.grid.cols; c += 1) {
      ctx.beginPath();
      ctx.moveTo(c * ts, 0); ctx.lineTo(c * ts, this.canvas.height);
      ctx.stroke();
    }

    // Cells
    for (let r = 0; r < this.grid.rows; r += 1) {
      for (let c = 0; c < this.grid.cols; c += 1) {
        const v = this.grid.get(r, c);
        if (v === 0) continue;
        if (v === 3) {
          // Food — red
          ctx.fillStyle = "#ef4444";
          ctx.beginPath();
          ctx.arc(c * ts + ts/2, r * ts + ts/2, ts * 0.38, 0, Math.PI * 2);
          ctx.fill();
        } else if (v === 2) {
          // Head — yellow
          ctx.fillStyle = "#fde047";
          ctx.fillRect(c * ts + 1, r * ts + 1, ts - 2, ts - 2);
        } else if (v === 1) {
          // Body — green
          ctx.fillStyle = "#22c55e";
          ctx.fillRect(c * ts + 1, r * ts + 1, ts - 2, ts - 2);
        }
      }
    }
  }

  _updateMeta() {
    if (!this.meta) return;
    const len = this.grid.snake.length;
    this.meta.textContent = `Length ${len}  •  Speed ${this.grid.tickMs()}ms`;
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
