// BEGIN mchatai-web-components: entities.incremental-economy (entities/IncrementalEconomy.js)
//
// PLAIN JS CLASS — NOT A WEB CUSTOM ELEMENT.
// DO NOT call customElements.define() on this class.
// DO NOT use <incrementaleconomy-foo> tags in HTML.
// Instantiate with `new` and call methods. YOU draw the UI.
// See wisdom rule fs-015 for the full pattern + worked examples.
//

/**
 * IncrementalEconomy — a self-contained idle / incremental ("clicker") economy
 * engine. Powers AdVenture-Capitalist / Cookie-Clicker-style games: a set of
 * income-producing units that you buy, level up, automate with managers, and
 * periodically reset ("prestige") for a permanent multiplier.
 *
 * Rendering-agnostic and dependency-free. The class owns ALL the math and game
 * state; the caller owns ALL drawing. Drive a fixed-step or rAF loop by calling
 * tick(dtMs) every frame, then read the unit/state getters to repaint.
 *
 * Mechanics (all configurable):
 *   - Units (businesses/generators). Each has a base cost, base revenue, and a
 *     production cycle time. Buying +1 level multiplies the next cost by
 *     costGrowth (default 1.15) — the classic exponential idle curve. Revenue
 *     scales linearly with level and by per-unit upgrade multipliers.
 *   - A cycle: when a unit is "running" its progress fills over cycleTimeMs;
 *     on completion it pays out revenue. Without a manager it stops after one
 *     cycle (manual click to re-run); with a manager it auto-loops forever.
 *   - Upgrades: one-shot purchases that apply a permanent multiplier to one
 *     unit's revenue (or to all units when targetIndex is null/"all").
 *   - Prestige: reset all units, money, and upgrades in exchange for prestige
 *     tokens earned from lifetime earnings (sqrt curve). Each token grants a
 *     permanent global earnings multiplier (default +2%/token).
 *   - Save/load: validated JSON serialization to any storage (localStorage by
 *     default). Corrupt/old saves fall back to a fresh state, never throw.
 *
 * Pure math (cost / revenue / prestige-gain) is exposed as static-ish instance
 * helpers so a renderer can preview "what if" costs without mutating state.
 *
 * Usage:
 *   import { IncrementalEconomy } from "./IncrementalEconomy.js";
 *   const econ = new IncrementalEconomy({
 *     startingMoney: 5,
 *     costGrowth: 1.15,
 *     prestigeBonusPerToken: 0.02,
 *     units: [
 *       { id: "stand",   baseCost: 4,    baseRevenue: 1,    cycleTimeMs: 1000 },
 *       { id: "paper",   baseCost: 60,   baseRevenue: 60,   cycleTimeMs: 3000 },
 *       { id: "wash",    baseCost: 720,  baseRevenue: 540,  cycleTimeMs: 6000 },
 *       // ...add as many tiers as you like
 *     ],
 *     upgrades: [
 *       { id: "golden", targetIndex: 0, mult: 3, cost: 500 },
 *       { id: "global", targetIndex: "all", mult: 2, cost: 1e6 },
 *     ],
 *     storageKey: "mygame_save",
 *   });
 *   econ.load();                        // restore prior session (no-op if none)
 *   econ.buyUnit(0);                    // purchase / level up unit 0
 *   econ.run(0);                        // start one manual cycle
 *   econ.hireManager(0);               // automate unit 0 forever
 *   econ.buyUpgrade("golden");          // apply an upgrade
 *   // in your loop:
 *   function frame(now){ econ.tick(now - last); last = now; repaint(); requestAnimationFrame(frame); }
 *   // periodically:
 *   setInterval(() => econ.save(), 5000);
 *   // prestige when ready:
 *   if (econ.prestigeGain() >= 1) econ.prestige();
 *
 * Events (optional callbacks, all no-op by default):
 *   onPayout(unitIndex, amount, econ)   — a unit completed a cycle and paid out
 *   onPurchase(kind, ref, econ)         — "unit" | "upgrade" | "manager" bought
 *   onPrestige(tokensGained, econ)      — a prestige reset occurred
 */

