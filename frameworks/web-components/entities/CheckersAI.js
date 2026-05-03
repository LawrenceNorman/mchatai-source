// CheckersAI — minimax-based checkers opponent on top of CheckersRules.
//
// Material evaluator: each man = 100, each king = 250, plus a small bonus for
// pieces advanced toward the king-row (encourages pushing for a king).
// Default depth 3 (cheaper branching than chess).
//
// Usage:
//   import { CheckersRules } from "./CheckersRules.js";
//   import { CheckersAI } from "./CheckersAI.js";
//   const rules = new CheckersRules();
//   const ai = new CheckersAI({ rules, depth: 3 });
//   const move = ai.pickMove(board, "black");
//   if (move) rules.applyMove(board, move);

import { MinimaxAI } from "./MinimaxAI.js";

const MAN_VALUE = 100;
const KING_VALUE = 250;

function checkersEvaluate(board, color) {
  let score = 0;
  if (!board || typeof board.forEach !== "function") return 0;

  // King row direction depends on the rules instance's `kingRow` map. Default red→0, black→7.
  // Without that info here, we compute distance from the far rank generically: the further
  // a non-king piece is from its starting rank, the more advanced it is.
  const farRow = (color === "red") ? 0 : 7;

  board.forEach((piece, row) => {
    if (!piece) return;
    const sign = piece.color === color ? 1 : -1;
    if (piece.king) {
      score += sign * KING_VALUE;
    } else {
      score += sign * MAN_VALUE;
      // Advancement bonus: 0..6 points per piece based on distance from far rank.
      const advancement = 7 - Math.abs(row - farRow);
      score += sign * advancement * 1.5;
    }
  });

  return score;
}

export class CheckersAI {
  constructor(options = {}) {
    if (!options.rules) {
      throw new Error("CheckersAI requires { rules } option (an instance of CheckersRules)");
    }
    this.rules = options.rules;
    this.depth = Number.isInteger(options.depth) ? options.depth : 3;
    this._engine = new MinimaxAI({
      rules: options.rules,
      evalFn: typeof options.evalFn === "function" ? options.evalFn : checkersEvaluate,
      depth: this.depth,
      randomTieBreak: options.randomTieBreak !== false
    });
  }

  pickMove(board, color) {
    return this._engine.pickMove(board, color);
  }

  playMove(board, color) {
    const move = this.pickMove(board, color);
    if (move) this.rules.applyMove(board, move);
    return move;
  }
}
