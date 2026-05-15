// TextInput — productivity-app text entry.
//
// Why this exists: todo apps, search bars, note titles, inline-add patterns
// all need a consistent text input with placeholder, label, optional leading
// icon, clear button, onInput, and onSubmit (Enter key) semantics. Without
// shared lego, every generated app reinvents this differently and breaks
// the "Enter to add" UX repeatedly.
//
// Usage:
//   usage: bring in { TextInput } from the path ../../ui/forms/TextInput.js
//   const adder = new TextInput({
//     placeholder: "Add a task",
//     onSubmit: (value, input) => { store.add(value); input.clear(); },
//     onInput: (value) => filterBar.setQuery(value),
//     leadingIcon: "🔍",
//     clearable: true,
//     size: "md",                  // sm | md | lg
//     target: "[data-add-slot]"
//   });
//   adder.focus();
//   adder.setValue("");
//   const v = adder.getValue();
//
// Composition: pair with Button on the right by mounting both to a flex row.
// The component degrades to a bare <input> outside a browser environment.

const TEXT_INPUT_STYLE_ID = "mchatai-text-input-styles";
const TEXT_INPUT_BASE_CLASS = "mchatai-text-input";

const TEXT_INPUT_STYLE_CSS = `
.${TEXT_INPUT_BASE_CLASS} {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px var(--mchat-space-2, 8px);
  border-radius: var(--mchat-radius-md, 10px);
  border: 1px solid var(--mchat-border, rgba(255,255,255,0.12));
  background: var(--mchat-surface, rgba(255,255,255,0.04));
  color: var(--mchat-text, #e5e7eb);
  transition: border-color 100ms ease, box-shadow 100ms ease;
  min-height: 36px;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}
.${TEXT_INPUT_BASE_CLASS}:focus-within {
  border-color: var(--mchat-accent, #6366f1);
  box-shadow: 0 0 0 3px var(--mchat-accentRing, rgba(99,102,241,0.25));
}
.${TEXT_INPUT_BASE_CLASS}--sm { min-height: 28px; font-size: 0.85rem; padding: 2px 6px; }
.${TEXT_INPUT_BASE_CLASS}--lg { min-height: 44px; font-size: 1.05rem; padding: 6px 12px; }
.${TEXT_INPUT_BASE_CLASS}__icon {
  display: inline-flex;
  align-items: center;
  opacity: 0.7;
  font-size: 1em;
  pointer-events: none;
}
.${TEXT_INPUT_BASE_CLASS}__icon[hidden] { display: none; }
.${TEXT_INPUT_BASE_CLASS}__input {
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  padding: 4px 2px;
}
.${TEXT_INPUT_BASE_CLASS}__input::placeholder { opacity: 0.5; }
.${TEXT_INPUT_BASE_CLASS}__clear {
  border: 0;
  background: transparent;
  color: inherit;
  opacity: 0.5;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 0.9em;
}
.${TEXT_INPUT_BASE_CLASS}__clear[hidden] { display: none; }
.${TEXT_INPUT_BASE_CLASS}__clear:hover { opacity: 1; background: var(--mchat-surface2, rgba(255,255,255,0.08)); }
.${TEXT_INPUT_BASE_CLASS}--with-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: stretch;
  padding: 0;
  border: 0;
  background: transparent;
  min-height: 0;
}
.${TEXT_INPUT_BASE_CLASS}--with-label:focus-within { box-shadow: none; }
.${TEXT_INPUT_BASE_CLASS}__label {
  font-size: 0.78rem;
  opacity: 0.7;
  font-weight: 600;
  letter-spacing: 0.01em;
}
.${TEXT_INPUT_BASE_CLASS}__field-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px var(--mchat-space-2, 8px);
  border-radius: var(--mchat-radius-md, 10px);
  border: 1px solid var(--mchat-border, rgba(255,255,255,0.12));
  background: var(--mchat-surface, rgba(255,255,255,0.04));
  min-height: 36px;
}
.${TEXT_INPUT_BASE_CLASS}--with-label:focus-within .${TEXT_INPUT_BASE_CLASS}__field-wrap {
  border-color: var(--mchat-accent, #6366f1);
  box-shadow: 0 0 0 3px var(--mchat-accentRing, rgba(99,102,241,0.25));
}
`.trim();

function textInputEnsureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(TEXT_INPUT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = TEXT_INPUT_STYLE_ID;
  style.textContent = TEXT_INPUT_STYLE_CSS;
  document.head.appendChild(style);
}

function textInputResolveTarget(target) {
  if (!target || typeof document === "undefined") return null;
  return typeof target === "string" ? document.querySelector(target) : target;
}

