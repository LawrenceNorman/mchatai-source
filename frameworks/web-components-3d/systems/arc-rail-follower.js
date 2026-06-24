// BEGIN mChatAI Web Component: systems.arc-rail-follower
//
// A GEO RAIL follower for globe.gl (or any lat/lng renderer): drive a player /
// vehicle / camera along a [lat, lng] polyline parametrized by ARC-LENGTH on a
// sphere, with smooth forward/back steering, and read back the current point +
// heading so a camera can chase it (globe.gl pointOfView easing). Also supplies
// the helpers a globe game actually needs: place a marker AT an arc-length,
// place one at a RANDOM offset ahead/behind the player (spawning pickups /
// targets along the seam), find the nearest marker, and a dateline-safe
// longitude unwrap so the camera never whips across the antimeridian.
//
// PURE GEO MATH -- no globe.gl, no three.js, no Tone, no DOM, no canvas. It only
// ever deals in numbers: lat/lng arrays in, lat/lng (and arc-length) out. The
// CALLER owns rendering -- you take the returned { lat, lng } and feed it to
// globe.gl's .pointsData() / .pathsData() / .pointOfView(), or to any 2D map.
// DELTA-TIME based, so motion is identical at 30 or 144 fps.
//
// Arc-length is measured in DEGREES of great-circle (the same unit globe.gl's
// gcDeg-style distances use), so distances along the rail compare directly to
// great-circle distances between points. A point at arc-length s on a polyline
// of total length L satisfies 0 <= s <= L; the rail does NOT wrap (single open
// polyline, V1 -- see "EXTENDING" below for junctions / loops).
//
// Exports:
//   gcDeg(lat1, lng1, lat2, lng2)        great-circle distance in DEGREES (haversine)
//   buildRail(coords, opts)              precompute a rail from [[lat,lng], ...]
//   railPointAt(rail, s)                 -> { lat, lng } at arc-length s (clamped)
//   railHeadingAt(rail, s, ds)           -> forward bearing (deg, 0=N) at s
//   nearestLng(targetLng, refLng)        unwrap targetLng to be nearest refLng
//   placeOnRail(rail, s)                 -> { lat, lng, s } marker datum at s
//   spawnAheadOnRail(rail, s, opts)      -> a marker datum at a random offset
//   nearestOnRail(markers, point)        -> closest marker by great-circle dist
//   updateRailFollower(follower, input, dt, opts)  one-shot steer + integrate
//   RailFollower                         stateful wrapper (rail + velocity + cam)
//   DEFAULT_RAIL_FOLLOWER_OPTS           tunable defaults (read-only reference)
//
// CONTRACTS:
//   - coords: an array of [lat, lng] pairs (degrees). Longitudes may be stored
//     "unwrapped" / continuous (e.g. 168, 177, 185, 167 across the dateline) so
//     the rail interpolates straight through the antimeridian without jumping --
//     buildRail preserves whatever you pass. Need >= 2 points.
//   - buildRail(coords, opts?) -> rail = { coords, cum, len }:
//       cum[i] = cumulative great-circle arc-length (deg) to coords[i]; cum[0]=0.
//       len    = total rail length (deg) = cum[last].
//     opts.copy (default true): deep-copies coords so later mutation of your
//     source array can't corrupt the rail. Pass copy:false to alias.
//   - railPointAt(rail, s) -> { lat, lng }: s clamped to [0, rail.len]. Linear
//     interpolation between the two bracketing vertices by arc-length fraction
//     (good enough for dense polylines; for sparse ones add more coords).
//   - updateRailFollower(follower, input, dt, opts):
//       follower : { s, vel } -- arc-length position + signed velocity (deg/s).
//                  Mutated IN PLACE; also gains `lastDir` (+1/-1) and `point`
//                  ({lat,lng} of the new position). Returns the same follower.
//       input    : { forward: bool, back: bool } OR a signed number `axis` in
//                  [-1, 1] (axis wins if present). forward = toward higher s.
//       dt       : seconds. Clamped internally so a tab-resume can't teleport.
//       opts     : merged over DEFAULT_RAIL_FOLLOWER_OPTS:
//         maxSpeed      top arc-length speed (deg/s). If <=0 it is auto-derived
//                       from the rail (rail.len / 11, the source's feel) when a
//                       rail is supplied via opts.rail / follower.rail.
//         accel         how fast vel chases the target (per-second smoothing k).
//         friction      per-second decay applied when no input is held (0..1;
//                       e.g. 0.0001 => very slippery glide to rest).
//         bounceDamp    velocity multiplier when you hit an end (e.g. -0.2 = a
//                       soft rebound off the rail tip; 0 = dead stop).
//         rail          the rail to integrate against (or pass follower.rail).
//   - railHeadingAt(rail, s, ds?) -> bearing in degrees (0=N, 90=E) by sampling
//     the rail just ahead of s. Handy to orient a vehicle model / arrow.
//   - placeOnRail / spawnAheadOnRail return PLAIN data { lat, lng, s } you can
//     spread into a globe.gl point/ring datum: { ...placeOnRail(rail,s), color }.
//   - This module never touches the DOM/GPU, so there is nothing to dispose().
//
// globe.gl CAMERA-FOLLOW HOOK (the part people get wrong):
//   Ease your camera toward the follower's point, and ALWAYS unwrap the target
//   longitude relative to the CURRENT camera longitude with nearestLng() before
//   easing, or the camera spins the long way round / snaps at the dateline:
//
//     const f = new RailFollower(buildRail(fault.coords), { maxSpeed: 0 });
//     // each frame (after f.update(...)):
//     const p = f.point;                                  // {lat,lng} on rail
//     cam.lat = lerp(cam.lat, p.lat, 0.5);
//     cam.lng = lerp(cam.lng, nearestLng(p.lng, cam.lng), 0.5); // dateline-safe
//     globe.pointOfView({ lat: cam.lat, lng: cam.lng, altitude: 1.12 }, 260);
//   Throttle the pointOfView call (~every 0.18s) and skip it while the user is
//   dragging the globe, so manual rotation isn't fought. (The follower itself
//   should keep integrating every frame regardless.)
//
// EXTENDING (V1 is a single open rail):
//   - Loop: set rail.loop = true and wrap s with ((s % len)+len)%len yourself
//     in your step (this module clamps for the open case).
//   - Junctions: keep an array of rails and, at a switch point (s within eps of
//     a junction arc-length), swap follower.rail + reset follower.s onto the new
//     rail's matching arc-length. The math here works per-rail unchanged.
//
// Extracted + generalized from the Tectonic: Plate Rider fault-rail loop
// (prep/interp/gcDeg/nearestLng arc-length rail + stepGame steering integration
// + the camera pointOfView follow easing).

