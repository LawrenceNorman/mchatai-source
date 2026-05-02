import { GridBoard } from "./GridBoard.js";

export class Board8x8 extends GridBoard {
  constructor(options = {}) {
    super({ ...options, rows: 8, cols: 8, tileSize: options.tileSize ?? 48 });
  }

  isDarkSquare(row, col) {
    return (row + col) % 2 === 1;
  }

  algebraicToCell(square) {
    if (typeof square !== "string" || square.length < 2) {
      return null;
    }
    const file = square[0].toLowerCase().charCodeAt(0) - 97;
    const rank = Number(square[1]);
    if (!Number.isInteger(file) || !Number.isInteger(rank)) {
      return null;
    }
    return { row: 8 - rank, col: file };
  }

  cellToAlgebraic(row, col) {
    if (!this.inBounds(row, col)) {
      return null;
    }
    return `${String.fromCharCode(97 + col)}${8 - row}`;
  }

  pieces(color = null) {
    const out = [];
    this.forEach((piece, row, col) => {
      if (piece && (!color || piece.color === color)) {
        out.push({ piece, row, col });
      }
    });
    return out;
  }
}
