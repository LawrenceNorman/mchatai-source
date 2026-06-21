// BEGIN mChatAI Web Component: systems.turret-targeting-3d
//
// Auto-turret combat / fire-control: acquire -> prioritize -> aim-slew ->
// fire-rate-gate -> homing/hitscan -> splash-falloff + slow, with injected
// damage/slow callbacks, coordinate-space-agnostic, delta-time.
//
// This is the core "tower shoots creeps" loop, generalized out of a 3D tower
// defense game and made reusable across tower-defense, twin-stick auto-aim,
// turret-section shooters, RTS attack-move, and base-defense. It is PURE
// delta-time math: NO three.js / WebGL / canvas / DOM / external deps, and it
// owns no GPU/DOM resources (so there is no dispose() to call). It works in any
// coordinate space -- a three.js game drives a turret mesh's rotation.y from
// turret.aim and positions a projectile mesh at {x,y,z}; a 2D game can ignore z.
//
// Nothing is creep-specific. The target LIST, the priority COMPARATOR, the
// DAMAGE callback, and the SLOW callback are all parameters/config, so "target"
// can be a creep, a ship, a unit, an asteroid -- anything with x/y/z and the
// fields your priority/damage functions read. All scaling (dmg / range / rate /
// splash / slow) lives in a stats config; there are no hardcoded balance
// literals.
//
// Pairs with systems.path-follower-3d: the default priority is "furthest along
// path" via target.progress (falling back to target.dist), which is exactly the
// classic tower-defense leak-prevention rule. Swap in nearest / lowestHp / first
// (provided), or any (turret, a, b) -> number comparator of your own.
//
// KEY EXPORTS:
//   pickTarget(turret, stats, targets, priorityFn) -> target | null
//   updateTurret(turret, stats, targets, dt, hooks) -> firedDescriptor | null
//   fire(turret, stats, target, hooks) -> descriptor
//   updateProjectile(proj, dt, hooks) -> 'flying' | 'impact'
//   applySlow(target, slowFactor, duration, hooks)   // injected-callback slow
//   resolveImpact(proj, targets, hooks)              // splash-falloff + slow
//   normalizeStats(stats)                            // clamp/fill a stats config
//   Priority = { furthestAlong, nearest, lowestHp, first }
//
// COORDINATE CONTRACT:
//   A "turret" has { x, y, z, aim }. aim is the heading angle in the XZ plane
//   (radians): aim = atan2(target.z - turret.z, target.x - turret.x). For a
//   three.js mesh use mesh.rotation.y = -turret.aim (or +turret.aim depending on
//   your forward axis). 2D games set z = 0 and read aim directly.
//   A "target" has { x, y, z } plus whatever your priority/damage read. For the
//   default priority it should expose `progress` or `dist` (distance traveled).
//
// HOOKS (injected callbacks -- keeps it non-creep-specific):
//   hooks.damage(target, amount, ctx)   apply damage to one target (REQUIRED to
//                                        deal damage; ctx = { proj, falloff }).
//   hooks.slow(target, slowFactor, dur) apply a slow (optional). If omitted,
//                                        applySlow() mutates target.slowUntil /
//                                        target.slowFactor itself (read those in
//                                        your movement code).
//   hooks.isDead(target) -> bool        skip dead targets (default: t.dead).
//   hooks.now() -> seconds              monotonic clock for slow expiry (default
//                                        an internal accumulator advanced by dt).
//   hooks.muzzle(turret, stats) -> {x,y,z}  barrel-tip spawn point for a
//                                        projectile / beam origin (optional).
//   hooks.onFire(turret, stats, target, descriptor)  cosmetic fire event (sfx,
//                                        muzzle flash) -- optional.
//
// Usage (tower defense, projectile turret):
//   import { updateTurret, updateProjectile, Priority }
//     from './systems/turret-targeting-3d.js';
//   const turret = { x: 3, y: 0, z: 5, aim: 0, cool: 0 };
//   const stats  = { kind: 'projectile', dmg: 20, range: 3, rate: 1.2,
//                    projSpeed: 11, splash: 1.0, splashFalloff: 0.45 };
//   const hooks  = { damage: (t, amt) => { t.hp -= amt; } };
//   const projos = [];
//   // each frame:
//   const shot = updateTurret(turret, stats, creeps, dt, hooks);
//   if (shot) projos.push(shot);                 // shot is a projectile descriptor
//   for (let i = projos.length - 1; i >= 0; i--) {
//     if (updateProjectile(projos[i], dt, { ...hooks, targets: creeps }) === 'impact')
//       projos.splice(i, 1);
//   }
//   // three.js: turretMesh.rotation.y = -turret.aim;
//   //           projMesh.position.set(proj.x, proj.y, proj.z);
//
// Usage (instant hitscan / beam turret):
//   const stats = { kind: 'hitscan', dmg: 34, range: 3.4, rate: 0.85 };
//   const beam  = updateTurret(turret, stats, ships, dt, hooks);
//   if (beam) drawBeam(beam.x0, beam.y0, beam.z0, beam.x1, beam.y1, beam.z1);
//
// CONTRACTS:
//   - Delta-time everywhere; pass real seconds. Caller clamps dt (e.g. <= 0.05).
//   - Pure math, no allocation of GPU/DOM; safe to call thousands of times/frame.
//   - Distances compared with squared math (no sqrt) on the hot acquisition path.
//   - hooks.damage MUST be provided to actually deal damage; everything else is
//     optional with sane defaults.

