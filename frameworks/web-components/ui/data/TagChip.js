// TagChip — small colored pill for tags, categories, status labels.
//
// Why this exists: tag chips on bookmark cards, category badges on
// expense rows, status pills on tasks, dietary badges on recipes —
// the same visual atom needed in dozens of places. Pulling this out
// once means consistent sizing/coloring everywhere and one place to
// tweak the visual style.
//
// Usage:
//   usage: bring in { TagChip } from the path ../../ui/data/TagChip.js
//   const chip = new TagChip({
//     label: "Groceries",
//     color: "#10b981",         // optional; otherwise uses --mchat-accent
//     onClick: () => filter.set("groceries"),
//     dismissible: true,
//     onDismiss: () => removeTag("groceries"),
//     target: chipRow
//   });
//   chip.setLabel("Groceries (3)");
//   chip.element                 // <span> for inline placement
//
// For variant-style soft pills (active/inactive/danger), use options.variant
// instead of a custom color.

const TAG_CHIP_STYLE_ID = "mchatai-tag-chip-styles";
const TAG_CHIP_BASE_CLASS = "mchatai-tag-chip";

const TAG_CHIP_STYLE_CSS = `
.${TAG_CHIP_BASE_CLASS} {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1.4;
  background: var(--mchatai-tag-chip-bg, var(--mchat-accentSoft, rgba(99,102,241,0.18)));
  color: var(--mchatai-tag-chip-fg, var(--mchat-text, #e5e7eb));
  letter-spacing: 0.01em;
  border: 0;
  user-select: none;
  vertical-align: baseline;
  white-space: nowrap;
}
.${TAG_CHIP_BASE_CLASS}--clickable { cursor: pointer; transition: opacity 100ms ease; }
.${TAG_CHIP_BASE_CLASS}--clickable:hover { opacity: 0.85; }
.${TAG_CHIP_BASE_CLASS}--success { background: rgba(16,185,129,0.18); }
.${TAG_CHIP_BASE_CLASS}--warning { background: rgba(251,191,36,0.18); }
.${TAG_CHIP_BASE_CLASS}--danger { background: rgba(220,38,38,0.18); }
.${TAG_CHIP_BASE_CLASS}--neutral { background: var(--mchat-surface2, rgba(255,255,255,0.08)); }
.${TAG_CHIP_BASE_CLASS}__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.55;
}
.${TAG_CHIP_BASE_CLASS}__dot[hidden] { display: none; }
.${TAG_CHIP_BASE_CLASS}__dismiss {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 0 0 0 4px;
  font: inherit;
  opacity: 0.6;
  line-height: 1;
}
.${TAG_CHIP_BASE_CLASS}__dismiss[hidden] { display: none; }
.${TAG_CHIP_BASE_CLASS}__dismiss:hover { opacity: 1; }
`.trim();

function tagChipEnsureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(TAG_CHIP_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = TAG_CHIP_STYLE_ID;
  style.textContent = TAG_CHIP_STYLE_CSS;
  document.head.appendChild(style);
}

function tagChipResolveTarget(target) {
  if (!target || typeof document === "undefined") return null;
  return typeof target === "string" ? document.querySelector(target) : target;
}

export class TagChip {
  constructor(options = {}) {
    tagChipEnsureStyles();
    this.options = options;
    this.label = options.label || "";
    this.color = options.color || "";
    this.variant = options.variant || ""; // success | warning | danger | neutral
    this.showDot = !!options.showDot || !!this.color;
    this.dismissible = !!options.dismissible;
    this.onClick = options.onClick || null;
    this.onDismiss = options.onDismiss || null;
    this.element = this._create();
    this.labelEl = this.element.querySelector(`.${TAG_CHIP_BASE_CLASS}__label`);
    this.dotEl = this.element.querySelector(`.${TAG_CHIP_BASE_CLASS}__dot`);
    this.dismissEl = this.element.querySelector(`.${TAG_CHIP_BASE_CLASS}__dismiss`);
    if (this.onClick) {
      this.element.addEventListener("click", (e) => {
        if (e.target.closest(`.${TAG_CHIP_BASE_CLASS}__dismiss`)) return;
        this.onClick(e, this);
      });
    }
    if (this.dismissEl) {
      this.dismissEl.addEventListener("click", (e) => {
        e.stopPropagation();
        if (typeof this.onDismiss === "function") this.onDismiss(this);
      });
    }
    const mount = tagChipResolveTarget(options.target);
    if (mount) mount.appendChild(this.element);
    this.render();
  }

  static mount(target, options = {}) { return new TagChip({ ...options, target }); }

  setLabel(v) { this.label = v || ""; if (this.labelEl) this.labelEl.textContent = this.label; return this; }
  setColor(c) { this.color = c || ""; this.render(); return this; }
  setVariant(v) { this.variant = v || ""; this.render(); return this; }

  attach(target) {
    const mount = tagChipResolveTarget(target);
    if (mount) mount.appendChild(this.element);
    return this;
  }
  detach() { this.element.remove(); return this; }

  render() {
    if (this.labelEl) this.labelEl.textContent = this.label;
    if (this.element && this.element.classList) {
      this.element.classList.toggle(`${TAG_CHIP_BASE_CLASS}--clickable`, !!this.onClick);
      for (const v of ["success", "warning", "danger", "neutral"]) {
        this.element.classList.toggle(`${TAG_CHIP_BASE_CLASS}--${v}`, this.variant === v);
      }
    }
    if (this.element && this.element.style) {
      if (this.color) {
        this.element.style.setProperty("--mchatai-tag-chip-bg", `${this.color}33`);
        this.element.style.color = this.color;
      } else {
        this.element.style.removeProperty("--mchatai-tag-chip-bg");
        this.element.style.color = "";
      }
    }
    if (this.dotEl) this.dotEl.hidden = !this.showDot;
    if (this.dismissEl) this.dismissEl.hidden = !this.dismissible;
    return this.element;
  }

  _create() {
    if (typeof document === "undefined") {
      const stubEl = { addEventListener: () => {}, textContent: "", hidden: false };
      return {
        querySelector: () => stubEl,
        addEventListener: () => {},
        appendChild: () => {},
        remove: () => {},
        classList: { toggle: () => {} },
        style: { setProperty: () => {}, removeProperty: () => {}, color: "" }
      };
    }
    const root = document.createElement("span");
    root.className = TAG_CHIP_BASE_CLASS;
    root.dataset.component = "tag-chip";
    root.innerHTML = `
      <span class="${TAG_CHIP_BASE_CLASS}__dot" hidden></span>
      <span class="${TAG_CHIP_BASE_CLASS}__label"></span>
      <button class="${TAG_CHIP_BASE_CLASS}__dismiss" type="button" hidden aria-label="Remove">×</button>
    `;
    return root;
  }
}
