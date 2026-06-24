// BEGIN mChatAI Web Component: systems.force-graph-arena
//
// A DEFORMABLE FORCE-DIRECTED GRAPH you can edit live during play -- the
// "living maze" mechanic from tower-defense / web-defense / circuit-rewire
// games. The graph is nodes + spring edges with ONE pinned "core" node at a
// fixed point. Every frame it:
//   RELAX     a damped spring layout settles nodes fast then sits still
//             (Hooke springs along edges + many-body repulsion + a gentle pull
//             toward the core + collision spacing) -- high velocityDecay so it
//             tightens quickly and does not jiggle forever.
//   EDIT      the player CUTs an edge (swipe across it) or FORGEs an edge
//             (drag node->node). Both re-tension the layout and snap-recoil the
//             two endpoints, so the maze visibly reshapes in real time.
//   ROUTE     a per-tick shortest-path-to-core (Dijkstra over LIVE geometric
//             edge lengths) gives every node its distance to the core + a
//             nextHop. Traversers (crawler enemies) always take the shortest
//             CURRENT path and reroute the instant an edge is cut beneath them.
//   ORPHAN    nodes with no remaining path to the core are flagged (you can
//             render them dim / mark turrets on them "offline").
//   TRAVERSE  along-edge agents crawl core-ward at their own speed, hop node to
//             node, and can be knocked OUTWARD one hop (turret blast pushback).
//
// This is PLAIN 2D math (x, y) -- nodes are { id, x, y } objects, edges are
// { a, b } id pairs. It is renderer-agnostic: it never touches DOM/canvas/GPU.
// You read node.x / node.y and draw the web yourself. DELTA-TIME based.
//
// D3 IS OPTIONAL. The built-in relaxer (ForceGraphArena.relax / relaxStep) has
// NO dependency on d3 and is the recommended path -- it reproduces the
// d3-forceSimulation feel (link + manyBody + centering + collide, velocityDecay
// 0.55, alphaDecay 0.045) with a few dozen lines. If you'd rather drive a real
// d3.forceSimulation, the D3_FORCE_HOOK comment below documents the exact force
// stack and the pinned-core trick (fx/fy) so you can swap it in unchanged.
//
// Exports:
//   ForceGraphArena            stateful arena: nodes + edges + core + layout +
//                              routing + traversers + cut/forge edit API
//   relaxStep(nodes, edges, dt, opts)
//                              functional one-shot spring relax (no class, no d3)
//   shortestPathField(nodes, edges, fromId, opts)
//                              Dijkstra distance map { id -> distance } over live
//                              edge lengths (the crawler routing field)
//   nextHopToward(nodeId, field, adjacency, nodes)
//                              the neighbor that most reduces distance (one hop)
//   buildAdjacency(nodes, edges)
//                              { id -> [neighborId,...] } map
//   DEFAULT_ARENA_OPTS         tunable layout/relax defaults (read-only)
//
// Usage (built-in relaxer -- no d3):
//   import { ForceGraphArena } from './systems/force-graph-arena.js';
//   const arena = new ForceGraphArena({ core: { x: cx, y: cy } });
//   // seed a star of spokes around the core:
//   for (let i = 0; i < 6; i++) {
//     const a = (-90 + i * 60) * Math.PI / 180;
//     const id = arena.addNode(cx + Math.cos(a) * 120, cy + Math.sin(a) * 120);
//     arena.addEdge('core', id);
//   }
//   arena.settle(90);                 // pre-relax so it opens settled
//   // each frame:
//   arena.update(dt);                 // relax + recompute routing + orphans
//   for (const e of arena.edges) drawEdge(arena.node(e.a), arena.node(e.b));
//   for (const n of arena.nodes) drawNode(n);   // n.orphan flags dead regions
//
//   // player edits (your input layer decides cut vs forge -- see CONTRACTS):
//   arena.cutEdge(a, b);              // swipe -> remove + recoil + re-tension
//   arena.forgeEdge(a, b);           // drag node->node -> add + re-tension
//
//   // crawler enemy that walks toward the core along the web:
//   const c = arena.spawnTraverser(rimNodeId, { speed: 40 });
//   arena.updateTraversers(dt, {
//     onArrive(t) { if (t.cur === 'core') { breachCore(); arena.removeTraverser(t); } }
//   });
//   for (const t of arena.traversers) drawCrawler(t.x, t.y);
//   arena.knockTraverser(c, 0.42);    // blast it one hop outward
//
// CONTRACTS:
//   - Nodes are { id, x, y } (+ any fields YOU add: type, charge, etc. -- the
//     arena only reads/writes id/x/y/vx/vy and the `orphan`/`dist`/`hop` fields
//     it stamps). addNode() auto-ids; you may also pass your own id.
//   - The CORE node has id 'core' by default (opts.coreId), is created in the
//     constructor at opts.core {x,y}, and is PINNED: the relaxer never moves it.
//     Call setCore(x, y) on resize to re-pin it (e.g. window center changed).
//   - Edges are undirected { a, b } id pairs; addEdge() de-dupes and ignores
//     self-loops / missing endpoints. Edge identity is the unordered {a,b} key.
//   - relaxStep / arena.relax run a damped spring step. `alpha` is the layout
//     energy (1 = hot, decays toward alphaMin then the arena stops ticking).
//     Any edit reheats to opts.reheatAlpha so the web re-settles after a change.
//   - shortestPathField uses LIVE Math.hypot edge lengths as weights, so cutting
//     a short edge genuinely lengthens the route. Unreachable nodes => Infinity.
//   - Traversers are { id, cur, nxt, t, x, y, speed } -- `cur`/`nxt` are node
//     ids, `t` in 0..1 is progress along the cur->nxt edge. updateTraversers()
//     reroutes via nextHopToward when an edge vanishes under a traverser, snaps
//     stranded ones to their node, and calls opts.onArrive(t) when a node is
//     reached (you decide core-breach / despawn). knockTraverser pushes one hop
//     OUTWARD (away from core) for blast pushback.
//   - INPUT IS YOURS. The arena exposes hitTestNode(x,y,slop) +
//     hitTestEdge(x0,y0,x1,y1,opts) so your pointer layer can disambiguate
//     "drag from a node = forge / tap a node = your action" vs "swipe in empty
//     space across an edge = cut" -- it does not bind any listeners itself.
//   - Renderer-agnostic: owns no GPU/DOM/listeners, so there is no dispose().
//
// D3_FORCE_HOOK (optional -- skip the built-in relaxer and drive real d3):
//   const sim = d3.forceSimulation(arena.nodes)
//     .force('link',    d3.forceLink(arena.d3Links()).id(d => d.id)
//                          .distance(e => e.dist || opts.restLength).strength(0.45))
//     .force('charge',  d3.forceManyBody().strength(-210).distanceMax(340))
//     .force('cx',      d3.forceX(core.x).strength(0.045))
//     .force('cy',      d3.forceY(core.y).strength(0.045))
//     .force('collide', d3.forceCollide().radius(d => (d.r||7)+8).strength(0.85))
//     .velocityDecay(0.55).alphaDecay(0.045).alphaMin(0.008).stop();
//   core.fx = core.x; core.fy = core.y;       // PIN the core
//   // each frame: if (sim.alpha() > sim.alphaMin()) sim.tick();
//   // on edit: sim.force('link').links(arena.d3Links()); sim.alpha(0.6);
//   // Either way, arena.recomputeRouting() still gives you dist/hop/orphan.
//
// Extracted + generalized from the Force Web Defense
// setupSim/relax + computeDistField/nextHop + cut/forge + updateRaiders loop.

