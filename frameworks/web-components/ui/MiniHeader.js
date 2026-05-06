const MINI_HEADER_STYLE_ID = "mchatai-mini-header-styles";
const MINI_HEADER_BASE_CLASS = "mchatai-mini-header";

const MINI_HEADER_STYLE_CSS = `
.${MINI_HEADER_BASE_CLASS} {
  display: flex;
  align-items: baseline;
  gap: var(--mchat-space-2, 8px);
  padding: var(--mchat-space-1, 4px) var(--mchat-space-2, 8px);
  margin: 0;
  color: inherit;
  background: transparent;
  border: 0;
  flex-wrap: wrap;
}
.${MINI_HEADER_BASE_CLASS}[hidden] {
  display: none;
}
.${MINI_HEADER_BASE_CLASS}__title {
  margin: 0;
  font-size: clamp(0.95rem, 3.4vw, 1.2rem);
  line-height: 1.15;
  font-weight: 700;
  letter-spacing: -0.005em;
}
.${MINI_HEADER_BASE_CLASS}__subtitle {
  margin: 0;
  font-size: 0.7rem;
  line-height: 1.2;
  opacity: 0.6;
  font-weight: 400;
}
.${MINI_HEADER_BASE_CLASS}__subtitle[hidden] {
  display: none;
}
@media (max-width: 520px) {
  .${MINI_HEADER_BASE_CLASS} {
    padding: 3px 6px;
  }
  .${MINI_HEADER_BASE_CLASS}__subtitle {
    display: none;
  }
}
`.trim();

function miniHeaderEnsureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(MINI_HEADER_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = MINI_HEADER_STYLE_ID;
  style.textContent = MINI_HEADER_STYLE_CSS;
  document.head.appendChild(style);
}

function miniHeaderResolveTarget(target) {
  if (!target || typeof document === "undefined") return null;
  return typeof target === "string" ? document.querySelector(target) : target;
}

export class MiniHeader {
  constructor(options = {}) {
    miniHeaderEnsureStyles();
    this.titleText = options.title || "";
    this.subtitleText = options.subtitle || "";
    this.element = this._create();
    this.titleEl = this.element.querySelector(`.${MINI_HEADER_BASE_CLASS}__title`);
    this.subtitleEl = this.element.querySelector(`.${MINI_HEADER_BASE_CLASS}__subtitle`);
    const mount = miniHeaderResolveTarget(options.target);
    if (mount) {
      // If the host already has the header attribute, render in place; else append.
      if (mount.hasAttribute && mount.hasAttribute("data-mini-header")) {
        mount.replaceWith(this.element);
        this.element.setAttribute("data-mini-header", "");
      } else {
        mount.appendChild(this.element);
      }
    }
    this.render();
  }

  static mount(target, options = {}) {
    return new MiniHeader({ ...options, target });
  }

  setTitle(value) {
    this.titleText = value || "";
    this.render();
    return this;
  }

  setSubtitle(value) {
    this.subtitleText = value || "";
    this.render();
    return this;
  }

  attach(target) {
    const mount = miniHeaderResolveTarget(target);
    if (mount) mount.appendChild(this.element);
    return this;
  }

  detach() {
    this.element.remove();
    return this;
  }

  render() {
    if (this.titleEl) this.titleEl.textContent = this.titleText;
    if (this.subtitleEl) {
      const hasSubtitle = !!this.subtitleText;
      this.subtitleEl.textContent = this.subtitleText;
      this.subtitleEl.hidden = !hasSubtitle;
    }
    // If both title and subtitle are empty, hide the whole header so it doesn't take space.
    if (!this.titleText && !this.subtitleText) {
      this.element.hidden = true;
    } else {
      this.element.hidden = false;
    }
    return this.element;
  }

  _create() {
    if (typeof document === "undefined") {
      return { querySelector: () => null, remove: () => {}, appendChild: () => {} };
    }
    const root = document.createElement("header");
    root.className = MINI_HEADER_BASE_CLASS;
    root.dataset.component = "mini-header";
    root.innerHTML = `
      <h1 class="${MINI_HEADER_BASE_CLASS}__title"></h1>
      <p class="${MINI_HEADER_BASE_CLASS}__subtitle" hidden></p>
    `;
    return root;
  }
}
