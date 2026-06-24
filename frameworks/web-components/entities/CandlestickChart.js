// BEGIN mchatai-web-components: entities.candlestick-chart (entities/CandlestickChart.js)

/**
 * Procedural OHLC price ENGINE + live D3 v7 candlestick RENDERER.
 *
 * Two cleanly separated pieces in one module:
 *
 *   1) OHLCGenerator - pure math/data, ZERO dependencies. A regime-driven
 *      random walk that emits realistic OHLC (open/high/low/close) candles with
 *      momentum, volatility, drift bias and occasional gap "shocks". It also
 *      tracks a rolling moving average. Optionally seed it for deterministic,
 *      replayable streams (golden QA / daily-chart mode). No DOM, no d3 - you
 *      can run it headless, in a worker, on a server, anywhere.
 *
 *   2) CandlestickChart - a thin D3 v7 RENDERER that draws an array of those
 *      candles into an <svg>: wicks + bodies (up/down colored), auto-rescaling
 *      time x-axis and price y-axis, a moving-average line, a "last price" tag,
 *      and arbitrary markers (entry lines, annotations). It uses the classic
 *      d3 enter/merge/exit join so calling render() every tick animates a live,
 *      scrolling chart cheaply.
 *
 * Why split them: the hard, reusable value is the GENERATOR (good-looking fake
 * market data is surprisingly fiddly). The renderer is convenience - if you want
 * canvas, WebGL, or your own drawing, ignore CandlestickChart and feed
 * generator.candles into your own loop. The two never reference each other.
 *
 * d3 dependency (RENDERER ONLY): d3 v7 is vendored offline as a UMD global.
 * Load it BEFORE your module script and the renderer auto-finds `globalThis.d3`:
 *   <script src="./libs/d3.min.js"></script>
 * (The WEBLIB B-catch copies the vendored build to ./libs/d3.min.js at publish
 * time - never reference a CDN URL.) You may also inject it explicitly via the
 * `d3` option (handy for tests). The OHLCGenerator needs NO d3.
 *
 * Usage (install-relative import path - copy EXACTLY; the bundled file lives
 * under ./web-components/entities/CandlestickChart.js, NOT flat under
 * ./web-components/):
 *   import { OHLCGenerator, CandlestickChart }
 *     from "./web-components/entities/CandlestickChart.js";
 *
 *   // --- DATA ---
 *   const gen = new OHLCGenerator({
 *     startPrice: 100,
 *     stepMs: 60000,                 // candle interval on the time axis
 *     regimes: [                     // optional - swap in your own regime ramp
 *       { volatility: 0.011, momentumStep: 0.05, shockChance: 0.00, drift:  0.02 },
 *       { volatility: 0.020, momentumStep: 0.10, shockChance: 0.06, drift: -0.01 },
 *       { volatility: 0.035, momentumStep: 0.16, shockChance: 0.13, drift: -0.05 },
 *     ],
 *     regimeEvery: 20,               // advance to next regime every N candles
 *     maPeriod: 5,                   // moving-average window (0 disables)
 *     // seed: 1234,                 // omit for live randomness; set for replay
 *   });
 *
 *   // --- RENDER ---
 *   const chart = new CandlestickChart({
 *     svg: document.querySelector("#chart"),  // or a CSS selector string
 *     window: 32,                    // how many trailing candles to show
 *     margin: { top: 14, right: 78, bottom: 26, left: 10 },
 *   });
 *
 *   setInterval(() => {
 *     const candle = gen.step();     // { t, o, h, l, c, ma, shock }
 *     chart.render(gen.candles, {
 *       markers: [ { type: "price", value: candle.c } ],  // optional overlays
 *     });
 *   }, 700);
 *
 * Candle shape (one object per bar):
 *   { t:Date, o:Number, h:Number, l:Number, c:Number, ma:Number|null, shock:Boolean }
 *
 * IMPORTANT: These are PLAIN JAVASCRIPT CLASSES, NOT Custom Elements. Do NOT
 * call customElements.define() on them. Do NOT use <candlestick-chart> tags in
 * HTML. Instantiate with `new` and call methods directly; the renderer draws
 * into an <svg> you provide. (See wisdom rule fs-015.)
 *
 * ============================ CONTRACTS ============================
 * OHLCGenerator
 *   constructor(options?)
 *     startPrice    Number   first open/close anchor          (default 100)
 *     stepMs        Number   ms between candles on time axis   (default 60000)
 *     startTime     Number   epoch ms of candle 0              (default Date.now())
 *     regimes       Array    [{ volatility, momentumStep, shockChance, drift }, ...]
 *     regimeEvery   Number   candles per regime before advance (default 20)
 *     maPeriod      Number   moving-average window, 0=off      (default 5)
 *     minPrice      Number   price floor clamp                 (default 1)
 *     seed          Number   optional - deterministic stream
 *   .step()                  -> next candle object (also pushes to .candles)
 *   .reset()                 -> clear stream back to startPrice/startTime
 *   .candles                 -> Array of all generated candle objects
 *   .price                   -> latest close
 *   .index                   -> number of candles generated
 *   .currentRegime()         -> the regime object in effect for the next step
 *
 * CandlestickChart
 *   constructor(options?)
 *     svg           Element|String   target <svg> (or selector)   (required)
 *     d3            Object   d3 namespace override (default globalThis.d3)
 *     window        Number   trailing candles to display       (default 32)
 *     margin        Object   { top, right, bottom, left }
 *     colors        Object   { up, down, grid, axis, ma, shockStroke }
 *     yPadFraction  Number   price-axis headroom fraction       (default 0.12)
 *     bodyWidthFraction Number  body width vs slot               (default 0.6)
 *     timeFormat    String   d3.timeFormat spec for x ticks      (default "%H:%M")
 *     priceFormat   String   d3.format spec for y ticks/tag      (default "$,.0f")
 *   .render(candles, opts?)  -> draw/refresh. opts.markers = [...] overlays:
 *        { type:"price", value, color? }  last-price tag + dashed line
 *        { type:"line",  value, color?, dash?, label? }  horizontal level
 *        { type:"point", time, value, color?, radius?, label? }  dot marker
 *   .clear()                 -> remove all drawn content
 *   .scales()                -> { x, y } the d3 scales from the last render
 * ==================================================================
 */

