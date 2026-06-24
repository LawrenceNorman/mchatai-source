// BEGIN mchatai-web-components: entities.terrain-car (entities/TerrainCar.js)
//
// PLAIN JS CLASS — NOT A WEB CUSTOM ELEMENT.
// DO NOT call customElements.define() on this class.
// DO NOT use <terraincar-foo> tags in HTML.
// Instantiate with `new` and call methods. YOU draw the UI.
// See wisdom rule fs-015 for the full pattern + worked examples.
//

/**
 * Hill-Climb-style 2D terrain + wheeled-chassis physics engine.
 *
 * Two cooperating pieces, both renderer-agnostic (pure math — YOU draw):
 *
 *   1. buildTrack(segments)  → TerrainTrack
 *      A tiny declarative DSL that expands a list of segment descriptors into a
 *      dense polyline of {x, y} points with per-point metrics. Segment types:
 *        flat, hill_up, hill_down, ramp, chasm, loop, elevator, bumps, drop, wave.
 *      The returned TerrainTrack carries arc-length distances, surface normals
 *      (point "up" away from the ground), tangents, and per-point flags
 *      (solid / kill / finish / loop / elevator). It can sample any position
 *      along the track by arc-length (pathAt), find the nearest point to a world
 *      coordinate (closestIndex), and report curvature.
 *
 *   2. TerrainCar
 *      A car that rides the track surface. Two physics regimes:
 *        - ON-PATH: engine force + gravity-along-slope + brake + friction move the
 *          car along the arc-length parameter; the chassis is pinned a fixed
 *          offset above the surface and rotated to the local tangent.
 *        - AIRBORNE: a true ballistic projectile (gravity on vy). The car detaches
 *          when it crests a hill / launches off a ramp / runs off a chasm edge,
 *          flies, then re-attaches when it drops onto an up-facing floor ahead of
 *          its launch point. Landing too steeply (roof-first) or too hard crashes.
 *      Tracks fuel (gas burns it; running dry stalls), distance, and collectibles
 *      (coin / fuel pickups), and reports crash / finish events.
 *
 * Coordinates: canvas-style — +x is rightward, +y is DOWNWARD. The default
 * left-to-right track therefore has an "up" surface normal of (0, -1). All
 * tunables are in pixels / pixels-per-frame (the engine is frame-stepped: call
 * update() once per animation frame).
 *
 * Caller drives the loop with requestAnimationFrame: read input → set
 * car.gas / car.brake → car.update() → render from track + car state. Input is
 * two buttons (gas, brake); in the air the same two buttons rotate the chassis
 * for landing setup.
 *
 * Dependency-free. Offline. No drawing, no DOM, no globals.
 */

// ---------------------------------------------------------------------------
// Geometry / track
// ---------------------------------------------------------------------------

/** Default per-segment-type tunables. All overridable per segment. */
const SEGMENT_DEFAULTS = {
  padPointSpacing: 50, // x-spacing of start/finish pad points
  startPadPoints: 8,
  finishPadPoints: 6,
  sampleSpacing: 50, // x-spacing when expanding flat sections
  curveStep: 30 // x-spacing when expanding smooth curves (hills)
};

/**
 * Expand a declarative segment list into a dense TerrainTrack.
 *
 * Each segment is `{ type, ...params }`. Supported types and their params:
 *   flat      { length=200 }
 *   hill_up   { height=100, length=200 }          cosine-eased crest
 *   hill_down { height=100, length=200 }          cosine-eased dip
 *   ramp      { height=120, length=150 }          straight launch ramp (no lip)
 *   chasm     { gap=300, depth=500, landOffset=0 } kill pit; land on far edge
 *   loop      { radius=100 }                        full vertical loop (CCW)
 *   elevator  { height=150, speed=1 }               animated lift platform
 *   bumps     { count=5, height=40 }                series of sine humps
 *   drop      { height=150 }                         sheer step down
 *   wave      { amplitude=60, length=400 }           rolling sine terrain
 *
 * @param {Array<Object>} segments
 * @param {Object} [options] overrides for SEGMENT_DEFAULTS
 * @returns {TerrainTrack}
 */
