import { Entity } from "./Entity.js";

export class Turret extends Entity {
  constructor(options = {}) {
    super({ radius: options.radius ?? 16, width: options.width ?? 32, height: options.height ?? 32, ...options });
    this.range = options.range ?? 180;
    this.cooldown = options.cooldown ?? 0.6;
    this.elapsed = 0;
    this.angle = options.angle ?? 0;
    this.projectileFactory = options.projectileFactory ?? null;
    this.color = options.color ?? "#ffde59";
  }

  update(dt, game) {
    this.elapsed += dt;
    const target = this.findTarget(game?.entities ?? []);
    if (!target) {
      return;
    }
    this.angle = Math.atan2(target.y - this.y, target.x - this.x);
    if (this.elapsed >= this.cooldown) {
      this.elapsed = 0;
      const projectile = this.projectileFactory?.(this, target);
      if (projectile && game?.addEntity) {
        game.addEntity(projectile);
      }
    }
  }

  findTarget(entities) {
    let best = null;
    let bestDistance = Infinity;
    for (const entity of entities) {
      if (!entity || entity === this || entity.destroyed || entity.faction === this.faction) {
        continue;
      }
      const distance = Math.hypot(entity.x - this.x, entity.y - this.y);
      if (distance <= this.range && distance < bestDistance) {
        best = entity;
        bestDistance = distance;
      }
    }
    return best;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.moveTo(0, 0);
    ctx.lineTo(this.radius + 12, 0);
    ctx.stroke();
    ctx.restore();
  }
}
