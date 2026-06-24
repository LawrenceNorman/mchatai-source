// BEGIN mChatAI Web Component: core.software-3d-renderer
//
// A SOFTWARE 3D RENDERER on a plain 2D canvas -- NO WebGL, NO three.js, NO
// external dependencies. This is the camera-basis (lookAt-style right/up/fwd)
// perspective track the catalog was missing: a moving FREE-FLY / chase camera
// looking around a world, rather than core.lowpoly-canvas3d's spherical orbit
// over a fixed diorama. Use it for landers, flythroughs, low-altitude terrain,
// space scenes, cockpits, descent/ascent games -- anything where the CAMERA
// itself travels through the scene and you want a faceted, fog-faded look with
// zero shader pipeline.
//
// HOW IT DIFFERS from core.lowpoly-canvas3d (the sibling):
//   - lowpoly-canvas3d : mat4 lookAt/perspective + an OrbitCamera that spins
//                        around a target. Great for showpiece dioramas.
//   - software-3d-renderer (this) : an explicit camera BASIS (eye, right, up,
//                        fwd) projector you point ANYWHERE (free-fly / chase /
//                        first-person), with built-in DISTANCE FOG, a view-
//                        dependent FRESNEL rim, near-plane clipping, an off-
//                        screen TARGET-ARROW helper, and convex POLYGON faces
//                        (quads AND tris), not just triangles. Pick this when
//                        the camera moves through the world.
//
// Extracted + generalized from the proven `lunar-descent` software-rendered
// lander build (2026-06-24). Game-specific terrain / lander / fuel / pads all
// stripped -- this is pure projection + shading + sorted fill.
//
// PURE math + Canvas2D. It touches nothing but a CanvasRenderingContext2D, so
// it is trivially offline-safe and renders identically in WKWebView / Safari /
// Chrome. The CALLER owns the geometry: build an array of faces however you
// like (a terrain grid, a ship hull, billboards) and hand them to the renderer.
//
// COORDINATE SPACE: right-handed, +Y up. A vec3 is a PLAIN object {x, y, z}.
// A "face" is { v: [p0, p1, p2, ...], color: [r,g,b] } where v is 3+ world
// points (a triangle, a quad, or any convex polygon) and color is 0-255 base
// albedo. Optional per-face fields: { normal:{x,y,z} } (skip auto cross-product
// when you already know it), { flat:true } (no lighting -- use the raw color,
// e.g. for emissive/HUD-ish faces), { twoSided:true } (don't back-face cull).
//
// USAGE (a free-fly terrain flythrough)
//   import { Camera, SoftwareRenderer, V } from './core/software-3d-renderer.js';
//   const cam = new Camera({ eye: V(0, 40, 60), target: V(0, 0, 0), fovDeg: 58 });
//   const r = new SoftwareRenderer(canvas, {
//     light: V(0.72, 0.34, 0.42), fog: { near: 180, far: 540, color: [10, 18, 40] },
//   });
//   function frame() {
//     r.resize();                       // (no-op if size unchanged)
//     cam.lookAt();                     // rebuild right/up/fwd from eye->target
//     r.clear('#02030a');               // or skip + paint your own sky first
//     r.renderFaces(faces, cam);        // project + light + fog + painter-sort + fill
//     requestAnimationFrame(frame);
//   }
//   requestAnimationFrame(frame);
//
// USAGE (a chase camera following a moving body each frame)
//   cam.eye = lerpV(cam.eye, add(body.pos, V(0, 12, 44)), 0.1);
//   cam.target = add(body.pos, V(0, -2, -6));
//   cam.lookAt();
//
// USAGE (project a single world point yourself -- billboards, HUD markers)
//   const p = cam.project(worldPoint, renderer.W, renderer.H);   // -> {sx, sy, cz, onScreen}
//   if (p.cz > 0) { ctx.fillRect(p.sx, p.sy, 4, 4); }            // cz>0 = in front
//
// USAGE (off-screen target arrow -- points to something the camera can't see)
//   const dir = screenArrowDir(cam, target, renderer.W, renderer.H);
//   if (dir) { /* draw a chevron at angle dir.angle on a ring around center */ }
//
// CONTRACTS
//   - V(x, y, z) -> {x, y, z}. Tiny vec3 helpers are exported (add, sub, scl,
//     dot, cross, len, norm, lerpV) so the caller can build geometry without a
//     math lib. All are pure.
//   - new Camera({ eye, target, up, fovDeg, near }):
//       eye      : camera world position {x,y,z}. Default {0,0,10}.
//       target   : world point the camera looks at. Default {0,0,0}.
//       up        : world up hint for the basis. Default {0,1,0}.
//       fovDeg   : vertical field of view in degrees. Default 58.
//       near     : near-plane camera-space distance; points with cz<near are
//                  clipped. Default 0.6.
//     Mutate cam.eye / cam.target each frame, then call cam.lookAt().
//   - cam.lookAt() rebuilds the orthonormal basis fwd=norm(target-eye),
//     right=norm(cross(fwd, up)), up=cross(right, fwd). Call after moving the
//     camera and before projecting. Returns the camera.
//   - cam.project(p, W, H) -> { sx, sy, cz, onScreen }. cz is camera-space
//     depth (>0 in front of the camera, <near = clipped). sx/sy are pixel
//     coords. onScreen is true when cz>=near and sx/sy are within [0,W]/[0,H].
//     focal length is derived from fovDeg and H each call (responsive).
//   - new SoftwareRenderer(canvas, opts):
//       light        : sun DIRECTION (toward the light) {x,y,z}; auto-normalized.
//                      Default {0.4,0.9,0.3}.
//       ambient      : floor light 0..1 (faces never go fully black). Default 0.2.
//       diffuse      : Lambert gain 0..1+. Default 0.9.
//       fresnel      : 0..1 view-dependent RIM strength (silhouette glow that
//                      lifts grazing faces). Default 0. Tint via fresnelColor.
//       fresnelColor : rim tint [r,g,b]. Default [120,150,255] (earthshine-ish).
//       fog          : { near, far, color:[r,g,b] } OR null. Faces fade toward
//                      fog.color from near..far camera depth. Default null.
//       dprMax       : devicePixelRatio clamp. Default 2.
//       stroke       : hairline stroke same-as-fill to hide triangle seams
//                      (true/false). Default true.
//       cull         : back-face cull faces whose normal points away (true) --
//                      override per-face with { twoSided:true }. Default true.
//   - r.resize() syncs the backing store to the canvas CSS box * dpr; cheap
//     no-op when unchanged. Sets r.W / r.H (CSS pixels). Call once per frame
//     (or wire window 'resize'); the constructor sizes once on build.
//   - r.clear(cssColorOrNull): fill the canvas (or clearRect if null) before
//     drawing. Skip it and paint your own sky/background first if you prefer.
//   - r.renderFaces(faces, camera): project every face, drop near-clipped and
//     (unless twoSided) back-facing ones, light = ambient + diffuse*max(0,
//     N.L) + fresnel rim, apply fog by depth, PAINTER-SORT far->near, and fill.
//     Mutates nothing; the caller's faces array is read-only. Returns the count
//     of faces drawn (for a cheap draw-call / cull diagnostic).
//   - screenArrowDir(camera, worldPoint, W, H) -> { angle, onScreen } | null:
//     direction (radians, atan2 of dx,dy from screen center) to point an
//     off-screen indicator at worldPoint; flips correctly for points BEHIND the
//     camera. onScreen true => the point is already visible (hide the arrow).
//   - Renderer-agnostic core: Camera + the vec3 kit + screenArrowDir never
//     touch the DOM, so you can unit-test projection headless. Only
//     SoftwareRenderer holds a canvas; it owns nothing async and has no
//     dispose() (it allocates no listeners unless you opt into autoResize).
//   - autoResize: pass { autoResize:true } to add a window 'resize' listener;
//     then dispose() removes it. Default OFF (call r.resize() in your loop).
//   - Offline only: no imports beyond this module, no network, no WebGL.

