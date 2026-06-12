// BEGIN mchatai-web-components: entities.level-content-data (entities/LevelContentData.js)

/**
 * Data-driven level definitions + difficulty scaling + save/load. This is the
 * CONTENT half of multi-level games; entities/LevelProgression is the runtime
 * STATE half. Keeping them split means a generated game describes its campaign
 * as DATA (no hand-rolled per-level branching) and hands it to LevelProgression
 * for play, and to ui/LevelSelectScreen for the picker.
 *
 * A level descriptor:
 *   { id?, name?, targetScore?, moveBudget?, timeLimit?, rules?: {}, hints?: [],
 *     rewards?: {}, unlocks?: [], difficulty?: 1..5, params?: {} }
 * `params` is the scaled gameplay knob bag (enemySpeed, spawnRate, gridSize,
 * etc.) so app glue reads `level.params.enemySpeed` instead of hardcoding a
 * per-level switch. Provide explicit levels, OR generate them from a curve via
 * LevelContentData.generate().
 *
 * Composes with LevelProgression:
 *   const data = LevelContentData.generate({ count: 10, baseTarget: 1500,
 *     scale: { enemySpeed: [1.0, 2.4], spawnRate: [0.8, 2.0] } });
 *   const lp = new LevelProgression({ levels: data.toProgressionLevels() });
 *
 * And with the picker:
 *   new LevelSelectScreen({ data, onSelect: (i) => startLevel(data.level(i)) });
 *
 * Save/load uses localStorage by default (key "mchatai-level-progress") so a
 * player can continue from their furthest unlocked level. Pass { storageKey }
 * to namespace per-game; pass { storage: null } to disable persistence.
 */
export class LevelContentData {
  /** @param {Array<object>} levels @param {{storageKey?: string, storage?: Storage|null}} [opts] */
  constructor(levels = [], opts = {}) {
    this.levels = levels.map((lv, i) => LevelContentData._normalize(lv, i));
    this.storageKey = opts.storageKey || "mchatai-level-progress";
    this._storage = opts.storage === undefined ? LevelContentData._defaultStorage() : opts.storage;
  }

  static _defaultStorage() {
    try { return typeof localStorage !== "undefined" ? localStorage : null; } catch (_) { return null; }
  }

  static _normalize(lv, i) {
    lv = lv || {};
    return {
      id: lv.id != null ? String(lv.id) : `level-${i + 1}`,
      name: lv.name != null ? String(lv.name) : `Level ${i + 1}`,
      targetScore: Number.isFinite(lv.targetScore) ? lv.targetScore : null,
      moveBudget: Number.isFinite(lv.moveBudget) ? lv.moveBudget : null,
      timeLimit: Number.isFinite(lv.timeLimit) ? lv.timeLimit : null,
      difficulty: Number.isFinite(lv.difficulty) ? lv.difficulty : Math.min(5, 1 + Math.floor(i / 2)),
      rules: lv.rules && typeof lv.rules === "object" ? lv.rules : {},
      hints: Array.isArray(lv.hints) ? lv.hints.map(String) : [],
      rewards: lv.rewards && typeof lv.rewards === "object" ? lv.rewards : {},
      unlocks: Array.isArray(lv.unlocks) ? lv.unlocks.map(String) : [],
      params: lv.params && typeof lv.params === "object" ? lv.params : {},
    };
  }

  /**
   * Generate N levels with a smooth difficulty curve. `scale` maps each gameplay
   * knob to a [start, end] range linearly interpolated across the levels - the
   * DifficultyScaler so games don't hardcode per-level magic numbers.
   *   generate({ count: 8, baseTarget: 1500, targetGrowth: 1.35,
   *     scale: { enemySpeed: [1.0, 2.5], spawnRate: [0.8, 2.2] }, baseMoves: 30 })
   * Honors wisdom rule lb-016 (ship 8+ levels) by warning under 8.
   */
  static generate(opts = {}) {
    const count = Math.max(1, opts.count || 8);
    const baseTarget = opts.baseTarget || 1000;
    const growth = opts.targetGrowth || 1.3;
    const baseMoves = opts.baseMoves || null;
    const moveDecay = opts.moveDecay || 0; // moves removed per level
    const scale = opts.scale || {};
    if (count < 8) console.warn("[LevelContentData] Fewer than 8 levels (wisdom lb-016 recommends 8+ or endless).");
    const levels = [];
    for (let i = 0; i < count; i++) {
      const t = count > 1 ? i / (count - 1) : 0;
      const params = {};
      for (const [knob, range] of Object.entries(scale)) {
        if (Array.isArray(range) && range.length === 2) {
          params[knob] = +(range[0] + (range[1] - range[0]) * t).toFixed(4);
        }
      }
      levels.push({
        name: `Level ${i + 1}`,
        targetScore: Math.round(baseTarget * Math.pow(growth, i)),
        moveBudget: baseMoves != null ? Math.max(5, baseMoves - moveDecay * i) : null,
        difficulty: Math.min(5, 1 + Math.floor((count > 1 ? t : 0) * 4)),
        params,
      });
    }
    return new LevelContentData(levels, opts);
  }

  get count() { return this.levels.length; }
  level(i) { return this.levels[i] || null; }

  /** Project to the shape entities/LevelProgression expects: { target, moves }. */
  toProgressionLevels() {
    return this.levels.map((lv) => ({
      target: lv.targetScore != null ? lv.targetScore : 0,
      moves: lv.moveBudget != null ? lv.moveBudget : 30,
    }));
  }

  // --- persistence: furthest unlocked level + per-level best scores ---

  _load() {
    if (!this._storage) return { unlocked: 0, best: {} };
    try {
      const raw = this._storage.getItem(this.storageKey);
      const data = raw ? JSON.parse(raw) : null;
      return data && typeof data === "object" ? { unlocked: data.unlocked || 0, best: data.best || {} } : { unlocked: 0, best: {} };
    } catch (_) { return { unlocked: 0, best: {} }; }
  }

  _save(state) {
    if (!this._storage) return;
    try { this._storage.setItem(this.storageKey, JSON.stringify(state)); } catch (_) { /* quota / private mode */ }
  }

  /** Highest level index the player has unlocked (0-based). 0 = only first level. */
  furthestUnlocked() { return Math.min(this._load().unlocked, this.count - 1); }
  isUnlocked(i) { return i <= this.furthestUnlocked(); }
  bestScore(i) { return this._load().best[i] || 0; }

  /** Mark a level cleared: unlock the next, record best score. */
  recordClear(i, score = 0) {
    const state = this._load();
    state.unlocked = Math.max(state.unlocked, Math.min(i + 1, this.count - 1));
    if (score > (state.best[i] || 0)) state.best[i] = score;
    this._save(state);
    return state;
  }

  /** Wipe saved progress (e.g. a "reset campaign" button). */
  resetProgress() { this._save({ unlocked: 0, best: {} }); }
}

// END mchatai-web-components: entities.level-content-data
