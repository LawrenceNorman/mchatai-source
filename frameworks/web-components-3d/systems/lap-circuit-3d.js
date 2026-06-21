// BEGIN mChatAI Web Component: systems.lap-circuit-3d
//
// Closed finite lap-racing toolkit built from a ring of control points. This is
// a CLOSED LOOP you complete N times, NOT an infinite scroller -- contrast with
// systems.endless-scroller-3d, which recycles segments forever and never wraps
// back to a start line. Here the track is a finite periodic spline; a racer's
// normalized progress p runs 0 -> 1 and wrapping past p=1 counts a lap, with
// per-lap timing (current / last / best) and total race time.
//
// PURE math: NO three.js, NO WebGL, NO canvas, NO external deps, fully offline.
// Geometry-agnostic -- the SAME centerline/tangent/normal data drives a 2D
// top-down minimap render OR an extruded 3D road built from quads. Caller passes
// positions as {x,z} (3D ground plane) or {x,y} (2D top-down); axis names are
// generic and selected once via opts.axes. All timing is delta-time based.
//
// Proven mechanic extracted + generalized from the shipped low-poly-kart-racer
// (catmull centerline, windowed nearest scan, updateProgress lap-wrap, latDist
// on/off-track test, finishRank) and cross-referenced with the same system in
// the neon-canyon 2D source (cr() Catmull-Rom, center/left/right/nrm/bank build,
// onTrack offset test, off-track wall push-back, armed/prevIdx lap-detection +
// lapStartT/raceT/bestLap). Import it instead of re-deriving the spline + the
// fiddly lap-wrap edge cases for every racing build.
//
// KEY EXPORTS
//   LapCircuit       -- class: build a closed circuit from control points; sample
//                       a dense periodic Catmull-Rom centerline with per-sample
//                       unit tangents, right-perpendicular normals, and a curvature
//                       /bank estimate. Provides nearest/progress/update/bounds and
//                       exposes the raw centerline/tangent/normal/bank arrays so a
//                       renderer can extrude road geometry.
//   createLapCircuit -- thin factory: createLapCircuit(controlPoints, opts).
//   catmullRom       -- the bare periodic Catmull-Rom sampler (2D), reusable solo.
//
// USAGE (3D road, {x,z} ground plane)
//   import { LapCircuit } from './systems/lap-circuit-3d.js';
//
//   const CTRL = [ {x:0,z:-58},{x:40,z:-50},{x:60,z:-18},{x:54,z:20},
//                  {x:28,z:44},{x:-4,z:54},{x:-36,z:46},{x:-60,z:18},
//                  {x:-52,z:-22},{x:-22,z:-52} ];
//   const circuit = new LapCircuit(CTRL, { samplesPerSegment: 26, halfWidth: 7.2,
//                                          totalLaps: 3, axes: 'xz' });
//
//   // build the road mesh once from the exposed arrays:
//   const { center, normal } = circuit;     // arrays of {x,z} / {x,z}
//   for (let i = 0; i < center.length; i++) {
//     const a = center[i], na = normal[i];  // extrude +/- halfWidth along normal
//     const left  = { x: a.x + na.x * circuit.halfWidth, z: a.z + na.z * circuit.halfWidth };
//     const right = { x: a.x - na.x * circuit.halfWidth, z: a.z - na.z * circuit.halfWidth };
//     // ...push road quad between this sample and the next...
//   }
//
//   const racer = { x: CTRL[5].x, z: CTRL[5].z };  // your kart's live position obj
//   circuit.attach(racer);                         // (optional) seed its index
//
//   // each frame:
//   const off = circuit.progress(racer);           // { p, offset, sampleIndex }
//   if (Math.abs(off.offset) > circuit.halfWidth)  // off the asphalt -> grass / wall
//     pushBackOntoTrack(racer, off, circuit);
//   const lapInfo = circuit.update(racer, dt);     // { lap, lapTime, lastLap, bestLap, raceTime, p }
//   if (lapInfo.lap > circuit.totalLaps) finishRace(racer);
//
// USAGE (2D top-down, {x,y})
//   const circuit = new LapCircuit(ctrlXY, { axes: 'xy', totalLaps: 5 });
//   const { minx,maxx,miny,maxy } = circuit.bounds();  // fit a minimap
//
// CONTRACTS
//   build:    new LapCircuit(controlPoints, { samplesPerSegment, halfWidth,
//             totalLaps, axes:'xz'|'xy', startIndex })
//   sample:   circuit.center / .tangent / .normal / .bank  (parallel arrays, len = N)
//   nearest:  circuit.nearest(pos) -> { index, point }       (O(window), no jumps)
//   progress: circuit.progress(pos) -> { p, offset, sampleIndex }
//   lap:      circuit.update(racer, dt) -> { lap, lapTime, lastLap, bestLap, raceTime, p }
//   bounds:   circuit.bounds() -> { minx,maxx,min<b>,max<b> }  (b = z or y per axes)
//   reset:    circuit.resetRacer(racer)  /  circuit.attach(racer)
//   The racer object is read for position (pos[a],pos[b]) and gets per-racer lap
//   state stored on a hidden symbol key, so the same circuit serves many racers.

