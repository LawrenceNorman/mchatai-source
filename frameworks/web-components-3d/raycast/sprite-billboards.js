// BEGIN mChatAI Web Component: raycast.sprite-billboards
//
// Z-Buffer Billboard Sprite Renderer for software raycasters.
// PURE 2D-canvas. ZERO three.js / WebGL / external deps. No imports.
// Offline-safe under file://. Companion to raycast.dda-engine.
//
// PURPOSE
//   Renders billboard sprites (enemies, items, pickups, projectiles, exit
//   portals, decals) into a software-raycast scene with CORRECT per-pixel-column
//   occlusion against the wall z-buffer. This is the depth-sorted, wall-occluded
//   "thing renderer" that every first-person raycaster re-derives: transform each
//   sprite into camera space with the inverse-determinant trick, sort far-to-near
//   (painter's order), then draw each sprite one screen-column at a time, skipping
//   any column whose perpendicular depth is >= the wall depth already stored at
//   that column. Generalized from four shipped raycaster games.
//
// THE PROVEN MATH, generalized (identical across all four source games):
//   invDet     = 1 / (planeX*dirY - dirX*planeY)
//   relX,relY  = sprite - player
//   transformX = invDet * (dirY*relX - dirX*relY)        // lateral, screen-space
//   depth      = invDet * (-planeY*relX + planeX*relY)    // perpendicular depth
//   screenX    = (W/2) * (1 + transformX / depth)
//   drawH      = (H / depth) * hScale                     // sprite pixel height
//   per column col in [startX, endX):
//       if (depth >= zbuffer[col]) continue;              // OCCLUDED by a wall
//       ... draw this 1px-wide slice ...
//
// ====================================================================
//  Z-BUFFER CONTRACT WITH raycast.dda-engine
// ====================================================================
//  `camera`  is the basis object returned by raycast.dda-engine cameraBasis():
//            { dirX, dirY, planeX, planeY }. The SAME basis used to cast walls
//            MUST be passed here, or sprites will not line up with the world.
//  `zbuffer` is the EXACT Float32Array returned by raycast.dda-engine
//            renderWalls(). Entry zbuffer[col] is the PERPENDICULAR wall distance
//            (NOT euclidean) for screen column `col`, in world units, same units
//            as the sprite `depth` computed here. Its length is the render width
//            in device pixels (W). renderWalls() MUST run BEFORE renderSprites()
//            every frame so the buffer is fresh. We only READ it; never mutate.
//  `ctx`     is a CanvasRenderingContext2D. W = ctx.canvas.width,
//            H = ctx.canvas.height (device pixels). DPR clamp (<=2) is the
//            caller's job at canvas-size time; this module renders in pixels.
//  Anchoring: a depth-1 sprite with hScale=1 fills the screen height, exactly
//            like a depth-1 wall stripe, so sprites and walls share one scale.
//
//  ALL motion (positions, bob phase, dying timers, hit timers, frame timers)
//  is delta-time computed by the CALLER. This module is a PURE renderer: it
//  reads sprite fields and draws. It owns no DOM, no listeners, no GPU state,
//  so there is nothing to dispose; clearImpostorCache() is the only cleanup and
//  is optional (frees cached procedural impostor canvases).
//
// SPRITE OBJECT
//   { x, y,                      // world position (same grid as the player)
//     img,                       // optional HTMLCanvasElement/Image impostor
//     draw,                      // optional draw(ctx, cx, cy, scale, sprite, info)
//     wScale, hScale,            // independent width/height multipliers (def 1)
//     bob,                       // vertical lift in screen-height fractions (def 0)
//     tint,                      // distance-fog/lighting override 0..1 (1 = full)
//     anchor,                    // 'floor' (default) | 'center'
//     frame,                     // explicit frame index, or use pickFrame opts
//     hit,                       // 0..1 red hurt-flash overlay strength (def 0)
//     alpha,                     // 0..1 dying squash/fade (def 1)
//     hp, maxHp,                 // if hp<maxHp a floating health pip is drawn
//     scaleY }                   // optional extra vertical squash for dying anims
//   Provide EITHER `img` (textured impostor, drawImage column-slice) OR `draw`
//   (caller-supplied vector art callback). If neither, an opts.draw or opts.kinds
//   fallback is used; if still nothing, the sprite is skipped.
//
// EXPORTS (named)
//   renderSprites(ctx, sprites, player, camera, zbuffer, opts)  -> count drawn
//   transformSprite(sprite, player, camera)  -> { transformX, depth } | null
//   makeKindRenderer(kinds)  -> draw(ctx, cx, cy, scale, sprite, info)
//   makeImpostorCache()      -> { get(key, w, h, paint), clear() }
//   clearImpostorCache()     -> void  (clears the module-level shared cache)
//
// USAGE (textured impostors, the classic FPS path)
//   import { renderSprites } from './sprite-billboards.js';
//   // ... each frame, AFTER walls:
//   const cam = cameraBasis(player, fov);          // raycast.dda-engine
//   const zb  = renderWalls(ctx, grid, player, cam, texLookup);
//   const sprites = enemies.map(e => ({
//     x: e.x, y: e.y, img: enemyTex[e.type][e.frame],
//     hScale: e.size, hit: e.hitFlash, alpha: e.dying ? e.fade : 1,
//     hp: e.hp, maxHp: e.maxHp, anchor: 'floor',
//   }));
//   renderSprites(ctx, sprites, player, cam, zb, {
//     fog: { start: 2.5, range: 18, max: 0.55 },
//     pickFrame: (s, info) => (Math.floor(info.time * 4 + s.x) % 2),
//     time: nowSeconds,
//   });
//
// USAGE (pluggable vector art, generalizes the e/b/p kind-switch)
//   const drawKind = makeKindRenderer({
//     enemy:  (ctx, cx, cy, scale, s) => drawDrone(ctx, cx, cy, scale, s),
//     bolt:   (ctx, cx, cy, scale)    => drawGlowDot(ctx, cx, cy, scale),
//     pickup: (ctx, cx, cy, scale, s) => drawPickup(ctx, cx, cy, scale, s),
//   });
//   renderSprites(ctx, [
//     { x, y, kind: 'enemy', hScale: 1 },
//     { x, y, kind: 'bolt',  anchor: 'center', hScale: 0.1 },
//   ], player, cam, zb, { draw: drawKind });
// ====================================================================