const RAIL_D2R = Math.PI / 180;
const RAIL_R2D = 180 / Math.PI;

function railNum(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export const DEFAULT_RAIL_FOLLOWER_OPTS = Object.freeze({
  maxSpeed: 18,     // arc-length speed cap (deg/s). 0 => auto-derive from rail.len.
  accel: 6.5,       // velocity-chase smoothing rate (per second).
  friction: 0.0001, // per-second multiplier applied to vel when no input (slippery).
  bounceDamp: -0.2  // vel *= this on hitting a rail end (soft rebound). 0 = stop.
});

/**
 * Great-circle distance between two lat/lng points, in DEGREES of arc (haversine).
 * Same unit the rail's arc-length uses, so on-rail distance compares directly to
 * straight-line geo distance.
 */
export function gcDeg(lat1, lng1, lat2, lng2) {
  const a = lat1 * RAIL_D2R, b = lat2 * RAIL_D2R;
  const dla = (lat2 - lat1) * RAIL_D2R, dlo = (lng2 - lng1) * RAIL_D2R;
  const h = Math.sin(dla / 2) ** 2 + Math.cos(a) * Math.cos(b) * Math.sin(dlo / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h))) * RAIL_R2D;
}

/**
 * Unwrap `targetLng` so it is the representation nearest `refLng` (no more than
 * 180 deg away). Dateline-safe interpolation / camera easing depends on this.
 */