// ---------- internal helpers ----------

function isFiniteNumber(v) { return typeof v === 'number' && Number.isFinite(v); }

// Per-racer state lives under a non-enumerable symbol so it never collides with
// the caller's own fields and a single circuit can track an arbitrary field.
const RACER_STATE = Symbol('mchatai.lapCircuit.state');

// Periodic Catmull-Rom: one interpolated 2D point on the spline through p1->p2,
// using neighbours p0 (before) and p3 (after) for the tangents. Each p is [a,b].
// t in [0,1]. This is the centripetal-style uniform CR used by the shipped racer.
function crPoint(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return [
    0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t +
           (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
           (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t +
           (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
           (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
  ];
}

/**
 * Bare periodic (closed-loop) Catmull-Rom sampler. Given a ring of 2D control
 * points (as [a,b] pairs OR {x,z}/{x,y} objects) returns a dense array of [a,b]
 * centerline samples. Reusable on its own when you only need the curve, not the
 * full lap toolkit.
 * @param {Array} controlPoints  ring of points ([a,b] or {a,b} objects)
 * @param {number} samplesPerSegment  samples emitted per control segment (>=2)
 * @param {('xz'|'xy')} [axes='xz']  which two fields to read off object points
 * @returns {Array<[number,number]>} closed centerline, length = m * samplesPerSegment
 */
export function catmullRom(controlPoints, samplesPerSegment, axes) {
  const pts = toPairArray(controlPoints, axes || 'xz');
  const m = pts.length;
  const seg = Math.max(2, Math.floor(samplesPerSegment || 20));
  const out = [];
  if (m < 3) {
    // Degenerate ring: just echo the points so callers never crash.
    for (let i = 0; i < m; i++) out.push([pts[i][0], pts[i][1]]);
    return out;
  }
  for (let i = 0; i < m; i++) {
    const p0 = pts[(i - 1 + m) % m], p1 = pts[i],
          p2 = pts[(i + 1) % m],     p3 = pts[(i + 2) % m];
    for (let s = 0; s < seg; s++) out.push(crPoint(p0, p1, p2, p3, s / seg));
  }
  return out;
}

// Normalize control points to [a,b] pairs regardless of input shape.
function toPairArray(controlPoints, axes) {
  const fa = axes[0], fb = axes[1];
  const out = [];
  for (let i = 0; i < controlPoints.length; i++) {
    const c = controlPoints[i];
    if (Array.isArray(c)) out.push([c[0] || 0, c[1] || 0]);
    else out.push([c[fa] || 0, c[fb] || 0]);
  }
  return out;
}

// ---------- LapCircuit ----------

/**
 * A closed racing circuit + lap-racing toolkit. Construct once from a ring of
 * control points; sample a dense periodic Catmull-Rom centerline with tangents,
 * right-perpendicular normals and a curvature/bank estimate; then per frame call
 * nearest / progress / update for any number of racers.
 */
export class LapCircuit {
  /**
   * @param {Array} controlPoints  ring of control points ([a,b] or {x,z}/{x,y})
   * @param {object} [opts]
   * @param {number} [opts.samplesPerSegment=26]  centerline density per segment
   * @param {number} [opts.halfWidth=7.2]  road half-width (for on/off-track tests)
   * @param {number} [opts.totalLaps=3]  laps to complete the race
   * @param {('xz'|'xy')} [opts.axes='xz']  position field pair to read/write
   * @param {number} [opts.startIndex=0]  centerline sample treated as start/finish
   * @param {number} [opts.nearestBack=14]  nearest-scan window behind last index
   * @param {number} [opts.nearestFwd=20]  nearest-scan window ahead of last index
   */
  constructor(controlPoints, opts = {}) {
    this.axes = (opts.axes === 'xy') ? 'xy' : 'xz';
    this._a = this.axes[0];
    this._b = this.axes[1];
    this.samplesPerSegment = Math.max(2, Math.floor(opts.samplesPerSegment || 26));
    this.halfWidth = isFiniteNumber(opts.halfWidth) ? opts.halfWidth : 7.2;
    this.totalLaps = Math.max(1, Math.floor(opts.totalLaps || 3));
    this.startIndex = Math.max(0, Math.floor(opts.startIndex || 0));
    this._winBack = Math.max(1, Math.floor(opts.nearestBack ?? 14));
    this._winFwd = Math.max(1, Math.floor(opts.nearestFwd ?? 20));

    // --- sample the closed centerline ---
    const samples = catmullRom(controlPoints, this.samplesPerSegment, this.axes);
    const N = samples.length;
    this.count = N;
    this.finishCount = 0;          // race-wide: how many racers have finished

    // Parallel arrays, all length N, all in generic {a,b} object form so a
    // renderer can read center[i].x / center[i].z (or .y) without index juggling.
    this.center = new Array(N);    // centerline points
    this.tangent = new Array(N);   // unit forward tangents
    this.normal = new Array(N);    // unit right-perpendicular normals
    this.bank = new Array(N);      // signed curvature/bank estimate [-1,1]-ish

    // Raw [a,b] pair arrays kept internally for the hot nearest/progress loops
    // (avoids per-frame property lookups); the object arrays above are for render.
    this._S = samples;             // centerline as [a,b]
    this._DIR = new Array(N);      // tangents as [a,b]
    this._PER = new Array(N);      // normals as [a,b]

    for (let i = 0; i < N; i++) {
      const cur = samples[i], nxt = samples[(i + 1) % N];
      let dx = nxt[0] - cur[0], dy = nxt[1] - cur[1];
      const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      // right-perpendicular (rotate tangent -90deg): matches the shipped racer's
      // PER = [dz, -dx] convention so "offset > 0" is consistently one side.
      const px = dy, py = -dx;
      this._DIR[i] = [dx, dy];
      this._PER[i] = [px, py];
      this.center[i] = this._mk(cur[0], cur[1]);
      this.tangent[i] = this._mk(dx, dy);
      this.normal[i] = this._mk(px, py);
    }
    // curvature / bank: how much the tangent turns from sample to sample, signed
    // by turn direction. Renderers can roll the road by bank[i] for banked corners
    // and physics can scale grip in proportion to |bank[i]|.
    for (let i = 0; i < N; i++) {
      const d0 = this._DIR[(i - 1 + N) % N], d1 = this._DIR[(i + 1) % N];
      // 2D cross product of consecutive tangents = signed turn rate.
      const cross = d0[0] * d1[1] - d0[1] * d1[0];
      this.bank[i] = Math.max(-1, Math.min(1, cross * 4));
    }

    // precompute bounds once
    let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
    for (let i = 0; i < N; i++) {
      const s = samples[i];
      if (s[0] < minA) minA = s[0]; if (s[0] > maxA) maxA = s[0];
      if (s[1] < minB) minB = s[1]; if (s[1] > maxB) maxB = s[1];
    }
    this._bounds = { minA, maxA, minB, maxB };
  }

  // build a generic position object using this circuit's axis names
  _mk(a, b) {
    const o = {};
    o[this._a] = a; o[this._b] = b;
    return o;
  }

  // read a racer's two position coordinates as [a,b] (tolerates {x,z}/{x,y}/array)
  _read(pos) {
    if (Array.isArray(pos)) return [pos[0] || 0, pos[1] || 0];
    const p = (pos && pos.position != null) ? pos.position : pos;
    if (Array.isArray(p)) return [p[0] || 0, p[1] || 0];
    return [p[this._a] || 0, p[this._b] || 0];
  }

  // fetch (or lazily create) the per-racer lap state stored on the racer object
  _state(racer) {
    let st = racer[RACER_STATE];
    if (!st) {
      st = {
        idx: this.startIndex,   // last nearest index (window anchor)
        latDist: 0,             // |signed offset| from last nearest()
        prevP: null,            // previous normalized progress (lap-wrap detector)
        p: this.startIndex / this.count,
        lap: 1,
        finished: false,
        finishRank: 0,
        lapStartT: 0,           // raceTime at which the current lap began
        raceTime: 0,            // total elapsed race time for this racer
        lastLap: 0,             // duration of the most recently completed lap
        bestLap: 0,             // best completed lap so far (0 = none yet)
      };
      Object.defineProperty(racer, RACER_STATE, {
        value: st, enumerable: false, writable: true, configurable: true,
      });
    }
    return st;
  }

  /**
   * Attach a racer to this circuit, seeding its window anchor near startIndex.
   * Optional -- nearest/progress/update will lazily attach on first call -- but
   * calling it explicitly avoids a first-frame full-loop scan.
   * @param {object} racer  the entity whose position you will query each frame
   * @param {number} [atIndex]  centerline index to anchor at (defaults startIndex)
   * @returns {object} the racer (for chaining)
   */
  attach(racer, atIndex) {
    const st = this._state(racer);
    if (isFiniteNumber(atIndex)) {
      st.idx = ((Math.floor(atIndex) % this.count) + this.count) % this.count;
    }
    return racer;
  }

  /**
   * Bounded-window nearest-sample scan around the racer's last index. Stays
   * O(window) per frame and never jumps to a far-away part of the track, which
   * is what makes lap progress monotonic and the lap-wrap detector reliable.
   * @param {object} pos  racer (or bare position object/array)
   * @returns {{index:number, point:object}} nearest sample index + its point
   */
  nearest(pos) {
    const st = this._state(pos);
    const [ax, ay] = this._read(pos);
    const N = this.count, S = this._S;
    let best = st.idx, bd = Infinity;
    for (let o = -this._winBack; o <= this._winFwd; o++) {
      const i = ((st.idx + o) % N + N) % N;
      const dx = ax - S[i][0], dy = ay - S[i][1];
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    st.idx = best;
    st.latDist = Math.sqrt(bd);
    return { index: best, point: this.center[best] };
  }

  /**
   * Normalized track progress plus the signed perpendicular offset.
   * @param {object} pos  racer (or bare position object/array)
   * @returns {{p:number, offset:number, sampleIndex:number}}
   *   p:      progress in [0,1)
   *   offset: signed distance from the centerline along the right-normal. Positive
   *           = right of travel, negative = left. |offset| > halfWidth means the
   *           racer is off the asphalt -- |offset| - halfWidth is the distance past
   *           the edge, ready for a wall push-back or grass speed penalty.
   *   sampleIndex: the nearest centerline sample index.
   */
  progress(pos) {
    const { index } = this.nearest(pos);
    const [ax, ay] = this._read(pos);
    const S = this._S, PER = this._PER;
    // signed perpendicular offset = (racer - centerline) . rightNormal
    const dx = ax - S[index][0], dy = ay - S[index][1];
    const offset = dx * PER[index][0] + dy * PER[index][1];
    return { p: index / this.count, offset, sampleIndex: index };
  }

  /**
   * Per-frame lap + timing update for one racer. Robustly detects a forward lap
   * crossing (prevP in the last quarter, p in the first quarter) and IGNORES a
   * backward crossing, so reversing over the line never awards or removes a lap.
   * Maintains a per-lap timer (current/last/best) and total race time.
   * @param {object} racer  the entity to advance (position read from it)
   * @param {number} dt  delta time in seconds
   * @returns {{lap:number, lapTime:number, lastLap:number, bestLap:number,
   *            raceTime:number, p:number, finished:boolean, finishRank:number}}
   */
  update(racer, dt) {
    const st = this._state(racer);
    const step = isFiniteNumber(dt) && dt > 0 ? dt : 0;
    if (!st.finished) st.raceTime += step;

    const { index } = this.nearest(racer);
    const p = index / this.count;

    if (st.prevP !== null && !st.finished) {
      if (st.prevP > 0.75 && p < 0.25) {
        // forward crossing of the start/finish line: bank the completed lap
        const lapDur = st.raceTime - st.lapStartT;
        st.lastLap = lapDur;
        if (st.bestLap === 0 || lapDur < st.bestLap) st.bestLap = lapDur;
        st.lapStartT = st.raceTime;
        st.lap++;
        if (st.lap > this.totalLaps) {
          st.finished = true;
          st.finishRank = ++this.finishCount;
        }
      } else if (st.prevP < 0.25 && p > 0.75) {
        // crossed the line backwards: ignore (no negative lap, no timer reset)
      }
    }
    st.prevP = p;
    st.p = p;

    return {
      lap: st.lap,
      lapTime: st.raceTime - st.lapStartT,   // current lap elapsed
      lastLap: st.lastLap,
      bestLap: st.bestLap,
      raceTime: st.raceTime,
      p,
      finished: st.finished,
      finishRank: st.finishRank,
    };
  }

  /**
   * Off-track resolution helper: if the racer is past the road edge, returns the
   * push-back vector that nudges it back onto the asphalt (along the centerline
   * normal) plus the off-track depth, else null. Renderer/physics-agnostic -- it
   * does NOT mutate the racer; you apply the vector however you like.
   * @param {object} pos  racer (or bare position object/array)
   * @param {number} [margin=0.6]  forgiveness beyond halfWidth before it counts
   * @returns {{depth:number, pushA:number, pushB:number, side:number}|null}
   */
  offTrack(pos, margin) {
    const prog = this.progress(pos);
    const lim = this.halfWidth + (isFiniteNumber(margin) ? margin : 0.6);
    const over = Math.abs(prog.offset) - lim;
    if (over <= 0) return null;
    const side = prog.offset >= 0 ? 1 : -1;   // which side they drifted off
    const per = this._PER[prog.sampleIndex];
    // push back TOWARD the center, i.e. opposite the side they exited on
    return { depth: over, pushA: -side * per[0] * over, pushB: -side * per[1] * over, side };
  }

  /** Reset a single racer's lap/timing state (e.g. on race restart). */
  resetRacer(racer) {
    if (racer[RACER_STATE]) delete racer[RACER_STATE];
    this._state(racer);
    return racer;
  }

  /** Reset the race-wide finish counter (call on full restart). */
  resetRace() { this.finishCount = 0; }

  /**
   * Axis-aligned bounds of the centerline, for fitting a minimap. Keys follow the
   * configured axes: 'xz' -> {minx,maxx,minz,maxz}; 'xy' -> {minx,maxx,miny,maxy}.
   * @returns {object}
   */
  bounds() {
    const b = this._bounds;
    const out = {};
    out['min' + this._a] = b.minA; out['max' + this._a] = b.maxA;
    out['min' + this._b] = b.minB; out['max' + this._b] = b.maxB;
    return out;
  }

  /**
   * The point + frame on the centerline a given number of samples AHEAD of a
   * racer's current index -- handy for AI look-ahead steering or a chase camera.
   * @param {object} pos  racer
   * @param {number} [look=6]  samples to look ahead (wraps around the loop)
   * @returns {{index:number, point:object, tangent:object, normal:object}}
   */
  lookAhead(pos, look) {
    const st = this._state(pos);
    const N = this.count;
    const i = ((st.idx + Math.floor(look ?? 6)) % N + N) % N;
    return { index: i, point: this.center[i], tangent: this.tangent[i], normal: this.normal[i] };
  }
}

/**
 * Factory equivalent of `new LapCircuit(controlPoints, opts)` for call sites that
 * prefer not to use `new`.
 * @param {Array} controlPoints
 * @param {object} [opts]
 * @returns {LapCircuit}
 */
export function createLapCircuit(controlPoints, opts) {
  return new LapCircuit(controlPoints, opts);
}

// END mChatAI Web Component: systems.lap-circuit-3d
