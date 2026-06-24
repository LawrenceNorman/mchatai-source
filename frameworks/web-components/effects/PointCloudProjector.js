// PointCloudProjector — 2D pseudo-3D point-cloud projector for Canvas2D.
// Rotates a cloud of 3D points by yaw + tilt, divides by depth for a real
// perspective foreshortening, depth-sorts back-to-front, and (optionally)
// draws each point as an additively-blended glow sprite. The classic
// "thousands of stars / particles swirling in deep space" look — particle
// galaxies, starfields, point-cloud scanners, orbiting-node graphs,
// 3D scatter plots, music visualisers — without pulling in WebGL or three.js.
//
// Why a Lego: every 2.5D particle field reinvents the same three things and
// gets one of them subtly wrong — (1) the yaw-then-tilt rotation order, so the
// camera tumbles instead of orbiting; (2) the focal/(focal+z) perspective
// divide, so distant points don't actually shrink; (3) the back-to-front draw
// order under `globalCompositeOperation = "lighter"`, so near glows get buried
// behind far ones. One audited projector fixes all three.
//
// Renderer-agnostic by design: the math (`Projector`, `project`, `rotatePoint`)
// emits plain screen-space records you can draw however you like. A thin,
// optional `drawGlowCloud` Canvas2D helper + a `makeGlowSprite` pre-renderer
// are included for the common additive-glow case, but you can ignore them and
// feed the projected points to SVG, DOM, or your own draw routine.
//
// Wisdom rule: vq-depth-sorted-additive (visual-quality.json) — additive
// particle clouds MUST draw far-to-near or the depth illusion collapses.
//
// Dependency-free. Offline only. No CDN, no external libs.
//
// Usage (math only — bring your own draw):
//   import { Projector } from "../../effects/PointCloudProjector.js";
//   const proj = new Projector({ focal: 2.6 });
//   proj.setView({ yaw: 0.45, tilt: 1.02, zoom: 1.0 });
//   proj.setViewport(canvas.width, canvas.height);   // sets cx/cy/scale
//   const out = proj.projectCloud(points);           // [{ x, y, depth, scale, point }]
//   for (const p of out) { /* draw p.x, p.y at p.scale, dim by p.depth */ }
//
// Usage (batteries included — additive glow on Canvas2D):
//   import { Projector, makeGlowSprite, drawGlowCloud }
//     from "../../effects/PointCloudProjector.js";
//   const sprite = makeGlowSprite("#bcd4ff");
//   // each frame:
//   proj.setView({ yaw, tilt, zoom });
//   proj.setViewport(W, H);
//   drawGlowCloud(ctx, proj.projectCloud(points), {
//     spriteFor: () => sprite,   // or p => spritesByColor[p.point.ci]
//     baseSize: 2.4,             // sprite px ~= baseSize * point.size * p.scale
//   });
//
// Point shape (only `x,y,z` are required; everything else passes through):
//   { x, y, z, size?, brightness?, ...anything }
//   - x,y,z   : position in cloud space (any consistent units; ~[-1,1] typical)
//   - size    : per-point sprite multiplier (default 1)
//   - brightness : per-point alpha multiplier 0..1 (default 1)

const TAU = Math.PI * 2;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Rotate a 3D point by yaw (around the vertical Y axis) then tilt (around the
 * horizontal X axis). This is the order that makes a camera *orbit* a cloud
 * rather than tumble it. Returns the rotated point in camera space; the
 * resulting `z` is the depth used for the perspective divide and sort.
 *
 * @param {{x:number,y:number,z:number}} p
 * @param {number} cosY @param {number} sinY  precomputed cos/sin of yaw
 * @param {number} cosT @param {number} sinT  precomputed cos/sin of tilt
 * @returns {{x:number,y:number,z:number}}
 */
export function rotatePoint(p, cosY, sinY, cosT, sinT) {
  const wx = finiteNumber(p.x);
  const wy = finiteNumber(p.y);
  const wz = finiteNumber(p.z);
  // yaw about Y
  const x1 = wx * cosY + wz * sinY;
  const z1 = -wx * sinY + wz * cosY;
  // tilt about X
  const y2 = wy * cosT - z1 * sinT;
  const z2 = wy * sinT + z1 * cosT;
  return { x: x1, y: y2, z: z2 };
}

/**
 * Project one rotated camera-space point to screen space with a focal-division
 * perspective. Smaller `focal` = stronger perspective (wider FOV).
 *
 * @param {{x:number,y:number,z:number}} rp  rotated point (camera space)
 * @param {{cx:number,cy:number,scale:number,focal:number}} cam
 * @returns {{ x:number, y:number, depth:number, persp:number }}
 *   x,y    = screen pixels
 *   persp  = perspective factor focal/(focal+z); multiply sprite size by this
 *   depth  = camera-space z (use for back-to-front sort + distance dimming)
 */
