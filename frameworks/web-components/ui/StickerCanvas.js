// BEGIN mchatai-web-components: ui.sticker-canvas (ui/StickerCanvas.js)

/**
 * A dependency-free "sticker scene" editor + a zero-dependency scene-to-PNG
 * exporter. Hand it a root element and a palette of SVG markup; it builds a
 * draggable canvas where the user can place, drag, resize, rotate, flip, layer
 * (bring-to-front) and delete two kinds of items:
 *   - "sticker" items: any SVG glyph you supply in the palette (characters,
 *     props, shapes, emoji-as-svg, logos ...)
 *   - "text" items: a small editable text label/caption/speech bubble; the
 *     bubble decoration is entirely styled by your CSS, so it can be a plain
 *     caption, a comic balloon, a sign, a name tag, etc.
 *
 * Three layers, intentionally separable so you can use as little as you need:
 *
 *   1. SceneModel   - PURE state + math. No DOM, no draw. Holds a list of
 *                     scenes (a.k.a. panels/pages/frames), each with a
 *                     background key + an ordered item list. Knows how to add /
 *                     move / resize / rotate / flip / restack / delete, clamped
 *                     to the [0..100] percentage coordinate space. Unit-testable
 *                     in node with zero browser globals.
 *   2. StickerCanvas - a DOM editor that renders a SceneModel into a host
 *                     element and wires pointer + touch + keyboard input
 *                     (drag-from-palette, drag-to-move, corner-handle resize,
 *                     the per-item control buttons). Renderer lives here; swap
 *                     it out for canvas/webgl and keep SceneModel intact.
 *   3. exportSceneToPng - the standalone exporter: serialises the scenes to a
 *                     single namespaced SVG document (per-scene gradient/clip id
 *                     suffixing so multiple backgrounds never collide), rasters
 *                     it to a 2x PNG via an offscreen <canvas>, and resolves a
 *                     data: URL. `shareOrDownloadPng` then offers it through the
 *                     Web Share API -> clipboard -> download fallback chain.
 *
 * Everything is offline + dependency-free. No CDN, no <img> remote loads; the
 * only network-ish API touched is the optional navigator.share / clipboard at
 * the user's explicit request.
 *
 * Coordinate space: item x/y/size/width are PERCENTAGES of the owning scene box
 * (0..100), so a scene renders identically at any pixel size and exports cleanly.
 *
 * Usage (install-relative import path - copy EXACTLY; the bundled file lives
 * under ./web-components/ui/StickerCanvas.js, NOT flat under ./web-components/):
 *   import { StickerCanvas, SceneModel, exportSceneToPng, shareOrDownloadPng }
 *     from "./web-components/ui/StickerCanvas.js";
 *
 *   const STICKERS = { cat: '<svg viewBox="0 0 100 100">...</svg>', star: '<svg ...>' };
 *   const BACKDROPS = { blank: '<rect width="100" height="100" fill="#fff"/>', sky: '<rect .../>' };
 *
 *   const canvas = new StickerCanvas({
 *     root: document.getElementById("app"),
 *     stickers: STICKERS,            // key -> inner SVG markup
 *     backdrops: BACKDROPS,          // key -> inner SVG markup (id-namespaced on export)
 *     paletteGroups: [               // optional grouping of the sticker tray
 *       { title: "Animals", keys: ["cat"] },
 *       { title: "Shapes",  keys: ["star"] },
 *     ],
 *     scenes: 3,                     // number, or a SceneModel, or [{bg, items}]
 *     aspectRatio: "4 / 3",
 *   });
 *   canvas.mount();
 *
 *   // Export the current scenes to a 2x PNG and share/save it:
 *   const dataUrl = await canvas.exportToPng({ title: "My Scene" });
 *   await shareOrDownloadPng(dataUrl, { title: "My Scene", fileName: "scene.png" });
 *
 * Or use the model + exporter headlessly (no editor UI):
 *   const model = new SceneModel({ scenes: 2 });
 *   model.addSticker(0, "cat", { x: 30, y: 30 });
 *   model.addText(0, "Hello!", { x: 10, y: 8 });
 *   const url = await exportSceneToPng(model.toJSON(), { stickers: STICKERS, backdrops: BACKDROPS });
 *
 * CONTRACTS
 *   SceneModel:
 *     new SceneModel({ scenes?, sceneFactory? })   scenes: count | array | SceneModel
 *     .scenes                                       -> [{ bg, items: Item[] }]
 *     .addSticker(sceneIdx, key, opts?)             opts: { x, y, size, rot, flip }
 *     .addText(sceneIdx, text, opts?)              opts: { x, y, width }
 *     .move(id, x, y) / .resize(id, size)          clamped to scene bounds
 *     .rotate(id, byDeg=15) / .flip(id)
 *     .bringToFront(id) / .remove(id)
 *     .setBackground(sceneIdx, key) / .clear(sceneIdx?)
 *     .find(id) -> { item, scene, sceneIdx } | null
 *     .isEmpty() / .toJSON() / SceneModel.fromJSON(obj)
 *     Item = { id, type:"sticker"|"text", x, y, z, ... }   (percent coords)
 *
 *   StickerCanvas (DOM editor):
 *     new StickerCanvas({ root, stickers, backdrops, paletteGroups?, scenes?,
 *                         aspectRatio?, defaultBackdrop?, classPrefix?,
 *                         onChange?, injectStyles? })
 *     .mount() -> this          builds DOM + wires input; idempotent
 *     .destroy()                removes listeners + DOM
 *     .render()                 re-renders from the model after a mutation
 *     .model                    the underlying SceneModel
 *     .selectedSceneIdx / .selectedItemId
 *     .exportToPng(opts?) -> Promise<dataUrl>   thin wrapper over exportSceneToPng
 *     onChange(model) fires after any user mutation.
 *
 *   exportSceneToPng(sceneJson, opts) -> Promise<pngDataUrl>
 *     sceneJson: SceneModel.toJSON() shape ({ scenes: [{bg, items}] })
 *     opts: { stickers, backdrops, title?, layout?, scale?, background?,
 *             titleHeight?, gap?, pad?, font? }
 *       layout.sceneWidth / sceneHeight  px of one scene cell (default 480x360)
 *       scale  raster multiplier (default 2)
 *     Pure given the same input; browser-only (needs Image + canvas).
 *
 *   shareOrDownloadPng(dataUrl, { title?, fileName?, shareText? }) -> Promise<"shared"|"copied"|"downloaded"|"cancelled">
 *     Web Share (files) -> clipboard image -> <a download> fallback chain.
 *
 *   buildSceneSvg(sceneJson, opts) -> string
 *     The raw SVG string the exporter rasters; handy for an "export SVG" button.
 */

