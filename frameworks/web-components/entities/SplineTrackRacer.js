// BEGIN mchatai-web-components: entities.spline-track-racer (entities/SplineTrackRacer.js)
//
// PLAIN JS CLASS — NOT A WEB CUSTOM ELEMENT.
// DO NOT call customElements.define() on this class.
// DO NOT use <spline-track-racer> tags in HTML.
// Instantiate with `new` and call methods. YOU draw the UI.
// See wisdom rule fs-015 for the full pattern + worked examples.
//
// Dependency-free. Pure math + logic; no canvas, no DOM, no rAF. Offline only.

/**
 * 2D spline-track racer core — the math/logic engine behind a top-down
 * kart / car / boat racing game. Renderer-agnostic: it builds the track,
 * tracks lap progress, and drives AI opponents, but it never draws anything.
 * You read the exposed state ({@link SplineTrack#centerline}, kart `x/y/angle`,
 * lap/timer fields) and paint it however you like (canvas, SVG, WebGL).
 *
 * It bundles four classically-coupled pieces of a spline racer:
 *
 *   1. SplineTrack — a closed-loop Catmull-Rom centerline sampled from a small
 *      set of control points, plus left/right edge ("kerb") ribbons offset by
 *      half the track width, axis-aligned bounds (for a minimap), per-sample
 *      tangent/normal frames, and a windowed nearest-sample search so a moving
 *      body can cheaply know "how far am I from the racing line, and which
 *      sample am I nearest?" without scanning the whole loop every frame.
 *
 *   2. RacerBody — a steerable arcade-physics body (accelerate / brake /
 *      reverse / coast, speed-scaled steering authority, off-track drag), kept
 *      deliberately simple and tunable. Pure integration; you feed it controls.
 *
 *   3. WaypointDriver — a look-ahead waypoint-follow AI that steers a RacerBody
 *      toward a sample N steps ahead on the centerline and eases its target
 *      speed down for sharp corners. Good enough for believable rival cars.
 *
 *   4. LapTimer — start/finish gate crossing + lap counting with a half-lap
 *      anti-cheat guard (you must pass the far side of the loop before a
 *      crossing counts), best/last lap times, and total-race finish detection.
 *
 * All four are independent — use the track alone for a path-art toy, the body
 * alone for a free-roam car, the lap timer alone over your own positions, etc.
 *
 * COORDINATE / UNIT NOTES
 *   - Distances are in whatever units your control points use (pixels, metres…).
 *   - Angles are radians; `angle` 0 points +X, increasing clockwise on a
 *     screen-style (y-down) canvas.
 *   - RacerBody.update / WaypointDriver.update take a unitless `dt` "time step"
 *     that you scale to taste (e.g. deltaMs / 16.667 for ~60fps-relative feel,
 *     clamped to avoid spiral-of-death on tab switches). Speeds/accels are then
 *     "units per step".
 *
 * WORKED SKELETON
 *   const track = new SplineTrack({
 *     controlPoints: [{x:620,y:300},{x:1320,y:270}, ... ], // >= 3, loops
 *     width: 158, samplesPerSegment: 24, startIndex: 2
 *   });
 *   const player = new RacerBody({ maxSpeed: 7.5 });
 *   track.placeBodyAtStart(player, { laneOffset: -30, sampleIndex: 3 });
 *   const rival = new RacerBody({ maxSpeed: 7.4 });
 *   track.placeBodyAtStart(rival, { laneOffset: 30, sampleIndex: 3 });
 *   const ai = new WaypointDriver(rival, track, { lookAhead: 16 });
 *   const lapsP = new LapTimer(track, { totalLaps: 3 });
 *   const lapsR = new LapTimer(track, { totalLaps: 3 });
 *
 *   // each frame, dt = clampedTimeStep:
 *   player.applyControls({ throttle, brake, steer }, dt); // steer in [-1,1]
 *   track.snapToTrack(player); // updates player.sampleIndex + offTrackDistance
 *   player.applyOffTrack(track.isOffTrack(player), dt);
 *   ai.update(dt); track.snapToTrack(rival);
 *   SplineTrack.resolveBodyCollisions([player, rival]); // simple push-apart
 *   lapsP.update(player, raceElapsedMs);
 *   lapsR.update(rival, raceElapsedMs);
 *   // … then draw track.centerline / track.leftEdge / track.rightEdge /
 *   //   track.startLineFrame() and each body, read lapsP.lap / .bestLap …
 */

/* ------------------------------------------------------------------ */
/* SplineTrack — closed Catmull-Rom centerline + kerb ribbon geometry */
/* ------------------------------------------------------------------ */

