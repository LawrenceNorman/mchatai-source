import { AppShell } from "../../ui/layout/AppShell.js";
import { Column } from "../../ui/layout/Column.js";
import { Card } from "../../ui/data/Card.js";
import { Button } from "../../ui/forms/Button.js";
import { TextInput } from "../../ui/forms/TextInput.js";
import { Modal } from "../../ui/layout/Modal.js";
import { EmptyState } from "../../ui/feedback/EmptyState.js";

const STORAGE_KEY = "tasklanes.board";
const bridgeStorage = typeof window !== "undefined" && window.mChatAI && window.mChatAI.storage ? window.mChatAI.storage : null;

const DEFAULT_COLUMNS = [
  { id: "backlog", title: "Backlog", accent: "#94a3b8" },
  { id: "todo",    title: "To do",   accent: "#6366f1" },
  { id: "doing",   title: "In progress", accent: "#f59e0b" },
  { id: "done",    title: "Done",    accent: "#10b981" }
];

function load() {
  try {
    if (bridgeStorage) {
      const g = bridgeStorage.get(STORAGE_KEY);
      if (g && Array.isArray(g.columns) && Array.isArray(g.cards)) return g;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && Array.isArray(parsed.columns) && Array.isArray(parsed.cards)) return parsed;
  } catch (e) {}
  return { columns: DEFAULT_COLUMNS, cards: [] };
}
function save(state) {
  try {
    if (bridgeStorage) { bridgeStorage.set(STORAGE_KEY, state); return; }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {}
}
function uid() { return "c_" + Math.random().toString(36).slice(2, 10); }

let state = load();

const shell = new AppShell({
  title: "TaskLanes",
  subtitle: `${state.cards.length} cards`,
  sidebarWidth: 0,
  target: document.querySelector("[data-shell-root]")
});
// Hide the sidebar entirely (single-pane kanban app)
shell.sidebarSlot.style.display = "none";
shell.element.style.gridTemplateColumns = "1fr";

// Board container in main slot
const board = document.createElement("div");
board.className = "tl-board";
shell.mainSlot.style.padding = "0";
shell.mainSlot.appendChild(board);

const detailModal = new Modal({ title: "Edit card", size: "md" });
const detailForm = document.createElement("div");
detailForm.className = "tl-modal-form";
detailModal.bodySlot.appendChild(detailForm);

const detailTitle = new TextInput({ label: "Title", placeholder: "Card title", target: detailForm });
const detailDesc = document.createElement("textarea");
detailDesc.placeholder = "Description (optional)…";
detailForm.appendChild(detailDesc);

const moveBtns = document.createElement("div");
moveBtns.style.display = "flex";
moveBtns.style.gap = "6px";
moveBtns.style.flexWrap = "wrap";
detailForm.appendChild(moveBtns);

let editingCardID = null;

const cancelBtn = new Button({ label: "Cancel", variant: "ghost", target: detailModal.footerSlot, onClick: () => detailModal.close() });
const deleteBtn = new Button({ label: "Delete", variant: "danger", target: detailModal.footerSlot, onClick: () => {
  if (!editingCardID) return;
  state.cards = state.cards.filter(c => c.id !== editingCardID);
  save(state);
  detailModal.close();
  render();
}});
const saveBtn = new Button({ label: "Save", variant: "primary", target: detailModal.footerSlot, onClick: () => {
  if (!editingCardID) return;
  const c = state.cards.find(x => x.id === editingCardID);
  if (!c) return;
  c.title = detailTitle.getValue().trim() || c.title;
  c.body = detailDesc.value;
  save(state);
  detailModal.close();
  render();
}});

function openDetail(card) {
  editingCardID = card.id;
  detailTitle.setValue(card.title || "");
  detailDesc.value = card.body || "";
  // refresh move buttons
  moveBtns.innerHTML = "";
  for (const col of state.columns) {
    const isCurrent = col.id === card.columnID;
    new Button({
      label: isCurrent ? `• ${col.title}` : col.title,
      variant: isCurrent ? "primary" : "secondary",
      size: "sm",
      target: moveBtns,
      onClick: () => {
        card.columnID = col.id;
        save(state);
        // refresh modal move-state without closing
        openDetail(card);
        render();
      }
    });
  }
  detailModal.open();
}

function addCardInline(columnID, container) {
  // Inline add: TextInput + Save button row that replaces the column's footer
  container.innerHTML = "";
  const row = document.createElement("div");
  row.className = "tl-add-inline";
  const inp = new TextInput({
    placeholder: "Card title…",
    size: "sm",
    target: row,
    onSubmit: (v) => {
      const trimmed = v.trim();
      if (!trimmed) return;
      state.cards.push({ id: uid(), columnID, title: trimmed, body: "", createdAt: Date.now() });
      save(state);
      inp.clear();
      render();
    }
  });
  container.appendChild(row);
  inp.focus();
}

function render() {
  shell.setSubtitle(`${state.cards.length} cards`);
  board.innerHTML = "";

  for (const col of state.columns) {
    const colCards = state.cards.filter(c => c.columnID === col.id);
    const column = new Column({
      title: col.title,
      accent: col.accent,
      count: colCards.length,
      addLabel: "+ Add card",
      onAdd: () => addCardInline(col.id, column.footerSlot.querySelector(`.mchatai-column__add`)?.parentElement || column.footerSlot),
      target: board
    });

    if (colCards.length === 0) {
      new EmptyState({
        title: "No cards yet",
        subtitle: "Click + Add card",
        target: column.bodySlot
      });
    } else {
      for (const card of colCards) {
        new Card({
          title: card.title,
          body: card.body || "",
          onClick: () => openDetail(card),
          target: column.bodySlot
        });
      }
    }
  }
}

render();
