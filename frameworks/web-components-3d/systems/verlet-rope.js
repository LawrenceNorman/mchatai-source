// BEGIN mChatAI Web Component: systems.verlet-rope
//
// A 2D VERLET ROPE / CHAIN: an array of point-masses linked by distance
// constraints, integrated with position-based Verlet (no per-node velocity
// vector -- velocity is implied by current - previous position). One simple
// primitive covers a LOT of game furniture:
//   - a swinging rope hung from a ceiling anchor
//   - a heavy chain or a wrecking-ball flail (weight the last node)
//   - a slack hanging bridge / tightrope (pin BOTH ends)
//   - a whippy cloth strip / banner / seaweed / tentacle (pin one end)
//   - a grappling line the player can GRAB, swing on, and slingshot from
//
// Each node is a PLAIN object { x, y, ox, oy, pin?, mass? }:
//   x, y    current position (you read these to draw / collide)
//   ox, oy  previous position (Verlet remembers velocity here -- do NOT set
//           x/y directly to teleport a node; use setNode() so velocity stays
//           sane, or accept a one-frame velocity spike)
//   pin     truthy => this node is held fixed (anchor). Optional.
//   mass    relative mass (default 1). Heavier nodes move less under a shared
//           constraint. A wrecking ball = a big mass on the last node.
//
// PURE 2D Verlet math: no p5, no three.js, no canvas, no DOM, no external
// deps. The CALLER owns rendering -- walk rope.nodes and draw a polyline /
// quad strip yourself. DELTA-TIME based: motion is the same at 30 or 144 fps.
// Kept deliberately SEPARATE from systems.softbody-blob (a closed pressurised
// ring) so the two compose -- a blob can GRAB a rope (see attach()).
//
// Stability note: Verlet ropes are stiffened by ITERATING the distance
// constraints several times per step (constraintIterations). More links or a
// heavier end node => more iterations for a taut look. Gravity, damping and
// gravity are scaled to a 60fps reference internally so tuning is fps-stable.
//
// Exports:
//   makeRope(opts)                build a rope { nodes, segLen, ... }
//   stepRope(rope, dt, opts)      functional one-shot integrate+constrain step
//   makeCloth(opts)               build a 1D cloth/banner strip (pin one edge)
//   nearestNode(rope, x, y, max)  find the closest grabbable node to a point
//   ropeLength(rope)              current summed length (slack vs taut)
//   setNode(node, x, y, keepVel)  safely move a node (manages ox/oy)
//   VerletRope                    stateful wrapper: holds opts + attachments,
//                                 exposes attach()/detach()/grab nearest()
//   DEFAULT_ROPE_OPTS             tunable defaults (read-only reference)
//
// Usage (a rope hung from the ceiling that you can grab and swing on):
//   import { makeRope, stepRope, nearestNode } from './systems/verlet-rope.js';
//   const rope = makeRope({ x: 400, y: 80, length: 260, count: 12, pinHead: true });
//   // each frame:
//   stepRope(rope, dt, { gravity: 900 });
//   // draw:
//   ctx.beginPath();
//   ctx.moveTo(rope.nodes[0].x, rope.nodes[0].y);
//   for (const n of rope.nodes) ctx.lineTo(n.x, n.y);
//   ctx.stroke();
//   // grab:
//   const hit = nearestNode(rope, player.x, player.y, 40);
//   if (grabPressed && hit) player.held = hit;          // then pull player to hit each frame
//
// Usage (a wrecking-ball flail: heavy weighted end):
//   const flail = makeRope({ x: 300, y: 100, length: 180, count: 7, pinHead: true });
//   flail.nodes[flail.nodes.length - 1].mass = 8;       // the ball
//   flail.nodes[flail.nodes.length - 1].ox -= 6;        // give it a swing
//   stepRope(flail, dt, { gravity: 1100, constraintIterations: 10 });
//
// Usage (a slack hanging bridge -- pin both ends):
//   const bridge = makeRope({ x: 100, y: 200, x2: 500, y2: 200, count: 16,
//                             pinHead: true, pinTail: true, slack: 1.25 });
//   stepRope(bridge, dt, { gravity: 700 });             // walk a body on bridge.nodes
//
// Usage (stateful, with a grab/slingshot grapple coupling an external body):
//   const rope = new VerletRope({ x: 400, y: 60, length: 240, count: 12, pinHead: true });
//   // on grab: bind the nearest node to the player's centroid:
//   rope.grabNearest(player.x, player.y, 40, player /* { x, y } */, { rest: 12, pull: 0.8 });
//   // each frame the wrapper integrates AND applies the attachment:
//   rope.update(dt, { gravity: 900 });
//   // on release: rope.release();  // returns the node's recent upward velocity for scoring
//
// Contracts:
//   - makeRope(opts) returns { nodes:[{x,y,ox,oy,pin,mass}], segLen, headPinned,
//     tailPinned }. nodes[0] is the head, nodes[last] is the tail.
//       x, y           : head anchor position (required)
//       x2, y2         : OPTIONAL tail anchor. If given, the rope spans head->tail
//                        as a straight line and length is auto-derived (* slack).
//       length         : rope length when x2/y2 are NOT given. Default 200.
//       count          : node count (>= 2). Default 12.
//       angle          : hang direction in radians when only head is given
//                        (default Math.PI/2 = straight down).
//       slack          : multiplies segLen so a both-ends rope can droop
//                        (>1 = slack bridge, 1 = taut). Default 1.
//       pinHead/pinTail: pin the first/last node. Default pinHead:true.
//   - stepRope(rope, dt, opts): integrates every non-pinned node with Verlet,
//     then relaxes the chain distance constraints constraintIterations times.
//     Mutates rope.nodes in place; returns the same rope. dt is seconds.
//   - opts (all optional, merged over DEFAULT_ROPE_OPTS):
//       gravity              : downward accel (units/s^2). Default 900.
//       damping              : per-frame velocity retention at 60fps (air
//                              drag). 1 = none, 0.98 = light. Default 0.99.
//       constraintIterations : relaxation passes per step (stiffness). Default 8.
//       stiffness            : 0..1 fraction of each constraint correction
//                              applied per pass. Default 1 (rigid links).
//       maxStretch           : if > 0, hard-clamps each link to at most
//                              segLen*maxStretch after relaxation (prevents the
//                              "exploding rope" on a big dt). Default 0 (off).
//       wind                 : horizontal accel (units/s^2), e.g. for banners.
//       bounds               : { minX, maxX, minY, maxY } optional hard walls
//                              that nodes bounce off (floor for a chain). Any
//                              missing side is unbounded.
//       bounce               : restitution off bounds (0..1). Default 0.3.
//       pinAt                : OPTIONAL { 0: {x,y}, 12: {x,y}, ... } map that
//                              re-pins specific node indices to a live position
//                              this frame (a moving anchor / hand). Overrides
//                              the node's own pin for that frame.
//   - Attachments (external bodies coupled to a rope node) are applied by the
//     VerletRope wrapper, OR you can apply them yourself between integrate and
//     the next step using applyAttachment() exported logic inline. See grabNearest.
//   - Renderer-agnostic: this module never touches the DOM/canvas/GPU and owns
//     nothing to dispose -- there is intentionally no dispose().
//   - 2D only by design. For a fully-3D rope, run two of these on (x,y) and
//     (z) planes, or adapt -- the math is axis-symmetric.

