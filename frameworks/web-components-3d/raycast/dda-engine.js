// BEGIN mChatAI Web Component: raycast.dda-engine
//
// DDA Grid Raycaster Engine -- a pure 2D-canvas, Wolfenstein/Doom-style 2.5D
// software wall caster. ZERO three.js, ZERO WebGL, ZERO external dependencies,
// fully offline. It is a PURE RENDERER: it paints into a CanvasRenderingContext2D
// you supply, from a player {x,y,angle} state computed elsewhere (the engine
// does NO motion integration -- the caller does delta-time movement and hands in
// the result). The grid is a string/array tile map passed in. This is the single
// most-repeated engine across the harvested raycaster games, generalized so it is
// reusable across many of them rather than welded to one map or texture set.
//
// Lifted + cleaned from the proven shipped builds (no new math invented):
//   - textured drawImage slice + Float32Array z-buffer write .. bunker-escape-raycaster
//   - procedural fillRect columns + 1/(1+d*d*k) fog + vertical mortar .. crypt-of-the-bone-lord
//   - the camera-basis / fisheye-corrected perpendicular distance .. aztec-temple-raycaster
//   - capped distance fog + flicker light shade(hex,light) .. bunker-z-last-light
//
// TWO PLUGGABLE COLUMN FLAVORS (selected per call via opts):
//   (a) TEXTURED  -- pass opts.texFor(tile) -> a per-tile texture source
//       (HTMLCanvasElement / image). Each column is painted with one
//       ctx.drawImage(tex, texX,0,1,texSize, x,drawStart,1,lineHeight) slice,
//       using the canonical two-side texX mirror correction. Distance/side
//       darkening is laid over the slice as a translucent fillRect (cheap fog).
//   (b) PROCEDURAL -- pass opts.shade(tile, perp, side, light) -> a CSS color
//       string. Each column is a single ctx.fillRect; the callback applies its
//       own distance fog (the classic fog = 1/(1+perp*perp*k) flavor), side
//       darkening, and a light term. A built-in shadeColor(hex, light) helper
//       (the bunker-z hex*light shade) is exported for that callback to use.
//   If neither is provided a built-in flat procedural shader runs so the engine
//   always draws something.
//
// Z-BUFFER CONTRACT (with raycast.sprite-billboards):
//   renderWalls() returns the SAME Float32Array instance it filled -- one perp
//   distance per screen column (fisheye-corrected). raycast.sprite-billboards
//   consumes exactly this array for per-column occlusion: a sprite stripe is
//   drawn only where spriteDepth < zbuffer[column]. Always pass the array
//   returned by renderWalls() straight into the sprite pass of the SAME frame.
//   It is re-allocated on resize (see resize()), so re-fetch it after a resize.
//
// KEY EXPORTS
//   cameraBasis(angle, fovScale=0.66) -> {dirX,dirY,planeX,planeY}
//   castColumn(px,py,dirX,dirY,planeX,planeY,cameraX,grid,opts) -> {perp,side,wallX,mapX,mapY,tile}
//   renderBackground(ctx, opts)
//   renderWalls(ctx, player, grid, opts) -> Float32Array  (the z-buffer)
//   isSolid(grid, x, y) -> boolean        (default solidity test; override via opts)
//   shadeColor(hex, light) -> 'rgb(r,g,b)'
//   DDARaycaster                          (optional convenience wrapper that owns
//                                          the canvas + zbuffer + resize + an
//                                          OPTIONAL drag-look helper)
//
// USAGE (textured, manual)
//   import { cameraBasis, renderBackground, renderWalls } from './dda-engine.js';
//   const grid = ['111111','100001','100001','111111'];   // strings or 2D arrays
//   const tex  = { 1: stoneCanvas, 2: doorCanvas };
//   // per frame, after YOU moved the player (delta-time) elsewhere:
//   renderBackground(ctx, { width: cv.width, height: cv.height });
//   const zbuf = renderWalls(ctx, player, grid, {
//     width: cv.width, height: cv.height, texSize: 64, fovScale: 0.66,
//     texFor: (t) => tex[t] || tex[1]
//   });
//   spriteBillboards.render(ctx, player, sprites, zbuf, {...});   // occlusion
//
// USAGE (procedural)
//   const zbuf = renderWalls(ctx, player, grid, {
//     width: cv.width, height: cv.height, fovScale: 0.66, fogK: 0.018,
//     shade: (tile, perp, side, light) => {
//       const fog = 1 / (1 + perp * perp * 0.018);
//       const s = (side === 1 ? 0.72 : 1) * fog * light;
//       return shadeColor(tile === 2 ? '#9c6a2c' : '#6b6660', s);
//     }
//   });
//
// USAGE (convenience wrapper with drag-look)
//   const ray = new DDARaycaster(canvas, { fovScale: 0.66, texSize: 64 });
//   ray.onLook = (dyaw) => { player.angle += dyaw; };   // drag/touch look
//   // per frame:
//   ray.renderBackground();
//   const zbuf = ray.renderWalls(player, grid, { texFor });
//   ...sprites...
//   ray.dispose();   // when done -- detaches its listeners
//
// CONTRACTS / NOTES
//   - PURE renderer: never integrates motion; player {x,y,angle} comes from caller.
//   - devicePixelRatio is clamped to <= 2 for the backing store.
//   - column count == backing-store width; the zbuffer is (re)allocated on resize.
//   - NEVER uses requestPointerLock. The optional look helper is accumulated
//     drag-look (pointerdown + pointermove, movementX) that also works on touch.
//   - ASCII only; no smart quotes / em-dashes / emoji.

