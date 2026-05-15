// DataTable — sortable, clickable rows tabular display.
//
// Why this exists: expense logs, CRM contacts, invoice line items,
// crypto watchlists, leaderboards — every productivity app that shows
// rows-of-fields needs the same table affordance: column headers
// (clickable to sort), tabular-numeric alignment, hover highlight,
// optional row click handler, empty state when no data.
//
// Usage:
//   usage: bring in { DataTable } from the path ../../ui/data/DataTable.js
//   const table = new DataTable({
//     columns: [
//       { key: "date",     label: "Date",     width: 100, align: "left" },
//       { key: "category", label: "Category", width: 140 },
//       { key: "amount",   label: "Amount",   align: "right", sortable: true,
//         render: (v) => `$${Number(v).toFixed(2)}` }
//     ],
//     rows: [
//       { id: 1, date: "2026-05-15", category: "Groceries", amount: 42.10 }
//     ],
//     onRowClick: (row) => detailPane.show(row),
//     emptyText: "No expenses yet",
//     target: tableContainer
//   });
//   table.setRows(updated);
//   table.setColumns(newCols);
//
// Sorting: clicking a sortable column header toggles asc/desc. Override by
// passing initialSort: { key: "amount", dir: "desc" }.

const DT_STYLE_ID = "mchatai-data-table-styles";
const DT_BASE_CLASS = "mchatai-data-table";

const DT_STYLE_CSS = `
.${DT_BASE_CLASS} {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
  color: var(--mchat-text, #e5e7eb);
}
.${DT_BASE_CLASS}__th {
  text-align: left;
  font-weight: 600;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.6;
  padding: 8px 10px;
  border-bottom: 1px solid var(--mchat-border, rgba(255,255,255,0.10));
  background: var(--mchat-surface, rgba(255,255,255,0.02));
  position: sticky;
  top: 0;
  white-space: nowrap;
  user-select: none;
}
.${DT_BASE_CLASS}__th--sortable { cursor: pointer; }
.${DT_BASE_CLASS}__th--sortable:hover { opacity: 1; color: var(--mchat-accent, #6366f1); }
.${DT_BASE_CLASS}__sort-indicator { font-size: 0.65rem; margin-left: 4px; opacity: 0.5; }
.${DT_BASE_CLASS}__th--active .${DT_BASE_CLASS}__sort-indicator { opacity: 1; color: var(--mchat-accent, #6366f1); }
.${DT_BASE_CLASS}__th--right { text-align: right; }
.${DT_BASE_CLASS}__th--center { text-align: center; }
.${DT_BASE_CLASS}__td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--mchat-border, rgba(255,255,255,0.04));
  vertical-align: middle;
}
.${DT_BASE_CLASS}__td--right { text-align: right; font-variant-numeric: tabular-nums; }
.${DT_BASE_CLASS}__td--center { text-align: center; }
.${DT_BASE_CLASS}__tr--clickable { cursor: pointer; transition: background 100ms ease; }
.${DT_BASE_CLASS}__tr--clickable:hover .${DT_BASE_CLASS}__td { background: var(--mchat-surface2, rgba(255,255,255,0.05)); }
.${DT_BASE_CLASS}__empty {
  text-align: center;
  padding: 32px 12px;
  opacity: 0.55;
  font-size: 0.88rem;
}
`.trim();

function dtEnsureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(DT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = DT_STYLE_ID;
  style.textContent = DT_STYLE_CSS;
  document.head.appendChild(style);
}

function dtResolveTarget(target) {
  if (!target || typeof document === "undefined") return null;
  return typeof target === "string" ? document.querySelector(target) : target;
}

function dtEscapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export class DataTable {
  constructor(options = {}) {
    dtEnsureStyles();
    this.options = options;
    this.columns = Array.isArray(options.columns) ? options.columns.slice() : [];
    this.rows = Array.isArray(options.rows) ? options.rows.slice() : [];
    this.emptyText = options.emptyText || "No rows";
    this.onRowClick = options.onRowClick || null;
    this.sort = options.initialSort ? { ...options.initialSort } : { key: null, dir: "asc" };
    this.element = this._create();
    const mount = dtResolveTarget(options.target);
    if (mount) mount.appendChild(this.element);
    this.render();
  }

  static mount(target, options = {}) { return new DataTable({ ...options, target }); }

  setColumns(cols) { this.columns = Array.isArray(cols) ? cols.slice() : []; this.render(); return this; }
  setRows(rows) { this.rows = Array.isArray(rows) ? rows.slice() : []; this.render(); return this; }
  setSort(key, dir) { this.sort = { key, dir: dir || "asc" }; this.render(); return this; }

  attach(target) {
    const mount = dtResolveTarget(target);
    if (mount) mount.appendChild(this.element);
    return this;
  }
  detach() { this.element.remove(); return this; }

  _sortedRows() {
    const { key, dir } = this.sort;
    if (!key) return this.rows;
    const col = this.columns.find(c => c.key === key);
    if (!col || !col.sortable) return this.rows;
    const sign = dir === "desc" ? -1 : 1;
    return [...this.rows].sort((a, b) => {
      const av = a[key]; const bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return -1 * sign;
      if (bv == null) return 1 * sign;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * sign;
      return String(av).localeCompare(String(bv)) * sign;
    });
  }

  render() {
    if (!this.element || typeof document === "undefined") return this.element;
    this.element.innerHTML = "";
    const table = document.createElement("table");
    table.className = DT_BASE_CLASS;
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const col of this.columns) {
      const th = document.createElement("th");
      th.className = DT_BASE_CLASS + "__th";
      if (col.align === "right") th.classList.add(DT_BASE_CLASS + "__th--right");
      else if (col.align === "center") th.classList.add(DT_BASE_CLASS + "__th--center");
      if (col.width) th.style.width = typeof col.width === "number" ? `${col.width}px` : col.width;
      const isActive = this.sort.key === col.key;
      if (col.sortable) {
        th.classList.add(DT_BASE_CLASS + "__th--sortable");
        if (isActive) th.classList.add(DT_BASE_CLASS + "__th--active");
        th.innerHTML = `${dtEscapeHtml(col.label || col.key)}<span class="${DT_BASE_CLASS}__sort-indicator">${isActive ? (this.sort.dir === "desc" ? "▼" : "▲") : "↕"}</span>`;
        th.addEventListener("click", () => {
          if (this.sort.key === col.key) {
            this.sort.dir = this.sort.dir === "asc" ? "desc" : "asc";
          } else {
            this.sort = { key: col.key, dir: "asc" };
          }
          this.render();
        });
      } else {
        th.textContent = col.label || col.key;
      }
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    const rows = this._sortedRows();
    if (rows.length === 0) {
      const emptyRow = document.createElement("tr");
      const emptyTd = document.createElement("td");
      emptyTd.colSpan = this.columns.length || 1;
      emptyTd.className = DT_BASE_CLASS + "__empty";
      emptyTd.textContent = this.emptyText;
      emptyRow.appendChild(emptyTd);
      tbody.appendChild(emptyRow);
    } else {
      for (const row of rows) {
        const tr = document.createElement("tr");
        if (this.onRowClick) {
          tr.className = DT_BASE_CLASS + "__tr--clickable";
          tr.addEventListener("click", () => this.onRowClick(row, this));
        }
        for (const col of this.columns) {
          const td = document.createElement("td");
          td.className = DT_BASE_CLASS + "__td";
          if (col.align === "right") td.classList.add(DT_BASE_CLASS + "__td--right");
          else if (col.align === "center") td.classList.add(DT_BASE_CLASS + "__td--center");
          const value = row[col.key];
          if (typeof col.render === "function") {
            const out = col.render(value, row);
            if (out instanceof Node) td.appendChild(out);
            else td.innerHTML = String(out == null ? "" : out);
          } else {
            td.textContent = value == null ? "" : String(value);
          }
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
    }
    table.appendChild(tbody);
    this.element.appendChild(table);
    return this.element;
  }

  _create() {
    if (typeof document === "undefined") {
      return { appendChild: () => {}, addEventListener: () => {}, innerHTML: "", remove: () => {} };
    }
    const root = document.createElement("div");
    root.dataset.component = "data-table";
    return root;
  }
}
