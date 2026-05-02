export class TileSwapper {
  constructor(options = {}) {
    this.selected = null;
    this.canSwap = options.canSwap ?? this.areAdjacent;
    this.onSwap = options.onSwap ?? (() => {});
  }

  select(row, col) {
    const current = { row, col };
    if (!this.selected) {
      this.selected = current;
      return { selected: current, swapped: false };
    }
    const previous = this.selected;
    this.selected = current;
    return { selected: current, previous, swapped: false };
  }

  trySwap(board, row, col) {
    if (!this.selected) {
      this.selected = { row, col };
      return { swapped: false, selected: this.selected };
    }

    const from = this.selected;
    const to = { row, col };
    if (!this.canSwap(from, to, board)) {
      this.selected = to;
      return { swapped: false, selected: to };
    }

    const swapped = board.swap(from, to);
    this.selected = null;
    if (swapped) {
      this.onSwap(from, to, board);
    }
    return { swapped, from, to };
  }

  clear() {
    this.selected = null;
  }

  areAdjacent(a, b) {
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
  }
}
