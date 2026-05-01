import { integrateMotion } from "../core/Physics2D.js";
import { Entity } from "./Entity.js";
import { Projectile } from "./Projectile.js";

export class SpaceShip extends Entity {
  constructor(options = {}) {
    super({
      ...options,
      width: options.width ?? 24,
      height: options.height ?? 24,
      radius: options.radius ?? 12,
      wrap: options.wrap ?? true,
      centered: true
    });

    this.angle = options.angle ?? -Math.PI / 2;
    this.turnSpeed = options.turnSpeed ?? 4.6;
    this.thrustPower = options.thrustPower ?? 280;
    this.drag = options.drag ?? 0.985;
    this.maxSpeed = options.maxSpeed ?? 360;
    this.projectileSpeed = options.projectileSpeed ?? 520;
    this.projectileTTL = options.projectileTTL ?? 0.95;
    this.projectileLength = options.projectileLength ?? 12;
    this.fireCooldown = options.fireCooldown ?? 0.18;
    this.fireTimer = 0;
    this.color = options.color ?? "#f8fafc";
    this.thrustColor = options.thrustColor ?? "#fb923c";
    this.invulnerableFor = options.invulnerableFor ?? 0;
    this.inputState = {
      left: false,
      right: false,
      thrust: false,
      fire: false
    };
  }

  setInputState(nextState = {}) {
    this.inputState = {
      ...this.inputState,
      ...nextState
    };
  }

  update(dt, game) {
    if (this.invulnerableFor > 0) {
      this.invulnerableFor = Math.max(0, this.invulnerableFor - dt);
    }

    this.fireTimer = Math.max(0, this.fireTimer - dt);

    if (this.inputState.left) {
      this.angle -= this.turnSpeed * dt;
    }

    if (this.inputState.right) {
      this.angle += this.turnSpeed * dt;
    }

    if (this.inputState.thrust) {
      this.ax = Math.cos(this.angle) * this.thrustPower;
      this.ay = Math.sin(this.angle) * this.thrustPower;
    } else {
      this.ax = 0;
      this.ay = 0;
    }

    integrateMotion(this, dt, { maxSpeed: this.maxSpeed });
    this.vx *= Math.pow(this.drag, dt * 60);
    this.vy *= Math.pow(this.drag, dt * 60);

    if (this.wrap && game) {
      this.wrapWithin(game.width, game.height, this.radius);
    }
  }

  canFire() {
    return this.fireTimer <= 0;
  }

  createProjectile(options = {}) {
    if (!this.canFire()) {
      return null;
    }

    const muzzleDistance = this.radius + 8;
    const spawnX = this.x + Math.cos(this.angle) * muzzleDistance;
    const spawnY = this.y + Math.sin(this.angle) * muzzleDistance;
    const projectileVelocityX = this.vx + Math.cos(this.angle) * this.projectileSpeed;
    const projectileVelocityY = this.vy + Math.sin(this.angle) * this.projectileSpeed;

    this.fireTimer = this.fireCooldown;

    return new Projectile({
      x: spawnX,
      y: spawnY,
      angle: this.angle,
      speed: this.projectileSpeed,
      ttl: this.projectileTTL,
      length: this.projectileLength,
      color: options.color ?? this.color,
      vx: options.vx ?? projectileVelocityX,
      vy: options.vy ?? projectileVelocityY,
      wrap: options.wrap ?? false
    });
  }

  draw(ctx) {
    if (this.invulnerableFor > 0) {
      const blinkOn = Math.floor(this.invulnerableFor * 12) % 2 === 0;
      if (!blinkOn) {
        return;
      }
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle + Math.PI / 2);
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -this.radius);
    ctx.lineTo(this.radius * 0.76, this.radius);
    ctx.lineTo(0, this.radius * 0.42);
    ctx.lineTo(-this.radius * 0.76, this.radius);
    ctx.closePath();
    ctx.stroke();

    if (this.inputState.thrust) {
      ctx.strokeStyle = this.thrustColor;
      ctx.beginPath();
      ctx.moveTo(-this.radius * 0.4, this.radius * 0.88);
      ctx.lineTo(0, this.radius * 1.48);
      ctx.lineTo(this.radius * 0.4, this.radius * 0.88);
      ctx.stroke();
    }

    ctx.restore();
  }
}
