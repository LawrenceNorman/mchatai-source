const STYLE_ID = "mchatai-mini-header-styles";
const BASE_CLASS = "mchatai-mini-header";

const STYLE_CSS = `
.${BASE_CLASS} {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 8px;
  margin: 0;
  color: inherit;
  background: transparent;
  border: 0;
  flex-wrap: wrap;
}
.${BASE_CLASS}[hidden] {
  display: none;
}
.${BASE_CLASS}__title {
  margin: 0;
  font-size: clamp(0.95rem, 3.4vw, 1.2rem);
  line-height: 1.15;
  font-weight: 700;
  letter-spacing: -0.005em;
}
.${BASE_CLASS}__subtitle {
  margin: 0;
  font-size: 0.7rem;
  line-height: 1.2;
  opacity: 0.6;
  font-weight: 400;
}
.${BASE_CLASS}__subtitle[hidden] {
  display: none;
}
@media (max-width: 520px) {
  .${BASE_CLASS} {
    padding: 3px 6px;
  }
  .${BASE_CLASS}__subtitle {
    display: none;
  }
}
`.trim();

function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLE_CSS;
  document.head.appendChild(style);
}

function resolveTarget(target) {
  if (!target || typeof document === "undefined") return null;
  return typeof target === "string" ? document.querySelector(target) : target;
}

export class MiniHeader {
  constructor(options = {}) {
    ensureStyles();
    this.titleText = options.title || "";
    this.subtitleText = options.subtitle || "";
    this.element = this._create();
    this.titleEl = this.element.querySelector(`.${BASE_CLASS}__title`);
    this.subtitleEl = this.element.querySelector(`.${BASE_CLASS}__subtitle`);
    const mount = resolveTarget(options.target);
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
    const mount = resolveTarget(target);
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
    root.className = BASE_CLASS;
    root.dataset.component = "mini-header";
    root.innerHTML = `
      <h1 class="${BASE_CLASS}__title"></h1>
      <p class="${BASE_CLASS}__subtitle" hidden></p>
    `;
    return root;
  }
}