export const DEFAULT_ARENA_OPTS = Object.freeze({
  coreId: 'core',
  // --- spring relaxer (built-in, d3-free) ---
  restLength: 84,        // natural spring length for an edge with no .dist
  linkStrength: 0.45,    // Hooke pull toward an edge's rest length
  charge: 210,           // many-body repulsion magnitude (pushes nodes apart)
  chargeMaxDist: 340,    // beyond this, repulsion is ignored (perf + locality)
  centerStrength: 0.045, // gentle pull of every node toward the core position
  collideRadius: 15,     // min center-to-center spacing enforced between nodes
  collideStrength: 0.85, // how hard collisions are resolved (0..1)
  velocityDecay: 0.55,   // per-tick velocity damping (1-this is kept) -> fast settle
  alphaDecay: 0.045,     // how fast the layout cools toward rest
  alphaMin: 0.008,       // below this alpha the arena stops ticking
  reheatAlpha: 0.6,      // alpha to reheat to after a cut/forge edit
  recoilImpulse: 6.5,    // endpoint push-apart velocity on a cut (the snap)
  // --- routing / traverser ---
  knockSpeed: 210,       // px/sec a knocked traverser slides along its hop
  knockArriveT: 0.6,     // fraction of the hop after which a knock "lands" at nxt
  maxStep: 0.1           // dt clamp (seconds) so a tab-resume cannot explode it
});