export function project(rp, cam) {
  const persp = cam.focal / (cam.focal + rp.z);
  return {
    x: cam.cx + rp.x * persp * cam.scale,
    y: cam.cy + rp.y * persp * cam.scale,
    depth: rp.z,
    persp
  };
}

/**
 * Pre-render a soft radial glow sprite to an offscreen canvas, ready to be
 * drawn additively (`ctx.globalCompositeOperation = "lighter"`). Caching one
 * sprite per colour and re-drawing it is far cheaper than per-point gradients.
 *
 * Returns an HTMLCanvasElement (browser) — call once on init, reuse forever.
 *
 * @param {string} hex          "#rrggbb"
 * @param {object} [opts]
 * @param {number} [opts.size=64]       sprite canvas px (power-of-two friendly)
 * @param {number} [opts.coreAlpha=1]   alpha at the bright centre
 * @param {boolean}[opts.whiteCore=true]pure-white hot centre before tinting
 * @returns {HTMLCanvasElement}
 */
export function makeGlowSprite(hex, { size = 64, coreAlpha = 1, whiteCore = true } = {}) {
  const { r, g, b } = hexToRgb(hex);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const gtx = c.getContext("2d");
  const grad = gtx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  if (whiteCore) grad.addColorStop(0.0, `rgba(255,255,255,${coreAlpha})`);
  grad.addColorStop(whiteCore ? 0.22 : 0.0, `rgba(${r},${g},${b},${coreAlpha})`);
  grad.addColorStop(0.55, `rgba(${r},${g},${b},${coreAlpha * 0.35})`);
  grad.addColorStop(1.0, `rgba(${r},${g},${b},0)`);
  gtx.fillStyle = grad;
  gtx.fillRect(0, 0, size, size);
  return c;
}

function hexToRgb(h) {
  h = String(h).replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0
  };
}

/**
 * Projector — holds camera/view state and turns a cloud of 3D points into
 * depth-sorted screen-space records. Pure math; no canvas required.
 */
export class Projector {
  /**
   * @param {object} [opts]
   * @param {number} [opts.focal=2.6]  perspective focal length (smaller = wider FOV)
   * @param {number} [opts.yaw=0]      initial orbit angle (radians)
   * @param {number} [opts.tilt=1.0]   initial pitch angle (radians, clamped to tiltMin..tiltMax)
   * @param {number} [opts.zoom=1]     view zoom multiplier
   * @param {number} [opts.tiltMin=0.12]
   * @param {number} [opts.tiltMax=1.52]
   * @param {number} [opts.baseScaleFrac=0.42] viewport scale = min(w,h)*baseScaleFrac*zoom
   * @param {boolean}[opts.sort=true]  depth-sort the output far-to-near
   * @param {number} [opts.cullMargin=40] skip points this many px outside the viewport
   */
  constructor(opts = {}) {
    this.focal = finiteNumber(opts.focal, 2.6);
    this.yaw = finiteNumber(opts.yaw, 0);
    this.tilt = finiteNumber(opts.tilt, 1.0);
    this.zoom = finiteNumber(opts.zoom, 1);
    this.tiltMin = finiteNumber(opts.tiltMin, 0.12);
    this.tiltMax = finiteNumber(opts.tiltMax, 1.52);
    this.baseScaleFrac = finiteNumber(opts.baseScaleFrac, 0.42);
    this.sort = opts.sort ?? true;
    this.cullMargin = finiteNumber(opts.cullMargin, 40);
    // viewport-derived
    this.cx = 0;
    this.cy = 0;
    this.scale = 0;
    this._w = 0;
    this._h = 0;
    this._scratch = [];
  }

  /** Update view angles/zoom. tilt is clamped; yaw wraps freely. */
  setView({ yaw, tilt, zoom } = {}) {
    if (yaw != null) this.yaw = finiteNumber(yaw, this.yaw);
    if (tilt != null) this.tilt = clamp(finiteNumber(tilt, this.tilt), this.tiltMin, this.tiltMax);
    if (zoom != null) this.zoom = Math.max(0.001, finiteNumber(zoom, this.zoom));
    return this;
  }

  /** Nudge angles relative to current view (e.g. from a drag delta). */
  orbit(dYaw = 0, dTilt = 0) {
    this.yaw += finiteNumber(dYaw);
    this.tilt = clamp(this.tilt + finiteNumber(dTilt), this.tiltMin, this.tiltMax);
    return this;
  }

