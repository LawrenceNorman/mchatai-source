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
    // Row 10k (2026-05-29): generic adventurer sprite (teal jumpsuit +
    // headband, no red-cap-blue-overalls Mario combo). Width 28 / height 36
    // default; everything scales off this.width / this.height fractions.
    // Original "plumber-style" rendering was too close to a trademarked
    // character; user-facing artifacts must read as generic.
    const x = this.x;
    const y = this.y;
    const w = this.width;
    const h = this.height;
    const facing = this.vx >= 0 ? 1 : -1;
    ctx.save();
    // soft drop shadow under feet
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h + 1, w * 0.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // pants / lower body (slate)
    ctx.fillStyle = "#475569";
    ctx.fillRect(x, y + h * 0.45, w, h * 0.55);
    // jumpsuit / upper torso (teal)
    ctx.fillStyle = "#0d9488";
    ctx.fillRect(x + 1, y + h * 0.30, w - 2, h * 0.20);
    // arms (subtle swing when moving) — match torso
    const armSwing = (this.vx !== 0 ? Math.sin(performance.now() / 90) * 2 : 0);
    ctx.fillRect(x - 2, y + h * 0.32 + armSwing, 5, h * 0.18);
    ctx.fillRect(x + w - 3, y + h * 0.32 - armSwing, 5, h * 0.18);
    // boots (dark slate)
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(x, y + h - 5, w * 0.45, 5);
    ctx.fillRect(x + w * 0.55, y + h - 5, w * 0.45, 5);
    // belt accent
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(x, y + h * 0.45 - 2, w, 2);
    // belt buckle
    ctx.fillStyle = "#facc15";
    ctx.fillRect(x + w * 0.45, y + h * 0.45 - 2, w * 0.1, 2);
    // face (neutral tan)
    ctx.fillStyle = "#d6b88c";
    ctx.fillRect(x + 3, y + h * 0.10, w - 6, h * 0.22);
    // eyes (facing-aware)
    ctx.fillStyle = "#0a1a05";
    const eyeOffset = facing > 0 ? 1 : -1;
    ctx.beginPath();
    ctx.arc(x + w * 0.35 + eyeOffset, y + h * 0.18, 1.5, 0, Math.PI * 2);
    ctx.arc(x + w * 0.65 + eyeOffset, y + h * 0.18, 1.5, 0, Math.PI * 2);
    ctx.fill();
    // headband — thin teal stripe across forehead (replaces the cap, no
    // brim that points facing — keeps the silhouette unique without
    // implying any specific character)
    ctx.fillStyle = "#0d9488";
    ctx.fillRect(x + 1, y + h * 0.06, w - 2, h * 0.06);
    // headband knot trailing in facing direction (small accent)
    ctx.fillStyle = "#0d9488";
    if (facing > 0) {
      ctx.fillRect(x + w - 2, y + h * 0.05, 4, h * 0.08);
    } else {
      ctx.fillRect(x - 2, y + h * 0.05, 4, h * 0.08);
    }
    ctx.restore();
  }
}
