import { GameManager } from "../../core/GameManager.js";
import { intersectsCircle } from "../../core/Physics2D.js";
import { Asteroid } from "../../entities/Asteroid.js";
import { SpaceShip } from "../../entities/SpaceShip.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";

const SCORE_BY_LEVEL = {
  3: 20,
  2: 50,
  1: 100
};

const CONTROL_KEYS = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "thrust",
  Space: "fire",
  KeyA: "left",
  KeyD: "right",
  KeyW: "thrust"
};

function resolveElement(target, fallback = null) {
  if (!target || typeof document === "undefined") {
    return fallback;
  }

  if (typeof target === "string") {
    return document.querySelector(target) || fallback;
  }

  return target;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function randomEdgePosition(width, height, margin = 56) {
  const side = Math.floor(Math.random() * 4);

  if (side === 0) {
    return { x: randomBetween(0, width), y: -margin };
  }

  if (side === 1) {
    return { x: width + margin, y: randomBetween(0, height) };
  }

  if (side === 2) {
    return { x: randomBetween(0, width), y: height + margin };
  }

  return { x: -margin, y: randomBetween(0, height) };
}

function distanceBetween(a, b) {
  const dx = (a?.x ?? 0) - (b?.x ?? 0);
  const dy = (a?.y ?? 0) - (b?.y ?? 0);
  return Math.hypot(dx, dy);
}

function keepActive(items) {
  return items.filter((item) => item && item.active !== false);
}

export class AsteroidsGame {
  constructor(options = {}) {
    this.root =
      resolveElement(options.root) ||
      resolveElement("[data-web-component-example='asteroids']") ||
      (typeof document !== "undefined" ? document.body : null);
    this.canvas =
      options.canvas ||
      resolveElement(options.canvasId ? `#${options.canvasId}` : "#gameCanvas");

    if (!this.canvas) {
      throw new Error("AsteroidsGame requires a canvas element.");
    }

    this.hudTarget = this._ensureSlot(
      options.hudTarget || "#hudMount",
      "asteroids-hud"
    );
    this.metaTarget = this._ensureSlot(
      options.metaTarget || "#metaMount",
      "asteroids-meta"
    );
    this.messageTarget = this._ensureSlot(
      options.messageTarget || "#messageMount",
      "asteroids-message"
    );

    this.swatch =
      options.swatch ||
      getSwatchByID(options.swatchID || "vector-noir") ||
      getSwatchByID("retro-neon");
    applySwatchVariables(
      this.root || (typeof document !== "undefined" ? document.documentElement : null),
      this.swatch
    );

    this.input = {
      left: false,
      right: false,
      thrust: false,
      fire: false
    };
    this.restartRequested = false;
    this.hyperspaceRequested = false;
    this.waveAdvanceDelay = options.waveAdvanceDelay ?? 1.1;
    this.shipRespawnDelay = options.shipRespawnDelay ?? 1.4;
    this.initialLives = options.initialLives ?? 3;
    this.bonusLifeEvery = options.bonusLifeEvery ?? 10_000;
    this.bonusLifeThreshold = this.bonusLifeEvery;
    this.nextWaveTimer = 0;
    this.respawnTimer = 0;
    this.messageTimer = 0;
    this.gameOver = false;
    this.wave = 0;
    this.lives = this.initialLives;
    this.ship = null;
    this.asteroids = [];
    this.projectiles = [];

    this.scoreBoard = new ScoreBoard({
      target: this.hudTarget,
      storageKey: options.storageKey || "asteroids.highScore",
      scoreLabel: "Score",
      highScoreLabel: "Best"
    });

    this.game = new GameManager({
      canvas: this.canvas,
      width: options.width ?? 900,
      height: options.height ?? 600,
      clearColor: this.swatch?.tokens?.background || "#020617",
      imageSmoothingEnabled: false,
      onUpdate: (dt) => this._update(dt),
      onDraw: (ctx) => this._drawOverlay(ctx)
    });

    this.metaTarget.dataset.component = "asteroids-meta";
    this.messageTarget.dataset.component = "asteroids-message";

    this._boundKeyDown = (event) => this._handleKeyDown(event);
    this._boundKeyUp = (event) => this._handleKeyUp(event);
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this._boundKeyDown);
      window.addEventListener("keyup", this._boundKeyUp);
    }

    this.reset();
  }

  start() {
    this.game.start();
    return this;
  }

  stop() {
    this.game.stop();
    return this;
  }

  destroy() {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this._boundKeyDown);
      window.removeEventListener("keyup", this._boundKeyUp);
    }

    this.scoreBoard.detach();
    this.game.destroy();
  }

  reset() {
    for (const entity of this.game.getEntities()) {
      entity.active = false;
      entity.visible = false;
    }

    this.game.clearEntities();
    this.asteroids = [];
    this.projectiles = [];
    this.ship = null;
    this.wave = 0;
    this.lives = this.initialLives;
    this.gameOver = false;
    this.nextWaveTimer = 0;
    this.respawnTimer = 0;
    this.bonusLifeThreshold = this.bonusLifeEvery;
    this.scoreBoard.reset(0);
    this._spawnPlayer({ invulnerableFor: 2.2 });
    this._spawnWave();
    this._setMessage(
      "Arrow keys or WASD to rotate and thrust. Space fires. H triggers hyperspace.",
      5
    );
    this._renderMeta();
  }

  _update(dt) {
    this._consumeMessageTimer(dt);
    this._syncCollections();

    if (this.gameOver) {
      if (this.restartRequested) {
        this.restartRequested = false;
        this.reset();
      }
      return;
    }

    if (this.ship) {
      this.ship.setInputState(this.input);
      if (this.input.fire) {
        this._spawnProjectile();
      }
      if (this.hyperspaceRequested) {
        this._hyperspace();
      }
    } else if (this.lives > 0) {
      this.respawnTimer = Math.max(0, this.respawnTimer - dt);
      if (this.respawnTimer === 0) {
        this._spawnPlayer({ invulnerableFor: 2 });
      }
    }

    this._handleProjectileAsteroidCollisions();
    this._handleShipAsteroidCollisions();
    this._grantBonusLifeIfNeeded();

    if (this.asteroids.length === 0) {
      this.nextWaveTimer = Math.max(0, this.nextWaveTimer - dt);
      if (this.nextWaveTimer === 0) {
        this._spawnWave();
      }
    }

    this.hyperspaceRequested = false;
    this.restartRequested = false;
    this._renderMeta();
  }

  _drawOverlay(ctx) {
    ctx.save();
    ctx.strokeStyle = this.swatch?.tokens?.shadow || "rgba(148, 163, 184, 0.2)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(12, 12, this.game.width - 24, this.game.height - 24);

    if (!this.ship && !this.gameOver && this.respawnTimer > 0) {
      ctx.fillStyle = this.swatch?.tokens?.text || "#f8fafc";
      ctx.font = "16px Menlo, Monaco, monospace";
      ctx.textAlign = "center";
      ctx.fillText(
        `Respawning in ${this.respawnTimer.toFixed(1)}s`,
        this.game.width / 2,
        this.game.height - 26
      );
    }

    if (this.gameOver) {
      ctx.fillStyle = this.swatch?.tokens?.text || "#f8fafc";
      ctx.font = "28px Menlo, Monaco, monospace";
      ctx.textAlign = "center";
      ctx.fillText("Game Over", this.game.width / 2, this.game.height / 2 - 12);
      ctx.font = "14px Menlo, Monaco, monospace";
      ctx.fillText(
        "Press Enter to launch a new run",
        this.game.width / 2,
        this.game.height / 2 + 18
      );
    }

    ctx.restore();
  }

  _spawnWave() {
    this.wave += 1;
    this.nextWaveTimer = this.waveAdvanceDelay;
    const asteroidCount = Math.min(7, 3 + this.wave);

    for (let index = 0; index < asteroidCount; index += 1) {
      const spawn = this._pickAsteroidSpawn();
      const asteroid = new Asteroid({
        x: spawn.x,
        y: spawn.y,
        level: 3,
        color: this.swatch?.tokens?.accent || "#22d3ee"
      });
      this.asteroids.push(asteroid);
      this.game.addEntity(asteroid);
    }

    this._setMessage(`Wave ${this.wave}`, 1.6);
  }

  _spawnPlayer(options = {}) {
    this.ship = new SpaceShip({
      x: this.game.width / 2,
      y: this.game.height / 2,
      color: this.swatch?.tokens?.stroke || "#f8fafc",
      thrustColor: this.swatch?.tokens?.accentWarm || "#fb923c",
      invulnerableFor: options.invulnerableFor ?? 1.6
    });
    this.ship.setInputState(this.input);
    this.game.addEntity(this.ship);
  }

  _spawnProjectile() {
    if (!this.ship) {
      return;
    }

    const projectile = this.ship.createProjectile({
      color: this.swatch?.tokens?.text || "#f8fafc"
    });

    if (!projectile) {
      return;
    }

    this.projectiles.push(projectile);
    this.game.addEntity(projectile);
  }

  _handleProjectileAsteroidCollisions() {
    for (let projectileIndex = this.projectiles.length - 1; projectileIndex >= 0; projectileIndex -= 1) {
      const projectile = this.projectiles[projectileIndex];
      if (!projectile || projectile.active === false) {
        continue;
      }

      for (let asteroidIndex = this.asteroids.length - 1; asteroidIndex >= 0; asteroidIndex -= 1) {
        const asteroid = this.asteroids[asteroidIndex];
        if (!asteroid || asteroid.active === false) {
          continue;
        }

        if (!intersectsCircle(projectile, asteroid, 4)) {
          continue;
        }

        projectile.destroy();
        this._destroyAsteroid(asteroid);
        break;
      }
    }

    this._syncCollections();
  }

  _handleShipAsteroidCollisions() {
    if (!this.ship || this.ship.invulnerableFor > 0) {
      return;
    }

    for (const asteroid of this.asteroids) {
      if (!asteroid || asteroid.active === false) {
        continue;
      }

      if (!intersectsCircle(this.ship, asteroid, -4)) {
        continue;
      }

      this.ship.destroy();
      this.ship = null;
      this.lives = Math.max(0, this.lives - 1);

      if (this.lives > 0) {
        this.respawnTimer = this.shipRespawnDelay;
        this._setMessage(`Ship lost. ${this.lives} left.`, 2.2);
      } else {
        this.gameOver = true;
        this._setMessage(
          `Game over at ${this.scoreBoard.score}. Press Enter to restart.`,
          Number.POSITIVE_INFINITY
        );
      }

      break;
    }
  }

  _destroyAsteroid(asteroid) {
    if (!asteroid) {
      return;
    }

    const points = SCORE_BY_LEVEL[asteroid.level] || 0;
    if (points > 0) {
      this.scoreBoard.add(points);
    }

    const fragments = asteroid.split();
    asteroid.destroy();

    for (const fragment of fragments) {
      fragment.color = this.swatch?.tokens?.accent || fragment.color;
      this.asteroids.push(fragment);
      this.game.addEntity(fragment);
    }

    if (this.asteroids.length <= 1) {
      this.nextWaveTimer = this.waveAdvanceDelay;
    }
  }

  _grantBonusLifeIfNeeded() {
    if (this.scoreBoard.score < this.bonusLifeThreshold) {
      return;
    }

    this.lives += 1;
    this.bonusLifeThreshold += this.bonusLifeEvery;
    this._setMessage("Bonus life awarded.", 2);
  }

  _hyperspace() {
    if (!this.ship) {
      return;
    }

    const margin = this.ship.radius + 24;
    this.ship.x = randomBetween(margin, this.game.width - margin);
    this.ship.y = randomBetween(margin, this.game.height - margin);
    this.ship.vx *= 0.4;
    this.ship.vy *= 0.4;
    this.ship.invulnerableFor = Math.max(this.ship.invulnerableFor, 1.4);
    this._setMessage("Hyperspace jump engaged.", 1.1);
  }

  _pickAsteroidSpawn() {
    const avoidTarget = this.ship || { x: this.game.width / 2, y: this.game.height / 2 };

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const candidate = randomEdgePosition(this.game.width, this.game.height);
      if (distanceBetween(candidate, avoidTarget) >= 180) {
        return candidate;
      }
    }

    return randomEdgePosition(this.game.width, this.game.height);
  }

  _syncCollections() {
    this.asteroids = keepActive(this.asteroids);
    this.projectiles = keepActive(this.projectiles);

    if (this.ship && this.ship.active === false) {
      this.ship = null;
    }
  }

  _renderMeta() {
    const stateLabel = this.gameOver
      ? "Game Over"
      : this.ship
        ? "In Flight"
        : "Respawning";

    this.metaTarget.innerHTML = `
      <div class="asteroids-meta__pill">
        <span class="asteroids-meta__label">Lives</span>
        <strong class="asteroids-meta__value">${this.lives}</strong>
      </div>
      <div class="asteroids-meta__pill">
        <span class="asteroids-meta__label">Wave</span>
        <strong class="asteroids-meta__value">${this.wave}</strong>
      </div>
      <div class="asteroids-meta__pill">
        <span class="asteroids-meta__label">State</span>
        <strong class="asteroids-meta__value">${stateLabel}</strong>
      </div>
    `;
  }

  _setMessage(text, duration = 2.4) {
    this.messageTarget.textContent = text || "";
    this.messageTarget.classList.toggle("is-hidden", !text);
    this.messageTimer = duration;
  }

  _consumeMessageTimer(dt) {
    if (!Number.isFinite(this.messageTimer) || this.messageTimer <= 0) {
      return;
    }

    this.messageTimer = Math.max(0, this.messageTimer - dt);
    if (this.messageTimer === 0) {
      this.messageTarget.textContent = "";
      this.messageTarget.classList.add("is-hidden");
    }
  }

  _ensureSlot(target, className) {
    const existing = resolveElement(target);
    if (existing) {
      return existing;
    }

    if (typeof document === "undefined") {
      return { innerHTML: "", textContent: "", dataset: {}, classList: { add() {}, toggle() {} } };
    }

    const element = document.createElement("div");
    element.className = className;
    if (this.root) {
      this.root.appendChild(element);
    } else {
      document.body.appendChild(element);
    }
    return element;
  }

  _handleKeyDown(event) {
    if (CONTROL_KEYS[event.code]) {
      this.input[CONTROL_KEYS[event.code]] = true;
      event.preventDefault();
      return;
    }

    if (event.code === "Enter") {
      this.restartRequested = true;
      event.preventDefault();
      return;
    }

    if (event.code === "KeyH") {
      this.hyperspaceRequested = true;
      event.preventDefault();
    }
  }

  _handleKeyUp(event) {
    if (CONTROL_KEYS[event.code]) {
      this.input[CONTROL_KEYS[event.code]] = false;
      event.preventDefault();
    }
  }
}
