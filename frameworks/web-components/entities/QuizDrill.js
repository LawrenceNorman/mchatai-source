// BEGIN mchatai-web-components: entities.quiz-drill (entities/QuizDrill.js)
//
// PLAIN JS CLASS — NOT A WEB CUSTOM ELEMENT.
// DO NOT call customElements.define() on this class.
// DO NOT use <quizdrill-foo> tags in HTML.
// Instantiate with `new` and call methods. YOU draw the UI.
// See wisdom rule fs-015 for the full pattern + worked examples.
//
/**
 * Adaptive quiz / drill engine. The "spaced-repetition" brain behind any
 * flash-card, times-tables, vocab, capitals, or trivia drill: it owns an item
 * bank, runs timed multiple-choice rounds, tracks per-item accuracy AND speed,
 * scores each item's weakness, and biases item selection toward the weakest
 * (and never-tested) items — so the learner spends time where it counts.
 *
 * Why an engine (not a hardcoded subject): the adaptive part — tracking which
 * items a learner is weak on and weighting selection toward them — is identical
 * whether the items are "7 × 8 = 56", "perro = dog", or "Capital of France =
 * Paris". A generator + this engine turns ANY item bank into a smart drill; a
 * weak model only supplies items and draws the UI. The hard adaptive math lives
 * here, in the Lego, not in the generated app. (This is the kids-education
 * multiplier — one engine, every subject.)
 *
 * GENERIC OVER ITEM TYPE. An item is whatever you pass in. The only required
 * field is a stable `id` (string|number) so progress can be keyed per item.
 * Everything else (prompt text, the correct value, distractor pool, tags…) is
 * yours — the engine never reads it. You generate the multiple-choice CHOICES
 * for a question yourself (the engine doesn't know your value space); the engine
 * picks WHICH item to ask and GRADES the result you report back.
 *
 * Mechanics:
 *   - The item bank is seeded once via setItems([...]) or in the constructor.
 *   - Per-item progress is { correct, total, totalMs, lastSeenSeq } — accuracy,
 *     average speed, and recency. Persist it across sessions if you like (see
 *     toJSON()/loadProgress()); the engine works fine in-memory too.
 *   - weaknessScore(id) blends accuracy (weighted heavily) and speed (secondary).
 *     LOWER score = weaker. Never-tested items (total < minSamples) sort to the
 *     very front so new material is introduced.
 *   - nextItem(mode) selects the next item to ask:
 *       "weak"  — weighted toward the weakest: typically ~70% weakest,
 *                 ~20% second-weakest, ~10% random (spreads practice, avoids ruts).
 *       "mixed" — uniform random across the bank.
 *     Both avoid immediately repeating the last item when the bank allows.
 *   - record(id, correct, elapsedMs) folds one answer into that item's progress
 *     and returns the points awarded for the round (combo + speed bonus).
 *
 * Round runner (optional, drives a timed session — purely bookkeeping; YOU draw
 * the timer/HUD/keypad and report each answer):
 *   - startRound({durationMs}) resets score/combo/log and stamps an end time.
 *   - answer(id, correct, elapsedMs) records the answer, updates score + combo,
 *     and appends to the session log. Returns { points, score, combo, correct }.
 *   - remainingMs() / isRoundOver() let your tick loop know when to finishRound().
 *   - finishRound() returns the round summary { score, correct, total, accuracy,
 *     bestScore, isBest, durationMs, log } and updates the all-time best.
 *
 * Streaks (daily-engagement, optional): noteSessionPlayed() advances a
 * day-streak (consecutive calendar days with a played session); streak() reads
 * the current count and self-heals a broken streak on a new day.
 *
 * Rendering-agnostic + dependency-free + offline. No DOM, no storage, no fetch,
 * no Math.random in the scored path you can't seed (selection uses the injected
 * rng so QA/replay can be deterministic). Persist toJSON() yourself (e.g. to
 * localStorage) if you want progress + streak to survive reloads.
 *
 * Usage (install-relative import path — copy EXACTLY; the bundled files live
 * under ./web-components/<category>/<File>.js, NOT flat under ./web-components/):
 *   import { QuizDrill } from "./web-components/entities/QuizDrill.js";
 *
 *   // 1. Build your item bank. `id` is the only field the engine needs.
 *   const items = [];
 *   for (let a = 2; a <= 12; a++) for (let b = 2; b <= 12; b++)
 *     items.push({ id: `${a}x${b}`, a, b, answer: a * b });
 *   const drill = new QuizDrill({ items });
 *
 *   // 2. Each question: ask the engine WHICH item, build choices yourself.
 *   const item = drill.nextItem("weak");
 *   // …render `item`, build multiple-choice buttons, time the response…
 *
 *   // 3. Report the result. record() (or answer() inside a round) grades it.
 *   const askedAt = performance.now();
 *   // …user taps an option…
 *   drill.record(item.id, chosen === item.answer, performance.now() - askedAt);
 *
 *   // Timed session variant:
 *   drill.startRound({ durationMs: 60000 });
 *   // per answer: const r = drill.answer(item.id, isRight, elapsedMs);
 *   // tick loop:  if (drill.isRoundOver()) { const s = drill.finishRound(); … }
 *
 *   // Persist progress so the drill stays adaptive across sessions:
 *   localStorage.setItem("drill", JSON.stringify(drill.toJSON()));
 *   // …later: const drill = new QuizDrill({ items }); drill.loadProgress(saved);
 *
 * CONTRACTS
 *   new QuizDrill({ items?, minSamples?, scoring?, weights?, rng?, now? })
 *     items       array of objects each with a stable `id` (string|number).
 *     minSamples  attempts before an item is "tested" (untested sorts weakest). default 3.
 *     scoring     { base?, comboStep?, comboCap?, fastBonus?, fastMs? } point rules.
 *     weights     { weakest?, second?, random? } selection probabilities (auto-normalized). default .7/.2/.1.
 *     rng         () => 0..1 random source (inject a seeded rng for replay). default Math.random.
 *     now         () => epoch ms (inject for deterministic day-streak tests). default Date.now.
 *   Item bank:
 *     setItems(items)                          replace the bank (keeps matching progress by id)
 *     items                                    -> the current bank (read-only use)
 *   Adaptive selection + grading:
 *     nextItem(mode = "weak")                  -> item ("weak" = weighted weakest, "mixed" = uniform)
 *     weaknessScore(id)                        -> number (LOWER = weaker; -Infinity if untested)
 *     weakest(n = 1)                           -> [{ item, score, accuracy, avgMs, total }] weakest-first
 *     accuracy(id) / avgMs(id) / attempts(id)  -> per-item stats (accuracy 0..1; 1/0 when untested)
 *     record(id, correct, elapsedMs = 0)       -> points (folds one answer into progress + combo)
 *   Round runner (timed session bookkeeping):
 *     startRound({ durationMs })               begin a session (resets score/combo/log)
 *     answer(id, correct, elapsedMs = 0)       -> { points, score, combo, correct } (records + scores)
 *     remainingMs() / isRoundOver()            -> ms left / bool
 *     finishRound()                            -> { score, correct, total, accuracy, bestScore, isBest, durationMs, log }
 *     score / combo / bestScore                round + all-time counters
 *   Streak (daily engagement):
 *     noteSessionPlayed()                      advance the day-streak (1/calendar day)
 *     streak()                                 -> current consecutive-day count (self-heals)
 *   Persistence:
 *     toJSON()                                 -> { progress, bestScore, streak, lastPlayed } (plain object)
 *     loadProgress(obj)                        restore a previous toJSON() snapshot
 *     reset()                                  clear all progress, streak, and best
 */

