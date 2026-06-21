// BEGIN mChatAI Web Component: systems.path-follower-3d
//
// Monotonic cursor progress along an authored waypoint corridor (NOT segment
// recycling), renderer-agnostic {x,z} -> Vector3, delta-time. This is the missing
// "creeps advance along a fixed path and leak at the end" primitive for tower
// defense, lane pushers, patrol routes, conveyor belts, and racing rails.
//
// systems.spawn-wave-3d only SCHEDULES spawn timing; it has zero notion of a
// path/segments/progress. This module owns the path geometry and the math that
// turns a single scalar distance into a position. It holds NO entity state:
// every moving thing is just a `dist` scalar that the caller advances each frame.
//
//   entity.dist += speed * slowFactor * dt;
//   const p = follower.pathPos(entity.dist);   // { x, z } on the polyline
//   if (entity.dist >= follower.pathLen) leak(entity);
//
// Renderer-agnostic: a three.js consumer maps {x,z} onto a Vector3
// (mesh.position.set(p.x, y, p.z)); a 2D-iso or canvas consumer uses {x,z}
// directly. Waypoints may be {x,z} OR {x,y} OR [x, z] -- all are accepted and the
// output mirrors the {x,z} naming.
//
// Pure delta-time math. NO three.js / WebGL / canvas / external deps. Offline-safe.
//
// Exports:
//   PathFollower      class -- precomputes segment lengths + pathLen, samples
//                     pathPos(dist), reports progress(dist), and can rasterize
//                     the integer grid cells the path covers (cellsCovered()).
//   makePathFollower  factory shorthand -- new PathFollower(waypoints, opts).
//
// Usage:
//   import { PathFollower } from './systems/path-follower-3d.js';
//   // Winding corridor as cell waypoints (first point can be an off-board spawn).
//   const path = new PathFollower(
//     [[-1,1],[9,1],[9,3],[2,3],[2,5],[9,5],[9,7],[1,7]],
//     { cellOffset: 0.5 }   // sample at tile centers (matches grid rendering)
//   );
//   const creep = { dist: 0, speed: 1.5 };
//   // each frame:
//   creep.dist += creep.speed * slowFactor * dt;
//   const p = path.pathPos(creep.dist);          // { x, z }
//   mesh.position.set(p.x, 0, p.z);              // three.js consumer
//   if (creep.dist >= path.pathLen) { lives -= creep.leak; kill(creep); }
//   // furthest-along targeting (tower picks the creep closest to the base):
//   const t = path.progress(creep.dist);         // 0..1
//   // ground tinting / non-buildable tiles:
//   const blocked = path.cellsCovered();         // Set of "c,r" keys
//
// Contracts:
//   - State per entity is a single `dist` scalar; the module is stateless re: entities.
//   - dist is clamped per segment, so dist < 0 returns the start and
//     dist >= pathLen returns the final waypoint (callers detect end via pathLen).
//   - pathLen is in the same units as the waypoint coordinates.
//   - All advancement is the caller's responsibility and MUST be delta-time based.

function isFiniteNumber(v) { return typeof v === 'number' && Number.isFinite(v); }

// Normalize one waypoint to { x, z }. Accepts { x, z }, { x, y }, or [x, z].
function toPoint(wp, offset) {
  let x, z;
  if (Array.isArray(wp)) {
    x = wp[0]; z = wp[1];
  } else if (wp && typeof wp === 'object') {
    x = wp.x;
    z = wp.z !== undefined ? wp.z : wp.y;
  }
  if (!isFiniteNumber(x)) x = 0;
  if (!isFiniteNumber(z)) z = 0;
  return { x: x + offset, z: z + offset };
}

export class PathFollower {
  // waypoints  array of >= 2 points: { x, z } | { x, y } | [x, z].
  // opts:
  //   cellOffset  added to every coordinate (use 0.5 to sample tile centers on a
  //               grid where waypoints are integer cell indices). Default 0.
  //   gridBounds  { cols, rows } -- when set, cellsCovered() drops cells outside
  //               [0,cols) x [0,rows). Default null (no clamping).
  constructor(waypoints, opts = {}) {
    const offset = isFiniteNumber(opts.cellOffset) ? opts.cellOffset : 0;
    this.cellOffset = offset;
    this.gridBounds = (opts.gridBounds && typeof opts.gridBounds === 'object') ? opts.gridBounds : null;

    // Keep the raw waypoints (pre-offset) so cell rasterization stays integer.
    this._rawWaypoints = Array.isArray(waypoints) ? waypoints.slice() : [];
    this.points = this._rawWaypoints.map(wp => toPoint(wp, offset));

    // Precompute per-segment lengths and the total path length.
    this.segments = [];
    this.pathLen = 0;
    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i];
      const b = this.points[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      this.segments.push({ a, b, len });
      this.pathLen += len;
    }

