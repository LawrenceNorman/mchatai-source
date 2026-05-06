// Board8x8 — 8x8 board with chess/checkers algebraic helpers.
//
// Self-contained: GridBoard's grid storage methods are inlined here so that
// single-file inline assemblies (where the LLM extracts components into one
// HTML and may drop transitive imports) still work even when entities.grid-board
// isn't selected as a separate Lego brick. See wisdom rule
// `bg-self-contained-extracts` (board-games.json).

export class Board8x8 {
  constructor(options = {}) {
    this.rows = 8;
    this.cols = 8;
    this.tileSize = options.tileSize ?? 48;
    this.originX = options.originX ?? 0;
    this.originY = options.originY ?? 0;
    this.wrap = options.wrap ?? false;
    this.cells = this._createCells(options.fill ?? null);
  }

  _createCells(fill) {
    return Array.from({ length: this.rows }, () =>
      Array.from({ length: this.cols }, () => {
        if (typeof fill === "function") return fill();
        if (fill && typeof fill === "object") {
          return Array.isArray(fill) ? fill.slice() : { ...fill };
        }
        return fill;
      })
    );
  }

  inBounds(row, col) {
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
  }

  normalize(row, col) {
    if (!this.wrap) return { row, col };
    return {
      row: (row + this.rows) % this.rows,
      col: (col + this.cols) % this.cols
    };
  }

  get(row, col) {
    const pos = this.normalize(row, col);
    return this.inBounds(pos.row, pos.col) ? this.cells[pos.row][pos.col] : undefined;
  }

  set(row, col, value) {
    const pos = this.normalize(row, col);
    if (!this.inBounds(pos.row, pos.col)) return false;
    this.cells[pos.row][pos.col] = value;
    return true;
  }

  swap(a, b) {
    const av = this.get(a.row, a.col);
    const bv = this.get(b.row, b.col);
    if (av === undefined || bv === undefined) return false;
    this.set(a.row, a.col, bv);
    this.set(b.row, b.col, av);
    return true;
  }

  neighbors(row, col, options = {}) {
    const diagonal = options.diagonal === true;
    const offsets = diagonal
      ? [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]
      : [[-1, 0], [1, 0], [0, -1], [0, 1]];
    return offsets
      .map(([dr, dc]) => this.normalize(row + dr, col + dc))
      .filter((p) => this.inBounds(p.row, p.col));
  }

  cellToWorld(row, col, center = true) {
    const offset = center ? this.tileSize / 2 : 0;
    return {
      x: this.originX + col * this.tileSize + offset,
      y: this.originY + row * this.tileSize + offset
    };
  }

  worldToCell(x, y) {
    return {
      row: Math.floor((y - this.originY) / this.tileSize),
      col: Math.floor((x - this.originX) / this.tileSize)
    };
  }

  forEach(fn) {
    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        fn(this.cells[row][col], row, col, this);
      }
    }
  }

  cloneCells() {
    return this.cells.map((row) => row.slice());
  }

  isDarkSquare(row, col) {
    return (row + col) % 2 === 1;
  }

  algebraicToCell(square) {
    if (typeof square !== "string" || square.length < 2) return null;
    const file = square[0].toLowerCase().charCodeAt(0) - 97;
    const rank = Number(square[1]);
    if (!Number.isInteger(file) || !Number.isInteger(rank)) return null;
    return { row: 8 - rank, col: file };
  }

  cellToAlgebraic(row, col) {
    if (!this.inBounds(row, col)) return null;
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
