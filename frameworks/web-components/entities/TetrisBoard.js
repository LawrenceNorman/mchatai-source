// BEGIN mchatai-web-components: entities.tetris-board (entities/TetrisBoard.js)
//
// PLAIN JS CLASS — NOT A WEB CUSTOM ELEMENT.
// DO NOT call customElements.define() on this class.
// DO NOT use <tetrisboard-foo> tags in HTML.
// Instantiate with `new` and call methods. YOU draw the UI.
// See wisdom rule fs-015 for the full pattern + worked examples.
//
import { GridBoard } from "./GridBoard.js";

/**
 * Standard Tetris game board (10 cols × 20 rows by default) with the seven
 * canonical tetrominoes (I/O/T/L/J/S/Z), wall-kick-aware rotation, soft
 * drop, hard drop, and line-clear scoring.
 *
 * Mechanics:
 *   - Cells store color codes (1-7 = piece colors; 0 = empty).
 *   - Active piece tracked separately (this.active = {kind, rot, row, col}).
 *   - tick() applies gravity (move active down 1 row); if blocked, locks the
 *     piece into the grid + spawns next.
 *   - move(dx) slides horizontally; rotate(dir) rotates with simple wall-kick
 *     (try base, then ±1 col offset).
 *   - hardDrop() drops the piece all the way + locks immediately.
 *   - clearLines() runs after each lock; awards score per Tetris standard
 *     (1=100, 2=300, 3=500, 4=800) × level.
 *
 * Standard scoring: levels increase every 10 lines cleared; gravity speed
 * scales 1 - 0.05*level per cell-fall (0 = freeze, 1 = instant).
 *
 * Caller drives the game loop with setInterval(grid.tick, gravity_ms) and
 * handles input → grid.move/rotate/hardDrop. Renderer reads cells + active.
 */

const TETROMINOES = {
  I: {
    color: 1,
    rotations: [
      [[1,1,1,1]],
      [[1],[1],[1],[1]]
    ]
  },
  O: {
    color: 2,
    rotations: [[[1,1],[1,1]]]
  },
  T: {
    color: 3,
    rotations: [
      [[1,1,1],[0,1,0]],
      [[1,0],[1,1],[1,0]],
      [[0,1,0],[1,1,1]],
      [[0,1],[1,1],[0,1]]
    ]
  },
  L: {
    color: 4,
    rotations: [
      [[1,0],[1,0],[1,1]],
      [[1,1,1],[1,0,0]],
      [[1,1],[0,1],[0,1]],
      [[0,0,1],[1,1,1]]
    ]
  },
  J: {
    color: 5,
    rotations: [
      [[0,1],[0,1],[1,1]],
      [[1,0,0],[1,1,1]],
      [[1,1],[1,0],[1,0]],
      [[1,1,1],[0,0,1]]
    ]
  },
  S: {
    color: 6,
    rotations: [
      [[0,1,1],[1,1,0]],
      [[1,0],[1,1],[0,1]]
    ]
  },
  Z: {
    color: 7,
    rotations: [
      [[1,1,0],[0,1,1]],
      [[0,1],[1,1],[1,0]]
    ]
  }
};

const KIND_KEYS = ["I", "O", "T", "L", "J", "S", "Z"];

export class TetrisBoard extends GridBoard {
  constructor(options = {}) {
    super({
      ...options,
      rows: options.rows ?? 20,
      cols: options.cols ?? 10,
      fill: 0
    });
    this.score = 0;
    this.level = 1;
    this.lines = 0;
    this.active = null; // { kind, rot, row, col }
    this.nextKind = null;
    this.gameOver = false;
    this.bag = []; // 7-bag random for fairer piece distribution
  }

