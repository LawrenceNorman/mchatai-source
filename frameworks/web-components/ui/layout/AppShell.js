// AppShell — sidebar + main + (optional) header productivity app skeleton.
//
// Why this exists: every Lovable-style productivity app starts with the same
// shell: a left sidebar with a list or nav, a main pane that swaps content,
// and optionally a top header. Generated apps reinvent this every time with
// slightly different grid math, sticky headers that break on mobile, and
// inconsistent responsive collapse. This nails the layout once.
//
// Usage:
//   usage: bring in { AppShell } from the path ../../ui/layout/AppShell.js
//   const shell = new AppShell({
//     title: "Notes",
//     subtitle: "12 saved",
//     sidebarWidth: 260,
//     collapsedAt: 720,
//     target: document.body
//   });
//   shell.headerSlot.appendChild(searchInput.element);
//   shell.sidebarSlot.appendChild(noteListEl);
//   shell.mainSlot.appendChild(editorEl);
//   shell.setTitle("Notes (1 unsaved)");
//   shell.toggleSidebar();          // mobile hamburger
//
// Slots:
//   shell.headerSlot         // sits above sidebar+main, full width
//   shell.sidebarSlot        // left rail, hidden under collapsedAt breakpoint
//   shell.mainSlot           // primary scrollable content
//   shell.footerSlot         // optional bottom strip
//
// Responsive: below `collapsedAt` (default 720px) the sidebar overlays the
// main pane; tap the hamburger or call toggleSidebar() to reveal it.

const APP_SHELL_STYLE_ID = "mchatai-app-shell-styles";
const APP_SHELL_BASE_CLASS = "mchatai-app-shell";

const APP_SHELL_STYLE_CSS = `
.${APP_SHELL_BASE_CLASS} {
  display: grid;
  grid-template-rows: auto 1fr auto;
  grid-template-columns: var(--mchatai-app-shell-sidebar-w, 260px) 1fr;
  height: 100%;
  min-height: 100vh;
  background: var(--mchat-bg, #0b0e14);
  color: var(--mchat-text, #e5e7eb);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
}
.${APP_SHELL_BASE_CLASS}__header {
  grid-row: 1;
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: var(--mchat-space-2, 8px) var(--mchat-space-4, 16px);
  border-bottom: 1px solid var(--mchat-border, rgba(255,255,255,0.08));
  background: var(--mchat-surface, rgba(255,255,255,0.02));
  min-height: 48px;
}
.${APP_SHELL_BASE_CLASS}__header[hidden] { display: none; }
.${APP_SHELL_BASE_CLASS}__hamburger {
  display: none;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 1.4rem;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: 8px;
}
.${APP_SHELL_BASE_CLASS}__hamburger:hover { background: var(--mchat-surface2, rgba(255,255,255,0.06)); }
.${APP_SHELL_BASE_CLASS}__title-block { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
.${APP_SHELL_BASE_CLASS}__title { margin: 0; font-size: 1.05rem; font-weight: 700; letter-spacing: -0.005em; line-height: 1.15; }
.${APP_SHELL_BASE_CLASS}__subtitle { margin: 0; font-size: 0.78rem; opacity: 0.6; line-height: 1.2; }
.${APP_SHELL_BASE_CLASS}__subtitle[hidden] { display: none; }
.${APP_SHELL_BASE_CLASS}__header-slot { display: flex; align-items: center; gap: 8px; }
.${APP_SHELL_BASE_CLASS}__sidebar {
  grid-row: 2;
  grid-column: 1;
  overflow-y: auto;
  border-right: 1px solid var(--mchat-border, rgba(255,255,255,0.08));
  background: var(--mchat-surface, rgba(0,0,0,0.18));
}
.${APP_SHELL_BASE_CLASS}__main {
  grid-row: 2;
  grid-column: 2;
  overflow-y: auto;
  padding: var(--mchat-space-4, 16px);
}
.${APP_SHELL_BASE_CLASS}__footer {
  grid-row: 3;
  grid-column: 1 / -1;
  padding: 8px var(--mchat-space-4, 16px);
  border-top: 1px solid var(--mchat-border, rgba(255,255,255,0.08));
  font-size: 0.78rem;
  opacity: 0.7;
}
.${APP_SHELL_BASE_CLASS}__footer[hidden] { display: none; }
.${APP_SHELL_BASE_CLASS}__scrim {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  z-index: 10;
  display: none;
}
.${APP_SHELL_BASE_CLASS}--sidebar-open .${APP_SHELL_BASE_CLASS}__scrim { display: block; }
@media (max-width: 720px) {
  .${APP_SHELL_BASE_CLASS} {
    grid-template-columns: 1fr;
  }
  .${APP_SHELL_BASE_CLASS}__hamburger { display: inline-flex; }
  .${APP_SHELL_BASE_CLASS}__sidebar {
    position: fixed;
    top: 48px;
    bottom: 0;
    left: 0;
    width: min(80vw, 320px);
    transform: translateX(-100%);
    transition: transform 200ms ease;
    z-index: 11;
  }
  .${APP_SHELL_BASE_CLASS}--sidebar-open .${APP_SHELL_BASE_CLASS}__sidebar { transform: translateX(0); }
  .${APP_SHELL_BASE_CLASS}__main { grid-column: 1; }
}
`.trim();

function appShellEnsureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(APP_SHELL_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = APP_SHELL_STYLE_ID;
  style.textContent = APP_SHELL_STYLE_CSS;
  document.head.appendChild(style);
}

function appShellResolveTarget(target) {
  if (!target || typeof document === "undefined") return null;
  return typeof target === "string" ? document.querySelector(target) : target;
}

export class AppShell {
  constructor(options = {}) {
    appShellEnsureStyles();
    this.options = options;
    this.title = options.title || "";
    this.subtitle = options.subtitle || "";
    this.sidebarWidth = options.sidebarWidth || 260;
    this.sidebarOpen = false;
    this.element = this._create();
    this.headerEl = this.element.querySelector(`.${APP_SHELL_BASE_CLASS}__header`);
    this.titleEl = this.element.querySelector(`.${APP_SHELL_BASE_CLASS}__title`);
    this.subtitleEl = this.element.querySelector(`.${APP_SHELL_BASE_CLASS}__subtitle`);
    this.headerSlot = this.element.querySelector(`.${APP_SHELL_BASE_CLASS}__header-slot`);
    this.sidebarSlot = this.element.querySelector(`.${APP_SHELL_BASE_CLASS}__sidebar`);
    this.mainSlot = this.element.querySelector(`.${APP_SHELL_BASE_CLASS}__main`);
    this.footerSlot = this.element.querySelector(`.${APP_SHELL_BASE_CLASS}__footer`);
    this.scrimEl = this.element.querySelector(`.${APP_SHELL_BASE_CLASS}__scrim`);
    this.hamburgerEl = this.element.querySelector(`.${APP_SHELL_BASE_CLASS}__hamburger`);
    if (this.hamburgerEl) this.hamburgerEl.addEventListener("click", () => this.toggleSidebar());
    if (this.scrimEl) this.scrimEl.addEventListener("click", () => this.closeSidebar());
    const mount = appShellResolveTarget(options.target);
    if (mount) mount.appendChild(this.element);
    this.render();
  }

  static mount(target, options = {}) {
    return new AppShell({ ...options, target });
  }

  setTitle(value) { this.title = value || ""; this.render(); return this; }
  setSubtitle(value) { this.subtitle = value || ""; this.render(); return this; }
  setSidebarWidth(px) {
    this.sidebarWidth = px;
    if (this.element && this.element.style) this.element.style.setProperty("--mchatai-app-shell-sidebar-w", `${px}px`);
    return this;
  }

  openSidebar() {
    this.sidebarOpen = true;
    if (this.element && this.element.classList) this.element.classList.add(`${APP_SHELL_BASE_CLASS}--sidebar-open`);
    return this;
  }
  closeSidebar() {
    this.sidebarOpen = false;
    if (this.element && this.element.classList) this.element.classList.remove(`${APP_SHELL_BASE_CLASS}--sidebar-open`);
    return this;
  }
  toggleSidebar() { return this.sidebarOpen ? this.closeSidebar() : this.openSidebar(); }

  attach(target) {
    const mount = appShellResolveTarget(target);
    if (mount) mount.appendChild(this.element);
    return this;
  }

  render() {
    if (this.element && this.element.style) this.element.style.setProperty("--mchatai-app-shell-sidebar-w", `${this.sidebarWidth}px`);
    if (this.titleEl) this.titleEl.textContent = this.title;
    if (this.subtitleEl) {
      this.subtitleEl.textContent = this.subtitle;
      this.subtitleEl.hidden = !this.subtitle;
    }
    if (this.headerEl) this.headerEl.hidden = !this.title && !this.subtitle && this.headerSlot && this.headerSlot.children.length === 0;
    return this.element;
  }

  _create() {
    if (typeof document === "undefined") {
      const stubEl = { appendChild: () => {}, addEventListener: () => {}, children: [], textContent: "", hidden: false, classList: { add: () => {}, remove: () => {}, toggle: () => {} }, style: { setProperty: () => {} } };
      return {
        querySelector: () => stubEl,
        appendChild: () => {},
        remove: () => {},
        addEventListener: () => {},
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
        style: { setProperty: () => {} }
      };
    }
    const root = document.createElement("div");
    root.className = APP_SHELL_BASE_CLASS;
    root.dataset.component = "app-shell";
    root.innerHTML = `
      <div class="${APP_SHELL_BASE_CLASS}__header">
        <button class="${APP_SHELL_BASE_CLASS}__hamburger" type="button" aria-label="Toggle sidebar">☰</button>
        <div class="${APP_SHELL_BASE_CLASS}__title-block">
          <h1 class="${APP_SHELL_BASE_CLASS}__title"></h1>
          <p class="${APP_SHELL_BASE_CLASS}__subtitle" hidden></p>
        </div>
        <div class="${APP_SHELL_BASE_CLASS}__header-slot"></div>
      </div>
      <aside class="${APP_SHELL_BASE_CLASS}__sidebar"></aside>
      <main class="${APP_SHELL_BASE_CLASS}__main"></main>
      <footer class="${APP_SHELL_BASE_CLASS}__footer" hidden></footer>
      <div class="${APP_SHELL_BASE_CLASS}__scrim"></div>
    `;
    return root;
  }
}
