// BEGIN mChatAI Web Component: core.iso-projector
//
// A DEPENDENCY-FREE ISOMETRIC (faux-3D) PROJECTOR for a plain 2D canvas — NO
// three.js, NO WebGL, NO DOM, NO external deps. It is the math + draw kit behind
// a classic "2.5D" tile board: a tower-defense lane, a sim/city grid, a tactics
// map, a base-builder, a board game seen at a top-down-ish 3/4 angle. You give it
// a grid (COLS x ROWS) and it gives you three things every iso board needs:
//
//   1. world(col,row,height) -> screen          projection (toScreen / projIso)
//   2. screen(px,py)         -> world(col,row)   inverse pick (screenToCell)
//   3. correct BACK-TO-FRONT depth ordering      (depthOf / sortByDepth)
//
// ...plus a small set of LIT primitives (extruded box, cylinder, soft ground
// shadow, filled poly) so tiles, towers, creeps, props and pickups read as solid
// 3D objects instead of flat sprites. The PURE math (projection + inverse pick +
// depth key) is kept SEPARATE from the drawing helpers so you can use just the
// transform with your own renderer, or use the whole kit as a batteries-included
// board.
//
// Coordinate convention (matches the proven iso-towers build it was extracted
// from): world X = column (wx), world Z = row (wz), world Y = up (height). The
// board is centered on the origin and the camera looks down a fixed iso angle
// tuned to "top-down-ish" via three half-units:
//   HW  half tile WIDTH  in screen px (x spread per cell)
//   HH  half tile HEIGHT in screen px (y spread per cell — smaller => flatter)
//   VH  vertical unit     in screen px (screen rise per 1.0 of world height Y)
// Larger HW/HH = bigger tiles; HH/HW ratio sets how steep the angle looks; VH
// sets how tall extrusions appear. A View {cx, cy, zoom} pans/scales the whole
// board in screen space (set cx,cy to the board's screen center).
//
// Renderer-agnostic core: projIso / toScreen / screenToCell / depthOf /
// sortByDepth never touch a canvas — they are pure functions of an IsoProjector's
// numbers. The draw helpers DO take a CanvasRenderingContext2D, but they are
// optional; skip them entirely if you render with sprites or your own shapes.
// Owns no GPU/DOM resources => no dispose().
//
// Exports:
//   IsoProjector                  stateful board transform (build once, fit() on resize)
//   makeIsoProjector(opts)        functional factory -> IsoProjector
//   DEFAULT_ISO_OPTS              tunable defaults (read-only reference)
//   projIso(iso, wx, wz, y)       world -> screen, BEFORE the view pan/zoom (board space)
//   toScreen(iso, wx, wz, y)      world -> final screen px (AFTER view pan/zoom)
//   screenToCell(iso, sx, sy)     final screen px -> { c, r, wx, wz } (inverse pick)
//   depthOf(wx, wz)               painter's-sort key (wx + wz); bigger = nearer the camera
//   sortByDepth(items, keyFn)     stable back-to-front sort for a draw list
//   colorUtil { hexToRgb, shade, rgba }   tiny color kit for lit faces
//   drawPoly(ctx, pts, fill, stroke, lw)  fill/stroke a polygon of {x,y} points
//   drawIsoBox(iso, ctx, opts)    extruded lit cuboid (tile, wall, tower body, creep)
//   drawIsoCylinder(iso, ctx, opts)  lit cylinder (turret base, pillar, barrel)
//   drawIsoShadow(iso, ctx, opts) soft elliptical ground shadow under an entity
//
// Usage (a tower-defense / sim board, fit to the window):
//   import { IsoProjector, drawIsoBox, drawIsoShadow } from './core/iso-projector.js';
//   const iso = new IsoProjector({ cols: 11, rows: 9 });
//   function layout(){ iso.fit(canvas.clientWidth, canvas.clientHeight); }
//   addEventListener('resize', layout); layout();
//   // draw a tile grid (back-to-front is automatic for a flat grid loop):
//   for (let s = 0; s <= iso.cols + iso.rows; s++)
//     for (let c = 0; c < iso.cols; c++){ const r = s - c; if (r<0||r>=iso.rows) continue;
//       const A=iso.projIso(c,r,0), B=iso.projIso(c+1,r,0), C=iso.projIso(c+1,r+1,0), D=iso.projIso(c,r+1,0);
//       drawPoly(ctx, [A,B,C,D], (c+r)&1 ? '#3f8f4e' : '#469a55'); }
//   // place a tower at cell (4,2), 0.6 high, depth-sorted with creeps:
//   const list = [];
//   list.push({ key: iso.depthOf(4.5, 2.5), draw: () => drawIsoBox(iso, ctx, { wx:4.5, wz:2.5, w:0.6, d:0.6, h:0.6, color:'#ff9b3d' }) });
//   for (const e of creeps) list.push({ key: iso.depthOf(e.x, e.z) + 0.5, draw: () => drawIsoBox(iso, ctx, { wx:e.x, wz:e.z, w:0.4, d:0.4, h:0.4, color:e.color }) });
//   iso.sortByDepth(list).forEach(o => o.draw());
//
// Usage (the render TRANSFORM is set on the context so HUD math stays in css px):
//   ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w*dpr,h*dpr);
//   iso.applyTransform(ctx, dpr);          // pan + zoom baked into ctx; draw board space
//   ...draw tiles / boxes using iso.projIso(...)...
//   ctx.setTransform(dpr,0,0,dpr,0,0);     // back to screen space for HP bars / labels
//   const s = iso.toScreen(creep.x, creep.z, creep.h); ...draw bar at s.x, s.y...
//
// Usage (just the picker — point and click to a grid cell, no drawing kit):
//   canvas.addEventListener('pointerdown', ev => {
//     const r = canvas.getBoundingClientRect();
//     const cell = iso.screenToCell(ev.clientX - r.left, ev.clientY - r.top);
//     if (cell.c >= 0 && cell.c < iso.cols && cell.r >= 0 && cell.r < iso.rows)
//       onPick(cell.c, cell.r);            // also cell.wx / cell.wz for fractional position
//   });
//
// Contracts:
//   - new IsoProjector(opts) / makeIsoProjector(opts): all opts optional, merged
//     over DEFAULT_ISO_OPTS:
//       cols, rows : board dimensions in cells (>= 1). Default 11 x 9.
//       hw, hh, vh : half-width, half-height, vertical-unit in screen px
//                    (see the angle/scale note above). Defaults 42, 30, 34.
//       zoom       : extra screen scale on top of hw/hh/vh. Default 1.
//       cx, cy     : screen-space center the board projects around (the view pan).
//                    Default 0,0 — call fit() or set these to center on a canvas.
//   - iso.projIso(wx, wz, y) -> { x, y }: BOARD-space projection (no pan/zoom),
//     suitable for ctx after applyTransform(). wx is column, wz is row, y is
//     height up. y defaults to 0 (ground).
//   - iso.toScreen(wx, wz, y) -> { x, y }: FINAL screen px, with view.cx/cy + zoom
//     applied. Use when the ctx is in identity screen space (HUD pass).
//   - iso.screenToCell(sx, sy) -> { c, r, wx, wz }: inverse of toScreen at y=0.
//     c/r are INTEGER cell indices (Math.floor; may be out of [0,cols)/[0,rows)
//     — the caller bounds-checks). wx/wz are the FRACTIONAL world position (cell +
//     fraction) for sub-cell placement. Inverse is exact for the ground plane;
//     for picking raised geometry, treat it as ground-plane pick.
//   - DEPTH / PAINTER'S SORT: depthOf(wx, wz) = wx + wz. In this iso convention a
//     LARGER sum is nearer the camera, so draw ascending (small first). Static
//     tiles drawn in a diagonal loop (s = c + r, ascending) are already ordered;
//     use sortByDepth for the DYNAMIC draw list (towers/creeps/projectiles) and
//     bias entities that should sit ON TOP of a tile by a small +epsilon on the
//     key (e.g. +0.5 for movers over towers). sortByDepth is STABLE.
//   - fit(viewW, viewH, opts?): recompute zoom + center so the whole board fits a
//     viewport. opts: { padX, padY, maxZoom, minZoom, offsetY }. Mutates the
//     projector (zoom, cx, cy) and returns it.
//   - applyTransform(ctx, dpr=1): set ctx transform to bake in dpr * zoom and the
//     view pan, so subsequent projIso() draws land correctly. Caller restores to
//     screen space (setTransform(dpr,0,0,dpr,0,0)) for the HUD pass.
//   - DRAW HELPERS (optional, need a CanvasRenderingContext2D; assume the ctx is
//     already in board space via applyTransform):
//       drawPoly(ctx, pts, fill?, stroke?, lw?)  pts = [{x,y}, ...]
//       drawIsoBox(iso, ctx, { wx, wz, w, d, h, color, yBase=0, top?, stroke? })
//         an extruded cuboid centered at (wx,wz); two side faces are auto-shaded
//         darker than the lit top so it reads 3D.
//       drawIsoCylinder(iso, ctx, { wx, wz, rad, h, top, side, yBase=0 })
//       drawIsoShadow(iso, ctx, { wx, wz, rad, alpha=0.26 })
//     All colors are '#rgb'/'#rrggbb' strings; shade()/rgba() handle the rest.
//   - PURE + offline: projIso/toScreen/screenToCell/depthOf/sortByDepth never
//     touch the DOM/canvas/GPU. The kit owns nothing to dispose.
//   - 2.5D by design: this is a fixed-angle fake-3D projector, NOT a real camera.
//     For free orbit/perspective use core.lowpoly-canvas3d; for WebGL use the
//     three.js core engines. Pair this with core.three-game-loop's dependency-free
//     timing if you want a fixed-timestep loop, or run your own RAF.