// --- internal helpers ---------------------------------------------------------

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }
function num(v, fallback) { return isNum(v) ? v : fallback; }
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

// Module-internal monotonic clock used when hooks.now is not supplied. It is
// advanced by updateTurret(dt) so slow expiry works with zero wiring.
let _internalClock = 0;
function _now(hooks) {
  if (hooks && typeof hooks.now === 'function') return hooks.now();
  return _internalClock;
}
function _isDead(target, hooks) {
  if (hooks && typeof hooks.isDead === 'function') return !!hooks.isDead(target);
  return !!target.dead;
}

// Squared XZ distance from a turret to a target (y ignored for acquisition --
// turrets generally range on the ground plane). Targets may omit z (2D).
function _distSq(turret, target) {
  const dx = num(target.x, 0) - num(turret.x, 0);
  const dz = num(target.z, 0) - num(turret.z, 0);
  return dx * dx + dz * dz;
}

// Shortest-arc signed angle from `from` to `to` in (-PI, PI].
function shortestArc(from, to) {
  let d = (to - from + Math.PI * 3) % (Math.PI * 2);
  return d - Math.PI;
}

// --- stats --------------------------------------------------------------------

// Fill/clamp a stats config so callers can pass partials. No balance literals
// are baked in here -- defaults are neutral and only exist so a bare {} works.
export function normalizeStats(stats) {
  const s = stats || {};
  const kind = s.kind === 'hitscan' || s.kind === 'beam' ? 'hitscan' : 'projectile';
  return {
    kind: kind,                                  // 'projectile' (homing) | 'hitscan'
    dmg: Math.max(0, num(s.dmg, 0)),
    range: Math.max(0, num(s.range, 0)),
    rate: Math.max(0, num(s.rate, 0)),           // shots per second
    slewRate: Math.max(0, num(s.slewRate, 10)),  // aim lerp rate (per second)
    projSpeed: Math.max(0, num(s.projSpeed != null ? s.projSpeed : s.speed, 10)),
    splash: Math.max(0, num(s.splash, 0)),       // splash radius (0 = single target)
    splashFalloff: clamp(num(s.splashFalloff, 0), 0, 1), // linear falloff at the rim
    slow: clamp(num(s.slow, 0), 0, 1),           // slow strength (0..1, fraction off speed)
    slowDur: Math.max(0, num(s.slowDur, 0)),     // slow duration (seconds)
    aimArrive: Math.max(0, num(s.aimArrive, 0.06)) // projectile arrival epsilon
  };
}

// --- priority comparators -----------------------------------------------------
// A priorityFn is (turret, a, b) -> number. Return < 0 if `a` is a better
// target than `b`, > 0 if `b` is better, 0 if equal. pickTarget keeps the best.

export const Priority = {
  // Default tower-defense rule: prefer the target FURTHEST along its path, so
  // leak-prevention works. Reads target.progress, then target.dist, then 0.
  furthestAlong: function (turret, a, b) {
    const pa = num(a.progress != null ? a.progress : a.dist, 0);
    const pb = num(b.progress != null ? b.progress : b.dist, 0);
    return pb - pa; // larger progress wins
  },
  // Closest to the turret.
  nearest: function (turret, a, b) {
    return _distSq(turret, a) - _distSq(turret, b);
  },
  // Weakest (lowest current hp) -- good for focus-fire / execute logic.
  lowestHp: function (turret, a, b) {
    return num(a.hp, Infinity) - num(b.hp, Infinity);
  },
  // First seen in the list (stable acquisition).
  first: function () { return 1; }
};

// --- acquisition --------------------------------------------------------------

