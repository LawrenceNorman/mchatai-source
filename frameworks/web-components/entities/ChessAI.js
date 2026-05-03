// ChessAI — minimax-based chess opponent on top of ChessRules.
//
// Wraps MinimaxAI with a chess-specific evaluator (material values + central
// control bonus). Default depth 2 keeps moves under ~1s on typical hardware.
// Pass higher depth for stronger play; pass depth: 0 for random legal moves.
//
// Usage:
//   import { ChessRules } from "./ChessRules.js";
//   import { ChessAI } from "./ChessAI.js";
//   const rules = new ChessRules();
//   const ai = new ChessAI({ rules, depth: 2 });
//   const move = ai.pickMove(board, "black");
//   if (move) rules.applyMove(board, move);

import { MinimaxAI } from "./MinimaxAI.js";

const PIECE_VALUE = {
  pawn: 100,
  knight: 320,
  bishop: 330,
  rook: 500,
  queen: 900,
  king: 20000
};

const CENTER_FILE = 3.5;
const CENTER_RANK = 3.5;

function distanceFromCenter(row, col) {
  return Math.max(Math.abs(row - CENTER_RANK), Math.abs(col - CENTER_FILE));
}

function chessEvaluate(board, color) {
  let score = 0;
  if (!board || typeof board.forEach !== "function") return 0;

  board.forEach((piece, row, col) => {
    if (!piece) return;
    const value = PIECE_VALUE[piece.type] || 0;
    const sign = piece.color === color ? 1 : -1;
    score += sign * value;

    // Central control bonus for pawns and minor pieces (small but nudges toward
    // sensible openings instead of edge-hugging knight/bishop moves).
    if (piece.type === "pawn" || piece.type === "knight" || piece.type === "bishop") {
      const centerBonus = Math.max(0, 4 - distanceFromCenter(row, col)) * 4;
      score += sign * centerBonus;
    }

    // Mild king safety: king should stay closer to its back rank in the opening.
    if (piece.type === "king") {
      const homeRow = piece.color === "white" ? 7 : 0;
      const drift = Math.abs(row - homeRow) * 8;
      score -= sign * drift;
    }
  });

  return score;
}

export class ChessAI {
  constructor(options = {}) {
    if (!options.rules) {
      throw new Error("ChessAI requires { rules } option (an instance of ChessRules)");
    }
    this.rules = options.rules;
    this.depth = Number.isInteger(options.depth) ? options.depth : 2;
    this._engine = new MinimaxAI({
      rules: options.rules,
      evalFn: typeof options.evalFn === "function" ? options.evalFn : chessEvaluate,
      depth: this.depth,
      randomTieBreak: options.randomTieBreak !== false
    });
  }

  pickMove(board, color) {
    return this._engine.pickMove(board, color);
  }

  // Convenience: pick AND apply, returning the played move (or null if none).
  playMove(board, color) {
    const move = this.pickMove(board, color);
    if (move) this.rules.applyMove(board, move);
    return move;
  }
}