function num(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function idOf(x) { return (x && typeof x === 'object') ? x.id : x; }
function edgeKey(a, b) { return a < b ? a + ' ' + b : b + ' ' + a; }
function lerp(a, b, t) { return a + (b - a) * t; }

function resolveOpts(opts) {
  const o = {};
  for (const k in DEFAULT_ARENA_OPTS) o[k] = DEFAULT_ARENA_OPTS[k];
  if (opts) for (const k in DEFAULT_ARENA_OPTS) {
    if (k in opts && k !== 'coreId') o[k] = num(opts[k], o[k]);
  }
  if (opts && typeof opts.coreId === 'string') o.coreId = opts.coreId;
  return o;
}

/* =====================================================================
   ADJACENCY + ROUTING (pure functions -- the crawler "brain")
   ===================================================================== */

/**
 * Build an undirected adjacency map from nodes + edges.
 * @returns {Map<string, string[]>} nodeId -> array of neighbor ids
 */
export function buildAdjacency(nodes, edges) {
  const adj = new Map();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    const a = idOf(e.a !== undefined ? e.a : e.source);
    const b = idOf(e.b !== undefined ? e.b : e.target);
    if (adj.has(a) && adj.has(b)) { adj.get(a).push(b); adj.get(b).push(a); }
  }
  return adj;
}

/**
 * Dijkstra distance field FROM `fromId` (e.g. the core) over LIVE edge lengths.
 * Weight per edge = geometric distance between its current node positions, so
 * the route lengthens when you cut a shortcut. Unreachable nodes => Infinity.
 * @param {Array<{id,x,y}>} nodes
 * @param {Array<{a,b}>} edges
 * @param {string} fromId source node id
 * @param {object} [opts] { adjacency?, nodeById? } reuse prebuilt indexes
 * @returns {Map<string, number>} nodeId -> shortest distance
 */
export function shortestPathField(nodes, edges, fromId, opts) {
  const dist = new Map();
  for (const n of nodes) dist.set(n.id, Infinity);
  if (!dist.has(fromId)) return dist;
  const nodeById = (opts && opts.nodeById) || (() => {
    const m = new Map(); for (const n of nodes) m.set(n.id, n); return m;
  })();
  const adj = (opts && opts.adjacency) || buildAdjacency(nodes, edges);
  dist.set(fromId, 0);
  // Simple O(V^2) Dijkstra -- plenty fast for the few-hundred-node webs these
  // arenas use, and avoids pulling in a heap dependency. Swap in a binary heap
  // here if you ever push into the thousands.
  const visited = new Set();
  const total = nodes.length;
  while (visited.size < total) {
    let u = null, best = Infinity;
    for (const n of nodes) {
      if (visited.has(n.id)) continue;
      const d = dist.get(n.id);
      if (d < best) { best = d; u = n.id; }
    }
    if (u === null) break;            // remaining nodes are unreachable
    visited.add(u);
    const un = nodeById.get(u);
    for (const v of adj.get(u) || []) {
      if (visited.has(v)) continue;
      const vn = nodeById.get(v);
      const w = Math.hypot(un.x - vn.x, un.y - vn.y);
      if (best + w < dist.get(v)) dist.set(v, best + w);
    }
  }
  return dist;
}

