// BEGIN mChatAI Web Component: systems.kinematic-body-3d
//
// Shared substep physics for control games (kart / marble / ball / pinball /
// mini-golf). PURE math — NO three.js, NO WebGL, NO DOM, NO external deps.
// Operates on plain arrays/numbers/objects so it drops into a three.js game,
// a raw-WebGL game, or a Node test harness unchanged, and is trivially
// offline-safe.
//
// This is the swept-collision + rolling core that the labyrinth-3d ("ball in a
// tilting maze") and marble-run-3d ("gravity track + funnel/basin") builds both
// re-derived from scratch. Extracted + generalized so future control games
// (kart-racer, ball-maze, marble-run, mini-golf, pinball) import it instead of
// re-inventing tunneling-free integration every time.
//
// THE THREE PROVEN IDEAS, generalized:
//   1. stepKinematic()  — advance a body in N substeps so a fast body never
//      tunnels through a thin wall (the labyrinth `ceil(dist / (R*0.5))` trick,
//      with marble-run's fixed-substep option). Substep count auto-scales with
//      speed; you supply a per-substep collision callback.
//   2. sphereVsAABB() / sphereVsAABBs() — nearest-point sphere-vs-box resolver
//      that pushes the body out along the contact normal and reflects ONLY the
//      approaching component of velocity (so it slides along surfaces instead of
//      stopping dead), with restitution + tangential friction.
//   3. rollingQuaternion() — the labyrinth/marble ball-roll: spin axis is
//      perpendicular to travel in the ground plane, angle = distance / radius.
//      Returns a plain [x,y,z,w] you feed to THREE.Quaternion / mat3.
//
// USAGE (three.js marble / ball-maze)
//   import { stepKinematic, sphereVsAABBs, rollingQuaternion }
//     from './kinematic-body-3d.js';
//
//   const walls = [/* { min:[x,y,z], max:[x,y,z] } */];
//   const body  = { pos:[0, 0.5, 0], vel:[0, 0, 0], radius:0.5 };
//
//   function frame(dt){
//     // gravity projected onto a tilted board, friction, etc. set body.vel first
//     const prev = body.pos.slice();
//     stepKinematic(body, dt, {
//       gravity: [g.x, g.y, g.z], maxSpeed: 16,
//       collide: (b) => sphereVsAABBs(b.pos, b.radius, walls, {
//         vel: b.vel, restitution: 0, friction: 0.12,
//       }),
//     });
//     mesh.position.set(body.pos[0], body.pos[1], body.pos[2]);
//     const q = rollingQuaternion(prev, body.pos, body.radius);
//     mesh.quaternion.premultiply(new THREE.Quaternion(q[0], q[1], q[2], q[3]));
//   }
//
// USAGE (raw WebGL / Node test)
//   stepKinematic(body, dt, { gravity:[0,-22,0], substeps:6 });
//   // body.pos / body.vel are now advanced; build your own transform from them.
//
// A `body` is { pos:[x,y,z], vel:[x,y,z], radius:Number }. Everything is plain
// arrays of numbers; nothing is allocated per-substep beyond tiny scratch.

// ---------- small vec3 helpers (kept private, dependency-free) ----------
function _len(x, y, z) { return Math.sqrt(x * x + y * y + z * z); }
function _clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

/**
 * Advance a kinematic body by `dt` seconds using N substeps so a fast body
 * cannot tunnel through thin geometry. Applies gravity to `body.vel`, clamps to
 * `maxSpeed`, then integrates position in equal substeps, invoking `collide`
 * after EACH substep (mutate `body.pos` / `body.vel` in the callback to resolve
 * contacts). Generalizes labyrinth-3d's speed-scaled substep count and
 * marble-run-3d's fixed substep loop.
 *
 * @param {{pos:number[], vel:number[], radius:number}} body  mutated in place
 * @param {number} dt  frame delta in seconds (clamp upstream, e.g. min 1/30)
 * @param {object} [opts]
 * @param {number[]} [opts.gravity=[0,0,0]]  world gravity added to vel (units/s^2)
 * @param {number} [opts.substeps]  force a fixed substep count (>=1). If omitted,
 *        the count auto-scales with travel distance so each substep moves at most
 *        ~half a radius (the labyrinth no-tunnel rule).
 * @param {number} [opts.maxSpeed]  clamp |vel| before integrating (units/s)
 * @param {number} [opts.maxSubsteps=32]  safety cap on auto-scaled substeps
 * @param {(body:object, substepIndex:number)=>void} [opts.collide]  resolver run
 *        after each substep; mutate body.pos / body.vel to push out + slide.
 * @returns {{substeps:number, distance:number}}  diagnostics for the frame
 */
