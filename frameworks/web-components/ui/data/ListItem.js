// ListItem — single row in a productivity app list.
//
// Why this exists: todo rows, note titles, bookmark entries, contact rows
// — they share the same shape: leading slot (checkbox/avatar/icon),
// primary + secondary text, trailing slot (badge/action button). One
// component reused dozens of times.
//
// Usage:
//   usage: bring in { ListItem } from the path ../../ui/data/ListItem.js
//   const row = new ListItem({
//     primary: "Buy groceries",
//     secondary: "Due tomorrow",
//     leading: checkbox.element,      // any DOM node
//     trailing: deleteBtn.element,
//     onClick: () => detailPane.show(task),
//     active: false,                  // visual selected state
//     density: "comfortable"          // compact | comfortable
//   });
//   row.setPrimary("Buy groceries (urgent)");
//   row.setActive(true);
//   list.appendChild(row.element);
//
// Mounts to any container. The element is a <li> for semantic lists but
// you can place it inside a <div>-based list just as well.

const LIST_ITEM_STYLE_ID = "mchatai-list-item-styles";
const LIST_ITEM_BASE_CLASS = "mchatai-list-item";

const LIST_ITEM_STYLE_CSS = `
.${LIST_ITEM_BASE_CLASS} {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: var(--mchat-space-2, 8px) var(--mchat-space-2, 8px);
  border-radius: var(--mchat-radius-md, 10px);
  cursor: default;
  list-style: none;
  color: var(--mchat-text, #e5e7eb);
  transition: background 100ms ease;
}
.${LIST_ITEM_BASE_CLASS}--clickable { cursor: pointer; }
.${LIST_ITEM_BASE_CLASS}--clickable:hover { background: var(--mchat-surface2, rgba(255,255,255,0.05)); }
.${LIST_ITEM_BASE_CLASS}--active { background: var(--mchat-accentSoft, rgba(99,102,241,0.18)); }
.${LIST_ITEM_BASE_CLASS}--active:hover { background: var(--mchat-accentSoft, rgba(99,102,241,0.22)); }
.${LIST_ITEM_BASE_CLASS}--compact { padding: 4px 6px; gap: 6px; }
.${LIST_ITEM_BASE_CLASS}--compact .${LIST_ITEM_BASE_CLASS}__primary { font-size: 0.85rem; }
.${LIST_ITEM_BASE_CLASS}--compact .${LIST_ITEM_BASE_CLASS}__secondary { font-size: 0.7rem; }
.${LIST_ITEM_BASE_CLASS}__leading {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}
.${LIST_ITEM_BASE_CLASS}__leading:empty { display: none; }
.${LIST_ITEM_BASE_CLASS}__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1 1 auto;
}
.${LIST_ITEM_BASE_CLASS}__primary {
  font-size: 0.95rem;
  font-weight: 500;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.${LIST_ITEM_BASE_CLASS}__secondary {
  font-size: 0.78rem;
  opacity: 0.65;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 2px;
}
.${LIST_ITEM_BASE_CLASS}__secondary:empty { display: none; }
.${LIST_ITEM_BASE_CLASS}__trailing {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  opacity: 0.85;
}
.${LIST_ITEM_BASE_CLASS}__trailing:empty { display: none; }
.${LIST_ITEM_BASE_CLASS}--multiline .${LIST_ITEM_BASE_CLASS}__primary,
.${LIST_ITEM_BASE_CLASS}--multiline .${LIST_ITEM_BASE_CLASS}__secondary {
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
}
`.trim();

function listItemEnsureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(LIST_ITEM_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = LIST_ITEM_STYLE_ID;
  style.textContent = LIST_ITEM_STYLE_CSS;
  document.head.appendChild(style);
}

function listItemResolveTarget(target) {
  if (!target || typeof document === "undefined") return null;
  return typeof target === "string" ? document.querySelector(target) : target;
}