/**
 * The neighbor of `nodeId` that most reduces distance-to-source (one hop along
 * the shortest path). Returns null if `nodeId` is the source / unreachable /
 * has no closer neighbor.
 * @param {string} nodeId
 * @param {Map<string,number>} field result of shortestPathField
 * @param {Map<string,string[]>} adjacency
 * @param {Map<string,{id,x,y}>} nodeById
 */
export function nextHopToward(nodeId, field, adjacency, nodeById) {
  const adj = adjacency.get(nodeId);
  if (!adj || adj.length === 0) return null;
  const dcur = field.get(nodeId);
  if (dcur == null || !isFinite(dcur)) {
    // Unreachable: fall back to the neighbor with the smallest finite distance.
    let best = null, bestD = Infinity;
    for (const v of adj) { const dv = field.get(v); if (isFinite(dv) && dv < bestD) { bestD = dv; best = v; } }
    return best;
  }
  const cn = nodeById.get(nodeId);
  let best = null, bestVal = dcur;
  for (const v of adj) {
    const dv = field.get(v);
    if (!isFinite(dv) || dv >= dcur) continue;     // must move strictly closer
    const vn = nodeById.get(v);
    const w = Math.hypot(cn.x - vn.x, cn.y - vn.y);
    if (dv + w <= bestVal + 0.001) { bestVal = dv + w; best = v; }
  }
  return best;
}

/** The neighbor FURTHEST from the source (one hop OUTWARD) -- used for blast knockback. */
function outwardHop(nodeId, field, adjacency) {
  const adj = adjacency.get(nodeId);
  if (!adj || adj.length === 0) return null;
  const dcur = field.get(nodeId);
  let best = null, bestD = -1;
  for (const v of adj) {
    const dv = field.get(v);
    const val = isFinite(dv) ? dv : (isFinite(dcur) ? dcur + 50 : 1e9);
    if (val > bestD) { bestD = val; best = v; }
  }
  return best;
}

/* =====================================================================
   SPRING RELAXER (built-in -- the d3-forceSimulation stand-in)
   ===================================================================== */

/**
 * One damped spring-relaxation step over nodes+edges. Mutates node x/y/vx/vy in
 * place. The node whose id === opts.coreId (default 'core') is PINNED and never
 * moves. Pure 2D math -- no d3, no DOM. Apply once per frame while alpha > min.
 *
 * @param {Array<{id,x,y,vx?,vy?}>} nodes
 * @param {Array<{a,b,dist?}>} edges     dist = preferred rest length for that edge
 * @param {number} dt seconds (clamped internally)
 * @param {object} [opts] subset of DEFAULT_ARENA_OPTS + { alpha, core:{x,y} }
 * @returns {number} the energy actually applied (alpha * scale), for convenience
 */