export const DEFAULT_ROPE_OPTS = Object.freeze({
  gravity: 900,
  damping: 0.99,
  constraintIterations: 8,
  stiffness: 1,
  maxStretch: 0,
  wind: 0,
  bounce: 0.3
});

function num(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

// Resolve effective options by layering caller opts over the defaults.
function resolveOpts(opts) {
  const o = {};
  for (const k in DEFAULT_ROPE_OPTS) o[k] = DEFAULT_ROPE_OPTS[k];
  if (opts) {
    for (const k in DEFAULT_ROPE_OPTS) {
      if (k in opts) o[k] = num(opts[k], o[k]);
    }
    o.bounds = opts.bounds && typeof opts.bounds === 'object' ? opts.bounds : null;
    o.pinAt = opts.pinAt && typeof opts.pinAt === 'object' ? opts.pinAt : null;
  } else {
    o.bounds = null;
    o.pinAt = null;
  }
  if (o.constraintIterations < 1) o.constraintIterations = 1;
  return o;
}

/**
 * Build a rope / chain of Verlet point-masses.
 * @param {object} opts see the makeRope contract above
 * @returns {{nodes:Array, segLen:number, headPinned:boolean, tailPinned:boolean}}
 */
export function makeRope(opts = {}) {
  const x = num(opts.x, 0);
  const y = num(opts.y, 0);
  const count = Math.max(2, Math.floor(num(opts.count, 12)));
  const slack = num(opts.slack, 1);
  const pinHead = opts.pinHead !== false;       // default true
  const pinTail = opts.pinTail === true;        // default false

  const hasTail = typeof opts.x2 === 'number' && typeof opts.y2 === 'number';
  let dirX, dirY, span;
  if (hasTail) {
    const x2 = num(opts.x2, x);
    const y2 = num(opts.y2, y);
    const dx = x2 - x, dy = y2 - y;
    span = Math.sqrt(dx * dx + dy * dy) || 0.001;
    dirX = dx / span;
    dirY = dy / span;
  } else {
    const length = num(opts.length, 200);
    const angle = num(opts.angle, Math.PI / 2); // default straight down
    span = length;
    dirX = Math.cos(angle);
    dirY = Math.sin(angle);
  }

  // segLen is the REST length of each link. slack > 1 makes a both-ends rope droop.
  const segLen = (span / (count - 1)) * (slack > 0 ? slack : 1);

  const nodes = [];
  for (let i = 0; i < count; i++) {
    // Lay nodes out along the (possibly slack) span. We place them along the
    // straight span direction; gravity then makes a slack rope sag naturally.
    const t = i * (span / (count - 1));
    const px = x + dirX * t;
    const py = y + dirY * t;
    const node = { x: px, y: py, ox: px, oy: py, pin: false, mass: 1 };
    nodes.push(node);
  }
  if (pinHead) nodes[0].pin = true;
  if (pinTail) nodes[count - 1].pin = true;

  return { nodes, segLen, headPinned: pinHead, tailPinned: pinTail };
}

/**
 * Build a 1D "cloth"/banner strip: a rope pinned along one edge that flaps in
 * wind. (For a full 2D cloth grid, run several of these and add cross links --
 * intentionally out of scope to keep this lego small; compose, don't bloat.)
 * @param {object} opts like makeRope, but pinHead defaults true, pinTail false
 *   and `wind` is expected at step time. Convenience wrapper.
 */
export function makeCloth(opts = {}) {
  return makeRope(Object.assign({ pinHead: true, pinTail: false, slack: 1.02 }, opts));
}

/**
 * Safely set a node's position. By default it preserves Verlet velocity by
 * shifting ox/oy with x/y (a smooth move). Pass keepVel=false to teleport
 * (zeroes velocity -- ox/oy snap to the new position).
 */
export function setNode(node, x, y, keepVel = true) {
  if (!node) return;
  if (keepVel) {
    const vx = node.x - node.ox;
    const vy = node.y - node.oy;
    node.x = x; node.y = y;
    node.ox = x - vx; node.oy = y - vy;
  } else {
    node.x = x; node.y = y;
    node.ox = x; node.oy = y;
  }
}

/**
 * Current total length of the rope (sum of link distances). Compare against
 * segLen*(count-1) to detect slack (shorter) vs over-stretch (longer).
 */
export function ropeLength(rope) {
  const nd = rope && rope.nodes;
  if (!nd || nd.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < nd.length - 1; i++) {
    const a = nd[i], b = nd[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

/**
 * Find the node nearest to (x, y) within maxDist (grab targeting). Skips
 * pinned anchors by default so a grapple latches a swingable mid-rope point,
 * not the fixed ceiling mount. Pass includePinned:true to allow anchors.
 * @returns {{node, index, dist}|null}
 */
export function nearestNode(rope, x, y, maxDist = Infinity, includePinned = false) {
  const nd = rope && rope.nodes;
  if (!nd || nd.length === 0) return null;
  let best = null, bestD = maxDist;
  for (let i = 0; i < nd.length; i++) {
    const n = nd[i];
    if (!n) continue;
    if (n.pin && !includePinned) continue;
    const dx = n.x - x, dy = n.y - y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < bestD) { bestD = d; best = { node: n, index: i, dist: d }; }
  }
  return best;
}

// Mass-weighted split of a distance correction between two nodes. A pinned
// node never moves (weight 0); otherwise lighter nodes absorb more of the move.
function constraintWeights(a, b) {
  const ma = a.pin ? 0 : 1 / (num(a.mass, 1) || 1);
  const mb = b.pin ? 0 : 1 / (num(b.mass, 1) || 1);
  const sum = ma + mb;
  if (sum <= 0) return [0, 0];          // both pinned -> rigid gap
  return [ma / sum, mb / sum];
}

// Reference timestep: opts.damping is authored as a per-frame factor at 60fps,
// and gravity/wind are accelerations. We scale them to the actual dt so the
// look is identical at any frame rate.
const REF_DT = 1 / 60;

/**
 * Advance a rope by one delta-time step: Verlet integrate, then relax the
 * chain distance constraints. Pure 2D math; mutates rope.nodes in place.
 * @param {{nodes:Array, segLen:number}} rope from makeRope
 * @param {number} dt seconds since last update
 * @param {object} [opts] see DEFAULT_ROPE_OPTS + the CONTRACTS block above
 * @returns {object} the same `rope`
 */
export function stepRope(rope, dt, opts) {
  const nd = rope && rope.nodes;
  if (!nd || nd.length < 2) return rope;
  let d = num(dt, 0);
  if (d <= 0) return rope;
  // Clamp dt so a tab-resume / long stall cannot launch the rope to infinity.
  if (d > 0.05) d = 0.05;

  const o = resolveOpts(opts);
  const segLen = num(rope.segLen, 20);

  // Per-frame damping factor, fps-corrected (authored at 60fps).
  const damp = Math.pow(o.damping, d / REF_DT);
  // Acceleration this frame -> a Verlet position offset of a*dt^2.
  const gOff = o.gravity * d * d;
  const wOff = o.wind * d * d;

  // Re-pin any nodes the caller wants held to a live position THIS frame
  // (a moving hand / vehicle mount). Done before integrate so they stay put.
  if (o.pinAt) {
    for (const key in o.pinAt) {
      const i = key | 0;
      const target = o.pinAt[key];
      const n = nd[i];
      if (n && target) {
        n.x = num(target.x, n.x);
        n.y = num(target.y, n.y);
        n.ox = n.x; n.oy = n.y;          // hard hold = zero velocity this frame
        n._frozen = true;                // skip integrate below
      }
    }
  }

  // --- VERLET INTEGRATE: x += (x - ox)*damp + a*dt^2; then ox = oldX.
  for (let i = 0; i < nd.length; i++) {
    const n = nd[i];
    if (!n) continue;
    if (n.pin || n._frozen) { n._frozen = false; continue; }
    const vx = (n.x - n.ox) * damp;
    const vy = (n.y - n.oy) * damp;
    n.ox = n.x; n.oy = n.y;
    n.x += vx + wOff;
    n.y += vy + gOff;
  }

  // --- DISTANCE CONSTRAINTS: relax each link toward segLen, iterated for stiffness.
  const iters = o.constraintIterations;
  const k = o.stiffness;
  for (let pass = 0; pass < iters; pass++) {
    for (let i = 0; i < nd.length - 1; i++) {
      const a = nd[i], b = nd[i + 1];
      let dx = b.x - a.x, dy = b.y - a.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1e-6) dist = 1e-6;
      const diff = (dist - segLen) / dist * k;
      const [wa, wb] = constraintWeights(a, b);
      const cx = dx * diff, cy = dy * diff;
      a.x += cx * wa; a.y += cy * wa;
      b.x -= cx * wb; b.y -= cy * wb;
    }
  }

  // --- Optional HARD STRETCH CLAMP: cap each link so a big impulse can't tear
  // the rope into a straight ray. Applied once after relaxation.
  if (o.maxStretch > 0) {
    const cap = segLen * o.maxStretch;
    for (let i = 0; i < nd.length - 1; i++) {
      const a = nd[i], b = nd[i + 1];
      let dx = b.x - a.x, dy = b.y - a.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > cap && dist > 1e-6) {
        const over = (dist - cap) / dist;
        const [wa, wb] = constraintWeights(a, b);
        a.x += dx * over * wa; a.y += dy * over * wa;
        b.x -= dx * over * wb; b.y -= dy * over * wb;
      }
    }
  }

  // --- Optional hard BOUNDS (floor / walls) the chain bounces off.
  if (o.bounds) {
    const bn = o.bounds;
    const r = o.bounce;
    for (let i = 0; i < nd.length; i++) {
      const n = nd[i];
      if (!n || n.pin) continue;
      let vx = n.x - n.ox, vy = n.y - n.oy;
      if (typeof bn.minX === 'number' && n.x < bn.minX) { n.x = bn.minX; n.ox = n.x + vx * r; }
      if (typeof bn.maxX === 'number' && n.x > bn.maxX) { n.x = bn.maxX; n.ox = n.x + vx * r; }
      if (typeof bn.minY === 'number' && n.y < bn.minY) { n.y = bn.minY; n.oy = n.y + vy * r; }
      if (typeof bn.maxY === 'number' && n.y > bn.maxY) { n.y = bn.maxY; n.oy = n.y + vy * r; }
    }
  }

  return rope;
}

/**
 * Couple an external body (anything with {x, y}) to a rope node -- the
 * grab/slingshot grapple. Pulls the body toward the node and, by reaction,
 * tugs the (non-pinned) node toward the body, like a short spring of rest
 * length `rest`. Call this each frame between rope steps while grabbed.
 *
 *   body : { x, y } the grabbed object (e.g. a blob centroid / player)
 *   node : the rope node it is holding (from nearestNode().node)
 *   opts : { rest:number=12, pull:number=0.8 } pull is the body's share of the
 *          correction (0..1); the node takes (1 - pull) scaled by its mobility.
 * Mutates BOTH body and node in place. Safe if node is pinned (then only the
 * body moves -- a fixed grapple point).
 */
export function applyAttachment(body, node, opts = {}) {
  if (!body || !node) return;
  const rest = num(opts.rest, 12);
  const pull = Math.max(0, Math.min(1, num(opts.pull, 0.8)));
  let dx = node.x - body.x, dy = node.y - body.y;
  let dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1e-6) return;
  const diff = (dist - rest) / dist;
  // Body moves toward the node by `pull` of the gap.
  body.x += dx * diff * pull;
  body.y += dy * diff * pull;
  // Reaction on the node (skipped if pinned) by the remaining share.
  if (!node.pin) {
    const back = 1 - pull;
    node.x -= dx * diff * back;
    node.y -= dy * diff * back;
  }
}

