/*
 * deep-play-driver.js — generic deep gameplay probe (Phase PG.6 candidate)
 *
 * WHAT: drives a turn-based mini-app move-by-move inside the real probe
 * WKWebView and reports the failures that render gates and vision judges
 * cannot see: turn-stealing, "prompted but nothing actionable" wedges,
 * quota/NaN state bugs, silent auto-passes.
 *
 * HOW TO RUN (today, zero Swift): send this file's contents as the `js`
 * payload of a `diagProbeJS` tunnel command (see docs/TUNNEL_COMMANDS.md):
 *   {"command":"diagProbeJS","miniAppID":"<id>","js":"<this file>",
 *    "unmask":true,"waitMs":6000,"requestID":"deep-play-01"}
 *
 * PREFERRED CONTRACT (wisdom rule bg-playtest-debug-surface): the game
 * exposes `globalThis.<gameId>` with state getters + its event-emitting
 * turn manager. The driver auto-discovers any global with a `manager`
 * that has .on(), subscribes to turnchange/action, and asserts:
 *   INV-1  exactly one turn advance per recorded action (no turn stealing)
 *   INV-2  when the human is prompted, something actionable exists
 *          (piece to click, enabled button, or a visible pass control)
 *   INV-3  numeric HUD text never renders "NaN" / "undefined"
 *
 * SELECTOR FALLBACK: without a debug surface the driver clicks generic
 * candidates (elements with .canmove/.hint classes, then enabled buttons).
 * Adjust SELECTORS below per catalog family rather than per app.
 *
 * TIMER FAST-FORWARD: setTimeout is patched to run immediately (budget-
 * capped) so CPU turns compress into the synchronous probe pass;
 * requestAnimationFrame is queued and drained iteratively (rAF callbacks
 * cannot run while probe JS holds the thread — draining simulates frames
 * with +100ms timestamps). CAVEAT: a snapshot taken mid rAF-driven
 * animation (dice spinners) is a TRANSIENT state, not a wedge — only flag
 * a wedge if the same state repeats across consecutive drained steps.
 */
var SELECTORS = {
  actablePiece: ".cell.canmove",
  moveTarget: ".cell .hint",
  passButtons: ["marchDone", "musterDone", "endTurn", "skipBtn"],
  raidTarget: ".cell.raidable",
  restart: '[data-component="restart-overlay"] button',
  statusIds: ["status", "hintBar", "roundLabel", "chaosMeter"]
};
var out = { moves: 0, wedges: 0, turnSteals: 0, nanText: 0, log: [], errors: [] };

var stBudget = 1200;
var origST = window.setTimeout;
window.setTimeout = function (fn, ms) {
  if (stBudget > 0 && typeof fn === "function" && (ms === undefined || ms <= 3000)) {
    stBudget--; try { fn(); } catch (e) { out.errors.push("timer:" + e); } return -1;
  }
  return origST.apply(window, arguments);
};
var rafQ = [], rafBudget = 6000, rafNow = 0;
window.requestAnimationFrame = function (fn) { rafQ.push(fn); return -1; };
function drainRaf() {
  var g = 0;
  while (rafQ.length && rafBudget > 0 && g < 8000) {
    g++; rafBudget--; rafNow += 100;
    var fn = rafQ.shift();
    try { fn(rafNow); } catch (e) { out.errors.push("raf:" + e); }
  }
}

// INV-1: auto-discover a debug surface with an event-emitting manager.
var surface = null;
for (var k in globalThis) {
  try {
    var v = globalThis[k];
    if (v && typeof v === "object" && v.manager && typeof v.manager.on === "function") { surface = v; break; }
  } catch (e) { }
}
var advancesSinceAct = 0;
if (surface) {
  surface.manager.on("action", function () { advancesSinceAct = 0; });
  surface.manager.on("turnchange", function () {
    advancesSinceAct++;
    if (advancesSinceAct > 1) { out.turnSteals++; out.log.push("TURN-STEAL: " + advancesSinceAct + " advances since last action"); }
  });
}

function vis(e) { return e && !e.hidden && e.getClientRects().length > 0; }
function clk(e) { e.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); }
function hud() {
  return SELECTORS.statusIds.map(function (id) {
    var e = document.getElementById(id); return e ? e.textContent.trim() : "";
  }).join(" | ");
}
function snap(tag) {
  var h = hud();
  if (/NaN|undefined/.test(h)) { out.nanText++; tag += " [NaN-TEXT]"; }
  out.log.push(tag + " || " + h);
}

snap("start");
var lastSig = "", sameCount = 0;
for (var step = 0; step < 80; step++) {
  drainRaf();
  var ro = document.querySelector(SELECTORS.restart);
  if (ro && vis(ro)) { clk(ro); drainRaf(); snap("restart"); continue; }
  var raid = document.querySelector(SELECTORS.raidTarget);
  if (raid) { clk(raid); drainRaf(); snap("raid-placed"); continue; }
  var passed = false;
  for (var b = 0; b < SELECTORS.passButtons.length && !passed; b++) {
    var pb = document.getElementById(SELECTORS.passButtons[b]);
    if (pb && vis(pb) && pb.id !== "marchDone") { clk(pb); drainRaf(); snap("pass:" + pb.id); passed = true; }
  }
  if (passed) continue;
  var movers = Array.prototype.slice.call(document.querySelectorAll(SELECTORS.actablePiece));
  var moved = false;
  for (var i = 0; i < movers.length && !moved; i++) {
    clk(movers[i]);
    var hints = Array.prototype.slice.call(document.querySelectorAll(SELECTORS.moveTarget)).map(function (h) { return h.parentElement; });
    if (hints.length) { clk(hints[0]); drainRaf(); out.moves++; snap("move#" + out.moves); moved = true; }
  }
  if (moved) { sameCount = 0; continue; }
  var march = document.getElementById("marchDone");
  if (march && vis(march)) { clk(march); drainRaf(); snap("pass:marchDone"); continue; }
  // Nothing actionable. Transient (mid-animation) or a wedge? Require the
  // identical HUD across 3 consecutive drained steps before flagging (see
  // TIMER FAST-FORWARD caveat above).
  var sig = hud();
  if (sig === lastSig) { sameCount++; } else { sameCount = 0; lastSig = sig; }
  snap("idle");
  if (sameCount >= 2) {
    var anyButton = document.querySelector("button:not([disabled])");
    if (!anyButton) { out.wedges++; out.log.push("WEDGE: stable state, nothing actionable"); }
    break;
  }
}
out.final = { hud: hud(), surface: !!surface, stBudgetLeft: stBudget, rafBudgetLeft: rafBudget, logTail: out.log.slice(-40) };
return JSON.stringify(out);
