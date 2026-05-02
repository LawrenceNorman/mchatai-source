import { Entity } from "./Entity.js";

export class PathFollower extends Entity {
  constructor(options = {}) {
    super(options);
    this.path = options.path || [];
    this.speed = options.speed ?? 80;
    this.targetIndex = options.targetIndex ?? 0;
    this.loop = options.loop ?? false;
    this.arrived = false;
  }

  update(dt) {
    if (this.arrived || this.path.length === 0) {
      return;
    }
    const target = this.path[this.targetIndex];
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (dist <= step || dist === 0) {
      this.x = target.x;
      this.y = target.y;
      this.targetIndex += 1;
      if (this.targetIndex >= this.path.length) {
        if (this.loop) {
          this.targetIndex = 0;
        } else {
          this.arrived = true;
        }
      }
      return;
    }
    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
  }
}
