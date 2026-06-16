// BEGIN mChatAI Web Component: systems.endless-scroller-3d
//
// Endless-scroller infrastructure: segment recycling + typed object pooling +
// lane collision + frame-time normalization. NO three.js, NO WebGL, NO external
// dependencies — pure JS that operates on whatever objects YOUR game supplies.
// Each game object just needs a mutable position you expose as `{x,y,z}` OR a
// `[x,y,z]` array; the module reads/writes it through tiny accessors so it works
// with THREE.Mesh, THREE.Group, your own sprite, or a bare `{x:0,y:0,z:0}`.
//
// This is the runner/flyer/tunnel/drift backbone the CLI kept re-deriving (and
// getting subtly wrong) for every "infinite track" build. It is the proven loop
// from the shipped `neon-runner-3d` (segment wrap + obstacle/coin pools + lane
// collision) cross-validated against `coral-reef-drift-3d` (z>threshold drift
// recycle). Import it instead of reinventing the recycle math.
//
// USAGE (three.js endless runner)
//   import { EndlessTrack, createPool, laneCollide, clampDelta }
//     from './endless-scroller-3d.js';
//
//   const LANES = [-2, 0, 2];
//   // pool of obstacle meshes (one geometry, recolored on acquire if you like)
//   const obstacles = createPool(
//     () => { const m = new THREE.Mesh(geo, mat); scene.add(m); return m; },
//     (m) => { m.visible = false; }                       // reset on release
//   );
//
//   const track = new EndlessTrack({
//     segmentLength: 24, segmentCount: 12, lanes: LANES,
//     // build the contents of segment N; return the live items you spawned so
//     // the track can recycle them when that segment wraps:
//     spawn: (segIndex, segZ) => {
//       const items = [];
//       if (Math.random() < 0.7) {
//         const o = obstacles.acquire();
//         o.visible = true;
//         o.position.set(LANES[(Math.random()*3)|0], 0.5, segZ);
//         items.push(o);
//       }
//       return items;
//     },
//     recycle: (item) => obstacles.release(item),         // hand items back
//   });
//   track.reset();                                        // lay out the initial band
//
//   function frame(now) {
//     const dt = clampDelta(now);                         // seconds, spike-safe
//     player.position.z -= speed * dt;                    // move the player forward
//     track.update(player.position.z);                    // wrap + respawn behind us
//     const hit = laneCollide(player, obstacles.live(),   // first obstacle we struck
//                             { laneWidth: 2, hitDist: 0.95 });
//     if (hit) gameOver();
//     renderer.render(scene, camera);
//     requestAnimationFrame(frame);
//   }
//   requestAnimationFrame(frame);
//
// USAGE (drift sim — coral-reef style, no lanes)
//   const track = new EndlessTrack({
//     segmentLength: 95, segmentCount: 1, axis: 'z', direction: -1,
//     spawn: (i, z) => scatterReefRow(z),     // returns the meshes you placed
//     recycle: (o) => o.parent && o.parent.remove(o),
//   });
//   // drift forward; recycle anything that passed behind the camera:
//   function frame(now){ track.update(playerZ += DRIFT * clampDelta(now)); ... }

// ---------- position accessors (works on {x,y,z} OR [x,y,z]) ----------
/// Read one axis off an object's `.position` (or the object itself), tolerating
/// both the THREE.Vector3-style `{x,y,z}` and a plain `[x,y,z]` array.
function getPos(obj, axisIndex) {
  const p = (obj && obj.position != null) ? obj.position : obj;
  if (p == null) return 0;
  if (Array.isArray(p)) return p[axisIndex] || 0;
  return (axisIndex === 0 ? p.x : axisIndex === 1 ? p.y : p.z) || 0;
}

/// Write one axis to an object's `.position` (or the object itself), tolerating
/// both `{x,y,z}` and `[x,y,z]`.
function setPos(obj, axisIndex, value) {
  const p = (obj && obj.position != null) ? obj.position : obj;
  if (p == null) return;
  if (Array.isArray(p)) { p[axisIndex] = value; return; }
  if (axisIndex === 0) p.x = value; else if (axisIndex === 1) p.y = value; else p.z = value;
}