// ---------------------------------------------------------------------------
// grid helpers
// ---------------------------------------------------------------------------

/// Read a tile from a grid that may be a 2D array (numbers) or an array of
/// strings (chars). Out-of-bounds reads return 1 (treat the void as solid wall)
/// so rays always terminate. String chars come back as their char-code-derived
/// small int via the digit fast path, else the raw char is returned.
export function tileAt(grid, x, y) {
  if (x < 0 || y < 0) return 1;
  const row = grid[y];
  if (row === undefined) return 1;
  const cell = row[x];
  if (cell === undefined) return 1;
  if (typeof cell === 'string') {
    // common case: numeric tile chars '0'..'9'
    if (cell >= '0' && cell <= '9') return cell.charCodeAt(0) - 48;
    if (cell === ' ' || cell === '.') return 0; // common "empty" chars
    return cell; // a named char tile (e.g. '#','D','T') -- caller's isSolid decides
  }
  return cell;
}

/// Default solidity test: any non-zero, non-empty tile is solid. Override via
/// opts.isSolid(grid, x, y) for doors / transparent / one-sided tiles.
export function isSolid(grid, x, y) {
  const t = tileAt(grid, x, y);
  if (t === 0) return false;
  if (t === ' ' || t === '.' || t === '0') return false;
  return true;
}

// ---------------------------------------------------------------------------
// shading helper (bunker-z: hex * light)
// ---------------------------------------------------------------------------

