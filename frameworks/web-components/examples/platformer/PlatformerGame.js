import { GameManager } from "../../core/GameManager.js";
import { intersectsAABB } from "../../core/Physics2D.js";
import { GridBoard } from "../../entities/GridBoard.js";
import { PlatformerPlayer } from "../../entities/PlatformerPlayer.js";
import { CameraFollow } from "../../entities/CameraFollow.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { VirtualJoystick } from "../../ui/VirtualJoystick.js";
import { AudioManager } from "../../resources/AudioManager.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";

const WIDTH = 760;
const HEIGHT = 430;
const WORLD_WIDTH = 1700;
const GROUND_Y = 360;
const PLATFORMS = [
  { x: 0, y: GROUND_Y, width: 520, height: 44 },
  { x: 610, y: GROUND_Y, width: 360, height: 44 },
  { x: 1080, y: GROUND_Y, width: 620, height: 44 },
  { x: 260, y: 270, width: 170, height: 24 },
  { x: 690, y: 240, width: 150, height: 24 },
  { x: 1010, y: 285, width: 180, height: 24 },
  { x: 1330, y: 230, width: 190, height: 24 }
];
const COINS = [
  { x: 310, y: 235, active: true },
  { x: 740, y: 205, active: true },
  { x: 1080, y: 250, active: true },
  { x: 1390, y: 195, active: true },
  { x: 1570, y: 315, active: true }
];
const HAZARDS = [
  { x: 540, y: 338, width: 42, height: 22 },
  { x: 980, y: 338, width: 48, height: 22 },
  { x: 1230, y: 338, width: 48, height: 22 }
];

function platformerQuery(selector) {
  return document.querySelector(selector);
}

export class PlatformerGame {
  constructor(options = {}) {
    this.canvas = options.canvas;
    this.ctx = this.canvas.getContext("2d");
    this.board = new GridBoard({ rows: 8, cols: 32, tileSize: 52 });
    this.camera = new CameraFollow({
      lerp: 0.18,
      bounds: { x: 0, y: 0, width: WORLD_WIDTH, height: HEIGHT }
    });
    this.player = new PlatformerPlayer({
      x: 54,
      y: 250,
      color: "#facc15",
      moveSpeed: 235,
      jumpSpeed: 560
    });
    this.audio = new AudioManager({ masterVolume: 0.055 });
    this.scoreboard = new ScoreBoard({
      target: options.scoreboardTarget,
      storageKey: "mchatai.platformer.best",
      scoreLabel: "Score",
      highScoreLabel: "Best"
    });
    this.joystick = new VirtualJoystick({
      target: options.joystickTarget,
      onChange: (value) => this.handleJoystick(value)
    });
    this.engine = new GameManager({
      canvas: this.canvas,
      width: WIDTH,
      height: HEIGHT,
      clearEachFrame: false,
      onUpdate: (dt) => this.update(dt),
      onDraw: () => this.draw()
    });
    this.input = { left: false, right: false, jump: false };
    this.lives = 3;
    this.coins = COINS.map((coin) => ({ ...coin }));
    this.livesEl = platformerQuery("#lives");
    this.coinsEl = platformerQuery("#coins");
    this.message = platformerQuery("#message");
  }

  start() {
    applySwatchVariables(document.documentElement, getSwatchByID("retro-neon"));
    window.addEventListener("keydown", (event) => this.setKey(event, true));
    window.addEventListener("keyup", (event) => this.setKey(event, false));
    platformerQuery("#restartButton").addEventListener("click", () => this.restart());
    this.engine.step(0);
    this.engine.start();
  }

  setKey(event, pressed) {
    if (["ArrowLeft", "a", "A"].includes(event.key)) this.input.left = pressed;
    if (["ArrowRight", "d", "D"].includes(event.key)) this.input.right = pressed;
    if ([" ", "ArrowUp", "w", "W"].includes(event.key)) this.input.jump = pressed;
  }

  handleJoystick(value) {
    this.input.left = value.active && value.x < -0.3;
    this.input.right = value.active && value.x > 0.3;
    this.input.jump = value.active && value.y < -0.45;
  }

  update(dt) {
    this.player.onGround = false;
    this.player.setInput(this.input);
    this.player.update(dt);
    this.resolvePlatforms();
    this.resolveCoins();
    this.resolveHazards();
    if (this.player.y > HEIGHT + 120) {
      this.loseLife("Fell into the gap.");
    }
    if (this.player.x > WORLD_WIDTH - 90) {
      this.scoreboard.add(250);
      this.message.textContent = "Stage clear. Run it again.";
      this.restart(true);
    }
    this.player.x = Math.max(0, Math.min(WORLD_WIDTH - this.player.width, this.player.x));
    this.camera.follow(this.player, { width: WIDTH, height: HEIGHT });
    this.updateHUD();
  }

