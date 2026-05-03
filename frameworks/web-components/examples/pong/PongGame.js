import { GameManager } from "../../core/GameManager.js";
import { intersectsAABB } from "../../core/Physics2D.js";
import { Paddle } from "../../entities/Paddle.js";
import { Ball } from "../../entities/Ball.js";
import { PongAI } from "../../entities/PongAI.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { AudioManager } from "../../resources/AudioManager.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";

const WIDTH = 840;
const HEIGHT = 520;
const WIN_SCORE = 7;

function pongTarget(target) {
  return typeof target === "string" ? document.querySelector(target) : target;
}

function clampPongValue(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class PongGame {
  constructor(options = {}) {
    this.canvas = document.getElementById(options.canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.scoreboard = new ScoreBoard({
      target: pongTarget(options.scoreboardTarget),
      storageKey: "mchatai.pong.bestScore",
      scoreLabel: "Rally",
      highScoreLabel: "Best"
    });
    this.audio = new AudioManager({ masterVolume: 0.05 });
    this.playerScoreEl = pongTarget(options.playerScoreTarget);
    this.cpuScoreEl = pongTarget(options.cpuScoreTarget);
    this.roundEl = pongTarget(options.roundTarget);
    this.messageEl = pongTarget(options.messageTarget);
    this.serveButton = pongTarget(options.serveButton);
    this.resetButton = pongTarget(options.resetButton);

    this.player = new Paddle({ x: 28, y: HEIGHT / 2 - 50, width: 16, height: 100, speed: 430, color: "#22d3ee" });
    this.cpu = new Paddle({ x: WIDTH - 44, y: HEIGHT / 2 - 50, width: 16, height: 100, speed: 345, color: "#fb923c" });
    this.ball = new Ball({ x: WIDTH / 2, y: HEIGHT / 2, radius: 9, speed: 350, color: "#f7fbff" });
    this.cpuAI = new PongAI({
      paddle: this.cpu,
      ball: this.ball,
      bounds: { minY: 0, maxY: HEIGHT - this.cpu.height },
      delay: 110,
      error: 0.14
    });

    this.playerScore = 0;
    this.cpuScore = 0;
    this.round = 1;
    this.rally = 0;
    this.serving = true;
    this.keys = new Set();
    this.lastScorer = "player";

    this.engine = new GameManager({
      canvas: this.canvas,
      width: WIDTH,
      height: HEIGHT,
      clearColor: "#030712",
      onUpdate: (dt) => this.update(dt),
      onDraw: (ctx) => this.draw(ctx)
    });

    this.bindControls();
    applySwatchVariables(document.documentElement, getSwatchByID("retro-neon"));
    this.resetBall();
    this.renderHUD();
    this.engine.step(0);
  }

  start() {
    this.engine.start();
  }

  bindControls() {
    document.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if (["arrowup", "arrowdown", "w", "s", " "].includes(key)) {
        event.preventDefault();
      }
      if (key === " ") {
        this.serve();
      } else {
        this.keys.add(key);
      }
    });
    document.addEventListener("keyup", (event) => {
      this.keys.delete(event.key.toLowerCase());
    });
    this.serveButton?.addEventListener("click", () => this.serve());
    this.resetButton?.addEventListener("click", () => this.resetMatch());
    this.canvas.addEventListener("pointermove", (event) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleY = HEIGHT / rect.height;
      const y = (event.clientY - rect.top) * scaleY;
      this.player.y = clampPongValue(y - this.player.height / 2, 0, HEIGHT - this.player.height);
    });
  }

  serve() {
    if (!this.serving) {
      return;
    }
    const direction = this.lastScorer === "player" ? 1 : -1;
    const angle = (Math.random() * 0.5 - 0.25) + (direction > 0 ? 0 : Math.PI);
    this.ball.reset(WIDTH / 2, HEIGHT / 2, angle);
    this.serving = false;
    this.setMessage("Rally live.");
  }

  resetBall() {
    this.ball.x = WIDTH / 2;
    this.ball.y = HEIGHT / 2;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.serving = true;
  }

  resetMatch() {
    this.playerScore = 0;
    this.cpuScore = 0;
    this.round = 1;
    this.rally = 0;
    this.scoreboard.reset(0);
    this.resetBall();
    this.setMessage("Press Space or tap Serve.");
    this.renderHUD();
  }

  update(dt) {
    this.updatePlayer(dt);
    this.updateCPU(dt);

    if (this.serving) {
      this.ball.x = WIDTH / 2;
      this.ball.y = HEIGHT / 2;
      return;
    }

    this.ball.update(dt, this.engine);
    this.handleWallBounce();
    this.handlePaddleBounce(this.player, 1);
    this.handlePaddleBounce(this.cpu, -1);
    this.handleScore();
  }

  updatePlayer(dt) {
    let direction = 0;
    if (this.keys.has("arrowup") || this.keys.has("w")) {
      direction -= 1;
    }
    if (this.keys.has("arrowdown") || this.keys.has("s")) {
      direction += 1;
    }
    this.player.move(direction, dt, { minY: 0, maxY: HEIGHT - this.player.height });
  }

  updateCPU(dt) {
    this.cpuAI.update(dt);
  }

  handleWallBounce() {
    if (this.ball.y - this.ball.radius <= 0) {
      this.ball.y = this.ball.radius;
      this.ball.bounceY();
      this.audio.beep({ freq: 440, duration: 0.035, type: "triangle" });
    } else if (this.ball.y + this.ball.radius >= HEIGHT) {
      this.ball.y = HEIGHT - this.ball.radius;
      this.ball.bounceY();
      this.audio.beep({ freq: 440, duration: 0.035, type: "triangle" });
    }
  }

  handlePaddleBounce(paddle, direction) {
    if (!intersectsAABB(this.ball.getAABB(), paddle.getAABB())) {
      return;
    }
    const paddleCenter = paddle.y + paddle.height / 2;
    const offset = (this.ball.y - paddleCenter) / (paddle.height / 2);
    this.ball.x = direction > 0 ? paddle.x + paddle.width + this.ball.radius : paddle.x - this.ball.radius;
    this.ball.vx = Math.abs(this.ball.vx || this.ball.speed) * direction;
    this.ball.vy = offset * 260;
    this.rally += 1;
    this.scoreboard.setScore(this.rally);
    this.audio.beep({ freq: 520 + this.rally * 8, duration: 0.045, type: "square" });
  }

  handleScore() {
    if (this.ball.x + this.ball.radius < 0) {
      this.cpuScore += 1;
      this.lastScorer = "cpu";
      this.afterPoint("CPU scores.");
    } else if (this.ball.x - this.ball.radius > WIDTH) {
      this.playerScore += 1;
      this.lastScorer = "player";
      this.afterPoint("Player scores.");
    }
  }

  afterPoint(message) {
    this.round += 1;
    this.rally = 0;
    this.resetBall();
    this.audio.noise({ duration: 0.08, volume: 0.035 });
    if (this.playerScore >= WIN_SCORE || this.cpuScore >= WIN_SCORE) {
      const winner = this.playerScore > this.cpuScore ? "Player" : "CPU";
      this.setMessage(`${winner} wins the match. Reset or serve a new match.`);
      this.playerScore = 0;
      this.cpuScore = 0;
      this.round = 1;
    } else {
      this.setMessage(`${message} Serve when ready.`);
    }
    this.renderHUD();
  }

  renderHUD() {
    this.playerScoreEl.textContent = String(this.playerScore);
    this.cpuScoreEl.textContent = String(this.cpuScore);
    this.roundEl.textContent = String(this.round);
  }

  setMessage(message) {
    this.messageEl.textContent = message;
  }

  draw(ctx) {
    this.drawCourt(ctx);
    this.player.draw(ctx);
    this.cpu.draw(ctx);
    this.ball.draw(ctx);
    if (this.serving) {
      this.drawServeCue(ctx);
    }
  }

  drawCourt(ctx) {
    ctx.save();
    ctx.strokeStyle = "rgba(247, 251, 255, 0.18)";
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 18]);
    ctx.beginPath();
    ctx.moveTo(WIDTH / 2, 24);
    ctx.lineTo(WIDTH / 2, HEIGHT - 24);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(34, 211, 238, 0.26)";
    ctx.strokeRect(14, 14, WIDTH - 28, HEIGHT - 28);
    ctx.restore();
  }

  drawServeCue(ctx) {
    ctx.save();
    ctx.fillStyle = "rgba(247, 251, 255, 0.64)";
    ctx.font = "700 22px Avenir Next, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("SERVE", WIDTH / 2, HEIGHT / 2 + 52);
    ctx.restore();
  }
}