// ---------- private helpers (dependency-free) ----------
function _clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function _num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }

// Shared module-level impostor cache so multiple games / callers that ask for
// the same procedural sprite key reuse one offscreen canvas.
const _sharedCache = makeImpostorCache();

/**
 * Transform a sprite from world space into the raycaster camera space using the
 * inverse-determinant trick. Returns the lateral screen coordinate `transformX`
 * and the PERPENDICULAR `depth` (comparable directly against zbuffer entries),
 * or null when the sprite is at/behind the camera plane (depth <= 0).
 *
 * @param {{x:number,y:number}} sprite
 * @param {{x:number,y:number}} player
 * @param {{dirX:number,dirY:number,planeX:number,planeY:number}} camera
 * @returns {{transformX:number, depth:number}|null}
 */
export function transformSprite(sprite, player, camera) {
  const det = camera.planeX * camera.dirY - camera.dirX * camera.planeY;
  if (det === 0) return null;
  const invDet = 1 / det;
  const relX = sprite.x - player.x;
  const relY = sprite.y - player.y;
  const transformX = invDet * (camera.dirY * relX - camera.dirX * relY);
  const depth = invDet * (-camera.planeY * relX + camera.planeX * relY);
  if (depth <= 0) return null;
  return { transformX: transformX, depth: depth };
}

