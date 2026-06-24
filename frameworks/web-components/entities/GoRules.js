// GoRules — board-size-agnostic Go (Weiqi/Baduk) rules engine.
//
// Pure logic only: group detection, liberty counting, move legality, capture,
// territory scoring, and an optional greedy opponent. NO rendering, NO DOM, NO
// timers — YOU draw the board and stones from the engine's state.
//
// Board representation: a 2D array `board[row][col]` of integers.
//   EMPTY = 0, BLACK = 1, WHITE = 2  (exported constants)
// Use `createBoard(size)` to make a fresh empty square board of any size
// (9, 13, 19, …). Coordinates are { row, col } with row 0 at the top.
//
// Legality model (configurable):
//   - Occupied points are illegal.
//   - A move first removes any enemy groups it reduces to zero liberties.
//   - Suicide (own group has zero liberties after captures) is illegal unless
//     `allowSuicide: true`.
//   - Ko / repetition: `koRule` selects how board repetition is forbidden:
//       "positional-superko" (default) — the resulting whole-board position may
//          never equal ANY previously-seen position (engine keeps a hash history).
//       "simple"  — only the single immediately-previous position is forbidden,
//          plus the classic single-stone ko point.
//       "none"    — no repetition restriction.
//
// API parallels ChessRules / CheckersRules / TicTacToeRules so the same
// TurnBasedManager wiring works: legalMoves / applyMove / a winner-style score.
// `tryMove` is pure (never mutates the input board) and returns the resulting
// board so callers can preview/AI-search; `applyMove` mutates the engine's own
// state and advances ko history.
//
// =============================================================================
// CONTRACTS
// -----------------------------------------------------------------------------
//   new GoRules({ size?, komi?, koRule?, allowSuicide?, history? })
//
//   createBoard(size) -> number[][]           // fresh empty board (exported fn)
//   opponent(player) -> player                // BLACK<->WHITE (exported fn)
//
//   rules.size                                // current board edge length
//   rules.board                               // current 2D board (mutated by applyMove)
//   rules.captures                            // { 1: blackCaptured, 2: whiteCaptured }
//
//   rules.findGroup(board, row, col)
//        -> { stones: [[r,c],...], liberties: Set<number>, color }
//   rules.libertyCount(board, row, col) -> number
//   rules.neighbors(row, col) -> [[r,c],...]  // orthogonal, edge-clamped
//
//   rules.tryMove(board, row, col, player [, koState])
//        -> { legal:true, captured, capturedStones, newBoard, koPoint }
//         | { legal:false, reason }            // PURE: never mutates `board`
//   rules.isLegal(board, row, col, player [, koState]) -> boolean
//   rules.legalMoves(board, player) -> [{ row, col }, ...]
//   rules.applyMove(row, col, player) -> result // mutates rules.board/captures/history
//   rules.pass(player)                          // record a pass, clears ko point
//
//   rules.calcTerritory(board)
//        -> { 1: blackPoints, 2: whitePoints, neutral }
//   rules.score(board [, komi]) -> { black, white, winner, margin }
//        winner is BLACK | WHITE | 0 (tie); area = territory + captures (+komi for white)
//
//   new GoOpponent({ rules, player?, captureBonus?, atariBonus?, jitter? })
//   ai.pickMove(board [, koState]) -> { row, col } | null  // null = should pass
// =============================================================================
//
// IMPORTANT: This is a PLAIN JAVASCRIPT CLASS, NOT a Custom Element. Do NOT call
// customElements.define() on it. Do NOT use <go-rules> tags in HTML. Instantiate
// with `new` and call methods directly; YOU draw the UI from the instance state.
// (See wisdom rule fs-015.)

export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

export function opponent(player) {
  return player === BLACK ? WHITE : BLACK;
}

export function createBoard(size) {
  return Array.from({ length: size }, () => Array(size).fill(EMPTY));
}

function copyBoard(board) {
  return board.map((row) => row.slice());
}

// Stable string key for a whole-board position (used for superko history).
function hashBoard(board) {
  return board.map((row) => row.join("")).join("|");
}

function boardsEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let r = 0; r < a.length; r += 1) {
    for (let c = 0; c < a.length; c += 1) {
      if (a[r][c] !== b[r][c]) return false;
    }
  }
  return true;
}

export class GoRules {
  constructor(options = {}) {
    this.size = options.size ?? 9;
    this.komi = options.komi ?? 6.5;
    this.koRule = options.koRule ?? "positional-superko"; // | "simple" | "none"
    this.allowSuicide = options.allowSuicide ?? false;

    this.board = options.board ? copyBoard(options.board) : createBoard(this.size);
    this.captures = { [BLACK]: 0, [WHITE]: 0 };
    this.passes = 0;
    this.koPoint = null;                 // [row, col] forbidden next move (simple ko)
    this.previousBoard = null;           // for "simple" repetition check
    // Positional-superko: every position ever seen (includes the initial empty board).
    this.history = new Set(options.history ?? [hashBoard(this.board)]);
  }