  resolvePlatforms() {
    for (const platform of PLATFORMS) {
      const falling = this.player.vy >= 0;
      const playerBottom = this.player.y + this.player.height;
      const previousBottom = playerBottom - this.player.vy * (1 / 60);
      if (
        falling &&
        this.player.x + this.player.width > platform.x &&
        this.player.x < platform.x + platform.width &&
        playerBottom >= platform.y &&
        previousBottom <= platform.y + 18
      ) {
        this.player.landOn(platform.y);
      }
    }
  }

  resolveCoins() {
    this.coins.forEach((coin) => {
      if (!coin.active) return;
      if (Math.hypot(this.player.x + this.player.width / 2 - coin.x, this.player.y + 12 - coin.y) < 28) {
        coin.active = false;
        this.scoreboard.add(25);
        this.audio.beep({ freq: 880, duration: 0.055, type: "triangle" });
      }
    });
  }

  resolveHazards() {
    HAZARDS.forEach((hazard) => {
      if (intersectsAABB(this.player, hazard)) {
        this.loseLife("Ouch. Hazard hit.");
      }
    });
  }

  loseLife(message) {
    this.lives -= 1;
    this.message.textContent = message;
    this.player.x = 54;
    this.player.y = 250;
    this.player.vx = 0;
    this.player.vy = 0;
    if (this.lives <= 0) {
      this.restart();
    }
  }

  restart(keepScore = false) {
    this.lives = 3;
    this.player.x = 54;
    this.player.y = 250;
    this.player.vx = 0;
    this.player.vy = 0;
    this.coins = COINS.map((coin) => ({ ...coin }));
    if (!keepScore) {
      this.scoreboard.reset();
    }
    this.message.textContent = "Arrow keys or WASD to run. Space to jump.";
  }

  updateHUD() {
    this.livesEl.textContent = String(this.lives);
    this.coinsEl.textContent = String(this.coins.filter((coin) => !coin.active).length);
  }

  draw() {
    this.ctx.clearRect(0, 0, WIDTH, HEIGHT);
    this.ctx.save();
    this.camera.apply(this.ctx);
    this.drawSky();
    PLATFORMS.forEach((platform) => this.drawPlatform(platform));
    HAZARDS.forEach((hazard) => this.drawHazard(hazard));
    this.coins.filter((coin) => coin.active).forEach((coin) => this.drawCoin(coin));
    this.player.draw(this.ctx);
    this.drawGoal();
    this.ctx.restore();
  }

  drawSky() {
    this.ctx.fillStyle = "#0c1f32";
    this.ctx.fillRect(0, 0, WORLD_WIDTH, HEIGHT);
    this.ctx.fillStyle = "rgba(255,255,255,0.08)";
    for (let x = 80; x < WORLD_WIDTH; x += 180) {
      this.ctx.beginPath();
      this.ctx.arc(x, 70 + (x % 90), 20, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  drawPlatform(platform) {
    this.ctx.fillStyle = "#22c55e";
    this.ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
    this.ctx.fillStyle = "#166534";
    this.ctx.fillRect(platform.x, platform.y + platform.height - 12, platform.width, 12);
  }

  drawHazard(hazard) {
    this.ctx.fillStyle = "#fb7185";
    this.ctx.beginPath();
    this.ctx.moveTo(hazard.x, hazard.y + hazard.height);
    this.ctx.lineTo(hazard.x + hazard.width / 2, hazard.y);
    this.ctx.lineTo(hazard.x + hazard.width, hazard.y + hazard.height);
    this.ctx.closePath();
    this.ctx.fill();
  }

  drawCoin(coin) {
    this.ctx.fillStyle = "#facc15";
    this.ctx.beginPath();
    this.ctx.arc(coin.x, coin.y, 12, 0, Math.PI * 2);
    this.ctx.fill();
  }

  drawGoal() {
    this.ctx.fillStyle = "#38bdf8";
    this.ctx.fillRect(WORLD_WIDTH - 80, GROUND_Y - 96, 26, 96);
    this.ctx.fillStyle = "#facc15";
    this.ctx.fillRect(WORLD_WIDTH - 80, GROUND_Y - 96, 70, 22);
  }
}