/**
 * Render an array of billboard sprites into a 2D-canvas raycast scene with
 * per-column occlusion against the wall z-buffer. Sprites are depth-sorted
 * far-to-near and drawn one screen column at a time; any column whose sprite
 * depth is NOT nearer than zbuffer[col] is skipped (the wall wins). Pure
 * renderer: it reads sprite fields and draws. Returns how many sprites had at
 * least one visible column drawn.
 *
 * Per-sprite draw resolution order:
 *   1. sprite.draw(ctx, cx, cy, scale, sprite, info)   -- vector callback
 *   2. opts.draw(ctx, cx, cy, scale, sprite, info)     -- shared vector callback
 *   3. sprite.img drawImage column-slice                -- textured impostor
 * The textured path performs the strict per-column z-test; the callback path
 * is clipped to the sprite's screen rect and z-tested at its center column
 * (vector art is not column-sliced, matching station-defense's glow sprites).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<object>} sprites  array of sprite objects (see file header)
 * @param {{x:number,y:number}} player
 * @param {{dirX:number,dirY:number,planeX:number,planeY:number}} camera  cameraBasis()
 * @param {Float32Array} zbuffer  EXACT array returned by renderWalls() (read-only)
 * @param {object} [opts]
 * @param {function} [opts.draw]   shared fallback vector draw callback
 * @param {function} [opts.pickFrame]  (sprite, info) -> frame index for animation
 * @param {{start?:number,range?:number,max?:number,color?:string}} [opts.fog]
 *        distance darkening matching the walls; start/range in world units,
 *        max 0..1 cap, color the overlay (default near-black). Off when omitted.
 * @param {boolean} [opts.healthPips=true]  draw floating hp bar over wounded sprites
 * @param {number}  [opts.healthPipMaxDepth=8]  only draw hp bars nearer than this
 * @param {string}  [opts.hurtColor='rgba(255,60,40,'] red hurt overlay rgba prefix
 * @param {number}  [opts.time=0]  current time in seconds (passed to callbacks)
 * @param {number}  [opts.minDepth=0.06]  cull sprites nearer than this (avoid /0)
 * @returns {number} number of sprites drawn (at least one visible column)
 */
