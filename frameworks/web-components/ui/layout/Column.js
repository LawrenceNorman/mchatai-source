// Column — kanban-style swimlane with header + scrollable body + footer slots.
//
// Why this exists: kanban boards, group-by views, sectioned task lists,
// project columns — all need the same "header label + count + scrollable
// stack of cards + footer add-action" pattern. Generated apps reinvent
// this every time with inconsistent overflow handling and broken sticky
// headers.
//
// Usage:
//   usage: bring in { Column } from the path ../../ui/layout/Column.js
//   const todoCol = new Column({
//     title: "To do",
//     accent: "#6366f1",
//     onAdd: () => modal.open(),       // shows the + footer button
//     target: boardEl
//   });
//   todoCol.bodySlot.appendChild(card.element);
//   todoCol.setCount(7);
//   todoCol.setAccent("#10b981");
//
// Slots:
//   col.headerSlot    // right of title (e.g. dropdown menu)
//   col.bodySlot      // scrollable card list area
//   col.footerSlot    // bottom row (e.g. add-card button or stats)
//
// Pair with Card.js for the rows. Drag-drop is intentionally NOT built in —
// add a DragDrop wrapper later when 2+ apps need it.

const COLUMN_STYLE_ID = "mchatai-column-styles";
const COLUMN_BASE_CLASS = "mchatai-column";

const COLUMN_STYLE_CSS = `
.${COLUMN_BASE_CLASS} {
  display: flex;
  flex-direction: column;
  width: 280px;
  min-width: 240px;
  max-width: 320px;
  background: var(--mchat-surface, rgba(255,255,255,0.04));
  border: 1px solid var(--mchat-border, rgba(255,255,255,0.08));
  border-radius: var(--mchat-radius-md, 10px);
  height: 100%;
  max-height: 100%;
  flex-shrink: 0;
  color: var(--mchat-text, #e5e7eb);
}
.${COLUMN_BASE_CLASS}__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px var(--mchat-space-2, 8px);
  border-bottom: 1px solid var(--mchat-border, rgba(255,255,255,0.08));
  flex-shrink: 0;
}
.${COLUMN_BASE_CLASS}__accent {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--mchatai-column-accent, var(--mchat-accent, #6366f1));
  flex-shrink: 0;
}
.${COLUMN_BASE_CLASS}__title {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: inherit;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.${COLUMN_BASE_CLASS}__count {
  font-size: 0.78rem;
  opacity: 0.55;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  background: var(--mchat-surface2, rgba(255,255,255,0.08));
  padding: 1px 8px;
  border-radius: 999px;
}
.${COLUMN_BASE_CLASS}__count[hidden] { display: none; }
.${COLUMN_BASE_CLASS}__header-slot {
  display: flex;
  align-items: center;
  gap: 4px;
}
.${COLUMN_BASE_CLASS}__body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 60px;
}
.${COLUMN_BASE_CLASS}__footer {
  padding: 6px 8px 10px;
  border-top: 1px solid var(--mchat-border, rgba(255,255,255,0.05));
}
.${COLUMN_BASE_CLASS}__footer:empty { display: none; }
.${COLUMN_BASE_CLASS}__add {
  width: 100%;
  padding: 6px 8px;
  background: transparent;
  border: 1px dashed var(--mchat-border, rgba(255,255,255,0.15));
  border-radius: var(--mchat-radius-md, 10px);
  color: var(--mchat-text, #e5e7eb);
  font: inherit;
  font-size: 0.85rem;
  opacity: 0.65;
  cursor: pointer;
  transition: opacity 100ms ease, border-color 100ms ease;
}
.${COLUMN_BASE_CLASS}__add:hover {
  opacity: 1;
  border-color: var(--mchat-accent, #6366f1);
}
.${COLUMN_BASE_CLASS}__add[hidden] { display: none; }
@media (max-width: 720px) {
  .${COLUMN_BASE_CLASS} { width: 280px; min-width: 260px; }
}
`.trim();

function columnEnsureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(COLUMN_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = COLUMN_STYLE_ID;
  style.textContent = COLUMN_STYLE_CSS;
  document.head.appendChild(style);
}

