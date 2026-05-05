// TicTacToeRules — minimal rules + minimax for a perfectly-played 3x3 game.
//
// Board representation: a 9-element array indexed 0..8 (row-major).
//   0 1 2
//   3 4 5
//   6 7 8
// Each cell is "x", "o", or null.
//
// API parallels ChessRules / CheckersRules so the same TurnBasedManager wiring
// works. Moves are integer cell indices (0..8). applyMove(board, move) mutates
// in place. legalMoves(board, _row, _col) is implemented for API parity but
// the only meaningful method is `allLegalMoves(board, color)`.

const WINS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],   // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8],   // columns
  [0, 4, 8], [2, 4, 6]               // diagonals
];

export function emptyBoard() {
  return Array(9).fill(null);
}

export class TicTacToeRules {
  legalMoves(board /*, row, col */) {
    const moves = [];
    for (let i = 0; i < 9; i += 1) if (board[i] === null) moves.push(i);
    return moves;
  }

  allLegalMoves(board /*, color */) {
    return this.legalMoves(board);
  }

  applyMove(board, move, color) {
    if (typeof move !== "number" || move < 0 || move > 8) return false;
    if (board[move] !== null) return false;
    board[move] = color;
    return true;
  }

  // Check for a winner. Returns "x", "o", "draw", or null (game ongoing).
  winner(board) {
    for (const [a, b, c] of WINS) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    }
    if (board.every((cell) => cell !== null)) return "draw";
    return null;
  }

  // Returns the array of indices forming the winning line, or null.
  winningLine(board) {
    for (const line of WINS) {
      const [a, b, c] = line;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) return line;
    }
    return null;
  }
}

// =============================================================================
// Inline minimax — small enough that we don't need entities/MinimaxAI here.
// Returns the best move index for `color` on the given board. depth ≤ 9 is
// always tractable for tic-tac-toe.
// =============================================================================
export class TicTacToeAI {
  constructor(options = {}) {
    this.rules = options.rules || new TicTacToeRules();
    // "perfect" = full minimax; "easy" = random legal move
    this.difficulty = options.difficulty || "perfect";
  }

  pickMove(board, color) {
    const legal = this.rules.legalMoves(board);
    if (legal.length === 0) return null;
    if (this.difficulty === "easy") return legal[Math.floor(Math.random() * legal.length)];
    const opponent = color === "x" ? "o" : "x";
    let bestScore = -Infinity;
    let bestMoves = [];
    for (const m of legal) {
      const next = board.slice();
      next[m] = color;
      const score = -this._negamax(next, opponent, color, 9);
      if (score > bestScore) {
        bestScore = score;
        bestMoves = [m];
      } else if (score === bestScore) {
        bestMoves.push(m);
      }
    }
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  _negamax(board, color, maxColor, depth) {
    const w = this.rules.winner(board);
    if (w === maxColor) return 100 - (9 - depth);     // prefer faster wins
    if (w && w !== "draw") return -100 + (9 - depth); // prefer slower losses
    if (w === "draw" || depth === 0) return 0;
    const legal = this.rules.legalMoves(board);
    let best = -Infinity;
    const opponent = color === "x" ? "o" : "x";
    for (const m of legal) {
      board[m] = color;
      const score = -this._negamax(board, opponent, maxColor, depth - 1);
      board[m] = null;
      if (score > best) best = score;
    }
    return best;
  }
}
