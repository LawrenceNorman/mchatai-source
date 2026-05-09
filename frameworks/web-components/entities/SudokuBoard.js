// BEGIN mchatai-web-components: entities.sudoku-board (entities/SudokuBoard.js)
import { GridBoard } from "./GridBoard.js";

/**
 * Sudoku 9×9 board with 3×3 subgrid validation.
 *
 * Mechanics:
 *   - 9×9 grid; cells hold integers 1-9 or 0 (empty).
 *   - Pre-filled "clue" cells are LOCKED (cannot be edited).
 *   - setCell(r, c, value) writes 1-9 (or 0 to clear) only into UNLOCKED cells.
 *   - validateCell(r, c) returns the conflict set (cells that conflict with
 *     this cell's value). Empty set = valid.
 *   - isComplete() — all cells filled AND no conflicts.
 *   - isFilled() — all cells filled (regardless of correctness).
 *   - solve() — backtracking solver; sets all cells in-place. Returns true
 *     on solvable, false otherwise.
 *
 * Each cell carries: { value: 0-9, locked: bool, notes: Set<1-9> }.
 * `notes` is for the pencil-mark UI feature (small candidate digits in a
 * cell before committing). Caller manages note display.
 *
 * Puzzle generation: SudokuBoard.generatePuzzle(difficulty) returns a fresh
 * board with N clues based on difficulty ("easy" | "medium" | "hard" | "expert").
 * Difficulty maps to clue count: easy=40, medium=32, hard=26, expert=22.
 */
export class SudokuBoard extends GridBoard {
  constructor(options = {}) {
    super({
      ...options,
      rows: 9,
      cols: 9,
      fill: () => ({ value: 0, locked: false, notes: new Set() })
    });
  }

  /** Reset board to empty (all cells 0, unlocked, no notes). */
  reset() {
    for (let r = 0; r < 9; r += 1) {
      for (let c = 0; c < 9; c += 1) {
        this.set(r, c, { value: 0, locked: false, notes: new Set() });
      }
    }
  }

  /** Load a puzzle from a 81-char string (digits 1-9 or '.', '0' for empty)
   *  OR a 2D array. All non-zero cells become LOCKED clues. */
  loadPuzzle(input) {
    this.reset();
    if (typeof input === "string") {
      const flat = input.replace(/[^0-9.]/g, "").replace(/\./g, "0");
      if (flat.length !== 81) throw new Error(`puzzle string must be 81 digits, got ${flat.length}`);
      for (let i = 0; i < 81; i += 1) {
        const r = Math.floor(i / 9);
        const c = i % 9;
        const v = parseInt(flat[i], 10);
        this.set(r, c, { value: v, locked: v !== 0, notes: new Set() });
      }
    } else if (Array.isArray(input)) {
      for (let r = 0; r < 9; r += 1) {
        for (let c = 0; c < 9; c += 1) {
          const v = input[r]?.[c] ?? 0;
          this.set(r, c, { value: v, locked: v !== 0, notes: new Set() });
        }
      }
    }
  }

  /** Get the numeric value (0-9) of a cell. */
  valueAt(row, col) {
    return this.get(row, col)?.value ?? 0;
  }

  /** Set a cell's value (1-9 or 0 to clear). No-op on locked cells.
   *  Returns true on success, false on locked / out-of-bounds / invalid value. */
  setCell(row, col, value) {
    const cell = this.get(row, col);
    if (!cell || cell.locked) return false;
    if (value < 0 || value > 9) return false;
    cell.value = value;
    if (value !== 0) cell.notes.clear();
    return true;
  }

  /** Toggle a pencil-mark note on a cell. Returns true on toggle, false on
   *  locked cell. Notes are cleared when the cell gets a real value. */
  toggleNote(row, col, value) {
    const cell = this.get(row, col);
    if (!cell || cell.locked) return false;
    if (value < 1 || value > 9) return false;
    if (cell.notes.has(value)) cell.notes.delete(value);
    else cell.notes.add(value);
    return true;
  }

  /** Find every cell that conflicts with (row, col). Returns Set of "r,c"
   *  string keys. Empty set = no conflicts. */
  validateCell(row, col) {
    const conflicts = new Set();
    const v = this.valueAt(row, col);
    if (v === 0) return conflicts;
    // Row conflicts
    for (let cc = 0; cc < 9; cc += 1) {
      if (cc !== col && this.valueAt(row, cc) === v) {
        conflicts.add(`${row},${cc}`);
      }
    }
    // Column conflicts
    for (let rr = 0; rr < 9; rr += 1) {
      if (rr !== row && this.valueAt(rr, col) === v) {
        conflicts.add(`${rr},${col}`);
      }
    }
    // 3×3 subgrid conflicts
    const r0 = Math.floor(row / 3) * 3;
    const c0 = Math.floor(col / 3) * 3;
    for (let rr = r0; rr < r0 + 3; rr += 1) {
      for (let cc = c0; cc < c0 + 3; cc += 1) {
        if ((rr !== row || cc !== col) && this.valueAt(rr, cc) === v) {
          conflicts.add(`${rr},${cc}`);
        }
      }
    }
    return conflicts;
  }