// ---------------------------------------------------------------------------
// Deterministic RNG (mulberry32). Used only when a numeric `seed` is supplied;
// otherwise the generator falls back to Math.random for live, non-replayable
// streams. Keep it self-contained so OHLCGenerator has zero dependencies.
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Default regime ramp: calm -> choppy -> crash. Each regime tunes how the walk
// behaves. Callers can pass any number of regimes via options.regimes.
const DEFAULT_REGIMES = [
  { volatility: 0.011, momentumStep: 0.05, shockChance: 0.00, drift:  0.02 },
  { volatility: 0.020, momentumStep: 0.10, shockChance: 0.06, drift: -0.01 },
  { volatility: 0.035, momentumStep: 0.16, shockChance: 0.13, drift: -0.05 },
];

export class OHLCGenerator {
  constructor(options = {}) {
    this.startPrice = options.startPrice ?? 100;
    this.stepMs = options.stepMs ?? 60000;
    this.startTime = options.startTime ?? Date.now();
    this.regimes = (Array.isArray(options.regimes) && options.regimes.length)
      ? options.regimes
      : DEFAULT_REGIMES;
    this.regimeEvery = options.regimeEvery ?? 20;
    this.maPeriod = options.maPeriod ?? 5;
    this.minPrice = options.minPrice ?? 1;
    this.seed = options.seed;
    this._rand = (this.seed != null) ? mulberry32(this.seed) : Math.random;
    this.reset();
  }

  reset() {
    this.candles = [];
    this.price = this.startPrice;
    this.index = 0;
    this.momentum = 0;
    if (this.seed != null) {
      this._rand = mulberry32(this.seed);
    }
  }

  // The regime that governs the NEXT step (advances every `regimeEvery` candles,
  // clamped to the last regime so the ramp tops out rather than overrunning).
  currentRegime() {
    const i = Math.min(this.regimes.length - 1, Math.floor(this.index / this.regimeEvery));
    return this.regimes[Math.max(0, i)];
  }

