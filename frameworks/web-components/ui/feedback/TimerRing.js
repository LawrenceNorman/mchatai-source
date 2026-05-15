// TimerRing — circular countdown / progress display.
//
// Why this exists: Pomodoro, habit-rest, exercise countdowns, daily-streak
// progress — every productivity app that tracks elapsed time wants the same
// affordance: a big circular ring that fills as time passes, with the
// remaining seconds rendered in the middle. Without shared lego, generated
// apps each invent slightly broken SVG arc math.
//
// Usage:
//   usage: bring in { TimerRing } from the path ../../ui/feedback/TimerRing.js
//   const ring = new TimerRing({
//     totalSeconds: 25 * 60,
//     size: 240,                   // outer pixel size
//     thickness: 18,
//     accent: "#6366f1",
//     onTick: (remaining) => updateTabTitle(remaining),
//     onComplete: () => { audio.ding(); store.recordSession(); }
//   });
//   ring.start();    // begins ticking via internal interval
//   ring.pause();
//   ring.reset();
//   ring.setTotal(5 * 60);          // switch to break
//
// Self-pacing: TimerRing owns its own setInterval. If you want external
// driving (e.g., delta-time from a game loop), use `setRemaining(seconds)`
// and skip start()/pause().

const TIMER_RING_STYLE_ID = "mchatai-timer-ring-styles";
const TIMER_RING_BASE_CLASS = "mchatai-timer-ring";

const TIMER_RING_STYLE_CSS = `
.${TIMER_RING_BASE_CLASS} {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--mchat-text, #e5e7eb);
}
.${TIMER_RING_BASE_CLASS}__svg {
  transform: rotate(-90deg);
  display: block;
}
.${TIMER_RING_BASE_CLASS}__track {
  fill: none;
  stroke: var(--mchat-surface2, rgba(255,255,255,0.08));
}
.${TIMER_RING_BASE_CLASS}__progress {
  fill: none;
  stroke: var(--mchat-accent, #6366f1);
  stroke-linecap: round;
  transition: stroke-dashoffset 200ms linear;
}
.${TIMER_RING_BASE_CLASS}__label {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  text-align: center;
}
.${TIMER_RING_BASE_CLASS}__time {
  font-variant-numeric: tabular-nums;
  font-size: clamp(1.6rem, 6vw, 2.8rem);
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1;
}
.${TIMER_RING_BASE_CLASS}__caption {
  font-size: 0.78rem;
  opacity: 0.65;
  margin-top: 6px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.${TIMER_RING_BASE_CLASS}__caption[hidden] { display: none; }
.${TIMER_RING_BASE_CLASS}--complete .${TIMER_RING_BASE_CLASS}__progress { stroke: var(--mchat-success, #10b981); }
.${TIMER_RING_BASE_CLASS}--paused .${TIMER_RING_BASE_CLASS}__time { opacity: 0.6; }
`.trim();

function timerRingEnsureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(TIMER_RING_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = TIMER_RING_STYLE_ID;
  style.textContent = TIMER_RING_STYLE_CSS;
  document.head.appendChild(style);
}

