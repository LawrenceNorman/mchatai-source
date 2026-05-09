// BEGIN mchatai-web-components: entities.swipe-tile-grid (entities/SwipeTileGrid.js)
import { GridBoard } from "./GridBoard.js";

/**
 * Swipe-merge tile grid for 2048 / Threes / Doodle Merge clones.
 *
 * Mechanics:
 *   - NxN grid of numeric tiles. 0 = empty.
 *   - swipe(direction) slides ALL tiles in that direction (up|down|left|right);
 *     adjacent tiles with the same value merge into their sum.
 *   - Each tile can only merge ONCE per swipe (classic 2048 rule).
 *   - spawnRandomTile() places a 2 (90%) or 4 (10%) in a random empty cell.
 *   - canMove() returns true if any swipe direction would change state.
 *
 * Returns from swipe(): {
 *   moved: boolean,    // any tile moved or merged
 *   merged: number,    // total points gained this swipe (sum of merged values)
 *   mergedTiles: [{row,col,from,to}]  // for animation hooks
 * }
 *
 * Rendering-agnostic. App glue handles touch/keyboard input + animation.
 * For mobile (mob-005), wire pointerdown + pointerup with delta-X/Y direction
 * detection. For desktop, listen for keydown ArrowUp/Down/Left/Right.
 */
export class SwipeTileGrid extends GridBoard {
  constructor(options = {}) {
    super({
      ...options,
      rows: options.size ?? 4,
      cols: options.size ?? 4,
      fill: 0
    });
    this.winValue = options.winValue ?? 2048;
    this.spawnValues = options.spawnValues ?? [2, 2, 2, 2, 2, 2, 2, 2, 2, 4]; // 90/10 weighted
    this.score = 0;
    this.bestTile = 0;
    this.moveCount = 0;
    this.hasReachedWinValue = false;
  }

  /** Reset to a fresh game with two starting tiles. */
  newGame() {
    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.cols; c += 1) {
        this.set(r, c, 0);
      }
    }
    this.score = 0;
    this.bestTile = 0;
    this.moveCount = 0;
    this.hasReachedWinValue = false;
    this.spawnRandomTile();
    this.spawnRandomTile();
  }

  /** Spawn a 2 or 4 (per spawnValues weighting) in a random empty cell.
   *  Returns {row, col, value} of the spawn or null if no empty cells. */
  spawnRandomTile() {
    const empty = this.emptyCells();
    if (empty.length === 0) return null;
    const { row, col } = empty[Math.floor(Math.random() * empty.length)];
    const value = this.spawnValues[Math.floor(Math.random() * this.spawnValues.length)];
    this.set(row, col, value);
    if (value > this.bestTile) this.bestTile = value;
    return { row, col, value };
  }

  /** Array of {row, col} for empty cells. */
  emptyCells() {
    const out = [];
    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.cols; c += 1) {
        if (this.get(r, c) === 0) out.push({ row: r, col: c });
      }
    }
    return out;
  }

  /** Apply a swipe in `direction` ("up" | "down" | "left" | "right").
   *  Returns {moved, merged, mergedTiles}. */
  swipe(direction) {
    const before = this.snapshotState();
    let totalMerged = 0;
    const mergedTiles = [];

    const apply = (lineGetter, lineSetter, len) => {
      for (let i = 0; i < (direction === "up" || direction === "down" ? this.cols : this.rows); i += 1) {
        // Pull the line, drop zeros, merge adjacent same-values, pad with zeros at end
        const line = lineGetter(i);
        const reverse = (direction === "right" || direction === "down");
        const work = reverse ? line.slice().reverse() : line.slice();
        const compact = work.filter((v) => v !== 0);
        const merged = [];
        for (let j = 0; j < compact.length; j += 1) {
          if (j + 1 < compact.length && compact[j] === compact[j + 1]) {
            const sum = compact[j] * 2;
            merged.push(sum);
            totalMerged += sum;
            mergedTiles.push({ value: sum });
            if (sum >= this.winValue) this.hasReachedWinValue = true;
            if (sum > this.bestTile) this.bestTile = sum;
            j += 1; // skip the partner
          } else {
            merged.push(compact[j]);
          }
        }
        while (merged.length < len) merged.push(0);
        const final = reverse ? merged.reverse() : merged;
        lineSetter(i, final);
      }
    };

    if (direction === "left" || direction === "right") {
      apply(
        (i) => this.cells[i].slice(),
        (i, line) => { this.cells[i] = line.slice(); },
        this.cols
      );
    } else if (direction === "up" || direction === "down") {
      apply(
        (i) => this.cells.map((row) => row[i]),
        (i, line) => { for (let r = 0; r < this.rows; r += 1) this.cells[r][i] = line[r]; },
        this.rows
      );
    }

    const moved = !this.statesEqual(before, this.snapshotState());
    if (moved) {
      this.score += totalMerged;
      this.moveCount += 1;
    }
    return { moved, merged: totalMerged, mergedTiles };
  }

  /** Capture the current grid as a flat array for state-equality comparison. */
  snapshotState() {
    const out = [];
    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.cols; c += 1) {
        out.push(this.get(r, c));
      }
    }
    return out;
  }
  statesEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
    return true;
  }

  /** Returns true if any direction would produce a movement. */
  canMove() {
    if (this.emptyCells().length > 0) return true;
    // No empty cells; check for adjacent matches.
    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.cols; c += 1) {
        const v = this.get(r, c);
        if (this.get(r, c + 1) === v) return true;
        if (this.get(r + 1, c) === v) return true;
      }
    }
    return false;
  }

  /** True if the grid has the win-value tile but the player hasn't kept playing past it. */
  isWin() {
    return this.hasReachedWinValue;
  }

  /** True if no moves are possible. */
  isGameOver() {
    return !this.canMove();
  }

  /** Detect swipe direction from pointer-start to pointer-end coords.
   *  Returns "left" | "right" | "up" | "down" | null for taps below threshold.
   *  threshold is in pixels; default 30. */
  static directionFromSwipe(startX, startY, endX, endY, threshold = 30) {
    const dx = endX - startX;
    const dy = endY - startY;
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return null;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
    return dy > 0 ? "down" : "up";
  }
}
// END mchatai-web-components: entities.swipe-tile-grid