export class TextInput {
  constructor(options = {}) {
    textInputEnsureStyles();
    this.options = options;
    this.value = options.value || "";
    this.placeholder = options.placeholder || "";
    this.label = options.label || "";
    this.leadingIcon = options.leadingIcon || "";
    this.clearable = !!options.clearable;
    this.size = options.size || "md";
    this.type = options.type || "text";
    this.onInput = options.onInput || null;
    this.onSubmit = options.onSubmit || null;
    this.onBlur = options.onBlur || null;
    this.disabled = !!options.disabled;
    this.element = this._create();
    this.inputEl = this.element.querySelector(`.${TEXT_INPUT_BASE_CLASS}__input`);
    this.iconEl = this.element.querySelector(`.${TEXT_INPUT_BASE_CLASS}__icon`);
    this.clearEl = this.element.querySelector(`.${TEXT_INPUT_BASE_CLASS}__clear`);
    this._wireEvents();
    const mount = textInputResolveTarget(options.target);
    if (mount) mount.appendChild(this.element);
    this.render();
  }

  static mount(target, options = {}) {
    return new TextInput({ ...options, target });
  }

  getValue() { return this.inputEl ? this.inputEl.value : this.value; }
  setValue(v) { this.value = v || ""; if (this.inputEl) this.inputEl.value = this.value; this._refreshClear(); return this; }
  clear() { return this.setValue(""); }
  focus() { if (this.inputEl) this.inputEl.focus(); return this; }
  blur() { if (this.inputEl) this.inputEl.blur(); return this; }

  setDisabled(flag) {
    this.disabled = !!flag;
    if (this.inputEl) this.inputEl.disabled = this.disabled;
    return this;
  }

  setPlaceholder(text) {
    this.placeholder = text || "";
    if (this.inputEl) this.inputEl.placeholder = this.placeholder;
    return this;
  }

  attach(target) {
    const mount = textInputResolveTarget(target);
    if (mount) mount.appendChild(this.element);
    return this;
  }

  detach() {
    this.element.remove();
    return this;
  }

  render() {
    if (this.inputEl) {
      this.inputEl.value = this.value;
      this.inputEl.placeholder = this.placeholder;
      this.inputEl.disabled = this.disabled;
      this.inputEl.type = this.type;
    }
    if (this.iconEl) {
      this.iconEl.textContent = this.leadingIcon;
      this.iconEl.hidden = !this.leadingIcon;
    }
    this._refreshClear();
    return this.element;
  }

  _refreshClear() {
    if (!this.clearEl) return;
    this.clearEl.hidden = !this.clearable || !(this.inputEl && this.inputEl.value.length > 0);
  }

  _wireEvents() {
    if (!this.inputEl) return;
    this.inputEl.addEventListener("input", (e) => {
      this.value = e.target.value;
      this._refreshClear();
      if (typeof this.onInput === "function") this.onInput(this.value, this);
    });
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && typeof this.onSubmit === "function") {
        e.preventDefault();
        this.onSubmit(this.value, this);
      }
    });
    this.inputEl.addEventListener("blur", () => {
      if (typeof this.onBlur === "function") this.onBlur(this.value, this);
    });
    if (this.clearEl) {
      this.clearEl.addEventListener("click", () => {
        this.clear();
        if (typeof this.onInput === "function") this.onInput("", this);
        this.focus();
      });
    }
  }

  _create() {
    if (typeof document === "undefined") {
      return { querySelector: () => null, addEventListener: () => {}, remove: () => {}, appendChild: () => {} };
    }
    const hasLabel = !!this.label;
    const root = document.createElement("div");
    root.dataset.component = "text-input";
    if (hasLabel) {
      root.className = `${TEXT_INPUT_BASE_CLASS} ${TEXT_INPUT_BASE_CLASS}--with-label ${TEXT_INPUT_BASE_CLASS}--${this.size}`;
      root.innerHTML = `
        <label class="${TEXT_INPUT_BASE_CLASS}__label">${escapeHtml(this.label)}</label>
        <div class="${TEXT_INPUT_BASE_CLASS}__field-wrap">
          <span class="${TEXT_INPUT_BASE_CLASS}__icon" hidden></span>
          <input class="${TEXT_INPUT_BASE_CLASS}__input" type="${this.type}" />
          <button class="${TEXT_INPUT_BASE_CLASS}__clear" type="button" hidden aria-label="Clear">✕</button>
        </div>
      `;
    } else {
      root.className = `${TEXT_INPUT_BASE_CLASS} ${TEXT_INPUT_BASE_CLASS}--${this.size}`;
      root.innerHTML = `
        <span class="${TEXT_INPUT_BASE_CLASS}__icon" hidden></span>
        <input class="${TEXT_INPUT_BASE_CLASS}__input" type="${this.type}" />
        <button class="${TEXT_INPUT_BASE_CLASS}__clear" type="button" hidden aria-label="Clear">✕</button>
      `;
    }
    return root;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