export function buildTrack(segments, options = {}) {
  const cfg = { ...SEGMENT_DEFAULTS, ...options };
  const pts = [];
  const elevators = []; // [{startIdx, endIdx, height, speed, phase, baseY}]
  let x = 0;
  let y = 0;

  const addPt = (px, py, props) =>
    pts.push(Object.assign({ x: px, y: py, solid: true, kill: false, finish: false }, props || {}));

  // Start pad.
  for (let i = 0; i < cfg.startPadPoints; i += 1) {
    addPt(x, y);
    x += cfg.padPointSpacing;
  }

  for (const seg of segments || []) {
    switch (seg.type) {
      case "flat": {
        const len = seg.length ?? 200;
        for (let i = 0; i < len; i += cfg.sampleSpacing) {
          addPt(x, y);
          x += cfg.sampleSpacing;
        }
        break;
      }
      case "hill_up": {
        const h = seg.height ?? 100;
        const len = seg.length ?? 200;
        const steps = Math.max(2, Math.floor(len / cfg.curveStep));
        for (let i = 0; i <= steps; i += 1) {
          const t = i / steps;
          addPt(x + t * len, y - h * (0.5 - 0.5 * Math.cos(Math.PI * t)));
        }
        x += len;
        y -= h;
        break;
      }
      case "hill_down": {
        const h = seg.height ?? 100;
        const len = seg.length ?? 200;
        const steps = Math.max(2, Math.floor(len / cfg.curveStep));
        for (let i = 0; i <= steps; i += 1) {
          const t = i / steps;
          addPt(x + t * len, y + h * (0.5 - 0.5 * Math.cos(Math.PI * t)));
        }
        x += len;
        y += h;
        break;
      }
      case "ramp": {
        const h = seg.height ?? 120;
        const len = seg.length ?? 150;
        const steps = Math.max(2, Math.floor(len / 25));
        for (let i = 0; i <= steps; i += 1) {
          const t = i / steps;
          addPt(x + t * len, y - h * t);
        }
        x += len;
        y -= h;
        // No flat lip: the ramp ends at its angled top so the car launches
        // up-and-forward. A flat lip flattens the launch and same-height gaps
        // become impossible to clear.
        break;
      }
      case "chasm": {
        const gap = seg.gap ?? 300;
        const depth = seg.depth ?? 500;
        addPt(x, y); // near edge
        addPt(x + 10, y + depth, { solid: false, kill: true }); // wall down
        addPt(x + gap - 10, y + depth, { solid: false, kill: true }); // bottom
        const landY = y + (seg.landOffset ?? 0);
        addPt(x + gap, landY); // far edge / landing
        x += gap;
        y = landY;
        break;
      }
      case "loop": {
        const r = seg.radius ?? 100;
        const steps = 36;
        // Full vertical loop: bottom of the circle sits at the current (x, y),
        // car travels CCW and exits where it entered, then a tiny connector
        // advances x so the track keeps moving forward.
        const cx = x;
        const cy = y - r;
        for (let i = 0; i <= steps; i += 1) {
          const a = Math.PI * 0.5 - i * ((Math.PI * 2) / steps);
          addPt(cx + Math.cos(a) * r, cy + Math.sin(a) * r, { loop: true });
        }
        x += 20;
        addPt(x, y);
        break;
      }
      case "elevator": {
        const h = seg.height ?? 150;
        const speed = seg.speed ?? 1;
        const startIdx = pts.length;
        for (let i = 0; i < 4; i += 1) {
          addPt(x, y, { elevator: true });
          x += 40;
        }
        const endIdx = pts.length - 1;
        elevators.push({ startIdx, endIdx, height: h, speed, phase: 0, baseY: y });
        // The lift carries the car up; a short platform waits at the top.
        y -= h;
        addPt(x, y);
        x += 40;
        addPt(x, y);
        break;
      }
      case "bumps": {
        const count = seg.count ?? 5;
        const h = seg.height ?? 40;
        for (let i = 0; i < count; i += 1) {
          const sub = 6;
          for (let j = 0; j <= sub; j += 1) {
            const t = j / sub;
            addPt(x + t * 60, y - Math.sin(t * Math.PI) * h);
          }
          x += 60;
        }
        break;
      }
      case "drop": {
        const h = seg.height ?? 150;
        addPt(x, y);
        addPt(x + 15, y);
        addPt(x + 25, y + h);
        x += 25;
        y += h;
        addPt(x + 15, y);
        break;
      }
      case "wave": {
        const amp = seg.amplitude ?? 60;
        const len = seg.length ?? 400;
        const sub = Math.floor(len / 20);
        for (let i = 0; i <= sub; i += 1) {
          const t = i / sub;
          addPt(x + t * len, y + Math.sin(t * Math.PI * 4) * amp);
        }
        x += len;
        y = pts[pts.length - 1].y; // snap y to last sampled point
        break;
      }
      default:
        break;
    }
  }

  // Finish pad.
  for (let i = 0; i < cfg.finishPadPoints; i += 1) {
    addPt(x, y);
    x += cfg.padPointSpacing;
  }
  // Mark the whole finish pad (incl. the last point) so a car that overshoots
  // and clamps to the track end still registers the finish.
  const fIdx = Math.max(0, pts.length - cfg.finishPadPoints);
  for (let i = fIdx; i < pts.length; i += 1) pts[i].finish = true;

  return new TerrainTrack(pts, elevators);
}

