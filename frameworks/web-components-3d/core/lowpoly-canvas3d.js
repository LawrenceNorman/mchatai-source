// BEGIN mChatAI Web Component: core.lowpoly-canvas3d
//
// Low-poly painter's-algorithm 3D on a plain 2D canvas — NO three.js, NO WebGL,
// NO external dependencies. Projects flat-shaded triangles with a tiny vec3/mat4
// math kit and depth-sorts them (painter's algorithm). Trivially offline-safe
// (it touches nothing but a CanvasRenderingContext2D) and renders identically in
// WKWebView / Safari / Chrome. This is the "let it cook" lightweight 3D track —
// use it for orbit dioramas (islands, planets, terrains, towns, dioramas) where
// you want a stylized faceted look without shipping a renderer.
//
// Extracted + generalized from the proven `floating-island-3d` build (2026-06-15).
//
// USAGE
//   import { LowPolyScene, OrbitCamera, mesh } from './lowpoly-canvas3d.js';
//   const scene = new LowPolyScene(canvas);                 // wraps a <canvas>
//   const cam = new OrbitCamera(canvas, { r: 14, az: 0.8, el: 0.42 });
//   const faces = [];                                       // {v:[p0,p1,p2], c:[r,g,b]}
//   mesh.cone(faces, { cx:0, baseY:0, cz:0, r:1, h:1.5, seg:8, color:[54,132,58] });
//   mesh.box(faces,  { cx:0, cy:0, cz:0, sx:.3, sy:1, sz:.3, color:[102,70,44] });
//   function frame(now){ scene.render(faces, cam); cam.update(); requestAnimationFrame(frame); }
//   requestAnimationFrame(frame);
//
// A "face" is { v: [[x,y,z],[x,y,z],[x,y,z]], c: [r,g,b] }  (0-255 colors).
// Build the geometry however you like; the renderer is purely a projector + sorter.

