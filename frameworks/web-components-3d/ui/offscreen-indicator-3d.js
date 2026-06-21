// BEGIN mChatAI Web Component: ui.offscreen-indicator-3d
//
// Off-screen objective indicator: a 2D-canvas HUD overlay that always shows
// the player where the current objective is.
//
//   * Target ON-SCREEN  -> a pulsing RETICLE ring is drawn at the target's
//     projected position.
//   * Target OFF-SCREEN  (or BEHIND the near plane) -> a directional ARROW is
//     clamped to a circular ring near the screen edge, pointing toward the
//     target. The behind-the-camera case is handled by flipping the direction
//     so the arrow never points the wrong way when the target is behind you.
//
// Direction math is renderer-agnostic and orientation-robust. You inject a
// project(worldPoint) callback; the arrow angle is derived from the camera-
// space right/up components (cr / cu) when your projector supplies them
// (more stable at any camera orientation than a raw screen-delta), and falls
// back to a screen-delta with a behind-near-plane flip otherwise. Because the
// projector is injected, the same module works over a three.js camera OR a
// hand-rolled software renderer -- it never imports three and never touches
// WebGL.
//
// Dependency-free: pure 2D canvas + DOM (like ui.minimap-3d / ui.three-hud-
// overlay). ZERO external deps. All motion is delta-time / clock based via an
// internal animation clock advanced from real time, so the pulse rate is frame-
// rate independent.
//
// Key exports:
//   OffscreenIndicator        class -- owns an overlay canvas (or draws into a
//                             provided ctx) and renders the reticle/arrow.
//   createOffscreenIndicator  thin factory returning a new OffscreenIndicator.
//
// project() contract (you supply this; both shapes are accepted):
//   project(worldPoint) -> {
//     sx, sy        screen pixels of the projected point (alias: x, y)
//     cz            camera-space depth (>= near means in front). alias: z
//     cr, cu        OPTIONAL camera-space right/up components of the target
//                   relative to the camera. If present they drive the arrow
//                   angle (orientation-robust). alias: rightDot/upDot
//     onScreen      OPTIONAL boolean; if omitted it is derived from sx/sy/cz
//                   and the configured screen margins.
//   }
//   worldPoint may be {x,y,z} OR [x,y,z]; it is passed through untouched.
//
// Usage:
//   import { OffscreenIndicator } from './ui/offscreen-indicator-3d.js';
//   const ind = new OffscreenIndicator({ host: document.body, near: 0.6 });
//   // each frame (dt in seconds):
//   ind.update(objective.position, project, { dt, label: 'GOAL', distance: d });
//   // ...
//   ind.dispose();
//
// Or draw into an existing HUD canvas you already own:
//   const ind = new OffscreenIndicator({ ctx: myCtx, width: W, height: H });
//   ind.update(target, project, { dt });   // does NOT clear your ctx by default
//
// Contracts:
//   * update(worldPoint, project, opts) is the whole per-frame API. Pass null
//     worldPoint to render nothing (the owned canvas is cleared).
//   * Styling (ringRadius, colors, pulseRate, arrow size, reticle size, label
//     font, screen margins) is all in opts / constructor opts -- no game text
//     is baked in.
//   * dispose() removes the owned canvas; safe to call twice. If you passed a
//     ctx, dispose() is a no-op for that ctx (you own it).

function num(v, d) { return typeof v === 'number' && Number.isFinite(v) ? v : d; }

// Normalize a world point into a value the injected project() understands.
// We pass it straight through; both {x,y,z} and [x,y,z] are valid -- the
// projector you supply decides. This indirection just guards against null.
function readProjection(p) {
  if (!p || typeof p !== 'object') return null;
  const sx = num(p.sx, num(p.x, NaN));
  const sy = num(p.sy, num(p.y, NaN));
  const cz = num(p.cz, num(p.z, NaN));
  if (!Number.isFinite(cz)) return null;
  // Camera-space right/up components (orientation-robust direction source).
  let cr = num(p.cr, num(p.rightDot, NaN));
  let cu = num(p.cu, num(p.upDot, NaN));
  if (!Number.isFinite(cr)) cr = NaN;
  if (!Number.isFinite(cu)) cu = NaN;
  return { sx, sy, cz, cr, cu, onScreen: (typeof p.onScreen === 'boolean') ? p.onScreen : null };
}