/* ----------------------------------------------------------------------------
 * Layer 1: SceneModel - pure state + geometry, no DOM.
 * ------------------------------------------------------------------------- */

export class SceneModel {
  constructor(opts = {}) {
    const src = opts.scenes;
    if (src instanceof SceneModel) {
      this.scenes = src.scenes.map(cloneScene);
    } else if (Array.isArray(src)) {
      this.scenes = src.map(cloneScene);
    } else {
      const count = Number.isFinite(src) ? Math.max(1, src) : 1;
      const factory = typeof opts.sceneFactory === "function" ? opts.sceneFactory : null;
      this.scenes = Array.from({ length: count }, (_, i) =>
        factory ? cloneScene(factory(i)) : { bg: opts.defaultBackdrop ?? null, items: [] });
    }
  }

  get sceneCount() { return this.scenes.length; }

  _scene(idx) {
    const s = this.scenes[clampInt(idx, 0, this.scenes.length - 1)];
    return s;
  }

  _maxZ(scene) {
    return scene.items.reduce((m, it) => Math.max(m, it.z || 1), 1);
  }

  addSticker(sceneIdx, key, opts = {}) {
    const scene = this._scene(sceneIdx);
    const item = {
      id: nextId(),
      type: "sticker",
      sticker: key,
      x: clampNum(opts.x ?? 32, ITEM_MIN_XY, ITEM_MAX_XY),
      y: clampNum(opts.y ?? 30, ITEM_MIN_XY, ITEM_MAX_XY),
      size: clampNum(opts.size ?? 32, STICKER_MIN, STICKER_MAX),
      rot: ((opts.rot ?? 0) % 360 + 360) % 360,
      flip: !!opts.flip,
      z: this._maxZ(scene) + 1,
    };
    scene.items.push(item);
    return item;
  }

  addText(sceneIdx, text, opts = {}) {
    const scene = this._scene(sceneIdx);
    const item = {
      id: nextId(),
      type: "text",
      text: String(text ?? ""),
      variant: opts.variant ?? "default",
      x: clampNum(opts.x ?? 10, ITEM_MIN_XY, ITEM_MAX_XY),
      y: clampNum(opts.y ?? 8, ITEM_MIN_XY, ITEM_MAX_XY),
      width: clampNum(opts.width ?? 42, TEXT_MIN, TEXT_MAX),
      z: this._maxZ(scene) + 1,
    };
    scene.items.push(item);
    return item;
  }

  find(id) {
    for (let i = 0; i < this.scenes.length; i++) {
      const scene = this.scenes[i];
      const item = scene.items.find((it) => it.id === id);
      if (item) return { item, scene, sceneIdx: i };
    }
    return null;
  }

  move(id, x, y) {
    const f = this.find(id);
    if (!f) return false;
    f.item.x = clampNum(x, ITEM_MIN_XY, ITEM_MAX_XY);
    f.item.y = clampNum(y, ITEM_MIN_XY, ITEM_MAX_XY);
    return true;
  }