const AXIS_INDEX = { x: 0, y: 1, z: 2 };

// ---------- frame-time normalization ----------
/// Spike-safe delta. Pass either a DOMHighResTimeStamp (from rAF / performance.now)
/// to get elapsed seconds since the previous call, OR a raw dt to just clamp it.
/// A single shared closure keeps its own `last` timestamp so the first frame
/// returns 0 instead of a multi-second jump (tab-switch / breakpoint resume).
/// `maxStep` caps the result (default 0.05s ≈ 20fps floor) so physics never
/// tunnels through obstacles after a stall — exactly the `Math.min(0.05, …)`
/// guard both source artifacts used.
export function clampDelta(now, maxStep = 0.05) {
  if (clampDelta._last == null) { clampDelta._last = now; return 0; }
  let dt = (now - clampDelta._last) / 1000;
  clampDelta._last = now;
  if (!(dt > 0)) dt = 0;                 // guards NaN / clock going backwards
  return dt > maxStep ? maxStep : dt;
}

/// Make an independent delta-clamp closure (use one per game loop if you run
/// several, so they don't share the static `_last`). Behaves like `clampDelta`.
export function makeDeltaClamp(maxStep = 0.05) {
  let last = null;
  return function (now) {
    if (last == null) { last = now; return 0; }
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 0;
    return dt > maxStep ? maxStep : dt;
  };
}

// ---------- typed object pool (free-stack) ----------
/// A reuse pool so the GC never sees a spike of dead obstacles/coins/particles.
///   make()  -> create a brand-new object (only called when the free-stack is empty)
///   reset(obj) -> optional; called on release to "deactivate" (e.g. hide a mesh)
/// Returns { acquire(), release(obj), forEach(fn), live(), size(), drain() }.
/// `acquire()` pops a free object or mints a fresh one and tracks it as live.
/// `release(obj)` resets it and returns it to the free-stack. `live()` is the
/// array of currently-acquired objects (collision/animation iterate this).
export function createPool(make, reset = null) {
  if (typeof make !== 'function') throw new Error('createPool(make[, reset]): make must be a function');
  const free = [];
  const active = [];

  return {
    acquire() {
      const obj = free.length ? free.pop() : make();
      active.push(obj);
      return obj;
    },
    /// Release a single object. O(n) over the live list (small N in practice).
    release(obj) {
      const i = active.indexOf(obj);
      if (i >= 0) active.splice(i, 1);
      if (reset) reset(obj);
      free.push(obj);
      return obj;
    },
    /// Release the object currently at live-index `i` (cheaper than release()
    /// when you're already iterating the live array backwards).
    releaseAt(i) {
      if (i < 0 || i >= active.length) return null;
      const obj = active[i];
      active.splice(i, 1);
      if (reset) reset(obj);
      free.push(obj);
      return obj;
    },
    /// Iterate the live objects (forward). Don't release during this — use a
    /// manual backwards index loop + releaseAt() if you need to remove.
    forEach(fn) { for (let i = 0; i < active.length; i++) fn(active[i], i); },
    /// The live array itself (shared reference — treat as read-only).
    live() { return active; },
    /// Counts: { live, free, total }.
    size() { return { live: active.length, free: free.length, total: active.length + free.length }; },
    /// Release every live object back to the free-stack.
    drain() { while (active.length) this.releaseAt(active.length - 1); },
  };
}