/**
 * A built terrain polyline with arc-length metrics and sampling.
 * Construct via `buildTrack(...)` (preferred) or directly from a points array.
 *
 * Point shape: { x, y, dist, nx, ny, tx, ty, solid, kill, finish, loop?, elevator? }
 *   - dist : cumulative arc-length from the start
 *   - nx,ny: unit surface normal (points "up" away from the ground)
 *   - tx,ty: unit tangent (direction of travel along the track)
 */
export class TerrainTrack {
  constructor(points, elevators = []) {
    this.points = points;
    this.elevators = elevators; // [{startIdx, endIdx, height, speed, phase, baseY}]
    this.totalDist = 0;
    this.buildMetrics();
  }

  /** (Re)compute cumulative arc-length distances, normals and tangents.
   *  Call after mutating point y-positions (e.g. animating elevators). */
  buildMetrics() {
    const path = this.points;
    if (path.length === 0) return;
    path[0].dist = 0;
    for (let i = 1; i < path.length; i += 1) {
      const dx = path[i].x - path[i - 1].x;
      const dy = path[i].y - path[i - 1].y;
      path[i].dist = path[i - 1].dist + Math.sqrt(dx * dx + dy * dy);
    }
    for (let i = 0; i < path.length; i += 1) {
      const prev = path[Math.max(0, i - 1)];
      const next = path[Math.min(path.length - 1, i + 1)];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      // Canvas y grows downward, so the normal above a left-to-right flat road
      // is (0, -1): rotate the tangent +90deg in screen space.
      path[i].nx = dy / len;
      path[i].ny = -dx / len;
      path[i].tx = dx / len;
      path[i].ty = dy / len;
    }
    this.totalDist = path[path.length - 1].dist;
  }

  /** Animate every elevator forward one frame and rebuild metrics if any moved.
   *  No-op when the track has no elevators. */
  stepElevators() {
    if (this.elevators.length === 0) return;
    for (const ed of this.elevators) {
      ed.phase += 0.025 * ed.speed;
      const lift = ((Math.sin(ed.phase) + 1) / 2) * ed.height;
      for (let i = ed.startIdx; i <= ed.endIdx && i < this.points.length; i += 1) {
        if (this.points[i].elevator) this.points[i].y = ed.baseY - lift;
      }
    }
    this.buildMetrics();
  }

