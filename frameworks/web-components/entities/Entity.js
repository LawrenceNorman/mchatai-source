import { integrateMotion } from "../core/Physics2D.js";

export class Entity {
  constructor(options = {}) {
    this.x = options.x ?? 0;
    this.y = options.y ?? 0;
    this.vx = options.vx ?? 0;
    this.vy = options.vy ?? 0;
    this.ax = options.ax ?? 0;
    this.ay = options.ay ?? 0;
    this.width = options.width ?? 0;
    this.height = options.height ?? 0;
    this.radius = options.radius ?? Math.max(this.width, this.height) / 2;
    this.centered = options.centered ?? true;
    this.wrap = options.wrap ?? false;
    this.visible = options.visible ?? true;
    this.active = options.active ?? true;
    this.zIndex = options.zIndex ?? 0;
    this.tags = Array.isArray(options.tags) ? options.tags.slice() : [];
    this.damping = options.damping ?? 0;
    this.maxSpeed = options.maxSpeed ?? Infinity;
    this.game = null;
  }

  update(dt, game) {
    integrateMotion(this, dt);

    if (this.wrap && game) {
      this.wrapWithin(game.width, game.height, this.radius || 0);
    }
  }

  draw() {}

  onAdd() {}

  onRemove() {}

  destroy() {
    this.active = false;
    this.visible = false;

    if (this.game && typeof this.game.removeEntity === "function") {
      this.game.removeEntity(this);
    }
  }

  wrapWithin(width, height, padding = 0) {
    if (!width || !height) {
      return;
    }

    if (this.x < -padding) {
      this.x = width + padding;
    } else if (this.x > width + padding) {
      this.x = -padding;
    }

    if (this.y < -padding) {
      this.y = height + padding;
    } else if (this.y > height + padding) {
      this.y = -padding;
    }
  }

  getAABB() {
    const width = this.width || this.radius * 2;
    const height = this.height || this.radius * 2;
    return {
      x: this.centered ? this.x - width / 2 : this.x,
      y: this.centered ? this.y - height / 2 : this.y,
      width,
      height
    };
  }

  distanceTo(other) {
    const dx = (other?.x ?? 0) - this.x;
    const dy = (other?.y ?? 0) - this.y;
    return Math.hypot(dx, dy);
  }
}
