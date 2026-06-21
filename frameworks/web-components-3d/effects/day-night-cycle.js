// BEGIN mChatAI Web Component: effects.day-night-cycle
//
// Day/Night Cycle Director: time-of-day scalar -> coordinated sun/light/
// sky-gradient/phase, keyframed sky interpolation, golden-hour mix,
// renderer-agnostic, delta-time. A pure-math DIRECTOR (zero rendering): it
// turns a single 0..1 clock into a bundle of plain numbers + arrays that any
// renderer can consume -- three.js DirectionalLight + AmbientLight + Fog, OR a
// 2D-canvas painter drawing a vertical sky gradient. It does NOT draw anything.
//
// Distinct from effects.gradient-skybox (a STATIC three.js gradient mesh) and
// effects.fog-atmosphere (STATIC scene fog): this module is the DYNAMIC source
// that drives those statics over a day. Feed sample().sky into a gradient
// painter, sample().lightDir/lightInt/lightCol into your key light, and
// sample().amb into your ambient floor.
//
// Core algorithm (proven in the Low-Poly Forest diorama):
//  - sun rides a single circular arc from one angle: a = t*2PI - PI/2, so the
//    sun is up at midday (t=0.5) and below the horizon at midnight (t=0/1).
//  - the moon is the antipode of the sun (always opposite in the sky).
//  - day-vs-night is decided by sun altitude with a small horizon hysteresis.
//  - the sky is a MULTI-STOP top/mid/bot RGB gradient interpolated from a SKY[]
//    keyframe table (each row has a normalized time t and three RGB triplets).
//  - the key light warms toward sunrise/sunset (GOLDEN-HOUR shift) as the sun
//    nears the horizon, and cools to moonlight at night.
//  - an AMBIENT floor keeps the scene readable at every hour (never pitch black).
//  - a NIGHT factor (0..1) rises after dusk so the caller can fade stars in.
//    The caller draws the stars; this module only returns the fade factor.
//
// Offline-safe: ZERO imports, ZERO three.js / WebGL / canvas / DOM / network.
// Pure arithmetic -> portable to any engine. ASCII only.
//
// Public API:
//   class DayNightCycle           - the director (construct with {clock, rate, sky}).
//   function defaultSkyKeyframes  - returns a fresh copy of the built-in SKY[] table.
//   function mix3(a, b, f)        - lerp two [r,g,b] (or any 3-vec) arrays.
//   function clamp01(v)           - clamp to 0..1.
//   function norm(v)              - normalize a [x,y,z] vector.
//
// Usage (three.js):
//   import { DayNightCycle } from './effects/day-night-cycle.js';
//   const day = new DayNightCycle({ clock: 0.5, rate: 0.02 });
//   // each frame (dt in seconds):
//   const s = day.advance(dt);                 // or day.sample(slider01) when scrubbing
//   sun.position.set(s.lightDir[0], s.lightDir[1], s.lightDir[2]).multiplyScalar(50);
//   sun.intensity = s.lightInt;
//   sun.color.setRGB(s.lightCol[0]/255, s.lightCol[1]/255, s.lightCol[2]/255);
//   ambient.intensity = s.amb;
//   ambient.color.setRGB(s.ambCol[0]/255, s.ambCol[1]/255, s.ambCol[2]/255);
//   skybox.userData.setColors({ top: rgbHex(s.sky.top), bottom: rgbHex(s.sky.bot) });
//   stars.material.opacity = s.night;          // caller fades its own star field
//
// Usage (2D canvas):
//   const s = day.advance(dt);
//   const g = ctx.createLinearGradient(0, 0, 0, H);
//   g.addColorStop(0, rgb(s.sky.top)); g.addColorStop(0.62, rgb(s.sky.mid));
//   g.addColorStop(1, rgb(s.sky.bot));
//   ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
//   if (s.night > 0.02) drawStars(s.night);    // YOUR star painter
//
// Contracts:
//   - sample(t) is PURE and side-effect free; advance(dt) mutates the internal
//     clock then samples. Either returns the SAME shape (see sample() below).
//   - All angles/state derive from one 0..1 clock; no global time, no Date.
//   - Colors are [r,g,b] in 0..255. Directions are unit [x,y,z]. Scalars 0..1
//     except lightInt (>=0) and hhmm (string "HH:MM").
//   - No GPU/DOM/listeners are owned, so no dispose() is required.

// ---- helpers (exported so renderers can reuse the exact same math) ----

// clamp01(v) -> v clamped to [0,1].
export function clamp01(v) {
  return v < 0 ? 0 : (v > 1 ? 1 : v);
}

// mix3(a, b, f) -> componentwise lerp of two 3-element arrays.
export function mix3(a, b, f) {
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f
  ];
}

