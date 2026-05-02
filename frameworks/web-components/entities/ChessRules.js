const OPPOSITE = {
  white: "black",
  black: "white"
};

const BACK_RANK = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];

function clonePiece(piece) {
  return piece ? { ...piece } : piece;
}

function normalizeType(piece) {
  return String(piece?.type || piece?.kind || "").toLowerCase();
}

function normalizeColor(piece) {
  return String(piece?.color || "").toLowerCase();
}

function isEnemy(piece, color) {
  return piece && normalizeColor(piece) !== color;
}

function addSlidingMoves(board, piece, row, col, directions, moves) {
  const color = normalizeColor(piece);
  for (const direction of directions) {
    let nextRow = row + direction.row;
    let nextCol = col + direction.col;

    while (board.inBounds(nextRow, nextCol)) {
      const target = board.get(nextRow, nextCol);
      if (!target) {
        moves.push({ from: { row, col }, to: { row: nextRow, col: nextCol }, capture: null });
      } else {
        if (isEnemy(target, color)) {
          moves.push({
            from: { row, col },
            to: { row: nextRow, col: nextCol },
            capture: { row: nextRow, col: nextCol, piece: target }
          });
        }
        break;
      }

      nextRow += direction.row;
      nextCol += direction.col;
    }
  }
}

export class ChessRules {
  constructor(options = {}) {
    this.autoPromoteTo = options.autoPromoteTo || "queen";
  }

