import { AppShell } from "../../ui/layout/AppShell.js";
import { Modal } from "../../ui/layout/Modal.js";
import { Button } from "../../ui/forms/Button.js";
import { TextInput } from "../../ui/forms/TextInput.js";
import { DataTable } from "../../ui/data/DataTable.js";
import { DonutChart } from "../../ui/data/DonutChart.js";
import { TagChip } from "../../ui/data/TagChip.js";
import { EmptyState } from "../../ui/feedback/EmptyState.js";

const STORAGE_KEY = "spendwise.expenses";
const PALETTE = ["#10b981", "#6366f1", "#f59e0b", "#dc2626", "#06b6d4", "#a855f7", "#ec4899", "#84cc16"];

function categoryColor(name) {
  // Stable hash → palette index so the same category gets the same color
  // across DataTable chips and DonutChart slices.
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

const bridgeStorage = typeof window !== "undefined" && window.mChatAI && window.mChatAI.storage ? window.mChatAI.storage : null;
function load() {
  try {
    if (bridgeStorage) { const g = bridgeStorage.get(STORAGE_KEY); if (Array.isArray(g)) return g; }
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}
function save(list) {
  try {
    if (bridgeStorage) { bridgeStorage.set(STORAGE_KEY, list); return; }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {}
}
function uid() { return "e_" + Math.random().toString(36).slice(2, 10); }

function fmtMoney(n) { return `$${(Number(n) || 0).toFixed(2)}`; }
function monthKey(date) {
  if (typeof date === "string") return date.slice(0, 7);
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key) {
  const [y, m] = key.split("-");
  const d = new Date(parseInt(y), parseInt(m) - 1, 1);
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function safeGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
function safeSet(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }

let expenses = load();
let viewMonth = safeGet("spendwise.viewMonth") || monthKey(new Date());
function setViewMonth(k) { viewMonth = k; safeSet("spendwise.viewMonth", k); }

const shell = new AppShell({
  title: "Spendwise",
  subtitle: monthLabel(viewMonth),
  sidebarWidth: 0,
  target: document.querySelector("[data-shell-root]")
});
shell.sidebarSlot.style.display = "none";
shell.element.style.gridTemplateColumns = "1fr";

// Header controls: month nav + add button
const headerControls = document.createElement("div");
headerControls.className = "sw-header-controls";
shell.headerSlot.appendChild(headerControls);

const monthNav = document.createElement("div");
monthNav.className = "sw-month-nav";
headerControls.appendChild(monthNav);
const prevBtn = new Button({ label: "‹", variant: "ghost", size: "sm", target: monthNav, onClick: () => shiftMonth(-1) });
const monthLabelEl = document.createElement("span");
monthLabelEl.className = "sw-month-nav__label";
monthLabelEl.textContent = monthLabel(viewMonth);
monthNav.appendChild(monthLabelEl);
const nextBtn = new Button({ label: "›", variant: "ghost", size: "sm", target: monthNav, onClick: () => shiftMonth(1) });

const addBtn = new Button({
  label: "+ Add Expense",
  variant: "primary",
  size: "sm",
  target: headerControls,
  onClick: () => openAddModal()
});

function shiftMonth(delta) {
  const [y, m] = viewMonth.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  setViewMonth(monthKey(d));
  render();
}

// Summary panel
const summary = document.createElement("div");
summary.className = "sw-summary";
shell.mainSlot.appendChild(summary);

const summaryText = document.createElement("div");
summary.appendChild(summaryText);
const summaryTitleEl = document.createElement("div");
summaryTitleEl.className = "sw-summary__title";
summaryTitleEl.textContent = "This month";
summaryText.appendChild(summaryTitleEl);
const summaryAmountEl = document.createElement("div");
summaryAmountEl.className = "sw-summary__amount";
summaryText.appendChild(summaryAmountEl);
const summarySubEl = document.createElement("div");
summarySubEl.className = "sw-summary__sub";
summaryText.appendChild(summarySubEl);

const donutSlot = document.createElement("div");
summary.appendChild(donutSlot);
const donut = new DonutChart({
  data: [],
  size: 180,
  thickness: 24,
  centerLabel: "$0.00",
  centerSubtitle: "this month",
  valueFormat: (v) => fmtMoney(v),
  target: donutSlot
});

// Table area
const tableWrap = document.createElement("div");
tableWrap.className = "sw-table-wrap";
shell.mainSlot.appendChild(tableWrap);

const table = new DataTable({
  columns: [
    { key: "date", label: "Date", width: 120, sortable: true },
    { key: "category", label: "Category", width: 160, render: (v) => {
      const span = document.createElement("span");
      new TagChip({ label: v || "Uncategorized", color: categoryColor(v || "Uncategorized"), target: span });
      return span;
    } },
    { key: "note", label: "Note" },
    { key: "amount", label: "Amount", align: "right", sortable: true, width: 120, render: (v) => fmtMoney(v) },
    { key: "_actions", label: "", width: 50, align: "right", render: (_, row) => {
      const span = document.createElement("span");
      new Button({
        label: "×",
        variant: "ghost",
        size: "sm",
        target: span,
        onClick: () => {
          expenses = expenses.filter(x => x.id !== row.id);
          save(expenses);
          render();
        }
      });
      return span;
    } }
  ],
  rows: [],
  initialSort: { key: "date", dir: "desc" },
  emptyText: "No expenses this month",
  target: tableWrap
});

// Empty state
const empty = new EmptyState({
  icon: "💸",
  title: "No expenses this month",
  subtitle: "Click + Add Expense to log your first one.",
  ctaLabel: "Add expense",
  onCta: () => openAddModal(),
  target: shell.mainSlot
});

// Add modal
const modal = new Modal({ title: "Add expense", size: "sm" });
const form = document.createElement("div");
form.className = "sw-modal-form";
modal.bodySlot.appendChild(form);
const dateIn = new TextInput({ label: "Date", type: "date", value: todayISO(), target: form });
const catIn = new TextInput({ label: "Category", placeholder: "Groceries, Eat out, …", target: form });
const amountIn = new TextInput({ label: "Amount", type: "number", placeholder: "0.00", target: form });
const noteIn = new TextInput({ label: "Note (optional)", placeholder: "", target: form, onSubmit: () => save_() });
const cancelBtn = new Button({ label: "Cancel", variant: "ghost", target: modal.footerSlot, onClick: () => modal.close() });
const saveBtn = new Button({ label: "Save", variant: "primary", target: modal.footerSlot, onClick: () => save_() });

function save_() {
  const amount = parseFloat(amountIn.getValue());
  if (!Number.isFinite(amount) || amount <= 0) { amountIn.focus(); return; }
  const date = dateIn.getValue() || todayISO();
  const category = catIn.getValue().trim() || "Uncategorized";
  expenses.unshift({ id: uid(), date, category, amount, note: noteIn.getValue().trim() });
  save(expenses);
  catIn.clear(); amountIn.clear(); noteIn.clear();
  modal.close();
  render();
}

function openAddModal() {
  dateIn.setValue(todayISO());
  catIn.clear(); amountIn.clear(); noteIn.clear();
  modal.open();
  catIn.focus();
}

function monthExpenses() {
  return expenses.filter(e => monthKey(e.date) === viewMonth);
}

function render() {
  monthLabelEl.textContent = monthLabel(viewMonth);
  shell.setSubtitle(monthLabel(viewMonth));

  const rows = monthExpenses();
  const total = rows.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  summaryAmountEl.textContent = fmtMoney(total);
  summarySubEl.textContent = `${rows.length} expense${rows.length === 1 ? "" : "s"}`;

  // Group by category for donut
  const byCat = new Map();
  for (const e of rows) {
    const key = e.category || "Uncategorized";
    byCat.set(key, (byCat.get(key) || 0) + (Number(e.amount) || 0));
  }
  const donutData = [...byCat.entries()].sort((a,b) => b[1] - a[1]).map(([label, value]) => ({
    label, value, color: categoryColor(label)
  }));
  donut.setData(donutData);
  donut.setCenterLabel(fmtMoney(total));

  table.setRows(rows);

  // Toggle empty state vs table
  if (rows.length === 0) {
    tableWrap.style.display = "none";
    summary.style.display = "none";
    empty.show();
  } else {
    tableWrap.style.display = "";
    summary.style.display = "";
    empty.hide();
  }
}

render();
