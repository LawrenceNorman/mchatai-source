// DonutChart — categorical breakdown SVG donut with center label + legend.
//
// Why this exists: spend-by-category, time-by-project, votes-by-option —
// the single most-requested chart type in productivity apps. Generated apps
// often reach for Chart.js or D3 (heavy deps + module loading), but a pure
// SVG donut is ~150 lines and looks great.
//
// Usage:
//   usage: bring in { DonutChart } from the path ../../ui/data/DonutChart.js
//   const donut = new DonutChart({
//     data: [
//       { label: "Groceries", value: 240.10, color: "#10b981" },
//       { label: "Eat out",   value: 92.50,  color: "#f59e0b" },
//       { label: "Transport", value: 56.20,  color: "#6366f1" }
//     ],
//     centerLabel: "$388.80",
//     centerSubtitle: "this month",
//     size: 220,
//     thickness: 28,
//     showLegend: true,
//     valueFormat: (v) => `$${v.toFixed(2)}`,
//     target: chartContainer
//   });
//   donut.setData(updated);
//   donut.setCenterLabel("$412.50");
//
// Colors are auto-assigned from a default palette if not provided per-slice.

const DC_STYLE_ID = "mchatai-donut-chart-styles";
const DC_BASE_CLASS = "mchatai-donut-chart";

const DC_STYLE_CSS = `
.${DC_BASE_CLASS} {
  display: inline-flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  color: var(--mchat-text, #e5e7eb);
}
.${DC_BASE_CLASS}__svg-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.${DC_BASE_CLASS}__center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  text-align: center;
}
.${DC_BASE_CLASS}__center-label {
  font-size: clamp(1.1rem, 4vw, 1.5rem);
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1;
}
.${DC_BASE_CLASS}__center-subtitle {
  margin-top: 4px;
  font-size: 0.72rem;
  opacity: 0.55;
}
.${DC_BASE_CLASS}__center-subtitle[hidden] { display: none; }
.${DC_BASE_CLASS}__legend {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.82rem;
  min-width: 0;
}
.${DC_BASE_CLASS}__legend[hidden] { display: none; }
.${DC_BASE_CLASS}__legend-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.${DC_BASE_CLASS}__legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex-shrink: 0;
}
.${DC_BASE_CLASS}__legend-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.${DC_BASE_CLASS}__legend-value {
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
  font-weight: 600;
}
.${DC_BASE_CLASS}__slice { transition: opacity 100ms ease; }
.${DC_BASE_CLASS}__slice:hover { opacity: 0.8; cursor: pointer; }
`.trim();

const DEFAULT_PALETTE = [
  "#6366f1", "#10b981", "#f59e0b", "#dc2626", "#06b6d4", "#a855f7", "#ec4899", "#84cc16"
];

function dcEnsureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(DC_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = DC_STYLE_ID;
  style.textContent = DC_STYLE_CSS;
  document.head.appendChild(style);
}

function dcResolveTarget(target) {
  if (!target || typeof document === "undefined") return null;
  return typeof target === "string" ? document.querySelector(target) : target;
}

function dcPolar(cx, cy, r, angle) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

function dcArcPath(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  const sOuter = dcPolar(cx, cy, rOuter, startAngle);
  const eOuter = dcPolar(cx, cy, rOuter, endAngle);
  const sInner = dcPolar(cx, cy, rInner, endAngle);
  const eInner = dcPolar(cx, cy, rInner, startAngle);
  return [
    `M ${sOuter.x} ${sOuter.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${eOuter.x} ${eOuter.y}`,
    `L ${sInner.x} ${sInner.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${eInner.x} ${eInner.y}`,
    "Z"
  ].join(" ");
}