  reset() {
    this.board = createBoard(this.size);
    this.captures = { [BLACK]: 0, [WHITE]: 0 };
    this.passes = 0;
    this.koPoint = null;
    this.previousBoard = null;
    this.history = new Set([hashBoard(this.board)]);
  }

  inBounds(row, col) {
    return row >= 0 && row < this.size && col >= 0 && col < this.size;
  }

  neighbors(row, col) {
    const out = [];
    if (row > 0) out.push([row - 1, col]);
    if (row < this.size - 1) out.push([row + 1, col]);
    if (col > 0) out.push([row, col - 1]);
    if (col < this.size - 1) out.push([row, col + 1]);
    return out;
  }

  // Flood-fill the connected same-color group through (row, col); collect its
  // stones and the set of distinct empty-point liberties touching the group.
  findGroup(board, row, col) {
    const color = board[row][col];
    if (color === EMPTY) return { stones: [], liberties: new Set(), color };
    const stones = [];
    const liberties = new Set();
    const seen = new Set([row * this.size + col]);
    const stack = [[row, col]];
    while (stack.length) {
      const [cr, cc] = stack.pop();
      stones.push([cr, cc]);
      for (const [nr, nc] of this.neighbors(cr, cc)) {
        const key = nr * this.size + nc;
        if (board[nr][nc] === EMPTY) {
          liberties.add(key);
        } else if (board[nr][nc] === color && !seen.has(key)) {
          seen.add(key);
          stack.push([nr, nc]);
        }
      }
    }
    return { stones, liberties, color };
  }

  libertyCount(board, row, col) {
    return this.findGroup(board, row, col).liberties.size;
  }

  // PURE legality probe. Returns the resulting board + capture data on success.
  // `koState` (optional) overrides the engine's own ko bookkeeping so callers can
  // evaluate hypothetical lines: { koPoint, previousBoard, history:Set }.
  tryMove(board, row, col, player, koState = null) {
    if (!this.inBounds(row, col)) return { legal: false, reason: "Off board" };
    if (board[row][col] !== EMPTY) return { legal: false, reason: "Point occupied" };

    const koPoint = koState ? koState.koPoint : this.koPoint;
    const previousBoard = koState ? koState.previousBoard : this.previousBoard;
    const history = koState ? koState.history : this.history;

    if (this.koRule === "simple" && koPoint && koPoint[0] === row && koPoint[1] === col) {
      return { legal: false, reason: "Ko: cannot retake immediately" };
    }

    const nb = copyBoard(board);
    nb[row][col] = player;

    let captured = 0;
    const capturedStones = [];
    const enemy = opponent(player);
    for (const [nr, nc] of this.neighbors(row, col)) {
      if (nb[nr][nc] === enemy) {
        const group = this.findGroup(nb, nr, nc);
        if (group.liberties.size === 0) {
          for (const [sr, sc] of group.stones) {
            nb[sr][sc] = EMPTY;
            captured += 1;
            capturedStones.push([sr, sc]);
          }
        }
      }
    }

    const myGroup = this.findGroup(nb, row, col);
    if (myGroup.liberties.size === 0 && !this.allowSuicide) {
      return { legal: false, reason: "Suicide move" };
    }

    // Repetition / superko.
    if (this.koRule === "positional-superko" && history && history.has(hashBoard(nb))) {
      return { legal: false, reason: "Superko: position repeats" };
    }
    if (this.koRule === "simple" && previousBoard && boardsEqual(nb, previousBoard)) {
      return { legal: false, reason: "Ko: would repeat position" };
    }

    // Classic single-stone ko point (relevant for the "simple" rule's UX).
    let newKo = null;
    if (captured === 1 && myGroup.stones.length === 1 && myGroup.liberties.size === 1) {
      newKo = capturedStones[0];
    }

    return { legal: true, captured, capturedStones, newBoard: nb, koPoint: newKo };
  }

  isLegal(board, row, col, player, koState = null) {
    return this.tryMove(board, row, col, player, koState).legal === true;
  }

  legalMoves(board, player) {
    const moves = [];
    for (let r = 0; r < this.size; r += 1) {
      for (let c = 0; c < this.size; c += 1) {
        if (board[r][c] === EMPTY && this.isLegal(board, r, c, player)) {
          moves.push({ row: r, col: c });
        }
      }
    }
    return moves;
  }

  // Commits a move to the engine's own state, advancing captures + ko history.
  applyMove(row, col, player) {
    const result = this.tryMove(this.board, row, col, player);
    if (!result.legal) return result;
    this.previousBoard = this.board;
    this.board = result.newBoard;
    this.captures[player] += result.captured;
    this.koPoint = result.koPoint;
    this.passes = 0;
    this.history.add(hashBoard(this.board));
    return result;
  }

  pass(/* player */) {
    this.previousBoard = copyBoard(this.board);
    this.koPoint = null;
    this.passes += 1;
    return this.passes;
  }