  /** Index of the path point nearest to world (wx, wy). */
  closestIndex(wx, wy) {
    let bestD = Infinity;
    let bestI = 0;
    const path = this.points;
    for (let i = 0; i < path.length; i += 1) {
      const dx = path[i].x - wx;
      const dy = path[i].y - wy;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    return bestI;
  }

  /** Interpolated sample at arc-length `d`. Returns a plain object with
   *  { x, y, nx, ny, tx, ty, solid, kill, finish, loop, elevator, idx }. */
  pathAt(d) {
    const path = this.points;
    if (d <= 0) {
      const p = path[0];
      return { x: p.x, y: p.y, nx: p.nx, ny: p.ny, tx: p.tx, ty: p.ty,
        solid: p.solid, kill: p.kill, finish: p.finish, loop: !!p.loop,
        elevator: !!p.elevator, idx: 0 };
    }
    if (d >= this.totalDist) {
      const p = path[path.length - 1];
      return { x: p.x, y: p.y, nx: p.nx, ny: p.ny, tx: p.tx, ty: p.ty,
        solid: p.solid, kill: p.kill, finish: p.finish, loop: !!p.loop,
        elevator: !!p.elevator, idx: path.length - 1 };
    }
    // Binary search for the segment containing arc-length d.
    let lo = 0;
    let hi = path.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (path[mid].dist <= d) lo = mid;
      else hi = mid;
    }
    const p0 = path[lo];
    const p1 = path[hi];
    const segLen = p1.dist - p0.dist;
    const t = segLen > 0 ? (d - p0.dist) / segLen : 0;
    return {
      x: p0.x + (p1.x - p0.x) * t,
      y: p0.y + (p1.y - p0.y) * t,
      nx: p0.nx + (p1.nx - p0.nx) * t,
      ny: p0.ny + (p1.ny - p0.ny) * t,
      tx: p0.tx + (p1.tx - p0.tx) * t,
      ty: p0.ty + (p1.ty - p0.ty) * t,
      solid: p0.solid,
      kill: p0.kill || false,
      finish: p0.finish || false,
      loop: p0.loop || p1.loop || false,
      elevator: p0.elevator || p1.elevator || false,
      idx: lo
    };
  }

  /** Signed curvature (dAngle/ds) at arc-length `d`. */
  curvatureAt(d) {
    const p0 = this.pathAt(d - 5);
    const p1 = this.pathAt(d + 5);
    const a0 = Math.atan2(p0.ty, p0.tx);
    const a1 = Math.atan2(p1.ty, p1.tx);
    let da = a1 - a0;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    return da / 10;
  }
}

// ---------------------------------------------------------------------------
// Car / chassis
// ---------------------------------------------------------------------------

const CAR_DEFAULTS = {
  gravity: 0.45, // gravity for on-track slope physics
  airGravity: 0.4, // slightly floatier in the air so ramp jumps clear gaps
  engineForce: 0.4, // speed added per frame while gas held
  brakeMult: 0.9, // speed multiplier per frame while brake held
  friction: 0.985, // per-frame speed decay
  carOffset: 20, // distance from the track surface to the car center
  maxLandAngle: 1.0, // max chassis-vs-surface angle (radians) for a safe landing
  crashImpact: 17, // closing speed into the surface above which a landing crashes
  maxReverseSpeed: -1, // clamp on backward speed
  gasFuelBurn: 0.06, // fuel burned per frame of ground throttle
  airGasFuelBurn: 0.02, // fuel burned per frame of in-air rotation thrust
  fuelMax: 100,
  startDist: 200, // arc-length where the car spawns (a little in from the start)
  elevatorMaxSpeed: 5.5, // hit an elevator deck faster than this and the chassis breaks
  loopMinSpeed: 3.2, // bleed below this mid-loop and the car peels off and falls
  voidY: 2000 // world y past which the car is "fallen into the void"
};

/**
 * A wheeled chassis that rides a TerrainTrack with on-path + ballistic physics.
 *
 * Lifecycle:
 *   const car = new TerrainCar(track, opts);
 *   car.reset();                 // spawn at track start
 *   // each frame:
 *   car.gas = inputGas; car.brake = inputBrake;
 *   const ev = car.update();     // -> { crashed, finished, collected }
 *   // render from car.{wx,wy,angle,airborne,...} and track.points
 */
export class TerrainCar {
  constructor(track, options = {}) {
    this.track = track;
    this.cfg = { ...CAR_DEFAULTS, ...options };
    this.gas = false;
    this.brake = false;
    this.collectibles = []; // [{x, y, type, collected}]
    this.reset();
  }

