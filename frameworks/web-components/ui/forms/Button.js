// Button — productivity-app primary affordance.
//
// Why this exists: every Lovable-style productivity app needs a clickable
// button with consistent sizing, variants, hover/focus/active states, and
// disabled handling. Without a shared component, every generated app
// reinvents this with subtly different APIs and visual treatments.
//
// Usage:
//   usage: bring in { Button } from the path ../../ui/forms/Button.js
//   const add = new Button({
//     label: "Add task",
//     variant: "primary",            // primary | secondary | ghost | danger
//     size: "md",                    // sm | md | lg
//     icon: "+",                     // optional leading glyph (text or emoji)
//     onClick: () => store.addTask(),
//     target: "[data-add-slot]"      // optional CSS selector or element
//   });
//   add.setDisabled(true);
//   add.setLabel("Adding…");
//   add.element                       // raw <button> DOM node for further composition
//
// Theming: respects --mchat-accent, --mchat-space-*, --mchat-radius-* tokens.
// Inline fallbacks keep it visible before the swatch CSS is applied (FOUC-safe).

const BUTTON_STYLE_ID = "mchatai-button-styles";
const BUTTON_BASE_CLASS = "mchatai-button";

const BUTTON_STYLE_CSS = `
.${BUTTON_BASE_CLASS} {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: var(--mchat-space-2, 8px) var(--mchat-space-4, 16px);
  border-radius: var(--mchat-radius-md, 10px);
  border: 0;
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.1;
  cursor: pointer;
  user-select: none;
  text-decoration: none;
  transition: transform 100ms ease, box-shadow 100ms ease, background 100ms ease, opacity 100ms ease;
  min-height: 36px;
}
.${BUTTON_BASE_CLASS}:focus-visible {
  outline: 2px solid var(--mchat-accent, #6366f1);
  outline-offset: 2px;
}
.${BUTTON_BASE_CLASS}[disabled],
.${BUTTON_BASE_CLASS}--disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}
.${BUTTON_BASE_CLASS}--sm { font-size: 0.85rem; min-height: 28px; padding: 4px 10px; }
.${BUTTON_BASE_CLASS}--lg { font-size: 1.05rem; min-height: 44px; padding: 12px 20px; }
.${BUTTON_BASE_CLASS}--primary {
  background: var(--mchat-accent, #6366f1);
  color: var(--mchat-onAccent, #fff);
  box-shadow: 0 1px 2px rgba(0,0,0,0.12), 0 1px 0 rgba(255,255,255,0.06) inset;
}
.${BUTTON_BASE_CLASS}--primary:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99,102,241,0.28); }
.${BUTTON_BASE_CLASS}--primary:active { transform: translateY(0); }
.${BUTTON_BASE_CLASS}--secondary {
  background: var(--mchat-surface2, rgba(255,255,255,0.08));
  color: var(--mchat-text, #e5e7eb);
  border: 1px solid var(--mchat-border, rgba(255,255,255,0.12));
}
.${BUTTON_BASE_CLASS}--secondary:hover { background: var(--mchat-surface3, rgba(255,255,255,0.14)); }
.${BUTTON_BASE_CLASS}--ghost {
  background: transparent;
  color: var(--mchat-text, #e5e7eb);
}
.${BUTTON_BASE_CLASS}--ghost:hover { background: var(--mchat-surface2, rgba(255,255,255,0.06)); }
.${BUTTON_BASE_CLASS}--danger {
  background: var(--mchat-danger, #dc2626);
  color: #fff;
}
.${BUTTON_BASE_CLASS}--danger:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(220,38,38,0.30); }
.${BUTTON_BASE_CLASS}--full { width: 100%; }
.${BUTTON_BASE_CLASS}__icon { display: inline-flex; align-items: center; }
.${BUTTON_BASE_CLASS}__label { white-space: nowrap; }
`.trim();

function buttonEnsureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(BUTTON_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = BUTTON_STYLE_ID;
  style.textContent = BUTTON_STYLE_CSS;
  document.head.appendChild(style);
}

function buttonResolveTarget(target) {
  if (!target || typeof document === "undefined") return null;
  return typeof target === "string" ? document.querySelector(target) : target;
}

export class Button {
  constructor(options = {}) {
    buttonEnsureStyles();
    this.options = options;
    this.label = options.label || "";
    this.variant = options.variant || "primary";
    this.size = options.size || "md";
    this.icon = options.icon || "";
    this.onClick = options.onClick || null;
    this.disabled = !!options.disabled;
    this.element = this._create();
    this.labelEl = this.element.querySelector(`.${BUTTON_BASE_CLASS}__label`);
    this.iconEl = this.element.querySelector(`.${BUTTON_BASE_CLASS}__icon`);
    this.element.addEventListener("click", (e) => {
      if (this.disabled) return;
      if (typeof this.onClick === "function") this.onClick(e);
    });
    const mount = buttonResolveTarget(options.target);
    if (mount) mount.appendChild(this.element);
    this.render();
  }

  static mount(target, options = {}) {
    return new Button({ ...options, target });
  }

  setLabel(value) {
    this.label = value || "";
    this.render();
    return this;
  }

  setIcon(value) {
    this.icon = value || "";
    this.render();
    return this;
  }

  setVariant(value) {
    this.variant = value || "primary";
    this._applyClasses();
    return this;
  }

  setDisabled(flag) {
    this.disabled = !!flag;
    if (this.disabled) this.element.setAttribute("disabled", "");
    else this.element.removeAttribute("disabled");
    return this;
  }

  attach(target) {
    const mount = buttonResolveTarget(target);
    if (mount) mount.appendChild(this.element);
    return this;
  }

  detach() {
    this.element.remove();
    return this;
  }

  render() {
    if (this.labelEl) this.labelEl.textContent = this.label;
    if (this.iconEl) {
      this.iconEl.textContent = this.icon;
      this.iconEl.hidden = !this.icon;
    }
    this._applyClasses();
    return this.element;
  }

  _applyClasses() {
    const classes = [BUTTON_BASE_CLASS, `${BUTTON_BASE_CLASS}--${this.variant}`, `${BUTTON_BASE_CLASS}--${this.size}`];
    if (this.options.fullWidth) classes.push(`${BUTTON_BASE_CLASS}--full`);
    this.element.className = classes.join(" ");
  }

  _create() {
    if (typeof document === "undefined") {
      return { querySelector: () => null, addEventListener: () => {}, removeAttribute: () => {}, setAttribute: () => {}, remove: () => {}, appendChild: () => {} };
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.component = "button";
    btn.innerHTML = `<span class="${BUTTON_BASE_CLASS}__icon" hidden></span><span class="${BUTTON_BASE_CLASS}__label"></span>`;
    if (this.disabled) btn.setAttribute("disabled", "");
    return btn;
  }
}
