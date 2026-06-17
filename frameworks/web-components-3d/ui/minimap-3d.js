// BEGIN mChatAI Web Component: ui.minimap-3d
//
// A 2D-canvas minimap overlay drawn over the WebGL canvas (NO second WebGL
// context). Plots the player + tracked entities + terrain bounds from world
// coordinates onto a small top-down disc, painted at runtime (the World of
// ClaudeCraft procedural-UI ethos -- no image assets). Orientation-aware:
// optionally rotates with the player heading.
//
// Dependency-free (2D canvas + DOM, like ui.three-hud-overlay). Reads plain
// {x, z} world positions, so it never touches three.js.
//
// Usage:
//   import { Minimap3D } from './ui/minimap-3d.js';
//   const map = new Minimap3D({ host: document.body, worldSize: 200, radius: 70 });
//   // each frame:
//   map.clearMarkers();
//   map.setPlayer(player.position.x, player.position.z, player.rotation.y);
//   for (const e of enemies) map.addMarker(e.position.x, e.position.z, '#e44');
//   map.draw();
//   map.dispose();

function num(v, d) { return typeof v === 'number' && Number.isFinite(v) ? v : d; }

export class Minimap3D {
  // opts:
  //   host       element to mount in. Default document.body.
  //   worldSize  world extent the map spans (matches your terrain size). Default 200.
  //   radius     map radius in CSS px. Default 70.
  //   rotateWithPlayer  rotate the map so the player always faces up. Default false.
  //   position   { top,right } CSS offset. Default top-right.
  //   bg / ring  colors.
  constructor(opts = {}) {
    this.worldSize = num(opts.worldSize, 200);
    this.radius = num(opts.radius, 70);
    this.rotate = !!opts.rotateWithPlayer;
    this.bg = opts.bg || 'rgba(10,14,20,0.55)';
    this.ring = opts.ring || 'rgba(255,255,255,0.35)';
    this.playerColor = opts.playerColor || '#5fd0ff';
    this._disposed = false;

    this._player = { x: 0, z: 0, heading: 0 };
    this._markers = [];

    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? Math.min(window.devicePixelRatio, 2) : 1;
    this._dpr = dpr;
    const px = this.radius * 2;

    this.canvas = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
    if (this.canvas) {
      this.canvas.width = px * dpr;
      this.canvas.height = px * dpr;
      const pos = opts.position || { top: 14, right: 14 };
      this.canvas.style.cssText =
        `position:fixed;top:${num(pos.top, 14)}px;right:${num(pos.right, 14)}px;` +
        `width:${px}px;height:${px}px;border-radius:50%;z-index:40;pointer-events:none;`;
      this._ctx = this.canvas.getContext('2d');
      this._ctx.scale(dpr, dpr);
      const root = (opts.host && opts.host.appendChild) ? opts.host : (typeof document !== 'undefined' ? document.body : null);
      if (root) root.appendChild(this.canvas);
    }
  }

  setPlayer(x, z, heading = 0) {
    this._player.x = num(x, 0);
    this._player.z = num(z, 0);
    this._player.heading = num(heading, 0);
    return this;
  }

  addMarker(x, z, color = '#e44', size = 3) {
    this._markers.push({ x: num(x, 0), z: num(z, 0), color, size });
    return this;
  }

  clearMarkers() {
    this._markers.length = 0;
    return this;
  }

  // World (x,z) -> map-local pixel offset from center, honoring rotation.
  _project(x, z) {
    const half = this.worldSize / 2;
    let dx = (x - this._player.x) / half; // -1..1 relative to player
    let dz = (z - this._player.z) / half;
    if (this.rotate) {
      const a = -this._player.heading;
      const c = Math.cos(a), s = Math.sin(a);
      const rx = dx * c - dz * s;
      const rz = dx * s + dz * c;
      dx = rx; dz = rz;
    }
    return { px: dx * this.radius, py: dz * this.radius };
  }

  draw() {
    if (this._disposed || !this._ctx) return this;
    const ctx = this._ctx;
    const R = this.radius;
    ctx.clearRect(0, 0, R * 2, R * 2);

    // disc bg + ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, Math.PI * 2);
    ctx.fillStyle = this.bg;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.ring;
    ctx.stroke();
    ctx.clip(); // markers can't spill outside the disc

    // markers
    for (const m of this._markers) {
      const p = this._project(m.x, m.z);
      const mx = R + p.px;
      const my = R + p.py;
      if (Math.hypot(p.px, p.py) > R) continue; // off-map
      ctx.beginPath();
      ctx.arc(mx, my, m.size, 0, Math.PI * 2);
      ctx.fillStyle = m.color;
      ctx.fill();
    }

    // player at center (a small triangle pointing up = forward)
    ctx.translate(R, R);
    if (!this.rotate) ctx.rotate(this._player.heading);
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fillStyle = this.playerColor;
    ctx.fill();
    ctx.restore();
    return this;
  }

  setVisible(on) {
    if (this.canvas) this.canvas.style.display = on ? 'block' : 'none';
    return this;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }
}

// END mChatAI Web Component: ui.minimap-3d
