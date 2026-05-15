import { AppShell } from "../../ui/layout/AppShell.js";
import { Modal } from "../../ui/layout/Modal.js";
import { Button } from "../../ui/forms/Button.js";
import { TextInput } from "../../ui/forms/TextInput.js";
import { ListItem } from "../../ui/data/ListItem.js";
import { EmptyState } from "../../ui/feedback/EmptyState.js";

const STORAGE_KEY = "bookshelf.bookmarks";
const ALL_TAG = "__all__";

const bridgeStorage = typeof window !== "undefined" && window.mChatAI && window.mChatAI.storage ? window.mChatAI.storage : null;

function load() {
  try {
    if (bridgeStorage) { const g = bridgeStorage.get(STORAGE_KEY); if (Array.isArray(g)) return g; }
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}
function save(items) {
  try {
    if (bridgeStorage) { bridgeStorage.set(STORAGE_KEY, items); return; }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {}
}
function uid() { return "b_" + Math.random().toString(36).slice(2, 10); }
function parseHost(url) {
  try { return new URL(url).hostname; } catch (e) { return url.replace(/^https?:\/\//, "").split("/")[0] || url; }
}
function faviconHTML(host) {
  if (!host) return "<span class=\"bsh-favicon\">🔗</span>";
  return `<span class="bsh-favicon"><img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64" alt="" onerror="this.style.display='none'; this.parentElement.textContent='🔗';"/></span>`;
}

let bookmarks = load();
let activeTag = ALL_TAG;
let query = "";

const shell = new AppShell({
  title: "Bookshelf",
  subtitle: `${bookmarks.length} saved`,
  sidebarWidth: 220,
  target: document.querySelector("[data-shell-root]")
});

// Header — search + add
const headerControls = document.createElement("div");
headerControls.className = "bsh-header-controls";
shell.headerSlot.appendChild(headerControls);

const search = new TextInput({
  placeholder: "Search bookmarks…",
  leadingIcon: "🔍",
  size: "sm",
  clearable: true,
  target: headerControls,
  onInput: (v) => { query = v.toLowerCase(); renderGrid(); }
});

const addBtn = new Button({
  label: "+ Add Bookmark",
  variant: "primary",
  size: "sm",
  target: headerControls,
  onClick: () => openAddModal()
});

// Sidebar — tag list
const tagList = document.createElement("ul");
tagList.className = "bsh-tags";
shell.sidebarSlot.appendChild(tagList);

// Main — grid + empty
const grid = document.createElement("ul");
grid.className = "bsh-grid";
shell.mainSlot.appendChild(grid);

const empty = new EmptyState({
  icon: "🔖",
  title: "No bookmarks yet",
  subtitle: "Click + Add Bookmark to save your first link.",
  ctaLabel: "Add bookmark",
  onCta: () => openAddModal(),
  target: shell.mainSlot
});

// Add Modal
const modal = new Modal({ title: "Add bookmark", size: "sm" });
const form = document.createElement("div");
form.className = "bsh-modal-form";
modal.bodySlot.appendChild(form);

const labelIn = new TextInput({ label: "Title", placeholder: "e.g. The Verge", target: form });
const urlIn = new TextInput({ label: "URL", placeholder: "https://example.com", target: form, onSubmit: () => save_(), type: "url" });
const tagsIn = new TextInput({ label: "Tags (comma-separated)", placeholder: "news, tech", target: form });

const cancelBtn = new Button({ label: "Cancel", variant: "ghost", target: modal.footerSlot, onClick: () => modal.close() });
const saveBtn = new Button({ label: "Save", variant: "primary", target: modal.footerSlot, onClick: () => save_() });

function save_() {
  const url = urlIn.getValue().trim();
  const label = labelIn.getValue().trim();
  if (!url) { urlIn.focus(); return; }
  const host = parseHost(url);
  const tags = tagsIn.getValue().split(",").map(t => t.trim()).filter(Boolean);
  bookmarks.unshift({ id: uid(), title: label || host, url, host, tags, createdAt: Date.now() });
  save(bookmarks);
  labelIn.clear(); urlIn.clear(); tagsIn.clear();
  modal.close();
  render();
}

function openAddModal() {
  labelIn.clear(); urlIn.clear(); tagsIn.clear();
  modal.open();
  labelIn.focus();
}

function allTags() {
  const counts = new Map();
  for (const b of bookmarks) {
    for (const t of (b.tags || [])) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function visibleBookmarks() {
  let xs = bookmarks;
  if (activeTag !== ALL_TAG) xs = xs.filter(b => (b.tags || []).includes(activeTag));
  if (query) xs = xs.filter(b => ((b.title || "") + " " + (b.host || "") + " " + (b.tags || []).join(" ")).toLowerCase().includes(query));
  return xs;
}

function renderTagSidebar() {
  tagList.innerHTML = "";
  const tags = allTags();
  const allRow = new ListItem({
    primary: "All",
    secondary: `${bookmarks.length}`,
    leading: "•",
    active: activeTag === ALL_TAG,
    density: "compact",
    target: tagList,
    onClick: () => { activeTag = ALL_TAG; render(); }
  });
  for (const [t, c] of tags) {
    new ListItem({
      primary: t,
      secondary: `${c}`,
      leading: "#",
      active: activeTag === t,
      density: "compact",
      target: tagList,
      onClick: () => { activeTag = t; render(); }
    });
  }
}

function renderGrid() {
  grid.innerHTML = "";
  const xs = visibleBookmarks();
  for (const b of xs) {
    const del = new Button({
      label: "×",
      variant: "ghost",
      size: "sm",
      onClick: () => {
        bookmarks = bookmarks.filter(x => x.id !== b.id);
        save(bookmarks);
        render();
      }
    });
    const tagHtml = (b.tags || []).map(t => `<span class="bsh-tagchip">${t.replace(/[<>&"']/g, "")}</span>`).join("");
    const row = new ListItem({
      primary: b.title || b.host,
      secondary: b.host,
      leading: faviconHTML(b.host),
      trailing: del.element,
      multiline: true,
      target: grid,
      onClick: () => {
        if (typeof window !== "undefined" && b.url) window.open(b.url, "_blank", "noopener");
      }
    });
    if (tagHtml) {
      const chips = document.createElement("div");
      chips.className = "bsh-tagchips";
      chips.innerHTML = tagHtml;
      row.element.querySelector(".mchatai-list-item__text").appendChild(chips);
    }
  }
  empty.toggle(xs.length === 0);
}

function render() {
  shell.setSubtitle(`${bookmarks.length} saved`);
  renderTagSidebar();
  renderGrid();
}

render();
