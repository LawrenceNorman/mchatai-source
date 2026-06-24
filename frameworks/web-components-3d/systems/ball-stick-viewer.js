// BEGIN mChatAI Web Component: systems.ball-stick-viewer-3d
//
// A CANVAS-2D SOFTWARE-3D BALL-AND-STICK (node-and-edge) VIEWER: orbit a small
// 3D graph of shaded spheres joined by shaded sticks, on a plain 2D canvas with
// NO WebGL, NO three.js, NO external deps. One primitive covers a surprising
// amount of "spin this little 3D structure" furniture:
//   - a molecule viewer (atoms = nodes, bonds = sticks, double/triple = order)
//   - a 3D force-directed / org / dependency GRAPH (nodes + edges)
//   - a crystal LATTICE / unit cell (corner atoms + lattice vectors)
//   - a constellation, a skeletal rig preview, a wireframe-ish solid (vertices +
//     edges), a network topology, a "connect the dots" 3D puzzle
//
// The look: each node is a radial-gradient shaded sphere with a specular
// highlight; each stick is a two-tone capsule (dark base + light core) split at
// its midpoint so the two ends can take their endpoints' colors. Everything is
// PAINTER-SORTED by camera-space depth so nearer balls/sticks draw last and
// occlude farther ones. The camera is a yaw/pitch ROTATION with a simple
// perspective foreshorten, and dragging spins it with INERTIA (flick to keep
// spinning); an optional gentle auto-rotate idles when untouched.
//
// SEPARATION OF CONCERNS (the genericization):
//   * projectGraph()  is PURE MATH -- rotate + perspective-project a node list,
//     returns screen coords + per-node scale + depth. No canvas, no DOM.
//   * buildDrawList() is PURE LOGIC -- merges nodes + edges into one painter-
//     sorted list of draw items. No canvas, no DOM.
//   * drawBall() / drawStick() are the only canvas-touching primitives, and they
//     are tiny -- swap them to retarget the renderer.
//   * BallStickViewer is the batteries-included stateful wrapper: it owns a
//     <canvas>, the orbit state (drag inertia + auto-rotate), DPR-aware resize,
//     wheel/pinch zoom, and an rAF loop. Use it for the 90% case; reach for the
//     functional core when you want to draw into your own scene.
//
// A "node" is a PLAIN object { x, y, z, color, radius? }:
//   x, y, z   model-space position (the viewer auto-centers + auto-fits)
//   color     hex string "#rrggbb" (sphere base color)
//   radius    OPTIONAL relative sphere radius (model units). Default 0.42.
// An "edge" is { a, b, order?, colorA?, colorB?, width? }:
//   a, b      indices into the node array
//   order     1 = single stick, 2 = double, 3 = triple (parallel offset sticks)
//   colorA/B  OPTIONAL per-end stick colors (default: the endpoint nodes' colors)
//   width     OPTIONAL relative stick width (model units). Default 0.16.
//
// DPR-aware, touch + mouse + wheel + pinch, delta-time-free (the orbit inertia
// is per-frame at the display rate, matching the source). Offline-safe: touches
// nothing but a CanvasRenderingContext2D and (in the wrapper) DOM events.
//
// Exports:
//   projectGraph(nodes, cam, view)  PURE: rotate+project -> [{sx,sy,z,f}]
//   buildDrawList(proj, edges)      PURE: painter-sorted [{kind,...}] draw items
//   centerAndFit(nodes)             center a node cloud on its centroid; -> maxR
//   rotatePoint(p, yaw, pitch)      rotate one {x,y,z} by yaw(ry)+pitch(rx)
//   shadeColor(hex, t)              lighten(t>0)/darken(t<0) a hex -> "rgb(...)"
//   luminance(hex)                  0..1 perceived luminance (label contrast)
//   drawBall(ctx, item)             render one shaded sphere draw item
//   drawStick(ctx, item)           render one two-tone stick draw item
//   BallStickViewer                 stateful canvas wrapper (orbit/zoom/loop)
//   DEFAULT_VIEWER_OPTS             tunable defaults (read-only reference)
//
// Usage (batteries-included: a spinnable molecule/graph on a canvas):
//   import { BallStickViewer } from './systems/ball-stick-viewer.js';
//   const v = new BallStickViewer(document.getElementById('cv'), { autoRotate: true });
//   v.setGraph({
//     nodes: [
//       { x: 0, y: 0, z: 0, color: '#3c4456' },        // a carbon-ish node
//       { x: 1.16, y: 0, z: 0, color: '#ff4536' },     // an oxygen-ish node
//       { x: -1.16, y: 0, z: 0, color: '#ff4536' },
//     ],
//     edges: [ { a: 0, b: 1, order: 2 }, { a: 0, b: 2, order: 2 } ],
//   });
//   v.start();                                          // begins the rAF loop
//   // ... later: v.stop(); v.dispose();
//
// Usage (functional core: draw a projected graph into YOUR own render pass):
//   import { centerAndFit, projectGraph, buildDrawList, drawBall, drawStick }
//     from './systems/ball-stick-viewer.js';
//   const maxR = centerAndFit(nodes);                   // mutates nodes; returns extent
//   const baseScale = 0.42 * Math.min(W, H) / (maxR + 0.65);
//   const cam  = { yaw, pitch, zoom, focal: 9 };
//   const view = { cx: W / 2, cy: H / 2, baseScale };
//   const proj = projectGraph(nodes, cam, view);
//   const list = buildDrawList(proj, edges);
//   for (const it of list) it.kind === 'edge' ? drawStick(ctx, it) : drawBall(ctx, it);
//
// Contracts:
//   - projectGraph(nodes, cam, view) -> Array aligned with `nodes`, each entry
//     { x, y, z, f, sx, sy } where:
//       x,y,z : camera-space position after yaw(cam.yaw)+pitch(cam.pitch) rotation
//       f     : perspective foreshorten factor = focal/(focal - z) (clamped >0)
//       sx,sy : screen pixels = view.cx + x*baseScale*zoom*f (sy uses -y, screen-up)
//     cam  = { yaw, pitch, zoom=1, focal=9 }   (yaw=ry, pitch=rx, radians)
//     view = { cx, cy, baseScale }             (canvas center + model->px scale)
//   - buildDrawList(proj, edges, nodes?) -> painter-sorted (far->near) items:
//       node item: { kind:'node', i, sx, sy, z, f, color, radius }
//       edge item: { kind:'edge', a, b, order, A, B, colorA, colorB, width }
//     where A/B are the two projected endpoints. Edge depth is the endpoint
//     midpoint, nudged slightly behind so a stick draws under its end balls.
//     If `nodes` is omitted, per-item color/radius/width fall back to defaults
//     unless the edge/node already carries them.
//   - centerAndFit(nodes) mutates each node's x/y/z to subtract the centroid and
//     returns maxR (the largest distance from center) for fitting the camera.
//   - drawBall / drawStick take ONE draw item from buildDrawList plus a ctx; they
//     compute pixel radius/width from item.f and the scales baked into the item.
//     They are the ONLY canvas-touching functions -- override to retarget output.
//   - BallStickViewer(canvas, opts) owns: DPR resize, drag-inertia orbit, wheel
//     + pinch zoom, an rAF loop, and auto-rotate idle. Methods:
//       setGraph({ nodes, edges }) : load + center + fit a structure
//       start() / stop()           : begin / end the rAF loop
//       resetView()                : restore the default orbit + zoom
//       setAutoRotate(on)          : toggle idle auto-spin
//       setZoom(z) / zoomBy(k)     : absolute / multiplicative zoom (clamped)
//       renderOnce()               : draw a single frame (for static use)
//       dispose()                  : stop loop + remove all listeners
//     opts (merged over DEFAULT_VIEWER_OPTS): autoRotate, autoRotateSpeed,
//       yaw, pitch, zoom, minZoom, maxZoom, focal, fitFraction, dragSensitivity,
//       inertiaDamping, dpr, background, showLabels, labelOf.
//   - Renderer-agnostic core: projectGraph / buildDrawList / centerAndFit touch
//     no DOM or canvas. Only drawBall/drawStick and the wrapper touch a canvas.
//   - Offline only: no network, no imports beyond this module. Nothing to dispose
//     in the functional core; the wrapper's dispose() removes its listeners + loop.

