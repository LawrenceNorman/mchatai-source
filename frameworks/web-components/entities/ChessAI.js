// ChessAI - minimax-based chess opponent on top of ChessRules.
//
// Wraps MinimaxAI with a chess-specific evaluator: material values + piece-
// square tables (PST). Default depth 3 plays competently (defends pieces,
// threatens captures, plays sensible openings) and stays under ~1 second on
// typical hardware thanks to MinimaxAI's capture-first move ordering. Pass
// { depth: 4 } for stronger but slower (~3s) play. Pass depth: 0 for random
// legal moves.
//
// Usage:
//   import { ChessRules } from "./ChessRules.js";
//   import { ChessAI } from "./ChessAI.js";
//   const rules = new ChessRules();
//   const ai = new ChessAI({ rules, depth: 3 });
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

// Piece-square tables (PST) - textbook simplified values for the early/middle
// game. Values are from white's perspective (row 0 = black's back rank,
// row 7 = white's back rank). We mirror vertically when scoring black pieces.
// PST adds positional sense beyond bare material so the AI develops pieces,
// contests the center, and keeps the king on the back rank during the opening.
const PST_PAWN = [
  0, 0, 0, 0, 0, 0, 0, 0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0
];
const PST_KNIGHT = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50
];
const PST_BISHOP = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 10, 10, 10, 10, 0, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -20, -10, -10, -10, -10, -10, -10, -20
];
const PST_ROOK = [
  0, 0, 0, 0, 0, 0, 0, 0,
  5, 10, 10, 10, 10, 10, 10, 5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  0, 0, 0, 5, 5, 0, 0, 0
];
const PST_QUEEN = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -5, 0, 5, 5, 5, 5, 0, -5,
  0, 0, 5, 5, 5, 5, 0, -5,
  -10, 5, 5, 5, 5, 5, 0, -10,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20
];
const PST_KING = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  20, 20, 0, 0, 0, 0, 20, 20,
  20, 30, 10, 0, 0, 10, 30, 20
];

const PST = {
  pawn: PST_PAWN,
  knight: PST_KNIGHT,
  bishop: PST_BISHOP,
  rook: PST_ROOK,
  queen: PST_QUEEN,
  king: PST_KING
};

function pstScore(piece, row, col) {
  const table = PST[piece.type];
  if (!table) return 0;
  // Table is white-perspective. For black, mirror vertically (row -> 7 - row).
  const r = piece.color === "white" ? row : 7 - row;
  return table[r * 8 + col] || 0;
}

function chessEvaluate(board, color) {
  let score = 0;
  if (!board || typeof board.forEach !== "function") return 0;

  board.forEach((piece, row, col) => {
    if (!piece) return;
    const value = PIECE_VALUE[piece.type] || 0;
    const sign = piece.color === color ? 1 : -1;
    score += sign * value;
    score += sign * pstScore(piece, row, col);
  });

  return score;
}

export class ChessAI {
  constructor(options = {}) {
    if (!options.rules) {
      throw new Error("ChessAI requires { rules } option (an instance of ChessRules)");
    }
    this.rules = options.rules;
    // Default depth bumped from 2 to 3 (wisdom rule bg-chess-ai-default-depth-three).
    // Depth 2 felt random; depth 3 with PST + alpha-beta capture-first ordering
    // plays competently and still moves in under ~1s on typical hardware.
    this.depth = Number.isInteger(options.depth) ? options.depth : 3;
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