  resize(id, value) {
    const f = this.find(id);
    if (!f) return false;
    if (f.item.type === "sticker") f.item.size = clampNum(value, STICKER_MIN, STICKER_MAX);
    else f.item.width = clampNum(value, TEXT_MIN, TEXT_MAX);
    return true;
  }

  /** Current resizable dimension of an item (size for stickers, width for text). */
  dimension(id) {
    const f = this.find(id);
    if (!f) return null;
    return f.item.type === "sticker" ? f.item.size : f.item.width;
  }

  rotate(id, byDeg = 15) {
    const f = this.find(id);
    if (!f || f.item.type !== "sticker") return false;
    f.item.rot = (((f.item.rot || 0) + byDeg) % 360 + 360) % 360;
    return true;
  }

  flip(id) {
    const f = this.find(id);
    if (!f || f.item.type !== "sticker") return false;
    f.item.flip = !f.item.flip;
    return true;
  }

  bringToFront(id) {
    const f = this.find(id);
    if (!f) return false;
    f.item.z = this._maxZ(f.scene) + 1;
    return true;
  }

  setText(id, text) {
    const f = this.find(id);
    if (!f || f.item.type !== "text") return false;
    f.item.text = String(text ?? "");
    return true;
  }

  remove(id) {
    for (const scene of this.scenes) {
      const i = scene.items.findIndex((it) => it.id === id);
      if (i >= 0) { scene.items.splice(i, 1); return true; }
    }
    return false;
  }

  setBackground(sceneIdx, key) {
    this._scene(sceneIdx).bg = key;
    return true;
  }

  clear(sceneIdx) {
    if (sceneIdx == null) { this.scenes.forEach((s) => { s.items = []; }); }
    else this._scene(sceneIdx).items = [];
  }

  isEmpty() { return this.scenes.every((s) => s.items.length === 0); }

  /** Items of one scene in paint order (ascending z), for rendering/export. */
  itemsInPaintOrder(sceneIdx) {
    return [...this._scene(sceneIdx).items].sort((a, b) => (a.z || 1) - (b.z || 1));
  }

  toJSON() { return { scenes: this.scenes.map(cloneScene) }; }

  static fromJSON(obj) {
    return new SceneModel({ scenes: Array.isArray(obj?.scenes) ? obj.scenes : [] });
  }
}

/* ----------------------------------------------------------------------------
 * Layer 2: StickerCanvas - DOM editor.
 * ------------------------------------------------------------------------- */

export class StickerCanvas {
  constructor(opts = {}) {
    this.root = opts.root || (typeof document !== "undefined" ? document.body : null);
    this.stickers = opts.stickers || {};
    this.backdrops = opts.backdrops || {};
    this.paletteGroups = opts.paletteGroups || null;
    this.aspectRatio = opts.aspectRatio || "4 / 3";
    this.defaultBackdrop = opts.defaultBackdrop ?? firstKey(this.backdrops);
    this.classPrefix = opts.classPrefix || "sc";
    this.onChange = typeof opts.onChange === "function" ? opts.onChange : () => {};
    this.injectStyles = opts.injectStyles !== false;
    this.model = opts.scenes instanceof SceneModel
      ? opts.scenes
      : new SceneModel({ scenes: opts.scenes ?? 1, defaultBackdrop: this.defaultBackdrop });

    this.selectedSceneIdx = 0;
    this.selectedItemId = null;
    this._drag = null;
    this._els = {};
    this._bound = {};
    this._mounted = false;
  }

  cls(suffix) { return `${this.classPrefix}-${suffix}`; }

  mount() {
    if (this._mounted || !this.root) return this;
    if (this.injectStyles) injectDefaultStyles(this.classPrefix);
    this._buildShell();
    this._wire();
    this.render();
    this._mounted = true;
    return this;
  }

  destroy() {
    if (this._bound.palDown) this._els.palette?.removeEventListener("mousedown", this._bound.palDown);
    if (this._bound.palTouch) this._els.palette?.removeEventListener("touchstart", this._bound.palTouch);
    if (this._bound.sceneDown) this._els.scenesRow?.removeEventListener("mousedown", this._bound.sceneDown);
    if (this._bound.sceneTouch) this._els.scenesRow?.removeEventListener("touchstart", this._bound.sceneTouch);
    this._teardownDragListeners();
    if (this.root) this.root.innerHTML = "";
    this._mounted = false;
  }