  /**
   * Set the viewport size in *device* pixels (the canvas backing-store size,
   * or CSS px if you don't scale by DPR). Recomputes centre + scale.
   */
  setViewport(width, height) {
    this._w = finiteNumber(width);
    this._h = finiteNumber(height);
    this.cx = this._w / 2;
    this.cy = this._h / 2;
    this.scale = Math.min(this._w, this._h) * this.baseScaleFrac * this.zoom;
    return this;
  }

  /** Current camera record (cx, cy, scale already include zoom). */
  camera() {
    // recompute scale in case zoom changed without a viewport call
    this.scale = Math.min(this._w, this._h) * this.baseScaleFrac * this.zoom;
    return { cx: this.cx, cy: this.cy, scale: this.scale, focal: this.focal };
  }

  /**
   * Project a single point. Returns null if it falls outside the cull margin.
   * @returns {{ x, y, depth, persp, scale, alpha, point } | null}
   */
  projectPoint(point) {
    const cosY = Math.cos(this.yaw), sinY = Math.sin(this.yaw);
    const cosT = Math.cos(this.tilt), sinT = Math.sin(this.tilt);
    return this._projectOne(point, this.camera(), cosY, sinY, cosT, sinT);
  }

  /**
   * Project an array of 3D points to depth-sorted screen records.
   * Out-of-frame points (beyond cullMargin) are dropped. With `sort` on
   * (default) the result is ordered far-to-near so additive glows composite
   * correctly. Returns a fresh array; the input is never mutated.
   *
   * @param {Array<{x,y,z,size?,brightness?}>} points
   * @returns {Array<{ x, y, depth, persp, scale, alpha, point }>}
   */
  projectCloud(points) {
    const cosY = Math.cos(this.yaw), sinY = Math.sin(this.yaw);
    const cosT = Math.cos(this.tilt), sinT = Math.sin(this.tilt);
    const cam = this.camera();
    const out = [];
    for (let i = 0; i < points.length; i++) {
      const rec = this._projectOne(points[i], cam, cosY, sinY, cosT, sinT);
      if (rec) out.push(rec);
    }
    if (this.sort) out.sort((a, b) => b.depth - a.depth); // far (large z) first
    return out;
  }

  _projectOne(point, cam, cosY, sinY, cosT, sinT) {
    const rp = rotatePoint(point, cosY, sinY, cosT, sinT);
    const persp = cam.focal / (cam.focal + rp.z);
    const x = cam.cx + rp.x * persp * cam.scale;
    if (x < -this.cullMargin || x > this._w + this.cullMargin) return null;
    const y = cam.cy + rp.y * persp * cam.scale;
    if (y < -this.cullMargin || y > this._h + this.cullMargin) return null;
    const depthDim = clamp(persp * 0.95, 0.28, 1.4);
    const brightness = point.brightness == null ? 1 : point.brightness;
    return {
      x,
      y,
      depth: rp.z,
      persp,
      scale: (point.size == null ? 1 : point.size) * persp,
      alpha: clamp(brightness * depthDim, 0, 1),
      point
    };
  }
}

/**
 * drawGlowCloud — optional Canvas2D helper that draws already-projected
 * records as additive glow sprites. Sets `globalCompositeOperation = "lighter"`
 * for the duration and restores it afterwards.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{x,y,scale,alpha,point}>} projected  output of Projector.projectCloud
 * @param {object} opts
 * @param {(rec)=>HTMLCanvasElement|HTMLImageElement} opts.spriteFor
 *        returns the glow sprite for a record (cache these; see makeGlowSprite)
 * @param {number} [opts.baseSize=2.4]   px sprite size ≈ baseSize * rec.scale
 * @param {number} [opts.alphaMul=1]     global alpha multiplier
 * @param {boolean}[opts.additive=true]  use "lighter" compositing
 */
export function drawGlowCloud(ctx, projected, { spriteFor, baseSize = 2.4, alphaMul = 1, additive = true } = {}) {
  if (typeof spriteFor !== "function") {
    throw new Error("drawGlowCloud: `spriteFor` callback is required");
  }
  const prevOp = ctx.globalCompositeOperation;
  const prevAlpha = ctx.globalAlpha;
  if (additive) ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < projected.length; i++) {
    const rec = projected[i];
    const sprite = spriteFor(rec);
    if (!sprite) continue;
    const a = rec.alpha * alphaMul;
    if (a <= 0) continue;
    ctx.globalAlpha = a > 1 ? 1 : a;
    const sz = baseSize * rec.scale;
    if (sz <= 0) continue;
    ctx.drawImage(sprite, rec.x - sz / 2, rec.y - sz / 2, sz, sz);
  }
  ctx.globalAlpha = prevAlpha;
  ctx.globalCompositeOperation = prevOp;
}

export const PointCloudProjector = { Projector, project, rotatePoint, makeGlowSprite, drawGlowCloud, TAU };