const DEFAULT_UNITS = [
  { id: "tier1", baseCost: 4, baseRevenue: 1, cycleTimeMs: 1000 },
  { id: "tier2", baseCost: 60, baseRevenue: 60, cycleTimeMs: 3000 },
  { id: "tier3", baseCost: 720, baseRevenue: 540, cycleTimeMs: 6000 },
  { id: "tier4", baseCost: 8640, baseRevenue: 4320, cycleTimeMs: 12000 },
  { id: "tier5", baseCost: 103680, baseRevenue: 51840, cycleTimeMs: 24000 },
  { id: "tier6", baseCost: 1244160, baseRevenue: 622080, cycleTimeMs: 48000 }
];

export class IncrementalEconomy {
  constructor(options = {}) {
    // --- Static configuration (the "design", never serialized) ---
    const defs = Array.isArray(options.units) && options.units.length > 0
      ? options.units
      : DEFAULT_UNITS.slice();
    this.units = defs.map((u, i) => ({
      id: u.id ?? `unit${i}`,
      baseCost: Number(u.baseCost) || 1,
      baseRevenue: Number(u.baseRevenue) || 1,
      cycleTimeMs: Number(u.cycleTimeMs) || 1000,
      // Cost of this unit's manager. Either explicit, or derived as a multiple
      // of baseCost scaled by tier index (matches the AdVenture-Capitalist feel).
      managerCost: u.managerCost != null
        ? Number(u.managerCost)
        : Math.floor((Number(u.baseCost) || 1) * 15 * (i + 1))
    }));

    this.upgrades = (Array.isArray(options.upgrades) ? options.upgrades : []).map((u, i) => ({
      id: u.id ?? `upgrade${i}`,
      // Index into this.units, OR "all"/null to multiply every unit's revenue.
      targetIndex: (u.targetIndex === "all" || u.targetIndex == null) ? "all" : Number(u.targetIndex),
      mult: Number(u.mult) || 1,
      cost: Number(u.cost) || 0
    }));

    this.costGrowth = Number(options.costGrowth) || 1.15;        // exponential per-level cost factor
    this.startingMoney = Number(options.startingMoney) || 0;
    this.prestigeBonusPerToken = Number(options.prestigeBonusPerToken) || 0.02; // +2%/token by default
    // prestigeGain = floor(prestigeScale * sqrt(lifetimeEarnings / prestigeThreshold)) - claimedTokens
    this.prestigeScale = Number(options.prestigeScale) || 150;
    this.prestigeThreshold = Number(options.prestigeThreshold) || 1e13;

    this.storage = options.storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
    this.storageKey = options.storageKey || "incremental_economy_save";

    this.onPayout = typeof options.onPayout === "function" ? options.onPayout : null;
    this.onPurchase = typeof options.onPurchase === "function" ? options.onPurchase : null;
    this.onPrestige = typeof options.onPrestige === "function" ? options.onPrestige : null;

    // --- Mutable state (this IS what gets serialized) ---
    this.state = this._freshState();
  }

  _freshState() {
    return {
      money: this.startingMoney,
      lifetimeEarnings: 0,
      // Total prestige tokens currently held (drives the global multiplier).
      prestigeTokens: 0,
      // Total tokens ever claimed (used so prestigeGain() doesn't double-count).
      prestigeClaimed: 0,
      units: this.units.map(() => ({
        level: 0,
        running: false,
        progress: 0,        // ms elapsed in the current cycle
        hasManager: false,
        upgradeMult: 1      // product of all upgrades applied to this unit
      })),
      purchasedUpgrades: []  // array of upgrade ids
    };
  }

  // ---- Pure math helpers (no mutation; safe for "what-if" previews) ----

  /** Cost to buy the next level of unit `i` given its current level. */
  unitCost(i, atLevel) {
    const u = this.units[i];
    const lvl = atLevel != null ? atLevel : this.state.units[i].level;
    return Math.floor(u.baseCost * Math.pow(this.costGrowth, lvl));
  }

  /** Global multiplier from prestige tokens: 1 + tokens * bonusPerToken. */
  prestigeMultiplier() {
    return 1 + this.state.prestigeTokens * this.prestigeBonusPerToken;
  }