  // Generate the next candle: regime-driven random walk with momentum, a drift
  // bias, symmetric noise, occasional gap shocks, and randomized wicks.
  step() {
    const rng = this._rand;
    const r = this.currentRegime();
    const vol = r.volatility ?? 0.02;
    const mstep = r.momentumStep ?? 0.1;
    const shockChance = r.shockChance ?? 0;
    const drift = r.drift ?? 0;

    const prev = this.candles.length ? this.candles[this.candles.length - 1].c : this.price;

    // Mean-reverting momentum accumulator (autocorrelated drift in the walk).
    this.momentum = this.momentum * 0.85 + (rng() - 0.5) * mstep;

    // Occasional gap: the open jumps away from the previous close.
    let open = prev;
    let shock = false;
    if (rng() < shockChance) {
      shock = true;
      const dir = rng() < 0.42 ? 1 : -1;
      open = prev * (1 + dir * (0.03 + rng() * 0.06));
    }

    // Per-candle return: momentum + symmetric noise + regime drift, scaled by vol.
    const ret = this.momentum * vol * 1.3 + (rng() - 0.5) * 2 * vol + drift * vol;
    let close = open * (1 + ret);
    if (close < this.minPrice) close = this.minPrice;

    // Wicks extend beyond the body by a randomized fraction of volatility.
    const wickUp = rng() * vol * open * 0.9;
    const wickDown = rng() * vol * open * 0.9;
    const high = Math.max(open, close) + wickUp;
    const low = Math.max(this.minPrice, Math.min(open, close) - wickDown);

    const t = new Date(this.startTime + this.index * this.stepMs);
    const candle = { t, o: open, h: high, l: low, c: close, shock, ma: null };

    this.candles.push(candle);
    this.price = close;
    this.index += 1;

    // Rolling moving average over the last `maPeriod` closes.
    if (this.maPeriod > 0 && this.candles.length >= this.maPeriod) {
      const n = this.candles.length;
      let sum = 0;
      for (let i = n - this.maPeriod; i < n; i += 1) sum += this.candles[i].c;
      candle.ma = sum / this.maPeriod;
    }

    return candle;
  }
}

// Default visual palette. Override any subset via options.colors.
const DEFAULT_COLORS = {
  up: "#3bf0a8",
  down: "#ff5d6c",
  grid: "#141d27",
  axis: "#5d7187",
  axisLine: "#27323f",
  ma: "#7aa2ff",
  shockStroke: "#ffffff",
};

function resolveD3(injected) {
  const d3 = injected || (typeof globalThis !== "undefined" ? globalThis.d3 : undefined);
  if (!d3 || typeof d3.select !== "function") {
    throw new Error(
      "CandlestickChart requires d3 v7. Load it as a UMD global before this module " +
      '(<script src="./libs/d3.min.js"></script>) or pass it via the `d3` option. ' +
      "Never reference a CDN URL - d3 is vendored offline."
    );
  }
  return d3;
}

export class CandlestickChart {
  constructor(options = {}) {
    this.d3 = resolveD3(options.d3);
    const d3 = this.d3;

    const target = options.svg;
    if (!target) throw new Error("CandlestickChart needs an `svg` element or selector.");
    this.svg = (typeof target === "string") ? d3.select(target) : d3.select(target);
    if (this.svg.empty()) throw new Error("CandlestickChart: svg target not found.");

    this.window = options.window ?? 32;
    this.margin = Object.assign({ top: 14, right: 78, bottom: 26, left: 10 }, options.margin || {});
    this.colors = Object.assign({}, DEFAULT_COLORS, options.colors || {});
    this.yPadFraction = options.yPadFraction ?? 0.12;
    this.bodyWidthFraction = options.bodyWidthFraction ?? 0.6;
    this.timeFormat = options.timeFormat ?? "%H:%M";
    this.priceFormat = options.priceFormat ?? "$,.0f";

    this._lastScales = { x: null, y: null };
    this._build();
  }

