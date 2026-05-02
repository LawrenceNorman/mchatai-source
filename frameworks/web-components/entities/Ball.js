import { Entity } from "./Entity.js";

export class Ball extends Entity {
  constructor(options = {}) {
    super({
      radius: options.radius ?? 6,
      width: (options.radius ?? 6) * 2,
      height: (options.radius ?? 6) * 2,
      ...options
    });
    this.speed = options.speed ?? 280;
    this.color = options.color || "#ffffff";
  }

  reset(x, y, angle = 0) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * this.speed;
    this.vy = Math.sin(angle) * this.speed;
    return this;
  }

  bounceY() {
    this.vy *= -1;
  }

  bounceX(spin = 0) {
    this.vx *= -1;
    this.vy += spin;
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
