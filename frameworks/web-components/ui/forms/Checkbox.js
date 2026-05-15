// Checkbox — todo/checklist primitive with keyboard and label.
//
// Why this exists: todo lists, kanban checklists, settings panels, "done"
// toggles all need a single consistent checkbox affordance. The native
// <input type=checkbox> styles wildly across browsers, so this wraps it
// with a swatchable custom control while preserving keyboard semantics.
//
// Usage:
//   usage: bring in { Checkbox } from the path ../../ui/forms/Checkbox.js
//   const cb = new Checkbox({
//     label: "Buy groceries",
//     checked: false,
//     onChange: (checked, box) => store.setDone(task.id, checked),
//     target: listItemEl                // optional mount target
//   });
//   cb.setChecked(true);
//   cb.element                          // wrapper <label> for layout
//
// Accessibility: native <input type="checkbox"> drives the state; the
// visual box is rendered by ::before so screen readers and keyboard
// users get full semantics for free.

const CHECKBOX_STYLE_ID = "mchatai-checkbox-styles";
const CHECKBOX_BASE_CLASS = "mchatai-checkbox";

const CHECKBOX_STYLE_CSS = `
.${CHECKBOX_BASE_CLASS} {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  color: var(--mchat-text, #e5e7eb);
  font-size: 0.95rem;
  line-height: 1.3;
}
.${CHECKBOX_BASE_CLASS}__native {
  position: absolute;
  opacity: 0;
  pointer-events: none;
  width: 1px; height: 1px;
}
.${CHECKBOX_BASE_CLASS}__box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  border: 1.5px solid var(--mchat-border, rgba(255,255,255,0.3));
  background: var(--mchat-surface, rgba(255,255,255,0.05));
  transition: background 100ms ease, border-color 100ms ease, transform 100ms ease;
  flex-shrink: 0;
}
.${CHECKBOX_BASE_CLASS}__check {
  font-size: 0.8rem;
  color: var(--mchat-onAccent, #fff);
  opacity: 0;
  transform: scale(0.6);
  transition: opacity 100ms ease, transform 100ms ease;
  line-height: 1;
}
.${CHECKBOX_BASE_CLASS}__native:focus-visible + .${CHECKBOX_BASE_CLASS}__box {
  outline: 2px solid var(--mchat-accent, #6366f1);
  outline-offset: 2px;
}
.${CHECKBOX_BASE_CLASS}__native:checked + .${CHECKBOX_BASE_CLASS}__box {
  background: var(--mchat-accent, #6366f1);
  border-color: var(--mchat-accent, #6366f1);
}
.${CHECKBOX_BASE_CLASS}__native:checked + .${CHECKBOX_BASE_CLASS}__box .${CHECKBOX_BASE_CLASS}__check {
  opacity: 1;
  transform: scale(1);
}
.${CHECKBOX_BASE_CLASS}__native:disabled ~ .${CHECKBOX_BASE_CLASS}__box {
  opacity: 0.5;
  cursor: not-allowed;
}
.${CHECKBOX_BASE_CLASS}__label {
  flex: 1 1 auto;
  min-width: 0;
}
.${CHECKBOX_BASE_CLASS}--checked .${CHECKBOX_BASE_CLASS}__label {
  text-decoration: line-through;
  opacity: 0.55;
}
.${CHECKBOX_BASE_CLASS}--no-strike.${CHECKBOX_BASE_CLASS}--checked .${CHECKBOX_BASE_CLASS}__label {
  text-decoration: none;
  opacity: 1;
}
`.trim();

function checkboxEnsureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(CHECKBOX_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = CHECKBOX_STYLE_ID;
  style.textContent = CHECKBOX_STYLE_CSS;
  document.head.appendChild(style);
}

function checkboxResolveTarget(target) {
  if (!target || typeof document === "undefined") return null;
  return typeof target === "string" ? document.querySelector(target) : target;
}

export class Checkbox {
  constructor(options = {}) {
    checkboxEnsureStyles();
    this.options = options;
    this.label = options.label || "";
    this.checked = !!options.checked;
    this.disabled = !!options.disabled;
    this.strikeOnCheck = options.strikeOnCheck !== false; // default true (todo behavior)
    this.onChange = options.onChange || null;
    this.element = this._create();
    this.nativeEl = this.element.querySelector(`.${CHECKBOX_BASE_CLASS}__native`);
    this.labelEl = this.element.querySelector(`.${CHECKBOX_BASE_CLASS}__label`);
    if (this.nativeEl) {
      this.nativeEl.addEventListener("change", (e) => {
        this.checked = e.target.checked;
        this._applyState();
        if (typeof this.onChange === "function") this.onChange(this.checked, this);
      });
    }
    const mount = checkboxResolveTarget(options.target);
    if (mount) mount.appendChild(this.element);
    this.render();
  }

  static mount(target, options = {}) {
    return new Checkbox({ ...options, target });
  }

  setChecked(value, silent = false) {
    this.checked = !!value;
    if (this.nativeEl) this.nativeEl.checked = this.checked;
    this._applyState();
    if (!silent && typeof this.onChange === "function") this.onChange(this.checked, this);
    return this;
  }

  toggle() { return this.setChecked(!this.checked); }

  isChecked() { return this.checked; }

  setLabel(value) {
    this.label = value || "";
    if (this.labelEl) this.labelEl.textContent = this.label;
    return this;
  }

  setDisabled(flag) {
    this.disabled = !!flag;
    if (this.nativeEl) this.nativeEl.disabled = this.disabled;
    return this;
  }

  attach(target) {
    const mount = checkboxResolveTarget(target);
    if (mount) mount.appendChild(this.element);
    return this;
  }

  detach() {
    this.element.remove();
    return this;
  }

  render() {
    if (this.labelEl) this.labelEl.textContent = this.label;
    if (this.nativeEl) {
      this.nativeEl.checked = this.checked;
      this.nativeEl.disabled = this.disabled;
    }
    this._applyState();
    return this.element;
  }

  _applyState() {
    if (!this.element || !this.element.classList) return;
    this.element.classList.toggle(`${CHECKBOX_BASE_CLASS}--checked`, this.checked);
    this.element.classList.toggle(`${CHECKBOX_BASE_CLASS}--no-strike`, !this.strikeOnCheck);
  }

  _create() {
    if (typeof document === "undefined") {
      return { querySelector: () => null, classList: { toggle: () => {} }, remove: () => {}, appendChild: () => {} };
    }
    const root = document.createElement("label");
    root.className = CHECKBOX_BASE_CLASS;
    root.dataset.component = "checkbox";
    root.innerHTML = `
      <input type="checkbox" class="${CHECKBOX_BASE_CLASS}__native" ${this.checked ? "checked" : ""} ${this.disabled ? "disabled" : ""} />
      <span class="${CHECKBOX_BASE_CLASS}__box"><span class="${CHECKBOX_BASE_CLASS}__check">✓</span></span>
      <span class="${CHECKBOX_BASE_CLASS}__label"></span>
    `;
    return root;
  }
}