// ---------- vec3 ----------
export const vec3 = {
  sub:   (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  cross: (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  dot:   (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  norm:  (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
};

// ---------- mat4 (row-major) ----------
export const mat4 = {
  // 4x4 (row-major, flat-16) * vec4
  mulMV: (m, v) => [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2] + m[3] * v[3],
    m[4] * v[0] + m[5] * v[1] + m[6] * v[2] + m[7] * v[3],
    m[8] * v[0] + m[9] * v[1] + m[10] * v[2] + m[11] * v[3],
    m[12] * v[0] + m[13] * v[1] + m[14] * v[2] + m[15] * v[3],
  ],
  lookAt: (eye, center, up) => {
    const z = vec3.norm(vec3.sub(eye, center));
    const x = vec3.norm(vec3.cross(up, z));
    const y = vec3.cross(z, x);
    return [
      x[0], x[1], x[2], -vec3.dot(x, eye),
      y[0], y[1], y[2], -vec3.dot(y, eye),
      z[0], z[1], z[2], -vec3.dot(z, eye),
      0, 0, 0, 1,
    ];
  },
  perspective: (fovy, aspect, near, far) => {
    const f = 1 / Math.tan(fovy / 2);
    return [
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) / (near - far), (2 * far * near) / (near - far),
      0, 0, -1, 0,
    ];
  },
};

// ---------- helpers ----------
/// Deterministic LCG — same seed → same scene every load (no popping geometry).
export function seededRng(seed = 1337) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/// Flat-shade tint: multiply an [r,g,b] base by k, clamped to 0-255.
export function shade(base, k) {
  return [
    Math.max(0, Math.min(255, base[0] * k)),
    Math.max(0, Math.min(255, base[1] * k)),
    Math.max(0, Math.min(255, base[2] * k)),
  ];
}

// ---------- mesh builders (push faces into an array) ----------
export const mesh = {
  /// Faceted cone — foliage, hills, spikes, rooftops. seg≈8 reads "low-poly".
  cone(faces, { cx, baseY, cz, r, h, seg = 8, color, rng = Math.random }) {
    const apex = [cx, baseY + h, cz];
    for (let s = 0; s < seg; s++) {
      const a0 = (s / seg) * Math.PI * 2;
      const a1 = ((s + 1) / seg) * Math.PI * 2;
      const p0 = [cx + Math.cos(a0) * r, baseY, cz + Math.sin(a0) * r];
      const p1 = [cx + Math.cos(a1) * r, baseY, cz + Math.sin(a1) * r];
      faces.push({ v: [apex, p1, p0], c: shade(color, 0.82 + rng() * 0.34) });
    }
  },
  /// Axis-aligned box — trunks, crates, buildings, blocks.
  box(faces, { cx, cy, cz, sx, sy, sz, color, rng = Math.random }) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2;
    const y0 = cy, y1 = cy + sy;
    const z0 = cz - sz / 2, z1 = cz + sz / 2;
    const p = [
      [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
      [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
    ];
    const quads = [[0,1,2,3],[5,4,7,6],[4,0,3,7],[1,5,6,2],[3,2,6,7],[4,5,1,0]];
    for (const q of quads) {
      const k = 0.8 + rng() * 0.3;
      faces.push({ v: [p[q[0]], p[q[1]], p[q[2]]], c: shade(color, k) });
      faces.push({ v: [p[q[0]], p[q[2]], p[q[3]]], c: shade(color, k) });
    }
  },
  /// Stacked rings → a closed faceted surface (domes, islands, blobs, planets).
  /// `rings` = [{ r, y }] outer→inner; jitter adds organic low-poly wobble.
  ringSurface(faces, { cx = 0, cz = 0, seg = 18, rings, color, jitter = 0.16, rng = Math.random }) {
    const rows = rings.map(({ r, y }) => {
      const row = [];
      for (let s = 0; s < seg; s++) {
        const a = (s / seg) * Math.PI * 2;
        const rr = r * (1 - jitter / 2 + rng() * jitter);
        const yy = y + (rng() - 0.5) * jitter * 2;
        row.push([cx + Math.cos(a) * rr, yy, cz + Math.sin(a) * rr]);
      }
      return row;
    });
    for (let i = 0; i < rows.length - 1; i++) {
      for (let s = 0; s < seg; s++) {
        const s2 = (s + 1) % seg;
        const a = rows[i][s], b = rows[i][s2], c = rows[i + 1][s2], d = rows[i + 1][s];
        const tone = 0.82 + rng() * 0.3;
        faces.push({ v: [a, b, c], c: shade(color, tone) });
        faces.push({ v: [a, c, d], c: shade(color, tone) });
      }
    }
    return rows;
  },
};

// ---------- renderer ----------
export class LowPolyScene {
  /// canvas: a <canvas> element. opts: { fov, near, far, ambient, diffuse,
  /// lightDir, background, autoResize }.
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.fov = (opts.fov ?? 50) * Math.PI / 180;
    this.near = opts.near ?? 0.1;
    this.far = opts.far ?? 100;
    this.ambient = opts.ambient ?? 0.42;
    this.diffuse = opts.diffuse ?? 0.72;
    this.lightDir = vec3.norm(opts.lightDir ?? [0.4, 0.9, 0.3]);
    this.background = opts.background ?? null;     // null = transparent clear
    this._dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (opts.autoResize !== false) {
      this._resize = () => this.resize();
      window.addEventListener('resize', this._resize);
      this.resize();
    }
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, r.width || this.canvas.clientWidth || 800);
    const h = Math.max(1, r.height || this.canvas.clientHeight || 600);
    this.canvas.width = w * this._dpr;
    this.canvas.height = h * this._dpr;
    this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    this.W = w; this.H = h;
  }
  /// Project + light + depth-sort + fill `faces` from `camera`'s viewpoint.
  render(faces, camera) {
    const { ctx, W, H } = this;
    if (this.background) { ctx.fillStyle = this.background; ctx.fillRect(0, 0, W, H); }
    else ctx.clearRect(0, 0, W, H);

    const eye = camera.eye();
    const view = mat4.lookAt(eye, camera.target, [0, 1, 0]);
    const proj = mat4.perspective(this.fov, W / H, this.near, this.far);
    const drawList = [];

    for (const f of faces) {
      const v = f.v;
      let n = vec3.norm(vec3.cross(vec3.sub(v[1], v[0]), vec3.sub(v[2], v[0])));
      const cen = [
        (v[0][0] + v[1][0] + v[2][0]) / 3,
        (v[0][1] + v[1][1] + v[2][1]) / 3,
        (v[0][2] + v[1][2] + v[2][2]) / 3,
      ];
      // two-sided lighting: orient the normal toward the camera
      if (vec3.dot(n, vec3.sub(eye, cen)) < 0) n = [-n[0], -n[1], -n[2]];
      const lit = this.ambient + this.diffuse * Math.max(0, vec3.dot(n, this.lightDir));

      const pts = [];
      let depth = 0, ok = true;
      for (let k = 0; k < 3; k++) {
        const vv = mat4.mulMV(view, [v[k][0], v[k][1], v[k][2], 1]);
        depth += vv[2];
        const cl = mat4.mulMV(proj, vv);
        if (cl[3] <= 0.05) { ok = false; break; }
        const ndcx = cl[0] / cl[3], ndcy = cl[1] / cl[3];
        pts.push([(ndcx * 0.5 + 0.5) * W, (1 - (ndcy * 0.5 + 0.5)) * H]);
      }
      if (!ok) continue;
      const c = f.c;
      drawList.push({
        pts,
        col: `rgb(${(c[0] * lit) | 0},${(c[1] * lit) | 0},${(c[2] * lit) | 0})`,
        depth: depth / 3,
      });
    }

    drawList.sort((a, b) => a.depth - b.depth);   // far (more negative) first
    for (const d of drawList) {
      const p = d.pts;
      ctx.beginPath();
      ctx.moveTo(p[0][0], p[0][1]);
      ctx.lineTo(p[1][0], p[1][1]);
      ctx.lineTo(p[2][0], p[2][1]);
      ctx.closePath();
      ctx.fillStyle = d.col;
      ctx.fill();
      ctx.strokeStyle = d.col;     // hairline stroke hides triangle seam gaps
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  dispose() {
    if (this._resize) window.removeEventListener('resize', this._resize);
  }
}

// ---------- orbit camera ----------
export class OrbitCamera {
  /// Spherical orbit (az/el/r) around `target`. Attaches drag / touch / pinch /
  /// wheel handlers to `canvas` (pass null to wire your own). update() applies
  /// auto-spin. Call eye() for the world-space camera position.
  constructor(canvas, opts = {}) {
    this.target = opts.target ?? [0, 0, 0];
    this.az = opts.az ?? 0.8;
    this.el = opts.el ?? 0.42;
    this.r = opts.r ?? 14;
    this.rMin = opts.rMin ?? 7;
    this.rMax = opts.rMax ?? 24;
    this.elMin = opts.elMin ?? -0.25;
    this.elMax = opts.elMax ?? (Math.PI / 2 - 0.08);
    this.autoSpin = opts.autoSpin ?? false;
    this.spinSpeed = opts.spinSpeed ?? 0.0035;
    this.sensitivity = opts.sensitivity ?? 0.008;
    this._dragging = false; this._lastX = 0; this._lastY = 0; this._lastPinch = 0;
    if (canvas) this.attach(canvas);
  }
  eye() {
    return [
      this.target[0] + this.r * Math.cos(this.el) * Math.cos(this.az),
      this.target[1] + this.r * Math.sin(this.el),
      this.target[2] + this.r * Math.cos(this.el) * Math.sin(this.az),
    ];
  }
  _down(x, y) { this._dragging = true; this._lastX = x; this._lastY = y; }
  _move(x, y) {
    if (!this._dragging) return;
    this.az -= (x - this._lastX) * this.sensitivity;
    this.el += (y - this._lastY) * this.sensitivity;
    this.el = Math.max(this.elMin, Math.min(this.elMax, this.el));
    this._lastX = x; this._lastY = y;
  }
  _up() { this._dragging = false; }
  _zoom(delta) { this.r = Math.max(this.rMin, Math.min(this.rMax, this.r + delta)); }
  attach(canvas) {
    this.canvas = canvas;
    canvas.addEventListener('mousedown', (e) => this._down(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => this._move(e.clientX, e.clientY));
    window.addEventListener('mouseup', () => this._up());
    canvas.addEventListener('wheel', (e) => { this._zoom(e.deltaY * 0.01); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) this._down(e.touches[0].clientX, e.touches[0].clientY);
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        this._move(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 2) {
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY);
        if (this._lastPinch) this._zoom(-(d - this._lastPinch) * 0.03);
        this._lastPinch = d;
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchend', (e) => { this._up(); if (e.touches.length < 2) this._lastPinch = 0; });
  }
  update() {
    if (this.autoSpin && !this._dragging) this.az += this.spinSpeed;
  }
}

// END mChatAI Web Component: core.lowpoly-canvas3d
