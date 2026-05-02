import { Entity } from "./Entity.js";

export class Paddle extends Entity {
  constructor(options = {}) {
    super({
      width: options.width ?? 14,
      height: options.height ?? 84,
      centered: false,
      ...options
    });
    this.speed = options.speed ?? 360;
    this.axis = options.axis || "y";
    this.color = options.color || "#ffffff";
  }

  move(direction, dt, bounds = {}) {
    const delta = direction * this.speed * dt;
    if (this.axis === "x") {
      this.x += delta;
      this.x = Math.max(bounds.minX ?? 0, Math.min(bounds.maxX ?? Infinity, this.x));
    } else {
      this.y += delta;
      this.y = Math.max(bounds.minY ?? 0, Math.min(bounds.maxY ?? Infinity, this.y));
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.width, this.height);
    ctx.restore();
  }
}