// Range acquisition over a target list using squared distance, returning the
// best in-range target per `priorityFn` (default Priority.furthestAlong).
export function pickTarget(turret, stats, targets, priorityFn, hooks) {
  if (!targets || targets.length === 0) return null;
  const s = (stats && stats.kind) ? stats : normalizeStats(stats);
  const rangeSq = s.range * s.range;
  const cmp = typeof priorityFn === 'function' ? priorityFn : Priority.furthestAlong;
  let best = null;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (!t || _isDead(t, hooks)) continue;
    if (_distSq(turret, t) > rangeSq) continue;
    if (best === null || cmp(turret, t, best) < 0) best = t;
  }
  return best;
}

// --- firing -------------------------------------------------------------------

// Resolve the muzzle / origin point for a shot. Uses hooks.muzzle if given,
// otherwise the turret's own position offset slightly along its aim.
function _muzzle(turret, stats, hooks) {
  if (hooks && typeof hooks.muzzle === 'function') {
    const m = hooks.muzzle(turret, stats);
    if (m) return { x: num(m.x, turret.x), y: num(m.y, turret.y), z: num(m.z, turret.z) };
  }
  return { x: num(turret.x, 0), y: num(turret.y, 0), z: num(turret.z, 0) };
}

// Fire one shot at `target`. Returns a descriptor.
//   - hitscan/beam: applies damage immediately via hooks.damage and returns a
//     beam descriptor { kind:'hitscan', x0,y0,z0, x1,y1,z1, target, dmg }.
//   - projectile: returns a homing descriptor
//     { kind:'projectile', x,y,z, target, speed, dmg, splash, splashFalloff,
//       slow, slowDur } to feed into updateProjectile().
export function fire(turret, stats, target, hooks) {
  const s = (stats && stats.kind) ? stats : normalizeStats(stats);
  const m = _muzzle(turret, s, hooks);

  if (s.kind === 'hitscan') {
    if (hooks && typeof hooks.damage === 'function' && !_isDead(target, hooks)) {
      hooks.damage(target, s.dmg, { proj: null, falloff: 1 });
    }
    if (s.slow > 0) applySlow(target, s.slow, s.slowDur, hooks);
    const desc = {
      kind: 'hitscan',
      x0: m.x, y0: m.y, z0: m.z,
      x1: num(target.x, 0), y1: num(target.y, 0), z1: num(target.z, 0),
      target: target, dmg: s.dmg
    };
    if (hooks && typeof hooks.onFire === 'function') hooks.onFire(turret, s, target, desc);
    return desc;
  }

  const desc = {
    kind: 'projectile',
    x: m.x, y: m.y, z: m.z,
    // last-known target position (re-tracked each frame in updateProjectile)
    tx: num(target.x, 0), ty: num(target.y, 0), tz: num(target.z, 0),
    target: target,
    speed: s.projSpeed,
    dmg: s.dmg,
    splash: s.splash,
    splashFalloff: s.splashFalloff,
    slow: s.slow,
    slowDur: s.slowDur,
    arrive: s.aimArrive,
    dead: false
  };
  if (hooks && typeof hooks.onFire === 'function') hooks.onFire(turret, s, target, desc);
  return desc;
}

// --- per-frame turret update --------------------------------------------------

// Acquire + prioritize a target, smoothly SLEW the turret's aim toward it
// (shortest-arc, dt-rate lerp), and gate firing on a per-shot cooldown.
// Returns a fire descriptor (from fire()) on the frames a shot goes out, else
// null. The turret keeps tracking even between shots.
//
// Mutates: turret.aim, turret.cool. Reads/writes turret.cool as the cooldown
// timer (initialize to 0 so the turret can fire immediately when armed).
export function updateTurret(turret, stats, targets, dt, hooks) {
  if (!isNum(dt) || dt < 0) dt = 0;
  _internalClock += dt; // advance the default clock used by applySlow expiry

  const s = (stats && stats.kind) ? stats : normalizeStats(stats);
  if (!isNum(turret.aim)) turret.aim = 0;
  if (!isNum(turret.cool)) turret.cool = 0;
  turret.cool -= dt;

  const target = pickTarget(turret, s, targets, hooks && hooks.priority, hooks);
  if (!target) return null;

  // Aim slew: rotate toward the target by an exponential-ish dt-rate lerp,
  // taking the shortest arc so the barrel never spins the long way round.
  const want = Math.atan2(num(target.z, 0) - num(turret.z, 0),
                          num(target.x, 0) - num(turret.x, 0));
  const da = shortestArc(turret.aim, want);
  turret.aim += da * Math.min(1, dt * s.slewRate);

  // Fire-rate gate.
  if (s.rate > 0 && turret.cool <= 0) {
    turret.cool = 1 / s.rate;
    return fire(turret, s, target, hooks);
  }
  return null;
}

