// Generic alpha-beta minimax (negamax form) for any 2-player turn-based board game
// whose rules object exposes legalMoves(board, row, col) and applyMove(board, move).
//
// Usage:
//   const ai = new MinimaxAI({ rules, evalFn, depth: 2 });
//   const move = ai.pickMove(board, "white");
//   rules.applyMove(board, move);
//
// The evalFn(board, color) returns a positive score for `color` winning. The AI
// flips signs internally for the opponent. Fallback evalFn is material-only
// (sum of `piece.value` if present, else 1 per piece).
//
// Move/undo: we snapshot the from-square, to-square, and any separate capture
// square BEFORE applying the rules' applyMove, then restore on undo. This
// avoids board cloning per branch — fast enough for depth 2-3 on 8x8 boards.

const DEFAULT_OPPOSITE = {
  white: "black",
  black: "white",
  red: "black",
  blue: "red",
  light: "dark",
  dark: "light"
};

function defaultOpposite(color) {
  return DEFAULT_OPPOSITE[color] || color;
}

function defaultEval(board, color) {
  let score = 0;
  if (!board || typeof board.forEach !== "function") return 0;
  board.forEach((piece) => {
    if (!piece) return;
    const value = typeof piece.value === "number" ? piece.value : 1;
    score += piece.color === color ? value : -value;
  });
  return score;
}

function defaultAllLegalMoves(rules, board, color) {
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

export class MinimaxAI {
  constructor(options = {}) {
    if (!options.rules) {
      throw new Error("MinimaxAI requires { rules } option");
    }
    this.rules = options.rules;
    this.evalFn = typeof options.evalFn === "function" ? options.evalFn : defaultEval;
    this.depth = Number.isInteger(options.depth) ? Math.max(0, options.depth) : 2;
    this.opposite = typeof options.opposite === "function" ? options.opposite : defaultOpposite;
    this.allLegalMoves = typeof options.allLegalMoves === "function"
      ? options.allLegalMoves
      : (board, color) => defaultAllLegalMoves(this.rules, board, color);
    this.randomTieBreak = options.randomTieBreak !== false;
  }

  pickMove(board, color) {
    const moves = this.allLegalMoves(board, color);
    if (moves.length === 0) return null;
    if (this.depth <= 0) return this._pickRandom(moves);

    const maxColor = color;
    let best = -Infinity;
    let bestMoves = [];

    for (const move of moves) {
      const snapshot = this._apply(board, move);
      const score = -this._negamax(board, this.depth - 1, -Infinity, Infinity, this.opposite(color), maxColor);
      this._undo(board, snapshot);

      if (score > best) {
        best = score;
        bestMoves = [move];
      } else if (score === best) {
        bestMoves.push(move);
      }
    }

    return this.randomTieBreak ? this._pickRandom(bestMoves) : bestMoves[0];
  }

  _pickRandom(moves) {
    if (!moves || moves.length === 0) return null;
    if (moves.length === 1) return moves[0];
    return moves[Math.floor(Math.random() * moves.length)];
  }

  _negamax(board, depth, alpha, beta, color, maxColor) {
    if (depth === 0) {
      return (color === maxColor ? 1 : -1) * this.evalFn(board, maxColor);
    }

    const moves = this.allLegalMoves(board, color);
    if (moves.length === 0) {
      // Terminal node — heavy penalty so AI prefers branches that don't trap itself.
      return -1e9;
    }

    let best = -Infinity;
    for (const move of moves) {
      const snapshot = this._apply(board, move);
      const score = -this._negamax(board, depth - 1, -beta, -alpha, this.opposite(color), maxColor);
      this._undo(board, snapshot);

      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  _apply(board, move) {
    const fromPiece = board.get(move.from.row, move.from.col);
    const toPiece = board.get(move.to.row, move.to.col);
    let capturePiece = null;
    const captureCell = move.capture && typeof move.capture.row === "number" && typeof move.capture.col === "number"
      ? move.capture
      : null;
    const captureIsSeparate = captureCell && (captureCell.row !== move.to.row || captureCell.col !== move.to.col);
    if (captureIsSeparate) {
      capturePiece = board.get(captureCell.row, captureCell.col);
    }

    this.rules.applyMove(board, move);

    return {
      move,
      captureCell: captureIsSeparate ? captureCell : null,
      fromPiece: fromPiece ? { ...fromPiece } : null,
      toPiece: toPiece ? { ...toPiece } : null,
      capturePiece: capturePiece ? { ...capturePiece } : null
    };
  }

  _undo(board, snapshot) {
    const { move, fromPiece, toPiece, capturePiece, captureCell } = snapshot;
    board.set(move.from.row, move.from.col, fromPiece);
    board.set(move.to.row, move.to.col, toPiece);
    if (captureCell) {
      board.set(captureCell.row, captureCell.col, capturePiece);
    }
  }
}