    this._cellSet = null; // lazily rasterized
  }

  // Interpolated position at `dist` along the polyline. t is clamped per segment,
  // so dist <= 0 returns the start and dist >= pathLen returns the final point.
  pathPos(dist) {
    if (this.segments.length === 0) {
      const p = this.points[0] || { x: 0, z: 0 };
      return { x: p.x, z: p.z };
    }
    let d = isFiniteNumber(dist) ? dist : 0;
    if (d < 0) d = 0;
    for (let i = 0; i < this.segments.length; i++) {
      const s = this.segments[i];
      if (d <= s.len || i === this.segments.length - 1) {
        const t = s.len > 0 ? Math.max(0, Math.min(1, d / s.len)) : 0;
        return {
          x: s.a.x + (s.b.x - s.a.x) * t,
          z: s.a.z + (s.b.z - s.a.z) * t
        };
      }
      d -= s.len;
    }
    const last = this.points[this.points.length - 1];
    return { x: last.x, z: last.z };
  }

  // Fraction along the whole path, 0..1. Use for furthest-along targeting
  // (largest progress == closest to the base) and end-of-path detection.
  progress(dist) {
    if (this.pathLen <= 0) return 0;
    const d = isFiniteNumber(dist) ? dist : 0;
    return Math.max(0, Math.min(1, d / this.pathLen));
  }

  // True once the entity has reached (or passed) the end of the corridor.
  isAtEnd(dist) {
    return isFiniteNumber(dist) && dist >= this.pathLen;
  }

  // First and last positions (spawn point / base point).
  start() {
    const p = this.points[0] || { x: 0, z: 0 };
    return { x: p.x, z: p.z };
  }
  end() {
    const p = this.points[this.points.length - 1] || { x: 0, z: 0 };
    return { x: p.x, z: p.z };
  }

  // Set of integer grid cells the path's straight segments cover, as "c,r"
  // string keys (e.g. for tinting ground or marking non-buildable tiles).
  // Rasterizes from the RAW (pre-offset) waypoints, so pass integer cell indices
  // as waypoints and use cellOffset only for the rendered position. Cells outside
  // gridBounds (when provided) are skipped. Computed once, then cached.
  cellsCovered() {
    if (this._cellSet) return this._cellSet;
    const set = new Set();
    const bounds = this.gridBounds;
    const inBounds = (c, r) => {
      if (!bounds) return true;
      return c >= 0 && c < bounds.cols && r >= 0 && r < bounds.rows;
    };
    const raw = this._rawWaypoints.map(wp => {
      const p = toPoint(wp, 0); // no offset -- want integer cells
      return { c: Math.round(p.x), r: Math.round(p.z) };
    });
    for (let i = 0; i < raw.length - 1; i++) {
      let c = raw[i].c, r = raw[i].r;
      const c1 = raw[i + 1].c, r1 = raw[i + 1].r;
      const dc = Math.sign(c1 - c);
      const dr = Math.sign(r1 - r);
      // Walk the (axis-aligned or diagonal) segment cell by cell.
      let guard = 0;
      const maxSteps = Math.abs(c1 - c) + Math.abs(r1 - r) + 2;
      while (true) {
        if (inBounds(c, r)) set.add(c + ',' + r);
        if (c === c1 && r === r1) break;
        c += dc; r += dr;
        if (++guard > maxSteps + 4) break; // never spin on bad input
      }
    }
    this._cellSet = set;
    return set;
  }

  // Convenience for grid consumers: is this integer cell on the path?
  coversCell(c, r) {
    return this.cellsCovered().has(c + ',' + r);
  }

  get segmentCount() { return this.segments.length; }
  get waypointCount() { return this.points.length; }
}

// Factory shorthand.
export function makePathFollower(waypoints, opts = {}) {
  return new PathFollower(waypoints, opts);
}

// END mChatAI Web Component: systems.path-follower-3d