export function relaxStep(nodes, edges, dt, opts) {
  if (!Array.isArray(nodes) || nodes.length === 0) return 0;
  const o = resolveOpts(opts);
  const alpha = opts && typeof opts.alpha === 'number' ? opts.alpha : 1;
  if (alpha <= 0) return 0;
  const core = (opts && opts.core) || null;
  const coreId = o.coreId;

  const byId = new Map();
  for (const n of nodes) {
    if (typeof n.vx !== 'number') n.vx = 0;
    if (typeof n.vy !== 'number') n.vy = 0;
    byId.set(n.id, n);
  }

  // --- LINK springs: pull each edge toward its rest length (Hooke). ---
  for (const e of edges) {
    const a = byId.get(idOf(e.a !== undefined ? e.a : e.source));
    const b = byId.get(idOf(e.b !== undefined ? e.b : e.target));
    if (!a || !b) continue;
    let dx = b.x - a.x, dy = b.y - a.y;
    let len = Math.hypot(dx, dy) || 0.001;
    const rest = num(e.dist, o.restLength);
    // displacement * strength * alpha, split between the two endpoints
    const k = ((len - rest) / len) * o.linkStrength * alpha;
    const fx = dx * k, fy = dy * k;
    a.vx += fx * 0.5; a.vy += fy * 0.5;
    b.vx -= fx * 0.5; b.vy -= fy * 0.5;
  }

  // --- MANY-BODY repulsion: O(n^2) inverse-square push so nodes spread out. ---
  const maxD2 = o.chargeMaxDist * o.chargeMaxDist;
  const n = nodes.length;
  for (let i = 0; i < n; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < n; j++) {
      const b = nodes[j];
      let dx = a.x - b.x, dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 <= 0 || d2 > maxD2) {
        if (d2 <= 0) { dx = (Math.random() - 0.5) * 0.01; dy = (Math.random() - 0.5) * 0.01; d2 = dx * dx + dy * dy; }
        else continue;
      }
      const f = (o.charge * alpha) / d2;            // inverse-square
      const inv = 1 / Math.sqrt(d2);
      const px = dx * inv * f, py = dy * inv * f;
      a.vx += px; a.vy += py;
      b.vx -= px; b.vy -= py;
    }
  }

  // --- CENTERING: gentle pull of every node toward the core position. ---
  if (core) {
    for (const nd of nodes) {
      nd.vx += (core.x - nd.x) * o.centerStrength * alpha;
      nd.vy += (core.y - nd.y) * o.centerStrength * alpha;
    }
  }

  // --- COLLIDE: enforce minimum spacing so nodes never overlap. ---
  const minSep = o.collideRadius * 2;
  const minSep2 = minSep * minSep;
  for (let i = 0; i < n; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < n; j++) {
      const b = nodes[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0 && d2 < minSep2) {
        const d = Math.sqrt(d2);
        const overlap = (minSep - d) / d * 0.5 * o.collideStrength;
        const ox = dx * overlap, oy = dy * overlap;
        a.x -= ox; a.y -= oy;
        b.x += ox; b.y += oy;
      }
    }
  }

  // --- INTEGRATE: damp velocity, move, then re-pin the core. ---
  const keep = 1 - o.velocityDecay;
  for (const nd of nodes) {
    if (nd.id === coreId) { nd.vx = 0; nd.vy = 0; if (core) { nd.x = core.x; nd.y = core.y; } continue; }
    nd.vx *= keep; nd.vy *= keep;
    nd.x += nd.vx; nd.y += nd.vy;
  }
  return alpha;
}

/* =====================================================================
   ForceGraphArena -- the stateful, batteries-included wrapper
   ===================================================================== */

export class ForceGraphArena {
  /**
   * @param {object} [opts] DEFAULT_ARENA_OPTS overrides + { core:{x,y}, coreId? }
   */
  constructor(opts = {}) {
    this.opts = resolveOpts(opts);
    this.coreId = this.opts.coreId;
    this.nodes = [];
    this.edges = [];
    this.traversers = [];
    this._byId = new Map();
    this._edgeSet = new Set();
    this._adj = new Map();
    this._field = new Map();         // dist-to-core for every node
    this._nextNodeId = 0;
    this._nextTravId = 0;
    this.alpha = 1;                  // layout energy
    // Create the pinned core.
    const c = (opts && opts.core) || { x: 0, y: 0 };
    this._core = { x: num(c.x, 0), y: num(c.y, 0) };
    const core = { id: this.coreId, x: this._core.x, y: this._core.y, vx: 0, vy: 0 };
    this.nodes.push(core);
    this._byId.set(this.coreId, core);
    this.coreNode = core;
  }

  /* ---- accessors ---- */
  node(id) { return this._byId.get(idOf(id)) || null; }
  hasEdge(a, b) { return this._edgeSet.has(edgeKey(idOf(a), idOf(b))); }
  distTo(id) { const d = this._field.get(idOf(id)); return d == null ? Infinity : d; }
  nextHop(id) { return nextHopToward(idOf(id), this._field, this._adj, this._byId); }
  isOrphan(id) { id = idOf(id); return id !== this.coreId && !isFinite(this.distTo(id)); }

  /* ---- topology mutation ---- */