export function renderSprites(ctx, sprites, player, camera, zbuffer, opts) {
  opts = opts || {};
  if (!ctx || !sprites || !sprites.length || !zbuffer) return 0;

  const W = ctx.canvas.width | 0;
  const H = ctx.canvas.height | 0;
  const zLen = zbuffer.length;
  const minDepth = _num(opts.minDepth, 0.06);
  const time = _num(opts.time, 0);
  const sharedDraw = (typeof opts.draw === 'function') ? opts.draw : null;
  const pickFrame = (typeof opts.pickFrame === 'function') ? opts.pickFrame : null;
  const healthPips = opts.healthPips !== false;
  const pipMaxDepth = _num(opts.healthPipMaxDepth, 8);
  const hurtPrefix = opts.hurtColor || 'rgba(255,60,40,';
  const fog = opts.fog || null;
  const fogColor = (fog && fog.color) || '6,7,9';
  const fogStart = fog ? _num(fog.start, 2.5) : 0;
  const fogRange = fog ? _num(fog.range, 18) : 1;
  const fogMax = fog ? _clamp(_num(fog.max, 0.55), 0, 1) : 0;

  // --- 1. transform + cull behind-camera, carry depth on a working list ---
  const list = [];
  for (let i = 0; i < sprites.length; i++) {
    const s = sprites[i];
    if (!s) continue;
    const t = transformSprite(s, player, camera);
    if (!t || t.depth <= minDepth) continue;          // behind / on the plane
    list.push({ s: s, transformX: t.transformX, depth: t.depth });
  }
  if (!list.length) return 0;

  // --- 2. depth sort far -> near (painter's order) ---
  list.sort((a, b) => b.depth - a.depth);

  // --- 3. draw each sprite ---
  let drawn = 0;
  const halfW = W / 2;
  const prevAlpha = ctx.globalAlpha;
  const prevFilter = ctx.filter;

  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    const s = it.s;
    const depth = it.depth;

    const hScale = _num(s.hScale, 1);
    const wScale = _num(s.wScale, _num(s.scale, 1));
    const scaleY = _num(s.scaleY, 1);
    const alpha = _clamp(_num(s.alpha, 1), 0, 1);
    if (alpha <= 0) continue;

    const fullH = H / depth;                           // depth-1 fills screen
    const drawH = fullH * hScale * scaleY;
    const drawW = fullH * wScale;
    const screenX = halfW * (1 + it.transformX / depth);
    const startX = Math.floor(screenX - drawW / 2);
    const endX = Math.floor(startX + drawW);

    // vertical anchor: floor-anchored sits feet on the horizon (like a wall
    // base) and grows upward; center-anchored centers on the horizon (bolts,
    // particles, flying things). bob lifts in screen-height fractions.
    const bob = _num(s.bob, 0) * fullH;
    const anchor = s.anchor === 'center' ? 'center' : 'floor';
    let topY;
    if (anchor === 'center') {
      topY = Math.floor(H / 2 - drawH / 2 - bob);
    } else {
      const feetY = H / 2 + fullH / 2;                 // base of a depth-d wall
      topY = Math.floor(feetY - drawH - bob);
    }
    const cy = topY + drawH / 2;

    // distance fog / lighting, with per-sprite tint override
    let dark = 0;
    if (fog) {
      dark = _clamp((depth - fogStart) / fogRange, 0, fogMax);
    }
    if (typeof s.tint === 'number') {
      // tint 1 = full brightness, 0 = black; convert to a darken overlay
      dark = _clamp(Math.max(dark, 1 - s.tint), 0, 1);
    }

    const info = {
      depth: depth, screenX: screenX, drawW: drawW, drawH: drawH,
      topY: topY, time: time, dark: dark,
    };

    // resolve frame for animation, if the sprite uses a frame picker
    if (pickFrame && typeof s.frame === 'undefined') {
      try { s._frame = pickFrame(s, info); } catch (e) { s._frame = 0; }
    }

    ctx.globalAlpha = prevAlpha * alpha;

    const cb = (typeof s.draw === 'function') ? s.draw : sharedDraw;
    let any = false;

    if (cb) {
      // ---- pluggable vector-art path (clipped rect, center-column z-test) ----
      const centerCol = _clamp(Math.round(screenX), 0, zLen - 1);
      if (depth < zbuffer[centerCol]) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(startX, topY, drawW, drawH);
        ctx.clip();
        // scale param = sprite pixel height, the common "how big is it" handle
        try { cb(ctx, screenX, cy, drawH, s, info); } catch (e) { /* art owns errors */ }
        ctx.restore();
        if (dark > 0.01) {
          ctx.globalAlpha = prevAlpha * alpha * dark;
          ctx.fillStyle = 'rgb(' + fogColor + ')';
          ctx.fillRect(startX, topY, drawW, drawH);
          ctx.globalAlpha = prevAlpha * alpha;
        }
        if (s.hit > 0) {
          ctx.fillStyle = hurtPrefix + _clamp(s.hit * 1.4, 0, 1).toFixed(2) + ')';
          ctx.fillRect(startX, topY, drawW, drawH);
        }
        any = true;
      }
    } else if (s.img && drawW >= 1) {
      // ---- textured impostor path (strict per-column z-test) ----
      const img = s.img;
      const tw = img.width || 1;
      const th = img.height || 1;
      const a0 = Math.max(0, startX);
      const a1 = Math.min(W, endX);
      const span = drawW;
      for (let col = a0; col < a1; col++) {
        if (col >= zLen) break;
        if (depth >= zbuffer[col]) continue;           // OCCLUDED by wall
        const texX = Math.floor(((col - startX) / span) * tw);
        const sx = texX < 0 ? 0 : (texX >= tw ? tw - 1 : texX);
        ctx.drawImage(img, sx, 0, 1, th, col, topY, 1, drawH);
        if (dark > 0.01) {
          ctx.fillStyle = 'rgba(' + fogColor + ',' + dark.toFixed(3) + ')';
          ctx.fillRect(col, topY, 1, drawH);
        }
        if (s.hit > 0) {
          ctx.fillStyle = hurtPrefix + _clamp(s.hit * 4, 0, 1).toFixed(2) + ')';
          ctx.fillRect(col, topY, 1, drawH);
        }
        any = true;
      }
    }

    ctx.globalAlpha = prevAlpha;

    if (!any) continue;
    drawn++;

    // ---- floating health pip over wounded, nearby, not-fully-occluded ----
    if (healthPips && typeof s.hp === 'number' && typeof s.maxHp === 'number' &&
        s.hp < s.maxHp && s.hp >= 0 && s.maxHp > 0 && depth < pipMaxDepth) {
      const centerCol = _clamp(Math.round(screenX), 0, zLen - 1);
      if (depth < zbuffer[centerCol]) {
        const bw = drawW * 0.7;
        const bx = screenX - bw / 2;
        const by = topY - 6;
        const frac = _clamp(s.hp / s.maxHp, 0, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(bx, by, bw, 3);
        ctx.fillStyle = '#ff4438';
        ctx.fillRect(bx, by, bw * frac, 3);
      }
    }
  }

  ctx.globalAlpha = prevAlpha;
  ctx.filter = prevFilter;
  return drawn;
}

