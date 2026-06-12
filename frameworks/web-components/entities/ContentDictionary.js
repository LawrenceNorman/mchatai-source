// BEGIN mchatai-web-components: entities.content-dictionary (entities/ContentDictionary.js)

/**
 * Generic content dictionary for any game whose play is driven by a bank of
 * authored items: trivia/quiz (question -> answer), crossword/anagram
 * (clue -> word), flashcards (front -> back), riddles, "guess the X", emoji
 * puzzles, geography quizzes, etc. WordDictionary is for word-TRACE games
 * (Set membership + prefix pruning); ContentDictionary is for content-DRIVEN
 * games (draw an item, show its prompt, validate the answer, reveal hints).
 *
 * An item is a plain object:
 *   { id?, prompt, answer, hints?: string[], category?, difficulty?: 1..5,
 *     tags?: string[], aliases?: string[], meta?: {} }
 * Only `prompt` and `answer` are required. `aliases` are alternative accepted
 * answers; `hints` are revealed progressively.
 *
 * Determinism: pass a numeric `seed` for reproducible draw order (canaries /
 * "daily puzzle" mode). Without a seed, draws are deterministic in INSERTION
 * order so a generated app behaves identically across runs unless it opts into
 * shuffling - important because Math.random() is non-deterministic and breaks
 * golden-replay QA.
 *
 * Usage:
 *   import { ContentDictionary } from "./web-components/ContentDictionary.js";
 *   const dict = new ContentDictionary([
 *     { prompt: "Capital of France?", answer: "Paris", category: "geography", difficulty: 1,
 *       hints: ["In Europe", "On the Seine"], aliases: ["paris"] },
 *     { prompt: "2 + 2", answer: "4", category: "math", difficulty: 1 },
 *   ]);
 *   const q = dict.draw({ category: "geography", difficulty: 1 });
 *   dict.check(q, "paris");      // true (case-insensitive, trims, matches aliases)
 *   dict.hint(q, 0);             // "In Europe"
 *   dict.remaining();            // items not yet drawn this round
 */
export class ContentDictionary {
  /** @param {Array<object>} items @param {{seed?: number}} [opts] */
  constructor(items = [], opts = {}) {
    this.items = [];
    this._drawn = new Set();
    this._seed = Number.isFinite(opts.seed) ? (opts.seed >>> 0) : null;
    this._cursor = 0;
    let autoId = 0;
    for (const raw of items) {
      if (!raw || raw.prompt == null || raw.answer == null) continue;
      this.items.push({
        id: raw.id != null ? String(raw.id) : `item-${autoId++}`,
        prompt: String(raw.prompt),
        answer: String(raw.answer),
        hints: Array.isArray(raw.hints) ? raw.hints.map(String) : [],
        category: raw.category != null ? String(raw.category) : null,
        difficulty: Number.isFinite(raw.difficulty) ? raw.difficulty : null,
        tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
        aliases: Array.isArray(raw.aliases) ? raw.aliases.map(String) : [],
        meta: raw.meta && typeof raw.meta === "object" ? raw.meta : {},
      });
    }
  }

  /** Mulberry32 PRNG - small, fast, deterministic. Returns [0,1). */
  _rand() {
    if (this._seed == null) return null;
    let t = (this._seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Items matching an optional {category, difficulty, tag} filter. */
  filter({ category = null, difficulty = null, tag = null } = {}) {
    return this.items.filter((it) =>
      (category == null || it.category === category) &&
      (difficulty == null || it.difficulty === difficulty) &&
      (tag == null || it.tags.includes(tag)));
  }

  /** Distinct categories / difficulties present (for menu building). */
  categories() { return [...new Set(this.items.map((i) => i.category).filter((c) => c != null))]; }
  difficulties() { return [...new Set(this.items.map((i) => i.difficulty).filter((d) => d != null))].sort((a, b) => a - b); }

  /**
   * Draw the next item, optionally filtered, without repeating within a round.
   * Deterministic: seeded -> shuffled-by-seed order; unseeded -> insertion order.
   * Returns null when the (filtered) pool is exhausted; call resetRound() to reuse.
   */
  draw(filter = {}) {
    let pool = this.filter(filter).filter((it) => !this._drawn.has(it.id));
    if (pool.length === 0) return null;
    let pick;
    if (this._seed != null) {
      pick = pool[Math.floor(this._rand() * pool.length)];
    } else {
      pick = pool[0];
    }
    this._drawn.add(pick.id);
    this._cursor++;
    return pick;
  }

  /** Items in the (optionally filtered) pool not yet drawn this round. */
  remaining(filter = {}) { return this.filter(filter).filter((it) => !this._drawn.has(it.id)).length; }

  /** Start a fresh round (every item drawable again). */
  resetRound() { this._drawn.clear(); this._cursor = 0; }

  /** Progressive hint: hint(item, 0) is the first hint. Returns "" past the end. */
  hint(item, index = 0) {
    if (!item || !Array.isArray(item.hints)) return "";
    return item.hints[index] || "";
  }

  /** Normalize an answer for comparison: trim, collapse spaces, lowercase. */
  static normalize(s) { return String(s == null ? "" : s).trim().replace(/\s+/g, " ").toLowerCase(); }

  /** True if `guess` matches the item's answer or any alias (normalized). */
  check(item, guess) {
    if (!item) return false;
    const g = ContentDictionary.normalize(guess);
    if (g === ContentDictionary.normalize(item.answer)) return true;
    return item.aliases.some((a) => ContentDictionary.normalize(a) === g);
  }

  get size() { return this.items.length; }
}

// END mchatai-web-components: entities.content-dictionary
