export class GridMover {
  constructor(options = {}) {
    this.row = options.row ?? 0;
    this.col = options.col ?? 0;
    this.direction = options.direction ?? { row: 0, col: 0 };
    this.moveDelay = options.moveDelay ?? 0.12;
    this.elapsed = 0;
    this.canEnter = options.canEnter ?? (() => true);
  }

  setDirection(direction) {
    this.direction = {
      row: Math.sign(direction.row ?? 0),
      col: Math.sign(direction.col ?? 0)
    };
  }

  snapTo(row, col) {
    this.row = row;
    this.col = col;
    this.elapsed = 0;
  }

  update(dt, board) {
    this.elapsed += dt;
    if (this.elapsed < this.moveDelay) {
      return false;
    }

    const next = {
      row: this.row + this.direction.row,
      col: this.col + this.direction.col
    };
    const normalized = board?.normalize ? board.normalize(next.row, next.col) : next;
    if (!board || (board.inBounds(normalized.row, normalized.col) && this.canEnter(normalized, board))) {
      this.row = normalized.row;
      this.col = normalized.col;
      this.elapsed = 0;
      return true;
    }
    return false;
  }

  worldPosition(board, center = true) {
    return board.cellToWorld(this.row, this.col, center);
  }
}