export const DEFAULT_ISO_OPTS = Object.freeze({
  cols: 11,
  rows: 9,
  hw: 42,   // half tile width  (screen px)
  hh: 30,   // half tile height (screen px) — HH/HW sets the iso angle
  vh: 34,   // vertical unit    (screen px per 1.0 world height)
  zoom: 1,
  cx: 0,    // screen-space board center X (view pan)
  cy: 0     // screen-space board center Y (view pan)
});

function num(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

// ---------- color kit (tiny, for lit faces) ----------
function hexToRgb(h) {
  h = String(h).replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0
  };
}
/// Multiply a hex color's channels by f (clamped 0..255) -> 'rgb(...)'. f<1 darkens a face, f>1 highlights it.
function shade(hex, f) {
  const c = hexToRgb(hex);
  const g = v => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${g(c.r)},${g(c.g)},${g(c.b)})`;
}
/// Hex color at alpha a -> 'rgba(...)'. For range circles, glows, tints.
function rgba(hex, a) {
  const c = hexToRgb(hex);
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}
export const colorUtil = Object.freeze({ hexToRgb, shade, rgba });

// ---------- pure projection / pick / depth ----------

/// World (column wx, row wz, height y) -> BOARD-space screen point (no view pan/zoom).
/// y defaults to 0 (ground plane). Use after applyTransform() bakes pan/zoom into ctx.
export function projIso(iso, wx, wz, y) {
  const cx = wx - iso.cols / 2;
  const cz = wz - iso.rows / 2;
  return {
    x: (cx - cz) * iso.hw,
    y: (cx + cz) * iso.hh - (y || 0) * iso.vh
  };
}

/// World -> FINAL screen px, with the view pan (cx,cy) and zoom applied. Use when
/// the canvas ctx is in identity screen space (e.g. the HUD pass).
export function toScreen(iso, wx, wz, y) {
  const p = projIso(iso, wx, wz, y);
  return { x: iso.cx + p.x * iso.zoom, y: iso.cy + p.y * iso.zoom };
}

/// FINAL screen px -> world cell. Inverse of toScreen at the ground plane (y=0).
/// Returns integer cell { c, r } (floored, NOT bounds-checked) plus the fractional
/// world position { wx, wz } for sub-cell placement.
export function screenToCell(iso, sx, sy) {
  const z = iso.zoom || 1;
  const ix = (sx - iso.cx) / z;
  const iy = (sy - iso.cy) / z;
  const a = ix / iso.hw;
  const b = iy / iso.hh;
  const cx = (a + b) / 2;
  const cz = (b - a) / 2;
  const wx = cx + iso.cols / 2;
  const wz = cz + iso.rows / 2;
  return { c: Math.floor(wx), r: Math.floor(wz), wx, wz };
}

/// Painter's-algorithm sort key for an entity at (wx,wz). LARGER = nearer the
/// camera in this iso convention, so draw a list ascending (small key first).
export function depthOf(wx, wz) {
  return wx + wz;
}

/// Stable back-to-front sort of a draw list. keyFn(item) -> number (default
/// item.key); items with a SMALLER key (farther) draw first. Returns the SAME
/// array (sorted in place) for convenient chaining.
export function sortByDepth(items, keyFn) {
  const k = typeof keyFn === 'function' ? keyFn : (it => num(it && it.key, 0));
  // Decorate-sort-undecorate to keep the sort stable across engines.
  const tagged = items.map((it, i) => ({ it, i, d: k(it) }));
  tagged.sort((a, b) => (a.d - b.d) || (a.i - b.i));
  for (let i = 0; i < tagged.length; i++) items[i] = tagged[i].it;
  return items;
}

// ---------- optional draw helpers (CanvasRenderingContext2D) ----------

/// Fill/stroke a closed polygon of {x,y} points. fill/stroke are optional css
/// color strings; lw is the stroke width.
export function drawPoly(ctx, pts, fill, stroke, lw) {
  if (!pts || pts.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
}

/// Extruded LIT cuboid centered at (wx,wz), base at yBase, rising by h. The +x
/// and +z side faces are auto-shaded darker than the lit top so it reads 3D.
/// opts: { wx, wz, w, d, h, color, yBase=0, top?, stroke? }.
export function drawIsoBox(iso, ctx, opts) {
  const wx = num(opts.wx, 0), wz = num(opts.wz, 0);
  const w = num(opts.w, 1), d = num(opts.d, 1), h = num(opts.h, 1);
  const yBase = num(opts.yBase, 0);
  const base = opts.color || '#888888';
  const hw = w / 2, hd = d / 2;
  const B = projIso(iso, wx + hw, wz - hd, yBase);
  const C = projIso(iso, wx + hw, wz + hd, yBase);
  const D = projIso(iso, wx - hw, wz + hd, yBase);
  const At = projIso(iso, wx - hw, wz - hd, yBase + h);
  const Bt = projIso(iso, wx + hw, wz - hd, yBase + h);
  const Ct = projIso(iso, wx + hw, wz + hd, yBase + h);
  const Dt = projIso(iso, wx - hw, wz + hd, yBase + h);
  drawPoly(ctx, [B, C, Ct, Bt], shade(base, 0.74));                       // +x face (right, in shade)
  drawPoly(ctx, [D, C, Ct, Dt], shade(base, 0.56));                       // +z face (front, darkest)
  const top = opts.top || shade(base, 1.12);
  drawPoly(ctx, [At, Bt, Ct, Dt], top, opts.stroke || shade(base, 1.3), 1); // top (lit)
}

/// Approximate LIT cylinder at (wx,wz): a billboarded body + an elliptical top
/// cap, sized in world units (rad). opts: { wx, wz, rad, h, top, side, yBase=0 }.
export function drawIsoCylinder(iso, ctx, opts) {
  const wx = num(opts.wx, 0), wz = num(opts.wz, 0);
  const rad = num(opts.rad, 0.5), h = num(opts.h, 1);
  const yBase = num(opts.yBase, 0);
  const side = opts.side || '#666666';
  const top = opts.top || '#999999';
  const b = projIso(iso, wx, wz, yBase);
  const t = projIso(iso, wx, wz, yBase + h);
  const rx = rad * iso.hw, ry = rad * iso.hh;
  // side wall
  ctx.beginPath();
  ctx.moveTo(b.x - rx, b.y);
  ctx.lineTo(t.x - rx, t.y);
  ctx.ellipse(t.x, t.y, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(b.x + rx, b.y);
  ctx.ellipse(b.x, b.y, rx, ry, 0, 0, Math.PI, false);
  ctx.closePath();
  ctx.fillStyle = side; ctx.fill();
  // top cap
  ctx.beginPath();
  ctx.ellipse(t.x, t.y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = top; ctx.fill();
}

/// Soft elliptical ground shadow under an entity at (wx,wz), radius rad (world
/// units). opts: { wx, wz, rad, alpha=0.26 }.
export function drawIsoShadow(iso, ctx, opts) {
  const wx = num(opts.wx, 0), wz = num(opts.wz, 0);
  const rad = num(opts.rad, 0.35);
  const alpha = num(opts.alpha, 0.26);
  const p = projIso(iso, wx, wz, 0);
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, rad * iso.hw, rad * iso.hh, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.fill();
}

// ---------- stateful projector ----------

/**
 * Build an isometric board projector. See the makeIsoProjector / IsoProjector
 * contract above. All opts optional, merged over DEFAULT_ISO_OPTS.
 * @returns {IsoProjector}
 */
export function makeIsoProjector(opts = {}) {
  return new IsoProjector(opts);
}

export class IsoProjector {
  constructor(opts = {}) {
    this.cols = Math.max(1, Math.floor(num(opts.cols, DEFAULT_ISO_OPTS.cols)));
    this.rows = Math.max(1, Math.floor(num(opts.rows, DEFAULT_ISO_OPTS.rows)));
    this.hw = num(opts.hw, DEFAULT_ISO_OPTS.hw);
    this.hh = num(opts.hh, DEFAULT_ISO_OPTS.hh);
    this.vh = num(opts.vh, DEFAULT_ISO_OPTS.vh);
    this.zoom = num(opts.zoom, DEFAULT_ISO_OPTS.zoom);
    this.cx = num(opts.cx, DEFAULT_ISO_OPTS.cx);
    this.cy = num(opts.cy, DEFAULT_ISO_OPTS.cy);
    // Remember the authored base half-units so fit() can re-derive zoom cleanly.
    this._baseHw = this.hw;
    this._baseHh = this.hh;
  }

  // --- pure transforms (delegate to the functional core so behaviour is one source) ---
  projIso(wx, wz, y) { return projIso(this, wx, wz, y); }
  toScreen(wx, wz, y) { return toScreen(this, wx, wz, y); }
  screenToCell(sx, sy) { return screenToCell(this, sx, sy); }
  depthOf(wx, wz) { return depthOf(wx, wz); }
  sortByDepth(items, keyFn) { return sortByDepth(items, keyFn); }

  /// True if (c,r) is inside the board bounds.
  inBounds(c, r) { return c >= 0 && c < this.cols && r >= 0 && r < this.rows; }

  /**
   * Recompute zoom + center so the whole board fits a viewport (viewW x viewH px).
   * opts: { padX=48, padY=220, maxZoom=1.18, minZoom=0.42, offsetY=18 } (the
   * defaults match the iso-towers source: a little headroom for a top HUD + a
   * bottom dock). Mutates this and returns this.
   */
  fit(viewW, viewH, opts = {}) {
    const padX = num(opts.padX, 48);
    const padY = num(opts.padY, 220);
    const maxZoom = num(opts.maxZoom, 1.18);
    const minZoom = num(opts.minZoom, 0.42);
    const offsetY = num(opts.offsetY, 18);
    this.hw = this._baseHw;
    this.hh = this._baseHh;
    const isoW = (this.cols + this.rows) * this.hw;
    const isoH = (this.cols + this.rows) * this.hh + 150;
    let z = Math.min((viewW - padX) / isoW, (viewH - padY) / isoH, maxZoom);
    z = Math.max(minZoom, z);
    this.zoom = z;
    this.cx = viewW / 2;
    this.cy = viewH * 0.5 + offsetY;
    return this;
  }

  /**
   * Set the canvas transform so subsequent projIso() draws land in board space
   * with the view pan + zoom (and an optional devicePixelRatio) baked in. After
   * drawing the board, restore screen space yourself with
   * ctx.setTransform(dpr,0,0,dpr,0,0) for the HUD/label pass.
   */
  applyTransform(ctx, dpr = 1) {
    const s = this.zoom * dpr;
    ctx.setTransform(s, 0, 0, s, this.cx * dpr, this.cy * dpr);
  }
}

// END mChatAI Web Component: core.iso-projector
