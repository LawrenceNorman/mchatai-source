// BEGIN mchatai-web-components: entities.crossword-generator (entities/CrosswordGenerator.js)

/**
 * Deterministic crossword GENERATOR. Give it a big bank of { answer, clue }
 * items (see resources/crossword-dictionary.json - 400+ entries) and it
 * assembles a real interlocking mini/midi crossword: a filled grid, block
 * cells, clue numbering, and across/down clue lists. This is the piece that
 * turns a deep dictionary into "good crosswords" automatically.
 *
 * Why a generator (not a hardcoded grid): a single authored puzzle is one
 * puzzle. A generator + a 400-word bank is effectively unlimited fresh puzzles,
 * and a weak model only has to call generate() - the hard interlocking logic
 * lives here, in the Lego, not in the generated app.
 *
 * Determinism: pass a numeric `seed` for reproducible puzzles (daily-puzzle
 * mode + golden-replay QA). Same seed + same bank + same options => identical
 * grid. No Math.random() (it breaks replay).
 *
 * Usage:
 *   import { CrosswordGenerator } from "./web-components/CrosswordGenerator.js";
 *   import BANK from "./web-components/crossword-dictionary.json" assert { type: "json" };
 *   const gen = new CrosswordGenerator({ size: 9, maxWords: 14, seed: 42 });
 *   const puz = gen.generate(BANK.entries);
 *   // puz = { size, grid:[[ "C"|"#"|null ]], blocks, numbers:{"r,c":n},
 *   //         across:[{number,row,col,answer,clue}], down:[...], wordCount }
 *   // grid[r][c] is the SOLUTION letter, "#" is a block, null is unused (render as block).
 *
 * The output's `grid` (with null -> "#") drops straight into the classic
 * CrosswordGame render format (a 2D letter/# array + numbered clue lists).
 */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

const ACROSS = "across";
const DOWN = "down";

export class CrosswordGenerator {
  /**
   * @param {{size?:number, maxWords?:number, minWords?:number, seed?:number,
   *          attempts?:number, maxLen?:number}} [opts]
   */
  constructor(opts = {}) {
    this.size = clampInt(opts.size, 5, 15, 9);
    this.maxWords = clampInt(opts.maxWords, 3, 60, 14);
    this.minWords = clampInt(opts.minWords, 2, 60, Math.min(6, this.maxWords));
    this.seed = (Number.isFinite(opts.seed) ? opts.seed : 1) >>> 0;
    this.attempts = clampInt(opts.attempts, 1, 40, 12);
    this.maxLen = clampInt(opts.maxLen, 3, this.size, this.size);
  }

  /** Normalize a raw bank into clean { answer (A-Z upper), clue } usable words. */
  normalize(items) {
    const seen = new Set();
    const out = [];
    for (const it of items || []) {
      if (!it) continue;
      const answer = String(it.answer || it.word || "").toUpperCase().replace(/[^A-Z]/g, "");
      const clue = String(it.clue || it.prompt || "").trim();
      if (answer.length < 3 || answer.length > this.maxLen || !clue) continue;
      if (seen.has(answer)) continue;
      seen.add(answer);
      out.push({ answer, clue });
    }
    return out;
  }

  /**
   * Generate the densest valid puzzle found across `attempts` seeded tries.
   * Returns null only if even a single seed word can't be placed.
   */
  generate(items) {
    const pool = this.normalize(items);
    if (!pool.length) return null;
    let best = null;
    for (let a = 0; a < this.attempts; a++) {
      const seed = (this.seed + a * 0x9E3779B1) >>> 0;
      const built = this._build(pool, seed);
      if (built && (!best || this._score(built) > this._score(best))) best = built;
    }
    return best ? this._finalize(best) : null;
  }

  _score(b) {
    // Prefer more words AND more intersections (denser, more "crossword-like").
    return b.placed.length * 100 + b.intersections * 10 - b.cellsUsed;
  }