// norm(v) -> unit-length copy of [x,y,z] (returns input direction if zero-length).
export function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function clamp(v, a, b) {
  return v < a ? a : (v > b ? b : v);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// defaultSkyKeyframes() -> a fresh, mutable copy of the built-in SKY[] table.
//
// Each row: { t, top:[r,g,b], mid:[r,g,b], bot:[r,g,b] } where t is a 0..1
// time-of-day stop. Rows MUST be sorted by ascending t and SHOULD wrap
// (t=0 and t=1 equal) so midnight is continuous. These are deliberately
// generic (deep blue night -> warm dawn -> blue midday -> warm dusk) and
// carry NO game-specific palette; override via the { sky } constructor opt.
export function defaultSkyKeyframes() {
  return [
    { t: 0.00, top: [8, 10, 26],   mid: [14, 18, 40],   bot: [26, 30, 54] },
    { t: 0.21, top: [26, 28, 60],  mid: [60, 46, 86],   bot: [120, 80, 96] },
    { t: 0.27, top: [86, 120, 182], mid: [210, 150, 150], bot: [255, 176, 120] },
    { t: 0.40, top: [74, 148, 224], mid: [150, 200, 238], bot: [206, 230, 246] },
    { t: 0.50, top: [64, 140, 228], mid: [140, 196, 240], bot: [200, 228, 248] },
    { t: 0.62, top: [78, 146, 222], mid: [156, 196, 232], bot: [226, 214, 196] },
    { t: 0.73, top: [70, 86, 168],  mid: [214, 120, 108], bot: [255, 150, 86] },
    { t: 0.80, top: [36, 34, 78],   mid: [92, 58, 104],   bot: [150, 80, 110] },
    { t: 0.88, top: [14, 16, 42],   mid: [26, 28, 58],    bot: [40, 38, 70] },
    { t: 1.00, top: [8, 10, 26],    mid: [14, 18, 40],    bot: [26, 30, 54] }
  ];
}

// Sample the multi-stop sky gradient at a 0..1 time from a keyframe table.
function skyColorsFrom(table, t) {
  const last = table.length - 1;
  let A = table[0];
  let B = table[last];
  for (let i = 0; i < last; i++) {
    if (t >= table[i].t && t <= table[i + 1].t) {
      A = table[i];
      B = table[i + 1];
      break;
    }
  }
  const span = (B.t - A.t) || 1;
  const f = clamp01((t - A.t) / span);
  return {
    top: mix3(A.top, B.top, f),
    mid: mix3(A.mid, B.mid, f),
    bot: mix3(A.bot, B.bot, f)
  };
}

// Lightly validate one keyframe row, falling back to a safe neutral on bad input.
function sanitizeKeyframe(row) {
  function rgb(c) {
    if (!Array.isArray(c) || c.length < 3) return [128, 128, 128];
    return [
      clamp(isFiniteNumber(c[0]) ? c[0] : 128, 0, 255),
      clamp(isFiniteNumber(c[1]) ? c[1] : 128, 0, 255),
      clamp(isFiniteNumber(c[2]) ? c[2] : 128, 0, 255)
    ];
  }
  return {
    t: clamp01(isFiniteNumber(row && row.t) ? row.t : 0),
    top: rgb(row && row.top),
    mid: rgb(row && row.mid),
    bot: rgb(row && row.bot)
  };
}

// DayNightCycle: the time-of-day director.
//
// opts:
//   clock  initial time-of-day, 0..1 (0/1 = midnight, 0.5 = midday). Default 0.5.
//   rate   auto-advance speed in cycles-per-second for advance(dt). At 0.02 a
//          full day spans ~50 seconds of wall time. Default 0.02. Set 0 to
//          freeze and scrub via the `clock` property / sample(t).
//   sky    optional SKY[] keyframe table (see defaultSkyKeyframes). Each row is
//          sanitized and re-sorted by t; pass your own palette here -- the
//          module never hardcodes a game-specific look beyond the default table.
//   tilt   sun-arc Z offset so the arc is not perfectly edge-on (a flat 0 makes
//          sun + moon trace the same screen line). Default 0.42, clamped 0..1.
//   horizon  sun-altitude threshold (in sin units) below which it becomes night.
//            Small negative keeps a touch of light right at the horizon.
//            Default -0.04.
export class DayNightCycle {
  constructor(opts = {}) {
    const o = opts || {};
    this.timeOfDay = clamp01(isFiniteNumber(o.clock) ? o.clock : 0.5);
    this.rate = isFiniteNumber(o.rate) ? o.rate : 0.02;
    this.tilt = clamp(isFiniteNumber(o.tilt) ? o.tilt : 0.42, 0, 1);
    this.horizon = isFiniteNumber(o.horizon) ? o.horizon : -0.04;

    let table = Array.isArray(o.sky) && o.sky.length >= 2
      ? o.sky.map(sanitizeKeyframe)
      : defaultSkyKeyframes();
    table.sort((a, b) => a.t - b.t);
    this.sky = table;
  }

  // Replace the SKY[] keyframe table at runtime (e.g. a weather/biome swap).
  // Rows are sanitized and re-sorted; returns this for chaining.
  setKeyframes(table) {
    if (Array.isArray(table) && table.length >= 2) {
      const next = table.map(sanitizeKeyframe);
      next.sort((a, b) => a.t - b.t);
      this.sky = next;
    }
    return this;
  }

  // advance(dt) -> sample bundle.
  // Auto-advance the clock by delta-time (seconds), wrapping at 1.0, then
  // sample. Negative rate runs the day backward. dt is clamped to a sane frame
  // so a long stall (tab backgrounded) cannot warp the clock by hours.
  advance(dt) {
    let step = isFiniteNumber(dt) ? dt : 0;
    if (step > 0.05) step = 0.05;
    if (step < -0.05) step = -0.05;
    let t = (this.timeOfDay + step * this.rate) % 1;
    if (t < 0) t += 1;
    this.timeOfDay = t;
    return this.sample(this.timeOfDay);
  }

  // Convenience: jump the clock to an absolute 0..1 time (slider scrub), then
  // sample. Same shape as sample(). Does NOT auto-advance.
  setClock(t) {
    this.timeOfDay = clamp01(isFiniteNumber(t) ? t : this.timeOfDay);
    return this.sample(this.timeOfDay);
  }

  // sample(t) -> coordinated lighting + sky + phase bundle for time t (0..1).
  // PURE: does not touch internal state. Pass nothing to sample the current
  // clock. Returned fields:
  //   sunDir, moonDir  unit [x,y,z] arc directions (moon = sun antipode).
  //   lightDir         the active key-light direction (sun by day, moon by night).
  //   lightInt         key-light intensity, >=0 (peaks at midday, dim at night).
  //   lightCol         key-light color [r,g,b] 0..255, warm near the horizon.
  //   amb / ambCol     ambient floor intensity (0..1) + color -- never goes dark.
  //   sky:{top,mid,bot} multi-stop sky gradient colors [r,g,b] 0..255.
  //   night            0..1 star/darkness fade factor (caller draws stars).
  //   isDay            boolean day-vs-night state.
  //   dayStr           0..1 "how high is the sun" strength (0 at/under horizon).
  //   sunAlt           raw sun altitude, -1..1 (sin of arc angle).
  //   phaseLabel       "Sunrise" | "Morning" | "Midday" | "Afternoon" |
  //                    "Sunset" | "Night".
  //   hhmm             "HH:MM" 24h clock string for the sampled time.
  //   t                the 0..1 time that was sampled.
  sample(t) {
    const tod = clamp01(isFiniteNumber(t) ? t : this.timeOfDay);

    // Single-angle arc: sun up at midday, below horizon at midnight.
    const a = tod * Math.PI * 2 - Math.PI / 2;
    const sunAlt = Math.sin(a);
    const sunDir = norm([Math.cos(a), Math.sin(a), this.tilt]);
    const moonDir = norm([-Math.cos(a), -Math.sin(a), this.tilt]);

    const isDay = sunAlt > this.horizon;
    // dayStr: how strongly the sun lights things once above the horizon.
    const dayStr = clamp01((sunAlt + 0.12) / 0.55);
    // night: rises after dusk so the caller can fade stars in.
    const night = 1 - clamp01((sunAlt + 0.06) / 0.22);

    const lightDir = isDay ? sunDir : moonDir;
    const lightInt = isDay ? (0.32 + 0.62 * dayStr) : 0.30;

    let lightCol = isDay ? [255, 247, 228] : [150, 176, 225];
    // GOLDEN HOUR: warm-shift the key light as the sun nears the horizon.
    if (isDay && sunAlt < 0.32) {
      const w = 1 - clamp01(sunAlt / 0.32);
      lightCol = mix3(lightCol, [255, 150, 80], w * 0.8);
    }

    // AMBIENT FLOOR: keeps every face readable at every hour (the core goal).
    const amb = isDay ? (0.42 + 0.16 * dayStr) : 0.47;
    const ambCol = isDay ? [248, 244, 236] : [120, 140, 185];

    const sky = skyColorsFrom(this.sky, tod);

    return {
      t: tod,
      sunDir, moonDir, lightDir, lightInt, lightCol,
      amb, ambCol, sky, night, isDay, dayStr, sunAlt,
      phaseLabel: phaseLabelFor(tod, sunAlt),
      hhmm: hhmmFor(tod)
    };
  }
}

// Human-readable phase from time + sun altitude (matches the source's HUD logic).
function phaseLabelFor(tod, sunAlt) {
  if (sunAlt > 0.35) return 'Midday';
  if (sunAlt > 0.04) return tod < 0.5 ? 'Morning' : 'Afternoon';
  if (sunAlt > -0.12) return tod < 0.5 ? 'Sunrise' : 'Sunset';
  return 'Night';
}

// "HH:MM" 24h clock from a 0..1 time-of-day.
function hhmmFor(tod) {
  const mins = ((Math.round(tod * 1440) % 1440) + 1440) % 1440;
  const hh = ('0' + Math.floor(mins / 60)).slice(-2);
  const mm = ('0' + (mins % 60)).slice(-2);
  return hh + ':' + mm;
}

// END mChatAI Web Component: effects.day-night-cycle
