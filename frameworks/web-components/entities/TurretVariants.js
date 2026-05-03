// TurretVariants — four distinct turret types for tower defense games.
//
// Each variant tunes range/cooldown/damage and uses a different sprite from
// SpritePresets. Drop them into a tower-defense game alongside the base Turret
// so the player has meaningful build choices instead of a single "tower" type.
//
// Stats summary (defaults):
//   BasicTurret  — range 180  cooldown 0.6s   damage 1   cost 50
//   CannonTurret — range 140  cooldown 1.4s   damage 4   cost 120  splash 40px
//   FrostTurret  — range 160  cooldown 0.9s   damage 1   cost 90   slows 50% for 1.5s
//   BeamTurret   — range 220  cooldown 0.05s  damage 0.4 cost 180  continuous beam
//
// Usage:
//   import { BasicTurret, CannonTurret, FrostTurret, BeamTurret } from "./TurretVariants.js";
//   const turret = new BasicTurret({ x: 200, y: 150, faction: "player", projectileFactory });

import { Turret } from "./Turret.js";
import {
  drawTurretBasic,
  drawTurretCannon,
  drawTurretFrost,
  drawTurretBeam
} from "../resources/VectorSprites.js";

class SpriteTurret extends Turret {
  constructor(options = {}) {
    super(options);
    this.vectorRenderer = options.vectorRenderer || null;
    this.spriteScale = options.spriteScale ?? 1;
    this.barrelLength = options.barrelLength ?? this.radius + 12;
    this.cost = options.cost ?? 50;
    this.damage = options.damage ?? 1;
    this.label = options.label || "Turret";
    this.tier = 1;
    this._lastFireMs = 0;
    // Wrap projectileFactory so we can stamp a fire timestamp for the muzzle flash.
    const userFactory = this.projectileFactory;
    if (typeof userFactory === "function") {
      this.projectileFactory = (tower, target) => {
        tower._lastFireMs = (typeof performance !== "undefined" ? performance.now() : Date.now());
        return userFactory(tower, target);
      };
    }
  }

  upgrade() {
    if (this.tier >= 3) return false;
    this.tier += 1;
    this.damage = (this.damage || 1) * 1.4;
    this.range = (this.range || 200) * 1.15;
    this.cooldown = Math.max(0.05, (this.cooldown || 0.6) * 0.85);
    if (typeof this.splashRadius === "number") this.splashRadius *= 1.15;
    return true;
  }

  upgradeCost() {
    return Math.round((this.cost || 50) * (this.tier === 1 ? 0.6 : 0.9));
  }

  draw(ctx) {
    if (!this.vectorRenderer) {
      super.draw(ctx);
      return;
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    this.vectorRenderer(ctx, 0, 0, { scale: this.spriteScale });
    // Muzzle flash if fired in the last 90ms (rotated frame, drawn at barrel tip).
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
    if (this._lastFireMs && now - this._lastFireMs < 90) {
      const tipX = this.barrelLength;
      ctx.fillStyle = "rgba(255, 240, 120, 0.95)";
      ctx.beginPath();
      ctx.arc(tipX, 0, 6 + (this.tier - 1) * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 200, 80, 0.55)";
      ctx.beginPath();
      ctx.arc(tipX + 2, 0, 10 + (this.tier - 1) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // Tier pips drawn outside the rotated frame so they stay upright.
    if (this.tier > 1) {
      ctx.save();
      for (let i = 0; i < this.tier - 1; i += 1) {
        ctx.fillStyle = "#fbbf24";
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(this.x - 12 + i * 6, this.y + 18, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}

export class BasicTurret extends SpriteTurret {
  constructor(options = {}) {
    super({
      label: "Basic",
      cost: 50,
      damage: 1,
      range: 260,
      cooldown: 0.55,
      vectorRenderer: drawTurretBasic,
      barrelLength: 24,
      ...options
    });
  }
}

export class CannonTurret extends SpriteTurret {
  constructor(options = {}) {
    super({
      label: "Cannon",
      cost: 120,
      damage: 4,
      range: 220,
      cooldown: 1.3,
      splashRadius: options.splashRadius ?? 50,
      vectorRenderer: drawTurretCannon,
      barrelLength: 26,
      ...options
    });
    this.splashRadius = options.splashRadius ?? 50;
  }
}

export class FrostTurret extends SpriteTurret {
  constructor(options = {}) {
    super({
      label: "Frost",
      cost: 90,
      damage: 1,
      range: 240,
      cooldown: 0.85,
      slowFactor: options.slowFactor ?? 0.45,
      slowDuration: options.slowDuration ?? 1.6,
      vectorRenderer: drawTurretFrost,
      barrelLength: 21,
      ...options
    });
    this.slowFactor = options.slowFactor ?? 0.45;
    this.slowDuration = options.slowDuration ?? 1.6;
  }

  // Frost turret applies a slow effect to its target instead of (or in addition to) damage.
  // Override findTarget to also tag the target with a `slowedUntil` timestamp.
  update(dt, game) {
    super.update(dt, game);
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
    const target = this.findTarget(game?.entities ?? []);
    if (target && this.elapsed === 0) {
      target.slowedUntil = now + this.slowDuration;
      target.slowFactor = this.slowFactor;
    }
  }
}

export class BeamTurret extends SpriteTurret {
  constructor(options = {}) {
    super({
      label: "Beam",
      cost: 180,
      damage: 0.5,
      range: 320,
      cooldown: 0.05,
      vectorRenderer: drawTurretBeam,
      barrelLength: 22,
      ...options
    });
    this._beamTarget = null;
    this._beamColor = options.beamColor || "#c084fc";
  }

  update(dt, game) {
    this._beamTarget = this.findTarget(game?.entities ?? []);
    if (this._beamTarget) {
      this.angle = Math.atan2(this._beamTarget.y - this.y, this._beamTarget.x - this.x);
      // Continuous damage tick proportional to dt.
      if (typeof this._beamTarget.takeDamage === "function") {
        this._beamTarget.takeDamage(this.damage * dt * 60);
      } else if (typeof this._beamTarget.hp === "number") {
        this._beamTarget.hp -= this.damage * dt * 60;
      }
    }
  }

  draw(ctx) {
    super.draw(ctx);
    if (!this._beamTarget) return;
    ctx.save();
    ctx.strokeStyle = this._beamColor;
    ctx.lineWidth = 3;
    ctx.shadowColor = this._beamColor;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this._beamTarget.x, this._beamTarget.y);
    ctx.stroke();
    ctx.restore();
  }
}

export const TURRET_VARIANTS = {
  basic: BasicTurret,
  cannon: CannonTurret,
  frost: FrostTurret,
  beam: BeamTurret
};