// ---------- tiny vec3 kit (pure) ----------
export const V = (x, y, z) => ({ x, y, z });
export const add = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
export const scl = (a, s) => V(a.x * s, a.y * s, a.z * s);
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a, b) => V(
  a.y * b.z - a.z * b.y,
  a.z * b.x - a.x * b.z,
  a.x * b.y - a.y * b.x,
);
export const len = (a) => Math.hypot(a.x, a.y, a.z);
export const norm = (a) => { const l = len(a) || 1; return V(a.x / l, a.y / l, a.z / l); };
export const lerpV = (a, b, t) => V(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v, f) => (typeof v === 'number' && Number.isFinite(v) ? v : f);

// ---------- camera (explicit basis projector) ----------
export class Camera {
  /// opts: { eye, target, up, fovDeg, near }. Mutate eye/target each frame then
  /// call lookAt() to rebuild the basis before projecting.
  constructor(opts = {}) {
    this.eye = opts.eye || V(0, 0, 10);
    this.target = opts.target || V(0, 0, 0);
    this.up = opts.up || V(0, 1, 0);
    this.fovDeg = num(opts.fovDeg, 58);
    this.near = num(opts.near, 0.6);
    // orthonormal basis (rebuilt by lookAt)
    this.fwd = V(0, 0, -1);
    this.right = V(1, 0, 0);
    this.basisUp = V(0, 1, 0);
    this.lookAt();
  }