const DEFAULT_SCORING = Object.freeze({
  base: 10,        // points for a correct answer
  comboStep: 2,    // extra points per consecutive-correct step
  comboCap: 10,    // max combo steps that count
  fastBonus: 5,    // bonus for a fast answer
  fastMs: 2000     // "fast" threshold in ms
});

const DEFAULT_WEIGHTS = Object.freeze({ weakest: 0.7, second: 0.2, random: 0.1 });

export class QuizDrill {
  constructor(options = {}) {
    this.minSamples = clampInt(options.minSamples, 0, 1000, 3);
    this.scoring = { ...DEFAULT_SCORING, ...(options.scoring || {}) };
    this.weights = normalizeWeights({ ...DEFAULT_WEIGHTS, ...(options.weights || {}) });
    this.rng = typeof options.rng === "function" ? options.rng : Math.random;
    this.now = typeof options.now === "function" ? options.now : Date.now;

    this._items = [];
    this._byId = new Map();
    this._progress = new Map();   // id -> { correct, total, totalMs, lastSeenSeq }
    this._seq = 0;                // monotonically increasing "seen" counter (recency)
    this._lastAskedId = null;

    this.bestScore = 0;
    this._streak = 0;
    this._lastPlayed = null;      // "YYYY-M-D" calendar key

    // active round (null when no session is running)
    this.round = null;
    this.score = 0;
    this.combo = 0;

    if (Array.isArray(options.items)) this.setItems(options.items);
  }