/// shadeColor('#rrggbb', light) -> 'rgb(r,g,b)'. light in [0..1] (values > 1
/// allowed to brighten). The canonical bunker-z shade used by procedural columns.
export function shadeColor(hex, light) {
  let n;
  if (typeof hex === 'number') n = hex & 0xffffff;
  else n = parseInt(String(hex).replace('#', ''), 16) | 0;
  let r = ((n >> 16) & 255) * light;
  let g = ((n >> 8) & 255) * light;
  let b = (n & 255) * light;
  r = r < 0 ? 0 : r > 255 ? 255 : r | 0;
  g = g < 0 ? 0 : g > 255 ? 255 : g | 0;
  b = b < 0 ? 0 : b > 255 ? 255 : b | 0;
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

// ---------------------------------------------------------------------------
// camera basis (aztec / bunker line 578)
// ---------------------------------------------------------------------------

/// Build the camera direction + projection-plane basis for a view angle.
/// planeX = -dirY * PLANE, planeY = dirX * PLANE, where PLANE = fovScale (the
/// half-plane width; FOV ~= 2*atan(fovScale)). 0.66 is the classic ~66deg FOV.
/// Pass a precomputed PLANE via the second arg directly (it is the plane scale).
export function cameraBasis(angle, fovScale = 0.66) {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  return {
    dirX,
    dirY,
    planeX: -dirY * fovScale,
    planeY: dirX * fovScale,
  };
}

// ---------------------------------------------------------------------------
// single-column DDA traversal (the proven core)
// ---------------------------------------------------------------------------

/// March one ray (for screen-column with normalized cameraX in [-1..1]) through
/// the grid via Amanatides-Woo style DDA until the first solid cell.
/// Returns the FISHEYE-CORRECTED perpendicular distance `perp` (NEVER the raw
/// euclidean distance), the hit side (0 = x-side, 1 = y-side), the fractional
/// wallX hit coordinate WITH the canonical two-side texX mirror correction
/// applied to wallX's source so texX maps consistently, the hit cell mapX/mapY,
/// and the tile id at the hit.
///
/// opts.maxSteps   (default 128) DDA safety bound
/// opts.minPerp    (default 0.02) perp floor so lineHeight never explodes
/// opts.isSolid    (default exported isSolid) custom solidity test
export function castColumn(px, py, dirX, dirY, planeX, planeY, cameraX, grid, opts) {
  opts = opts || {};
  const solid = opts.isSolid || isSolid;
  const maxSteps = opts.maxSteps || 128;
  const minPerp = opts.minPerp || 0.02;

  const rdx = dirX + planeX * cameraX;
  const rdy = dirY + planeY * cameraX;

  let mapX = Math.floor(px);
  let mapY = Math.floor(py);

  // delta distances (guard against a perfectly axis-aligned ray -> Infinity)
  const ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx);
  const ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);

  let stepX, stepY, sdx, sdy;
  if (rdx < 0) { stepX = -1; sdx = (px - mapX) * ddx; }
  else { stepX = 1; sdx = (mapX + 1 - px) * ddx; }
  if (rdy < 0) { stepY = -1; sdy = (py - mapY) * ddy; }
  else { stepY = 1; sdy = (mapY + 1 - py) * ddy; }

  let side = 0;
  let tile = 1;
  let guard = 0;
  while (guard++ < maxSteps) {
    if (sdx < sdy) { sdx += ddx; mapX += stepX; side = 0; }
    else { sdy += ddy; mapY += stepY; side = 1; }
    if (solid(grid, mapX, mapY)) { tile = tileAt(grid, mapX, mapY); break; }
  }

  // fisheye-corrected perpendicular distance (NOT euclidean): step back one cell
  let perp = side === 0 ? (sdx - ddx) : (sdy - ddy);
  if (perp < minPerp) perp = minPerp;

  // fractional hit position along the wall, with the canonical mirror correction
  let wallX = side === 0 ? py + perp * rdy : px + perp * rdx;
  wallX -= Math.floor(wallX);
  if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) wallX = 1 - wallX;

  return { perp, side, wallX, mapX, mapY, tile, rdx, rdy };
}

// ---------------------------------------------------------------------------
// background (ceiling / floor)
// ---------------------------------------------------------------------------

/// Paint the ceiling (top half) and floor (bottom half) as two vertical
/// gradients. Override colors via opts.ceil = [topHex, botHex] and
/// opts.floor = [topHex, botHex]; or pass opts.background to draw your own.
export function renderBackground(ctx, opts) {
  opts = opts || {};
  const w = opts.width || ctx.canvas.width;
  const h = opts.height || ctx.canvas.height;
  if (typeof opts.background === 'function') { opts.background(ctx, w, h); return; }

  const ceil = opts.ceil || ['#1a1d22', '#0d0f12'];
  const floor = opts.floor || ['#3a3d41', '#15171a'];

  const cg = ctx.createLinearGradient(0, 0, 0, h / 2);
  cg.addColorStop(0, ceil[0]); cg.addColorStop(1, ceil[1]);
  ctx.fillStyle = cg; ctx.fillRect(0, 0, w, h / 2);

  const fg = ctx.createLinearGradient(0, h / 2, 0, h);
  fg.addColorStop(0, floor[0]); fg.addColorStop(1, floor[1]);
  ctx.fillStyle = fg; ctx.fillRect(0, h / 2, w, h / 2);
}

// ---------------------------------------------------------------------------
// per-screen-column wall driver (returns the z-buffer)
// ---------------------------------------------------------------------------

