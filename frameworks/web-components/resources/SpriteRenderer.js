// SpriteRenderer — pixel-grid sprite rendering for Canvas2D mini-apps.
//
// Sprite format: 2D array of indices.
//   0 = transparent
//   1, 2, 3, ... = palette index (1-based for readability)
//
// Example:
//   const SHIP = [
//     [0,0,1,0,0],
//     [0,1,2,1,0],
//     [1,2,2,2,1],
//   ];
//   const palette = { 1: "#22d3ee", 2: "#0ea5e9" };
//   drawSprite(ctx, SHIP, palette, { x: 100, y: 100, scale: 4 });
//
// Composite sprites: arrays of layers, drawn in order with optional offsets.
// Animation: cycle through frames at a configured frame-rate.

const TRANSPARENT = 0;

export function spriteSize(grid) {
  if (!Array.isArray(grid) || grid.length === 0) return { width: 0, height: 0 };
  return { width: grid[0].length, height: grid.length };
}

/**
 * Draw a single pixel-grid sprite to a Canvas2D context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number[][]} grid - 2D array of palette indices (0 = transparent).
 * @param {Object<number,string>} palette - { 1: "#aabbcc", 2: "#..." }.
 * @param {Object} options - { x, y, scale, anchor, rotation, alpha }
 */
export function drawSprite(ctx, grid, palette, options = {}) {
  if (!ctx || !Array.isArray(grid) || grid.length === 0) return;
  const scale = options.scale ?? 1;
  const x = options.x ?? 0;
  const y = options.y ?? 0;
  const rows = grid.length;
  const cols = grid[0].length;
  // Anchor: "topleft" (default), "center", or { x, y } in pixel-cells.
  const anchorX = options.anchor === "center" ? cols / 2 : (options.anchor?.x ?? 0);
  const anchorY = options.anchor === "center" ? rows / 2 : (options.anchor?.y ?? 0);

  const needsTransform = options.rotation || options.flipX || options.flipY;
  if (needsTransform) {
    ctx.save();
    ctx.translate(x, y);
    if (options.rotation) ctx.rotate(options.rotation);
    if (options.flipX) ctx.scale(-1, 1);
    if (options.flipY) ctx.scale(1, -1);
    if (typeof options.alpha === "number") ctx.globalAlpha = options.alpha;
  } else if (typeof options.alpha === "number") {
    ctx.save();
    ctx.globalAlpha = options.alpha;
  }

  const baseX = needsTransform ? -anchorX * scale : x - anchorX * scale;
  const baseY = needsTransform ? -anchorY * scale : y - anchorY * scale;

  for (let row = 0; row < rows; row += 1) {
    const rowArray = grid[row];
    if (!rowArray) continue;
    for (let col = 0; col < cols; col += 1) {
      const value = rowArray[col];
      if (value === TRANSPARENT) continue;
      const color = palette[value];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(baseX + col * scale, baseY + row * scale, scale, scale);
    }
  }

  if (needsTransform || typeof options.alpha === "number") ctx.restore();
}

/**
 * Composite sprite — multiple layers drawn in order with their own offsets.
 * Each layer is { grid, offsetX?, offsetY?, palette? } where palette overrides the parent.
 */
export function drawCompositeSprite(ctx, layers, palette, options = {}) {
  if (!Array.isArray(layers)) return;
  const baseX = options.x ?? 0;
  const baseY = options.y ?? 0;
  const scale = options.scale ?? 1;

  for (const layer of layers) {
    if (!layer || !layer.grid) continue;
    drawSprite(ctx, layer.grid, layer.palette || palette, {
      ...options,
      x: baseX + (layer.offsetX || 0) * scale,
      y: baseY + (layer.offsetY || 0) * scale
    });
  }
}

/**
 * Animation — cycles through `frames` (each a sprite grid) at the given rate.
 *
 *   const walk = new SpriteAnimation({ frames: [WALK_1, WALK_2], frameDuration: 0.15 });
 *   walk.update(dt);
 *   drawSprite(ctx, walk.currentFrame(), palette, { x, y, scale });
 */
export class SpriteAnimation {
  constructor(options = {}) {
    this.frames = Array.isArray(options.frames) ? options.frames : [];
    this.frameDuration = typeof options.frameDuration === "number" ? options.frameDuration : 0.15;
    this.loop = options.loop !== false;
    this.elapsed = 0;
    this.index = 0;
  }

  update(dt) {
    if (this.frames.length <= 1) return;
    this.elapsed += dt;
    while (this.elapsed >= this.frameDuration) {
      this.elapsed -= this.frameDuration;
      this.index += 1;
      if (this.index >= this.frames.length) {
        this.index = this.loop ? 0 : this.frames.length - 1;
      }
    }
  }

  currentFrame() {
    return this.frames[this.index] || null;
  }

  reset() {
    this.elapsed = 0;
    this.index = 0;
  }
}

/**
 * Convenience wrapper that owns a sprite + palette + optional animation.
 *
 *   const dragon = new Sprite({ grid: DRAGON, palette: DRAGON_PALETTE, scale: 4 });
 *   dragon.draw(ctx, { x, y });
 */
export class Sprite {
  constructor(options = {}) {
    this.grid = options.grid || null;
    this.palette = options.palette || {};
    this.scale = options.scale ?? 1;
    this.anchor = options.anchor || "topleft";
    this.animation = options.animation instanceof SpriteAnimation ? options.animation : null;
  }

  update(dt) {
    if (this.animation) this.animation.update(dt);
  }

  draw(ctx, options = {}) {
    const grid = this.animation ? this.animation.currentFrame() : this.grid;
    if (!grid) return;
    drawSprite(ctx, grid, this.palette, {
      scale: this.scale,
      anchor: this.anchor,
      ...options
    });
  }
}