  /** Replace the active track (e.g. on level change) and respawn the car. */
  setTrack(track) {
    this.track = track;
    this.reset();
  }

  /** Spawn the car at the start of the current track, full fuel. */
  reset() {
    const c = this.cfg;
    const start = this.track.pathAt(c.startDist);
    this.pathDist = c.startDist;
    this.speed = 0;
    this.vx = 0;
    this.vy = 0;
    this.angle = Math.atan2(start.ty, start.tx);
    this.angVel = 0;
    this.airborne = false;
    this.airTime = 0;
    this.launchDist = 0;
    this.fuel = c.fuelMax;
    this.coins = 0;
    this.dist = 0;
    this.crashed = false;
    this.finished = false;
    // Place the car a fixed offset above the surface.
    this.wx = start.x + start.nx * c.carOffset;
    this.wy = start.y + start.ny * c.carOffset;
  }

  /**
   * Seed the pickups the car can collect. Each entry is
   * `{ x, y, type }` where type is 'coin' or 'fuel'. A `collected:false`
   * flag is added in place. Pass [] to clear. (Authoring the pickup positions
   * is the caller's job — see the static `scatterCollectibles` helper.)
   */
  setCollectibles(list) {
    this.collectibles = (list || []).map(c => ({ ...c, collected: false }));
  }

  /** True when the car is no longer drivable (crashed or finished). */
  isDone() {
    return this.crashed || this.finished;
  }

  /** Convenience: distance covered as a "meters" score (arc-length / 10). */
  get distanceMeters() {
    return this.dist;
  }

  /**
   * Advance one frame. Reads this.gas / this.brake. Returns an event object:
   *   { crashed:bool, finished:bool, collected:[{type, x, y}] }
   * Once crashed or finished, further calls are no-ops (returns inert event).
   */
  update() {
    const c = this.cfg;
    const track = this.track;
    const ev = { crashed: false, finished: false, collected: [] };
    if (this.crashed || this.finished) return ev;

    track.stepElevators();

    if (!this.airborne) {
      if (this._updateOnPath(ev)) return ev; // crash/finish ended the frame
    } else {
      if (this._updateAirborne(ev)) return ev;
    }

    if (this.fuel < 0) this.fuel = 0;

    // Distance is monotonic (never decreases when sliding back).
    this.dist = Math.max(this.dist, this.pathDist / 10);

    this._collectPickups(ev);
    return ev;
  }

  // --- on-path regime -------------------------------------------------------
  _updateOnPath(ev) {
    const c = this.cfg;
    const track = this.track;
    let p = track.pathAt(this.pathDist);

    // Engine + brake + slope gravity + friction along the tangent.
    if (this.gas && this.fuel > 0) {
      this.speed += c.engineForce;
      this.fuel -= c.gasFuelBurn;
    }
    if (this.brake) {
      this.speed *= c.brakeMult;
      if (Math.abs(this.speed) < 0.3) this.speed = 0;
    }
    this.speed += c.gravity * p.ty; // ty>0 = downhill = speed up
    this.speed *= c.friction;
    if (this.speed < c.maxReverseSpeed) this.speed = c.maxReverseSpeed;

    this.pathDist += this.speed;
    if (this.pathDist < 0) {
      this.pathDist = 0;
      this.speed = 0;
    }
    if (this.pathDist > track.totalDist) {
      this.pathDist = track.totalDist;
      this.speed = 0;
    }

    p = track.pathAt(this.pathDist);
    this.wx = p.x + p.nx * c.carOffset;
    this.wy = p.y + p.ny * c.carOffset;
    this.angle = Math.atan2(p.ty, p.tx);

    if (p.kill) return this._crash(ev);

    // Elevator decks reward slowing down; too fast breaks the chassis.
    if (p.elevator && Math.abs(this.speed) > c.elevatorMaxSpeed) return this._crash(ev);

    // Loops need commitment. Bleed off mid-loop → peel away and fall.
    if (p.loop && this.speed < c.loopMinSpeed) {
      this.airborne = true;
      this.airTime = 0;
      this.launchDist = this.pathDist;
      this.vx = p.tx * Math.max(this.speed, 1.5);
      this.vy = p.ty * Math.max(this.speed, 1.5);
      this.angVel = 0.035;
      return false;
    }

    // Finish on contact at ANY speed (a full-throttle crossing must register).
    if (p.finish) return this._finish(ev);

    // Out of fuel and stopped → stall crash.
    if (this.fuel <= 0 && Math.abs(this.speed) < 0.5) return this._crash(ev);

    this._maybeTakeOff(p);
    return false;
  }

