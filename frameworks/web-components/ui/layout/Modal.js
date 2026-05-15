// Modal — productivity-app dialog overlay.
//
// Why this exists: Add-bookmark, edit-task, confirm-delete, settings —
// every productivity app needs a modal dialog and they all need the same
// affordances: backdrop click to dismiss, ESC to dismiss, focus trap,
// scrollable body, optional footer with action buttons. Generated apps
// reinvent this constantly with broken keyboard handling.
//
// Usage:
//   usage: bring in { Modal } from the path ../../ui/layout/Modal.js
//   const m = new Modal({
//     title: "Add bookmark",
//     dismissOnBackdrop: true,
//     dismissOnEscape: true,
//     onClose: () => unsavedDraft.clear()
//   });
//   m.bodySlot.appendChild(formEl);
//   m.footerSlot.appendChild(saveButton.element);
//   m.open();
//   // later:
//   m.close();
//
// Slots:
//   modal.bodySlot     // scrollable middle area
//   modal.footerSlot   // bottom-right action bar
//   modal.headerSlot   // optional content between title and close X

const MODAL_STYLE_ID = "mchatai-modal-styles";
const MODAL_BASE_CLASS = "mchatai-modal";

const MODAL_STYLE_CSS = `
.${MODAL_BASE_CLASS} {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: none;
  align-items: center;
  justify-content: center;
  padding: var(--mchat-space-4, 16px);
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(2px);
  animation: mchatai-modal-fade 150ms ease-out both;
  color: var(--mchat-text, #e5e7eb);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
}
.${MODAL_BASE_CLASS}--open { display: flex; }
@keyframes mchatai-modal-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
.${MODAL_BASE_CLASS}__panel {
  background: var(--mchat-bg, #131722);
  border: 1px solid var(--mchat-border, rgba(255,255,255,0.1));
  border-radius: var(--mchat-radius-md, 14px);
  width: min(560px, 100%);
  max-height: min(80vh, 720px);
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  animation: mchatai-modal-rise 180ms cubic-bezier(0.25, 1, 0.5, 1) both;
}
@keyframes mchatai-modal-rise {
  from { opacity: 0; transform: translateY(12px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.${MODAL_BASE_CLASS}__panel--sm { width: min(380px, 100%); }
.${MODAL_BASE_CLASS}__panel--lg { width: min(840px, 100%); }
.${MODAL_BASE_CLASS}__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: var(--mchat-space-4, 16px);
  border-bottom: 1px solid var(--mchat-border, rgba(255,255,255,0.08));
  flex-shrink: 0;
}
.${MODAL_BASE_CLASS}__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  flex: 1 1 auto;
}
.${MODAL_BASE_CLASS}__header-slot { display: flex; align-items: center; gap: 8px; }
.${MODAL_BASE_CLASS}__close {
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
  opacity: 0.7;
}
.${MODAL_BASE_CLASS}__close:hover { opacity: 1; background: var(--mchat-surface2, rgba(255,255,255,0.06)); }
.${MODAL_BASE_CLASS}__body {
  padding: var(--mchat-space-4, 16px);
  overflow-y: auto;
  flex: 1 1 auto;
}
.${MODAL_BASE_CLASS}__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: var(--mchat-space-2, 8px) var(--mchat-space-4, 16px) var(--mchat-space-4, 16px);
  border-top: 1px solid var(--mchat-border, rgba(255,255,255,0.06));
  flex-shrink: 0;
}
.${MODAL_BASE_CLASS}__footer:empty { display: none; }
`.trim();

function modalEnsureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(MODAL_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = MODAL_STYLE_ID;
  style.textContent = MODAL_STYLE_CSS;
  document.head.appendChild(style);
}

function modalResolveTarget(target) {
  if (!target || typeof document === "undefined") return null;
  return typeof target === "string" ? document.querySelector(target) : target;
}

