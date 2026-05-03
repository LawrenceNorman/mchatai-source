// Lowest-effort AI opponent — picks a uniformly random legal move. Always satisfies
// the "every 2-player game must have an opponent" rule (universal.json u-010 / bg-005)
// when a smarter engine isn't available or is too slow for the host runtime.
//
// Usage:
//   const ai = new SimpleOpponent({ rules });
//   const move = ai.pickMove(board, "black");
//   if (move) rules.applyMove(board, move);
//
// Compatible with any rules object exposing legalMoves(board, row, col) +
// applyMove(board, move). If the rules object provides allLegalMoves(board, color)
// it is used directly; otherwise the board is iterated.

function collectAllLegalMoves(rules, board, color) {
  if (typeof rules.allLegalMoves === "function") {
    return rules.allLegalMoves(board, color);
  }
  const moves = [];
  if (typeof board.forEach !== "function" || typeof rules.legalMoves !== "function") {
    return moves;
  }
  board.forEach((piece, row, col) => {
    if (piece && piece.color === color) {
      moves.push(...rules.legalMoves(board, row, col));
    }
  });
  return moves;
}

export class SimpleOpponent {
  constructor(options = {}) {
    if (!options.rules) {
      throw new Error("SimpleOpponent requires { rules } option");
    }
    this.rules = options.rules;
    this.allLegalMoves = typeof options.allLegalMoves === "function"
      ? options.allLegalMoves
      : (board, color) => collectAllLegalMoves(this.rules, board, color);
    // Optional bias: if `preferCaptures` is true, captures get 3x weight in the random pool.
    this.preferCaptures = options.preferCaptures === true;
  }

  pickMove(board, color) {
    const moves = this.allLegalMoves(board, color);
    if (moves.length === 0) return null;

    if (this.preferCaptures) {
      const pool = [];
      for (const move of moves) {
        pool.push(move);
        if (move.capture) {
          pool.push(move, move);
        }
      }
      return pool[Math.floor(Math.random() * pool.length)];
    }

    return moves[Math.floor(Math.random() * moves.length)];
  }
}