  // One-time scaffold: layered groups so render() only updates, never rebuilds.
  _build() {
    const d3 = this.d3;
    const vb = this.svg.attr("viewBox");
    if (vb) {
      const parts = vb.split(/[ ,]+/).map(Number);
      this._vw = parts[2] || 1000;
      this._vh = parts[3] || 560;
    } else {
      const node = this.svg.node();
      this._vw = (node && node.clientWidth) || 1000;
      this._vh = (node && node.clientHeight) || 560;
    }

    this.svg.selectAll("*").remove();
    this.root = this.svg.append("g")
      .attr("transform", `translate(${this.margin.left},${this.margin.top})`);
    this.gGrid = this.root.append("g").attr("class", "cc-grid");
    this.gCandle = this.root.append("g").attr("class", "cc-candles");
    this.maPath = this.root.append("g").append("path")
      .attr("fill", "none")
      .attr("stroke", this.colors.ma)
      .attr("stroke-width", 2.2)
      .attr("opacity", 0.9)
      .attr("stroke-linejoin", "round");
    this.gMarkers = this.root.append("g").attr("class", "cc-markers");

    const iw = this._innerWidth();
    const ih = this._innerHeight();
    this.gXAxis = this.root.append("g").attr("class", "cc-x").attr("transform", `translate(0,${ih})`);
    this.gYAxis = this.root.append("g").attr("class", "cc-y").attr("transform", `translate(${iw},0)`);
  }

  _innerWidth() { return this._vw - this.margin.left - this.margin.right; }
  _innerHeight() { return this._vh - this.margin.top - this.margin.bottom; }

  _styleAxis(g) {
    g.selectAll("text").attr("fill", this.colors.axis).attr("font-size", 13).attr("font-family", "monospace");
    g.selectAll(".domain").attr("stroke", this.colors.axisLine);
    g.selectAll(".tick line").attr("stroke", this.colors.axisLine);
  }

  scales() { return this._lastScales; }

  clear() {
    this.gGrid.selectAll("*").remove();
    this.gCandle.selectAll("*").remove();
    this.gMarkers.selectAll("*").remove();
    this.maPath.attr("d", null);
  }

  // Draw / refresh from a candle array. Shows the trailing `window` candles,
  // auto-rescales both axes, and lays down any requested marker overlays.
  render(candles, opts = {}) {
    const d3 = this.d3;
    if (!candles || !candles.length) return;

    const iw = this._innerWidth();
    const ih = this._innerHeight();
    const vis = candles.slice(Math.max(0, candles.length - this.window));
    const stepMs = vis.length > 1
      ? (vis[vis.length - 1].t.getTime() - vis[0].t.getTime()) / (vis.length - 1)
      : 60000;

    const x = d3.scaleTime()
      .domain([
        new Date(vis[0].t.getTime() - stepMs),
        new Date(vis[vis.length - 1].t.getTime() + stepMs),
      ])
      .range([0, iw]);

    const lo = d3.min(vis, (d) => d.l);
    const hi = d3.max(vis, (d) => d.h);
    const pad = (hi - lo) * this.yPadFraction || 1;
    const y = d3.scaleLinear().domain([lo - pad, hi + pad]).range([ih, 0]).nice();

    this._lastScales = { x, y };
    const cw = Math.max(3, (iw / this.window) * this.bodyWidthFraction);

    // Horizontal price gridlines.
    const yt = y.ticks(5);
    this.gGrid.selectAll("line").data(yt).join("line")
      .attr("x1", 0).attr("x2", iw)
      .attr("y1", (d) => y(d)).attr("y2", (d) => y(d))
      .attr("stroke", this.colors.grid).attr("stroke-width", 1);

    const up = this.colors.up;
    const dn = this.colors.down;

    // Candles via enter/merge/exit join keyed by timestamp.
    const sel = this.gCandle.selectAll("g.cc-cd").data(vis, (d) => d.t.getTime());
    sel.exit().remove();
    const en = sel.enter().append("g").attr("class", "cc-cd");
    en.append("line").attr("class", "cc-wk");
    en.append("rect").attr("class", "cc-bd").attr("rx", 1);
    const all = en.merge(sel).attr("transform", (d) => `translate(${x(d.t)},0)`);

    all.select(".cc-wk")
      .attr("x1", 0).attr("x2", 0)
      .attr("y1", (d) => y(d.h)).attr("y2", (d) => y(d.l))
      .attr("stroke", (d) => (d.c >= d.o ? up : dn))
      .attr("stroke-width", 1.5);

    all.select(".cc-bd")
      .attr("x", -cw / 2).attr("width", cw)
      .attr("y", (d) => Math.min(y(d.o), y(d.c)))
      .attr("height", (d) => Math.max(1.6, Math.abs(y(d.o) - y(d.c))))
      .attr("fill", (d) => (d.c >= d.o ? up : dn))
      .attr("opacity", (d) => (d.shock ? 1 : 0.95))
      .attr("stroke", (d) => (d.shock ? this.colors.shockStroke : "none"))
      .attr("stroke-width", (d) => (d.shock ? 1.4 : 0));

    // Moving-average line (only across candles that have an ma value).
    const maData = vis.filter((d) => d.ma != null);
    const line = d3.line().x((d) => x(d.t)).y((d) => y(d.ma)).curve(d3.curveMonotoneX);
    this.maPath.attr("d", maData.length > 1 ? line(maData) : null);

    // Axes.
    this.gXAxis.call(d3.axisBottom(x).ticks(5).tickFormat(d3.timeFormat(this.timeFormat)));
    this._styleAxis(this.gXAxis);
    this.gYAxis.call(d3.axisRight(y).ticks(5).tickFormat(d3.format(this.priceFormat)));
    this._styleAxis(this.gYAxis);

    this._renderMarkers(opts.markers || [], x, y, iw, ih);
  }

