// EmptyState — placeholder shown when a list/grid has no items.
//
// Why this exists: an empty todo list, an empty notes sidebar, a bookmark
// shelf with nothing yet — every productivity app needs the same "nothing
// here yet" affordance with optional CTA. Generated apps tend to either
// skip this entirely (leaving a blank pane) or hardcode bespoke versions.
//
// Usage:
//   usage: bring in { EmptyState } from the path ../../ui/feedback/EmptyState.js
//   const empty = new EmptyState({
//     icon: "📝",
//     title: "No notes yet",
//     subtitle: "Press ⌘N or click + to add your first note.",
//     ctaLabel: "Add note",
//     onCta: () => editor.newNote(),
//     target: emptyContainer
//   });
//   empty.hide();   // when first note appears
//   empty.show();   // when last note removed
//
// Pair with a list: keep both mounted, toggle visibility based on count.

const EMPTY_STATE_STYLE_ID = "mchatai-empty-state-styles";
const EMPTY_STATE_BASE_CLASS = "mchatai-empty-state";

const EMPTY_STATE_STYLE_CSS = `
.${EMPTY_STATE_BASE_CLASS} {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: var(--mchat-space-6, 32px) var(--mchat-space-4, 16px);
  text-align: center;
  color: var(--mchat-text, #e5e7eb);
  min-height: 200px;
}
.${EMPTY_STATE_BASE_CLASS}[hidden] { display: none; }
.${EMPTY_STATE_BASE_CLASS}__icon {
  font-size: 3rem;
  opacity: 0.4;
  line-height: 1;
}
.${EMPTY_STATE_BASE_CLASS}__icon[hidden] { display: none; }
.${EMPTY_STATE_BASE_CLASS}__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  opacity: 0.85;
}
.${EMPTY_STATE_BASE_CLASS}__subtitle {
  margin: 0;
  font-size: 0.88rem;
  opacity: 0.6;
  max-width: 36ch;
  line-height: 1.45;
}
.${EMPTY_STATE_BASE_CLASS}__subtitle[hidden] { display: none; }
.${EMPTY_STATE_BASE_CLASS}__cta {
  margin-top: 6px;
  padding: 8px 16px;
  border-radius: var(--mchat-radius-md, 10px);
  border: 0;
  background: var(--mchat-accent, #6366f1);
  color: var(--mchat-onAccent, #fff);
  font: inherit;
  font-weight: 600;
  font-size: 0.92rem;
  cursor: pointer;
  transition: transform 100ms ease, box-shadow 100ms ease;
}
.${EMPTY_STATE_BASE_CLASS}__cta:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99,102,241,0.28); }
.${EMPTY_STATE_BASE_CLASS}__cta[hidden] { display: none; }
`.trim();

function emptyStateEnsureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(EMPTY_STATE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = EMPTY_STATE_STYLE_ID;
  style.textContent = EMPTY_STATE_STYLE_CSS;
  document.head.appendChild(style);
}

function emptyStateResolveTarget(target) {
  if (!target || typeof document === "undefined") return null;
  return typeof target === "string" ? document.querySelector(target) : target;
}

export class EmptyState {
  constructor(options = {}) {
    emptyStateEnsureStyles();
    this.options = options;
    this.icon = options.icon || "";
    this.title = options.title || "";
    this.subtitle = options.subtitle || "";
    this.ctaLabel = options.ctaLabel || "";
    this.onCta = options.onCta || null;
    this.element = this._create();
    this.iconEl = this.element.querySelector(`.${EMPTY_STATE_BASE_CLASS}__icon`);
    this.titleEl = this.element.querySelector(`.${EMPTY_STATE_BASE_CLASS}__title`);
    this.subtitleEl = this.element.querySelector(`.${EMPTY_STATE_BASE_CLASS}__subtitle`);
    this.ctaEl = this.element.querySelector(`.${EMPTY_STATE_BASE_CLASS}__cta`);
    if (this.ctaEl) {
      this.ctaEl.addEventListener("click", () => {
        if (typeof this.onCta === "function") this.onCta(this);
      });
    }
    const mount = emptyStateResolveTarget(options.target);
    if (mount) mount.appendChild(this.element);
    this.render();
  }

  static mount(target, options = {}) {
    return new EmptyState({ ...options, target });
  }

  setTitle(value) { this.title = value || ""; this.render(); return this; }
  setSubtitle(value) { this.subtitle = value || ""; this.render(); return this; }
  setIcon(value) { this.icon = value || ""; this.render(); return this; }
  setCta(label, handler) {
    this.ctaLabel = label || "";
    if (typeof handler === "function") this.onCta = handler;
    this.render();
    return this;
  }

  show() { this.element.hidden = false; return this; }
  hide() { this.element.hidden = true; return this; }
  toggle(visible) { this.element.hidden = !visible; return this; }

  attach(target) {
    const mount = emptyStateResolveTarget(target);
    if (mount) mount.appendChild(this.element);
    return this;
  }

  detach() {
    this.element.remove();
    return this;
  }

  render() {
    if (this.iconEl) {
      this.iconEl.textContent = this.icon;
      this.iconEl.hidden = !this.icon;
    }
    if (this.titleEl) this.titleEl.textContent = this.title;
    if (this.subtitleEl) {
      this.subtitleEl.textContent = this.subtitle;
      this.subtitleEl.hidden = !this.subtitle;
    }
    if (this.ctaEl) {
      this.ctaEl.textContent = this.ctaLabel;
      this.ctaEl.hidden = !this.ctaLabel;
    }
    return this.element;
  }

  _create() {
    if (typeof document === "undefined") {
      return {
        querySelector: () => ({ addEventListener: () => {}, textContent: "", hidden: false }),
        appendChild: () => {},
        remove: () => {},
        hidden: false
      };
    }
    const root = document.createElement("div");
    root.className = EMPTY_STATE_BASE_CLASS;
    root.dataset.component = "empty-state";
    root.innerHTML = `
      <div class="${EMPTY_STATE_BASE_CLASS}__icon" hidden></div>
      <h3 class="${EMPTY_STATE_BASE_CLASS}__title"></h3>
      <p class="${EMPTY_STATE_BASE_CLASS}__subtitle" hidden></p>
      <button class="${EMPTY_STATE_BASE_CLASS}__cta" type="button" hidden></button>
    `;
    return root;
  }
}