  /** Revenue paid out per completed cycle of unit `i` (0 if unowned). */
  unitRevenue(i) {
    const u = this.units[i];
    const s = this.state.units[i];
    if (s.level === 0) return 0;
    return u.baseRevenue * s.level * s.upgradeMult * this.prestigeMultiplier();
  }

  /** Cycle duration (ms) of unit `i`. Constant by default; override per design. */
  unitCycleTime(i) {
    return this.units[i].cycleTimeMs;
  }

  /** Cost to hire unit `i`'s manager. */
  managerCost(i) {
    return this.units[i].managerCost;
  }

  /** Prestige tokens claimable right now (>= 0), via the sqrt(lifetime) curve. */
  prestigeGain() {
    const raw = Math.floor(this.prestigeScale * Math.sqrt(this.state.lifetimeEarnings / this.prestigeThreshold));
    return Math.max(0, raw - this.state.prestigeClaimed);
  }

  // ---- Mutations (return true on success, false if unaffordable/invalid) ----

  /** Buy unit `i` if unowned, or buy +1 level if owned. */
  buyUnit(i) {
    const s = this.state.units[i];
    if (!s) return false;
    const cost = this.unitCost(i);
    if (this.state.money < cost) return false;
    this.state.money -= cost;
    s.level += 1;
    if (this.onPurchase) this.onPurchase("unit", i, this);
    return true;
  }

  /** Hire a manager for unit `i` (auto-runs it forever). One-shot. */
  hireManager(i) {
    const s = this.state.units[i];
    if (!s || s.hasManager || s.level === 0) return false;
    const cost = this.managerCost(i);
    if (this.state.money < cost) return false;
    this.state.money -= cost;
    s.hasManager = true;
    s.running = true;
    if (this.onPurchase) this.onPurchase("manager", i, this);
    return true;
  }

  /** Start one manual cycle on unit `i` (ignored if it has a manager). */
  run(i) {
    const s = this.state.units[i];
    if (!s || s.level === 0 || s.running) return false;
    s.running = true;
    s.progress = 0;
    return true;
  }

  /** Purchase upgrade by id; applies its multiplier permanently. One-shot. */
  buyUpgrade(id) {
    const idx = this.upgrades.findIndex((u) => u.id === id);
    if (idx < 0) return false;
    const u = this.upgrades[idx];
    if (this.state.purchasedUpgrades.includes(u.id)) return false;
    if (this.state.money < u.cost) return false;
    this.state.money -= u.cost;
    if (u.targetIndex === "all") {
      for (const su of this.state.units) su.upgradeMult *= u.mult;
    } else if (this.state.units[u.targetIndex]) {
      this.state.units[u.targetIndex].upgradeMult *= u.mult;
    }
    this.state.purchasedUpgrades.push(u.id);
    if (this.onPurchase) this.onPurchase("upgrade", u.id, this);
    return true;
  }

  /** Upgrades not yet purchased — drive the upgrade shop UI from this. */
  availableUpgrades() {
    return this.upgrades.filter((u) => !this.state.purchasedUpgrades.includes(u.id));
  }

  /** Perform a prestige reset, banking the current claimable tokens. Returns
   *  the number of tokens gained (0 if none were claimable). */
  prestige() {
    const gain = this.prestigeGain();
    if (gain < 1) return 0;
    this.state.prestigeTokens += gain;
    this.state.prestigeClaimed += gain;
    this.state.money = this.startingMoney;
    this.state.lifetimeEarnings = 0;
    this.state.units = this.units.map(() => ({
      level: 0, running: false, progress: 0, hasManager: false, upgradeMult: 1
    }));
    this.state.purchasedUpgrades = [];
    if (this.onPrestige) this.onPrestige(gain, this);
    return gain;
  }

  // ---- Simulation ----