function columnResolveTarget(target) {
  if (!target || typeof document === "undefined") return null;
  return typeof target === "string" ? document.querySelector(target) : target;
}

export class Column {
  constructor(options = {}) {
    columnEnsureStyles();
    this.options = options;
    this.title = options.title || "";
    this.accent = options.accent || "";
    this.count = options.count;
    this.onAdd = options.onAdd || null;
    this.addLabel = options.addLabel || "+ Add";
    this.element = this._create();
    this.titleEl = this.element.querySelector(`.${COLUMN_BASE_CLASS}__title`);
    this.countEl = this.element.querySelector(`.${COLUMN_BASE_CLASS}__count`);
    this.accentEl = this.element.querySelector(`.${COLUMN_BASE_CLASS}__accent`);
    this.bodySlot = this.element.querySelector(`.${COLUMN_BASE_CLASS}__body`);
    this.headerSlot = this.element.querySelector(`.${COLUMN_BASE_CLASS}__header-slot`);
    this.footerSlot = this.element.querySelector(`.${COLUMN_BASE_CLASS}__footer`);
    this.addBtn = this.element.querySelector(`.${COLUMN_BASE_CLASS}__add`);
    if (this.addBtn) {
      this.addBtn.addEventListener("click", () => {
        if (typeof this.onAdd === "function") this.onAdd(this);
      });
    }
    const mount = columnResolveTarget(options.target);
    if (mount) mount.appendChild(this.element);
    this.render();
  }

  static mount(target, options = {}) { return new Column({ ...options, target }); }

  setTitle(v) { this.title = v || ""; this.render(); return this; }
  setCount(n) { this.count = n; this.render(); return this; }
  setAccent(color) {
    this.accent = color || "";
    if (this.element && this.element.style) this.element.style.setProperty("--mchatai-column-accent", this.accent || "");
    return this;
  }
  setOnAdd(fn) {
    this.onAdd = fn || null;
    if (this.addBtn) this.addBtn.hidden = typeof this.onAdd !== "function";
    return this;
  }

  attach(target) {
    const mount = columnResolveTarget(target);
    if (mount) mount.appendChild(this.element);
    return this;
  }

  detach() { this.element.remove(); return this; }

  render() {
    if (this.titleEl) this.titleEl.textContent = this.title;
    if (this.countEl) {
      if (typeof this.count === "number") {
        this.countEl.textContent = String(this.count);
        this.countEl.hidden = false;
      } else {
        this.countEl.hidden = true;
      }
    }
    if (this.element && this.element.style && this.accent) {
      this.element.style.setProperty("--mchatai-column-accent", this.accent);
    }
    if (this.addBtn) {
      this.addBtn.textContent = this.addLabel;
      this.addBtn.hidden = typeof this.onAdd !== "function";
    }
    return this.element;
  }

  _create() {
    if (typeof document === "undefined") {
      const stubEl = { appendChild: () => {}, addEventListener: () => {}, textContent: "", hidden: false, style: { setProperty: () => {} } };
      return {
        querySelector: () => stubEl,
        appendChild: () => {},
        addEventListener: () => {},
        remove: () => {},
        style: { setProperty: () => {} }
      };
    }
    const root = document.createElement("section");
    root.className = COLUMN_BASE_CLASS;
    root.dataset.component = "column";
    root.innerHTML = `
      <header class="${COLUMN_BASE_CLASS}__header">
        <span class="${COLUMN_BASE_CLASS}__accent"></span>
        <h2 class="${COLUMN_BASE_CLASS}__title"></h2>
        <span class="${COLUMN_BASE_CLASS}__count" hidden></span>
        <div class="${COLUMN_BASE_CLASS}__header-slot"></div>
      </header>
      <div class="${COLUMN_BASE_CLASS}__body"></div>
      <footer class="${COLUMN_BASE_CLASS}__footer">
        <button class="${COLUMN_BASE_CLASS}__add" type="button" hidden></button>
      </footer>
    `;
    return root;
  }
}