export class SplineTrack {
  /**
   * @param {object} options
   * @param {{x:number,y:number}[]} options.controlPoints  >=3 loop control pts
   * @param {number} [options.width=160]            full track width (units)
   * @param {number} [options.samplesPerSegment=24] centerline samples per control segment
   * @param {number} [options.startIndex=0]         sample index of the start/finish line
   * @param {number} [options.snapWindow=22]        +/- samples scanned by snapToTrack
   * @param {number} [options.offTrackMargin=4]     extra slack beyond half-width before "off track"
   */
  constructor(options = {}) {
    this.controlPoints = options.controlPoints || [];
    if (this.controlPoints.length < 3) {
      throw new Error("SplineTrack needs at least 3 control points");
    }
    this.width = options.width ?? 160;
    this.halfWidth = this.width / 2;
    this.samplesPerSegment = Math.max(1, options.samplesPerSegment ?? 24);
    this.startIndex = options.startIndex ?? 0;
    this.snapWindow = options.snapWindow ?? 22;
    this.offTrackMargin = options.offTrackMargin ?? 4;

    /** @type {{x:number,y:number}[]} dense closed centerline samples */
    this.centerline = SplineTrack.catmullRomClosed(this.controlPoints, this.samplesPerSegment);
    this.sampleCount = this.centerline.length;

    /** @type {{x:number,y:number}[]} left/right kerb edge points (per sample) */
    this.leftEdge = [];
    this.rightEdge = [];
    /** axis-aligned bounds of the centerline (handy for a minimap) */
    this.bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    this._buildRibbon();
  }

  /**
   * Sample a CLOSED Catmull-Rom spline through `points`. Returns a flat array
   * of {x,y} samples (segCount * samplesPerSegment of them). Static + pure so
   * you can reuse it for any spline path, not just tracks.
   */
  static catmullRomClosed(points, samplesPerSegment) {
    const out = [];
    const n = points.length;
    for (let i = 0; i < n; i += 1) {
      const p0 = points[(i - 1 + n) % n];
      const p1 = points[i];
      const p2 = points[(i + 1) % n];
      const p3 = points[(i + 2) % n];
      for (let t = 0; t < samplesPerSegment; t += 1) {
        const s = t / samplesPerSegment;
        const s2 = s * s;
        const s3 = s2 * s;
        const x = 0.5 * (2 * p1.x + (-p0.x + p2.x) * s +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * s2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * s3);
        const y = 0.5 * (2 * p1.y + (-p0.y + p2.y) * s +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * s2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * s3);
        out.push({ x, y });
      }
    }
    return out;
  }

  /** Unit tangent + left normal frame at centerline sample `i` (wraps). */
  frameAt(i) {
    const cl = this.centerline;
    const n = this.sampleCount;
    const a = cl[(i - 1 + n) % n];
    const b = cl[(i + 1) % n];
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    // left normal of a y-down tangent
    return { tx: dx, ty: dy, nx: -dy, ny: dx };
  }

  _buildRibbon() {
    const cl = this.centerline;
    for (let i = 0; i < this.sampleCount; i += 1) {
      const f = this.frameAt(i);
      this.leftEdge.push({ x: cl[i].x + f.nx * this.halfWidth, y: cl[i].y + f.ny * this.halfWidth });
      this.rightEdge.push({ x: cl[i].x - f.nx * this.halfWidth, y: cl[i].y - f.ny * this.halfWidth });
      this.bounds.minX = Math.min(this.bounds.minX, cl[i].x);
      this.bounds.maxX = Math.max(this.bounds.maxX, cl[i].x);
      this.bounds.minY = Math.min(this.bounds.minY, cl[i].y);
      this.bounds.maxY = Math.max(this.bounds.maxY, cl[i].y);
    }
  }

  /** Position + orientation of the start/finish line (for drawing a grid line). */
  startLineFrame() {
    const c = this.centerline[this.startIndex];
    const f = this.frameAt(this.startIndex);
    return { x: c.x, y: c.y, angle: Math.atan2(f.ty, f.tx), nx: f.nx, ny: f.ny, halfWidth: this.halfWidth };
  }

  /** A point on the centerline `lookAhead` samples ahead of `sampleIndex`. */
  lookAheadPoint(sampleIndex, lookAhead) {
    return this.centerline[(sampleIndex + lookAhead) % this.sampleCount];
  }

