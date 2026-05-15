// Card — visual content card with image/title/body/footer slots.
//
// Why this exists: bookmark cards, recipe cards, product cards, kanban
// cards, project tiles — they all share the same shape. Where ListItem
// is a single-row row in a list, Card is a richer 2D tile with an optional
// image and a body block. The two pair well: ListItem for sidebars,
// Card for grids and kanban columns.
//
// Usage:
//   usage: bring in { Card } from the path ../../ui/data/Card.js
//   const c = new Card({
//     title: "Buy groceries",
//     subtitle: "Personal · Today",
//     body: "Milk, eggs, bread",
//     image: "https://...",          // optional thumbnail URL or HTML
//     tags: ["urgent", "errands"],
//     onClick: () => detail.show(task),
//     target: columnBody
//   });
//   c.setTitle("Buy groceries (urgent)");
//   c.setTrailing(deleteBtn.element);
//
// Slots:
//   card.bodySlot       // free-form area below subtitle/body
//   card.footerSlot     // bottom-right action bar
//   card.tagSlot        // tag-chip strip (auto-populated from `tags` option)
//
// Renders as <article> for semantic grouping inside a column or grid.

const CARD_STYLE_ID = "mchatai-card-styles";
const CARD_BASE_CLASS = "mchatai-card";

const CARD_STYLE_CSS = `
.${CARD_BASE_CLASS} {
  display: flex;
  flex-direction: column;
  background: var(--mchat-surface2, rgba(255,255,255,0.06));
  border: 1px solid var(--mchat-border, rgba(255,255,255,0.08));
  border-radius: var(--mchat-radius-md, 10px);
  padding: 10px 12px;
  gap: 6px;
  color: var(--mchat-text, #e5e7eb);
  transition: transform 100ms ease, box-shadow 100ms ease, border-color 100ms ease;
  cursor: default;
}
.${CARD_BASE_CLASS}--clickable { cursor: pointer; }
.${CARD_BASE_CLASS}--clickable:hover {
  transform: translateY(-1px);
  border-color: var(--mchat-accent, #6366f1);
  box-shadow: 0 4px 14px rgba(0,0,0,0.18);
}
.${CARD_BASE_CLASS}__image {
  width: calc(100% + 24px);
  margin: -10px -12px 4px;
  aspect-ratio: 16/9;
  background: var(--mchat-surface, rgba(255,255,255,0.04));
  border-bottom: 1px solid var(--mchat-border, rgba(255,255,255,0.06));
  border-radius: var(--mchat-radius-md, 10px) var(--mchat-radius-md, 10px) 0 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.${CARD_BASE_CLASS}__image[hidden] { display: none; }
.${CARD_BASE_CLASS}__image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.${CARD_BASE_CLASS}__title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.3;
}
.${CARD_BASE_CLASS}__subtitle {
  margin: 0;
  font-size: 0.78rem;
  opacity: 0.6;
  line-height: 1.2;
}
.${CARD_BASE_CLASS}__subtitle:empty { display: none; }
.${CARD_BASE_CLASS}__body {
  margin: 0;
  font-size: 0.85rem;
  opacity: 0.85;
  line-height: 1.4;
}
.${CARD_BASE_CLASS}__body:empty { display: none; }
.${CARD_BASE_CLASS}__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}
.${CARD_BASE_CLASS}__tags:empty { display: none; }
.${CARD_BASE_CLASS}__tag {
  font-size: 0.7rem;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--mchat-accentSoft, rgba(99,102,241,0.18));
  font-weight: 600;
  letter-spacing: 0.01em;
}
.${CARD_BASE_CLASS}__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 4px;
}
.${CARD_BASE_CLASS}__footer:empty { display: none; }
.${CARD_BASE_CLASS}__body-slot:empty { display: none; }
`.trim();

function cardEnsureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(CARD_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = CARD_STYLE_ID;
  style.textContent = CARD_STYLE_CSS;
  document.head.appendChild(style);
}

function cardResolveTarget(target) {
  if (!target || typeof document === "undefined") return null;
  return typeof target === "string" ? document.querySelector(target) : target;
}

function cardEscapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export class Card {
  constructor(options = {}) {
    cardEnsureStyles();
    this.options = options;
    this.title = options.title || "";
    this.subtitle = options.subtitle || "";
    this.body = options.body || "";
    this.image = options.image || "";
    this.tags = Array.isArray(options.tags) ? options.tags.slice() : [];
    this.onClick = options.onClick || null;
    this.element = this._create();
    this.imageEl = this.element.querySelector(`.${CARD_BASE_CLASS}__image`);
    this.titleEl = this.element.querySelector(`.${CARD_BASE_CLASS}__title`);
    this.subtitleEl = this.element.querySelector(`.${CARD_BASE_CLASS}__subtitle`);
    this.bodyEl = this.element.querySelector(`.${CARD_BASE_CLASS}__body`);
    this.tagsEl = this.element.querySelector(`.${CARD_BASE_CLASS}__tags`);
    this.bodySlot = this.element.querySelector(`.${CARD_BASE_CLASS}__body-slot`);
    this.footerSlot = this.element.querySelector(`.${CARD_BASE_CLASS}__footer`);
    if (this.onClick) {
      this.element.addEventListener("click", (e) => {
        if (e.target.closest("button, input, a")) return;
        this.onClick(e, this);
      });
    }
    const mount = cardResolveTarget(options.target);
    if (mount) mount.appendChild(this.element);
    this.render();
  }

  static mount(target, options = {}) { return new Card({ ...options, target }); }

  setTitle(v) { this.title = v || ""; if (this.titleEl) this.titleEl.textContent = this.title; return this; }
  setSubtitle(v) { this.subtitle = v || ""; if (this.subtitleEl) this.subtitleEl.textContent = this.subtitle; return this; }
  setBody(v) { this.body = v || ""; if (this.bodyEl) this.bodyEl.textContent = this.body; return this; }
  setImage(url) {
    this.image = url || "";
    if (!this.imageEl) return this;
    if (this.image) {
      this.imageEl.innerHTML = this.image.startsWith("<") ? this.image : `<img src="${cardEscapeHtml(this.image)}" alt="" />`;
      this.imageEl.hidden = false;
    } else {
      this.imageEl.innerHTML = "";
      this.imageEl.hidden = true;
    }
    return this;
  }
  setTags(tags) {
    this.tags = Array.isArray(tags) ? tags.slice() : [];
    if (this.tagsEl) {
      this.tagsEl.innerHTML = this.tags
        .map(t => `<span class="${CARD_BASE_CLASS}__tag">${cardEscapeHtml(t)}</span>`)
        .join("");
    }
    return this;
  }
  setTrailing(node) {
    if (!this.footerSlot) return this;
    if (!node) { this.footerSlot.innerHTML = ""; return this; }
    if (typeof node === "string") this.footerSlot.innerHTML = node;
    else { this.footerSlot.innerHTML = ""; this.footerSlot.appendChild(node); }
    return this;
  }

  attach(target) {
    const mount = cardResolveTarget(target);
    if (mount) mount.appendChild(this.element);
    return this;
  }

  detach() { this.element.remove(); return this; }

  render() {
    if (this.titleEl) this.titleEl.textContent = this.title;
    if (this.subtitleEl) this.subtitleEl.textContent = this.subtitle;
    if (this.bodyEl) this.bodyEl.textContent = this.body;
    this.setImage(this.image);
    this.setTags(this.tags);
    if (this.element && this.element.classList) {
      this.element.classList.toggle(`${CARD_BASE_CLASS}--clickable`, !!this.onClick);
    }
    return this.element;
  }

  _create() {
    if (typeof document === "undefined") {
      const stubEl = { appendChild: () => {}, addEventListener: () => {}, textContent: "", innerHTML: "", hidden: false, classList: { toggle: () => {} } };
      return {
        querySelector: () => stubEl,
        addEventListener: () => {},
        appendChild: () => {},
        remove: () => {},
        classList: { toggle: () => {} }
      };
    }
    const root = document.createElement("article");
    root.className = CARD_BASE_CLASS;
    root.dataset.component = "card";
    root.innerHTML = `
      <div class="${CARD_BASE_CLASS}__image" hidden></div>
      <h3 class="${CARD_BASE_CLASS}__title"></h3>
      <p class="${CARD_BASE_CLASS}__subtitle"></p>
      <p class="${CARD_BASE_CLASS}__body"></p>
      <div class="${CARD_BASE_CLASS}__tags"></div>
      <div class="${CARD_BASE_CLASS}__body-slot"></div>
      <div class="${CARD_BASE_CLASS}__footer"></div>
    `;
    return root;
  }
}
