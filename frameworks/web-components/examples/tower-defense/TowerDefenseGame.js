import { GameManager } from "../../core/GameManager.js";
import { intersectsCircle } from "../../core/Physics2D.js";
import { PathFollower } from "../../entities/PathFollower.js";
import { Projectile } from "../../entities/Projectile.js";
import { WaveManager } from "../../entities/WaveManager.js";
import { Turret } from "../../entities/Turret.js";
import { TURRET_VARIANTS } from "../../entities/TurretVariants.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { AudioManager } from "../../resources/AudioManager.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";
import {
  drawZombie,
  drawZombieFast,
  drawZombieBrute,
  drawZombieSwarm,
  drawBase
} from "../../resources/VectorSprites.js";

const WIDTH = 1000;
const HEIGHT = 620;

// Three "geographies" — themed defense zones. Path/pads/visual change every 3 waves.
// All paths end at the SAME approximate base position so the bunker stays put.
// Pads are placed at least 60px clear of any path segment (path lineWidth is 56 = 28px half).
const GEOGRAPHIES = [
  {
    id: "outpost",
    name: "Outpost",
    bg: "#0d2e1a",
    pathColor: "#7a5a2c",
    pathColorAlt: "#946d3a",
    pattern: "grass",
    accent: "#86efac",
    path: [
      { x: 0,   y: 100 },
      { x: 280, y: 100 },
      { x: 280, y: 260 },
      { x: 560, y: 260 },
      { x: 560, y: 420 },
      { x: 820, y: 420 },
      { x: 820, y: 560 },
      { x: 940, y: 560 }
    ],
    pads: [
      { x: 100, y: 200 }, { x: 220, y: 200 },
      { x: 380, y: 180 }, { x: 460, y: 180 },
      { x: 380, y: 340 }, { x: 660, y: 340 },
      { x: 700, y: 510 }, { x: 920, y: 470 }
    ]
  },
  {
    id: "highway",
    name: "Highway",
    bg: "#3a2a14",
    pathColor: "#7c5e3a",
    pathColorAlt: "#a07a4a",
    pattern: "sand",
    accent: "#fbbf24",
    path: [
      { x: 0,   y: 540 },
      { x: 240, y: 540 },
      { x: 240, y: 360 },
      { x: 460, y: 360 },
      { x: 460, y: 180 },
      { x: 720, y: 180 },
      { x: 720, y: 460 },
      { x: 940, y: 460 }
    ],
    pads: [
      { x: 100, y: 440 }, { x: 100, y: 600 },
      { x: 350, y: 280 }, { x: 350, y: 460 },
      { x: 580, y: 100 }, { x: 580, y: 280 },
      { x: 820, y: 280 }, { x: 850, y: 540 }
    ]
  },
  {
    id: "fortress",
    name: "Fortress",
    bg: "#0f1740",
    pathColor: "#3a4a5e",
    pathColorAlt: "#5a6a82",
    pattern: "snow",
    accent: "#67e8f9",
    path: [
      { x: 0,   y: 80  },
      { x: 320, y: 80  },
      { x: 320, y: 280 },
      { x: 580, y: 280 },
      { x: 580, y: 460 },
      { x: 800, y: 460 },
      { x: 800, y: 540 },
      { x: 940, y: 540 }
    ],
    pads: [
      { x: 160, y: 200 }, { x: 220, y: 380 },
      { x: 460, y: 180 }, { x: 460, y: 380 },
      { x: 690, y: 180 }, { x: 690, y: 380 },
      { x: 690, y: 540 }, { x: 900, y: 460 }
    ]
  }
];

// Ten escalating waves of zombie horde.
const WAVES = [
  { count: 8,  interval: 0.7, kind: "zombie",       speed: 50,  hp: 2  },
  { count: 10, interval: 0.6, kind: "zombieFast",   speed: 80,  hp: 2  },
  { count: 14, interval: 0.5, kind: "zombie",       speed: 60,  hp: 4  },
  { count: 6,  interval: 1.0, kind: "zombieBrute",  speed: 40,  hp: 14 },
  { count: 18, interval: 0.4, kind: "zombieSwarm",  speed: 95,  hp: 1  },
  { count: 12, interval: 0.5, kind: "zombieFast",   speed: 90,  hp: 4  },
  { count: 10, interval: 0.8, kind: "zombieBrute",  speed: 46,  hp: 20 },
  { count: 22, interval: 0.35, kind: "zombieSwarm", speed: 105, hp: 2  },
  { count: 14, interval: 0.5, kind: "zombieFast",   speed: 100, hp: 6  },
  { count: 8,  interval: 1.1, kind: "zombieBrute",  speed: 50,  hp: 30 }
];