function timerRingResolveTarget(target) {
  if (!target || typeof document === "undefined") return null;
  return typeof target === "string" ? document.querySelector(target) : target;
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export class TimerRing {
  constructor(options = {}) {
    timerRingEnsureStyles();
    this.options = options;
    this.totalSeconds = options.totalSeconds || 25 * 60;
    this.remaining = options.remaining ?? this.totalSeconds;
    this.size = options.size || 240;
    this.thickness = options.thickness || 18;
    this.caption = options.caption || "";
    this.onTick = options.onTick || null;
    this.onComplete = options.onComplete || null;
    this.running = false;
    this._tickerID = null;
    this._lastTickAt = 0;
    this.element = this._create();
    this.trackEl = this.element.querySelector(`.${TIMER_RING_BASE_CLASS}__track`);
    this.progressEl = this.element.querySelector(`.${TIMER_RING_BASE_CLASS}__progress`);
    this.timeEl = this.element.querySelector(`.${TIMER_RING_BASE_CLASS}__time`);
    this.captionEl = this.element.querySelector(`.${TIMER_RING_BASE_CLASS}__caption`);
    const mount = timerRingResolveTarget(options.target);
    if (mount) mount.appendChild(this.element);
    this.render();
  }

  static mount(target, options = {}) {
    return new TimerRing({ ...options, target });
  }

  start() {
    if (this.running) return this;
    if (this.remaining <= 0) this.remaining = this.totalSeconds;
    this.running = true;
    this._lastTickAt = Date.now();
    this._tickerID = setInterval(() => this._tick(), 250);
    if (this.element && this.element.classList) this.element.classList.remove(`${TIMER_RING_BASE_CLASS}--paused`);
    return this;
  }

  pause() {
    this.running = false;
    if (this._tickerID) clearInterval(this._tickerID);
    this._tickerID = null;
    if (this.element && this.element.classList) this.element.classList.add(`${TIMER_RING_BASE_CLASS}--paused`);
    return this;
  }

  reset(totalSeconds) {
    this.pause();
    if (typeof totalSeconds === "number") this.totalSeconds = totalSeconds;
    this.remaining = this.totalSeconds;
    if (this.element && this.element.classList) this.element.classList.remove(`${TIMER_RING_BASE_CLASS}--complete`);
    this.render();
    return this;
  }

  setTotal(seconds) {
    const wasFull = this.remaining === this.totalSeconds;
    this.totalSeconds = seconds;
    if (wasFull) this.remaining = seconds;
    this.render();
    return this;
  }

  setRemaining(seconds) {
    this.remaining = Math.max(0, seconds);
    this.render();
    if (this.remaining === 0 && typeof this.onComplete === "function") {
      this.pause();
      if (this.element && this.element.classList) this.element.classList.add(`${TIMER_RING_BASE_CLASS}--complete`);
      this.onComplete(this);
    }
    return this;
  }

  setCaption(text) {
    this.caption = text || "";
    if (this.captionEl) {
      this.captionEl.textContent = this.caption;
      this.captionEl.hidden = !this.caption;
    }
    return this;
  }

  isRunning() { return this.running; }
  getRemaining() { return this.remaining; }

  attach(target) {
    const mount = timerRingResolveTarget(target);
    if (mount) mount.appendChild(this.element);
    return this;
  }

  detach() {
    this.pause();
    this.element.remove();
    return this;
  }

  render() {
    if (!this.element) return null;
    const radius = (this.size - this.thickness) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = this.totalSeconds > 0 ? this.remaining / this.totalSeconds : 0;
    const offset = circumference * (1 - progress);
    if (this.trackEl) {
      this.trackEl.setAttribute("r", String(radius));
      this.trackEl.setAttribute("cx", String(this.size / 2));
      this.trackEl.setAttribute("cy", String(this.size / 2));
      this.trackEl.setAttribute("stroke-width", String(this.thickness));
    }
    if (this.progressEl) {
      this.progressEl.setAttribute("r", String(radius));
      this.progressEl.setAttribute("cx", String(this.size / 2));
      this.progressEl.setAttribute("cy", String(this.size / 2));
      this.progressEl.setAttribute("stroke-width", String(this.thickness));
      this.progressEl.setAttribute("stroke-dasharray", String(circumference));
      this.progressEl.setAttribute("stroke-dashoffset", String(offset));
    }
    if (this.timeEl) this.timeEl.textContent = formatTime(this.remaining);
    if (this.captionEl) {
      this.captionEl.textContent = this.caption;
      this.captionEl.hidden = !this.caption;
    }
    if (this.element.style) {
      this.element.style.width = `${this.size}px`;
      this.element.style.height = `${this.size}px`;
    }
    const svg = this.element.querySelector("svg");
    if (svg) {
      svg.setAttribute("width", String(this.size));
      svg.setAttribute("height", String(this.size));
      svg.setAttribute("viewBox", `0 0 ${this.size} ${this.size}`);
    }
    return this.element;
  }

  _tick() {
    if (!this.running) return;
    const now = Date.now();
    const elapsed = (now - this._lastTickAt) / 1000;
    this._lastTickAt = now;
    this.setRemaining(this.remaining - elapsed);
    if (typeof this.onTick === "function") this.onTick(this.remaining, this);
  }

  _create() {
    if (typeof document === "undefined") {
      return {
        querySelector: () => ({ setAttribute: () => {}, textContent: "", hidden: false }),
        appendChild: () => {},
        remove: () => {},
        classList: { add: () => {}, remove: () => {} },
        style: {}
      };
    }
    const root = document.createElement("div");
    root.className = TIMER_RING_BASE_CLASS;
    root.dataset.component = "timer-ring";
    root.style.width = `${this.size}px`;
    root.style.height = `${this.size}px`;
    root.innerHTML = `
      <svg class="${TIMER_RING_BASE_CLASS}__svg" width="${this.size}" height="${this.size}" viewBox="0 0 ${this.size} ${this.size}">
        <circle class="${TIMER_RING_BASE_CLASS}__track" cx="${this.size / 2}" cy="${this.size / 2}" r="${(this.size - this.thickness) / 2}" stroke-width="${this.thickness}" />
        <circle class="${TIMER_RING_BASE_CLASS}__progress" cx="${this.size / 2}" cy="${this.size / 2}" r="${(this.size - this.thickness) / 2}" stroke-width="${this.thickness}" />
      </svg>
      <div class="${TIMER_RING_BASE_CLASS}__label">
        <div class="${TIMER_RING_BASE_CLASS}__time">${formatTime(this.remaining)}</div>
        <div class="${TIMER_RING_BASE_CLASS}__caption" ${this.caption ? "" : "hidden"}>${escapeHtml(this.caption)}</div>
      </div>
    `;
    return root;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