/// Cast every screen column, paint each wall slice in one of two flavors, and
/// fill + RETURN a Float32Array z-buffer (perp distance per column). Pass the
/// returned array straight into raycast.sprite-billboards for occlusion.
///
/// player : { x, y, angle }   (angle in radians; the engine never mutates it)
/// grid   : 2D array or array-of-strings tile map
/// opts:
///   width, height   render size (default ctx.canvas.width/height)
///   fovScale        plane scale (default 0.66)
///   texSize         texture pixel size for the slice src (default 64)
///   zbuffer         reuse this Float32Array (else one is allocated/cached)
///   isSolid         custom solidity test
///   maxSteps,minPerp passed to castColumn
///   --- FLAVOR (a) TEXTURED ---
///   texFor(tile) -> texture source (HTMLCanvasElement/Image). If present,
///                   columns are drawn via drawImage slices.
///   fog(perp, side) -> alpha in [0..1] for a dark overlay (optional; a built-in
///                      capped distance+side fog is used if omitted).
///   fogColor        overlay rgb base (default 'rgba(8,9,12,')
///   --- FLAVOR (b) PROCEDURAL ---
///   shade(tile, perp, side, light) -> CSS color string for a fillRect column.
///                   Used only when texFor is NOT provided.
///   light           scalar light term forwarded to shade (default 1)
export function renderWalls(ctx, player, grid, opts) {
  opts = opts || {};
  const w = opts.width || ctx.canvas.width;
  const h = opts.height || ctx.canvas.height;
  const fovScale = opts.fovScale != null ? opts.fovScale : 0.66;
  const texSize = opts.texSize || 64;
  const light = opts.light != null ? opts.light : 1;

  // z-buffer: reuse the caller's, else cache one sized to the column count.
  let zb = opts.zbuffer;
  if (!zb || zb.length !== w) {
    zb = renderWalls._zb && renderWalls._zb.length === w
      ? renderWalls._zb
      : (renderWalls._zb = new Float32Array(w));
  }

  const px = player.x, py = player.y;
  const { dirX, dirY, planeX, planeY } = cameraBasis(player.angle, fovScale);

  const useTex = typeof opts.texFor === 'function';
  const shade = opts.shade;
  const fogFn = opts.fog;
  const fogColor = opts.fogColor || 'rgba(8,9,12,';

  for (let x = 0; x < w; x++) {
    const cameraX = (2 * x) / w - 1;
    const c = castColumn(px, py, dirX, dirY, planeX, planeY, cameraX, grid, opts);
    const perp = c.perp;
    zb[x] = perp;

    const lineHeight = h / perp;
    const drawStart = -lineHeight / 2 + h / 2;

    if (useTex) {
      // FLAVOR (a): textured slice
      const tex = opts.texFor(c.tile);
      if (tex) {
        const tw = tex.width || texSize;
        const th = tex.height || texSize;
        let texX = (c.wallX * tw) | 0;
        if (texX < 0) texX = 0; else if (texX >= tw) texX = tw - 1;
        ctx.drawImage(tex, texX, 0, 1, th, x, drawStart, 1, lineHeight);
      }
      // distance + side darkening overlay (capped so it is never pure black)
      let dark;
      if (typeof fogFn === 'function') {
        dark = fogFn(perp, c.side);
      } else {
        dark = Math.min(0.72, perp * 0.052) + (c.side === 1 ? 0.16 : 0);
        dark *= 1 / Math.max(0.001, light);
        if (dark > 0.72) dark = 0.72;
      }
      if (dark > 0.01) {
        ctx.fillStyle = fogColor + dark.toFixed(3) + ')';
        ctx.fillRect(x, drawStart, 1, lineHeight);
      }
    } else {
      // FLAVOR (b): procedural fillRect column
      let color;
      if (typeof shade === 'function') {
        color = shade(c.tile, perp, c.side, light);
      } else {
        // built-in flat shader: 1/(1+d*d*k) fog + side darkening + light
        const k = opts.fogK != null ? opts.fogK : 0.018;
        const fog = 1 / (1 + perp * perp * k);
        const s = (c.side === 1 ? 0.72 : 1) * fog * light;
        const base = (c.tile === 2) ? '#9c6a2c' : '#6b6660';
        color = shadeColor(base, Math.max(0.03, Math.min(1, s)));
      }
      ctx.fillStyle = color;
      ctx.fillRect(x, drawStart, 1, lineHeight);

      // cheap vertical mortar seam (crypt flavor) on the cell edges
      if (opts.mortar !== false && (c.wallX < 0.035 || c.wallX > 0.965)) {
        const fog = 1 / (1 + perp * perp * (opts.fogK != null ? opts.fogK : 0.018));
        ctx.fillStyle = 'rgba(0,0,0,' + (0.28 * fog).toFixed(3) + ')';
        ctx.fillRect(x, drawStart, 1, lineHeight);
      }
    }
  }

  return zb;
}

// ---------------------------------------------------------------------------
// optional convenience wrapper -- owns canvas + zbuffer + resize + drag-look
// ---------------------------------------------------------------------------

