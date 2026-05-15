import { Button } from "../../ui/forms/Button.js";
import { TextInput } from "../../ui/forms/TextInput.js";
import { Checkbox } from "../../ui/forms/Checkbox.js";
import { ListItem } from "../../ui/data/ListItem.js";
import { EmptyState } from "../../ui/feedback/EmptyState.js";

// TaskFlow — Todoist-style todo list golden assembly.
// Composes the productivity foundation Lego: Button + TextInput +
// Checkbox + ListItem + EmptyState. Persists to localStorage.

const STORAGE_KEY = "taskflow.tasks";
const FILTER_KEY = "taskflow.filter";

const bridgeStorage = typeof window !== "undefined" && window.mChatAI && window.mChatAI.storage ? window.mChatAI.storage : null;

function loadTasks() {
  try {
    if (bridgeStorage && typeof bridgeStorage.get === "function") {
      const got = bridgeStorage.get(STORAGE_KEY);
      if (Array.isArray(got)) return got;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveTasks(tasks) {
  try {
    if (bridgeStorage && typeof bridgeStorage.set === "function") {
      bridgeStorage.set(STORAGE_KEY, tasks);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (e) {
    /* offline / permissions — ignore */
  }
}

function loadFilter() {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (raw === "active" || raw === "done") return raw;
  } catch (e) {}
  return "all";
}

function saveFilter(filter) {
  try { localStorage.setItem(FILTER_KEY, filter); } catch (e) {}
}

function uid() {
  return "t_" + Math.random().toString(36).slice(2, 10);
}

// State
let tasks = loadTasks();
let filter = loadFilter();

// Mounts
const root = document.querySelector("[data-app]");
const addSlot = root.querySelector("[data-add-slot]");
const filterSlot = root.querySelector("[data-filter-slot]");
const listEl = root.querySelector("[data-list]");
const emptySlot = root.querySelector("[data-empty-slot]");
const countEl = root.querySelector("[data-count]");
const clearSlot = root.querySelector("[data-clear-slot]");

// Add task input (Enter to add)
const addInput = new TextInput({
  placeholder: "What needs to be done?",
  size: "lg",
  clearable: false,
  leadingIcon: "✚",
  target: addSlot,
  onSubmit: (value, input) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    tasks.push({ id: uid(), title: trimmed, done: false, createdAt: Date.now() });
    saveTasks(tasks);
    input.clear();
    input.focus();
    render();
  }
});

// Filter buttons
const filterBtns = {};
function makeFilter(key, label) {
  const btn = new Button({
    label,
    variant: filter === key ? "primary" : "ghost",
    size: "sm",
    target: filterSlot,
    onClick: () => {
      filter = key;
      saveFilter(filter);
      render();
    }
  });
  filterBtns[key] = btn;
}
makeFilter("all", "All");
makeFilter("active", "Active");
makeFilter("done", "Done");

// Empty state
const empty = new EmptyState({
  icon: "✅",
  title: "No tasks yet",
  subtitle: "Type above and press Enter to add your first task.",
  target: emptySlot
});

// Clear completed button (only visible when there are completed tasks)
const clearBtn = new Button({
  label: "Clear completed",
  variant: "ghost",
  size: "sm",
  target: clearSlot,
  onClick: () => {
    tasks = tasks.filter(t => !t.done);
    saveTasks(tasks);
    render();
  }
});

function visibleTasks() {
  if (filter === "active") return tasks.filter(t => !t.done);
  if (filter === "done") return tasks.filter(t => t.done);
  return tasks;
}

function render() {
  // Filter button variants
  for (const k of Object.keys(filterBtns)) {
    filterBtns[k].setVariant(k === filter ? "primary" : "ghost");
  }

  // List rows
  listEl.innerHTML = "";
  const rows = visibleTasks();
  for (const t of rows) {
    const cb = new Checkbox({
      label: "",
      checked: t.done,
      strikeOnCheck: false,
      onChange: (checked) => {
        t.done = checked;
        saveTasks(tasks);
        render();
      }
    });
    const del = new Button({
      label: "×",
      variant: "ghost",
      size: "sm",
      onClick: () => {
        tasks = tasks.filter(x => x.id !== t.id);
        saveTasks(tasks);
        render();
      }
    });
    const row = new ListItem({
      primary: t.title,
      leading: cb.element,
      trailing: del.element,
      density: "comfortable",
      multiline: true,
      target: listEl
    });
    if (t.done) {
      row.element.style.opacity = "0.55";
      const p = row.element.querySelector(".mchatai-list-item__primary");
      if (p) p.style.textDecoration = "line-through";
    }
  }

  // Empty state visibility
  empty.toggle(rows.length === 0);

  // Counter
  const left = tasks.filter(t => !t.done).length;
  countEl.textContent = `${left} task${left === 1 ? "" : "s"} left`;

  // Clear-completed visibility
  const anyDone = tasks.some(t => t.done);
  clearBtn.element.style.display = anyDone ? "" : "none";
}

render();
addInput.focus();
