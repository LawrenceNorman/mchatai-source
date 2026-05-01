function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function getAABB(body = {}) {
  if (typeof body.getAABB === "function") {
    return normalizeAABB(body.getAABB());
  }

  const bounds = body.hitbox || body.bounds || {};
  const width = finiteNumber(bounds.width ?? body.width, 0);
  const height = finiteNumber(bounds.height ?? body.height, 0);
  let x = finiteNumber(bounds.x ?? body.x, 0);
  let y = finiteNumber(bounds.y ?? body.y, 0);
  const centered = bounds.centered ?? body.centered ?? false;

  if (centered) {
    x -= width / 2;
    y -= height / 2;
  }

  return normalizeAABB({ x, y, width, height });
}

export function getCircle(body = {}) {
  const radius = Math.max(
    0,
    finiteNumber(
      body.radius,
      Math.max(
        finiteNumber(body.width, 0),
        finiteNumber(body.height, 0)
      ) / 2
    )
  );

  return {
    x: finiteNumber(body.x, 0),
    y: finiteNumber(body.y, 0),
    radius
  };
}

function normalizeAABB(box = {}) {
  const x = finiteNumber(box.x, 0);
  const y = finiteNumber(box.y, 0);
  const width = Math.max(0, finiteNumber(box.width, 0));
  const height = Math.max(0, finiteNumber(box.height, 0));

  return {
    x,
    y,
    width,
    height,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height
  };
}

export function intersectsAABB(a, b, padding = 0) {
  const boxA = getAABB(a);
  const boxB = getAABB(b);

  return !(
    boxA.right < boxB.left - padding ||
    boxA.left > boxB.right + padding ||
    boxA.bottom < boxB.top - padding ||
    boxA.top > boxB.bottom + padding
  );
}

export function intersectsCircle(a, b, padding = 0) {
  const circleA = getCircle(a);
  const circleB = getCircle(b);
  const dx = circleA.x - circleB.x;
  const dy = circleA.y - circleB.y;
  const radius = circleA.radius + circleB.radius + finiteNumber(padding, 0);

  return dx * dx + dy * dy <= radius * radius;
}

export function integrateMotion(body, dt, options = {}) {
  const next = body;
  const ax = finiteNumber(options.ax ?? next.ax, 0);
  const ay = finiteNumber(options.ay ?? next.ay, 0);
  const damping = clamp(finiteNumber(options.damping ?? next.damping, 0), 0, 1);

  next.vx = finiteNumber(options.vx ?? next.vx, 0) + ax * dt;
  next.vy = finiteNumber(options.vy ?? next.vy, 0) + ay * dt;

  const maxSpeedX = finiteNumber(options.maxSpeedX ?? next.maxSpeedX, Infinity);
  const maxSpeedY = finiteNumber(options.maxSpeedY ?? next.maxSpeedY, Infinity);
  const maxSpeed = finiteNumber(options.maxSpeed ?? next.maxSpeed, Infinity);

  next.vx = clamp(next.vx, -Math.min(maxSpeed, maxSpeedX), Math.min(maxSpeed, maxSpeedX));
  next.vy = clamp(next.vy, -Math.min(maxSpeed, maxSpeedY), Math.min(maxSpeed, maxSpeedY));

  if (damping > 0) {
    const retainedVelocity = Math.max(0, 1 - damping * dt);
    next.vx *= retainedVelocity;
    next.vy *= retainedVelocity;
  }

  next.x = finiteNumber(next.x, 0) + next.vx * dt;
  next.y = finiteNumber(next.y, 0) + next.vy * dt;

  return next;
}

export function findAABBCollisions(bodies = [], options = {}) {
  const collisions = [];
  const padding = finiteNumber(options.padding, 0);
  const filter =
    typeof options.filter === "function" ? options.filter : () => true;

  for (let index = 0; index < bodies.length; index += 1) {
    const bodyA = bodies[index];
    if (!bodyA) {
      continue;
    }

    for (let inner = index + 1; inner < bodies.length; inner += 1) {
      const bodyB = bodies[inner];
      if (!bodyB || !filter(bodyA, bodyB)) {
        continue;
      }

      if (intersectsAABB(bodyA, bodyB, padding)) {
        collisions.push({
          a: bodyA,
          b: bodyB,
          aabbA: getAABB(bodyA),
          aabbB: getAABB(bodyB)
        });
      }
    }
  }

  return collisions;
}

export function findCircleCollisions(bodies = [], options = {}) {
  const collisions = [];
  const padding = finiteNumber(options.padding, 0);
  const filter =
    typeof options.filter === "function" ? options.filter : () => true;

  for (let index = 0; index < bodies.length; index += 1) {
    const bodyA = bodies[index];
    if (!bodyA) {
      continue;
    }

    for (let inner = index + 1; inner < bodies.length; inner += 1) {
      const bodyB = bodies[inner];
      if (!bodyB || !filter(bodyA, bodyB)) {
        continue;
      }

      if (intersectsCircle(bodyA, bodyB, padding)) {
        collisions.push({
          a: bodyA,
          b: bodyB,
          circleA: getCircle(bodyA),
          circleB: getCircle(bodyB)
        });
      }
    }
  }

  return collisions;
}

export class Physics2D {
  static getAABB(body) {
    return getAABB(body);
  }

  static getCircle(body) {
    return getCircle(body);
  }

  static intersectsAABB(a, b, padding = 0) {
    return intersectsAABB(a, b, padding);
  }

  static intersectsCircle(a, b, padding = 0) {
    return intersectsCircle(a, b, padding);
  }

  static integrateMotion(body, dt, options = {}) {
    return integrateMotion(body, dt, options);
  }

  static updateBodies(bodies = [], dt, options = {}) {
    for (const body of bodies) {
      if (!body) {
        continue;
      }
      integrateMotion(body, dt, options);
    }
    return bodies;
  }

  static findAABBCollisions(bodies = [], options = {}) {
    return findAABBCollisions(bodies, options);
  }

  static findCircleCollisions(bodies = [], options = {}) {
    return findCircleCollisions(bodies, options);
  }
}
