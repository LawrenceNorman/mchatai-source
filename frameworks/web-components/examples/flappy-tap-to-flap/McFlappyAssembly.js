import { FlappyBird } from "../../entities/FlappyBird.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";

/**
 * McFlappyAssembly — Lego golden-assembly composition.
 *
 * Wires together:
 *   - entities.flappy-bird (FlappyBird) — gravity + flap-impulse physics on a virtual world
 *   - ui.scoreboard (ScoreBoard) — Score + Best with localStorage persistence
 *   - resources.swatches — palette tokens
 *
 * Wait-for-first-input gate per wisdom lb-005: bird sits mid-screen until the
 * first flap. Tap anywhere on the canvas or press Space to flap. After a death,
 * the next tap restarts.
 */
export class McFlappyAssembly {
  constructor(options = {}) {
    this.canvas = document.getElementById(options.canvasId || "gameCanvas");
    this.ctx = this.canvas?.getContext("2d") ?? null;
    this.rootSelector = options.root || "[data-web-component-example='flappy-tap-to-flap']";
    this.root = document.querySelector(this.rootSelector);

    const swatch = options.swatch || getSwatchByID("retro-neon");
    if (this.root && swatch) {
      applySwatchVariables(this.root, swatch);
    }

    this.game = new FlappyBird({
      width: this.canvas?.width ?? 360,
      height: this.canvas?.height ?? 640,
      gravity: 1400,
      flapImpulse: -360,
      pipeSpeed: 140,
      pipeGap: 170,
      pipeIntervalSeconds: 1.6
    });

    this.scoreBoard = new ScoreBoard({
      target: options.hudTarget || "#hudMount",
      scoreLabel: "Score",
      highScoreLabel: "Best",
      storageKey: "flappy-classic.bestScore",
      persistHighScore: true
    });

    this.meta = document.querySelector(options.metaTarget || "#metaMount");
    this.message = document.querySelector(options.messageTarget || "#messageMount");

    this.lastTime = null;
    this.rafHandle = null;
    this.awaitingFirstInput = true;
  }

  start() {
    this.game.newGame();
    this.scoreBoard.setScore(0);
    this.awaitingFirstInput = true;
    this._showMessage("Tap to flap. Avoid the pipes.");
    this._draw();
    this._bindInputs();
    this._updateMeta();
  }

  _bindInputs() {
    if (this._inputsBound) return;
    this._inputsBound = true;

    const flapHandler = (e) => {
      if (e?.preventDefault) e.preventDefault();
      this._onFlap();
    };

    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" || e.code === "ArrowUp") flapHandler(e);
    }, { passive: false });

    if (this.canvas) {
      this.canvas.addEventListener("pointerdown", flapHandler, { passive: false });
    }
  }

  _onFlap() {
    if (this.game.isGameOver()) {
      this.start();
      return;
    }
    if (this.awaitingFirstInput) {
      this.awaitingFirstInput = false;
      this._hideMessage();
      this.lastTime = performance.now();
      this._scheduleFrame();
    }
    this.game.flap();
  }

  _scheduleFrame() {
    cancelAnimationFrame(this.rafHandle);
    this.rafHandle = requestAnimationFrame((t) => this._frame(t));
  }

  _frame(t) {
    if (this.lastTime == null) this.lastTime = t;
    const dt = Math.min(0.04, (t - this.lastTime) / 1000);
    this.lastTime = t;
    const result = this.game.tick(dt);
    if (result.scored > 0) this.scoreBoard.setScore(this.game.score);
    this._draw();
    this._updateMeta();
    if (result.died) {
      this._showMessage(`Game Over — score ${this.game.score}. Tap to restart.`);
      return;
    }
    this._scheduleFrame();
  }

  _draw() {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const groundH = this.game.groundHeight;

    // Sky
    const grad = ctx.createLinearGradient(0, 0, 0, H - groundH);
    grad.addColorStop(0, "#7dd3fc");
    grad.addColorStop(1, "#e0f2fe");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H - groundH);

    // Ground
    ctx.fillStyle = "#65a30d";
    ctx.fillRect(0, H - groundH, W, groundH);
    ctx.fillStyle = "#a3e635";
    ctx.fillRect(0, H - groundH, W, 8);

    // Pipes
    ctx.fillStyle = "#16a34a";
    for (const pipe of this.game.pipes) {
      ctx.fillRect(pipe.x, 0, this.game.pipeWidth, pipe.gapTop);
      ctx.fillRect(pipe.x, pipe.gapBottom, this.game.pipeWidth, H - groundH - pipe.gapBottom);
      // Lip
      ctx.fillStyle = "#15803d";
      ctx.fillRect(pipe.x - 3, pipe.gapTop - 14, this.game.pipeWidth + 6, 14);
      ctx.fillRect(pipe.x - 3, pipe.gapBottom, this.game.pipeWidth + 6, 14);
      ctx.fillStyle = "#16a34a";
    }

    // Bird (circle with eye + beak)
    const bx = this.game.birdX;
    const by = this.game.bird.y;
    const r = this.game.birdRadius;
    ctx.fillStyle = "#fde047";
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(bx + r * 0.35, by - r * 0.2, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.arc(bx + r * 0.45, by - r * 0.2, r * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ea580c";
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.lineTo(bx + r * 1.6, by - r * 0.15);
    ctx.lineTo(bx + r * 1.6, by + r * 0.15);
    ctx.closePath();
    ctx.fill();
  }

  _updateMeta() {
    if (!this.meta) return;
    this.meta.textContent = `Pipes ${this.game.pipes.length}  •  Speed ${this.game.pipeSpeed}px/s`;
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