  /** Add a node at (x,y). Returns its id. Pass `id` to set your own. Reheats layout. */
  addNode(x, y, id) {
    const nid = id != null ? String(id) : ('n' + (this._nextNodeId++));
    if (this._byId.has(nid)) return nid;
    const n = { id: nid, x: num(x, this._core.x), y: num(y, this._core.y), vx: 0, vy: 0 };
    this.nodes.push(n);
    this._byId.set(nid, n);
    return nid;
  }

  /** Add an undirected edge. De-dupes, ignores self-loops + missing endpoints. */
  addEdge(a, b, dist) {
    a = idOf(a); b = idOf(b);
    if (a === b) return false;
    if (this._edgeSet.has(edgeKey(a, b))) return false;
    if (!this._byId.has(a) || !this._byId.has(b)) return false;
    this.edges.push({ a, b, dist: dist != null ? dist : undefined });
    this._edgeSet.add(edgeKey(a, b));
    return true;
  }

  /** Set / re-pin the core position (call on resize). */
  setCore(x, y) {
    this._core.x = num(x, this._core.x);
    this._core.y = num(y, this._core.y);
    this.coreNode.x = this._core.x;
    this.coreNode.y = this._core.y;
  }

  /* ---- player edits (cut / forge) -- both re-tension the web ---- */

  /**
   * CUT the edge between a and b: remove it, snap-recoil the two endpoints
   * apart, reheat the layout. Returns { ok, ax, ay, bx, by } so the caller can
   * draw a cut flash at the old edge. Reroutes happen automatically next update.
   */
  cutEdge(a, b) {
    a = idOf(a); b = idOf(b);
    const key = edgeKey(a, b);
    const idx = this.edges.findIndex(e => edgeKey(idOf(e.a), idOf(e.b)) === key);
    if (idx < 0) return { ok: false };
    const na = this._byId.get(a), nb = this._byId.get(b);
    this.edges.splice(idx, 1);
    this._edgeSet.delete(key);
    let res = { ok: true };
    if (na && nb) {
      // recoil: push endpoints apart along their separation axis (the snap)
      let dx = na.x - nb.x, dy = na.y - nb.y;
      const m = Math.max(1, Math.hypot(dx, dy)); dx /= m; dy /= m;
      const imp = this.opts.recoilImpulse;
      na.vx = (na.vx || 0) + dx * imp; na.vy = (na.vy || 0) + dy * imp;
      nb.vx = (nb.vx || 0) - dx * imp; nb.vy = (nb.vy || 0) - dy * imp;
      res = { ok: true, ax: na.x, ay: na.y, bx: nb.x, by: nb.y };
    }
    this.reheat();
    return res;
  }

  /**
   * FORGE a new edge between two existing nodes (drag node->node). De-dupes.
   * Rest length defaults to a fraction of the current gap so it snaps taut.
   * Returns true if a new edge was created. Reheats the layout.
   */
  forgeEdge(a, b, dist) {
    a = idOf(a); b = idOf(b);
    if (a === b || this.hasEdge(a, b)) return false;
    const na = this._byId.get(a), nb = this._byId.get(b);
    if (!na || !nb) return false;
    const rest = dist != null ? dist : Math.max(60, Math.hypot(na.x - nb.x, na.y - nb.y) * 0.85);
    const ok = this.addEdge(a, b, rest);
    if (ok) this.reheat();
    return ok;
  }

  /** Reheat the layout so it re-settles after an edit (or any external change). */
  reheat(alpha) { this.alpha = Math.max(this.alpha, num(alpha, this.opts.reheatAlpha)); return this; }

  /* ---- layout ---- */

  /** One relax tick using the built-in spring relaxer. No-op once cooled. */
  relax(dt) {
    if (this.alpha <= this.opts.alphaMin) return false;
    relaxStep(this.nodes, this.edges, dt, Object.assign({}, this.opts, { alpha: this.alpha, core: this._core }));
    this.alpha *= (1 - this.opts.alphaDecay);     // cool toward rest
    if (this.alpha < this.opts.alphaMin) this.alpha = 0;
    return true;
  }