export class ListItem {
  constructor(options = {}) {
    listItemEnsureStyles();
    this.options = options;
    this.primary = options.primary || "";
    this.secondary = options.secondary || "";
    this.density = options.density || "comfortable";
    this.multiline = !!options.multiline;
    this.active = !!options.active;
    this.onClick = options.onClick || null;
    this.element = this._create();
    this.leadingEl = this.element.querySelector(`.${LIST_ITEM_BASE_CLASS}__leading`);
    this.trailingEl = this.element.querySelector(`.${LIST_ITEM_BASE_CLASS}__trailing`);
    this.primaryEl = this.element.querySelector(`.${LIST_ITEM_BASE_CLASS}__primary`);
    this.secondaryEl = this.element.querySelector(`.${LIST_ITEM_BASE_CLASS}__secondary`);
    if (options.leading) this.setLeading(options.leading);
    if (options.trailing) this.setTrailing(options.trailing);
    if (this.onClick) {
      this.element.addEventListener("click", (e) => {
        // ignore clicks on interactive children (checkbox/buttons)
        if (e.target.closest("button, input, a")) return;
        this.onClick(e, this);
      });
    }
    const mount = listItemResolveTarget(options.target);
    if (mount) mount.appendChild(this.element);
    this.render();
  }

  static mount(target, options = {}) {
    return new ListItem({ ...options, target });
  }

  setPrimary(value) { this.primary = value || ""; if (this.primaryEl) this.primaryEl.textContent = this.primary; return this; }
  setSecondary(value) {
    this.secondary = value || "";
    if (this.secondaryEl) this.secondaryEl.textContent = this.secondary;
    return this;
  }
  setLeading(node) {
    if (!this.leadingEl) return this;
    this.leadingEl.innerHTML = "";
    if (node) {
      if (typeof node === "string") this.leadingEl.innerHTML = node;
      else this.leadingEl.appendChild(node);
    }
    return this;
  }
  setTrailing(node) {
    if (!this.trailingEl) return this;
    this.trailingEl.innerHTML = "";
    if (node) {
      if (typeof node === "string") this.trailingEl.innerHTML = node;
      else this.trailingEl.appendChild(node);
    }
    return this;
  }
  setActive(flag) {
    this.active = !!flag;
    if (this.element && this.element.classList) this.element.classList.toggle(`${LIST_ITEM_BASE_CLASS}--active`, this.active);
    return this;
  }

  attach(target) {
    const mount = listItemResolveTarget(target);
    if (mount) mount.appendChild(this.element);
    return this;
  }

  detach() {
    this.element.remove();
    return this;
  }

  render() {
    if (this.primaryEl) this.primaryEl.textContent = this.primary;
    if (this.secondaryEl) this.secondaryEl.textContent = this.secondary;
    if (this.element && this.element.classList) {
      this.element.classList.toggle(`${LIST_ITEM_BASE_CLASS}--clickable`, !!this.onClick);
      this.element.classList.toggle(`${LIST_ITEM_BASE_CLASS}--active`, this.active);
      this.element.classList.toggle(`${LIST_ITEM_BASE_CLASS}--compact`, this.density === "compact");
      this.element.classList.toggle(`${LIST_ITEM_BASE_CLASS}--multiline`, this.multiline);
    }
    return this.element;
  }

  _create() {
    if (typeof document === "undefined") {
      return {
        querySelector: () => ({ appendChild: () => {}, textContent: "", innerHTML: "" }),
        addEventListener: () => {},
        appendChild: () => {},
        remove: () => {},
        classList: { add: () => {}, remove: () => {}, toggle: () => {} }
      };
    }
    const root = document.createElement("li");
    root.className = LIST_ITEM_BASE_CLASS;
    root.dataset.component = "list-item";
    root.innerHTML = `
      <div class="${LIST_ITEM_BASE_CLASS}__leading"></div>
      <div class="${LIST_ITEM_BASE_CLASS}__text">
        <div class="${LIST_ITEM_BASE_CLASS}__primary"></div>
        <div class="${LIST_ITEM_BASE_CLASS}__secondary"></div>
      </div>
      <div class="${LIST_ITEM_BASE_CLASS}__trailing"></div>
    `;
    return root;
  }
}