const ZOMBIE_RENDERERS = {
  zombie: drawZombie,
  zombieFast: drawZombieFast,
  zombieBrute: drawZombieBrute,
  zombieSwarm: drawZombieSwarm
};

const ZOMBIE_STATS = {
  zombie:      { radius: 12, scale: 1.2, reward: 6,  damage: 1 },
  zombieFast:  { radius: 11, scale: 1.0, reward: 8,  damage: 1 },
  zombieBrute: { radius: 18, scale: 1.0, reward: 20, damage: 4 },
  zombieSwarm: { radius: 8,  scale: 0.9, reward: 4,  damage: 1 }
};

function tdQuery(selector) {
  return document.querySelector(selector);
}

// Background entity — drawn at zIndex -100 so it goes UNDER turrets/zombies/projectiles.
// CRITICAL: use `host` not `game` because GameManager._flushEntityQueues overwrites
// `entity.game = engine` when an entity is added.
class TDBackground {
  constructor(host) {
    this.host = host;
    this.zIndex = -100;
  }
  update() {}
  draw(ctx) {
    this.host._drawBackground(ctx);
  }
}

// Range overlay entity — draws turret range circles on top of bg but under turrets.
class TDRangeOverlay {
  constructor(host) {
    this.host = host;
    this.zIndex = -50;
  }
  update() {}
  draw(ctx) {
    this.host._drawTurretRanges(ctx);
  }
}