  /** All conflict cells across the entire board. Useful for "show errors" mode. */
  allConflicts() {
    const all = new Set();
    for (let r = 0; r < 9; r += 1) {
      for (let c = 0; c < 9; c += 1) {
        const conflicts = this.validateCell(r, c);
        if (conflicts.size > 0) {
          all.add(`${r},${c}`);
          for (const k of conflicts) all.add(k);
        }
      }
    }
    return all;
  }

  /** Allowed digits 1-9 that don't already appear in the row/col/subgrid. */
  candidates(row, col) {
    const used = new Set();
    for (let cc = 0; cc < 9; cc += 1) used.add(this.valueAt(row, cc));
    for (let rr = 0; rr < 9; rr += 1) used.add(this.valueAt(rr, col));
    const r0 = Math.floor(row / 3) * 3;
    const c0 = Math.floor(col / 3) * 3;
    for (let rr = r0; rr < r0 + 3; rr += 1) {
      for (let cc = c0; cc < c0 + 3; cc += 1) {
        used.add(this.valueAt(rr, cc));
      }
    }
    const out = [];
    for (let v = 1; v <= 9; v += 1) {
      if (!used.has(v)) out.push(v);
    }
    return out;
  }

  /** True if all 81 cells have a non-zero value. */
  isFilled() {
    for (let r = 0; r < 9; r += 1) {
      for (let c = 0; c < 9; c += 1) {
        if (this.valueAt(r, c) === 0) return false;
      }
    }
    return true;
  }

  /** True if filled AND no conflicts (= solved). */
  isComplete() {
    if (!this.isFilled()) return false;
    return this.allConflicts().size === 0;
  }

  /** Backtracking solver. Mutates the board in-place. Returns true on
   *  success (puzzle was solvable), false otherwise. */
  solve() {
    return this._solveFrom(0);
  }
  _solveFrom(idx) {
    if (idx >= 81) return true;
    const r = Math.floor(idx / 9);
    const c = idx % 9;
    if (this.valueAt(r, c) !== 0) return this._solveFrom(idx + 1);
    for (const v of this.candidates(r, c)) {
      this.setCell(r, c, v); // ignores locked but at this stage we're solving fresh
      if (this._solveFrom(idx + 1)) return true;
    }
    this.setCell(r, c, 0);
    return false;
  }

  /** Generate a new puzzle at a difficulty level. Returns a SudokuBoard
   *  with the chosen number of clues locked, the rest empty.
   *  Difficulty → clue count: easy=40 | medium=32 | hard=26 | expert=22.
   *
   *  Implementation: build a fully-solved random board, then randomly remove
   *  cells until the clue count is reached. (Doesn't check uniqueness — for
   *  puzzles that need verified-unique-solution, use a more elaborate
   *  generator. This works for most casual play.) */
  static generatePuzzle(difficulty = "medium") {
    const counts = { easy: 40, medium: 32, hard: 26, expert: 22 };
    const targetClues = counts[difficulty] ?? counts.medium;
    const board = new SudokuBoard();
    // Step 1: build a solved board by filling with backtracking + shuffled candidates.
    board._fillSolution();
    // Step 2: remove cells until we have targetClues clues left.
    const positions = [];
    for (let r = 0; r < 9; r += 1) {
      for (let c = 0; c < 9; c += 1) positions.push({ r, c });
    }
    SudokuBoard._shuffle(positions);
    let clueCount = 81;
    for (const { r, c } of positions) {
      if (clueCount <= targetClues) break;
      board.setCell(r, c, 0);
      clueCount -= 1;
    }
    // Step 3: lock the remaining clues.
    for (let r = 0; r < 9; r += 1) {
      for (let c = 0; c < 9; c += 1) {
        const cell = board.get(r, c);
        if (cell.value !== 0) cell.locked = true;
      }
    }
    return board;
  }

  /** Internal: fill an empty board with a randomized valid solution. */
  _fillSolution() {
    return this._fillSolutionFrom(0);
  }
  _fillSolutionFrom(idx) {
    if (idx >= 81) return true;
    const r = Math.floor(idx / 9);
    const c = idx % 9;
    if (this.valueAt(r, c) !== 0) return this._fillSolutionFrom(idx + 1);
    const cands = this.candidates(r, c);
    SudokuBoard._shuffle(cands);
    for (const v of cands) {
      this.setCell(r, c, v);
      if (this._fillSolutionFrom(idx + 1)) return true;
    }
    this.setCell(r, c, 0);
    return false;
  }

  static _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
// END mchatai-web-components: entities.sudoku-board