// --- projectiles --------------------------------------------------------------

// Advance a homing projectile by dt. Re-tracks the live target each frame
// (homing) and integrates toward it (dx/dist * speed * dt per axis). On arrival
// it resolves impact (single hit OR radial splash + slow) and returns 'impact';
// otherwise returns 'flying'. Mutates proj.x/y/z; sets proj.dead on impact.
//
// hooks.targets is the list used for splash resolution (defaults to []).
export function updateProjectile(proj, dt, hooks) {
  if (proj.dead) return 'impact';
  if (!isNum(dt) || dt < 0) dt = 0;

  // Homing: lock onto the live target while it is alive.
  if (proj.target && !_isDead(proj.target, hooks)) {
    proj.tx = num(proj.target.x, proj.tx);
    proj.ty = num(proj.target.y, proj.ty);
    proj.tz = num(proj.target.z, proj.tz);
  }

  const dx = proj.tx - proj.x;
  const dy = proj.ty - proj.y;
  const dz = proj.tz - proj.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const step = proj.speed * dt;
  const arrive = num(proj.arrive, 0.06);

  if (dist <= step + arrive || dist === 0) {
    proj.dead = true;
    // Snap to the impact point so splash is measured where it actually landed.
    proj.x = proj.tx; proj.y = proj.ty; proj.z = proj.tz;
    resolveImpact(proj, (hooks && hooks.targets) || [], hooks);
    return 'impact';
  }

  const inv = 1 / dist;
  proj.x += dx * inv * step;
  proj.y += dy * inv * step;
  proj.z += dz * inv * step;
  return 'flying';
}

// Resolve a projectile's impact: single-target hit, OR radial splash with
// linear distance falloff, plus optional slow. All damage/slow goes through the
// injected hooks so it is not target-type-specific.
export function resolveImpact(proj, targets, hooks) {
  const dmgCb = hooks && typeof hooks.damage === 'function' ? hooks.damage : null;

  if (proj.splash > 0) {
    const splashSq = proj.splash * proj.splash;
    const rim = clamp(num(proj.splashFalloff, 0), 0, 1); // damage lost at the rim
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (!t || _isDead(t, hooks)) continue;
      const dx = num(t.x, 0) - proj.x;
      const dz = num(t.z, 0) - proj.z;
      const dSq = dx * dx + dz * dz;
      if (dSq > splashSq) continue;
      // Linear falloff: full at center, (1 - rim) at the edge.
      const frac = proj.splash > 0 ? Math.sqrt(dSq) / proj.splash : 0;
      const falloff = 1 - clamp(frac, 0, 1) * rim;
      if (dmgCb) dmgCb(t, proj.dmg * falloff, { proj: proj, falloff: falloff });
      if (proj.slow > 0) applySlow(t, proj.slow, proj.slowDur, hooks);
    }
  } else {
    if (proj.target && !_isDead(proj.target, hooks)) {
      if (dmgCb) dmgCb(proj.target, proj.dmg, { proj: proj, falloff: 1 });
      if (proj.slow > 0) applySlow(proj.target, proj.slow, proj.slowDur, hooks);
    }
  }
}

// --- slow ---------------------------------------------------------------------

// Apply a slow to a target. Stacks DURATION (extends the longer expiry) and
// takes the STRONGER speed multiplier (so two slows don't stack into a freeze).
// If hooks.slow is provided it is delegated to (fully custom slow handling);
// otherwise this mutates target.slowUntil (absolute time) and target.slowFactor
// (a 0..1 speed MULTIPLIER -- read it in your movement code as
// `speed * (now < t.slowUntil ? t.slowFactor : 1)`).
//   slowFactor here is the slow STRENGTH (0..1, fraction of speed removed).
export function applySlow(target, slowStrength, duration, hooks) {
  if (!target || slowStrength <= 0 || duration <= 0) return;
  if (hooks && typeof hooks.slow === 'function') {
    hooks.slow(target, slowStrength, duration);
    return;
  }
  const now = _now(hooks);
  const mult = clamp(1 - slowStrength, 0, 1); // speed multiplier
  target.slowUntil = Math.max(num(target.slowUntil, 0), now + duration);
  target.slowFactor = Math.min(num(target.slowFactor, 1), mult);
}

// Convenience for movement code: the effective speed multiplier right now given
// any active slow on a target (1 when not slowed / expired).
export function slowMultiplier(target, hooks) {
  if (!target) return 1;
  const now = _now(hooks);
  return now < num(target.slowUntil, 0) ? num(target.slowFactor, 1) : 1;
}

// END mChatAI Web Component: systems.turret-targeting-3d
