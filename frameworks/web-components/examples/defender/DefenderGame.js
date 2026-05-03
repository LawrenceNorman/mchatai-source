import { GameManager } from "../../core/GameManager.js";
import { intersectsCircle } from "../../core/Physics2D.js";
import { Entity } from "../../entities/Entity.js";
import { Projectile } from "../../entities/Projectile.js";
import { CameraFollow } from "../../entities/CameraFollow.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { AudioManager } from "../../resources/AudioManager.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";

const WIDTH = 820;
const HEIGHT = 460;
const WORLD_WIDTH = 2400;
const TERRAIN_Y = 372;

function defenderQuery(selector) {
  return document.querySelector(selector);
}

class DefenderShip extends Entity {
  constructor(options = {}) {
    super({ x: 140, y: 210, radius: 16, width: 34, height: 18, centered: true, ...options });
    this.facing = 1;
    this.input = { left: false, right: false, up: false, down: false, fire: false };
    this.fireTimer = 0;
  }

  update(dt) {
    const ax = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
    const ay = (this.input.down ? 1 : 0) - (this.input.up ? 1 : 0);
    if (ax !== 0) this.facing = Math.sign(ax);
    this.vx = ax * 280;
    this.vy = ay * 220;
    this.x = Math.max(0, Math.min(WORLD_WIDTH, this.x + this.vx * dt));
    this.y = Math.max(64, Math.min(TERRAIN_Y - 36, this.y + this.vy * dt));
    this.fireTimer = Math.max(0, this.fireTimer - dt);
  }

  createShot() {
    if (this.fireTimer > 0) return null;
    this.fireTimer = 0.16;
    return new Projectile({
      x: this.x + this.facing * 22,
      y: this.y,
      vx: this.facing * 620,
      vy: 0,
      angle: this.facing > 0 ? 0 : Math.PI,
      ttl: 1.1,
      radius: 4,
      color: "#22d3ee"
    });
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.facing, 1);
    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-14, -12);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-14, 12);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

export class DefenderGame {
  constructor(options = {}) {
    this.canvas = options.canvas;
    this.ctx = this.canvas.getContext("2d");
    this.ship = new DefenderShip();
    this.camera = new CameraFollow({
      lerp: 0.14,
      bounds: { x: 0, y: 0, width: WORLD_WIDTH, height: HEIGHT }
    });
    this.audio = new AudioManager({ masterVolume: 0.05 });
    this.scoreboard = new ScoreBoard({
      target: options.scoreboardTarget,
      storageKey: "mchatai.defender.best",
      scoreLabel: "Score",
      highScoreLabel: "Best"
    });
    this.engine = new GameManager({
      canvas: this.canvas,
      width: WIDTH,
      height: HEIGHT,
      clearEachFrame: false,
      onUpdate: (dt) => this.update(dt),
      onDraw: () => this.draw()
    });
    this.engine.addEntity(this.ship);
    this.projectiles = [];
    this.enemies = [];
    this.humans = [];
    this.wave = 1;
    this.lives = 3;
    this.spawnTimer = 0;
    this.message = defenderQuery("#message");
    this.livesEl = defenderQuery("#lives");
    this.humansEl = defenderQuery("#humans");
    this.waveEl = defenderQuery("#wave");
  }

  start() {
    applySwatchVariables(document.documentElement, getSwatchByID("vector-noir"));
    this.bindInput();
    defenderQuery("#restartButton").addEventListener("click", () => this.restart());
    this.seedWave();
    this.engine.step(0);
    this.engine.start();
  }

  bindInput() {
    window.addEventListener("keydown", (event) => this.setKey(event, true));
    window.addEventListener("keyup", (event) => this.setKey(event, false));
  }

  setKey(event, pressed) {
    if (["ArrowLeft", "a", "A"].includes(event.key)) this.ship.input.left = pressed;
    if (["ArrowRight", "d", "D"].includes(event.key)) this.ship.input.right = pressed;
    if (["ArrowUp", "w", "W"].includes(event.key)) this.ship.input.up = pressed;
    if (["ArrowDown", "s", "S"].includes(event.key)) this.ship.input.down = pressed;
    if (event.key === " ") {
      this.ship.input.fire = pressed;
      event.preventDefault();
    }
  }

  seedWave() {
    this.humans = Array.from({ length: 5 }, (_, index) => ({
      x: 260 + index * 420,
      y: TERRAIN_Y - 10,
      carried: false,
      safe: true
    }));
    this.enemies = Array.from({ length: 4 + this.wave }, (_, index) => this.createEnemy(420 + index * 320));
  }

  createEnemy(x) {
    return {
      x,
      y: 90 + Math.random() * 160,
      radius: 16,
      vx: (Math.random() > 0.5 ? 1 : -1) * (46 + this.wave * 8),
      abducting: null
    };
  }

  update(dt) {
    if (this.ship.input.fire) {
      const shot = this.ship.createShot();
      if (shot) {
        this.projectiles.push(shot);
        this.engine.addEntity(shot);
        this.audio.beep({ freq: 720, duration: 0.035, type: "square" });
      }
    }
    this.camera.follow(this.ship, { width: WIDTH, height: HEIGHT });
    this.updateEnemies(dt);
    this.resolveShots();
    this.resolveCollisions();
    this.projectiles = this.projectiles.filter((projectile) => projectile.active !== false);
    if (this.enemies.length === 0) {
      this.wave += 1;
      this.scoreboard.add(500);
      this.message.textContent = `Wave ${this.wave}.`;
      this.seedWave();
    }
    this.updateHUD();
  }