function dcEscape(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export class DonutChart {
  constructor(options = {}) {
    dcEnsureStyles();
    this.options = options;
    this.data = Array.isArray(options.data) ? options.data.slice() : [];
    this.size = options.size || 200;
    this.thickness = options.thickness || 28;
    this.centerLabel = options.centerLabel || "";
    this.centerSubtitle = options.centerSubtitle || "";
    this.showLegend = options.showLegend !== false;
    this.valueFormat = typeof options.valueFormat === "function" ? options.valueFormat : (v) => String(v);
    this.onSliceClick = options.onSliceClick || null;
    this.element = this._create();
    const mount = dcResolveTarget(options.target);
    if (mount) mount.appendChild(this.element);
    this.render();
  }

  static mount(target, options = {}) { return new DonutChart({ ...options, target }); }

  setData(data) { this.data = Array.isArray(data) ? data.slice() : []; this.render(); return this; }
  setCenterLabel(v) { this.centerLabel = v || ""; this.render(); return this; }
  setCenterSubtitle(v) { this.centerSubtitle = v || ""; this.render(); return this; }

  attach(target) {
    const mount = dcResolveTarget(target);
    if (mount) mount.appendChild(this.element);
    return this;
  }
  detach() { this.element.remove(); return this; }

  render() {
    if (!this.element || typeof document === "undefined") return this.element;
    const total = this.data.reduce((s, d) => s + (Number(d.value) || 0), 0);
    const cx = this.size / 2, cy = this.size / 2;
    const rOuter = this.size / 2 - 2;
    const rInner = rOuter - this.thickness;
    let angle = -Math.PI / 2; // start at 12 o'clock

    let slicesSVG = "";
    if (total <= 0) {
      slicesSVG = `<circle cx="${cx}" cy="${cy}" r="${(rOuter + rInner) / 2}" fill="none" stroke="var(--mchat-surface2, rgba(255,255,255,0.08))" stroke-width="${this.thickness}" />`;
    } else {
      this.data.forEach((slice, i) => {
        const value = Number(slice.value) || 0;
        if (value <= 0) return;
        const fraction = value / total;
        // Tiny gap between slices for readability when there are >1 slices
        const gap = this.data.length > 1 ? 0.012 : 0;
        const sweep = fraction * (Math.PI * 2) - gap;
        if (sweep <= 0) { angle += fraction * (Math.PI * 2); return; }
        const color = slice.color || DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
        const path = dcArcPath(cx, cy, rOuter, rInner, angle, angle + sweep);
        slicesSVG += `<path class="${DC_BASE_CLASS}__slice" d="${path}" fill="${color}" data-slice-index="${i}"><title>${dcEscape(slice.label)}: ${dcEscape(this.valueFormat(value))}</title></path>`;
        angle += fraction * (Math.PI * 2);
      });
    }

    const svgHTML = `<svg width="${this.size}" height="${this.size}" viewBox="0 0 ${this.size} ${this.size}">${slicesSVG}</svg>`;

    let legendHTML = "";
    if (this.showLegend && this.data.length > 0) {
      legendHTML = this.data.map((slice, i) => {
        const color = slice.color || DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
        const value = Number(slice.value) || 0;
        return `
          <div class="${DC_BASE_CLASS}__legend-row" data-legend-index="${i}">
            <span class="${DC_BASE_CLASS}__legend-swatch" style="background:${color};"></span>
            <span class="${DC_BASE_CLASS}__legend-label">${dcEscape(slice.label)}</span>
            <span class="${DC_BASE_CLASS}__legend-value">${dcEscape(this.valueFormat(value))}</span>
          </div>
        `;
      }).join("");
    }

    this.element.innerHTML = `
      <div class="${DC_BASE_CLASS}__svg-wrap" style="width:${this.size}px;height:${this.size}px;">
        ${svgHTML}
        <div class="${DC_BASE_CLASS}__center">
          <div class="${DC_BASE_CLASS}__center-label">${dcEscape(this.centerLabel)}</div>
          <div class="${DC_BASE_CLASS}__center-subtitle" ${this.centerSubtitle ? "" : "hidden"}>${dcEscape(this.centerSubtitle)}</div>
        </div>
      </div>
      <div class="${DC_BASE_CLASS}__legend" ${this.showLegend && this.data.length ? "" : "hidden"}>${legendHTML}</div>
    `;

    if (this.onSliceClick) {
      const handler = (e) => {
        const target = e.target.closest("[data-slice-index], [data-legend-index]");
        if (!target) return;
        const idx = parseInt(target.getAttribute("data-slice-index") || target.getAttribute("data-legend-index"), 10);
        if (!Number.isNaN(idx) && this.data[idx]) this.onSliceClick(this.data[idx], idx, this);
      };
      this.element.addEventListener("click", handler);
    }

    return this.element;
  }

  _create() {
    if (typeof document === "undefined") {
      return { appendChild: () => {}, addEventListener: () => {}, innerHTML: "", remove: () => {} };
    }
    const root = document.createElement("div");
    root.className = DC_BASE_CLASS;
    root.dataset.component = "donut-chart";
    return root;
  }
}
