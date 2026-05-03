import { GameManager } from "../../core/GameManager.js";
import { intersectsCircle } from "../../core/Physics2D.js";
import { GridBoard } from "../../entities/GridBoard.js";
import { PathFollower } from "../../entities/PathFollower.js";
import { Projectile } from "../../entities/Projectile.js";
import { WaveManager } from "../../entities/WaveManager.js";
import { Turret } from "../../entities/Turret.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { AudioManager } from "../../resources/AudioManager.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";

const WIDTH = 720;
const HEIGHT = 480;
const TILE = 60;
const PATH = [
  { x: 0, y: 240 },
  { x: 150, y: 240 },
  { x: 150, y: 120 },
  { x: 360, y: 120 },
  { x: 360, y: 330 },
  { x: 590, y: 330 },
  { x: 720, y: 210 }
];
const BUILD_PADS = [
  { x: 90, y: 150 },
  { x: 250, y: 210 },
  { x: 430, y: 210 },
  { x: 520, y: 390 },
  { x: 610, y: 150 }
];

function tdQuery(selector) {
  return document.querySelector(selector);
}

export class TowerDefenseGame {
  constructor(options = {}) {
    this.canvas = options.canvas;
    this.ctx = this.canvas.getContext("2d");
    this.board = new GridBoard({ rows: 8, cols: 12, tileSize: TILE });
    this.audio = new AudioManager({ masterVolume: 0.05 });
    this.scoreboard = new ScoreBoard({
      target: options.scoreboardTarget,
      storageKey: "mchatai.towerDefense.best",
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
    this.waveManager = new WaveManager({
      waves: [
        { count: 8, interval: 0.65, speed: 48, hp: 2 },
        { count: 12, interval: 0.52, speed: 58, hp: 3 },
        { count: 16, interval: 0.42, speed: 66, hp: 4 }
      ],
      spawn: ({ wave }) => this.spawnEnemy(wave)
    });
    this.enemies = [];
    this.projectiles = [];
    this.turrets = [];
    this.lives = 20;
    this.gold = 80;
    this.message = tdQuery("#message");
    this.livesEl = tdQuery("#lives");
    this.goldEl = tdQuery("#gold");
    this.waveEl = tdQuery("#wave");
  }

  start() {
    applySwatchVariables(document.documentElement, getSwatchByID("sunset-arcade"));
    tdQuery("#startWaveButton").addEventListener("click", () => this.startWave());
    this.canvas.addEventListener("click", (event) => this.handleBuildClick(event));
    this.seedTurret(BUILD_PADS[1]);
    this.engine.step(0);
    this.engine.start();
  }

  startWave() {
    if (!this.waveManager.active) {
      this.waveManager.start(Math.min(this.waveManager.waveIndex + 1, this.waveManager.waves.length - 1));
      this.message.textContent = `Wave ${this.waveManager.waveIndex + 1} incoming.`;
    }
  }

  spawnEnemy(wave) {
    const enemy = new PathFollower({
      x: PATH[0].x,
      y: PATH[0].y,
      path: PATH,
      speed: wave.speed,
      radius: 14,
      width: 28,
      height: 28,
      faction: "enemy"
    });
    enemy.hp = wave.hp;
    enemy.reward = 8 + wave.hp * 2;
    enemy.color = wave.hp > 3 ? "#fb7185" : "#f97316";
    this.enemies.push(enemy);
    this.engine.addEntity(enemy);
    return enemy;
  }

  seedTurret(pad) {
    const turret = new Turret({
      x: pad.x,
      y: pad.y,
      faction: "tower",
      range: 150,
      cooldown: 0.55,
      projectileFactory: (tower, target) => this.createProjectile(tower, target)
    });
    this.turrets.push(turret);
    this.engine.addEntity(turret);
  }

  createProjectile(tower, target) {
    const angle = Math.atan2(target.y - tower.y, target.x - tower.x);
    const projectile = new Projectile({
      x: tower.x,
      y: tower.y,
      angle,
      speed: 390,
      ttl: 0.75,
      radius: 4,
      faction: "tower",
      color: "#facc15"
    });
    projectile.damage = 1;
    this.projectiles.push(projectile);
    return projectile;
  }

  handleBuildClick(event) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const scaleY = HEIGHT / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    const pad = BUILD_PADS.find((candidate) => Math.hypot(candidate.x - x, candidate.y - y) < 34);
    if (!pad) {
      this.message.textContent = "Build only on glowing pads.";
      return;
    }
    if (this.turrets.some((turret) => Math.hypot(turret.x - pad.x, turret.y - pad.y) < 8)) {
      this.message.textContent = "That pad already has a turret.";
      return;
    }
    if (this.gold < 30) {
      this.message.textContent = "Need 30 gold for a turret.";
      return;
    }
    this.gold -= 30;
    this.seedTurret(pad);
    this.audio.beep({ freq: 520, duration: 0.07, type: "triangle" });
  }

  update(dt) {
    this.waveManager.update(dt);
    this.enemies = this.enemies.filter((enemy) => {
      if (enemy.arrived) {
        this.lives -= 1;
        enemy.destroy();
        return false;
      }
      return enemy.active !== false;
    });
    this.projectiles = this.projectiles.filter((projectile) => projectile.active !== false);
    this.resolveHits();
    if (this.lives <= 0) {
      this.lives = 20;
      this.gold = 80;
      this.scoreboard.reset();
      this.message.textContent = "Base breached. Fresh defense ready.";
      this.clearEnemies();
    }
    this.updateHUD();
  }

  resolveHits() {
    for (const projectile of this.projectiles.slice()) {
      for (const enemy of this.enemies.slice()) {
        if (!intersectsCircle(projectile, enemy)) {
          continue;
        }
        enemy.hp -= projectile.damage;
        projectile.destroy();
        if (enemy.hp <= 0) {
          enemy.destroy();
          this.gold += enemy.reward;
          this.scoreboard.add(enemy.reward);
          this.audio.beep({ freq: 740, duration: 0.04, type: "square" });
        }
        break;
      }
    }
  }

  clearEnemies() {
    [...this.enemies, ...this.projectiles].forEach((entity) => entity.destroy());
    this.enemies = [];
    this.projectiles = [];
  }

  updateHUD() {
    this.livesEl.textContent = String(this.lives);
    this.goldEl.textContent = String(this.gold);
    this.waveEl.textContent = String(Math.max(1, this.waveManager.waveIndex + 1));
  }

  draw() {
    this.ctx.clearRect(0, 0, WIDTH, HEIGHT);
    this.drawGrid();
    this.drawPath();
    this.drawPads();
  }

  drawGrid() {
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
    for (let x = 0; x <= WIDTH; x += TILE) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, HEIGHT);
      this.ctx.stroke();
    }
    for (let y = 0; y <= HEIGHT; y += TILE) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(WIDTH, y);
      this.ctx.stroke();
    }
  }

  drawPath() {
    this.ctx.strokeStyle = "#8b5e34";
    this.ctx.lineWidth = 46;
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    this.ctx.beginPath();
    PATH.forEach((point, index) => {
      if (index === 0) {
        this.ctx.moveTo(point.x, point.y);
      } else {
        this.ctx.lineTo(point.x, point.y);
      }
    });
    this.ctx.stroke();
  }

  drawPads() {
    BUILD_PADS.forEach((pad) => {
      const occupied = this.turrets.some((turret) => Math.hypot(turret.x - pad.x, turret.y - pad.y) < 8);
      this.ctx.fillStyle = occupied ? "rgba(250, 204, 21, 0.15)" : "rgba(34, 197, 94, 0.2)";
      this.ctx.strokeStyle = occupied ? "#facc15" : "#22c55e";
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(pad.x, pad.y, 25, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
    });
  }
}
