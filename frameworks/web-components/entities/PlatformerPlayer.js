import { Entity } from "./Entity.js";

export class PlatformerPlayer extends Entity {
  constructor(options = {}) {
    super({
      width: options.width ?? 28,
      height: options.height ?? 36,
      centered: false,
      ...options
    });
    this.moveSpeed = options.moveSpeed ?? 220;
    this.jumpSpeed = options.jumpSpeed ?? 520;
    this.gravity = options.gravity ?? 1500;
    this.coyoteTime = options.coyoteTime ?? 0.1;
    this.jumpBuffer = options.jumpBuffer ?? 0.1;
    this.onGround = false;
    this._coyoteTimer = 0;
    this._jumpBufferTimer = 0;
    this.color = options.color || "#facc15";
  }

  setInput(input = {}) {
    this.input = {
      left: Boolean(input.left),
      right: Boolean(input.right),
      jump: Boolean(input.jump)
    };
  }

  update(dt) {
    const input = this.input || {};
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    this.vx = dir * this.moveSpeed;
    this.vy += this.gravity * dt;

    if (this.onGround) {
      this._coyoteTimer = this.coyoteTime;
    } else {
      this._coyoteTimer = Math.max(0, this._coyoteTimer - dt);
    }

    if (input.jump) {
      this._jumpBufferTimer = this.jumpBuffer;
    } else {
      this._jumpBufferTimer = Math.max(0, this._jumpBufferTimer - dt);
    }

    if (this._jumpBufferTimer > 0 && this._coyoteTimer > 0) {
      this.vy = -this.jumpSpeed;
      this.onGround = false;
      this._jumpBufferTimer = 0;
      this._coyoteTimer = 0;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  landOn(y) {
    this.y = y - this.height;
    this.vy = 0;
    this.onGround = true;
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.width, this.height);
    ctx.restore();
  }
}