export class OffscreenIndicator {
  // opts:
  //   host        element to mount the owned canvas in. Default document.body.
  //   ctx         draw into THIS 2D context instead of owning a canvas. When
  //               set, no canvas is created and dispose() leaves it alone.
  //   width/height  logical (CSS px) size when drawing into a provided ctx.
  //               For an owned canvas they default to the viewport and track
  //               window resize automatically.
  //   near        near-plane depth; cz < near => behind / off-screen. Def 0.6.
  //   ringRadius  arrow ring radius as a fraction of min(W,H). Default 0.35.
  //   margin      on-screen test margin in px from each edge. Default 24.
  //   reticleColor / arrowColor / labelColor  CSS colors.
  //   pulseRate   reticle/arrow pulse angular rate (rad/s). Default 3.0.
  //   reticleRadius  base reticle radius in px. Default 22.
  //   arrowSize   arrow scale in px. Default 14.
  //   labelFont   CSS font for the optional distance/text label.
  //   zIndex      owned-canvas z-index. Default 45.
  //   clearOwned  clear the owned canvas each update. Default true. (Ignored
  //               when drawing into a provided ctx -- then clearCtx controls it.)
  //   clearCtx    when drawing into a provided ctx, clearRect it first.
  //               Default false (you own your HUD compositing order).
  constructor(opts = {}) {
    this.near = num(opts.near, 0.6);
    this.ringFrac = num(opts.ringRadius, 0.35);
    this.margin = num(opts.margin, 24);
    this.reticleColor = opts.reticleColor || 'rgba(90,200,255,0.92)';
    this.arrowColor = opts.arrowColor || 'rgba(90,200,255,0.9)';
    this.labelColor = opts.labelColor || 'rgba(180,225,255,0.92)';
    this.pulseRate = num(opts.pulseRate, 3.0);
    this.reticleRadius = num(opts.reticleRadius, 22);
    this.arrowSize = num(opts.arrowSize, 14);
    this.labelFont = opts.labelFont || '11px monospace';
    this._clearOwned = opts.clearOwned !== false;
    this._clearCtx = !!opts.clearCtx;

    this._clock = 0;       // internal animation clock (seconds), dt-advanced
    this._disposed = false;
    this._ownsCanvas = false;
    this.canvas = null;
    this._onResize = null;

    if (opts.ctx) {
      // Draw into a caller-owned context.
      this._ctx = opts.ctx;
      this.W = num(opts.width, 0);
      this.H = num(opts.height, 0);
      this._dpr = 1;
    } else {
      // Own a transparent overlay canvas sized to the viewport.
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio)
        ? Math.min(window.devicePixelRatio, 2) : 1;
      this._dpr = dpr;
      this._ownsCanvas = true;
      if (typeof document !== 'undefined') {
        this.canvas = document.createElement('canvas');
        this.canvas.style.cssText =
          'position:fixed;left:0;top:0;width:100%;height:100%;' +
          'pointer-events:none;z-index:' + num(opts.zIndex, 45) + ';';
        this._ctx = this.canvas.getContext('2d');
        const root = (opts.host && opts.host.appendChild)
          ? opts.host
          : (typeof document !== 'undefined' ? document.body : null);
        if (root) root.appendChild(this.canvas);
        this._resize(num(opts.width, 0), num(opts.height, 0));
        if (typeof window !== 'undefined') {
          this._onResize = () => this._resize(0, 0);
          window.addEventListener('resize', this._onResize);
        }
      }
    }
  }

  // Resize the owned canvas to the viewport (or explicit w/h), honoring dpr.
  _resize(w, h) {
    if (!this.canvas || !this._ctx) return;
    const cssW = w > 0 ? w : (typeof window !== 'undefined' ? window.innerWidth : 800);
    const cssH = h > 0 ? h : (typeof window !== 'undefined' ? window.innerHeight : 600);
    this.W = cssW;
    this.H = cssH;
    const dpr = this._dpr;
    this.canvas.width = Math.max(1, Math.round(cssW * dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * dpr));
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Allow callers using a provided ctx to keep our logical size in sync.
  setSize(w, h) {
    if (this._ownsCanvas) this._resize(num(w, 0), num(h, 0));
    else { this.W = num(w, this.W); this.H = num(h, this.H); }
    return this;
  }

  // Per-frame entry point.
  //   worldPoint  the objective in world space (passed to project() as-is).
  //               Pass null/undefined to render nothing.
  //   project     project(worldPoint) -> {sx,sy,cz,[cr,cu,onScreen]} (see top).
  //   opts:
  //     dt        delta time in seconds (advances the pulse). Default 1/60.
  //     label     optional text drawn near the marker (e.g. 'GOAL').
  //     distance  optional number; appended as a rounded distance to the label.
  //     ringRadius / reticleColor / arrowColor / ...  per-call style overrides.
  update(worldPoint, project, opts = {}) {
    if (this._disposed || !this._ctx) return this;
    const ctx = this._ctx;
    const W = this.W, H = this.H;

    this._clock += num(opts.dt, 1 / 60);

    if (this._ownsCanvas && this._clearOwned) ctx.clearRect(0, 0, W, H);
    else if (!this._ownsCanvas && this._clearCtx) ctx.clearRect(0, 0, W, H);

    if (worldPoint == null || typeof project !== 'function' || W <= 0 || H <= 0) {
      return this;
    }

    const pr = readProjection(project(worldPoint));
    if (!pr) return this;

    const cx = W / 2, cy = H / 2;
    const margin = num(opts.margin, this.margin);
    const near = this.near;
    const pulseRate = num(opts.pulseRate, this.pulseRate);
    const pulse = 0.6 + 0.4 * Math.sin(this._clock * pulseRate);

    // Decide on-screen: prefer the projector's own verdict if it gave one.
    let onScreen;
    if (pr.onScreen != null) {
      onScreen = pr.onScreen;
    } else {
      onScreen = pr.cz > near
        && pr.sx > margin && pr.sx < W - margin
        && pr.sy > margin && pr.sy < H - margin;
    }

    if (onScreen) {
      this._drawReticle(ctx, pr.sx, pr.sy, pulse, opts);
      this._drawLabel(ctx, pr.sx, pr.sy - num(opts.reticleRadius, this.reticleRadius) - 8, opts);
      return this;
    }

    // OFF-SCREEN (or behind near plane): clamp a directional arrow to the ring.
    // Direction source priority:
    //   1) camera-space right/up (cr, cu): orientation-robust. Screen-Y is
    //      inverted vs camera-up, so dy = -cu. When the target is BEHIND the
    //      near plane the screen projection would mirror, but cr/cu keep the
    //      true side, so they need NO flip.
    //   2) screen-delta fallback (no cr/cu): point from center to the projected
    //      point when in front; FLIP when behind the near plane so a behind-
    //      camera target does not point the wrong way.
    let dx, dy;
    if (Number.isFinite(pr.cr) && Number.isFinite(pr.cu)) {
      dx = pr.cr;
      dy = -pr.cu;
    } else if (pr.cz > near) {
      dx = pr.sx - cx;
      dy = pr.sy - cy;
    } else {
      // Behind the near plane: flip the (mirrored) screen delta.
      dx = cx - pr.sx;
      dy = cy - pr.sy;
    }
    let len = Math.hypot(dx, dy);
    if (len < 1e-6) { dx = 0; dy = -1; len = 1; } // degenerate (dead ahead/behind): point up
    dx /= len; dy /= len;

    const ringFrac = num(opts.ringRadius, this.ringFrac);
    const rad = Math.min(W, H) * ringFrac;
    const ang = Math.atan2(dy, dx);
    const ax = cx + Math.cos(ang) * rad;
    const ay = cy + Math.sin(ang) * rad;

    this._drawArrow(ctx, ax, ay, ang, pulse, opts);
    this._drawLabel(ctx, ax, ay - num(opts.arrowSize, this.arrowSize) - 6, opts);
    return this;
  }

  _drawReticle(ctx, x, y, pulse, opts) {
    const color = opts.reticleColor || this.reticleColor;
    const base = num(opts.reticleRadius, this.reticleRadius);
    const r = base * (1 + 0.08 * pulse);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    // small inner tick cross for a "locked-on" feel
    ctx.globalAlpha = 0.55 + 0.35 * pulse;
    const t = r * 0.45;
    ctx.beginPath();
    ctx.moveTo(x - t, y); ctx.lineTo(x - t * 0.4, y);
    ctx.moveTo(x + t * 0.4, y); ctx.lineTo(x + t, y);
    ctx.moveTo(x, y - t); ctx.lineTo(x, y - t * 0.4);
    ctx.moveTo(x, y + t * 0.4); ctx.lineTo(x, y + t);
    ctx.stroke();
    ctx.restore();
  }

  _drawArrow(ctx, x, y, ang, pulse, opts) {
    const color = opts.arrowColor || this.arrowColor;
    const s = num(opts.arrowSize, this.arrowSize);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.globalAlpha = 0.6 + 0.35 * pulse;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.6, -s * 0.78);
    ctx.lineTo(-s * 0.14, 0);
    ctx.lineTo(-s * 0.6, s * 0.78);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _drawLabel(ctx, x, y, opts) {
    let text = (typeof opts.label === 'string') ? opts.label : '';
    if (typeof opts.distance === 'number' && Number.isFinite(opts.distance)) {
      const d = Math.round(opts.distance);
      text = text ? (text + ' ' + d + 'm') : (d + 'm');
    }
    if (!text) return;
    ctx.save();
    ctx.fillStyle = opts.labelColor || this.labelColor;
    ctx.font = opts.labelFont || this.labelFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  setVisible(on) {
    if (this.canvas) this.canvas.style.display = on ? 'block' : 'none';
    return this;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    if (this._onResize && typeof window !== 'undefined') {
      window.removeEventListener('resize', this._onResize);
      this._onResize = null;
    }
    if (this._ownsCanvas && this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    // If a ctx was provided by the caller, we deliberately leave it untouched.
  }
}

export function createOffscreenIndicator(opts) {
  return new OffscreenIndicator(opts);
}

// END mChatAI Web Component: ui.offscreen-indicator-3d
