// BEGIN mchatai-web-components: entities.word-trace-grid (entities/WordTraceGrid.js)
import { GridBoard } from "./GridBoard.js";

/**
 * Word-tracing grid for Squaredle / Bookworm / Letter-Blast / WordHunt clones.
 *
 * Mechanics:
 *   - 4×4 (or NxN) grid filled with letters (caller picks distribution).
 *   - User taps a starting cell, then drags through ADJACENT cells (8-direction
 *     by default, configurable to 4-direction) to trace a path.
 *   - Each cell can only appear ONCE per path.
 *   - Calling commitWord(dictionary) checks the traced word against a
 *     case-insensitive dictionary Set; if valid AND ≥ minLength AND not
 *     already-found, returns { valid: true, word, score } and marks the
 *     word as found. Otherwise returns { valid: false, reason }.
 *
 * The component is rendering-agnostic — it owns the grid + path state but
 * not the DOM. App glue paints cells based on `path` and listens to
 * pointerdown/pointermove/pointerup, calling startTrace / extendTrace / endTrace.
 *
 * Mobile-first usage (see mobile-frontend wisdom mob-005):
 *   element.addEventListener('pointerdown', (e) => {
 *     const cell = cellFromPoint(e.clientX, e.clientY);
 *     grid.startTrace(cell.row, cell.col);
 *   }, { passive: false });
 */
export class WordTraceGrid extends GridBoard {
  constructor(options = {}) {
    super({
      ...options,
      rows: options.rows ?? 4,
      cols: options.cols ?? 4,
      fill: ""
    });
    this.adjacency = options.adjacency === 4 ? 4 : 8; // 8-dir default
    this.minLength = options.minLength ?? 3;
    this.scoreFn = options.scoreFn ?? defaultScore;
    this.path = []; // [{row, col}, ...]
    this.foundWords = new Set();
  }

  /** Fill the grid with a letter distribution. `letters` is a string of
   *  rows*cols characters (row-major), or a 2D array of strings. */
  setLetters(letters) {
    if (typeof letters === "string") {
      const flat = letters.toUpperCase().replace(/\s+/g, "");
      for (let r = 0; r < this.rows; r += 1) {
        for (let c = 0; c < this.cols; c += 1) {
          this.set(r, c, flat[r * this.cols + c] ?? "");
        }
      }
    } else if (Array.isArray(letters)) {
      for (let r = 0; r < this.rows; r += 1) {
        for (let c = 0; c < this.cols; c += 1) {
          this.set(r, c, String(letters[r]?.[c] ?? "").toUpperCase());
        }
      }
    }
  }

  /** Clear path state. Doesn't touch foundWords or letter state. */
  resetPath() {
    this.path = [];
  }

  /** Start a new trace at (row, col). Resets any in-progress path. */
  startTrace(row, col) {
    this.path = [];
    if (this.inBounds(row, col)) {
      this.path.push({ row, col });
    }
    return this.currentWord();
  }

  /** Extend the path to (row, col) if it's adjacent to the last cell AND
   *  not already in the path. Returns true if accepted, false otherwise. */
  extendTrace(row, col) {
    if (!this.inBounds(row, col)) return false;
    if (this.path.length === 0) return false;
    if (this.containsCell(row, col)) {
      // 2026-05-09 — backtrack support. If user drags BACK to the previous
      // cell (n-1), pop the last entry. Standard UX in Squaredle/WordHunt.
      const prev = this.path[this.path.length - 2];
      if (prev && prev.row === row && prev.col === col) {
        this.path.pop();
        return true;
      }
      return false;
    }
    const last = this.path[this.path.length - 1];
    if (!this.isAdjacent(last.row, last.col, row, col)) return false;
    this.path.push({ row, col });
    return true;
  }

  /** Commit the current path against the dictionary. Returns
   *    { valid: true, word, score } on success
   *    { valid: false, reason } on failure ("too-short" | "not-a-word" | "already-found")
   *  Always clears the path afterward unless `keep` is true. */
  commitWord(dictionary, options = {}) {
    const word = this.currentWord();
    this.resetPath();
    if (word.length < this.minLength) {
      return { valid: false, reason: "too-short", word };
    }
    if (!dictionary || !this.dictionaryHas(dictionary, word)) {
      return { valid: false, reason: "not-a-word", word };
    }
    if (this.foundWords.has(word)) {
      return { valid: false, reason: "already-found", word };
    }
    this.foundWords.add(word);
    return { valid: true, word, score: this.scoreFn(word) };
  }

  /** The current path as a word (concat letters). */
  currentWord() {
    return this.path
      .map(({ row, col }) => this.get(row, col) || "")
      .join("");
  }

  /** True if the cell is part of the current path. */
  containsCell(row, col) {
    return this.path.some((p) => p.row === row && p.col === col);
  }

  /** Index of the cell in the current path, or -1. */
  pathIndexOf(row, col) {
    return this.path.findIndex((p) => p.row === row && p.col === col);
  }

  /** True if (r1,c1) is adjacent to (r2,c2) under this grid's adjacency mode. */
  isAdjacent(r1, c1, r2, c2) {
    const dr = Math.abs(r1 - r2);
    const dc = Math.abs(c1 - c2);
    if (dr === 0 && dc === 0) return false;
    if (this.adjacency === 8) return dr <= 1 && dc <= 1;
    return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
  }

  /** Check word against a Set, Array, or {has(word):bool} dictionary. */
  dictionaryHas(dictionary, word) {
    if (dictionary instanceof Set) return dictionary.has(word);
    if (Array.isArray(dictionary)) return dictionary.includes(word);
    if (typeof dictionary?.has === "function") return dictionary.has(word);
    if (typeof dictionary === "object") return Boolean(dictionary[word]);
    return false;
  }

  /** Reset for a new puzzle. Clears path, foundWords, and letters. */
  resetPuzzle() {
    this.resetPath();
    this.foundWords.clear();
    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.cols; c += 1) {
        this.set(r, c, "");
      }
    }
  }

  /** Total score across all found words. */
  totalScore() {
    let total = 0;
    for (const w of this.foundWords) {
      total += this.scoreFn(w);
    }
    return total;
  }
}

/**
 * Default Squaredle-style scoring: length² for short words, harder bonus for long.
 *   3 letters → 1
 *   4 letters → 2
 *   5 letters → 4
 *   6 letters → 7
 *   7+ letters → 11 + (length-7)*5
 * Caller can pass a custom `scoreFn` to override.
 */
function defaultScore(word) {
  const n = word.length;
  if (n <= 2) return 0;
  if (n === 3) return 1;
  if (n === 4) return 2;
  if (n === 5) return 4;
  if (n === 6) return 7;
  return 11 + (n - 7) * 5;
}
// END mchatai-web-components: entities.word-trace-grid