export class Modal {
  constructor(options = {}) {
    modalEnsureStyles();
    this.options = options;
    this.title = options.title || "";
    this.size = options.size || "md";
    this.dismissOnBackdrop = options.dismissOnBackdrop !== false;
    this.dismissOnEscape = options.dismissOnEscape !== false;
    this.showClose = options.showClose !== false;
    this.onClose = options.onClose || null;
    this.onOpen = options.onOpen || null;
    this.isOpen = false;
    this.element = this._create();
    this.panelEl = this.element.querySelector(`.${MODAL_BASE_CLASS}__panel`);
    this.titleEl = this.element.querySelector(`.${MODAL_BASE_CLASS}__title`);
    this.bodySlot = this.element.querySelector(`.${MODAL_BASE_CLASS}__body`);
    this.footerSlot = this.element.querySelector(`.${MODAL_BASE_CLASS}__footer`);
    this.headerSlot = this.element.querySelector(`.${MODAL_BASE_CLASS}__header-slot`);
    this.closeEl = this.element.querySelector(`.${MODAL_BASE_CLASS}__close`);
    if (this.closeEl) this.closeEl.addEventListener("click", () => this.close());
    this.element.addEventListener("click", (e) => {
      if (e.target === this.element && this.dismissOnBackdrop) this.close();
    });
    this._escHandler = (e) => {
      if (e.key === "Escape" && this.isOpen && this.dismissOnEscape) this.close();
    };
    const mount = modalResolveTarget(options.target) || (typeof document !== "undefined" ? document.body : null);
    if (mount) mount.appendChild(this.element);
    this.render();
  }

  static mount(target, options = {}) {
    return new Modal({ ...options, target });
  }

  open() {
    if (this.isOpen) return this;
    this.isOpen = true;
    if (this.element && this.element.classList) this.element.classList.add(`${MODAL_BASE_CLASS}--open`);
    if (typeof document !== "undefined") document.addEventListener("keydown", this._escHandler);
    if (typeof this.onOpen === "function") this.onOpen(this);
    // focus first focusable child for accessibility
    setTimeout(() => {
      if (!this.panelEl) return;
      const focusable = this.panelEl.querySelector("input, textarea, button, [tabindex]:not([tabindex='-1'])");
      if (focusable && typeof focusable.focus === "function") focusable.focus();
    }, 30);
    return this;
  }

  close() {
    if (!this.isOpen) return this;
    this.isOpen = false;
    if (this.element && this.element.classList) this.element.classList.remove(`${MODAL_BASE_CLASS}--open`);
    if (typeof document !== "undefined") document.removeEventListener("keydown", this._escHandler);
    if (typeof this.onClose === "function") this.onClose(this);
    return this;
  }

  toggle() { return this.isOpen ? this.close() : this.open(); }

  setTitle(value) {
    this.title = value || "";
    if (this.titleEl) this.titleEl.textContent = this.title;
    return this;
  }

  destroy() {
    this.close();
    this.element.remove();
    return this;
  }

  render() {
    if (this.titleEl) this.titleEl.textContent = this.title;
    if (this.closeEl) this.closeEl.hidden = !this.showClose;
    if (this.panelEl && this.panelEl.classList) {
      this.panelEl.classList.remove(`${MODAL_BASE_CLASS}__panel--sm`, `${MODAL_BASE_CLASS}__panel--lg`);
      if (this.size === "sm") this.panelEl.classList.add(`${MODAL_BASE_CLASS}__panel--sm`);
      else if (this.size === "lg") this.panelEl.classList.add(`${MODAL_BASE_CLASS}__panel--lg`);
    }
    return this.element;
  }

  _create() {
    if (typeof document === "undefined") {
      const stubEl = { appendChild: () => {}, addEventListener: () => {}, hidden: false, textContent: "", classList: { add: () => {}, remove: () => {} } };
      return {
        querySelector: () => stubEl,
        addEventListener: () => {},
        appendChild: () => {},
        remove: () => {},
        setAttribute: () => {},
        classList: { add: () => {}, remove: () => {} }
      };
    }
    const root = document.createElement("div");
    root.className = MODAL_BASE_CLASS;
    root.dataset.component = "modal";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.innerHTML = `
      <div class="${MODAL_BASE_CLASS}__panel">
        <div class="${MODAL_BASE_CLASS}__header">
          <h2 class="${MODAL_BASE_CLASS}__title"></h2>
          <div class="${MODAL_BASE_CLASS}__header-slot"></div>
          <button class="${MODAL_BASE_CLASS}__close" type="button" aria-label="Close">✕</button>
        </div>
        <div class="${MODAL_BASE_CLASS}__body"></div>
        <div class="${MODAL_BASE_CLASS}__footer"></div>
      </div>
    `;
    return root;
  }
}