  /// Rebuild the orthonormal camera basis from eye -> target. Call each frame
  /// after moving eye/target, before project()/renderFaces(). Returns this.
  lookAt() {
    this.fwd = norm(sub(this.target, this.eye));
    let right = cross(this.fwd, this.up);
    // Guard the degenerate case where fwd is parallel to up (looking straight
    // up/down): fall back to a world-X reference so the basis stays defined.
    if (len(right) < 1e-6) right = cross(this.fwd, V(0, 0, 1));
    this.right = norm(right);
    this.basisUp = cross(this.right, this.fwd);
    return this;
  }

  /// Focal length in pixels for a viewport of height H (responsive to fovDeg).
  focal(H) {
    return (H / 2) / Math.tan((this.fovDeg * Math.PI / 180) / 2);
  }

  /// Project a world point into screen space.
  /// @returns {{sx:number, sy:number, cz:number, onScreen:boolean}}
  ///   cz  : camera-space depth (>0 in front; < near means clipped/behind).
  ///   sx/sy : pixel coords (only meaningful when cz >= near).
  project(p, W, H) {
    const rx = p.x - this.eye.x, ry = p.y - this.eye.y, rz = p.z - this.eye.z;
    const cz = rx * this.fwd.x + ry * this.fwd.y + rz * this.fwd.z;
    if (cz < this.near) return { sx: 0, sy: 0, cz, onScreen: false };
    const cxp = rx * this.right.x + ry * this.right.y + rz * this.right.z;
    const cyp = rx * this.basisUp.x + ry * this.basisUp.y + rz * this.basisUp.z;
    const inv = this.focal(H) / cz;
    const sx = W / 2 + cxp * inv;
    const sy = H / 2 - cyp * inv;
    const onScreen = sx >= 0 && sx <= W && sy >= 0 && sy <= H;
    return { sx, sy, cz, onScreen };
  }
}