  /**
   * Full O(N) nearest-sample search. Use once to seed a body's sampleIndex,
   * then call snapToTrack() each frame for the cheap windowed update.
   * Returns the sample index.
   */
  nearestSampleIndex(x, y) {
    let best = 0;
    let bestD = Infinity;
    const cl = this.centerline;
    for (let i = 0; i < this.sampleCount; i += 1) {
      const dx = x - cl[i].x;
      const dy = y - cl[i].y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /**
   * Cheap windowed nearest-sample update around the body's last sampleIndex.
   * Mutates `body.sampleIndex` and `body.offTrackDistance` (distance from the
   * racing line). Falls back gracefully if sampleIndex is unset. Returns the
   * new sampleIndex.
   */
  snapToTrack(body) {
    if (typeof body.sampleIndex !== "number") {
      body.sampleIndex = this.nearestSampleIndex(body.x, body.y);
    }
    const cl = this.centerline;
    const n = this.sampleCount;
    let best = body.sampleIndex;
    let bestD = Infinity;
    for (let w = -this.snapWindow; w <= this.snapWindow; w += 1) {
      const i = (body.sampleIndex + w + n) % n;
      const dx = body.x - cl[i].x;
      const dy = body.y - cl[i].y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    body.sampleIndex = best;
    body.offTrackDistance = Math.sqrt(bestD);
    return best;
  }

  /** True if the body's center is beyond the kerb (call after snapToTrack). */
  isOffTrack(body) {
    return (body.offTrackDistance ?? 0) > this.halfWidth + this.offTrackMargin;
  }

  /**
   * Seed a body onto the grid at `sampleIndex`, offset sideways by `laneOffset`
   * (negative = left, positive = right), facing along the track. Sets x/y,
   * angle, sampleIndex, lastSampleIndex and zeroes speed.
   */
  placeBodyAtStart(body, { sampleIndex = this.startIndex, laneOffset = 0 } = {}) {
    const c = this.centerline[sampleIndex];
    const f = this.frameAt(sampleIndex);
    body.x = c.x + f.nx * laneOffset;
    body.y = c.y + f.ny * laneOffset;
    body.angle = Math.atan2(f.ty, f.tx);
    body.speed = 0;
    body.sampleIndex = sampleIndex;
    body.lastSampleIndex = sampleIndex;
    body.offTrackDistance = Math.abs(laneOffset);
    return body;
  }

  /**
   * Simple equal-mass push-apart collision resolution between bodies whose
   * centers come within `minDistance`. Mutates x/y and bleeds speed. Pure
   * geometry; works on any {x,y,speed} objects, not just RacerBody.
   */
  static resolveBodyCollisions(bodies, minDistance = 34, speedKeep = 0.86) {
    for (let i = 0; i < bodies.length; i += 1) {
      for (let j = i + 1; j < bodies.length; j += 1) {
        const a = bodies[i];
        const b = bodies[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d < minDistance && d > 1e-3) {
          const push = (minDistance - d) / 2;
          const ox = (dx / d) * push;
          const oy = (dy / d) * push;
          a.x -= ox; a.y -= oy;
          b.x += ox; b.y += oy;
          a.speed *= speedKeep;
          b.speed *= speedKeep;
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* RacerBody — steerable arcade-physics body                          */
/* ------------------------------------------------------------------ */

export class RacerBody {
  /**
   * @param {object} options  arcade tuning (all "units per step")
   * @param {number} [options.maxSpeed=7.5]
   * @param {number} [options.accel=0.135]      throttle acceleration
   * @param {number} [options.brakePower=0.22]  brake deceleration
   * @param {number} [options.coast=0.986]      per-step coast multiplier
   * @param {number} [options.reverseMax=2.6]   max reverse speed (positive #)
   * @param {number} [options.turnRate=0.052]   max steer rad/step at full authority
   * @param {number} [options.offTrackDrag=0.92] per-step drag when off track
   * @param {number} [options.offTrackSpeedFactor=0.5] max-speed cut when off track
   * @param {number} [options.steerAuthoritySpeed=2.4] speed at which steering hits full authority
   */
  constructor(options = {}) {
    this.maxSpeed = options.maxSpeed ?? 7.5;
    this.accel = options.accel ?? 0.135;
    this.brakePower = options.brakePower ?? 0.22;
    this.coast = options.coast ?? 0.986;
    this.reverseMax = options.reverseMax ?? 2.6;
    this.turnRate = options.turnRate ?? 0.052;
    this.offTrackDrag = options.offTrackDrag ?? 0.92;
    this.offTrackSpeedFactor = options.offTrackSpeedFactor ?? 0.5;
    this.steerAuthoritySpeed = options.steerAuthoritySpeed ?? 2.4;

    this.x = 0;
    this.y = 0;
    this.angle = 0;
    this.speed = 0;
    this.sampleIndex = 0;
    this.lastSampleIndex = 0;
    this.offTrackDistance = 0;
  }

  /**
   * Integrate one step from player/AI intent.
   * @param {object} controls
   * @param {number} controls.throttle  0..1 (accelerate)
   * @param {number} controls.brake     0..1 (brake / reverse)
   * @param {number} controls.steer     -1..1 (left..right)
   * @param {number} dt  time step (units of ~one 60fps frame)
   * Applies longitudinal accel, speed clamps, speed-scaled steering, then
   * advances position along `angle`. Off-track handling is applied separately
   * via {@link RacerBody#applyOffTrack} so you can pass it the track's verdict.
   */
  applyControls(controls = {}, dt = 1) {
    const throttle = controls.throttle ?? 0;
    const brake = controls.brake ?? 0;
    const steer = controls.steer ?? 0;

    if (throttle > 0) this.speed += this.accel * throttle * dt;
    else if (brake > 0) this.speed -= this.brakePower * brake * dt;
    else this.speed *= Math.pow(this.coast, dt);

    if (this.speed > this.maxSpeed) this.speed = this.maxSpeed;
    if (this.speed < -this.reverseMax) this.speed = -this.reverseMax;

    const authority = Math.min(1, Math.abs(this.speed) / this.steerAuthoritySpeed);
    const dir = this.speed >= 0 ? 1 : -1;
    this.angle += this.turnRate * steer * authority * dir * dt;

    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;
    return this;
  }

  /**
   * Apply off-track penalty after the track has been consulted. Caps top speed
   * and bleeds extra drag while off the racing surface. Call once per step with
   * `track.isOffTrack(this)`.
   */
  applyOffTrack(off, dt = 1) {
    if (!off) return this;
    const cap = this.maxSpeed * this.offTrackSpeedFactor;
    if (this.speed > 0.4) this.speed *= Math.pow(this.offTrackDrag, dt);
    if (this.speed > cap) this.speed = cap;
    return this;
  }
}

/* ------------------------------------------------------------------ */
/* WaypointDriver — look-ahead AI that steers a RacerBody on a track   */
/* ------------------------------------------------------------------ */

export class WaypointDriver {
  /**
   * @param {RacerBody} body
   * @param {SplineTrack} track
   * @param {object} [options]
   * @param {number} [options.lookAhead=16]      samples ahead to aim at
   * @param {number} [options.steerGain=1.7]     turn-rate multiplier vs the body's own
   * @param {number} [options.speedSmoothing=0.05] target-speed approach rate per step
   * @param {number} [options.sharpAngle=0.6]    steer error (rad) for a hard slow-down
   * @param {number} [options.cornerAngle=0.32]  steer error (rad) for a medium slow-down
   * @param {number} [options.hardCornerFactor=0.5]  max-speed factor at sharp corners
   * @param {number} [options.cornerFactor=0.74] max-speed factor at medium corners
   * @param {number} [options.offTrackFactor=0.6] extra slow-down when off track
   */
  constructor(body, track, options = {}) {
    this.body = body;
    this.track = track;
    this.lookAhead = options.lookAhead ?? 16;
    this.steerGain = options.steerGain ?? 1.7;
    this.speedSmoothing = options.speedSmoothing ?? 0.05;
    this.sharpAngle = options.sharpAngle ?? 0.6;
    this.cornerAngle = options.cornerAngle ?? 0.32;
    this.hardCornerFactor = options.hardCornerFactor ?? 0.5;
    this.cornerFactor = options.cornerFactor ?? 0.74;
    this.offTrackFactor = options.offTrackFactor ?? 0.6;
  }

  /** Wrap an angle delta into [-PI, PI]. */
  static angleDelta(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  }

  /**
   * Steer + throttle the body one step toward its look-ahead waypoint. Eases
   * the target speed down for sharp turns and off-track. Mutates body.angle,
   * body.speed and position. Returns the body.
   */
  update(dt = 1) {
    const body = this.body;
    const target = this.track.lookAheadPoint(body.sampleIndex, this.lookAhead);
    const desired = Math.atan2(target.y - body.y, target.x - body.x);
    const diff = WaypointDriver.angleDelta(desired, body.angle);

    const maxTurn = body.turnRate * this.steerGain * dt;
    body.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));

    const sharp = Math.abs(diff);
    let factor = 1;
    if (sharp > this.sharpAngle) factor = this.hardCornerFactor;
    else if (sharp > this.cornerAngle) factor = this.cornerFactor;
    let targetSpeed = body.maxSpeed * factor;
    if (this.track.isOffTrack(body)) targetSpeed *= this.offTrackFactor;

    body.speed += (targetSpeed - body.speed) * this.speedSmoothing * dt;
    if (body.speed < 0) body.speed = 0;

    body.x += Math.cos(body.angle) * body.speed * dt;
    body.y += Math.sin(body.angle) * body.speed * dt;
    return body;
  }
}

/* ------------------------------------------------------------------ */
/* LapTimer — start/finish gate, lap counting, best/last lap, finish   */
/* ------------------------------------------------------------------ */

export class LapTimer {
  /**
   * @param {SplineTrack} track
   * @param {object} [options]
   * @param {number} [options.totalLaps=3]
   * @param {number} [options.halfGuardLow=0.35]  fraction of loop: lower bound of the "far side" zone
   * @param {number} [options.halfGuardHigh=0.65] fraction of loop: upper bound of the "far side" zone
   * @param {number} [options.crossPrevFrac=0.78] sampleIndex/N above which counts as "just before start"
   * @param {number} [options.crossCurFrac=0.22]  sampleIndex/N below which counts as "just after start"
   */
  constructor(track, options = {}) {
    this.track = track;
    this.totalLaps = options.totalLaps ?? 3;
    this.halfGuardLow = options.halfGuardLow ?? 0.35;
    this.halfGuardHigh = options.halfGuardHigh ?? 0.65;
    this.crossPrevFrac = options.crossPrevFrac ?? 0.78;
    this.crossCurFrac = options.crossCurFrac ?? 0.22;
    this.reset();
  }

  /** Reset all timing/lap state to a fresh race. */
  reset() {
    this.lap = 0;
    this.passedHalf = false;
    this.finished = false;
    this.finishTime = 0;
    this.lapStartTime = 0;
    this.lastLap = 0;
    this.bestLap = 0;
    this._lastSampleIndex = null;
    return this;
  }

  /**
   * Feed a body's current sampleIndex + the race clock once per step.
   * Detects forward start/finish crossings (high index -> low index) guarded by
   * a half-lap flag so reversing across the line can't farm laps. Mutates this
   * timer's lap/best/last/finished fields.
   *
   * @param {{sampleIndex:number}} body  body whose progress is being timed
   * @param {number} elapsedMs  race time in ms (consistent clock across bodies)
   * @returns {{lapped:boolean, finished:boolean, lapTime:number}}
   *   lapped/finished are true only on the step the event happens.
   */
  update(body, elapsedMs) {
    const n = this.track.sampleCount;
    const cur = body.sampleIndex;
    const prev = this._lastSampleIndex == null ? cur : this._lastSampleIndex;
    let lapped = false;
    let justFinished = false;
    let lapTime = 0;

    if (cur > n * this.halfGuardLow && cur < n * this.halfGuardHigh) {
      this.passedHalf = true;
    }

    if (prev > n * this.crossPrevFrac && cur < n * this.crossCurFrac && this.passedHalf) {
      this.lap += 1;
      this.passedHalf = false;
      lapTime = elapsedMs - this.lapStartTime;
      this.lapStartTime = elapsedMs;
      this.lastLap = lapTime;
      if (this.bestLap === 0 || lapTime < this.bestLap) this.bestLap = lapTime;
      lapped = true;
      if (this.lap >= this.totalLaps && !this.finished) {
        this.finished = true;
        this.finishTime = elapsedMs;
        justFinished = true;
      }
    }

    this._lastSampleIndex = cur;
    return { lapped, finished: justFinished, lapTime };
  }

  /** Display-friendly current lap number (1-based, capped at totalLaps). */
  displayLap() {
    return Math.min(this.lap + 1, this.totalLaps);
  }

  /**
   * Race-position ranking helper. Given the bodies + their lap timers, returns
   * each entry's 1-based place. Progress = lapsDone * loopLength + sampleIndex,
   * with finished racers ordered ahead by finish time. Pure; renderer reads it.
   * @param {{body:object, timer:LapTimer}[]} entries
   * @returns {{body:object, timer:LapTimer, place:number, progress:number}[]}
   */
  static rank(entries, track) {
    const n = track.sampleCount;
    const scored = entries.map((e) => {
      let progress = e.timer.lap * n + e.body.sampleIndex;
      if (e.timer.finished) progress += 1e6 - e.timer.finishTime;
      return { ...e, progress };
    });
    scored.sort((a, b) => b.progress - a.progress);
    scored.forEach((s, i) => { s.place = i + 1; });
    return scored;
  }
}
// END mchatai-web-components: entities.spline-track-racer