  /** Pre-settle the layout synchronously (call once before first paint). */
  settle(ticks = 90) {
    this.alpha = 1;
    for (let i = 0; i < ticks; i++) {
      relaxStep(this.nodes, this.edges, this.opts.maxStep,
        Object.assign({}, this.opts, { alpha: this.alpha, core: this._core }));
    }
    this.recomputeRouting();
    return this;
  }

  /* ---- routing ---- */

  /** Recompute adjacency + dist-to-core field + orphan flags (per tick). */
  recomputeRouting() {
    this._adj = buildAdjacency(this.nodes, this.edges);
    this._field = shortestPathField(this.nodes, this.edges, this.coreId, {
      adjacency: this._adj, nodeById: this._byId
    });
    for (const n of this.nodes) {
      n.dist = this._field.get(n.id);
      n.hop = (n.id === this.coreId) ? null : nextHopToward(n.id, this._field, this._adj, this._byId);
      n.orphan = (n.id !== this.coreId) && !isFinite(n.dist);
    }
    return this._field;
  }

  /** Full per-frame step: relax (if hot) + recompute routing/orphans. */
  update(dt) {
    this.relax(dt);
    this.recomputeRouting();
    return this;
  }

  /* ---- traversers (along-edge crawlers heading for the core) ---- */

  /**
   * Spawn a traverser sitting on `startId`, heading core-ward.
   * @param {string} startId node to start on
   * @param {object} [props] merged onto the traverser (speed, hp, kind, ...)
   * @returns {object|null} the traverser, or null if startId is invalid
   */
  spawnTraverser(startId, props = {}) {
    startId = idOf(startId);
    const sn = this._byId.get(startId);
    if (!sn) return null;
    const t = Object.assign({
      id: this._nextTravId++,
      cur: startId, nxt: null, t: 0,
      x: sn.x, y: sn.y,
      speed: 40,
      knock: 0, knockFrom: null, knockTo: null, kt: 0
    }, props);
    t.nxt = this.nextHop(startId);
    this.traversers.push(t);
    return t;
  }

  removeTraverser(t) {
    const i = this.traversers.indexOf(t);
    if (i >= 0) this.traversers.splice(i, 1);
  }

  /** Push a traverser ONE hop outward (away from core) -- turret blast pushback. */
  knockTraverser(t, duration = 0.42) {
    if (!t) return false;
    const out = outwardHop(t.cur, this._field, this._adj);
    if (out == null) { t.t = Math.max(0, t.t - 0.5); return false; }
    t.knockFrom = t.cur; t.knockTo = out; t.knock = duration; t.kt = 0;
    return true;
  }

  /**
   * Advance all traversers along the web toward the core. Mutates x/y/cur/nxt/t.
   * Reroutes when an edge vanishes under a traverser, idles stranded ones, and
   * invokes opts.onArrive(t) each time a traverser lands on a node (you decide
   * core-breach + removeTraverser there).
   * @param {number} dt seconds
   * @param {object} [opts] { onArrive(traverser) }
   */
  updateTraversers(dt, opts = {}) {
    const onArrive = typeof opts.onArrive === 'function' ? opts.onArrive : null;
    const step = Math.min(num(dt, 0), this.opts.maxStep);
    for (let i = this.traversers.length - 1; i >= 0; i--) {
      const r = this.traversers[i];

      // --- knockback motion: slide outward along a hop, then resettle + reroute.
      if (r.knock > 0) {
        r.knock -= step;
        const a = this._byId.get(r.knockFrom), b = this._byId.get(r.knockTo);
        if (a && b) {
          const len = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
          r.kt = Math.min(1, r.kt + (this.opts.knockSpeed * step) / len);
          r.x = lerp(a.x, b.x, r.kt); r.y = lerp(a.y, b.y, r.kt);
        }
        if (r.knock <= 0 || r.kt >= 1) {
          r.cur = (r.kt >= this.opts.knockArriveT && r.knockTo) ? r.knockTo : (r.knockFrom || r.cur);
          r.knock = 0; r.t = 0; r.nxt = this.nextHop(r.cur);
        }
        continue;
      }

      const cn = this._byId.get(r.cur);
      if (!cn) { this.traversers.splice(i, 1); continue; }   // its node was removed

      // current edge cut beneath it? snap back to the node + reroute
      if (r.nxt != null && !this.hasEdge(r.cur, r.nxt)) { r.t = 0; r.nxt = this.nextHop(r.cur); }
      if (r.nxt == null) r.nxt = this.nextHop(r.cur);

      if (r.nxt == null) {
        // stranded (graph fragmented from the core) -- idle on its node
        r.x = cn.x; r.y = cn.y;
        continue;
      }

      const nn = this._byId.get(r.nxt);
      const len = Math.max(1, Math.hypot(cn.x - nn.x, cn.y - nn.y));
      r.t += (r.speed * step) / len;
      if (r.t >= 1) {
        r.cur = r.nxt; r.t = 0;
        const c2 = this._byId.get(r.cur);
        if (c2) { r.x = c2.x; r.y = c2.y; }
        r.nxt = this.nextHop(r.cur);
        if (onArrive) onArrive(r);          // caller checks r.cur === coreId etc.
      } else {
        r.x = lerp(cn.x, nn.x, r.t); r.y = lerp(cn.y, nn.y, r.t);
      }
    }
    return this.traversers;
  }