  newGame() {
    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.cols; c += 1) this.set(r, c, 0);
    }
    this.score = 0;
    this.level = 1;
    this.lines = 0;
    this.bag = [];
    this.nextKind = this._drawFromBag();
    this.gameOver = false;
    this._spawnNext();
  }

  /** Standard 7-bag: shuffle all 7 pieces, deal one at a time, refill when empty. */
  _drawFromBag() {
    if (this.bag.length === 0) {
      this.bag = KIND_KEYS.slice();
      for (let i = this.bag.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop();
  }

  _spawnNext() {
    const kind = this.nextKind ?? this._drawFromBag();
    this.nextKind = this._drawFromBag();
    const shape = TETROMINOES[kind].rotations[0];
    const cols = shape[0].length;
    const startCol = Math.floor((this.cols - cols) / 2);
    const candidate = { kind, rot: 0, row: 0, col: startCol };
    if (!this._fits(candidate)) {
      this.gameOver = true;
      return;
    }
    this.active = candidate;
  }

  /** Check if the piece (kind, rot, row, col) fits without collision. */
  _fits(piece) {
    const shape = TETROMINOES[piece.kind].rotations[piece.rot];
    for (let r = 0; r < shape.length; r += 1) {
      for (let c = 0; c < shape[r].length; c += 1) {
        if (!shape[r][c]) continue;
        const br = piece.row + r;
        const bc = piece.col + c;
        if (br < 0 || br >= this.rows) return false;
        if (bc < 0 || bc >= this.cols) return false;
        if (this.get(br, bc) !== 0) return false;
      }
    }
    return true;
  }

  /** Move active piece by (dr, dc). Returns true if it moved. */
  move(dr, dc) {
    if (!this.active || this.gameOver) return false;
    const cand = { ...this.active, row: this.active.row + dr, col: this.active.col + dc };
    if (this._fits(cand)) {
      this.active = cand;
      return true;
    }
    return false;
  }

  /** Rotate the active piece. dir: +1 = clockwise (standard), -1 = counter-clockwise.
   *  Tries simple wall-kick: base pos, then -1 col, +1 col, -2 col, +2 col. */
  rotate(dir = 1) {
    if (!this.active || this.gameOver) return false;
    const rotations = TETROMINOES[this.active.kind].rotations;
    const newRot = ((this.active.rot + dir) % rotations.length + rotations.length) % rotations.length;
    const kicks = [0, -1, 1, -2, 2];
    for (const dx of kicks) {
      const cand = { ...this.active, rot: newRot, col: this.active.col + dx };
      if (this._fits(cand)) {
        this.active = cand;
        return true;
      }
    }
    return false;
  }

  /** One gravity tick. If can't move down, lock + spawn next. */
  tick() {
    if (this.gameOver || !this.active) return { locked: false, linesCleared: 0 };
    if (this.move(1, 0)) return { locked: false, linesCleared: 0 };
    return this._lockAndAdvance();
  }

  /** Hard drop: descend until blocked, then lock. */
  hardDrop() {
    if (!this.active || this.gameOver) return { locked: false, linesCleared: 0, dropDistance: 0 };
    let drop = 0;
    while (this.move(1, 0)) drop += 1;
    const out = this._lockAndAdvance();
    out.dropDistance = drop;
    this.score += drop * 2; // hard-drop bonus
    return out;
  }

  /** Soft drop: same as one tick, but caller awards points. Returns true if moved. */
  softDrop() {
    if (this.move(1, 0)) {
      this.score += 1;
      return true;
    }
    // Couldn't move — lock
    this._lockAndAdvance();
    return false;
  }

  _lockAndAdvance() {
    const piece = this.active;
    const shape = TETROMINOES[piece.kind].rotations[piece.rot];
    const color = TETROMINOES[piece.kind].color;
    for (let r = 0; r < shape.length; r += 1) {
      for (let c = 0; c < shape[r].length; c += 1) {
        if (shape[r][c]) {
          this.set(piece.row + r, piece.col + c, color);
        }
      }
    }
    const linesCleared = this._clearLines();
    this.active = null;
    this._spawnNext();
    return { locked: true, linesCleared };
  }

  _clearLines() {
    let cleared = 0;
    for (let r = this.rows - 1; r >= 0; r -= 1) {
      let full = true;
      for (let c = 0; c < this.cols; c += 1) {
        if (this.get(r, c) === 0) { full = false; break; }
      }
      if (full) {
        // Remove row r, drop everything above by 1
        for (let rr = r; rr > 0; rr -= 1) {
          for (let c = 0; c < this.cols; c += 1) {
            this.set(rr, c, this.get(rr - 1, c));
          }
        }
        for (let c = 0; c < this.cols; c += 1) this.set(0, c, 0);
        cleared += 1;
        r += 1; // re-check this row (everything shifted down)
      }
    }
    if (cleared > 0) {
      const lineScores = [0, 100, 300, 500, 800];
      this.score += (lineScores[cleared] ?? 800) * this.level;
      this.lines += cleared;
      this.level = 1 + Math.floor(this.lines / 10);
    }
    return cleared;
  }

  /** Project where the active piece would land (for the "ghost" preview). */
  ghostPosition() {
    if (!this.active) return null;
    let row = this.active.row;
    while (this._fits({ ...this.active, row: row + 1 })) row += 1;
    return { ...this.active, row };
  }

  /** Gravity interval (ms) for the current level. Standard NES Tetris approximation. */
  gravityMs() {
    const base = 1000;
    return Math.max(60, Math.floor(base * Math.pow(0.85, this.level - 1)));
  }

  /** Static color palette for piece colors 1-7. Caller can substitute. */
  static get COLORS() {
    return {
      0: "transparent",
      1: "#06b6d4", // I — cyan
      2: "#fbbf24", // O — yellow
      3: "#a855f7", // T — purple
      4: "#f97316", // L — orange
      5: "#3b82f6", // J — blue
      6: "#22c55e", // S — green
      7: "#ef4444"  // Z — red
    };
  }

  /** Read-only access to tetromino shapes (for next-piece preview rendering). */
  static get TETROMINOES() {
    return TETROMINOES;
  }
}
// END mchatai-web-components: entities.tetris-board