export function nearestLng(targetLng, refLng) {
  let t = targetLng;
  while (t - refLng > 180) t -= 360;
  while (t - refLng < -180) t += 360;
  return t;
}

/**
 * Precompute a rail from a [[lat,lng], ...] polyline.
 * @param {Array<[number,number]>} coords  at least 2 [lat, lng] pairs.
 * @param {object} [opts] { copy = true } deep-copy coords (default) or alias.
 * @returns {{coords:Array<[number,number]>, cum:number[], len:number}}
 */
export function buildRail(coords, opts) {
  if (!Array.isArray(coords) || coords.length < 2) {
    throw new Error('buildRail: need an array of at least 2 [lat,lng] points');
  }
  const copy = !(opts && opts.copy === false);
  const c = copy ? coords.map(p => [railNum(p[0], 0), railNum(p[1], 0)]) : coords;
  const cum = [0];
  for (let i = 1; i < c.length; i++) {
    cum[i] = cum[i - 1] + gcDeg(c[i - 1][0], c[i - 1][1], c[i][0], c[i][1]);
  }
  return { coords: c, cum, len: cum[cum.length - 1] };
}

// Find the index i such that cum[i-1] <= s <= cum[i] (linear scan; fine for the
// short polylines globe rails use -- typically < 30 vertices).
function bracket(rail, s) {
  const cum = rail.cum;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  return i;
}

/**
 * Point on the rail at arc-length s (clamped to [0, len]).
 * @returns {{lat:number, lng:number}}
 */
export function railPointAt(rail, s) {
  const len = rail.len;
  s = s < 0 ? 0 : (s > len ? len : s);
  const cum = rail.cum, c = rail.coords;
  const i = bracket(rail, s);
  const seg = cum[i] - cum[i - 1];
  const t = seg > 1e-6 ? (s - cum[i - 1]) / seg : 0;
  return {
    lat: c[i - 1][0] + (c[i][0] - c[i - 1][0]) * t,
    lng: c[i - 1][1] + (c[i][1] - c[i - 1][1]) * t
  };
}

/**
 * Forward bearing (deg, 0=N, 90=E) of the rail at arc-length s, sampled by
 * looking a small step `ds` ahead (toward higher s). Useful to orient a model.
 */
export function railHeadingAt(rail, s, ds) {
  const step = railNum(ds, Math.max(0.01, rail.len * 0.002));
  const ahead = s + step <= rail.len ? s + step : rail.len;
  const behind = ahead === rail.len ? Math.max(0, rail.len - step) : s;
  const p0 = railPointAt(rail, behind);
  const p1 = railPointAt(rail, ahead);
  const lo = nearestLng(p1.lng, p0.lng);
  const dLon = (lo - p0.lng) * RAIL_D2R;
  const la0 = p0.lat * RAIL_D2R, la1 = p1.lat * RAIL_D2R;
  const y = Math.sin(dLon) * Math.cos(la1);
  const x = Math.cos(la0) * Math.sin(la1) - Math.sin(la0) * Math.cos(la1) * Math.cos(dLon);
  let brg = Math.atan2(y, x) * RAIL_R2D;
  return (brg + 360) % 360;
}

/**
 * A marker datum AT arc-length s: { lat, lng, s }. Spread it into a renderer
 * datum: globe.pointsData([{ ...placeOnRail(rail, s), color: '#7CFFD0' }]).
 */
export function placeOnRail(rail, s) {
  s = s < 0 ? 0 : (s > rail.len ? rail.len : s);
  const p = railPointAt(rail, s);
  return { lat: p.lat, lng: p.lng, s };
}

