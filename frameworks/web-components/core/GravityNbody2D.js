/**
 * GravityNbody2D — 2D inverse-square N-body gravity integrator with a
 * trajectory predictor that REPLAYS the exact same integrator.
 *
 * Pure math/logic, renderer-agnostic, dependency-free, offline-only. Models a
 * set of fixed attractors ("bodies") and integrates a single moving point
 * (a probe / ship / projectile) through their combined gravitational field
 * using semi-implicit Euler with configurable sub-steps.
 *
 * The headline guarantee: `predict()` calls the *same* `step()` used during
 * live flight, so the dashed aim/trajectory arc you draw before launch matches
 * the actual flown path exactly (slingshot / orbit / gravity-puzzle aiming).
 * If the two ever drifted (e.g. a separate "preview" integrator), the preview
 * would lie — so there is intentionally only one integrator.
 *
 * Acceleration model (per attractor, classic softened inverse-square):
 *   d  = distance(point, body)
 *   f  = G * body.mass / (d^2 * d + softening)
 *   a += (body.x - point.x) * f, (body.y - point.y) * f
 * The extra `* d` (i.e. f scales with 1/d^3 before multiplying the raw delta
 * vector) yields a true 1/d^2 acceleration magnitude while reusing the
 * unnormalized delta — and the `softening` term prevents a singularity blow-up
 * at very small distances.
 *
 * Collision / termination: a point that enters any attractor's radius reports a
 * `crash`; a point that leaves the world `bounds` reports `escape`. Both halt a
 * prediction early and are surfaced to callers so they can decide outcome.
 *
 * Coordinate / unit agnostic: feed it whatever units you draw in (pixels,
 * meters). `G` and `mass` are tuning knobs, not physical constants. No DOM, no
 * canvas, no timers — call `step()` from your own loop and draw the result.
 *
 * @example
 *   import { GravityNbody2D } from "./core/GravityNbody2D.js";
 *   const field = new GravityNbody2D({
 *     G: 1600,
 *     bodies: [{ x: 550, y: 360, radius: 48, mass: 9000 }],
 *     bounds: { x: 0, y: 0, width: 1100, height: 720 }
 *   });
 *   // live flight
 *   const probe = { x: 120, y: 360, vx: 240, vy: -80 };
 *   const r = field.step(probe, 1 / 60);   // mutates probe.x/y/vx/vy
 *   if (r.event === "crash") { ... }
 *   // matching aim preview (does NOT mutate probe):
 *   const path = field.predict({ x: 120, y: 360, vx: 240, vy: -80 });
 *   // path.points -> [{x,y}, ...] ready to stroke as a dashed line
 *
 * @example launch helper (drag-to-aim slingshot)
 *   const launch = GravityNbody2D.launchVelocity(
 *     { x: ship.x, y: ship.y }, dragPoint,
 *     { power: 2.4, maxPull: 200 }   // velocity = direction(ship - drag) * pull * power
 *   );
 *   const preview = field.predict({ ...ship, vx: launch.vx, vy: launch.vy });
 */

const DEFAULT_G = 1000;
const DEFAULT_SOFTENING = 1;
const DEFAULT_SUBSTEPS = 4;
const DEFAULT_PREDICT_STEPS = 160;
const DEFAULT_PREDICT_DT = 1 / 60;

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeBody(body = {}) {
  return {
    x: finiteNumber(body.x, 0),
    y: finiteNumber(body.y, 0),
    radius: Math.max(0, finiteNumber(body.radius, 0)),
    mass: finiteNumber(body.mass, 0),
    // any extra fields (id, type, color…) are preserved by reference below
    ...body
  };
}