  // ----- Item bank -----------------------------------------------------------

  /** Replace the item bank. Each item MUST have a stable `id`. Existing
   *  per-item progress is retained for ids still present (so changing the bank
   *  doesn't wipe a learner's history). */
  setItems(items) {
    this._items = (items || []).filter((it) => it && it.id != null);
    this._byId = new Map(this._items.map((it) => [it.id, it]));
    // Drop progress for ids no longer in the bank; keep the rest.
    for (const id of [...this._progress.keys()]) {
      if (!this._byId.has(id)) this._progress.delete(id);
    }
    if (!this._byId.has(this._lastAskedId)) this._lastAskedId = null;
    return this;
  }

  /** The current item bank (read-only use). */
  get items() {
    return this._items;
  }

  _prog(id) {
    let p = this._progress.get(id);
    if (!p) {
      p = { correct: 0, total: 0, totalMs: 0, lastSeenSeq: -1 };
      this._progress.set(id, p);
    }
    return p;
  }

  // ----- Per-item stats ------------------------------------------------------

  /** Attempts recorded for an item. */
  attempts(id) {
    const p = this._progress.get(id);
    return p ? p.total : 0;
  }

  /** Accuracy 0..1 for an item (1 when untested — optimistic, but weaknessScore
   *  still floats untested items to the front via minSamples). */
  accuracy(id) {
    const p = this._progress.get(id);
    if (!p || p.total === 0) return 1;
    return p.correct / p.total;
  }

  /** Average response time in ms for an item (0 when untested). */
  avgMs(id) {
    const p = this._progress.get(id);
    if (!p || p.total === 0) return 0;
    return p.totalMs / p.total;
  }

  /**
   * Weakness score for an item. LOWER = weaker (asked sooner). Accuracy is
   * weighted heavily (0..100); speed is a smaller secondary penalty so slow-
   * but-correct items still surface. Items with fewer than `minSamples`
   * attempts return -Infinity so brand-new material is always introduced first.
   */
  weaknessScore(id) {
    const p = this._progress.get(id);
    if (!p || p.total < this.minSamples) return -Infinity; // untested -> weakest
    const acc = p.correct / p.total;            // 0..1
    const avgMs = p.totalMs / p.total;          // ms
    const speedPenalty = Math.min(avgMs / 100, 30); // cap so one slow item ≠ disaster
    return acc * 100 - speedPenalty;            // lower = weaker
  }

  /**
   * The `n` weakest items, weakest-first. Each row:
   *   { item, score, accuracy, avgMs, total }
   * Untested items (score -Infinity) sort to the front. Ties keep bank order.
   */
  weakest(n = 1) {
    const rows = this._items.map((item) => ({
      item,
      score: this.weaknessScore(item.id),
      accuracy: this.accuracy(item.id),
      avgMs: this.avgMs(item.id),
      total: this.attempts(item.id)
    }));
    rows.sort((a, b) => a.score - b.score);
    return rows.slice(0, Math.max(0, n));
  }

  // ----- Adaptive selection --------------------------------------------------

  /**
   * Pick the next item to ask.
   *   mode "weak"  -> weighted toward the weakest items (see `weights`).
   *   mode "mixed" -> uniform random across the whole bank.
   * Avoids immediately repeating the last asked item when the bank has >1 item.
   * Returns null only if the bank is empty.
   */
  nextItem(mode = "weak") {
    if (this._items.length === 0) return null;
    if (this._items.length === 1) {
      this._lastAskedId = this._items[0].id;
      return this._items[0];
    }

    let chosen;
    if (mode === "mixed") {
      chosen = this._pickRandom();
    } else {
      const ranked = this.weakest(this._items.length).map((r) => r.item);
      const r = this.rng();
      const w = this.weights;
      if (r < w.weakest) chosen = ranked[0];
      else if (r < w.weakest + w.second) chosen = ranked[1] || ranked[0];
      else chosen = this._pickRandom();
    }

    // Avoid an immediate repeat: re-roll once to a different item if possible.
    if (chosen && chosen.id === this._lastAskedId) {
      const alt = this._pickRandom((it) => it.id !== this._lastAskedId);
      if (alt) chosen = alt;
    }

    this._lastAskedId = chosen ? chosen.id : null;
    return chosen;
  }