/**
 * Stateful rope wrapper. Holds the base opts and any active attachments
 * (grapples), so per-frame you just call update(dt). Mirrors the makeRope opts
 * for construction and exposes grab/release helpers built on the functional core.
 */
export class VerletRope {
  // ropeOpts: the makeRope opts (x, y, length/x2,y2, count, pins, slack, angle).
  // baseOpts: optional default step opts (gravity, damping, iterations, ...).
  constructor(ropeOpts = {}, baseOpts = {}) {
    this.rope = makeRope(ropeOpts);
    this.opts = Object.assign({}, baseOpts);
    this._attachments = []; // [{ body, node, rest, pull }]
  }

  get nodes() { return this.rope.nodes; }
  get segLen() { return this.rope.segLen; }

  // Update stored step options (merged over existing). Returns this.
  configure(partial = {}) {
    Object.assign(this.opts, partial);
    return this;
  }

  // Bind an external body to a specific rope node (a known grapple point).
  attach(body, node, attachOpts = {}) {
    if (!body || !node) return null;
    const a = { body, node, rest: num(attachOpts.rest, 12), pull: num(attachOpts.pull, 0.8) };
    this._attachments.push(a);
    return a;
  }

  // Grab the nearest grabbable node to (x, y) within maxDist and bind `body` to
  // it. Returns the attachment record, or null if nothing was in range.
  grabNearest(x, y, maxDist, body, attachOpts = {}) {
    const hit = nearestNode(this.rope, x, y, maxDist);
    if (!hit) return null;
    return this.attach(body, hit.node, attachOpts);
  }

  // Release one attachment (or all if none passed). Returns the recent upward
  // velocity (-dy) of the released node(s), handy for slingshot scoring.
  release(attachment) {
    let vUp = 0, n = 0;
    const measure = (a) => {
      if (a && a.node) { vUp += (a.node.oy - a.node.y); n++; }
    };
    if (attachment) {
      measure(attachment);
      const i = this._attachments.indexOf(attachment);
      if (i >= 0) this._attachments.splice(i, 1);
    } else {
      for (const a of this._attachments) measure(a);
      this._attachments.length = 0;
    }
    return n > 0 ? vUp / n : 0;
  }

  get attachments() { return this._attachments; }
  get attached() { return this._attachments.length > 0; }

  // Advance: integrate + constrain, then apply every active attachment so the
  // grabbed body and the rope settle together. frameOpts merges over base opts.
  update(dt, frameOpts) {
    const merged = frameOpts ? Object.assign({}, this.opts, frameOpts) : this.opts;
    stepRope(this.rope, dt, merged);
    for (const a of this._attachments) {
      applyAttachment(a.body, a.node, { rest: a.rest, pull: a.pull });
    }
    return this.rope;
  }
}

// END mChatAI Web Component: systems.verlet-rope