/// DDARaycaster wraps a canvas: it owns the 2D context, clamps devicePixelRatio
/// to <= 2, (re)allocates the z-buffer on resize, and offers an OPTIONAL
/// accumulated drag-look helper (pointerdown + pointermove, works on touch --
/// NEVER requestPointerLock). It is still a pure renderer: feed it the player
/// state you integrated elsewhere. Set onLook(dyaw) to receive drag yaw deltas.
export class DDARaycaster {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.fovScale = opts.fovScale != null ? opts.fovScale : 0.66;
    this.texSize = opts.texSize || 64;
    this.maxDPR = opts.maxDPR != null ? opts.maxDPR : 2;
    this.lookSensitivity = opts.lookSensitivity != null ? opts.lookSensitivity : 0.0024;
    this.onLook = opts.onLook || null; // (dyaw) => void

    this.width = canvas.width;
    this.height = canvas.height;
    this.zbuffer = new Float32Array(this.width);

    this._dragId = null;
    this._lastX = 0;
    this._listeners = [];
    this._installLook();
    if (opts.autoResize !== false) {
      this._onResize = () => this.resize();
      window.addEventListener('resize', this._onResize);
      this._listeners.push([window, 'resize', this._onResize]);
      this.resize();
    }
  }

  /// Size the backing store to the CSS box * clamped DPR, then re-allocate the
  /// z-buffer to the new column count. Re-fetch this.zbuffer after a resize.
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width || this.canvas.width);
    const cssH = Math.max(1, rect.height || this.canvas.height);
    const dpr = Math.min(this.maxDPR, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (w !== this.width || h !== this.height) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.width = w;
      this.height = h;
      this.zbuffer = new Float32Array(w); // re-allocate per the zbuffer contract
      this.ctx.imageSmoothingEnabled = false;
    }
    return this;
  }

  renderBackground(opts = {}) {
    renderBackground(this.ctx, { width: this.width, height: this.height, ...opts });
    return this;
  }

  /// Draw the walls and return the engine-owned z-buffer (re-fetch after resize).
  renderWalls(player, grid, opts = {}) {
    return renderWalls(this.ctx, player, grid, {
      width: this.width,
      height: this.height,
      fovScale: this.fovScale,
      texSize: this.texSize,
      zbuffer: this.zbuffer,
      ...opts,
    });
  }

  // ---- accumulated drag-look (touch + mouse); never pointer lock ----
  _installLook() {
    const start = (x, id) => { this._dragId = id; this._lastX = x; };
    const move = (x) => {
      if (this._dragId === null) return;
      const dx = x - this._lastX;
      this._lastX = x;
      if (this.onLook) this.onLook(dx * this.lookSensitivity);
    };
    const end = () => { this._dragId = null; };

    const md = (e) => start(e.clientX, 'mouse');
    const mm = (e) => {
      if (this._dragId !== 'mouse') return;
      // prefer raw movementX when available (smoother), else fall back to delta
      if (typeof e.movementX === 'number' && e.movementX !== 0) {
        if (this.onLook) this.onLook(e.movementX * this.lookSensitivity);
        this._lastX = e.clientX;
      } else move(e.clientX);
    };
    const mu = () => { if (this._dragId === 'mouse') end(); };

    const ts = (e) => { const t = e.changedTouches[0]; if (t) start(t.clientX, t.identifier); };
    const tm = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._dragId) { move(t.clientX); e.preventDefault(); break; }
      }
    };
    const te = (e) => {
      for (const t of e.changedTouches) if (t.identifier === this._dragId) { end(); break; }
    };

    this._on(this.canvas, 'mousedown', md);
    this._on(window, 'mousemove', mm);
    this._on(window, 'mouseup', mu);
    this._on(this.canvas, 'touchstart', ts, { passive: true });
    this._on(this.canvas, 'touchmove', tm, { passive: false });
    this._on(window, 'touchend', te);
    this._on(window, 'touchcancel', te);
  }

  _on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts || false);
    this._listeners.push([target, type, fn, opts || false]);
  }

  /// Detach every listener this wrapper installed. Call when the view is torn
  /// down. The engine owns no GPU resources; this only frees DOM listeners.
  dispose() {
    for (const [t, type, fn, o] of this._listeners) {
      try { t.removeEventListener(type, fn, o); } catch (e) { /* noop */ }
    }
    this._listeners.length = 0;
    this.onLook = null;
    this.zbuffer = null;
  }
}

// END mChatAI Web Component: raycast.dda-engine