  _pickRandom(predicate) {
    const pool = predicate ? this._items.filter(predicate) : this._items;
    if (pool.length === 0) return null;
    return pool[Math.floor(this.rng() * pool.length)];
  }

  // ----- Grading -------------------------------------------------------------

  /**
   * Fold one answer into an item's progress and return the points it earns.
   * Points = base + min(combo-1, comboCap) * comboStep + (fast ? fastBonus : 0).
   * `combo` here is the current consecutive-correct streak (this.combo). A wrong
   * answer earns 0 and (via answer()) resets the combo. Use this directly for an
   * untimed/free-practice drill, or let answer() call it inside a round.
   */
  record(id, correct, elapsedMs = 0) {
    if (!this._byId.has(id)) return 0;
    const p = this._prog(id);
    p.total += 1;
    p.totalMs += Math.max(0, elapsedMs);
    p.lastSeenSeq = this._seq++;
    if (correct) {
      p.correct += 1;
      return this._points(this.combo + 1, elapsedMs);
    }
    return 0;
  }

  _points(comboAfter, elapsedMs) {
    const s = this.scoring;
    const comboSteps = Math.min(Math.max(0, comboAfter - 1), s.comboCap);
    const fast = elapsedMs > 0 && elapsedMs < s.fastMs ? s.fastBonus : 0;
    return s.base + comboSteps * s.comboStep + fast;
  }

  // ----- Round runner --------------------------------------------------------

  /** Begin a timed session. Resets score/combo and the per-round log. The
   *  caller drives the clock; the engine just stamps end time for remainingMs().
   *  `durationMs` <= 0 means an open-ended round (isRoundOver() stays false). */
  startRound({ durationMs = 60000 } = {}) {
    const start = this.now();
    this.score = 0;
    this.combo = 0;
    this.round = {
      durationMs,
      startedAt: start,
      endsAt: durationMs > 0 ? start + durationMs : Infinity,
      correct: 0,
      total: 0,
      log: []
    };
    return this;
  }

  /**
   * Record an answer during a round. Updates score + combo, appends to the
   * session log, and returns { points, score, combo, correct }. Safe to call
   * with no active round (it still grades progress and returns the points, but
   * won't touch a non-existent log).
   */
  answer(id, correct, elapsedMs = 0) {
    const points = this.record(id, correct, elapsedMs);
    if (correct) {
      this.combo += 1;
      this.score += points;
    } else {
      this.combo = 0;
    }
    if (this.round) {
      this.round.total += 1;
      if (correct) this.round.correct += 1;
      this.round.log.push({ id, correct, elapsedMs: Math.max(0, elapsedMs), points });
    }
    return { points, score: this.score, combo: this.combo, correct };
  }

  /** Milliseconds left in the current round (0 when over or no round). */
  remainingMs() {
    if (!this.round) return 0;
    if (this.round.endsAt === Infinity) return Infinity;
    return Math.max(0, this.round.endsAt - this.now());
  }

  /** True when the timed round's clock has run out. Open-ended rounds (and "no
   *  round") are never "over" by time — call finishRound() yourself. */
  isRoundOver() {
    return !!this.round && this.round.endsAt !== Infinity && this.now() >= this.round.endsAt;
  }

  /**
   * End the current round and return its summary:
   *   { score, correct, total, accuracy (0..1), bestScore, isBest, durationMs, log }
   * Updates the all-time bestScore. Clears the active round (score/combo persist
   * on the instance so the caller can still read them for the results screen).
   * Returns null if no round was active.
   */
  finishRound() {
    const r = this.round;
    if (!r) return null;
    const total = r.total;
    const accuracy = total ? r.correct / total : 0;
    const isBest = this.score > this.bestScore;
    if (isBest) this.bestScore = this.score;
    this.round = null;
    return {
      score: this.score,
      correct: r.correct,
      total,
      accuracy,
      bestScore: this.bestScore,
      isBest,
      durationMs: this.now() - r.startedAt,
      log: r.log.slice()
    };
  }