/**
 * Place a marker a RANDOM offset ahead of (or behind) arc-length s. Mirrors the
 * source's epicenter spawner: pick an offset in [minOffset, maxOffset], try the
 * preferred direction first, fall back to the other side / clamp so it stays on
 * the rail.
 * @param {object} rail
 * @param {number} s  reference arc-length (e.g. the player's position).
 * @param {object} [opts]
 *   minOffset, maxOffset : arc-length window (deg). Defaults scale to rail.len.
 *   dir       : +1 ahead / -1 behind (default +1).
 *   rng       : () => [0,1) random source (default Math.random).
 * @returns {{lat:number,lng:number,s:number}}
 */
export function spawnAheadOnRail(rail, s, opts) {
  const o = opts || {};
  const rng = typeof o.rng === 'function' ? o.rng : Math.random;
  const minO = railNum(o.minOffset, rail.len * 0.09);
  const maxO = railNum(o.maxOffset, rail.len * 0.34);
  const dir = railNum(o.dir, 1) < 0 ? -1 : 1;
  const off = minO + rng() * Math.max(0, maxO - minO);
  let target = s + dir * off;
  if (target > rail.len) target = s - off; // overshot the end -> go the other way
  if (target < 0) target = s + off;
  return placeOnRail(rail, target);
}

/**
 * Nearest marker to a { lat, lng } point by great-circle distance.
 * @returns {{ marker:object|null, dist:number }} dist in degrees (Infinity if none).
 */
export function nearestOnRail(markers, point) {
  let best = null, bd = Infinity;
  if (Array.isArray(markers)) {
    for (let i = 0; i < markers.length; i++) {
      const m = markers[i];
      if (!m) continue;
      const d = gcDeg(point.lat, point.lng, railNum(m.lat, 0), railNum(m.lng, 0));
      if (d < bd) { bd = d; best = m; }
    }
  }
  return { marker: best, dist: bd };
}

function resolveFollowerOpts(opts) {
  const o = {};
  for (const k in DEFAULT_RAIL_FOLLOWER_OPTS) o[k] = DEFAULT_RAIL_FOLLOWER_OPTS[k];
  if (opts) {
    for (const k in DEFAULT_RAIL_FOLLOWER_OPTS) {
      if (k in opts) o[k] = railNum(opts[k], o[k]);
    }
    o.rail = opts.rail || null;
  } else {
    o.rail = null;
  }
  return o;
}

// Resolve the signed steering axis in [-1, 1] from either a number or buttons.
function inputAxis(input) {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return input > 1 ? 1 : (input < -1 ? -1 : input);
  }
  if (input && typeof input === 'object') {
    if (typeof input.axis === 'number' && Number.isFinite(input.axis)) {
      const a = input.axis; return a > 1 ? 1 : (a < -1 ? -1 : a);
    }
    return (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  }
  return 0;
}

/**
 * Steer + integrate a rail follower by one delta-time step. Pure math; mutates
 * `follower` in place and returns it.
 * @param {{s:number, vel:number, rail?:object}} follower
 * @param {{forward?:boolean, back?:boolean, axis?:number}|number} input
 * @param {number} dt  seconds
 * @param {object} [opts] see DEFAULT_RAIL_FOLLOWER_OPTS + CONTRACTS
 * @returns {object} the same `follower`, now with .lastDir and .point set
 */