// Base/bunker that the player defends. Has hp, takes damage when zombies reach the path end.
class TDBase {
  constructor(host, position) {
    this.host = host;
    this.x = position.x;
    this.y = position.y;
    this.hp = 25;
    this.maxHp = 25;
    this.zIndex = 6;
  }
  update() {}
  draw(ctx) {
    drawBase(ctx, this.x, this.y, { scale: 1.5, hpRatio: this.hp / this.maxHp });
    // HP bar above base
    const w = 60;
    const x = this.x - w / 2;
    const y = this.y - 50;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(x, y, w, 6);
    ctx.fillStyle = this.hp / this.maxHp > 0.4 ? "#22c55e" : "#dc2626";
    ctx.fillRect(x, y, w * (this.hp / this.maxHp), 6);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, 6);
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
      onUpdate: (dt) => this.update(dt),
      onError: (err) => console.error("TD engine error:", err)
    });
    this.waveManager = new WaveManager({
      waves: WAVES,
      spawn: ({ wave }) => this.spawnEnemy(wave)
    });
    this.enemies = [];
    this.projectiles = [];
    this.turrets = [];
    this.scrap = 200;
    this.selectedVariant = "basic";
    this.currentGeography = 0;
    this.message = tdQuery("#message");
    this.baseHpEl = tdQuery("#baseHp");
    this.scrapEl = tdQuery("#scrap");
    this.waveEl = tdQuery("#wave");
    // Add background and range overlay entities up front
    this.engine.addEntity(new TDBackground(this));
    this.engine.addEntity(new TDRangeOverlay(this));
    // Place the base at the path end of the current geography
    this._placeBase();
  }

  get geography() { return GEOGRAPHIES[this.currentGeography]; }
  get path() { return this.geography.path; }
  get pads() { return this.geography.pads; }

  _placeBase() {
    const last = this.path[this.path.length - 1];
    // Position the base just past the path end
    const baseX = Math.min(WIDTH - 30, last.x + 30);
    const baseY = last.y;
    if (this.base) {
      this.engine.removeEntity(this.base);
    }
    this.base = new TDBase(this, { x: baseX, y: baseY });
    this.engine.addEntity(this.base);
  }

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
    this.message.textContent = `Defend the bunker. Pick a turret, tap a glowing pad. Wave 1 of 10 ready.`;
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
      this.message.textContent = "Final wave cleared. Bunker holds. You win!";
      return;
    }
    this.waveManager.start(nextIndex);
    const w = WAVES[nextIndex];
    const labels = { zombie: "Walkers", zombieFast: "Runners", zombieBrute: "Tanks", zombieSwarm: "Swarmers" };
    this.message.textContent = `${this.geography.name} — Wave ${nextIndex + 1} of ${WAVES.length}: ${labels[w.kind] || w.kind} (${w.count}) incoming.`;
    this.audio.beep({ freq: 220, duration: 0.18, type: "sawtooth" });
  }

  spawnEnemy(wave) {
    const stats = ZOMBIE_STATS[wave.kind] || ZOMBIE_STATS.zombie;
    const renderer = ZOMBIE_RENDERERS[wave.kind] || drawZombie;
    const enemy = new PathFollower({
      x: this.path[0].x,
      y: this.path[0].y,
      path: this.path,
      speed: wave.speed,
      radius: stats.radius,
      width: stats.radius * 2,
      height: stats.radius * 2,
      faction: "enemy"
    });
    enemy.hp = wave.hp;
    enemy.maxHp = wave.hp;
    enemy.reward = stats.reward;
    enemy.damageToBase = stats.damage;
    enemy.kind = wave.kind;
    enemy.zIndex = 5;
    enemy._renderer = renderer;
    enemy._renderScale = stats.scale;
    enemy._facingLeft = false;
    // Override draw to use the zombie sprite + health bar
    enemy.draw = function (ctx) {
      // Determine facing from velocity
      const facingLeft = (this.vx ?? 0) < -0.5;
      this._renderer(ctx, this.x, this.y, { scale: this._renderScale, flipX: facingLeft });
      // Health bar (only when damaged)
      if (this.hp < this.maxHp) {
        const w = this.radius * 2.4;
        const hbY = this.y - this.radius - 8;
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(this.x - w / 2, hbY, w, 3);
        ctx.fillStyle = this.hp / this.maxHp > 0.4 ? "#22c55e" : "#dc2626";
        ctx.fillRect(this.x - w / 2, hbY, w * (this.hp / this.maxHp), 3);
      }
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
      speed: variant === "cannon" ? 320 : 480,
      ttl: 1.2,
      radius: variant === "cannon" ? 8 : 5,
      faction: "tower",
      color: variantColors[variant] || "#facc15"
    });
    projectile.damage = tower.damage ?? 1;
    projectile.splashRadius = tower.splashRadius ?? 0;
    projectile.zIndex = 8;
    this.projectiles.push(projectile);
    return projectile;
  }

  handleBuildClick(event) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const scaleY = HEIGHT / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    // Click on existing turret → upgrade
    const existing = this.turrets.find((t) => Math.hypot(t.x - x, t.y - y) < 22);
    if (existing) {
      this._tryUpgrade(existing);
      return;
    }
    // Click on a pad → place new turret
    const pad = this.pads.find((c) => Math.hypot(c.x - x, c.y - y) < 28);
    if (!pad) return;
    const variant = this.selectedVariant || "basic";
    const VariantClass = TURRET_VARIANTS[variant] || TURRET_VARIANTS.basic;
    const cost = new VariantClass().cost;
    if (this.scrap < cost) {
      this.message.textContent = `Need ${cost} scrap for a ${variant} turret. You have ${this.scrap}.`;
      return;
    }
    this.scrap -= cost;
    this.seedTurret(pad, variant);
    this.message.textContent = `Built ${variant} turret for ${cost}. Click an existing turret to upgrade.`;
    this.audio.beep({ freq: 520, duration: 0.07, type: "triangle" });
  }

  _tryUpgrade(turret) {
    if (turret.tier >= 3) {
      this.message.textContent = `${turret.label} is already at max tier (III).`;
      return;
    }
    const cost = turret.upgradeCost();
    if (this.scrap < cost) {
      this.message.textContent = `Need ${cost} scrap to upgrade ${turret.label} to tier ${turret.tier + 1}. You have ${this.scrap}.`;
      return;
    }
    this.scrap -= cost;
    turret.upgrade();
    this.message.textContent = `${turret.label} upgraded to tier ${turret.tier} (range ${Math.round(turret.range)}, dmg ${turret.damage.toFixed(1)}).`;
    this.audio.beep({ freq: 720, duration: 0.1, type: "triangle" });
  }

  update(dt) {
    this.waveManager.update(dt);
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
    this.applyEnemySlowEffects(now);

    // Reap enemies that reached the base + apply damage
    this.enemies = this.enemies.filter((enemy) => {
      if (enemy.arrived) {
        const dmg = enemy.damageToBase ?? 1;
        this.base.hp = Math.max(0, this.base.hp - dmg);
        enemy.destroy();
        this.audio.beep({ freq: 140, duration: 0.1, type: "square" });
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
        const bonus = 80 + completedIdx * 15;
        this.scrap += bonus;
        this.scoreboard.add(bonus);
        this.message.textContent = `Wave ${completedIdx + 1} cleared. +${bonus} scrap. Hit Start Wave for the next.`;
        // Switch geography every 3 waves (after wave 3 → highway, after wave 6 → fortress).
        const newGeoIndex = Math.min(GEOGRAPHIES.length - 1, Math.floor((completedIdx + 1) / 3));
        if (newGeoIndex !== this.currentGeography) {
          this.currentGeography = newGeoIndex;
          // Demolish existing turrets — new map, new layout. Refund half their cost.
          let refund = 0;
          for (const turret of this.turrets) {
            refund += Math.round((turret.cost || 50) * 0.5);
            this.engine.removeEntity(turret);
          }
          this.turrets = [];
          this.scrap += refund;
          this._placeBase();
          this.message.textContent = `Cleared. Moved to ${this.geography.name}. +${bonus} scrap + ${refund} salvage from turrets.`;
        }
      }
    }

    if (this.base.hp <= 0) {
      this.message.textContent = "Bunker overrun. Defenses reset.";
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
                this.scrap += t.reward;
                this.scoreboard.add(t.reward);
              }
            }
          }
        } else {
          enemy.hp -= projectile.damage;
          if (enemy.hp <= 0) {
            enemy.destroy();
            this.scrap += enemy.reward;
            this.scoreboard.add(enemy.reward);
            this.audio.beep({ freq: 740, duration: 0.04, type: "square" });
          }
        }
        projectile.destroy();
        break;
      }
    }
    // Beam continuous damage (already applied by BeamTurret.update); reap dead.
    for (const enemy of this.enemies) {
      if (typeof enemy.hp === "number" && enemy.hp <= 0 && enemy.active !== false) {
        enemy.destroy();
        this.scrap += enemy.reward;
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
    this.scrap = 200;
    this.scoreboard.reset();
    this.currentGeography = 0;
    this.waveManager.waveIndex = -1;
    this.waveManager.active = false;
    for (const e of this.enemies) e.destroy();
    for (const p of this.projectiles) p.destroy();
    for (const t of this.turrets) this.engine.removeEntity(t);
    this.enemies = [];
    this.projectiles = [];
    this.turrets = [];
    this._placeBase();
    this.message.textContent = "Reset. Defend the bunker.";
  }

  updateHUD() {
    if (this.baseHpEl) this.baseHpEl.textContent = `${this.base.hp}/${this.base.maxHp}`;
    if (this.scrapEl) this.scrapEl.textContent = String(this.scrap);
    if (this.waveEl) {
      const i = this.waveManager.waveIndex;
      this.waveEl.textContent = `${Math.max(1, i + 1)} / ${WAVES.length}`;
    }
  }

  _drawBackground(ctx) {
    const geo = this.geography;
    ctx.fillStyle = geo.bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    this._drawPattern(ctx, geo.pattern, geo.accent);
    // Path with shoulder
    this._drawPath(ctx, geo.pathColorAlt, 64);
    this._drawPath(ctx, geo.pathColor, 56);
    // Build pads
    for (const pad of this.pads) {
      const occupied = this.turrets.some((t) => Math.hypot(t.x - pad.x, t.y - pad.y) < 8);
      ctx.save();
      ctx.fillStyle = occupied ? "rgba(250, 204, 21, 0.05)" : "rgba(34, 197, 94, 0.18)";
      ctx.strokeStyle = occupied ? "rgba(250, 204, 21, 0.35)" : "#22c55e";
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

  _drawTurretRanges(ctx) {
    ctx.save();
    // Existing turrets — faint white range circles
    for (const turret of this.turrets) {
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(turret.x, turret.y, turret.range, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Placement preview — show the SELECTED variant's range on every empty pad
    const variant = this.selectedVariant || "basic";
    const VariantClass = TURRET_VARIANTS[variant];
    if (VariantClass) {
      const sample = new VariantClass();
      const previewRange = sample.range;
      ctx.strokeStyle = "rgba(34, 197, 94, 0.22)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      for (const pad of this.pads) {
        const occupied = this.turrets.some((t) => Math.hypot(t.x - pad.x, t.y - pad.y) < 8);
        if (occupied) continue;
        ctx.beginPath();
        ctx.arc(pad.x, pad.y, previewRange, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
}