  // ----- Daily streak --------------------------------------------------------

  /** Advance the day-streak. Counts at most once per calendar day; a gap of
   *  more than one day resets the streak to 1. Call once when a session that
   *  actually contained answers completes. */
  noteSessionPlayed() {
    const today = this._dayKey(0);
    if (this._lastPlayed === today) return this._streak; // already counted today
    if (this._lastPlayed === this._dayKey(-1)) this._streak += 1;
    else this._streak = 1;
    this._lastPlayed = today;
    return this._streak;
  }

  /** Current consecutive-day streak. Self-heals: if the last play was neither
   *  today nor yesterday the streak is stale and reads 0. */
  streak() {
    if (
      this._lastPlayed &&
      this._lastPlayed !== this._dayKey(0) &&
      this._lastPlayed !== this._dayKey(-1)
    ) {
      this._streak = 0;
    }
    return this._streak;
  }

  _dayKey(offsetDays) {
    const d = new Date(this.now());
    if (offsetDays) d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  // ----- Persistence ---------------------------------------------------------

  /** Plain-object snapshot of all progress, best score, and streak. JSON-safe.
   *  Persist this (e.g. to localStorage) and feed it to loadProgress() later. */
  toJSON() {
    const progress = {};
    for (const [id, p] of this._progress) {
      progress[id] = { correct: p.correct, total: p.total, totalMs: p.totalMs, lastSeenSeq: p.lastSeenSeq };
    }
    return {
      progress,
      bestScore: this.bestScore,
      streak: this._streak,
      lastPlayed: this._lastPlayed
    };
  }

  /** Restore a previous toJSON() snapshot. Unknown ids are kept in case the
   *  bank is set afterwards; setItems() prunes anything not in the bank. */
  loadProgress(obj) {
    if (!obj || typeof obj !== "object") return this;
    this._progress = new Map();
    let maxSeq = -1;
    const prog = obj.progress || {};
    for (const id of Object.keys(prog)) {
      const p = prog[id] || {};
      const entry = {
        correct: toInt(p.correct),
        total: toInt(p.total),
        totalMs: toInt(p.totalMs),
        lastSeenSeq: Number.isFinite(p.lastSeenSeq) ? p.lastSeenSeq : -1
      };
      const key = this._byId.has(id) ? id : coerceId(id, this._byId);
      this._progress.set(key, entry);
      if (entry.lastSeenSeq > maxSeq) maxSeq = entry.lastSeenSeq;
    }
    this._seq = maxSeq + 1;
    this.bestScore = toInt(obj.bestScore);
    this._streak = toInt(obj.streak);
    this._lastPlayed = typeof obj.lastPlayed === "string" ? obj.lastPlayed : null;
    if (this._byId.size) this.setItems(this._items); // re-prune to current bank
    return this;
  }

  /** Wipe all progress, best score, and streak (keeps the item bank). */
  reset() {
    this._progress = new Map();
    this._seq = 0;
    this._lastAskedId = null;
    this.bestScore = 0;
    this._streak = 0;
    this._lastPlayed = null;
    this.round = null;
    this.score = 0;
    this.combo = 0;
    return this;
  }
}

function normalizeWeights(w) {
  const weakest = Math.max(0, Number(w.weakest) || 0);
  const second = Math.max(0, Number(w.second) || 0);
  const random = Math.max(0, Number(w.random) || 0);
  const sum = weakest + second + random;
  if (sum <= 0) return { ...DEFAULT_WEIGHTS };
  return { weakest: weakest / sum, second: second / sum, random: random / sum };
}

function clampInt(v, lo, hi, dflt) {
  const n = Number.isFinite(v) ? Math.round(v) : dflt;
  return Math.max(lo, Math.min(hi, n));
}

function toInt(v) {
  return Number.isFinite(v) ? Math.round(v) : 0;
}

// Snapshots store ids as JSON object keys (always strings). If the bank uses
// numeric ids, map a "7" key back to the numeric 7 so progress re-links.
function coerceId(key, byId) {
  if (byId.has(key)) return key;
  const num = Number(key);
  if (!Number.isNaN(num) && byId.has(num)) return num;
  return key;
}

// END mchatai-web-components: entities.quiz-drill
