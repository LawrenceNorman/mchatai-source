export class Match3Logic {
  constructor(options = {}) {
    this.minRun = options.minRun ?? 3;
    this.emptyValue = options.emptyValue ?? null;
    this.randomTile = options.randomTile ?? (() => null);
    this.equals = options.equals ?? ((a, b) => a != null && a === b);
  }

  findMatches(board) {
    const matches = new Map();
    const addRun = (cells) => {
      if (cells.length < this.minRun) {
        return;
      }
      for (const cell of cells) {
        matches.set(`${cell.row},${cell.col}`, cell);
      }
    };

    for (let row = 0; row < board.rows; row += 1) {
      let run = [];
      for (let col = 0; col < board.cols; col += 1) {
        const value = board.get(row, col);
        const previous = run.length ? board.get(run[0].row, run[0].col) : undefined;
        if (run.length && this.equals(value, previous)) {
          run.push({ row, col, value });
        } else {
          addRun(run);
          run = value == null ? [] : [{ row, col, value }];
        }
      }
      addRun(run);
    }

    for (let col = 0; col < board.cols; col += 1) {
      let run = [];
      for (let row = 0; row < board.rows; row += 1) {
        const value = board.get(row, col);
        const previous = run.length ? board.get(run[0].row, run[0].col) : undefined;
        if (run.length && this.equals(value, previous)) {
          run.push({ row, col, value });
        } else {
          addRun(run);
          run = value == null ? [] : [{ row, col, value }];
        }
      }
      addRun(run);
    }

    return [...matches.values()];
  }

  clearMatches(board, matches) {
    for (const cell of matches) {
      board.set(cell.row, cell.col, this.emptyValue);
    }
    return matches.length;
  }

  collapseColumns(board) {
    for (let col = 0; col < board.cols; col += 1) {
      const kept = [];
      for (let row = board.rows - 1; row >= 0; row -= 1) {
        const value = board.get(row, col);
        if (value !== this.emptyValue) {
          kept.push(value);
        }
      }
      for (let row = board.rows - 1; row >= 0; row -= 1) {
        const next = kept.shift();
        board.set(row, col, next === undefined ? this.randomTile(row, col, board) : next);
      }
    }
  }

  resolve(board, maxCycles = 12) {
    let totalCleared = 0;
    const cascades = [];
    for (let cycle = 0; cycle < maxCycles; cycle += 1) {
      const matches = this.findMatches(board);
      if (!matches.length) {
        break;
      }
      totalCleared += this.clearMatches(board, matches);
      this.collapseColumns(board);
      cascades.push(matches);
    }
    return { totalCleared, cascades };
  }
}