  setupStandardBoard(board) {
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        board.set(row, col, null);
      }
    }

    for (let col = 0; col < 8; col += 1) {
      board.set(0, col, { type: BACK_RANK[col], color: "black" });
      board.set(1, col, { type: "pawn", color: "black" });
      board.set(6, col, { type: "pawn", color: "white" });
      board.set(7, col, { type: BACK_RANK[col], color: "white" });
    }

    return board;
  }

  legalMoves(board, row, col, options = {}) {
    const piece = board.get(row, col);
    if (!piece) {
      return [];
    }

    const pseudoMoves = this.pseudoLegalMoves(board, row, col);
    if (options.allowSelfCheck === true) {
      return pseudoMoves;
    }

    const color = normalizeColor(piece);
    return pseudoMoves.filter((move) => !this._wouldLeaveKingInCheck(board, move, color));
  }

  pseudoLegalMoves(board, row, col) {
    const piece = board.get(row, col);
    if (!piece) {
      return [];
    }

    const type = normalizeType(piece);
    const color = normalizeColor(piece);
    const moves = [];

    if (type === "pawn") {
      this._pawnMoves(board, piece, row, col, moves);
    } else if (type === "knight") {
      this._jumpMoves(board, piece, row, col, [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
      ], moves);
    } else if (type === "bishop") {
      addSlidingMoves(board, piece, row, col, [
        { row: -1, col: -1 }, { row: -1, col: 1 },
        { row: 1, col: -1 }, { row: 1, col: 1 }
      ], moves);
    } else if (type === "rook") {
      addSlidingMoves(board, piece, row, col, [
        { row: -1, col: 0 }, { row: 1, col: 0 },
        { row: 0, col: -1 }, { row: 0, col: 1 }
      ], moves);
    } else if (type === "queen") {
      addSlidingMoves(board, piece, row, col, [
        { row: -1, col: -1 }, { row: -1, col: 1 },
        { row: 1, col: -1 }, { row: 1, col: 1 },
        { row: -1, col: 0 }, { row: 1, col: 0 },
        { row: 0, col: -1 }, { row: 0, col: 1 }
      ], moves);
    } else if (type === "king") {
      this._jumpMoves(board, piece, row, col, [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], [0, 1],
        [1, -1], [1, 0], [1, 1]
      ], moves);
    }

    return moves.map((move) => ({
      ...move,
      piece: clonePiece(piece),
      color
    }));
  }

  applyMove(board, move) {
    const piece = board.get(move.from.row, move.from.col);
    if (!piece) {
      return false;
    }

    const nextPiece = clonePiece(piece);
    const type = normalizeType(nextPiece);
    if (type === "pawn" && (move.to.row === 0 || move.to.row === 7)) {
      nextPiece.type = move.promotion || this.autoPromoteTo;
    }

    board.set(move.from.row, move.from.col, null);
    board.set(move.to.row, move.to.col, { ...nextPiece, moved: true });
    return true;
  }

  allLegalMoves(board, color) {
    const moves = [];
    board.forEach((piece, row, col) => {
      if (piece && normalizeColor(piece) === color) {
        moves.push(...this.legalMoves(board, row, col));
      }
    });
    return moves;
  }

  isKingInCheck(board, color) {
    const king = this._findKing(board, color);
    if (!king) {
      return false;
    }
    return this.isSquareAttacked(board, king.row, king.col, OPPOSITE[color]);
  }

  isCheckmate(board, color) {
    return this.isKingInCheck(board, color) && this.allLegalMoves(board, color).length === 0;
  }

  isStalemate(board, color) {
    return !this.isKingInCheck(board, color) && this.allLegalMoves(board, color).length === 0;
  }

  isSquareAttacked(board, row, col, byColor) {
    let attacked = false;
    board.forEach((piece, pieceRow, pieceCol) => {
      if (attacked || !piece || normalizeColor(piece) !== byColor) {
        return;
      }

      const attacks = this._attackSquares(board, pieceRow, pieceCol);
      attacked = attacks.some((square) => square.row === row && square.col === col);
    });
    return attacked;
  }

  _pawnMoves(board, piece, row, col, moves) {
    const color = normalizeColor(piece);
    const direction = color === "white" ? -1 : 1;
    const startRow = color === "white" ? 6 : 1;
    const oneStep = { row: row + direction, col };
    const twoStep = { row: row + direction * 2, col };

    if (board.inBounds(oneStep.row, oneStep.col) && !board.get(oneStep.row, oneStep.col)) {
      moves.push({ from: { row, col }, to: oneStep, capture: null });
      if (row === startRow && !board.get(twoStep.row, twoStep.col)) {
        moves.push({ from: { row, col }, to: twoStep, capture: null });
      }
    }

    for (const captureCol of [col - 1, col + 1]) {
      if (!board.inBounds(row + direction, captureCol)) {
        continue;
      }
      const target = board.get(row + direction, captureCol);
      if (isEnemy(target, color)) {
        moves.push({
          from: { row, col },
          to: { row: row + direction, col: captureCol },
          capture: { row: row + direction, col: captureCol, piece: target }
        });
      }
    }
  }

  _jumpMoves(board, piece, row, col, offsets, moves) {
    const color = normalizeColor(piece);
    for (const [dr, dc] of offsets) {
      const targetRow = row + dr;
      const targetCol = col + dc;
      if (!board.inBounds(targetRow, targetCol)) {
        continue;
      }

      const target = board.get(targetRow, targetCol);
      if (!target || isEnemy(target, color)) {
        moves.push({
          from: { row, col },
          to: { row: targetRow, col: targetCol },
          capture: target ? { row: targetRow, col: targetCol, piece: target } : null
        });
      }
    }
  }

  _attackSquares(board, row, col) {
    const piece = board.get(row, col);
    const type = normalizeType(piece);
    const color = normalizeColor(piece);

    if (type === "pawn") {
      const direction = color === "white" ? -1 : 1;
      return [
        { row: row + direction, col: col - 1 },
        { row: row + direction, col: col + 1 }
      ].filter((square) => board.inBounds(square.row, square.col));
    }

    return this.pseudoLegalMoves(board, row, col).map((move) => move.to);
  }

  _findKing(board, color) {
    let king = null;
    board.forEach((piece, row, col) => {
      if (!king && piece && normalizeColor(piece) === color && normalizeType(piece) === "king") {
        king = { row, col, piece };
      }
    });
    return king;
  }

  _wouldLeaveKingInCheck(board, move, color) {
    const piece = board.get(move.from.row, move.from.col);
    const captured = board.get(move.to.row, move.to.col);

    board.set(move.from.row, move.from.col, null);
    board.set(move.to.row, move.to.col, piece);
    const inCheck = this.isKingInCheck(board, color);
    board.set(move.from.row, move.from.col, piece);
    board.set(move.to.row, move.to.col, captured);

    return inCheck;
  }
}
