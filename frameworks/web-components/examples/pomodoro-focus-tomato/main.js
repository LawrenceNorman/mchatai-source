import { TimerRing } from "../../ui/feedback/TimerRing.js";
import { Button } from "../../ui/forms/Button.js";
import { ListItem } from "../../ui/data/ListItem.js";
import { EmptyState } from "../../ui/feedback/EmptyState.js";

const HISTORY_KEY = "tomato.history";
const MUTED_KEY = "tomato.muted";

const MODES = [
  { name: "FOCUS",      seconds: 25 * 60, label: "Focus" },
  { name: "SHORT_BREAK", seconds: 5 * 60,  label: "Short break" },
  { name: "LONG_BREAK",  seconds: 15 * 60, label: "Long break" },
];

// Pomodoro cadence: Focus, Short, Focus, Short, Focus, Short, Focus, Long, repeat
const CYCLE = ["FOCUS", "SHORT_BREAK", "FOCUS", "SHORT_BREAK", "FOCUS", "SHORT_BREAK", "FOCUS", "LONG_BREAK"];

function todayKey() {
  const d = new Date();
  return `tomato.today.${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}
function saveHistory(h) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-50))); } catch (e) {}
}
function isMuted() { return localStorage.getItem(MUTED_KEY) === "1"; }
function setMuted(v) { try { localStorage.setItem(MUTED_KEY, v ? "1" : "0"); } catch (e) {} }

let cycleIndex = 0;
let currentMode = () => MODES.find(m => m.name === CYCLE[cycleIndex % CYCLE.length]);
let history = loadHistory();
let todaysCount = parseInt(localStorage.getItem(todayKey()) || "0", 10);

const root = document.querySelector("[data-app]");
const todayEl = root.querySelector("[data-today]");
const ringSlot = root.querySelector("[data-ring-slot]");
const controlsSlot = root.querySelector("[data-controls]");
const historyList = root.querySelector("[data-history]");
const emptySlot = root.querySelector("[data-empty-slot]");

todayEl.textContent = String(todaysCount);

const ring = new TimerRing({
  totalSeconds: currentMode().seconds,
  size: 280,
  thickness: 18,
  caption: currentMode().label.toUpperCase(),
  target: ringSlot,
  onComplete: () => {
    completeCurrentSession();
    advanceMode();
    refreshControls();
  }
});

function completeCurrentSession() {
  const mode = currentMode();
  const finishedAt = new Date();
  history.push({ mode: mode.name, finishedAt: finishedAt.toISOString() });
  saveHistory(history);
  if (mode.name === "FOCUS") {
    todaysCount += 1;
    try { localStorage.setItem(todayKey(), String(todaysCount)); } catch (e) {}
    todayEl.textContent = String(todaysCount);
  }
  beep();
  renderHistory();
}

function advanceMode() {
  cycleIndex = (cycleIndex + 1) % CYCLE.length;
  const m = currentMode();
  ring.reset(m.seconds);
  ring.setCaption(m.label.toUpperCase());
}

function beep() {
  if (isMuted()) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.connect(gain); gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.42);
  } catch (e) {}
}

function fmtTimeOfDay(iso) {
  try {
    const d = new Date(iso);
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  } catch (e) { return ""; }
}

function renderHistory() {
  historyList.innerHTML = "";
  const today = new Date().toDateString();
  const todays = history.filter(h => new Date(h.finishedAt).toDateString() === today).slice(-12);
  for (const h of todays) {
    const mode = MODES.find(m => m.name === h.mode);
    if (!mode) continue;
    new ListItem({
      primary: `${mode.label} — ${Math.floor(mode.seconds / 60)}:00`,
      secondary: fmtTimeOfDay(h.finishedAt),
      leading: mode.name === "FOCUS" ? "🍅" : "☕",
      density: "compact",
      target: historyList
    });
  }
  empty.toggle(todays.length === 0);
}

const empty = new EmptyState({
  icon: "🍅",
  title: "No sessions yet",
  subtitle: "Press Start to begin your first 25-minute focus.",
  target: emptySlot
});

let startBtn, pauseBtn, resetBtn, muteBtn;
function refreshControls() {
  controlsSlot.innerHTML = "";
  startBtn = new Button({
    label: ring.isRunning() ? "Pause" : "Start",
    variant: "primary",
    size: "lg",
    target: controlsSlot,
    onClick: () => {
      if (ring.isRunning()) {
        ring.pause();
        // tap permissions: request notification on first start in same handler
      } else {
        if (typeof Notification !== "undefined" && Notification.permission === "default") {
          try { Notification.requestPermission(); } catch (e) {}
        }
        ring.start();
      }
      refreshControls();
    }
  });
  resetBtn = new Button({
    label: "Reset",
    variant: "ghost",
    size: "lg",
    target: controlsSlot,
    onClick: () => {
      ring.reset(currentMode().seconds);
      refreshControls();
    }
  });
  muteBtn = new Button({
    label: isMuted() ? "🔇 Muted" : "🔔 Sound",
    variant: "secondary",
    size: "lg",
    target: controlsSlot,
    onClick: () => {
      setMuted(!isMuted());
      refreshControls();
    }
  });
}

refreshControls();
renderHistory();