  /**
   * Advance the economy by `dtMs` milliseconds. Call once per frame. Completed
   * cycles add revenue to money + lifetimeEarnings and fire onPayout. Returns
   * the total revenue earned this tick (handy for floating "+$" effects).
   * Handles large dt (background catch-up) by paying out multiple whole cycles.
   */
  tick(dtMs) {
    const dt = Math.max(0, Number(dtMs) || 0);
    let earnedThisTick = 0;
    this.state.units.forEach((s, i) => {
      if (s.level === 0) return;
      if (s.hasManager) s.running = true; // managers keep it perpetually running
      if (!s.running) return;
      const time = this.unitCycleTime(i);
      s.progress += dt;
      while (s.progress >= time) {
        const rev = this.unitRevenue(i);
        this.state.money += rev;
        this.state.lifetimeEarnings += rev;
        earnedThisTick += rev;
        if (this.onPayout) this.onPayout(i, rev, this);
        s.progress -= time;
        if (!s.hasManager) {
          // Manual unit: stops after one cycle, drop any leftover progress.
          s.running = false;
          s.progress = 0;
          break;
        }
      }
    });
    return earnedThisTick;
  }

  /** Fractional progress [0..1] of unit `i`'s current cycle (for a fill bar). */
  unitProgressFraction(i) {
    const s = this.state.units[i];
    if (!s || s.level === 0) return 0;
    return Math.min(1, s.progress / this.unitCycleTime(i));
  }

  // ---- Persistence (validated; never throws on bad data) ----

  /** Serialize the mutable state to a plain object. */
  toJSON() {
    return this.state;
  }

  /** Save state to the configured storage under storageKey. */
  save() {
    if (!this.storage) return false;
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.state));
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Load + validate state from storage. Falls back to a fresh state on any
   *  corruption or schema mismatch. Returns true if a valid save was loaded. */
  load() {
    if (!this.storage) return false;
    let raw;
    try {
      raw = this.storage.getItem(this.storageKey);
    } catch (e) {
      return false;
    }
    if (!raw) return false;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return false;
    }
    const valid = this._validateState(parsed);
    if (!valid) {
      this.state = this._freshState();
      return false;
    }
    this.state = valid;
    return true;
  }

  /** Validate + normalize a parsed save against the current unit count.
   *  Returns a sanitized state object, or null if irrecoverably invalid. */
  _validateState(p) {
    if (!p || typeof p !== "object") return null;
    if (typeof p.money !== "number" || !isFinite(p.money) || p.money < 0) return null;
    if (!Array.isArray(p.units) || p.units.length !== this.units.length) return null;
    const fresh = this._freshState();
    const out = {
      money: p.money,
      lifetimeEarnings: this._num(p.lifetimeEarnings, 0),
      prestigeTokens: this._num(p.prestigeTokens, 0),
      prestigeClaimed: this._num(p.prestigeClaimed, 0),
      purchasedUpgrades: Array.isArray(p.purchasedUpgrades)
        ? p.purchasedUpgrades.filter((id) => this.upgrades.some((u) => u.id === id))
        : [],
      units: p.units.map((su, i) => {
        const f = fresh.units[i];
        if (!su || typeof su !== "object") return f;
        return {
          level: Math.max(0, Math.floor(this._num(su.level, 0))),
          running: Boolean(su.running),
          progress: Math.max(0, this._num(su.progress, 0)),
          hasManager: Boolean(su.hasManager),
          upgradeMult: su.upgradeMult > 0 ? su.upgradeMult : 1
        };
      })
    };
    return out;
  }

  _num(v, fallback) {
    return (typeof v === "number" && isFinite(v) && v >= 0) ? v : fallback;
  }

  /** Wipe all progress back to a fresh start (does NOT touch storage). */
  reset() {
    this.state = this._freshState();
  }
}

/**
 * Compact human-readable money formatter (4.20K, 6.90 Mil, 1.23 Bil, ...).
 * Optional helper — the engine never calls it; renderers may import it.
 */
export function formatBigNumber(n) {
  const suffixes = [
    [1e15, " Quad"], [1e12, " Tril"], [1e9, " Bil"], [1e6, " Mil"], [1e3, "K"]
  ];
  for (const [threshold, suffix] of suffixes) {
    if (n >= threshold) return (n / threshold).toFixed(2) + suffix;
  }
  return n < 100 ? n.toFixed(2) : String(Math.floor(n));
}
// END mchatai-web-components: entities.incremental-economy