  // --- take-off detection ---------------------------------------------------
  _maybeTakeOff(p) {
    const c = this.cfg;
    const track = this.track;
    if (this.airborne) return;

    // Build the launch vector from the direction the car is ACTUALLY travelling,
    // sampled a bit BEHIND the lip where the surface is still clean (flat/ramp).
    // (Using the edge point's own tangent gives a mostly-downward vector — the
    // car would dive over the lip instead of leaping.)
    const bp = track.pathAt(Math.max(0, this.pathDist - 22));
    const hdx = p.x - bp.x;
    const hdy = p.y - bp.y;
    const hlen = Math.hypot(hdx, hdy) || 1;
    const rideTx = hdx / hlen;
    const rideTy = hdy / hlen;
    const fp = track.pathAt(Math.min(track.totalDist, this.pathDist + 18)); // just ahead

    // Does the track fall away (chasm / non-solid / kill) just ahead?
    let gapAhead = false;
    for (let k = p.idx + 1; k <= p.idx + 2 && k < track.points.length; k += 1) {
      if (track.points[k].kill || !track.points[k].solid) {
        gapAhead = true;
        break;
      }
    }

    let takeOff = false;
    let edgeJump = false;
    if (gapAhead) {
      // Real edge: ALWAYS leave the ground so we sail over the gap instead of
      // curling down the (nominally still "solid") near-vertical wall segment.
      takeOff = true;
      edgeJump = true;
    } else if (!p.loop) {
      const aBack = Math.atan2(rideTy, rideTx);
      const aFwd = Math.atan2(fp.ty, fp.tx);
      let dA = aFwd - aBack;
      while (dA > Math.PI) dA -= Math.PI * 2;
      while (dA < -Math.PI) dA += Math.PI * 2;
      // Cliff/drop lip: ground ahead plunges steeply (ty→1) while we arrive
      // shallow → fly off it instead of tracking the face down.
      if (fp.ty > 0.7 && rideTy < 0.55 && this.speed > 2.5) {
        takeOff = true;
        edgeJump = true;
      }
      // Gentle crest: spin off it when fast enough that gravity can't bend our
      // path tightly enough to follow the curve (v²·κ > g).
      const curv = Math.max(0, dA) / 18;
      if (this.speed * this.speed * curv > c.gravity * 0.7 && this.speed > 2.5) takeOff = true;
    }

    if (takeOff) {
      this.airborne = true;
      this.airTime = 0;
      this.launchDist = this.pathDist;
      this.vx = rideTx * this.speed;
      this.vy = rideTy * this.speed;
      // Small upward kick off flat/downhill edges so a cliff launch reads as a
      // jump (and clears the lip) rather than a slide. Ramps already point up.
      if (edgeJump && rideTy > -0.2) this.vy -= 1.4;
      this.angle = Math.atan2(rideTy, rideTx);
      this.angVel = 0;
    }
  }

