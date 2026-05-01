import { integrateMotion } from "../core/Physics2D.js";
import { Entity } from "./Entity.js";

export const ASTEROID_LEVELS = {
  large: 3,
  medium: 2,
  small: 1
};

const LEVEL_BY_SIZE = {
  large: 3,
  medium: 2,
  small: 1
};

const SIZE_BY_LEVEL = {
  3: "large",
  2: "medium",
  1: "small"
};

const LEVEL_RADIUS = {
  3: 42,
  2: 22,
  1: 12
};

const LEVEL_SPEED = {
  3: [40, 80],
  2: [60, 110],
  1: [90, 160]
};

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function resolveLevel(options = {}) {
  if (typeof options.level === "number" && LEVEL_RADIUS[options.level]) {
    return options.level;
  }

  if (typeof options.size === "string" && LEVEL_BY_SIZE[options.size]) {
    return LEVEL_BY_SIZE[options.size];
  }

  return 3;
}

function buildPolygon(level, radius) {
  const pointCount = level === 3 ? 12 : level === 2 ? 10 : 8;
  const points = [];

  for (let index = 0; index < pointCount; index += 1) {
    const angle = (Math.PI * 2 * index) / pointCount;
    const variance = level === 3 ? 0.3 : level === 2 ? 0.26 : 0.22;
    const pointRadius = radius * (1 - variance + Math.random() * variance * 2);
    points.push({
      x: Math.cos(angle) * pointRadius,
      y: Math.sin(angle) * pointRadius
    });
  }

  return points;
}

export class Asteroid extends Entity {
  constructor(options = {}) {
    const level = resolveLevel(options);
    const radius = options.radius ?? LEVEL_RADIUS[level];
    const speedRange = LEVEL_SPEED[level];
    const travelAngle = options.travelAngle ?? randomBetween(0, Math.PI * 2);
    const speed = options.speed ?? randomBetween(speedRange[0], speedRange[1]);

    super({
      ...options,
      width: radius * 2,
      height: radius * 2,
      radius,
      wrap: options.wrap ?? true,
      centered: true,
      vx: options.vx ?? Math.cos(travelAngle) * speed,
      vy: options.vy ?? Math.sin(travelAngle) * speed
    });

    this.level = level;
    this.size = SIZE_BY_LEVEL[level];
    this.color = options.color ?? "#cbd5e1";
    this.rotation = options.rotation ?? randomBetween(0, Math.PI * 2);
    this.spin = options.spin ?? randomBetween(-1.1, 1.1);
    this.points = Array.isArray(options.points) && options.points.length > 2
      ? options.points
      : buildPolygon(level, radius);
  }

  update(dt, game) {
    integrateMotion(this, dt);
    this.rotation += this.spin * dt;

    if (this.wrap && game) {
      this.wrapWithin(game.width, game.height, this.radius);
    }
  }

  split() {
    if (this.level <= 1) {
      return [];
    }

    const nextLevel = this.level - 1;
    const children = [];

    for (let index = 0; index < 2; index += 1) {
      const angle = this.rotation + (Math.PI * 0.75 * (index === 0 ? -1 : 1));
      const speedBoost = LEVEL_SPEED[nextLevel][0] * 0.6;
      children.push(
        new Asteroid({
          x: this.x,
          y: this.y,
          level: nextLevel,
          vx: this.vx + Math.cos(angle) * speedBoost,
          vy: this.vy + Math.sin(angle) * speedBoost,
          color: this.color
        })
      );
    }

    return children;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    this.points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });

    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}