  _build(pool, seed) {
    const rng = mulberry32(seed);
    const N = this.size;
    const words = shuffleInPlace(pool.slice(), rng);
    const grid = Array.from({ length: N }, () => Array(N).fill(null));
    const placed = [];
    let intersections = 0;

    // Seed word: a medium/long word that fits, placed across near the center.
    const target = Math.min(this.maxLen, N);
    let seedIdx = words.findIndex(w => w.answer.length >= Math.min(5, target) && w.answer.length <= target);
    if (seedIdx < 0) seedIdx = words.findIndex(w => w.answer.length <= target);
    if (seedIdx < 0) return null;
    const seedWord = words[seedIdx];
    const r0 = Math.floor(N / 2);
    const c0 = Math.max(0, Math.floor((N - seedWord.answer.length) / 2));
    this._place(grid, placed, seedWord, r0, c0, ACROSS);

    // Greedily add words that intersect what's already on the grid.
    let progressed = true;
    while (progressed && placed.length < this.maxWords) {
      progressed = false;
      for (const w of words) {
        if (placed.length >= this.maxWords) break;
        if (placed.some(p => p.answer === w.answer)) continue;
        const spot = this._bestSpot(grid, w.answer, N);
        if (spot) {
          this._place(grid, placed, w, spot.row, spot.col, spot.dir);
          intersections += spot.crosses;
          progressed = true;
        }
      }
    }

    if (placed.length < this.minWords) return null;
    let cellsUsed = 0;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r][c]) cellsUsed++;
    return { grid, placed, N, intersections, cellsUsed };
  }

  /** Best valid placement (most crossings) for `answer` against the grid. */
  _bestSpot(grid, answer, N) {
    let best = null;
    for (const dir of [ACROSS, DOWN]) {
      for (let i = 0; i < answer.length; i++) {
        const letter = answer[i];
        for (let r = 0; r < N; r++) {
          for (let c = 0; c < N; c++) {
            if (grid[r][c] !== letter) continue;
            // align answer[i] onto (r,c)
            const row = dir === ACROSS ? r : r - i;
            const col = dir === ACROSS ? c - i : c;
            const crosses = this._countValid(grid, answer, row, col, dir, N);
            if (crosses > 0 && (!best || crosses > best.crosses)) {
              best = { row, col, dir, crosses };
            }
          }
        }
      }
    }
    return best;
  }

  /**
   * Returns the number of intersections if `answer` can be legally placed at
   * (row,col,dir), or -1 if the placement is invalid. Crossword legality:
   *  - in bounds; the cell before the start and after the end must be empty;
   *  - every overlapped cell is empty (no neighbor) or already holds the same
   *    letter (a valid crossing);
   *  - for cells we ADD (not crossings), the two perpendicular neighbors must be
   *    empty, so the new word never runs parallel-adjacent to another word.
   */
  _countValid(grid, answer, row, col, dir, N) {
    const dr = dir === DOWN ? 1 : 0;
    const dc = dir === ACROSS ? 1 : 0;
    const len = answer.length;
    if (row < 0 || col < 0) return -1;
    const endR = row + dr * (len - 1);
    const endC = col + dc * (len - 1);
    if (endR >= N || endC >= N) return -1;
    // cell immediately before start / after end must be empty
    if (this._cell(grid, row - dr, col - dc, N) !== null) return -1;
    if (this._cell(grid, endR + dr, endC + dc, N) !== null) return -1;

    let crosses = 0;
    for (let k = 0; k < len; k++) {
      const r = row + dr * k;
      const c = col + dc * k;
      const cur = grid[r][c];
      if (cur === null) {
        // new cell: perpendicular neighbors must be empty (no parallel touch)
        const pr = dir === ACROSS ? 1 : 0;
        const pc = dir === ACROSS ? 0 : 1;
        if (this._cell(grid, r - pr, c - pc, N) !== null) return -1;
        if (this._cell(grid, r + pr, c + pc, N) !== null) return -1;
      } else if (cur === answer[k]) {
        crosses++; // valid crossing
      } else {
        return -1; // letter conflict
      }
    }
    return crosses;
  }

  _cell(grid, r, c, N) {
    if (r < 0 || c < 0 || r >= N || c >= N) return null;
    return grid[r][c];
  }

  _place(grid, placed, word, row, col, dir) {
    const dr = dir === DOWN ? 1 : 0;
    const dc = dir === ACROSS ? 1 : 0;
    for (let k = 0; k < word.answer.length; k++) {
      grid[row + dr * k][col + dc * k] = word.answer[k];
    }
    placed.push({ answer: word.answer, clue: word.clue, row, col, dir });
  }

  /** Trim to the used bounding box, number the cells, build clue lists. */
  _finalize(b) {
    const { grid, placed } = b;
    let minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
    for (let r = 0; r < b.N; r++) for (let c = 0; c < b.N; c++) {
      if (grid[r][c]) { minR = Math.min(minR, r); minC = Math.min(minC, c); maxR = Math.max(maxR, r); maxC = Math.max(maxC, c); }
    }
    const rows = maxR - minR + 1;
    const cols = maxC - minC + 1;
    // Build a trimmed letter grid with "#" for unused cells.
    const out = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => grid[r + minR][c + minC] || "#"));

    // Shift placements into trimmed coords.
    const shifted = placed.map(p => ({ ...p, row: p.row - minR, col: p.col - minC }));

    // Number every cell that starts an across and/or down word.
    const numbers = {};
    let n = 0;
    const across = [];
    const down = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (out[r][c] === "#") continue;
        const startsAcross = (c === 0 || out[r][c - 1] === "#") && c + 1 < cols && out[r][c + 1] !== "#";
        const startsDown = (r === 0 || out[r - 1][c] === "#") && r + 1 < rows && out[r + 1][c] !== "#";
        if (startsAcross || startsDown) {
          n += 1;
          numbers[`${r},${c}`] = n;
          if (startsAcross) {
            const w = shifted.find(p => p.dir === ACROSS && p.row === r && p.col === c);
            if (w) across.push({ number: n, row: r, col: c, answer: w.answer, clue: w.clue });
          }
          if (startsDown) {
            const w = shifted.find(p => p.dir === DOWN && p.row === r && p.col === c);
            if (w) down.push({ number: n, row: r, col: c, answer: w.answer, clue: w.clue });
          }
        }
      }
    }
    across.sort((a, z) => a.number - z.number);
    down.sort((a, z) => a.number - z.number);
    return {
      size: Math.max(rows, cols),
      rows, cols,
      grid: out,                 // SOLUTION letters, "#" = block
      numbers,                   // "r,c" -> clue number
      across, down,              // [{number,row,col,answer,clue}]
      wordCount: shifted.length,
      seed: this.seed,
    };
  }
}

function clampInt(v, lo, hi, dflt) {
  const n = Number.isFinite(v) ? Math.round(v) : dflt;
  return Math.max(lo, Math.min(hi, n));
}

// END mchatai-web-components: entities.crossword-generator