  _renderMarkers(markers, x, y, iw) {
    const d3 = this.d3;
    const fmt = d3.format(this.priceFormat);
    this.gMarkers.selectAll("*").remove();

    for (const m of markers) {
      if (m == null) continue;
      const color = m.color || this.colors.up;

      if (m.type === "price") {
        const cy = y(m.value);
        this.gMarkers.append("line")
          .attr("x1", 0).attr("x2", iw).attr("y1", cy).attr("y2", cy)
          .attr("stroke", color).attr("stroke-dasharray", "2 4")
          .attr("stroke-width", 1).attr("opacity", 0.45);
        this.gMarkers.append("rect")
          .attr("x", iw).attr("y", cy - 11)
          .attr("width", this.margin.right).attr("height", 22)
          .attr("fill", color).attr("opacity", 0.2).attr("rx", 3);
        this.gMarkers.append("text")
          .attr("x", iw + this.margin.right / 2).attr("y", cy + 4)
          .attr("text-anchor", "middle").attr("fill", color)
          .attr("font-size", 13).attr("font-weight", 700).attr("font-family", "monospace")
          .text(fmt(m.value));
      } else if (m.type === "line") {
        const ly = y(m.value);
        this.gMarkers.append("line")
          .attr("x1", 0).attr("x2", iw).attr("y1", ly).attr("y2", ly)
          .attr("stroke", color).attr("stroke-dasharray", m.dash || "7 5")
          .attr("stroke-width", 1.7).attr("opacity", 0.9);
        if (m.label) {
          this.gMarkers.append("text")
            .attr("x", 6).attr("y", ly - 9).attr("fill", color)
            .attr("font-size", 13).attr("font-weight", 700).attr("font-family", "monospace")
            .text(m.label);
        }
      } else if (m.type === "point") {
        const px = Math.max(0, Math.min(iw, x(m.time instanceof Date ? m.time : new Date(m.time))));
        const py = y(m.value);
        this.gMarkers.append("circle")
          .attr("cx", px).attr("cy", py).attr("r", m.radius || 6).attr("fill", color);
        if (m.label) {
          this.gMarkers.append("text")
            .attr("x", px + 8).attr("y", py - 8).attr("fill", color)
            .attr("font-size", 13).attr("font-weight", 700).attr("font-family", "monospace")
            .text(m.label);
        }
      }
    }
  }
}

// END mchatai-web-components: entities.candlestick-chart
