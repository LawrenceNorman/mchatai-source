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
import { drawSprite } from "../resources/SpriteRenderer.js";
import {
  TURRET_BASIC, TURRET_BASIC_PALETTE,
  TURRET_CANNON, TURRET_CANNON_PALETTE,
  TURRET_FROST, TURRET_FROST_PALETTE,
  TURRET_BEAM, TURRET_BEAM_PALETTE
} from "../resources/SpritePresets.js";

class SpriteTurret extends Turret {
  constructor(options = {}) {
    super(options);
    this.spriteGrid = options.spriteGrid;
    this.spritePalette = options.spritePalette;
    this.spriteScale = options.spriteScale ?? 3;
    this.barrelLength = options.barrelLength ?? this.radius + 12;
    this.cost = options.cost ?? 50;
    this.damage = options.damage ?? 1;
    this.label = options.label || "Turret";
  }

  draw(ctx) {
    if (!this.spriteGrid || !this.spritePalette) {
      super.draw(ctx);
      return;
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    drawSprite(ctx, this.spriteGrid, this.spritePalette, {
      x: 0,
      y: 0,
      scale: this.spriteScale,
      anchor: "center"
    });
    ctx.restore();
  }
}

export class BasicTurret extends SpriteTurret {
  constructor(options = {}) {
    super({
      label: "Basic",
      cost: 50,
      damage: 1,
      range: 180,
      cooldown: 0.6,
      spriteGrid: TURRET_BASIC,
      spritePalette: TURRET_BASIC_PALETTE,
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
      range: 140,
      cooldown: 1.4,
      splashRadius: options.splashRadius ?? 40,
      spriteGrid: TURRET_CANNON,
      spritePalette: TURRET_CANNON_PALETTE,
      ...options
    });
    this.splashRadius = options.splashRadius ?? 40;
  }
}

export class FrostTurret extends SpriteTurret {
  constructor(options = {}) {
    super({
      label: "Frost",
      cost: 90,
      damage: 1,
      range: 160,
      cooldown: 0.9,
      slowFactor: options.slowFactor ?? 0.5,
      slowDuration: options.slowDuration ?? 1.5,
      spriteGrid: TURRET_FROST,
      spritePalette: TURRET_FROST_PALETTE,
      ...options
    });
    this.slowFactor = options.slowFactor ?? 0.5;
    this.slowDuration = options.slowDuration ?? 1.5;
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
      damage: 0.4,
      range: 220,
      cooldown: 0.05,
      spriteGrid: TURRET_BEAM,
      spritePalette: TURRET_BEAM_PALETTE,
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