export function stepKinematic(body, dt, opts = {}) {
  const g = opts.gravity || [0, 0, 0];
  const v = body.vel;

  // gravity
  v[0] += g[0] * dt;
  v[1] += g[1] * dt;
  v[2] += g[2] * dt;

  // optional speed clamp (prevents the integrator from outrunning collision)
  if (opts.maxSpeed != null) {
    const sp = _len(v[0], v[1], v[2]);
    if (sp > opts.maxSpeed && sp > 1e-9) {
      const k = opts.maxSpeed / sp;
      v[0] *= k; v[1] *= k; v[2] *= k;
    }
  }

  const speed = _len(v[0], v[1], v[2]);
  const distance = speed * dt;

  // substep count: explicit, or auto-scaled so no substep moves > ~half radius
  let steps;
  if (opts.substeps != null) {
    steps = Math.max(1, opts.substeps | 0);
  } else {
    const maxStep = Math.max(1e-4, body.radius * 0.5);
    const cap = opts.maxSubsteps != null ? Math.max(1, opts.maxSubsteps | 0) : 32;
    steps = Math.min(cap, Math.max(1, Math.ceil(distance / maxStep)));
  }

  const sdt = dt / steps;
  const collide = opts.collide;
  const p = body.pos;
  for (let i = 0; i < steps; i++) {
    // re-read vel each substep — the collide callback may have changed it
    p[0] += v[0] * sdt;
    p[1] += v[1] * sdt;
    p[2] += v[2] * sdt;
    if (collide) collide(body, i);
  }

  return { substeps: steps, distance };
}

/**
 * Resolve a sphere against a single axis-aligned box. Uses the nearest-point-on-
 * box test (clamp the center into the box, measure the gap). On overlap it
 * returns the contact normal (pointing from box surface toward the sphere center)
 * and penetration depth. Degenerate case (center inside the box) falls back to
 * the minimal-axis push-out, exactly like the labyrinth wall resolver.
 *
 * This is a PURE query — it does not mutate anything. Use the returned
 * {hit, normal, depth} to push the body out and reflect velocity (see
 * sphereVsAABBs for the full resolve), or roll your own response.
 *
 * @param {number[]} center  sphere center [x,y,z]
 * @param {number} radius
 * @param {{min:number[], max:number[]}} box  AABB in world space
 * @returns {{hit:boolean, normal:number[], depth:number}}  normal is unit-length
 *          on a hit; depth is the push-out distance (>= 0). On a miss returns
 *          {hit:false, normal:[0,0,0], depth:0}.
 */
export function sphereVsAABB(center, radius, box) {
  const min = box.min, max = box.max;
  // nearest point on the box to the sphere center
  const nx = _clamp(center[0], min[0], max[0]);
  const ny = _clamp(center[1], min[1], max[1]);
  const nz = _clamp(center[2], min[2], max[2]);

  let dx = center[0] - nx;
  let dy = center[1] - ny;
  let dz = center[2] - nz;
  const d2 = dx * dx + dy * dy + dz * dz;

  if (d2 >= radius * radius) {
    return { hit: false, normal: [0, 0, 0], depth: 0 };
  }

  const d = Math.sqrt(d2);
  if (d > 1e-6) {
    // center is outside the box: normal is the gap direction
    const inv = 1 / d;
    return { hit: true, normal: [dx * inv, dy * inv, dz * inv], depth: radius - d };
  }

  // center is INSIDE the box: pick the axis with the smallest exit distance and
  // push out along it (labyrinth's degenerate-center branch, extended to 3D).
  const ox = Math.min(center[0] - min[0], max[0] - center[0]);
  const oy = Math.min(center[1] - min[1], max[1] - center[1]);
  const oz = Math.min(center[2] - min[2], max[2] - center[2]);
  const cx = (min[0] + max[0]) * 0.5;
  const cy = (min[1] + max[1]) * 0.5;
  const cz = (min[2] + max[2]) * 0.5;
  let normal;
  let depth;
  if (ox <= oy && ox <= oz) {
    normal = [center[0] >= cx ? 1 : -1, 0, 0];
    depth = ox + radius;
  } else if (oy <= ox && oy <= oz) {
    normal = [0, center[1] >= cy ? 1 : -1, 0];
    depth = oy + radius;
  } else {
    normal = [0, 0, center[2] >= cz ? 1 : -1];
    depth = oz + radius;
  }
  return { hit: true, normal, depth };
}