export const DEFAULT_VIEWER_OPTS = Object.freeze({
  autoRotate: true,        // gentle idle spin when not dragging
  autoRotateSpeed: 0.006,  // radians/frame of idle yaw
  yaw: 0.55,               // initial orbit yaw   (ry)
  pitch: -0.32,            // initial orbit pitch (rx)
  zoom: 1,                 // initial zoom multiplier
  minZoom: 0.45,
  maxZoom: 4.5,
  focal: 9,                // perspective focal distance (model units)
  fitFraction: 0.42,       // fraction of min(W,H) the structure should fill
  dragSensitivity: 0.01,   // radians per drag-pixel
  inertiaDamping: 0.93,    // per-frame spin velocity retention after a flick
  dpr: 0,                  // 0 = auto (clamped 1..3); else forced
  background: null,        // null = transparent clear; else a fill style
  showLabels: false,       // draw labelOf(node,i) text on each ball
  labelOf: null,           // (node, i) => string  (used only if showLabels)
});

function num(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

const DEFAULT_NODE_RADIUS = 0.42;
const DEFAULT_STICK_WIDTH = 0.16;
const DEFAULT_NODE_COLOR = '#7c9cff';

// ---------- color helpers ----------

/**
 * Lighten (t>0, toward white) or darken (t<0, toward black) a "#rrggbb" hex by
 * fraction |t| (0..1). Returns an "rgb(r,g,b)" string. Used for sphere gradients
 * and the two-tone stick shading.
 */
export function shadeColor(hex, t) {
  const c = String(hex || DEFAULT_NODE_COLOR).replace('#', '');
  const r = parseInt(c.substr(0, 2), 16) || 0;
  const g = parseInt(c.substr(2, 2), 16) || 0;
  const b = parseInt(c.substr(4, 2), 16) || 0;
  const tgt = t >= 0 ? 255 : 0;
  const a = Math.min(1, Math.abs(num(t, 0)));
  const rr = Math.round(r + (tgt - r) * a);
  const gg = Math.round(g + (tgt - g) * a);
  const bb = Math.round(b + (tgt - b) * a);
  return 'rgb(' + rr + ',' + gg + ',' + bb + ')';
}

/**
 * Perceived luminance (0..1) of a "#rrggbb" hex. Handy to pick a readable label
 * color over a ball: luminance(color) > 0.58 ? dark text : light text.
 */
export function luminance(hex) {
  const c = String(hex || DEFAULT_NODE_COLOR).replace('#', '');
  const r = parseInt(c.substr(0, 2), 16) || 0;
  const g = parseInt(c.substr(2, 2), 16) || 0;
  const b = parseInt(c.substr(4, 2), 16) || 0;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// ---------- pure math ----------

/**
 * Rotate one model-space point { x, y, z } by yaw (around Y) then pitch (around
 * the new X). Mirrors the source's two-axis orbit. Returns a fresh point.
 */
export function rotatePoint(p, yaw, pitch) {
  const cyr = Math.cos(yaw), syr = Math.sin(yaw);
  const x1 = p.x * cyr + p.z * syr;
  const z1 = -p.x * syr + p.z * cyr;
  const y1 = p.y;
  const cxr = Math.cos(pitch), sxr = Math.sin(pitch);
  const y2 = y1 * cxr - z1 * sxr;
  const z2 = y1 * sxr + z1 * cxr;
  return { x: x1, y: y2, z: z2 };
}

/**
 * Center a node cloud on its centroid (mutates each node's x/y/z) and return
 * maxR, the largest distance of any node from the center. Use maxR to size the
 * camera so the structure fits the viewport.
 * @param {Array<{x:number,y:number,z:number}>} nodes
 * @returns {number} maxR (0 if empty)
 */
export function centerAndFit(nodes) {
  if (!nodes || nodes.length === 0) return 0;
  const n = nodes.length;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    cx += num(nodes[i].x, 0); cy += num(nodes[i].y, 0); cz += num(nodes[i].z, 0);
  }
  cx /= n; cy /= n; cz /= n;
  let maxR = 0;
  for (let i = 0; i < n; i++) {
    const node = nodes[i];
    node.x = num(node.x, 0) - cx;
    node.y = num(node.y, 0) - cy;
    node.z = num(node.z, 0) - cz;
    const d = Math.sqrt(node.x * node.x + node.y * node.y + node.z * node.z);
    if (d > maxR) maxR = d;
  }
  return maxR;
}

/**
 * Rotate + perspective-project every node into screen space. PURE -- touches no
 * canvas/DOM. Returns an array aligned with `nodes` (see the projectGraph
 * contract above for the entry shape).
 * @param {Array} nodes node list (already centered via centerAndFit if you want a fit)
 * @param {{yaw:number,pitch:number,zoom?:number,focal?:number}} cam orbit state
 * @param {{cx:number,cy:number,baseScale:number}} view canvas center + model->px scale
 * @returns {Array<{x,y,z,f,sx,sy}>}
 */
export function projectGraph(nodes, cam, view) {
  const out = [];
  if (!nodes) return out;
  const yaw = num(cam && cam.yaw, 0);
  const pitch = num(cam && cam.pitch, 0);
  const zoom = num(cam && cam.zoom, 1);
  const focal = num(cam && cam.focal, 9);
  const cx = num(view && view.cx, 0);
  const cy = num(view && view.cy, 0);
  const baseScale = num(view && view.baseScale, 1);
  for (let i = 0; i < nodes.length; i++) {
    const rp = rotatePoint(nodes[i], yaw, pitch);
    // Perspective foreshorten; clamp denominator so a node at/behind the focal
    // plane cannot explode or flip (mirrors a safe variant of the source).
    let denom = focal - rp.z;
    if (denom < 0.1) denom = 0.1;
    const f = focal / denom;
    out.push({
      x: rp.x, y: rp.y, z: rp.z, f,
      sx: cx + rp.x * baseScale * zoom * f,
      sy: cy - rp.y * baseScale * zoom * f, // screen y is down -> negate model y
    });
  }
  return out;
}

/**
 * Merge projected nodes + edges into ONE painter-sorted (far->near) draw list.
 * PURE -- touches no canvas/DOM. Each item carries everything drawBall/drawStick
 * need so the renderer pass is a flat loop. See the buildDrawList contract.
 * @param {Array} proj output of projectGraph (aligned with nodes)
 * @param {Array} edges edge list ({a,b,order?,colorA?,colorB?,width?})
 * @param {Array} [nodes] original nodes (for per-node color/radius + edge end colors)
 * @returns {Array} painter-sorted draw items
 */
export function buildDrawList(proj, edges, nodes) {
  const list = [];
  if (!proj) return list;
  const nodeColor = (i) => {
    const n = nodes && nodes[i];
    return (n && n.color) || DEFAULT_NODE_COLOR;
  };
  const nodeRadius = (i) => {
    const n = nodes && nodes[i];
    return num(n && n.radius, DEFAULT_NODE_RADIUS);
  };
  for (let i = 0; i < proj.length; i++) {
    const p = proj[i];
    list.push({
      kind: 'node', i,
      sx: p.sx, sy: p.sy, z: p.z, f: p.f,
      color: nodeColor(i), radius: nodeRadius(i),
    });
  }
  if (edges) {
    for (let e = 0; e < edges.length; e++) {
      const edge = edges[e];
      const a = edge.a | 0, b = edge.b | 0;
      const A = proj[a], B = proj[b];
      if (!A || !B) continue;
      list.push({
        kind: 'edge', a, b,
        order: Math.max(1, num(edge.order, 1) | 0),
        A, B,
        colorA: edge.colorA || nodeColor(a),
        colorB: edge.colorB || nodeColor(b),
        width: num(edge.width, DEFAULT_STICK_WIDTH),
        // Nudge the stick slightly behind its endpoints' midpoint so the end
        // balls draw on top of it (mirrors the source's -0.001 bias).
        z: (A.z + B.z) / 2 - 0.001,
      });
    }
  }
  // Painter's algorithm: smaller (more negative / farther) z draws first.
  list.sort((p, q) => p.z - q.z);
  return list;
}

// ---------- canvas-touching primitives (the only ones) ----------

// Draw a single two-tone capsule segment (dark base + light core) between two
// screen points. Internal helper for drawStick.
function strokeStick(ctx, x1, y1, x2, y2, color, width) {
  ctx.lineCap = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = shadeColor(color, -0.18);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.lineWidth = Math.max(1, width * 0.34);
  ctx.strokeStyle = shadeColor(color, 0.32);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

/**
 * Render ONE edge draw item (from buildDrawList) as a stick. Splits at the
 * endpoints' midpoint so each half takes its end's color; order 2/3 draws
 * parallel offset sticks (double/triple bonds). The pixel width derives from
 * the item.width and the per-end foreshorten f. CANVAS-touching -- override to
 * retarget. Pass scale = baseScale*zoom (the model->px factor); defaults to 1 if
 * the item already carries pixel-space data.
 */
export function drawStick(ctx, item, scale = 1) {
  const A = item.A, B = item.B;
  const ax = A.sx, ay = A.sy, bx = B.sx, by = B.sy;
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  const order = item.order || 1;
  // Width tapers with the average end foreshorten so far sticks look thinner.
  const w = item.width * scale * ((A.f + B.f) / 2);
  if (order >= 2) {
    const dx = bx - ax, dy = by - ay, len = Math.sqrt(dx * dx + dy * dy) || 1;
    const px = -dy / len, py = dx / len;
    const g = w * 0.52, sw = w * 0.46;
    const offsets = order >= 3 ? [g, 0, -g] : [g, -g];
    for (let k = 0; k < offsets.length; k++) {
      const ox = px * offsets[k], oy = py * offsets[k];
      strokeStick(ctx, ax + ox, ay + oy, mx + ox, my + oy, item.colorA, sw);
      strokeStick(ctx, mx + ox, my + oy, bx + ox, by + oy, item.colorB, sw);
    }
  } else {
    strokeStick(ctx, ax, ay, mx, my, item.colorA, w * 0.92);
    strokeStick(ctx, mx, my, bx, by, item.colorB, w * 0.92);
  }
}

/**
 * Render ONE node draw item (from buildDrawList) as a shaded sphere with a
 * radial gradient + specular highlight + dark rim. The pixel radius derives from
 * item.radius and the foreshorten item.f. Optionally draws a label (pass
 * label + showLabels). CANVAS-touching -- override to retarget. Pass scale =
 * baseScale*zoom (model->px); defaults to 1.
 */
export function drawBall(ctx, item, scale = 1, opts = {}) {
  const col = item.color || DEFAULT_NODE_COLOR;
  let r = item.radius * scale * item.f;
  if (r < 1) r = 1;
  const sx = item.sx, sy = item.sy;
  const grad = ctx.createRadialGradient(sx - r * 0.36, sy - r * 0.38, r * 0.1, sx, sy, r);
  grad.addColorStop(0, shadeColor(col, 0.55));
  grad.addColorStop(0.45, col);
  grad.addColorStop(1, shadeColor(col, -0.5));
  ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = shadeColor(col, -0.62); ctx.stroke();
  // specular highlight
  ctx.beginPath(); ctx.arc(sx - r * 0.34, sy - r * 0.36, r * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
  if (opts.showLabels && typeof opts.label === 'string' && opts.label.length) {
    ctx.fillStyle = luminance(col) > 0.58 ? '#11151f' : '#ffffff';
    ctx.font = '700 ' + Math.max(9, r * 0.95).toFixed(0) + 'px -apple-system,Helvetica,Arial,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(opts.label, sx, sy + r * 0.04);
  }
}

// ---------- stateful wrapper ----------

/**
 * Batteries-included ball-and-stick viewer bound to a <canvas>. Owns the orbit
 * state (drag inertia + idle auto-rotate), DPR-aware resize, wheel + pinch zoom,
 * and an rAF loop. Load a structure with setGraph({ nodes, edges }) then start().
 */
export class BallStickViewer {
  constructor(canvas, opts = {}) {
    if (!canvas) throw new Error('BallStickViewer: a <canvas> is required');
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    const o = {};
    for (const k in DEFAULT_VIEWER_OPTS) o[k] = DEFAULT_VIEWER_OPTS[k];
    if (opts) for (const k in opts) o[k] = opts[k];
    this.opts = o;

    this._dpr = o.dpr > 0 ? o.dpr : Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    this.W = 0; this.H = 0; this.cx = 0; this.cy = 0; this.baseScale = 1;

    // orbit state
    this.yaw = num(o.yaw, 0);       // ry
    this.pitch = num(o.pitch, 0);   // rx
    this.vyaw = 0; this.vpitch = 0; // spin velocity (inertia)
    this.zoom = num(o.zoom, 1);
    this.autoRotate = !!o.autoRotate;

    this.nodes = [];
    this.edges = [];
    this.maxR = 0;

    this._dragging = false;
    this._lastX = 0; this._lastY = 0;
    this._lastPinch = 0;
    this._rafId = 0;
    this._running = false;

    this._bind();
    this.resize();
  }

  /**
   * Load a structure. nodes are CENTERED + FIT in place. Resets the orbit to the
   * configured defaults so a freshly loaded structure faces the camera.
   * @param {{nodes:Array, edges?:Array}} graph
   */
  setGraph(graph) {
    const nodes = (graph && graph.nodes) || [];
    // Copy so centering doesn't surprise the caller's source objects.
    this.nodes = nodes.map((n) => ({
      x: num(n.x, 0), y: num(n.y, 0), z: num(n.z, 0),
      color: n.color || DEFAULT_NODE_COLOR,
      radius: num(n.radius, DEFAULT_NODE_RADIUS),
      label: n.label,
      ...n,
    }));
    this.edges = ((graph && graph.edges) || []).map((e) => ({ ...e }));
    this.maxR = centerAndFit(this.nodes);
    this.resetView();
    this.resize();
    return this;
  }

  /** Restore the configured default orbit yaw/pitch + zoom and kill any spin. */
  resetView() {
    this.yaw = num(this.opts.yaw, 0);
    this.pitch = num(this.opts.pitch, 0);
    this.vyaw = 0; this.vpitch = 0;
    this.zoom = num(this.opts.zoom, 1);
    return this;
  }

  setAutoRotate(on) { this.autoRotate = !!on; return this; }

  setZoom(z) {
    this.zoom = Math.max(this.opts.minZoom, Math.min(this.opts.maxZoom, num(z, this.zoom)));
    return this;
  }
  zoomBy(k) { return this.setZoom(this.zoom * num(k, 1)); }

  /** Recompute canvas pixel size (DPR) + the model->screen fit scale. */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width || this.canvas.clientWidth || 800);
    const h = Math.max(1, rect.height || this.canvas.clientHeight || 600);
    this.W = w; this.H = h;
    this.canvas.width = Math.round(w * this._dpr);
    this.canvas.height = Math.round(h * this._dpr);
    this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    this.cx = w / 2; this.cy = h / 2;
    this.baseScale = this.maxR > 0
      ? num(this.opts.fitFraction, 0.42) * Math.min(w, h) / (this.maxR + 0.65)
      : 1;
    return this;
  }

  /** Draw exactly one frame (no loop). Use for static structures. */
  renderOnce() {
    const ctx = this.ctx;
    if (this.opts.background) { ctx.fillStyle = this.opts.background; ctx.fillRect(0, 0, this.W, this.H); }
    else ctx.clearRect(0, 0, this.W, this.H);
    if (!this.nodes.length) return this;
    const cam = { yaw: this.yaw, pitch: this.pitch, zoom: this.zoom, focal: num(this.opts.focal, 9) };
    const view = { cx: this.cx, cy: this.cy, baseScale: this.baseScale };
    const proj = projectGraph(this.nodes, cam, view);
    const list = buildDrawList(proj, this.edges, this.nodes);
    const scale = this.baseScale * this.zoom;
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (it.kind === 'edge') {
        drawStick(ctx, it, scale);
      } else {
        drawBall(ctx, it, scale, {
          showLabels: this.opts.showLabels,
          label: this._labelFor(it.i),
        });
      }
    }
    return this;
  }

  _labelFor(i) {
    if (!this.opts.showLabels) return '';
    if (typeof this.opts.labelOf === 'function') return this.opts.labelOf(this.nodes[i], i) || '';
    const n = this.nodes[i];
    return (n && typeof n.label === 'string') ? n.label : '';
  }

  // Advance the orbit one frame: apply spin inertia + idle auto-rotate.
  _stepOrbit() {
    if (!this._dragging) {
      this.yaw += this.vyaw; this.pitch += this.vpitch;
      const d = num(this.opts.inertiaDamping, 0.93);
      this.vyaw *= d; this.vpitch *= d;
      if (Math.abs(this.vyaw) < 1e-4) this.vyaw = 0;
      if (Math.abs(this.vpitch) < 1e-4) this.vpitch = 0;
      if (this.autoRotate) this.yaw += num(this.opts.autoRotateSpeed, 0.006);
    }
  }

  /** Begin the requestAnimationFrame render loop. */
  start() {
    if (this._running) return this;
    this._running = true;
    const tick = () => {
      if (!this._running) return;
      this._stepOrbit();
      this.renderOnce();
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
    return this;
  }

  /** Stop the render loop (keeps state + listeners; call start() to resume). */
  stop() {
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = 0;
    return this;
  }

  // ----- input -----
  _down(x, y) {
    this._dragging = true; this._lastX = x; this._lastY = y;
    this.vyaw = 0; this.vpitch = 0;
  }
  _move(x, y) {
    if (!this._dragging) return;
    const s = num(this.opts.dragSensitivity, 0.01);
    const dx = x - this._lastX, dy = y - this._lastY;
    this._lastX = x; this._lastY = y;
    this.yaw += dx * s; this.pitch += dy * s;
    this.vyaw = dx * s; this.vpitch = dy * s; // seed inertia for the flick
  }
  _up() { this._dragging = false; }

  _bind() {
    const cv = this.canvas;
    this._onMouseDown = (e) => this._down(e.clientX, e.clientY);
    this._onMouseMove = (e) => this._move(e.clientX, e.clientY);
    this._onMouseUp = () => this._up();
    this._onTouchStart = (e) => {
      if (e.touches.length === 1) this._down(e.touches[0].clientX, e.touches[0].clientY);
      e.preventDefault();
    };
    this._onTouchMove = (e) => {
      if (e.touches.length === 1) {
        this._move(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 2) {
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY);
        if (this._lastPinch) this.zoomBy(1 + (d - this._lastPinch) * 0.005);
        this._lastPinch = d;
      }
      e.preventDefault();
    };
    this._onTouchEnd = (e) => { this._up(); if (e.touches.length < 2) this._lastPinch = 0; };
    this._onWheel = (e) => {
      e.preventDefault();
      this.zoomBy(e.deltaY < 0 ? 1.1 : 0.9);
    };
    this._onResize = () => this.resize();

    cv.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    cv.addEventListener('touchstart', this._onTouchStart, { passive: false });
    cv.addEventListener('touchmove', this._onTouchMove, { passive: false });
    cv.addEventListener('touchend', this._onTouchEnd);
    cv.addEventListener('wheel', this._onWheel, { passive: false });
    window.addEventListener('resize', this._onResize);
  }

  /** Stop the loop and remove every listener. Safe to call more than once. */
  dispose() {
    this.stop();
    const cv = this.canvas;
    cv.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    cv.removeEventListener('touchstart', this._onTouchStart);
    cv.removeEventListener('touchmove', this._onTouchMove);
    cv.removeEventListener('touchend', this._onTouchEnd);
    cv.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('resize', this._onResize);
  }
}

// END mChatAI Web Component: systems.ball-stick-viewer-3d
