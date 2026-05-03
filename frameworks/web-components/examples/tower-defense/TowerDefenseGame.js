import { GameManager } from "../../core/GameManager.js";
import { intersectsCircle } from "../../core/Physics2D.js";
import { GridBoard } from "../../entities/GridBoard.js";
import { PathFollower } from "../../entities/PathFollower.js";
import { Projectile } from "../../entities/Projectile.js";
import { WaveManager } from "../../entities/WaveManager.js";
import { Turret } from "../../entities/Turret.js";
import { TURRET_VARIANTS } from "../../entities/TurretVariants.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { AudioManager } from "../../resources/AudioManager.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";

const WIDTH = 1000;
const HEIGHT = 620;
const TILE = 60;

// Three "geographies" — different paths, themes, and build pads. The active geography
// rotates every 3 waves so the player has to rebuild and adapt strategy.
const GEOGRAPHIES = [
  {
    id: "meadow",
    name: "Meadow",
    bg: "#0d2e1a",
    pathColor: "#7a5a2c",
    pathColorAlt: "#946d3a",
    pattern: "grass",
    accent: "#86efac",
    path: [
      { x: 0, y: 200 }, { x: 200, y: 200 }, { x: 200, y: 80 },
      { x: 480, y: 80 }, { x: 480, y: 360 }, { x: 760, y: 360 },
      { x: 760, y: 540 }, { x: 1000, y: 540 }
    ],
    pads: [
      { x: 100, y: 110 }, { x: 100, y: 290 }, { x: 340, y: 80 },
      { x: 340, y: 240 }, { x: 580, y: 200 }, { x: 580, y: 460 },
      { x: 850, y: 280 }, { x: 850, y: 460 }, { x: 920, y: 360 }
    ]
  },
  {
    id: "desert",
    name: "Desert",
    bg: "#3a2a14",
    pathColor: "#7c5e3a",
    pathColorAlt: "#a07a4a",
    pattern: "sand",
    accent: "#fbbf24",
    path: [
      { x: 0, y: 480 }, { x: 220, y: 480 }, { x: 220, y: 280 },
      { x: 480, y: 280 }, { x: 480, y: 120 }, { x: 760, y: 120 },
      { x: 760, y: 380 }, { x: 1000, y: 380 }
    ],
    pads: [
      { x: 110, y: 380 }, { x: 110, y: 580 }, { x: 350, y: 200 },
      { x: 350, y: 380 }, { x: 580, y: 80 }, { x: 580, y: 260 },
      { x: 880, y: 200 }, { x: 880, y: 480 }, { x: 690, y: 480 }
    ]
  },
  {
    id: "ice",
    name: "Glacier",
    bg: "#0f2540",
    pathColor: "#3a4a5e",
    pathColorAlt: "#5a6a82",
    pattern: "snow",
    accent: "#67e8f9",
    path: [
      { x: 0, y: 100 }, { x: 280, y: 100 }, { x: 280, y: 320 },
      { x: 520, y: 320 }, { x: 520, y: 540 }, { x: 800, y: 540 },
      { x: 800, y: 200 }, { x: 1000, y: 200 }
    ],
    pads: [
      { x: 140, y: 220 }, { x: 380, y: 200 }, { x: 380, y: 440 },
      { x: 640, y: 320 }, { x: 640, y: 460 }, { x: 200, y: 420 },
      { x: 880, y: 360 }, { x: 880, y: 80 }, { x: 720, y: 80 }
    ]
  }
];

// Ten escalating waves. Mix of enemy types: scout (fast, low HP), grunt (mid),
// brute (slow, high HP), swarm (many small).
const WAVES = [
  { count: 8,  interval: 0.7, enemy: "scout",  speed: 50,  hp: 2  },
  { count: 10, interval: 0.6, enemy: "grunt",  speed: 55,  hp: 3  },
  { count: 14, interval: 0.5, enemy: "scout",  speed: 70,  hp: 2  },
  { count: 6,  interval: 1.0, enemy: "brute",  speed: 38,  hp: 10 },
  { count: 16, interval: 0.45, enemy: "swarm", speed: 80,  hp: 1  },
  { count: 12, interval: 0.5, enemy: "grunt",  speed: 70,  hp: 5  },
  { count: 8,  interval: 0.9, enemy: "brute",  speed: 44,  hp: 14 },
  { count: 20, interval: 0.4, enemy: "swarm",  speed: 90,  hp: 2  },
  { count: 14, interval: 0.5, enemy: "grunt",  speed: 80,  hp: 7  },
  { count: 10, interval: 0.7, enemy: "brute",  speed: 50,  hp: 22 }
];