function normalizeBounds(bounds) {
  if (!bounds) {
    return null;
  }
  const x = finiteNumber(bounds.x, 0);
  const y = finiteNumber(bounds.y, 0);
  const width = finiteNumber(bounds.width, 0);
  const height = finiteNumber(bounds.height, 0);
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

export class GravityNbody2D {
  /**
   * @param {object} [options]
   * @param {number} [options.G=1000] Gravitational strength constant (tuning knob).
   * @param {Array}  [options.bodies=[]] Attractors, each { x, y, radius, mass, ... }.
   * @param {number} [options.softening=1] Added to the denominator to avoid singularities.
   * @param {number} [options.subSteps=4] Integration sub-steps per `step()` call (higher = more accurate fast passes).
   * @param {object|null} [options.bounds=null] Optional world rect { x, y, width, height }; leaving it = `escape`.
   * @param {number} [options.escapeMargin=0] Extra slack outside `bounds` before `escape` fires.
   * @param {number} [options.predictSteps=160] Max integration steps a prediction runs.
   * @param {number} [options.predictDt=1/60] Time-step used by `predict()` (default matches a 60fps `step`).
   * @param {number} [options.predictSampleEvery=2] Keep every Nth predicted point (thins the dashed line).
   */
  constructor(options = {}) {
    this.G = finiteNumber(options.G, DEFAULT_G);
    this.softening = Math.max(0, finiteNumber(options.softening, DEFAULT_SOFTENING));
    this.subSteps = Math.max(1, Math.floor(finiteNumber(options.subSteps, DEFAULT_SUBSTEPS)));
    this.bodies = (options.bodies || []).map(normalizeBody);
    this.bounds = normalizeBounds(options.bounds);
    this.escapeMargin = finiteNumber(options.escapeMargin, 0);
    this.predictSteps = Math.max(1, Math.floor(finiteNumber(options.predictSteps, DEFAULT_PREDICT_STEPS)));
    this.predictDt = finiteNumber(options.predictDt, DEFAULT_PREDICT_DT);
    this.predictSampleEvery = Math.max(1, Math.floor(finiteNumber(options.predictSampleEvery, 2)));
  }

  /** Replace the attractor set (e.g. loading a new puzzle layout). */
  setBodies(bodies = []) {
    this.bodies = bodies.map(normalizeBody);
    return this;
  }

  /** Add a single attractor. Returns the normalized body. */
  addBody(body = {}) {
    const normalized = normalizeBody(body);
    this.bodies.push(normalized);
    return normalized;
  }

  /** Update the world bounds (or pass null to remove escape detection). */
  setBounds(bounds) {
    this.bounds = normalizeBounds(bounds);
    return this;
  }

  /**
   * Combined gravitational acceleration at a point from all attractors.
   * @param {{x:number,y:number}} point
   * @param {Array} [bodies] Attractor list (defaults to this.bodies).
   * @returns {{ax:number, ay:number, crashed:boolean, body:object|null}}
   *   `crashed` is true (and `body` set) when the point is inside an attractor's radius.
   */
  gravityAt(point, bodies = this.bodies) {
    let ax = 0;
    let ay = 0;
    const px = finiteNumber(point.x, 0);
    const py = finiteNumber(point.y, 0);
    for (const body of bodies) {
      const dx = body.x - px;
      const dy = body.y - py;
      const d2 = dx * dx + dy * dy;
      const d = Math.sqrt(d2);
      if (d < body.radius) {
        return { ax: 0, ay: 0, crashed: true, body };
      }
      const f = (this.G * body.mass) / (d2 * d + this.softening);
      ax += dx * f;
      ay += dy * f;
    }
    return { ax, ay, crashed: false, body: null };
  }

  /** True when a point lies outside the world bounds (plus escapeMargin). */
  isOutOfBounds(point) {
    if (!this.bounds) {
      return false;
    }
    const m = this.escapeMargin;
    const px = finiteNumber(point.x, 0);
    const py = finiteNumber(point.y, 0);
    return (
      px < this.bounds.left - m ||
      px > this.bounds.right + m ||
      py < this.bounds.top - m ||
      py > this.bounds.bottom + m
    );
  }

  /**
   * Advance one point through the field by `dt`, mutating its x/y/vx/vy in place
   * (semi-implicit Euler, integrated over `subSteps` sub-steps for stability on
   * fast / close passes). This is the single source of truth — `predict()`
   * replays it so the preview arc matches actual flight exactly.
   *
   * @param {{x:number,y:number,vx:number,vy:number}} probe Mutated in place.
   * @param {number} dt Time step.
   * @returns {{event:('move'|'crash'|'escape'), body:object|null}}
   *   `crash` -> entered an attractor (probe left at the crash point);
   *   `escape` -> left world bounds; otherwise `move`.
   */
  step(probe, dt) {
    const steps = this.subSteps;
    const subDt = dt / steps;
    for (let s = 0; s < steps; s += 1) {
      const g = this.gravityAt(probe);
      if (g.crashed) {
        return { event: "crash", body: g.body };
      }
      probe.vx = finiteNumber(probe.vx, 0) + g.ax * subDt;
      probe.vy = finiteNumber(probe.vy, 0) + g.ay * subDt;
      probe.x = finiteNumber(probe.x, 0) + probe.vx * subDt;
      probe.y = finiteNumber(probe.y, 0) + probe.vy * subDt;
    }
    if (this.isOutOfBounds(probe)) {
      return { event: "escape", body: null };
    }
    return { event: "move", body: null };
  }

  /**
   * Predict a trajectory by REPLAYING `step()` on a throwaway copy of `probe`
   * (the input is never mutated). Use the returned `points` to stroke a dashed
   * aim line that is guaranteed to match the flown path because it uses the same
   * integrator, sub-steps, and softening as live flight.
   *
   * @param {{x:number,y:number,vx:number,vy:number}} probe Starting state (read-only).
   * @param {object} [options]
   * @param {number} [options.steps]        Override predictSteps for this call.
   * @param {number} [options.dt]           Override predictDt for this call.
   * @param {number} [options.sampleEvery]  Override predictSampleEvery for this call.
   * @returns {{points:Array<{x:number,y:number}>, end:('crash'|'escape'|'maxSteps'), body:object|null, steps:number}}
   */
  predict(probe, options = {}) {
    const steps = Math.max(1, Math.floor(finiteNumber(options.steps, this.predictSteps)));
    const dt = finiteNumber(options.dt, this.predictDt);
    const sampleEvery = Math.max(1, Math.floor(finiteNumber(options.sampleEvery, this.predictSampleEvery)));

    const sim = {
      x: finiteNumber(probe.x, 0),
      y: finiteNumber(probe.y, 0),
      vx: finiteNumber(probe.vx, 0),
      vy: finiteNumber(probe.vy, 0)
    };

    const points = [{ x: sim.x, y: sim.y }];
    let end = "maxSteps";
    let body = null;
    let taken = 0;

    for (let i = 0; i < steps; i += 1) {
      const result = this.step(sim, dt);
      taken += 1;
      if (result.event === "crash") {
        end = "crash";
        body = result.body;
        points.push({ x: sim.x, y: sim.y });
        break;
      }
      if (result.event === "escape") {
        end = "escape";
        points.push({ x: sim.x, y: sim.y });
        break;
      }
      if (i % sampleEvery === 0) {
        points.push({ x: sim.x, y: sim.y });
      }
    }

    return { points, end, body, steps: taken };
  }

  /**
   * Convenience: drag-to-aim slingshot velocity. Returns a velocity pointing
   * from `dragPoint` toward `origin` (the classic "pull back, release to fling"
   * direction), magnitude clamped to `maxPull` then scaled by `power`.
   *
   * @param {{x:number,y:number}} origin   The launch point (e.g. ship position).
   * @param {{x:number,y:number}} dragPoint Where the player dragged to.
   * @param {object} [options]
   * @param {number} [options.power=1]     Velocity-per-pull-unit multiplier.
   * @param {number} [options.maxPull=Infinity] Clamp on the pull distance.
   * @param {number} [options.minPull=0]   Below this, returns zero velocity (dead zone).
   * @returns {{vx:number, vy:number, pull:number, angle:number}}
   */
  static launchVelocity(origin, dragPoint, options = {}) {
    const power = finiteNumber(options.power, 1);
    const maxPull = finiteNumber(options.maxPull, Infinity);
    const minPull = Math.max(0, finiteNumber(options.minPull, 0));

    const dx = finiteNumber(origin.x, 0) - finiteNumber(dragPoint.x, 0);
    const dy = finiteNumber(origin.y, 0) - finiteNumber(dragPoint.y, 0);
    const mag = Math.hypot(dx, dy);
    if (mag < minPull || mag === 0) {
      return { vx: 0, vy: 0, pull: 0, angle: 0 };
    }
    const pull = Math.min(mag, maxPull);
    const speed = pull * power;
    return {
      vx: (dx / mag) * speed,
      vy: (dy / mag) * speed,
      pull,
      angle: Math.atan2(dy, dx)
    };
  }
}

export default GravityNbody2D;
