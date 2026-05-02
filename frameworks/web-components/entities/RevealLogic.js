export class RevealLogic {
  constructor(options = {}) {
    this.mineValue = options.mineValue ?? "mine";
    this.revealedKey = options.revealedKey ?? "revealed";
    this.flaggedKey = options.flaggedKey ?? "flagged";
  }

  seedMines(board, count, avoid = []) {
    const avoided = new Set(avoid.map((cell) => `${cell.row},${cell.col}`));
    const cells = [];
    board.forEach((_, row, col) => {
      if (!avoided.has(`${row},${col}`)) {
        cells.push({ row, col });
      }
    });
    for (let i = cells.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    for (const cell of cells.slice(0, count)) {
      board.set(cell.row, cell.col, { value: this.mineValue, adjacent: 0, revealed: false, flagged: false });
    }
    this.computeAdjacency(board);
  }

  computeAdjacency(board) {
    board.forEach((cell, row, col) => {
      if (cell?.value === this.mineValue) {
        return;
      }
      const adjacent = board.neighbors(row, col, { diagonal: true })
        .filter((n) => board.get(n.row, n.col)?.value === this.mineValue)
        .length;
      board.set(row, col, { ...(cell ?? {}), value: adjacent, adjacent, revealed: false, flagged: false });
    });
  }

  toggleFlag(board, row, col) {
    const cell = board.get(row, col);
    if (!cell || cell[this.revealedKey]) {
      return false;
    }
    board.set(row, col, { ...cell, [this.flaggedKey]: !cell[this.flaggedKey] });
    return true;
  }

  reveal(board, row, col) {
    const first = board.get(row, col);
    if (!first || first[this.flaggedKey] || first[this.revealedKey]) {
      return { revealed: [], hitMine: false };
    }

    const revealed = [];
    const queue = [{ row, col }];
    let hitMine = false;
    while (queue.length) {
      const current = queue.shift();
      const cell = board.get(current.row, current.col);
      if (!cell || cell[this.flaggedKey] || cell[this.revealedKey]) {
        continue;
      }
      board.set(current.row, current.col, { ...cell, [this.revealedKey]: true });
      revealed.push(current);
      if (cell.value === this.mineValue) {
        hitMine = true;
        continue;
      }
      if ((cell.adjacent ?? cell.value) === 0) {
        queue.push(...board.neighbors(current.row, current.col, { diagonal: true }));
      }
    }
    return { revealed, hitMine };
  }
}
