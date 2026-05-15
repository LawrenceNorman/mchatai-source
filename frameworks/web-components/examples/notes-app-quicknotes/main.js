import { AppShell } from "../../ui/layout/AppShell.js";
import { TextInput } from "../../ui/forms/TextInput.js";
import { ListItem } from "../../ui/data/ListItem.js";
import { Button } from "../../ui/forms/Button.js";
import { EmptyState } from "../../ui/feedback/EmptyState.js";

const STORAGE_KEY = "quicknotes.notes";
const SELECTED_KEY = "quicknotes.selected";

const bridgeStorage = typeof window !== "undefined" && window.mChatAI && window.mChatAI.storage ? window.mChatAI.storage : null;

function load() {
  try {
    if (bridgeStorage) {
      const got = bridgeStorage.get(STORAGE_KEY);
      if (Array.isArray(got)) return got;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}
function save(notes) {
  try {
    if (bridgeStorage) { bridgeStorage.set(STORAGE_KEY, notes); return; }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch (e) {}
}
function uid() { return "n_" + Math.random().toString(36).slice(2, 10); }

let notes = load();
let selectedId = localStorage.getItem(SELECTED_KEY) || (notes[0] ? notes[0].id : null);
let query = "";

const shell = new AppShell({
  title: "Quick Notes",
  subtitle: `${notes.length} saved`,
  sidebarWidth: 280,
  target: document.querySelector("[data-shell-root]")
});

// Header slot — search input
const search = new TextInput({
  placeholder: "Search notes…",
  leadingIcon: "🔍",
  clearable: true,
  size: "sm",
  target: shell.headerSlot,
  onInput: (v) => { query = v.toLowerCase(); renderSidebar(); }
});

// Sidebar — head with + button + list
const sideHead = document.createElement("div");
sideHead.className = "qn-sidebar-head";
shell.sidebarSlot.appendChild(sideHead);

const addBtn = new Button({
  label: "+ New Note",
  variant: "primary",
  size: "sm",
  fullWidth: true,
  target: sideHead,
  onClick: () => {
    const n = { id: uid(), title: "", body: "", createdAt: Date.now() };
    notes.unshift(n);
    selectedId = n.id;
    localStorage.setItem(SELECTED_KEY, selectedId);
    save(notes);
    render();
    titleInput.focus();
  }
});

const sideList = document.createElement("ul");
sideList.className = "qn-sidebar-list";
shell.sidebarSlot.appendChild(sideList);

// Main — title input + textarea + delete
const editor = document.createElement("div");
editor.className = "qn-editor";
shell.mainSlot.appendChild(editor);

const titleRow = document.createElement("div");
titleRow.className = "qn-editor__title-row";
editor.appendChild(titleRow);

const titleInput = new TextInput({
  placeholder: "Untitled note",
  size: "lg",
  target: titleRow,
  onInput: (v) => {
    const n = currentNote();
    if (!n) return;
    n.title = v;
    save(notes);
    renderSidebar(); // update row primary text live
    shell.setSubtitle(`${notes.length} saved`);
  }
});

const delBtn = new Button({
  label: "🗑",
  variant: "ghost",
  size: "md",
  target: titleRow,
  onClick: () => {
    const n = currentNote();
    if (!n) return;
    if (typeof confirm === "function" && !confirm("Delete this note?")) return;
    notes = notes.filter(x => x.id !== n.id);
    selectedId = notes[0] ? notes[0].id : null;
    if (selectedId) localStorage.setItem(SELECTED_KEY, selectedId); else localStorage.removeItem(SELECTED_KEY);
    save(notes);
    render();
  }
});

const bodyArea = document.createElement("textarea");
bodyArea.className = "qn-editor__body";
bodyArea.placeholder = "Write here…";
editor.appendChild(bodyArea);
bodyArea.addEventListener("input", () => {
  const n = currentNote();
  if (!n) return;
  n.body = bodyArea.value;
  save(notes);
  renderSidebar();
});

const empty = new EmptyState({
  icon: "📝",
  title: "No notes yet",
  subtitle: "Click + New Note to add your first one.",
  ctaLabel: "Add note",
  onCta: () => addBtn.element.click(),
  target: shell.mainSlot
});

function currentNote() { return notes.find(n => n.id === selectedId) || null; }

function visibleNotes() {
  if (!query) return notes;
  return notes.filter(n => (n.title + " " + n.body).toLowerCase().includes(query));
}

function renderSidebar() {
  sideList.innerHTML = "";
  for (const n of visibleNotes()) {
    const row = new ListItem({
      primary: n.title || "Untitled",
      secondary: (n.body || "").slice(0, 60),
      density: "comfortable",
      active: n.id === selectedId,
      target: sideList,
      onClick: () => {
        selectedId = n.id;
        localStorage.setItem(SELECTED_KEY, selectedId);
        render();
      }
    });
  }
}

function render() {
  shell.setSubtitle(`${notes.length} saved`);
  renderSidebar();
  const n = currentNote();
  if (n) {
    editor.style.display = "";
    empty.hide();
    titleInput.setValue(n.title);
    bodyArea.value = n.body || "";
  } else {
    editor.style.display = "none";
    empty.show();
  }
}

render();