const ENEMY_STYLES = {
  scout:  { color: "#f97316", outline: "#7a2410", radius: 11, reward: 6  },
  grunt:  { color: "#fb7185", outline: "#7a1f1f", radius: 14, reward: 9  },
  brute:  { color: "#a21caf", outline: "#3b0a4d", radius: 18, reward: 18 },
  swarm:  { color: "#22d3ee", outline: "#155e75", radius: 8,  reward: 4  }
};

function tdQuery(selector) {
  return document.querySelector(selector);
}

// A "background" entity that draws bg/path/pads BENEATH all real entities.
// GameManager sorts entities by zIndex; this one is -100 so it draws first.
class TDBackground {
  constructor(game) {
    this.game = game;
    this.zIndex = -100;
  }
  update() {}
  draw(ctx) {
    this.game._drawBackground(ctx);
  }
}

export class TowerDefenseGame {
  constructor(options = {}) {
    this.canvas = options.canvas;
    this.ctx = this.canvas.getContext("2d");
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
      clearEachFrame: true,
      clearColor: "#000",
      sortEntities: true,
      onUpdate: (dt) => this.update(dt)
    });
    this.waveManager = new WaveManager({
      waves: WAVES,
      spawn: ({ wave }) => this.spawnEnemy(wave)
    });
    this.enemies = [];
    this.projectiles = [];
    this.turrets = [];
    this.lives = 25;
    this.gold = 200;
    this.selectedVariant = "basic";
    this.currentGeography = 0;
    this.message = tdQuery("#message");
    this.livesEl = tdQuery("#lives");
    this.goldEl = tdQuery("#gold");
    this.waveEl = tdQuery("#wave");
    this.engine.addEntity(new TDBackground(this));
  }

  get geography() { return GEOGRAPHIES[this.currentGeography]; }
  get path() { return this.geography.path; }
  get pads() { return this.geography.pads; }

  start() {
    applySwatchVariables(document.documentElement, getSwatchByID("sunset-arcade"));
    tdQuery("#startWaveButton").addEventListener("click", () => this.startWave());
    this.canvas.addEventListener("click", (event) => this.handleBuildClick(event));
    document.querySelectorAll(".turret-pick").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".turret-pick").forEach((b) => b.classList.remove("is-selected"));
        btn.classList.add("is-selected");
        this.selectedVariant = btn.dataset.variant;
        this.message.textContent = `Selected ${btn.dataset.variant} turret. Tap a glowing pad.`;
      });
    });
    this.message.textContent = `${this.geography.name}. Pick a turret type, then tap a glowing pad.`;
    this.engine.start();
  }

  startWave() {
    if (this.waveManager.active && this.waveManager.remaining > 0) {
      this.message.textContent = "Wave still spawning.";
      return;
    }
    if (this.enemies.length > 0) {
      this.message.textContent = "Clear the field first.";
      return;
    }
    const nextIndex = Math.max(0, this.waveManager.waveIndex + 1);
    if (nextIndex >= WAVES.length) {
      this.message.textContent = "Final wave cleared. You win!";
      return;
    }
    this.waveManager.start(nextIndex);
    this.message.textContent = `${this.geography.name} — Wave ${nextIndex + 1} of ${WAVES.length} (${WAVES[nextIndex].enemy}) incoming.`;
    this.audio.beep({ freq: 360, duration: 0.1, type: "triangle" });
  }

  spawnEnemy(wave) {
    const style = ENEMY_STYLES[wave.enemy] || ENEMY_STYLES.grunt;
    const enemy = new PathFollower({
      x: this.path[0].x,
      y: this.path[0].y,
      path: this.path,
      speed: wave.speed,
      radius: style.radius,
      width: style.radius * 2,
      height: style.radius * 2,
      faction: "enemy"
    });
    enemy.hp = wave.hp;
    enemy.maxHp = wave.hp;
    enemy.reward = style.reward;
    enemy.color = style.color;
    enemy.outline = style.outline;
    enemy.kind = wave.enemy;
    enemy.zIndex = 5;
    // Override draw to show health bar + outline
    enemy.draw = function (ctx) {
      ctx.save();
      ctx.fillStyle = this.color;
      ctx.strokeStyle = this.outline;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Eye-spot for personality
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(this.x + this.radius * 0.3, this.y - this.radius * 0.2, this.radius * 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(this.x + this.radius * 0.35, this.y - this.radius * 0.2, this.radius * 0.12, 0, Math.PI * 2);
      ctx.fill();
      // Health bar
      if (this.hp < this.maxHp) {
        const w = this.radius * 2;
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(this.x - w / 2, this.y - this.radius - 7, w, 4);
        ctx.fillStyle = this.hp / this.maxHp > 0.4 ? "#22c55e" : "#fbbf24";
        ctx.fillRect(this.x - w / 2, this.y - this.radius - 7, w * (this.hp / this.maxHp), 4);
      }
      ctx.restore();
    };
    this.enemies.push(enemy);
    this.engine.addEntity(enemy);
    return enemy;
  }

  seedTurret(pad, variant = "basic") {
    const VariantClass = TURRET_VARIANTS[variant] || TURRET_VARIANTS.basic;
    const turret = new VariantClass({
      x: pad.x,
      y: pad.y,
      faction: "tower",
      projectileFactory: (tower, target) => this.createProjectile(tower, target, variant)
    });
    turret.zIndex = 10;
    this.turrets.push(turret);
    this.engine.addEntity(turret);
    return turret;
  }

  createProjectile(tower, target, variant) {
    const angle = Math.atan2(target.y - tower.y, target.x - tower.x);
    const variantColors = {
      basic: "#facc15",
      cannon: "#fb923c",
      frost: "#67e8f9",
      beam: "#c084fc"
    };
    const projectile = new Projectile({
      x: tower.x,
      y: tower.y,
      angle,
      speed: variant === "cannon" ? 320 : 440,
      ttl: 0.85,
      radius: variant === "cannon" ? 8 : 4,
      faction: "tower",
      color: variantColors[variant] || "#facc15"
    });
    projectile.damage = tower.damage ?? 1;
    projectile.splashRadius = tower.splashRadius ?? 0;
    projectile.zIndex = 8;
    this.projectiles.push(projectile);
    this.engine.addEntity(projectile);
    return projectile;
  }

  handleBuildClick(event) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const scaleY = HEIGHT / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    const pad = this.pads.find((candidate) => Math.hypot(candidate.x - x, candidate.y - y) < 30);
    if (!pad) return;
    if (this.turrets.some((turret) => Math.hypot(turret.x - pad.x, turret.y - pad.y) < 8)) {
      this.message.textContent = "That pad already has a turret.";
      return;
    }
    const variant = this.selectedVariant || "basic";
    const VariantClass = TURRET_VARIANTS[variant] || TURRET_VARIANTS.basic;
    const cost = new VariantClass().cost;
    if (this.gold < cost) {
      this.message.textContent = `Need ${cost} gold for a ${variant} turret. You have ${this.gold}.`;
      return;
    }
    this.gold -= cost;
    this.seedTurret(pad, variant);
    this.message.textContent = `Built a ${variant} turret for ${cost}g.`;
    this.audio.beep({ freq: 520, duration: 0.07, type: "triangle" });
  }

  update(dt) {
    this.waveManager.update(dt);
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
    this.applyEnemySlowEffects(now);
    // Reap arrived/dead enemies
    this.enemies = this.enemies.filter((enemy) => {
      if (enemy.arrived) {
        this.lives -= 1;
        enemy.destroy();
        this.audio.beep({ freq: 180, duration: 0.08, type: "square" });
        return false;
      }
      if (enemy.active === false || enemy.hp <= 0) return false;
      return true;
    });
    this.projectiles = this.projectiles.filter((p) => p.active !== false);
    this.resolveHits();

    // Wave-complete detection
    if (this.waveManager.active && this.waveManager.remaining === 0 && this.enemies.length === 0) {
      this.waveManager.active = false;
      const completedIdx = this.waveManager.waveIndex;
      if (completedIdx >= 0 && completedIdx < WAVES.length) {
        const bonus = 50 + completedIdx * 10;
        this.gold += bonus;
        this.scoreboard.add(bonus);
        this.message.textContent = `Wave ${completedIdx + 1} cleared. +${bonus}g. Hit Start Wave for the next.`;
        // Switch geography every 3 waves (after wave 3 → desert, after wave 6 → ice).
        const newGeoIndex = Math.min(GEOGRAPHIES.length - 1, Math.floor((completedIdx + 1) / 3));
        if (newGeoIndex !== this.currentGeography) {
          this.currentGeography = newGeoIndex;
          // Demolish existing turrets — new map, new layout. Refund half their cost.
          let refund = 0;
          for (const turret of this.turrets) {
            refund += Math.round((turret.cost || 50) * 0.5);
            turret.destroy?.();
            this.engine.removeEntity(turret);
          }
          this.turrets = [];
          this.gold += refund;
          this.message.textContent = `Cleared. Travelled to ${this.geography.name}. +${bonus}g + ${refund}g turret refund.`;
        }
      }
    }

    if (this.lives <= 0) {
      this.message.textContent = "Base breached. Reset.";
      this._resetMatch();
    }
    this.updateHUD();
  }

  resolveHits() {
    for (const projectile of this.projectiles.slice()) {
      for (const enemy of this.enemies.slice()) {
        if (!intersectsCircle(projectile, enemy)) continue;
        if (projectile.splashRadius > 0) {
          for (const t of this.enemies) {
            if (Math.hypot(t.x - projectile.x, t.y - projectile.y) <= projectile.splashRadius) {
              t.hp -= projectile.damage;
              if (t.hp <= 0) {
                t.destroy();
                this.gold += t.reward;
                this.scoreboard.add(t.reward);
              }
            }
          }
        } else {
          enemy.hp -= projectile.damage;
          if (enemy.hp <= 0) {
            enemy.destroy();
            this.gold += enemy.reward;
            this.scoreboard.add(enemy.reward);
            this.audio.beep({ freq: 740, duration: 0.04, type: "square" });
          }
        }
        projectile.destroy();
        break;
      }
    }
    // Beam continuous damage already applied by BeamTurret.update
    for (const enemy of this.enemies) {
      if (typeof enemy.hp === "number" && enemy.hp <= 0) {
        enemy.destroy();
        this.gold += enemy.reward;
        this.scoreboard.add(enemy.reward);
      }
    }
  }

  applyEnemySlowEffects(now) {
    for (const enemy of this.enemies) {
      if (enemy.slowedUntil && now < enemy.slowedUntil) {
        if (!enemy._originalSpeed) enemy._originalSpeed = enemy.speed;
        enemy.speed = enemy._originalSpeed * (enemy.slowFactor || 0.5);
      } else if (enemy._originalSpeed) {
        enemy.speed = enemy._originalSpeed;
        enemy._originalSpeed = null;
      }
    }
  }

  _resetMatch() {
    this.lives = 25;
    this.gold = 200;
    this.scoreboard.reset();
    this.currentGeography = 0;
    this.waveManager.waveIndex = -1;
    this.waveManager.active = false;
    for (const e of this.enemies) e.destroy();
    for (const p of this.projectiles) p.destroy();
    for (const t of this.turrets) {
      t.destroy?.();
      this.engine.removeEntity(t);
    }
    this.enemies = [];
    this.projectiles = [];
    this.turrets = [];
    this.message.textContent = "Reset. Pick a turret and start the next wave.";
  }

  updateHUD() {
    if (this.livesEl) this.livesEl.textContent = String(this.lives);
    if (this.goldEl) this.goldEl.textContent = String(this.gold);
    if (this.waveEl) {
      const i = this.waveManager.waveIndex;
      this.waveEl.textContent = `${Math.max(1, i + 1)} / ${WAVES.length}`;
    }
  }

  // Background drawn by TDBackground entity (zIndex -100), called from its draw().
  _drawBackground(ctx) {
    const geo = this.geography;
    // Base
    ctx.fillStyle = geo.bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    // Decorative pattern
    this._drawPattern(ctx, geo.pattern, geo.accent);
    // Path with shoulder
    this._drawPath(ctx, geo.pathColorAlt, 60);
    this._drawPath(ctx, geo.pathColor, 48);
    // Build pads
    for (const pad of this.pads) {
      const occupied = this.turrets.some((t) => Math.hypot(t.x - pad.x, t.y - pad.y) < 8);
      ctx.save();
      ctx.fillStyle = occupied ? "rgba(250, 204, 21, 0.06)" : "rgba(34, 197, 94, 0.16)";
      ctx.strokeStyle = occupied ? "rgba(250, 204, 21, 0.4)" : "#22c55e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pad.x, pad.y, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawPath(ctx, color, lineWidth) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    this.path.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.restore();
  }

  _drawPattern(ctx, pattern, accent) {
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = accent;
    if (pattern === "grass") {
      for (let i = 0; i < 60; i += 1) {
        const x = (i * 89 + 17) % WIDTH;
        const y = (i * 71 + 31) % HEIGHT;
        ctx.fillRect(x, y, 2, 6);
        ctx.fillRect(x + 3, y + 2, 2, 5);
      }
    } else if (pattern === "sand") {
      for (let i = 0; i < 80; i += 1) {
        const x = (i * 73 + 11) % WIDTH;
        const y = (i * 53 + 19) % HEIGHT;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (pattern === "snow") {
      ctx.fillStyle = "#fff";
      for (let i = 0; i < 70; i += 1) {
        const x = (i * 67 + 23) % WIDTH;
        const y = (i * 47 + 29) % HEIGHT;
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