  _buildShell() {
    this.root.innerHTML = "";
    const wrap = elt("div", this.cls("wrap"));

    const palette = elt("aside", this.cls("palette"));
    const groups = this.paletteGroups || [{ title: null, keys: Object.keys(this.stickers) }];
    for (const g of groups) {
      const grp = elt("div", this.cls("pal-group"));
      if (g.title) grp.appendChild(elt("div", this.cls("pal-title"), g.title));
      const grid = elt("div", this.cls("pal-grid"));
      for (const key of g.keys) {
        if (!this.stickers[key]) continue;
        const b = elt("button", this.cls("sticker-btn"));
        b.dataset.sticker = key;
        b.setAttribute("aria-label", key);
        b.innerHTML = this.stickers[key];
        grid.appendChild(b);
      }
      grp.appendChild(grid);
      palette.appendChild(grp);
    }
    if (Object.keys(this.backdrops).length) {
      const grp = elt("div", this.cls("pal-group"));
      grp.appendChild(elt("div", this.cls("pal-title"), "Backgrounds"));
      const grid = elt("div", this.cls("bg-grid"));
      for (const key of Object.keys(this.backdrops)) {
        const b = elt("button", this.cls("bg-btn"));
        b.dataset.bg = key;
        b.setAttribute("aria-label", `${key} background`);
        b.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">${this.backdrops[key]}</svg>`;
        grid.appendChild(b);
      }
      grp.appendChild(grid);
      palette.appendChild(grp);
    }

    const stage = elt("section", this.cls("stage"));
    const scenesRow = elt("div", this.cls("scenes-row"));
    stage.appendChild(scenesRow);

    wrap.append(palette, stage);
    this.root.appendChild(wrap);
    this._els = { wrap, palette, scenesRow };
  }