/**
 * Build a single draw callback that dispatches on `sprite.kind` to a table of
 * per-kind painters. Generalizes the e/b/p switch from station-defense into a
 * registered callback per sprite kind, so art is fully pluggable. Each painter
 * has the signature (ctx, cx, cy, scale, sprite, info). Unknown kinds are no-ops.
 *
 * @param {Object<string, function>} kinds  map of kind name -> painter fn
 * @returns {function} draw(ctx, cx, cy, scale, sprite, info)
 */
export function makeKindRenderer(kinds) {
  const table = kinds || {};
  return function (ctx, cx, cy, scale, sprite, info) {
    const fn = table[sprite && sprite.kind];
    if (typeof fn === 'function') fn(ctx, cx, cy, scale, sprite, info);
  };
}

/**
 * Make a tiny offscreen-canvas impostor cache. `get(key, w, h, paint)` returns
 * a cached HTMLCanvasElement, painting it once via `paint(ctx2d, w, h)` on first
 * request. Use it to bake procedural sprite textures (enemy frames, pickups)
 * that you then pass as `sprite.img`. `clear()` drops every cached canvas.
 *
 * @returns {{get:function, clear:function, size:function}}
 */
export function makeImpostorCache() {
  const map = new Map();
  return {
    get(key, w, h, paint) {
      let c = map.get(key);
      if (c) return c;
      // document is available in browsers; guard so the module still imports
      // (e.g. node --check / SSR) without a DOM.
      if (typeof document === 'undefined') return null;
      c = document.createElement('canvas');
      c.width = Math.max(1, w | 0);
      c.height = Math.max(1, h | 0);
      if (typeof paint === 'function') {
        const g = c.getContext('2d');
        try { paint(g, c.width, c.height); } catch (e) { /* paint owns errors */ }
      }
      map.set(key, c);
      return c;
    },
    clear() { map.clear(); },
    size() { return map.size; },
  };
}

/**
 * Clear the module-level shared impostor cache used by callers that do not make
 * their own. Optional cleanup; this module owns no DOM/listeners/GPU state, so
 * there is nothing else to dispose.
 */
export function clearImpostorCache() {
  _sharedCache.clear();
}

// END mChatAI Web Component: raycast.sprite-billboards
