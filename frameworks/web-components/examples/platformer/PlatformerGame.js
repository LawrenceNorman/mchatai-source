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
    this.audio = (typeof AudioManager === "function") ? new AudioManager({ masterVolume: 0.055 }) : { beep: () => {}, noise: () => {}, fadeIn: () => {}, fadeOut: () => {}, stop: () => {}, loop: () => {}, stopMusic: () => {}, play: () => {} };
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
    if (typeof applySwatchVariables === "function" && typeof getSwatchByID === "function") {
      applySwatchVariables(document.documentElement, getSwatchByID("retro-neon"));
    }
    // Robust keyboard binding: window-capture + canvas focus. User
    // reported "keys DO NOT WORK" in WebView/iframe hosts where window
    // keydown can be eaten by the host shell before reaching the page.
    // capture:true delivers the event before any other listener; the
    // canvas tabindex + initial focus ensures the document tree owns
    // focus on load so keystrokes route to our listener immediately.
    window.addEventListener("keydown", (event) => this.setKey(event, true), { capture: true });
    window.addEventListener("keyup", (event) => this.setKey(event, false), { capture: true });
    if (this.canvas) {
      this.canvas.tabIndex = 0;
      try { this.canvas.focus({ preventScroll: true }); } catch (_) { this.canvas.focus(); }
    }
    platformerQuery("#restartButton").addEventListener("click", () => this.restart());
    this.engine.step(0);
    this.engine.start();
  }

  setKey(event, pressed) {
    const k = event.key;
    let handled = false;
    if (["ArrowLeft", "a", "A"].includes(k)) { this.input.left = pressed; handled = true; }
    if (["ArrowRight", "d", "D"].includes(k)) { this.input.right = pressed; handled = true; }
    if ([" ", "ArrowUp", "w", "W"].includes(k)) { this.input.jump = pressed; handled = true; }
    if (handled) {
      // Prevent page scroll on arrow/space when we own the input. Without
      // this the browser scrolls the document on every keypress and the
      // canvas drifts out of view, making it look like "keys don't work."
      event.preventDefault();
    }
  }

  handleJoystick(value) {
    this.input.left = value.active && value.x < -0.3;
    this.input.right = value.active && value.x > 0.3;
    this.input.jump = value.active && value.y < -0.45;
  }

  update(dt) {
    // BUG-FIX 2026-05-07: previously did `this.player.onGround = false`
    // here, BEFORE player.update(dt). PlatformerPlayer.update() reads
    // onGround to set the coyote timer, so the reset wiped the coyote
    // window every frame and the jump check never fired
    // (`_coyoteTimer > 0 && _jumpBufferTimer > 0` was never both true).
    // resolvePlatforms() now owns the onGround state — sets true on
    // contact, false when no platform contact this frame.
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
    let landed = false;
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
        landed = true;
      }
    }
    if (!landed) this.player.onGround = false;
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
    // Sunrise gradient + parallax cloud puffs + distant mountains for
    // depth instead of flat dark blue with a few stamped circles.
    const skyGrad = this.ctx.createLinearGradient(0, 0, 0, HEIGHT);
    skyGrad.addColorStop(0, "#1e3a5f");
    skyGrad.addColorStop(0.55, "#fb923c");
    skyGrad.addColorStop(1, "#fed7aa");
    this.ctx.fillStyle = skyGrad;
    this.ctx.fillRect(0, 0, WORLD_WIDTH, HEIGHT);
    // distant mountains (slow parallax)
    this.ctx.fillStyle = "rgba(15, 23, 42, 0.55)";
    for (let x = 0; x < WORLD_WIDTH; x += 320) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, GROUND_Y);
      this.ctx.lineTo(x + 160, GROUND_Y - 130);
      this.ctx.lineTo(x + 320, GROUND_Y);
      this.ctx.closePath();
      this.ctx.fill();
    }
    // cloud puffs (clusters of overlapping circles for fluffier look)
    this.ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let x = 80; x < WORLD_WIDTH; x += 240) {
      const y = 60 + (x % 90);
      this.ctx.beginPath();
      this.ctx.arc(x, y, 18, 0, Math.PI * 2);
      this.ctx.arc(x + 18, y - 4, 22, 0, Math.PI * 2);
      this.ctx.arc(x + 38, y, 16, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  drawPlatform(platform) {
    // Brick-textured platform with grass crown. Replaces the flat
    // green rect — gives platforms a tactile read.
    const { x, y, width, height } = platform;
    // grass crown
    const crown = this.ctx.createLinearGradient(0, y, 0, y + 14);
    crown.addColorStop(0, "#86efac");
    crown.addColorStop(1, "#16a34a");
    this.ctx.fillStyle = crown;
    this.ctx.fillRect(x, y, width, 14);
    // dirt/brick body
    const dirt = this.ctx.createLinearGradient(0, y + 14, 0, y + height);
    dirt.addColorStop(0, "#92400e");
    dirt.addColorStop(1, "#451a03");
    this.ctx.fillStyle = dirt;
    this.ctx.fillRect(x, y + 14, width, height - 14);
    // brick lines
    this.ctx.strokeStyle = "rgba(0,0,0,0.28)";
    this.ctx.lineWidth = 1;
    for (let bx = x; bx < x + width; bx += 28) {
      this.ctx.beginPath();
      this.ctx.moveTo(bx, y + 14);
      this.ctx.lineTo(bx, y + height);
      this.ctx.stroke();
    }
    // grass tufts hanging over the crown
    this.ctx.fillStyle = "#22c55e";
    for (let gx = x + 4; gx < x + width; gx += 16) {
      this.ctx.fillRect(gx, y - 2, 2, 4);
      this.ctx.fillRect(gx + 7, y - 1, 2, 3);
    }
  }

  drawHazard(hazard) {
    // Spike row instead of a single tall triangle. Reads as obstacles.
    const { x, y, width, height } = hazard;
    const spikes = Math.max(2, Math.floor(width / 14));
    const sw = width / spikes;
    const grad = this.ctx.createLinearGradient(0, y, 0, y + height);
    grad.addColorStop(0, "#f87171");
    grad.addColorStop(1, "#7f1d1d");
    this.ctx.fillStyle = grad;
    for (let i = 0; i < spikes; i += 1) {
      const sx = x + i * sw;
      this.ctx.beginPath();
      this.ctx.moveTo(sx, y + height);
      this.ctx.lineTo(sx + sw / 2, y);
      this.ctx.lineTo(sx + sw, y + height);
      this.ctx.closePath();
      this.ctx.fill();
    }
    // glint
    this.ctx.fillStyle = "rgba(255,255,255,0.6)";
    for (let i = 0; i < spikes; i += 1) {
      const sx = x + i * sw + sw / 2 - 1;
      this.ctx.fillRect(sx, y + 4, 1.5, 4);
    }
  }

  drawCoin(coin) {
    // Animated spinning coin (sin-based width pulse to fake rotation)
    // + gold gradient + dot detail on the rim. Goes from "yellow circle"
    // to actual collectible vibe.
    const t = (this.engine?.elapsedTime ?? performance.now() / 1000) * 6;
    const w = 12 * (0.6 + 0.4 * Math.abs(Math.sin(t + coin.x * 0.01)));
    const grad = this.ctx.createRadialGradient(coin.x, coin.y, 1, coin.x, coin.y, 14);
    grad.addColorStop(0, "#fff7ce");
    grad.addColorStop(0.6, "#fbbf24");
    grad.addColorStop(1, "#a16207");
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.ellipse(coin.x, coin.y, w, 12, 0, 0, Math.PI * 2);
    this.ctx.fill();
    // rim highlight
    this.ctx.strokeStyle = "rgba(255, 240, 180, 0.7)";
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();
    // center "$" marker (subtle)
    this.ctx.fillStyle = "rgba(120, 70, 0, 0.55)";
    this.ctx.font = "bold 10px Avenir Next, sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText("$", coin.x, coin.y);
  }

  drawGoal() {
    // Flagpole + waving flag, not just two rectangles.
    const x = WORLD_WIDTH - 80;
    const top = GROUND_Y - 110;
    // pole
    this.ctx.fillStyle = "#cbd5e1";
    this.ctx.fillRect(x, top, 4, 110);
    // pole base ball
    this.ctx.fillStyle = "#fbbf24";
    this.ctx.beginPath();
    this.ctx.arc(x + 2, top, 5, 0, Math.PI * 2);
    this.ctx.fill();
    // waving flag (sin-based wave)
    const t = (this.engine?.elapsedTime ?? performance.now() / 1000) * 3;
    this.ctx.fillStyle = "#22c55e";
    this.ctx.beginPath();
    this.ctx.moveTo(x + 4, top + 4);
    for (let i = 0; i <= 10; i += 1) {
      const fx = x + 4 + i * 5;
      const fy = top + 4 + Math.sin(t + i * 0.6) * 3;
      this.ctx.lineTo(fx, fy);
    }
    this.ctx.lineTo(x + 4 + 50, top + 26);
    for (let i = 10; i >= 0; i -= 1) {
      const fx = x + 4 + i * 5;
      const fy = top + 26 + Math.sin(t + i * 0.6) * 3;
      this.ctx.lineTo(fx, fy);
    }
    this.ctx.closePath();
    this.ctx.fill();
    // ground pad
    this.ctx.fillStyle = "#a16207";
    this.ctx.fillRect(x - 8, GROUND_Y - 6, 22, 6);
  }
}
