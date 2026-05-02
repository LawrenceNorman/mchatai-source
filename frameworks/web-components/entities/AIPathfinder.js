export class AIPathfinder {
  constructor(options = {}) {
    this.canEnter = options.canEnter ?? ((cell) => cell !== "wall");
  }

  findPath(board, start, goal) {
    const key = (cell) => `${cell.row},${cell.col}`;
    const queue = [start];
    const cameFrom = new Map([[key(start), null]]);

    while (queue.length) {
      const current = queue.shift();
      if (current.row === goal.row && current.col === goal.col) {
        return this.reconstruct(cameFrom, current);
      }
      for (const next of board.neighbors(current.row, current.col)) {
        const nextKey = key(next);
        if (cameFrom.has(nextKey)) {
          continue;
        }
        if (!this.canEnter(board.get(next.row, next.col), next, board)) {
          continue;
        }
        cameFrom.set(nextKey, current);
        queue.push(next);
      }
    }
    return [];
  }

  nextStep(board, start, goal) {
    return this.findPath(board, start, goal)[1] ?? null;
  }

  reconstruct(cameFrom, current) {
    const path = [current];
    const key = (cell) => `${cell.row},${cell.col}`;
    while (cameFrom.get(key(current))) {
      current = cameFrom.get(key(current));
      path.push(current);
    }
    return path.reverse();
  }
}