  /* ---- input helpers (your pointer layer calls these; arena binds nothing) ---- */

  /** Nearest node within `slop` px of (x,y), or null. radiusOf maps node->radius. */
  hitTestNode(x, y, slop = 16, radiusOf) {
    let best = null, bd = Infinity;
    for (const n of this.nodes) {
      const rr = (typeof radiusOf === 'function' ? num(radiusOf(n), 7) : 7) + slop;
      const d = Math.hypot(n.x - x, n.y - y);
      if (d <= rr && d < bd) { bd = d; best = n; }
    }
    return best;
  }

  /**
   * Pick an edge to CUT from a gesture. A SWIPE (moved > tapMove) cuts the edge
   * its line segment crosses; a TAP cuts the edge nearest the point (within
   * tapDist). Returns the edge { a, b } or null.
   * @param {number} x0,y0 gesture start  @param {number} x1,y1 gesture end
   * @param {object} [opts] { moved, tapMove=13, tapDist=17 }
   */
  hitTestEdge(x0, y0, x1, y1, opts = {}) {
    const moved = num(opts.moved, Math.hypot(x1 - x0, y1 - y0));
    const tapMove = num(opts.tapMove, 13);
    const tapDist = num(opts.tapDist, 17);
    let chosen = null, bestScore = Infinity;
    for (const e of this.edges) {
      const a = this._byId.get(idOf(e.a)), b = this._byId.get(idOf(e.b));
      if (!a || !b) continue;
      if (moved > tapMove) {
        if (segIntersect(x0, y0, x1, y1, a.x, a.y, b.x, b.y)) {
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          const sc = Math.hypot(mx - x1, my - y1);   // prefer the edge nearest the gesture end
          if (sc < bestScore) { bestScore = sc; chosen = e; }
        }
      } else {
        const d = distToSeg(x0, y0, a.x, a.y, b.x, b.y);
        if (d <= tapDist && d < bestScore) { bestScore = d; chosen = e; }
      }
    }
    return chosen;
  }

  /* ---- d3 interop (optional -- see D3_FORCE_HOOK header note) ---- */

  /** Edges as d3.forceLink-shaped {source,target,dist} (source/target are ids). */
  d3Links() { return this.edges.map(e => ({ source: e.a, target: e.b, dist: e.dist })); }
}

/* ----- segment geometry helpers (shared by hitTestEdge) ----- */
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function segIntersect(p1x, p1y, p2x, p2y, p3x, p3y, p4x, p4y) {
  function ccw(ax, ay, bx, by, cx, cy) { return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax); }
  return ccw(p1x, p1y, p3x, p3y, p4x, p4y) !== ccw(p2x, p2y, p3x, p3y, p4x, p4y) &&
         ccw(p1x, p1y, p2x, p2y, p3x, p3y) !== ccw(p1x, p1y, p2x, p2y, p4x, p4y);
}

// END mChatAI Web Component: systems.force-graph-arena