  // --- airborne regime ------------------------------------------------------
  _updateAirborne(ev) {
    const c = this.cfg;
    const track = this.track;
    this.airTime += 1;
    this.vy += c.airGravity;

    // In-air rotation control (lean to set up the landing).
    if (this.gas && this.fuel > 0) {
      this.angVel -= 0.005;
      this.fuel -= c.airGasFuelBurn;
    }
    if (this.brake) this.angVel += 0.005;
    this.angle += this.angVel;
    this.angVel *= 0.95;
    this.vx *= 0.999;

    this.wx += this.vx;
    this.wy += this.vy;

    // Check landing against the nearest solid surface point.
    const ci = track.closestIndex(this.wx, this.wy);
    if (ci >= 0 && ci < track.points.length) {
      const pp = track.points[ci];
      const dx = this.wx - pp.x;
      const dy = this.wy - pp.y;
      const normalDist = dx * pp.nx + dy * pp.ny; // + = above surface
      const tangentDist = Math.abs(dx * pp.tx + dy * pp.ty);
      const impactNormal = -(this.vx * pp.nx + this.vy * pp.ny); // closing speed
      const aheadOfLaunch = pp.dist > (this.launchDist || 0) + 45;

      // Re-attach ONLY when we DROP onto an up-facing floor AHEAD of launch.
      // This is the anti-"cliff grab" rule:
      //   pp.ny<-0.3      → the surface faces up (a floor); vertical cliff faces
      //                     and the lip we just left are never landings.
      //   aheadOfLaunch   → can't re-grab the ground at/behind the take-off point.
      //   airTime>4 grace + impactNormal>0.25 → genuinely descending, not grazing.
      if (
        this.airTime > 4 &&
        impactNormal > 0.25 &&
        pp.ny < -0.3 &&
        aheadOfLaunch &&
        normalDist < c.carOffset + 8 &&
        normalDist > -30 &&
        tangentDist < 80 &&
        pp.solid &&
        !pp.kill
      ) {
        const surfAngle = Math.atan2(pp.ty, pp.tx);
        let angleDiff = this.angle - surfAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        if (Math.abs(angleDiff) > c.maxLandAngle) return this._crash(ev); // roof/nose
        if (impactNormal > c.crashImpact) return this._crash(ev); // slammed in

        // Safe landing — snap back onto the track, keep forward momentum.
        this.airborne = false;
        this.pathDist = pp.dist;
        this.speed = this.vx * pp.tx + this.vy * pp.ty;
        this.angVel = 0;
      }
    }

    if (this.wy > c.voidY) return this._crash(ev); // fell into the void
    return false;
  }

  // --- pickups / terminal states -------------------------------------------
  _collectPickups(ev) {
    for (const item of this.collectibles) {
      if (item.collected) continue;
      const dx = this.wx - item.x;
      const dy = this.wy - item.y;
      if (dx * dx + dy * dy < 40 * 40) {
        item.collected = true;
        if (item.type === "fuel") this.fuel = Math.min(this.cfg.fuelMax, this.fuel + 20);
        if (item.type === "coin") this.coins += 1;
        ev.collected.push({ type: item.type, x: item.x, y: item.y });
      }
    }
  }

  _crash(ev) {
    this.crashed = true;
    ev.crashed = true;
    return true;
  }

  _finish(ev) {
    this.finished = true;
    ev.finished = true;
    return true;
  }

  /**
   * Scatter coin/fuel pickups along the drivable surface of a track.
   * Pure helper (does not mutate the car) — pass the result to setCollectibles.
   *
   * @param {TerrainTrack} track
   * @param {Object} [opts]
   *   step=3        sample every Nth point
   *   coinChance=0.12, fuelChance=0.04
   *   offset=30     pixels above the surface
   *   rng=Math.random
   * @returns {Array<{x,y,type}>}
   */
  static scatterCollectibles(track, opts = {}) {
    const step = opts.step ?? 3;
    const coinChance = opts.coinChance ?? 0.12;
    const fuelChance = opts.fuelChance ?? 0.04;
    const offset = opts.offset ?? 30;
    const rng = opts.rng ?? Math.random;
    const out = [];
    const path = track.points;
    for (let i = 5; i < path.length - 5; i += step) {
      const p = path[i];
      if (!p.solid || p.kill || p.finish || p.elevator || p.loop) continue;
      if (rng() < coinChance) out.push({ x: p.x + p.nx * offset, y: p.y + p.ny * offset, type: "coin" });
      if (rng() < fuelChance) out.push({ x: p.x + p.nx * offset, y: p.y + p.ny * offset, type: "fuel" });
    }
    return out;
  }
}
// END mchatai-web-components: entities.terrain-car
