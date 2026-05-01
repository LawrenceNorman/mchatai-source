import { Entity } from "./Entity.js";

export class Projectile extends Entity {
  constructor(options = {}) {
    const speed = options.speed ?? 520;
    const angle = options.angle ?? 0;
    super({
      ...options,
      width: options.width ?? 4,
      height: options.height ?? 4,
      radius: options.radius ?? 2,
      wrap: options.wrap ?? false,
      centered: true,
      vx: options.vx ?? Math.cos(angle) * speed,
      vy: options.vy ?? Math.sin(angle) * speed
    });

    this.angle = angle;
    this.speed = speed;
    this.ttl = options.ttl ?? 0.95;
    this.length = options.length ?? 10;
    this.color = options.color ?? "#f8fafc";
  }

  update(dt, game) {
    super.update(dt, game);
    this.ttl -= dt;

    if (this.ttl <= 0) {
      this.destroy();
    }
  }

  draw(ctx) {
    const tailX = this.x - Math.cos(this.angle) * this.length;
    const tailY = this.y - Math.sin(this.angle) * this.length;

    ctx.save();
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();
    ctx.restore();
  }
}