// ---------- renderer ----------
export class SoftwareRenderer {
  /// canvas: a <canvas>. opts: see the CONTRACTS block above.
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.light = norm(opts.light || V(0.4, 0.9, 0.3));
    this.ambient = num(opts.ambient, 0.2);
    this.diffuse = num(opts.diffuse, 0.9);
    this.fresnel = num(opts.fresnel, 0);
    this.fresnelColor = opts.fresnelColor || [120, 150, 255];
    this.fog = opts.fog && typeof opts.fog === 'object'
      ? { near: num(opts.fog.near, 100), far: num(opts.fog.far, 500), color: opts.fog.color || [0, 0, 0] }
      : null;
    this.dprMax = num(opts.dprMax, 2);
    this.stroke = opts.stroke !== false;     // default true
    this.cull = opts.cull !== false;         // default true
    this.W = 0; this.H = 0; this._dpr = 1;
    this.resize();
    if (opts.autoResize) {
      this._onResize = () => this.resize();
      window.addEventListener('resize', this._onResize);
    }
  }

  /// Sync the backing store to the canvas CSS box * clamped dpr. Cheap no-op
  /// when nothing changed. Sets this.W / this.H in CSS pixels.
  resize() {
    const dpr = Math.min(this.dprMax, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width || this.canvas.clientWidth || 800));
    const h = Math.max(1, Math.round(r.height || this.canvas.clientHeight || 600));
    if (w === this.W && h === this.H && dpr === this._dpr) return;
    this._dpr = dpr; this.W = w; this.H = h;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /// Clear / fill the canvas. Pass null to clearRect (transparent).
  clear(cssColor) {
    const { ctx, W, H } = this;
    if (cssColor) { ctx.fillStyle = cssColor; ctx.fillRect(0, 0, W, H); }
    else ctx.clearRect(0, 0, W, H);
  }

  /// Project + light + fog + painter-sort + fill `faces` from `camera`.
  /// Returns the number of faces actually drawn. Reads faces; mutates nothing.
  renderFaces(faces, camera) {
    const { ctx, W, H } = this;
    const eye = camera.eye;
    const draw = [];

    for (const f of faces) {
      const v = f.v;
      if (!v || v.length < 3) continue;

      // Project every vertex; near-clip the whole face if any vertex is clipped
      // (keeps the painter fill convex and avoids near-plane artefacts).
      let clipped = false, depth = 0;
      const pts = new Array(v.length);
      for (let i = 0; i < v.length; i++) {
        const pr = camera.project(v[i], W, H);
        if (pr.cz < camera.near) { clipped = true; break; }
        pts[i] = pr; depth += pr.cz;
      }
      if (clipped) continue;
      depth /= v.length;

      // Face centroid + normal (auto cross-product unless provided).
      const cen = V(
        (v[0].x + v[1].x + v[2].x) / 3,
        (v[0].y + v[1].y + v[2].y) / 3,
        (v[0].z + v[1].z + v[2].z) / 3,
      );
      let n = f.normal ? norm(f.normal) : norm(cross(sub(v[1], v[0]), sub(v[2], v[0])));
      const toEye = sub(eye, cen);

      // Back-face cull (unless two-sided); else orient the normal toward the eye
      // so single-sided geometry lights correctly from either build winding.
      if (!f.twoSided) {
        if (this.cull && dot(n, toEye) < 0) continue;
      } else if (dot(n, toEye) < 0) {
        n = scl(n, -1);
      }

      // Off-screen bbox cull.
      let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (p.sx < minx) minx = p.sx; if (p.sx > maxx) maxx = p.sx;
        if (p.sy < miny) miny = p.sy; if (p.sy > maxy) maxy = p.sy;
      }
      if (maxx < 0 || minx > W || maxy < 0 || miny > H) continue;

      // Lighting. flat:true bypasses shading entirely (emissive / HUD faces).
      const base = f.color || [200, 200, 200];
      let r, g, b;
      if (f.flat) {
        r = base[0]; g = base[1]; b = base[2];
      } else {
        const lit = this.ambient + this.diffuse * Math.max(0, dot(n, this.light));
        r = base[0] * lit; g = base[1] * lit; b = base[2] * lit;
        // View-dependent Fresnel rim: lift faces seen edge-on (silhouette glow).
        if (this.fresnel > 0) {
          const tl = len(toEye) || 1;
          const ndv = Math.abs(dot(n, toEye) / tl);
          const rim = Math.pow(1 - ndv, 3) * this.fresnel;
          r += this.fresnelColor[0] * rim;
          g += this.fresnelColor[1] * rim;
          b += this.fresnelColor[2] * rim;
        }
      }

      // Distance fog: blend toward fog.color across [near, far] camera depth.
      if (this.fog) {
        const t = clamp((depth - this.fog.near) / Math.max(1e-3, this.fog.far - this.fog.near), 0, 1);
        const fc = this.fog.color;
        r = r + (fc[0] - r) * t; g = g + (fc[1] - g) * t; b = b + (fc[2] - b) * t;
      }

      const col = `rgb(${clamp(r, 0, 255) | 0},${clamp(g, 0, 255) | 0},${clamp(b, 0, 255) | 0})`;
      draw.push({ pts, depth, col });
    }

    // Painter's algorithm: far (largest depth) first.
    draw.sort((a, b) => b.depth - a.depth);
    for (const d of draw) {
      const p = d.pts;
      ctx.beginPath();
      ctx.moveTo(p[0].sx, p[0].sy);
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].sx, p[i].sy);
      ctx.closePath();
      ctx.fillStyle = d.col;
      ctx.fill();
      if (this.stroke) {            // hairline stroke hides triangle seam gaps
        ctx.strokeStyle = d.col;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    return draw.length;
  }

  /// Remove the optional autoResize listener (no-op if you didn't opt in).
  dispose() {
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    this._onResize = null;
  }
}

// ---------- off-screen target arrow helper ----------
/**
 * Direction to point an off-screen indicator (a HUD chevron) at a world point.
 * Returns the screen-space angle (radians, atan2 of dx,dy from canvas center)
 * and whether the point is already on screen (so you can hide the arrow).
 * Flips correctly when the point is BEHIND the camera. Pure (no DOM).
 * @returns {{angle:number, onScreen:boolean}|null} null if W/H are degenerate.
 */
export function screenArrowDir(camera, worldPoint, W, H) {
  if (!(W > 0) || !(H > 0)) return null;
  const cx = W / 2, cy = H / 2;
  const pr = camera.project(worldPoint, W, H);
  const onScreen = pr.onScreen;
  let dx, dy;
  if (pr.cz >= camera.near) { dx = pr.sx - cx; dy = pr.sy - cy; }
  else { dx = cx - pr.sx; dy = cy - pr.sy; }   // behind camera -> flip
  return { angle: Math.atan2(dy, dx), onScreen };
}

// END mChatAI Web Component: core.software-3d-renderer