/**
 * Sweep a sphere against many AABBs and resolve every contact: push the center
 * out along each contact normal, then reflect ONLY the inbound component of
 * velocity so the body SLIDES along the surface instead of stopping dead (the
 * `if (vd < 0)` rule from labyrinth's `collide()` / marble-run's basin). Applies
 * restitution to the reflected normal velocity and a tangential friction factor.
 *
 * For grid worlds (ball-maze, pinball bumpers), build the `boxes` list from just
 * the 3x3 neighborhood around the body each frame — this function only does the
 * narrow-phase, so feeding it the local neighborhood keeps it O(1).
 *
 * MUTATES `center` (push-out) and, when `opts.vel` is supplied, that velocity
 * array (reflect/slide). Returns whether any contact occurred.
 *
 * @param {number[]} center  sphere center [x,y,z] — mutated in place
 * @param {number} radius
 * @param {Array<{min:number[], max:number[]}>} boxes
 * @param {object} [opts]
 * @param {number[]} [opts.vel]  velocity [x,y,z] — mutated in place if given
 * @param {number} [opts.restitution=0]  0 = no bounce (slide), 1 = perfect bounce
 * @param {number} [opts.friction=0]  tangential damping on contact (0..1), e.g.
 *        labyrinth used ~0.12 (it multiplied tangential speed by 0.88)
 * @returns {{hit:boolean, count:number, normal:number[]}}  normal is the last
 *          contact normal (handy for ground checks); count = contacts resolved.
 */
export function sphereVsAABBs(center, radius, boxes, opts = {}) {
  const vel = opts.vel || null;
  const e = opts.restitution != null ? opts.restitution : 0;
  const fric = opts.friction != null ? opts.friction : 0;
  const keep = 1 - _clamp(fric, 0, 1);
  let hit = false;
  let count = 0;
  let lastN = [0, 0, 0];

  for (let i = 0; i < boxes.length; i++) {
    const res = sphereVsAABB(center, radius, boxes[i]);
    if (!res.hit) continue;
    hit = true;
    count++;
    lastN = res.normal;
    const n = res.normal;

    // push the sphere out of the box
    center[0] += n[0] * res.depth;
    center[1] += n[1] * res.depth;
    center[2] += n[2] * res.depth;

    if (!vel) continue;

    // split velocity into normal + tangential; only respond if approaching
    const vn = vel[0] * n[0] + vel[1] * n[1] + vel[2] * n[2];
    if (vn < 0) {
      // remove the inbound normal component, then add back a bounce
      const j = (1 + e) * vn;
      vel[0] -= j * n[0];
      vel[1] -= j * n[1];
      vel[2] -= j * n[2];
      // tangential friction: damp whatever is left (it's now purely tangential
      // along this normal) — gives the slide-but-bleed-speed feel of the source.
      if (keep < 1) {
        vel[0] *= keep;
        vel[1] *= keep;
        vel[2] *= keep;
      }
    }
  }

  return { hit, count, normal: lastN };
}

/**
 * Rolling-ball orientation delta: the quaternion that spins a sphere of `radius`
 * to match how far it travelled from `prevPos` to `pos` along the ground plane.
 * Spin axis is perpendicular to the horizontal travel direction (so the ball
 * rolls "forward"); angle = horizontal distance / radius. This is the exact
 * labyrinth/marble-run roll, generalized to either XZ-ground (default, Y up) or
 * XY-ground (Z up).
 *
 * PREMULTIPLY the result onto the mesh's current orientation each frame to
 * accumulate roll: `q_new = q_delta * q_current`. Returns identity [0,0,0,1]
 * when the body barely moved (avoids NaN / jitter).
 *
 * @param {number[]} prevPos  position last frame [x,y,z]
 * @param {number[]} pos      position this frame [x,y,z]
 * @param {number} radius     sphere radius (> 0)
 * @param {object} [opts]
 * @param {'y'|'z'} [opts.up='y']  which axis is "up" (ground plane normal)
 * @returns {number[]}  quaternion [x,y,z,w] (premultiply onto current rotation)
 */
export function rollingQuaternion(prevPos, pos, radius, opts = {}) {
  const up = opts.up === 'z' ? 'z' : 'y';
  let dx, dGround, ax, ay, az;

  if (up === 'z') {
    // ground = XY plane, +Z up. Travel in XY; axis perpendicular in-plane.
    const mx = pos[0] - prevPos[0];
    const my = pos[1] - prevPos[1];
    dGround = Math.sqrt(mx * mx + my * my);
    if (dGround < 1e-6 || radius <= 1e-9) return [0, 0, 0, 1];
    // axis perpendicular to (mx,my) in the plane: rotate 90deg -> (-my, mx)
    ax = -my / dGround;
    ay = mx / dGround;
    az = 0;
  } else {
    // ground = XZ plane, +Y up (the labyrinth / marble-run case).
    const mx = pos[0] - prevPos[0];
    const mz = pos[2] - prevPos[2];
    dGround = Math.sqrt(mx * mx + mz * mz);
    if (dGround < 1e-6 || radius <= 1e-9) return [0, 0, 0, 1];
    // axis = (-vz, 0, vx) normalized — perpendicular to travel in XZ
    ax = -mz / dGround;
    ay = 0;
    az = mx / dGround;
  }

  const angle = dGround / radius;          // arc length / radius = roll angle
  const half = angle * 0.5;
  const s = Math.sin(half);
  return [ax * s, ay * s, az * s, Math.cos(half)];
}

// END mChatAI Web Component: systems.kinematic-body-3d