export function updateRailFollower(follower, input, dt, opts) {
  if (!follower) return follower;
  const o = resolveFollowerOpts(opts);
  const rail = o.rail || follower.rail || null;
  if (!rail) throw new Error('updateRailFollower: no rail (pass opts.rail or follower.rail)');

  // Clamp dt so a backgrounded tab cannot launch the follower off the rail.
  let d = railNum(dt, 0);
  if (d <= 0) { follower.point = railPointAt(rail, railNum(follower.s, 0)); return follower; }
  if (d > 0.05) d = 0.05;

  // Auto-derive a sensible top speed from the rail length when none is given
  // (mirrors the source's MAXV = len/11, then clamped to a playable band).
  let maxSpeed = o.maxSpeed;
  if (!(maxSpeed > 0)) maxSpeed = Math.max(7, Math.min(42, rail.len / 11));

  const axis = inputAxis(input);          // -1..1, + toward higher s (forward)
  let vel = railNum(follower.vel, 0);
  let s = railNum(follower.s, 0);

  // Velocity smoothly chases the commanded target speed.
  const target = axis * maxSpeed;
  vel += (target - vel) * Math.min(1, d * o.accel);
  // Coast with friction toward rest when there is no steering input.
  if (axis === 0) vel *= Math.pow(o.friction, d);

  s += vel * d;
  // End-of-rail handling: clamp + soft rebound (bounceDamp).
  if (s < 0) { s = 0; vel *= o.bounceDamp; }
  else if (s > rail.len) { s = rail.len; vel *= o.bounceDamp; }

  if (Math.abs(vel) > 0.6) follower.lastDir = vel > 0 ? 1 : -1;
  else if (typeof follower.lastDir !== 'number') follower.lastDir = 1;

  follower.vel = vel;
  follower.s = s;
  follower.point = railPointAt(rail, s);
  return follower;
}

/**
 * Stateful rail follower: owns the rail, the arc-length position + velocity, and
 * an eased camera target so you can wire a globe.gl chase cam in two lines.
 */
export class RailFollower {
  /**
   * @param {object} rail   a rail from buildRail() (required).
   * @param {object} [opts] DEFAULT_RAIL_FOLLOWER_OPTS overrides; persisted.
   */
  constructor(rail, opts = {}) {
    if (!rail || !Array.isArray(rail.coords)) {
      throw new Error('RailFollower: pass a rail from buildRail(coords)');
    }
    this.rail = rail;
    this.opts = Object.assign({}, opts);
    this.s = 0;
    this.vel = 0;
    this.lastDir = 1;
    this.point = railPointAt(rail, 0);
    // Eased camera target (lat/lng). Seeded onto the rail start.
    this.camLat = this.point.lat;
    this.camLng = this.point.lng;
  }

  // Swap to a different rail (e.g. a new level / fault), resetting position.
  setRail(rail, startS = 0) {
    this.rail = rail;
    this.s = Math.max(0, Math.min(rail.len, startS));
    this.vel = 0;
    this.point = railPointAt(rail, this.s);
    this.camLat = this.point.lat;
    this.camLng = this.point.lng;
    return this;
  }

  // Merge in option overrides (maxSpeed/accel/friction/bounceDamp). Returns this.
  configure(partial = {}) { Object.assign(this.opts, partial); return this; }

  // Advance one frame. `input` = { forward, back } | { axis } | signed number.
  update(input, dt, frameOpts) {
    const merged = frameOpts ? Object.assign({}, this.opts, frameOpts) : this.opts;
    merged.rail = this.rail;
    return updateRailFollower(this, input, dt, merged);
  }

  // Forward bearing (deg) at the current position -- orient your vehicle model.
  heading() { return railHeadingAt(this.rail, this.s); }

  /**
   * Ease the stored camera target toward the current rail point (dateline-safe).
   * Returns { lat, lng } ready for globe.pointOfView({...cam, altitude}, ms).
   * @param {number} [t=0.5] lerp factor toward the target this call.
   */
  followCamera(t = 0.5) {
    const p = this.point;
    this.camLat += (p.lat - this.camLat) * t;
    const tl = nearestLng(p.lng, this.camLng);
    this.camLng += (tl - this.camLng) * t;
    return { lat: this.camLat, lng: this.camLng };
  }
}

// END mChatAI Web Component: systems.arc-rail-follower