  updateEnemies(dt) {
    this.enemies.forEach((enemy) => {
      enemy.x += enemy.vx * dt;
      if (enemy.x < 0 || enemy.x > WORLD_WIDTH) enemy.vx *= -1;
      const target = enemy.abducting || this.nearestHuman(enemy);
      if (target && Math.abs(enemy.x - target.x) < 26) {
        enemy.abducting = target;
        target.carried = true;
        target.safe = false;
        target.y = enemy.y + 24;
        enemy.y -= 35 * dt;
      } else if (target) {
        enemy.vx = Math.sign(target.x - enemy.x) * Math.abs(enemy.vx);
      }
      if (enemy.abducting) {
        enemy.abducting.x = enemy.x;
        enemy.abducting.y = enemy.y + 24;
        if (enemy.y < 42) {
          this.message.textContent = "A human was abducted.";
          this.humans = this.humans.filter((human) => human !== enemy.abducting);
          enemy.abducting = null;
        }
      }
    });
  }

  nearestHuman(enemy) {
    return this.humans
      .filter((human) => human.safe)
      .sort((a, b) => Math.abs(a.x - enemy.x) - Math.abs(b.x - enemy.x))[0] || null;
  }

  resolveShots() {
    for (const shot of this.projectiles.slice()) {
      for (const enemy of this.enemies.slice()) {
        if (!intersectsCircle(shot, enemy, 4)) continue;
        shot.destroy();
        if (enemy.abducting) {
          enemy.abducting.carried = false;
          enemy.abducting.safe = true;
          enemy.abducting.y = TERRAIN_Y - 10;
        }
        this.enemies = this.enemies.filter((candidate) => candidate !== enemy);
        this.scoreboard.add(100);
        this.audio.noise({ duration: 0.06, volume: 0.025 });
        break;
      }
    }
  }

  resolveCollisions() {
    for (const enemy of this.enemies) {
      if (!intersectsCircle(this.ship, enemy, 4)) continue;
      this.lives -= 1;
      this.ship.x = Math.max(120, this.camera.x + 120);
      this.ship.y = 210;
      this.message.textContent = this.lives > 0 ? "Ship hit. Keep defending." : "Fleet lost. Restarting.";
      if (this.lives <= 0) {
        this.restart();
      }
      break;
    }
  }

  restart() {
    this.projectiles.forEach((projectile) => projectile.destroy());
    this.projectiles = [];
    this.wave = 1;
    this.lives = 3;
    this.ship.x = 140;
    this.ship.y = 210;
    this.scoreboard.reset();
    this.seedWave();
    this.message.textContent = "Arrow keys or WASD to fly. Space to fire.";
  }

  updateHUD() {
    this.livesEl.textContent = String(this.lives);
    this.humansEl.textContent = String(this.humans.length);
    this.waveEl.textContent = String(this.wave);
  }

  draw() {
    this.ctx.clearRect(0, 0, WIDTH, HEIGHT);
    this.ctx.save();
    this.camera.apply(this.ctx);
    this.drawStars();
    this.drawTerrain();
    this.humans.forEach((human) => this.drawHuman(human));
    this.enemies.forEach((enemy) => this.drawEnemy(enemy));
    this.ship.draw(this.ctx);
    this.ctx.restore();
    this.drawRadar();
  }

  drawStars() {
    this.ctx.fillStyle = "#020617";
    this.ctx.fillRect(this.camera.x, 0, WIDTH, HEIGHT);
    this.ctx.fillStyle = "rgba(248,250,252,0.35)";
    for (let x = 0; x < WORLD_WIDTH; x += 90) {
      const y = 34 + ((x * 37) % 190);
      this.ctx.fillRect(x, y, 2, 2);
    }
  }

  drawTerrain() {
    this.ctx.strokeStyle = "#22d3ee";
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    for (let x = 0; x <= WORLD_WIDTH; x += 40) {
      const y = TERRAIN_Y + Math.sin(x * 0.015) * 22;
      if (x === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    }
    this.ctx.stroke();
  }

  drawHuman(human) {
    this.ctx.fillStyle = human.carried ? "#fb923c" : "#f8fafc";
    this.ctx.fillRect(human.x - 5, human.y - 16, 10, 24);
  }

  drawEnemy(enemy) {
    this.ctx.strokeStyle = "#fb7185";
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
    this.ctx.moveTo(enemy.x - 20, enemy.y);
    this.ctx.lineTo(enemy.x + 20, enemy.y);
    this.ctx.stroke();
  }

  drawRadar() {
    const x = 80;
    const y = 28;
    const width = WIDTH - 160;
    const scale = width / WORLD_WIDTH;
    this.ctx.fillStyle = "rgba(15,23,42,0.82)";
    this.ctx.fillRect(x, y, width, 18);
    this.ctx.fillStyle = "#22d3ee";
    this.ctx.fillRect(x + this.ship.x * scale - 3, y + 3, 6, 12);
    this.ctx.fillStyle = "#fb7185";
    this.enemies.forEach((enemy) => this.ctx.fillRect(x + enemy.x * scale - 2, y + 5, 4, 8));
    this.ctx.fillStyle = "#f8fafc";
    this.humans.forEach((human) => this.ctx.fillRect(x + human.x * scale - 1, y + 10, 2, 5));
  }
}
