export class CameraFollow {
  constructor(options = {}) {
    this.x = options.x ?? 0;
    this.y = options.y ?? 0;
    this.lerp = options.lerp ?? 0.12;
    this.deadZone = options.deadZone ?? 0;
    this.bounds = options.bounds ?? null;
  }

  follow(target, viewport = {}) {
    if (!target) {
      return this;
    }
    const targetX = target.x - (viewport.width ?? 0) / 2;
    const targetY = target.y - (viewport.height ?? 0) / 2;
    if (Math.hypot(targetX - this.x, targetY - this.y) > this.deadZone) {
      this.x += (targetX - this.x) * this.lerp;
      this.y += (targetY - this.y) * this.lerp;
    }
    this.clamp(viewport);
    return this;
  }

  clamp(viewport = {}) {
    if (!this.bounds) {
      return;
    }
    const maxX = this.bounds.x + this.bounds.width - (viewport.width ?? 0);
    const maxY = this.bounds.y + this.bounds.height - (viewport.height ?? 0);
    this.x = Math.min(Math.max(this.x, this.bounds.x), maxX);
    this.y = Math.min(Math.max(this.y, this.bounds.y), maxY);
  }

  apply(ctx) {
    ctx.translate(-this.x, -this.y);
  }

  worldToScreen(x, y) {
    return { x: x - this.x, y: y - this.y };
  }

  screenToWorld(x, y) {
    return { x: x + this.x, y: y + this.y };
  }
}