// ---------- endless track (segment recycle + respawn) ----------
/// A ring of `segmentCount` segments laid along one axis. As the player moves,
/// the segment that has fallen `> segmentLength` behind the player wraps to the
/// FRONT of the ring (offset by the full band length) and its contents are
/// recycled + respawned. This is the proven neon-runner loop:
///   if (segZ - playerZ > SEG_LEN) segZ -= SEG_LEN * SEG_COUNT
/// generalized to either scroll direction and any axis.
///
/// opts:
///   segmentLength  (number)            length of one segment along the axis
///   segmentCount   (number)            how many segments in the ring (>=1)
///   axis           ('x'|'y'|'z')       scroll axis (default 'z')
///   direction      (-1 | +1)           which way the world extends from the
///                                      player. -1 (default) = track ahead is in
///                                      the -axis direction (runner moving toward
///                                      -z), matching neon-runner.
///   lanes          (number[])          optional lane offsets, passed through to
///                                      spawn() and exposed as `track.lanes`
///   start          (number)            axis coordinate of the player at reset
///                                      (default 0)
///   spawn(segIndex, segCoord)          REQUIRED. Build/place the contents of a
///                                      segment; return an array of the live
///                                      items so the track can recycle them when
///                                      the segment wraps. May return [].
///   recycle(item)                      optional. Called for every item of a
///                                      wrapping segment (hand back to a pool /
///                                      remove from scene) before respawn.
export class EndlessTrack {
  constructor(opts = {}) {
    if (typeof opts.spawn !== 'function') throw new Error('EndlessTrack requires a spawn(segIndex, segCoord) function');
    this.segmentLength = opts.segmentLength ?? 24;
    this.segmentCount = Math.max(1, opts.segmentCount ?? 12);
    this.axis = opts.axis ?? 'z';
    this._axisIndex = AXIS_INDEX[this.axis] ?? 2;
    this.direction = (opts.direction === 1) ? 1 : -1;   // default -1 (track in -axis)
    this.lanes = opts.lanes ?? null;
    this.start = opts.start ?? 0;
    this._spawn = opts.spawn;
    this._recycle = opts.recycle ?? null;

    // segments[i] = { coord, index, items[] }. `coord` is the segment's leading
    // axis coordinate; `index` is its monotonically increasing logical id so the
    // game can vary difficulty/content with distance.
    this.segments = [];
    this._nextIndex = 0;
    this._bandLength = this.segmentLength * this.segmentCount;
  }

  /// Lay out the initial band ahead of the player and spawn each segment.
  /// Call once before the loop, and again to restart a run (recycles first).
  reset() {
    this._disposeAll();
    this.segments = [];
    this._nextIndex = 0;
    const dir = this.direction;
    for (let i = 0; i < this.segmentCount; i++) {
      // segment i sits i*segmentLength in front of the player (in `dir`)
      const coord = this.start + dir * (i + 1) * this.segmentLength;
      const seg = { coord, index: this._nextIndex++, items: [] };
      seg.items = this._spawn(seg.index, coord, this.lanes) || [];
      this.segments.push(seg);
    }
  }

  /// Advance the track for the current player coordinate along the scroll axis.
  /// Wraps every segment that has fallen more than one segmentLength BEHIND the
  /// player to the far front of the band, recycling + respawning its contents.
  /// Returns the number of segments recycled this frame (usually 0 or 1).
  /// Loops (not a single `if`) so a big dt or a teleport still settles in one call.
  update(playerCoord) {
    const dir = this.direction;
    const band = this._bandLength;
    let wrapped = 0;
    let guard = this.segmentCount + 1;   // never spin forever on bad input
    for (;;) {
      // find the furthest-behind segment. "Behind" means in the +(-dir) side of
      // the player by more than segmentLength.  behindBy = dir * (player - coord)
      let worst = -1, worstBehind = this.segmentLength;
      for (let i = 0; i < this.segments.length; i++) {
        const behindBy = dir * (playerCoord - this.segments[i].coord);
        if (behindBy > worstBehind) { worstBehind = behindBy; worst = i; }
      }
      if (worst < 0 || guard-- <= 0) break;

      const seg = this.segments[worst];
      // recycle old contents
      if (this._recycle) for (let k = 0; k < seg.items.length; k++) this._recycle(seg.items[k]);
      seg.items.length = 0;
      // wrap forward by a full band and respawn
      seg.coord += dir * band;
      seg.index = this._nextIndex++;
      seg.items = this._spawn(seg.index, seg.coord, this.lanes) || [];
      wrapped++;
    }
    return wrapped;
  }

  /// Convenience: move every segment object's `.position` to match its tracked
  /// coordinate. Only needed if your segments are real renderables (e.g. the
  /// floor meshes in neon-runner) rather than virtual spawn anchors. Pass the
  /// parallel array of segment objects in the SAME order you created them.
  applyTo(segmentObjects) {
    if (!segmentObjects) return;
    const ax = this._axisIndex;
    for (let i = 0; i < this.segments.length && i < segmentObjects.length; i++) {
      setPos(segmentObjects[i], ax, this.segments[i].coord);
    }
  }