  // Flood-fill empty regions; a region surrounded by a single color is that
  // color's territory. Regions touching both colors (or the board only) are neutral.
  calcTerritory(board = this.board) {
    const t = { [BLACK]: 0, [WHITE]: 0, neutral: 0 };
    const seen = Array.from({ length: this.size }, () => Array(this.size).fill(false));
    for (let r = 0; r < this.size; r += 1) {
      for (let c = 0; c < this.size; c += 1) {
        if (board[r][c] !== EMPTY || seen[r][c]) continue;
        const stack = [[r, c]];
        const borders = new Set();
        let regionSize = 0;
        seen[r][c] = true;
        while (stack.length) {
          const [cr, cc] = stack.pop();
          regionSize += 1;
          for (const [nr, nc] of this.neighbors(cr, cc)) {
            if (board[nr][nc] === EMPTY) {
              if (!seen[nr][nc]) {
                seen[nr][nc] = true;
                stack.push([nr, nc]);
              }
            } else {
              borders.add(board[nr][nc]);
            }
          }
        }
        if (borders.size === 1) {
          t[[...borders][0]] += regionSize;
        } else {
          t.neutral += regionSize;
        }
      }
    }
    return t;
  }

  // Area-style scoring: territory + captures (+ komi for white).
  score(board = this.board, komi = this.komi) {
    const t = this.calcTerritory(board);
    const black = t[BLACK] + this.captures[BLACK];
    const white = t[WHITE] + this.captures[WHITE] + komi;
    let winner = 0;
    if (black > white) winner = BLACK;
    else if (white > black) winner = WHITE;
    return { black, white, winner, margin: Math.abs(black - white) };
  }
}

// =============================================================================
// GoOpponent — lightweight greedy heuristic opponent (no deep search).
// Scores each legal move by: captures, putting enemy groups in atari, escaping
// own atari, opening influence, and avoiding self-filled eyes. Returns the best
// move, or null when it should pass (no good move late in the game).
// For stronger play, swap in entities.minimax-ai with a custom evalFn.
// =============================================================================
export class GoOpponent {
  constructor(options = {}) {
    this.rules = options.rules || new GoRules();
    this.player = options.player ?? WHITE;
    this.captureBonus = options.captureBonus ?? 50;
    this.atariBonus = options.atariBonus ?? 12;
    this.escapeBonus = options.escapeBonus ?? 18;
    this.jitter = options.jitter ?? 2;
    // Below this score late in the game, prefer to pass.
    this.passThreshold = options.passThreshold ?? 2;
    this.lateGameStones = options.lateGameStones ?? null; // default: ~55% of points
  }

  _countStones(board) {
    let n = 0;
    for (const row of board) for (const cell of row) if (cell !== EMPTY) n += 1;
    return n;
  }

  pickMove(board, koState = null) {
    const rules = this.rules;
    const me = this.player;
    const foe = opponent(me);
    const size = rules.size;
    const stonesOnBoard = this._countStones(board);
    const lateGame = this.lateGameStones ?? Math.floor(size * size * 0.55);
    const moves = [];

    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        const res = rules.tryMove(board, r, c, me, koState);
        if (!res.legal) continue;
        let s = 1 + res.captured * this.captureBonus;
        const nb = res.newBoard;

        // Putting enemy groups in atari (few liberties).
        for (const [nr, nc] of rules.neighbors(r, c)) {
          if (nb[nr][nc] === foe) {
            const libs = rules.findGroup(nb, nr, nc).liberties.size;
            if (libs === 1) s += this.atariBonus;
            else if (libs === 2) s += Math.round(this.atariBonus / 3);
          }
        }
        // Rescuing own groups currently in atari.
        for (const [nr, nc] of rules.neighbors(r, c)) {
          if (board[nr][nc] === me) {
            const libs = rules.findGroup(board, nr, nc).liberties.size;
            if (libs === 1) s += this.escapeBonus;
            else if (libs === 2) s += 2;
          }
        }
        // Opening influence: favor centre over edge early.
        if (stonesOnBoard < size + size - 4) {
          if (r === 0 || r === size - 1 || c === 0 || c === size - 1) s -= 4;
          const lo = 2;
          const hi = size - 3;
          if (r >= lo && r <= hi && c >= lo && c <= hi) s += 5;
        }
        // Avoid filling in one's own eye / fully self-surrounded points.
        let own = 0;
        let total = 0;
        for (const [nr, nc] of rules.neighbors(r, c)) {
          total += 1;
          if (board[nr][nc] === me) own += 1;
        }
        if (own === total && total >= 3) s -= 25;

        s += Math.random() * this.jitter;
        moves.push({ row: r, col: c, score: s, res });
      }
    }

    if (moves.length === 0) return null;
    moves.sort((a, b) => b.score - a.score);
    const best = moves[0];
    if (best.score < this.passThreshold && stonesOnBoard > lateGame) return null;
    return { row: best.row, col: best.col };
  }
}
