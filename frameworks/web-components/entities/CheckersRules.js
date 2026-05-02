export class CheckersRules {
  constructor(options = {}) {
    this.kingRow = options.kingRow ?? { red: 0, black: 7 };
  }

  legalMoves(board, row, col) {
    const piece = board.get(row, col);
    if (!piece) {
      return [];
    }
    const moves = [];
    for (const dir of this.directions(piece)) {
      const step = { row: row + dir.row, col: col + dir.col };
      const jump = { row: row + dir.row * 2, col: col + dir.col * 2 };
      const occupant = board.get(step.row, step.col);
      if (board.inBounds(step.row, step.col) && !occupant) {
        moves.push({ from: { row, col }, to: step, capture: null });
      } else if (
        occupant &&
        occupant.color !== piece.color &&
        board.inBounds(jump.row, jump.col) &&
        !board.get(jump.row, jump.col)
      ) {
        moves.push({ from: { row, col }, to: jump, capture: step });
      }
    }
    return moves;
  }

  applyMove(board, move) {
    const piece = board.get(move.from.row, move.from.col);
    if (!piece) {
      return false;
    }
    board.set(move.from.row, move.from.col, null);
    if (move.capture) {
      board.set(move.capture.row, move.capture.col, null);
    }
    const king = piece.king || move.to.row === this.kingRow[piece.color];
    board.set(move.to.row, move.to.col, { ...piece, king });
    return true;
  }

  directions(piece) {
    if (piece.king) {
      return [
        { row: -1, col: -1 }, { row: -1, col: 1 },
        { row: 1, col: -1 }, { row: 1, col: 1 }
      ];
    }
    const forward = piece.color === "red" ? -1 : 1;
    return [{ row: forward, col: -1 }, { row: forward, col: 1 }];
  }
}