  _disposeAll() {
    if (!this._recycle) return;
    for (let i = 0; i < this.segments.length; i++) {
      const items = this.segments[i].items;
      for (let k = 0; k < items.length; k++) this._recycle(items[k]);
    }
  }

  /// Recycle every live item (e.g. on teardown / game restart without reset()).
  dispose() { this._disposeAll(); this.segments = []; }
}

// ---------- lane collision ----------
/// First object in `items` that collides with `player`, or null. Uses the proven
/// neon-runner test: same lane (|dx| within half a lane) AND within `hitDist`
/// along the scroll axis — an AABB-ish band check that's cheap and forgiving.
///
/// opts:
///   laneWidth (number)   spacing between lanes; |dx| must be < laneWidth/2 to
///                        count as "same lane". Omit (or 0) to ignore lanes and
///                        test pure distance on the cross + scroll axes.
///   hitDist   (number)   max separation along the scroll axis to count as a hit
///                        (default 1.0).
///   axis      ('x'|'y'|'z')  scroll axis (default 'z'); the cross axis used for
///                        the lane check is 'x' unless axis === 'x' (then 'z').
///   yTolerance (number)  if set, also require |dy| < yTolerance (e.g. so a
///                        jumping player clears a low hurdle — pass the obstacle's
///                        height as tolerance and skip the hit when airborne).
///   filter(item)         optional predicate; only items returning true are tested.
/// Returns the colliding item (so the caller can read item.userData etc.) or null.
export function laneCollide(player, items, opts = {}) {
  if (!items || !items.length) return null;
  const scrollAxis = opts.axis ?? 'z';
  const sIdx = AXIS_INDEX[scrollAxis] ?? 2;
  const cIdx = (sIdx === 0) ? 2 : 0;             // cross axis for the lane check
  const laneHalf = opts.laneWidth ? opts.laneWidth / 2 : null;
  const hitDist = opts.hitDist ?? 1.0;
  const yTol = opts.yTolerance ?? null;
  const filter = opts.filter ?? null;

  const ps = getPos(player, sIdx);
  const pc = getPos(player, cIdx);
  const py = getPos(player, 1);

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (filter && !filter(it)) continue;
    if (Math.abs(getPos(it, sIdx) - ps) >= hitDist) continue;     // far along track
    if (laneHalf != null) {
      if (Math.abs(getPos(it, cIdx) - pc) >= laneHalf) continue;  // different lane
    } else {
      if (Math.abs(getPos(it, cIdx) - pc) >= hitDist) continue;   // no-lane distance
    }
    if (yTol != null && Math.abs(getPos(it, 1) - py) >= yTol) continue;  // cleared vertically
    return it;
  }
  return null;
}

/// Like laneCollide but returns ALL colliding items (e.g. coin pickups, where you
/// want to collect every overlapping coin in one frame, not just the first).
export function laneCollideAll(player, items, opts = {}) {
  const hits = [];
  if (!items || !items.length) return hits;
  const scrollAxis = opts.axis ?? 'z';
  const sIdx = AXIS_INDEX[scrollAxis] ?? 2;
  const cIdx = (sIdx === 0) ? 2 : 0;
  const laneHalf = opts.laneWidth ? opts.laneWidth / 2 : null;
  const hitDist = opts.hitDist ?? 1.0;
  const yTol = opts.yTolerance ?? null;
  const filter = opts.filter ?? null;

  const ps = getPos(player, sIdx);
  const pc = getPos(player, cIdx);
  const py = getPos(player, 1);

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (filter && !filter(it)) continue;
    if (Math.abs(getPos(it, sIdx) - ps) >= hitDist) continue;
    if (laneHalf != null) {
      if (Math.abs(getPos(it, cIdx) - pc) >= laneHalf) continue;
    } else {
      if (Math.abs(getPos(it, cIdx) - pc) >= hitDist) continue;
    }
    if (yTol != null && Math.abs(getPos(it, 1) - py) >= yTol) continue;
    hits.push(it);
  }
  return hits;
}

// END mChatAI Web Component: systems.endless-scroller-3d