  render() {
    const row = this._els.scenesRow;
    if (!row) return;
    row.innerHTML = this.model.scenes.map((s, i) => `
      <div class="${this.cls("scene")} ${i === this.selectedSceneIdx ? this.cls("selected") : ""}" data-scene-idx="${i}" style="aspect-ratio:${this.aspectRatio}">
        <div class="${this.cls("scene-bg")}">${s.bg && this.backdrops[s.bg]
          ? `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">${this.backdrops[s.bg]}</svg>` : ""}</div>
        <div class="${this.cls("scene-label")}">${i + 1}</div>
        <div class="${this.cls("items")}" data-items="${i}"></div>
      </div>`).join("");
    this.model.scenes.forEach((s, i) => {
      const c = row.querySelector(`[data-items="${i}"]`);
      this.model.itemsInPaintOrder(i).forEach((it) => this._renderItem(it, c));
    });
  }

  _renderItem(item, container) {
    let el;
    if (item.type === "sticker") {
      el = elt("div", this.cls("item"));
      el.style.left = item.x + "%";
      el.style.top = item.y + "%";
      el.style.width = item.size + "%";
      el.style.aspectRatio = "1";
      el.style.transform = `rotate(${item.rot || 0}deg) scaleX(${item.flip ? -1 : 1})`;
      el.style.zIndex = item.z || 1;
      el.innerHTML = this.stickers[item.sticker] || "";
    } else {
      el = elt("div", `${this.cls("text")} ${this.cls("text")}--${item.variant || "default"}`);
      el.style.left = item.x + "%";
      el.style.top = item.y + "%";
      el.style.width = item.width + "%";
      el.style.zIndex = item.z || 1;
      el.innerHTML = `<div class="${this.cls("text-shape")}">${escapeHtml(item.text)}</div>`;
    }
    el.dataset.itemId = item.id;
    if (this.selectedItemId === item.id) el.classList.add(this.cls("selected"));
    container.appendChild(el);

    if (this.selectedItemId === item.id) {
      const controls = elt("div", this.cls("controls"));
      controls.innerHTML = item.type === "sticker"
        ? `<div class="${this.cls("ctrl")} ${this.cls("flip")}" data-action="flip" title="Flip">&#8596;</div>
           <div class="${this.cls("ctrl")} ${this.cls("rot")}" data-action="rotate" title="Rotate">&#8635;</div>
           <div class="${this.cls("ctrl")} ${this.cls("layer")}" data-action="front" title="Bring to front">&#11014;</div>
           <div class="${this.cls("ctrl")} ${this.cls("del")}" data-action="delete" title="Delete">&times;</div>`
        : `<div class="${this.cls("ctrl")} ${this.cls("edit")}" data-action="edit" title="Edit text">&#9998;</div>
           <div class="${this.cls("ctrl")} ${this.cls("layer")}" data-action="front" title="Bring to front">&#11014;</div>
           <div class="${this.cls("ctrl")} ${this.cls("del")}" data-action="delete" title="Delete">&times;</div>`;
      el.appendChild(controls);
      const handle = elt("div", this.cls("resize-handle"));
      handle.dataset.action = "resize";
      el.appendChild(handle);
    }
  }

  _wire() {
    this._bound.palDown = (e) => this._onPaletteDown(e);
    this._bound.palTouch = (e) => this._onPaletteDown(e);
    this._bound.sceneDown = (e) => this._onSceneDown(e);
    this._bound.sceneTouch = (e) => this._onSceneDown(e);
    this._els.palette.addEventListener("mousedown", this._bound.palDown);
    this._els.palette.addEventListener("touchstart", this._bound.palTouch, { passive: false });
    this._els.scenesRow.addEventListener("mousedown", this._bound.sceneDown);
    this._els.scenesRow.addEventListener("touchstart", this._bound.sceneTouch, { passive: false });
  }

  _emit() { this.onChange(this.model); }

  _onPaletteDown(e) {
    const bgBtn = e.target.closest(`.${this.cls("bg-btn")}`);
    if (bgBtn) {
      e.preventDefault();
      this.model.setBackground(this.selectedSceneIdx, bgBtn.dataset.bg);
      this.render();
      this._emit();
      return;
    }
    const btn = e.target.closest(`.${this.cls("sticker-btn")}`);
    if (!btn) return;
    e.preventDefault();
    const key = btn.dataset.sticker;
    const p = pointOf(e);
    const ghost = this._makeGhost(key, p.x, p.y);
    if (typeof document !== "undefined") document.body.appendChild(ghost);
    this._drag = { type: "palette", key, ghost, startX: p.x, startY: p.y, moved: false };
    this._attachDragListeners();
  }

  _makeGhost(key, x, y) {
    const g = elt("div");
    g.style.cssText = `position:fixed;left:${x - 32}px;top:${y - 32}px;width:64px;height:64px;pointer-events:none;z-index:9999;opacity:.85;transform:rotate(-5deg);filter:drop-shadow(2px 4px 4px rgba(0,0,0,.3));`;
    g.innerHTML = this.stickers[key] || "";
    const svg = g.querySelector("svg");
    if (svg) { svg.style.width = "100%"; svg.style.height = "100%"; svg.style.display = "block"; }
    return g;
  }

  _onSceneDown(e) {
    const action = e.target.closest("[data-action]");
    if (action) {
      e.preventDefault();
      e.stopPropagation();
      this._handleAction(action.dataset.action, e);
      return;
    }
    const itemEl = e.target.closest(`.${this.cls("item")}, .${this.cls("text")}`);
    const sceneEl = e.target.closest(`.${this.cls("scene")}`);
    if (!sceneEl) return;
    const idx = +sceneEl.dataset.sceneIdx;
    if (itemEl) {
      e.preventDefault();
      this.selectedSceneIdx = idx;
      this.selectedItemId = itemEl.dataset.itemId;
      this.render();
      this._startMove(e, this.selectedItemId);
    } else if (this.selectedSceneIdx !== idx || this.selectedItemId) {
      this.selectedSceneIdx = idx;
      this.selectedItemId = null;
      this.render();
    }
  }

  _handleAction(a, e) {
    const id = this.selectedItemId;
    if (a === "delete") { this.model.remove(id); this.selectedItemId = null; this.render(); this._emit(); return; }
    if (a === "flip") { this.model.flip(id); this.render(); this._emit(); return; }
    if (a === "rotate") { this.model.rotate(id, 15); this.render(); this._emit(); return; }
    if (a === "front") { this.model.bringToFront(id); this.render(); this._emit(); return; }
    if (a === "edit") { this._editText(id); return; }
    if (a === "resize") { this._startResize(e); return; }
  }

  _startMove(e, id) {
    const f = this.model.find(id);
    if (!f) return;
    const sceneEl = this._els.scenesRow.querySelector(`[data-scene-idx="${f.sceneIdx}"]`);
    const p = pointOf(e);
    this._drag = {
      type: "move", id,
      startX: p.x, startY: p.y, origX: f.item.x, origY: f.item.y,
      rect: sceneEl.getBoundingClientRect(), moved: false,
    };
    this._attachDragListeners();
  }

  _startResize(e) {
    const f = this.model.find(this.selectedItemId);
    if (!f) return;
    const sceneEl = this._els.scenesRow.querySelector(`[data-scene-idx="${f.sceneIdx}"]`);
    const p = pointOf(e);
    this._drag = {
      type: "resize", id: this.selectedItemId,
      startX: p.x, startY: p.y, origDim: this.model.dimension(this.selectedItemId),
      rect: sceneEl.getBoundingClientRect(), moved: false,
    };
    this._attachDragListeners();
  }

  _attachDragListeners() {
    this._bound.move = (e) => this._onDragMove(e);
    this._bound.up = (e) => this._onDragEnd(e);
    document.addEventListener("mousemove", this._bound.move);
    document.addEventListener("mouseup", this._bound.up);
    document.addEventListener("touchmove", this._bound.move, { passive: false });
    document.addEventListener("touchend", this._bound.up);
    document.addEventListener("touchcancel", this._bound.up);
  }

  _teardownDragListeners() {
    if (!this._bound.move) return;
    document.removeEventListener("mousemove", this._bound.move);
    document.removeEventListener("mouseup", this._bound.up);
    document.removeEventListener("touchmove", this._bound.move);
    document.removeEventListener("touchend", this._bound.up);
    document.removeEventListener("touchcancel", this._bound.up);
    this._bound.move = this._bound.up = null;
  }

  _onDragMove(e) {
    const d = this._drag;
    if (!d) return;
    e.preventDefault();
    const p = pointOf(e);
    if (!d.moved && (Math.abs(p.x - d.startX) > 4 || Math.abs(p.y - d.startY) > 4)) d.moved = true;
    if (d.ghost) { d.ghost.style.left = (p.x - 32) + "px"; d.ghost.style.top = (p.y - 32) + "px"; }
    if (d.type === "move") {
      const dx = (p.x - d.startX) / d.rect.width * 100;
      const dy = (p.y - d.startY) / d.rect.height * 100;
      this.model.move(d.id, d.origX + dx, d.origY + dy);
      const el = this._els.scenesRow.querySelector(`[data-item-id="${d.id}"]`);
      const f = this.model.find(d.id);
      if (el && f) { el.style.left = f.item.x + "%"; el.style.top = f.item.y + "%"; }
    } else if (d.type === "resize") {
      const dx = (p.x - d.startX) / d.rect.width * 100;
      this.model.resize(d.id, d.origDim + dx);
      const el = this._els.scenesRow.querySelector(`[data-item-id="${d.id}"]`);
      if (el) el.style.width = this.model.dimension(d.id) + "%";
    }
  }

  _onDragEnd(e) {
    const d = this._drag;
    if (!d) { this._teardownDragListeners(); return; }
    if (d.type === "palette") {
      const p = pointOf(e);
      const target = document.elementFromPoint(p.x, p.y);
      const sceneEl = target?.closest(`.${this.cls("scene")}`);
      if (sceneEl) {
        const idx = +sceneEl.dataset.sceneIdx;
        const rect = sceneEl.getBoundingClientRect();
        const x = ((p.x - rect.left) / rect.width) * 100 - 16;
        const y = ((p.y - rect.top) / rect.height) * 100 - 16;
        this.selectedSceneIdx = idx;
        const item = this.model.addSticker(idx, d.key, { x, y });
        this.selectedItemId = item.id;
      } else if (!d.moved) {
        const item = this.model.addSticker(this.selectedSceneIdx, d.key);
        this.selectedItemId = item.id;
      }
      if (d.ghost) d.ghost.remove();
    }
    this._drag = null;
    this._teardownDragListeners();
    this.render();
    this._emit();
  }

  /** Replace the default prompt() edit with your own UI by overriding this. */
  _editText(id) {
    const f = this.model.find(id);
    if (!f) return;
    const next = (typeof prompt === "function") ? prompt("Edit text:", f.item.text) : null;
    if (next != null) { this.model.setText(id, next.trim() || f.item.text); this.render(); this._emit(); }
  }

  /** Convenience: add a text item to the selected scene and select it. */
  addText(text, opts) {
    const item = this.model.addText(this.selectedSceneIdx, text, opts);
    this.selectedItemId = item.id;
    this.render();
    this._emit();
    return item;
  }

  exportToPng(opts = {}) {
    return exportSceneToPng(this.model.toJSON(), {
      stickers: this.stickers,
      backdrops: this.backdrops,
      ...opts,
    });
  }
}

/* ----------------------------------------------------------------------------
 * Layer 3: scene-to-PNG export (pure SVG build + raster + share).
 * ------------------------------------------------------------------------- */

/**
 * Serialise a scene model JSON into a single SVG document. Each scene's
 * background markup has its `id="..."` / `url(#...)` references suffixed per
 * scene so multiple gradients/clips never collide. Pure - no DOM, no I/O.
 */
export function buildSceneSvg(sceneJson, opts = {}) {
  const scenes = sceneJson?.scenes || [];
  const stickers = opts.stickers || {};
  const backdrops = opts.backdrops || {};
  const PW = opts.layout?.sceneWidth ?? 480;
  const PH = opts.layout?.sceneHeight ?? 360;
  const GAP = opts.gap ?? 16;
  const PAD = opts.pad ?? 24;
  const TH = opts.title ? (opts.titleHeight ?? 64) : 0;
  const bg = opts.background ?? "#ffffff";
  const font = opts.font ?? "system-ui, sans-serif";
  const n = Math.max(1, scenes.length);
  const W = PW * n + GAP * (n - 1) + PAD * 2;
  const H = PH + TH + PAD * 2 + (TH ? 8 : 0);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  svg += `<rect width="${W}" height="${H}" fill="${bg}"/>`;

  if (opts.title) {
    svg += `<rect x="${PAD}" y="${PAD}" width="${W - PAD * 2}" height="${TH - 8}" rx="14" fill="#ffffff" stroke="#1f2937" stroke-width="4"/>`;
    svg += `<text x="${W / 2}" y="${PAD + (TH - 8) / 2 + 2}" font-family="${font}" font-size="30" font-weight="bold" fill="#1f2937" text-anchor="middle" dominant-baseline="middle">${escapeXml(opts.title)}</text>`;
  }

  for (let i = 0; i < n; i++) {
    const px = PAD + i * (PW + GAP);
    const py = PAD + TH + (TH ? 8 : 0);
    const scene = scenes[i] || { bg: null, items: [] };
    svg += `<defs><clipPath id="sc_clip_${i}"><rect x="${px}" y="${py}" width="${PW}" height="${PH}"/></clipPath></defs>`;
    svg += `<g clip-path="url(#sc_clip_${i})">`;
    if (scene.bg && backdrops[scene.bg]) {
      svg += `<svg x="${px}" y="${py}" width="${PW}" height="${PH}" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">${namespaceIds(backdrops[scene.bg], i)}</svg>`;
    }
    const sorted = [...(scene.items || [])].sort((a, b) => (a.z || 1) - (b.z || 1));
    for (const item of sorted) {
      if (item.type === "sticker") {
        const sw = (item.size / 100) * PW;
        const sx = px + (item.x / 100) * PW;
        const sy = py + (item.y / 100) * PH;
        const cx = sx + sw / 2, cy = sy + sw / 2;
        const ts = [];
        if (item.rot) ts.push(`rotate(${item.rot} ${cx} ${cy})`);
        if (item.flip) ts.push(`translate(${cx * 2} 0) scale(-1 1)`);
        const tStr = ts.length ? ` transform="${ts.join(" ")}"` : "";
        svg += `<g${tStr}><svg x="${sx}" y="${sy}" width="${sw}" height="${sw}" viewBox="0 0 100 100">${stickers[item.sticker] || ""}</svg></g>`;
      } else if (item.type === "text") {
        const bx = px + (item.x / 100) * PW;
        const by = py + (item.y / 100) * PH;
        const bw = (item.width / 100) * PW;
        const fontSize = 16;
        const maxChars = Math.max(8, Math.floor((bw - 20) / (fontSize * 0.55)));
        const lines = wrapText(item.text, maxChars);
        const lineH = 20;
        const bh = lines.length * lineH + 18;
        svg += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="16" fill="#ffffff" stroke="#1f2937" stroke-width="3.5"/>`;
        lines.forEach((line, idx) => {
          const ty = by + 15 + idx * lineH;
          svg += `<text x="${bx + bw / 2}" y="${ty}" font-family="${font}" font-size="${fontSize}" font-weight="bold" fill="#1f2937" text-anchor="middle" dominant-baseline="hanging">${escapeXml(line)}</text>`;
        });
      }
    }
    svg += `</g>`;
    svg += `<rect x="${px}" y="${py}" width="${PW}" height="${PH}" fill="none" stroke="#1f2937" stroke-width="5"/>`;
  }
  svg += `</svg>`;
  return svg;
}

/**
 * Build the SVG, raster it to a `scale`x PNG via an offscreen canvas, and
 * resolve a `data:image/png` URL. Browser-only (needs Image + canvas).
 */
export async function exportSceneToPng(sceneJson, opts = {}) {
  const svg = buildSceneSvg(sceneJson, opts);
  const scale = opts.scale ?? 2;
  const bg = opts.background ?? "#ffffff";
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error("Could not render SVG"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = (img.width || 1) * scale;
    canvas.height = (img.height || 1) * scale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Offer a PNG data URL to the user through the Web Share API (files), falling
 * back to clipboard image, then to a forced <a download>. Resolves with which
 * path succeeded. Never throws on a user cancel.
 */
export async function shareOrDownloadPng(dataUrl, opts = {}) {
  const fileName = (opts.fileName || sanitizeFileName(opts.title) || "scene") + (/\.png$/i.test(opts.fileName || "") ? "" : ".png");
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], fileName, { type: "image/png" });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: opts.title, text: opts.shareText });
      return "shared";
    }
    if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return "copied";
    }
  } catch (err) {
    if (err && err.name === "AbortError") return "cancelled";
    // fall through to download
  }
  downloadDataUrl(dataUrl, fileName);
  return "downloaded";
}

export function downloadDataUrl(dataUrl, fileName) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = fileName || "scene.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ----------------------------------------------------------------------------
 * Internals.
 * ------------------------------------------------------------------------- */

const ITEM_MIN_XY = -3, ITEM_MAX_XY = 95;
const STICKER_MIN = 10, STICKER_MAX = 80;
const TEXT_MIN = 15, TEXT_MAX = 90;

let _idSeq = 0;
function nextId() {
  _idSeq += 1;
  return `it_${_idSeq}_${Math.random().toString(36).slice(2, 8)}`;
}

function cloneScene(s) {
  return { bg: s?.bg ?? null, items: Array.isArray(s?.items) ? s.items.map((it) => ({ ...it })) : [] };
}

function firstKey(obj) { const k = Object.keys(obj || {}); return k.length ? k[0] : null; }
function clampNum(v, lo, hi) { v = Number(v); if (!Number.isFinite(v)) v = lo; return Math.max(lo, Math.min(hi, v)); }
function clampInt(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(Number(v) || 0))); }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
}

/** Suffix every id="..." and url(#...) reference so per-scene defs never clash. */
function namespaceIds(svgMarkup, sceneIdx) {
  return String(svgMarkup)
    .replace(/(id=")([a-zA-Z0-9_]+)/g, `$1$2_s${sceneIdx}`)
    .replace(/(url\(#)([a-zA-Z0-9_]+)/g, `$1$2_s${sceneIdx}`);
}

function wrapText(text, maxChars) {
  const paragraphs = String(text ?? "").split(/\n+/);
  const out = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/);
    let cur = "";
    for (const w of words) {
      const candidate = (cur + " " + w).trim();
      if (candidate.length > maxChars && cur) { out.push(cur); cur = w; }
      else cur = candidate;
    }
    if (cur) out.push(cur);
  }
  return out.length ? out : [String(text ?? "")];
}

function sanitizeFileName(s) {
  if (!s) return "";
  return String(s).replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
}

function pointOf(e) {
  const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
  return { x: t.clientX, y: t.clientY };
}

function elt(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

let _stylesInjected = new Set();
function injectDefaultStyles(prefix) {
  if (typeof document === "undefined" || _stylesInjected.has(prefix)) return;
  _stylesInjected.add(prefix);
  const id = `mchatai-${prefix}-sticker-canvas-styles`;
  if (document.getElementById(id)) return;
  const p = prefix;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
.${p}-wrap{display:flex;gap:12px;height:100%;min-height:0;font-family:system-ui,sans-serif}
.${p}-palette{width:180px;flex-shrink:0;overflow-y:auto;padding:8px;background:#f8fafc;border-radius:12px}
.${p}-pal-group{margin-bottom:12px}
.${p}-pal-title{font-weight:bold;font-size:12px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;color:#475569}
.${p}-pal-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.${p}-sticker-btn{background:#fff;border:2px solid #1f2937;border-radius:10px;aspect-ratio:1;cursor:grab;display:flex;align-items:center;justify-content:center;padding:4px}
.${p}-sticker-btn:active{cursor:grabbing}
.${p}-sticker-btn svg{width:100%;height:100%;pointer-events:none;display:block}
.${p}-bg-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}
.${p}-bg-btn{background:#fff;border:2px solid #1f2937;border-radius:8px;cursor:pointer;height:42px;overflow:hidden;padding:0}
.${p}-bg-btn svg{width:100%;height:100%;display:block}
.${p}-stage{flex:1;min-width:0;overflow:auto;padding:8px}
.${p}-scenes-row{display:flex;gap:12px;flex-wrap:wrap}
.${p}-scene{position:relative;flex:1 1 0;min-width:160px;background:#fff;border:4px solid #1f2937;border-radius:6px;overflow:hidden;user-select:none}
.${p}-scene.${p}-selected{box-shadow:0 0 0 4px #ec4899}
.${p}-scene-bg{position:absolute;inset:0;pointer-events:none}
.${p}-scene-bg svg{width:100%;height:100%;display:block}
.${p}-scene-label{position:absolute;top:6px;left:6px;background:#ec4899;color:#fff;padding:2px 8px;border-radius:8px;font-weight:bold;font-size:12px;pointer-events:none;z-index:5}
.${p}-items{position:absolute;inset:0}
.${p}-item{position:absolute;cursor:move;transform-origin:center;will-change:transform}
.${p}-item.${p}-selected,.${p}-text.${p}-selected .${p}-text-shape{outline:3px dashed #ec4899;outline-offset:3px}
.${p}-item svg{width:100%;height:100%;pointer-events:none;display:block}
.${p}-text{position:absolute;cursor:move;user-select:none;min-width:60px}
.${p}-text-shape{background:#fff;border:3px solid #1f2937;border-radius:14px;padding:6px 10px;font:bold 13px system-ui,sans-serif;color:#1f2937;text-align:center;word-wrap:break-word;line-height:1.25}
.${p}-controls{position:absolute;top:-32px;right:-4px;display:flex;gap:4px;z-index:100}
.${p}-ctrl{background:#fff;border:2px solid #1f2937;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:13px;font-weight:bold;user-select:none;color:#1f2937}
.${p}-del{background:#ef4444;color:#fff}
.${p}-flip{background:#3b82f6;color:#fff}
.${p}-rot{background:#10b981;color:#fff}
.${p}-edit{background:#f59e0b;color:#fff}
.${p}-layer{background:#a78bfa;color:#fff}
.${p}-resize-handle{position:absolute;bottom:-10px;right:-10px;width:20px;height:20px;background:#ec4899;border:2px solid #1f2937;border-radius:50%;cursor:nwse-resize;z-index:50}
@media (max-width:760px){.${p}-palette{width:120px}.${p}-pal-grid{grid-template-columns:repeat(2,1fr)}.${p}-scenes-row{flex-direction:column}}
`;
  document.head.appendChild(style);
}

// END mchatai-web-components: ui.sticker-canvas
