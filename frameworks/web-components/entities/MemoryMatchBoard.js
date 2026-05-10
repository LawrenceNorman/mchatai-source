// BEGIN mchatai-web-components: entities.memory-match-board (entities/MemoryMatchBoard.js)
//
// PLAIN JS CLASS — NOT A WEB CUSTOM ELEMENT.
// DO NOT call customElements.define() on this class.
// DO NOT use <memorymatchboard-foo> tags in HTML.
// Instantiate with `new` and call methods. YOU draw the UI.
// See wisdom rule fs-015 for the full pattern + worked examples.
//
import { GridBoard } from "./GridBoard.js";

/**
 * Memory match (concentration) board.
 *
 * Mechanics:
 *   - NxM grid (must have an even number of cells).
 *   - Each card has a `value` (matching pairs share the same value).
 *   - Cards have three states: face-down, face-up (one of two flipped this turn),
 *     and matched (revealed permanently).
 *   - flipCard(row, col) flips a face-down card to face-up:
 *       - If 0 cards were face-up, the new one becomes the "first pick".
 *       - If 1 card was face-up:
 *           - Same value → both transition to "matched". Returns {match: true, ...}.
 *           - Different value → both stay face-up briefly so caller can show
 *             them, then must call resolveMismatch() to flip both back down.
 *             Returns {match: false, mismatchPair: [...]}.
 *       - If 2 cards already face-up (mismatch pending) → no-op until resolveMismatch().
 *
 * Returns from flipCard():
 *   { state: "first" | "match" | "mismatch" | "ignored",
 *     card: {row, col, value},
 *     mismatchPair?: [{row,col,value}, {row,col,value}]  // when state="mismatch"
 *   }
 *
 * Caller is responsible for the delay between mismatch and resolveMismatch()
 * (typical 800-1200ms so the player can see what they flipped). Caller is also
 * responsible for shuffling the deck via shuffle() before newGame.
 *
 * Rendering-agnostic. Each cell carries: { value, state: "down"|"up"|"matched" }.
 */
export class MemoryMatchBoard extends GridBoard {
  constructor(options = {}) {
    super({
      ...options,
      rows: options.rows ?? 4,
      cols: options.cols ?? 4,
      fill: () => ({ value: null, state: "down" })
    });
    if ((this.rows * this.cols) % 2 !== 0) {
      throw new Error(`MemoryMatchBoard requires an even number of cells; got ${this.rows}×${this.cols}`);
    }
    this.faceUpCells = []; // tracks the currently face-up cells (max 2)
    this.matchedCount = 0;
    this.moves = 0; // pairs attempted (pair = 2 flips)
    this.misses = 0; // mismatched pairs
  }

  /** Set up cards from a list of pair-values. e.g. ['A','B','C','A','B','C'].
   *  values.length MUST equal rows*cols. Use shuffle() before passing. */
  setCards(values) {
    if (values.length !== this.rows * this.cols) {
      throw new Error(`setCards expected ${this.rows * this.cols} values; got ${values.length}`);
    }
    let i = 0;
    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.cols; c += 1) {
        this.set(r, c, { value: values[i], state: "down" });
        i += 1;
      }
    }
    this.faceUpCells = [];
    this.matchedCount = 0;
    this.moves = 0;
    this.misses = 0;
  }

  /** Build a card-value list from a symbol/icon array. Each symbol gets
   *  a pair; the result is shuffled. e.g. cardsFromSymbols(["🐶","🐱","🐭"], 4×3=12)
   *  produces 6 unique symbols (12/2) drawn from the input. */
  static buildShuffledDeck(symbols, totalCells) {
    if (totalCells % 2 !== 0) throw new Error(`totalCells must be even; got ${totalCells}`);
    const pairs = totalCells / 2;
    if (symbols.length < pairs) {
      throw new Error(`need ${pairs} unique symbols; got ${symbols.length}`);
    }
    const picked = symbols.slice(0, pairs);
    const deck = [...picked, ...picked]; // each symbol appears twice
    return MemoryMatchBoard.shuffle(deck);
  }

  /** Fisher-Yates shuffle (in-place + returned). */
  static shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Flip a card. See contract above for return shape. */
  flipCard(row, col) {
    if (!this.inBounds(row, col)) return { state: "ignored", reason: "out-of-bounds" };
    const cell = this.get(row, col);
    if (!cell || cell.state !== "down") return { state: "ignored", reason: "already-flipped" };
    if (this.faceUpCells.length >= 2) {
      return { state: "ignored", reason: "mismatch-pending" };
    }
    cell.state = "up";
    this.faceUpCells.push({ row, col });
    if (this.faceUpCells.length === 1) {
      return { state: "first", card: { row, col, value: cell.value } };
    }
    // Two face-up: check for match
    this.moves += 1;
    const [a, b] = this.faceUpCells;
    const cellA = this.get(a.row, a.col);
    const cellB = this.get(b.row, b.col);
    if (cellA.value === cellB.value) {
      cellA.state = "matched";
      cellB.state = "matched";
      this.faceUpCells = [];
      this.matchedCount += 2;
      return {
        state: "match",
        card: { row, col, value: cellB.value },
        matchedPair: [a, b]
      };
    }
    this.misses += 1;
    return {
      state: "mismatch",
      card: { row, col, value: cellB.value },
      mismatchPair: [
        { row: a.row, col: a.col, value: cellA.value },
        { row: b.row, col: b.col, value: cellB.value }
      ]
    };
  }

  /** Flip both face-up mismatched cards back to face-down. Caller invokes
   *  this after a delay (typically 800-1200ms) following a mismatch result. */
  resolveMismatch() {
    if (this.faceUpCells.length !== 2) return false;
    for (const { row, col } of this.faceUpCells) {
      const cell = this.get(row, col);
      if (cell && cell.state === "up") cell.state = "down";
    }
    this.faceUpCells = [];
    return true;
  }

  /** True if all cards have been matched. */
  isComplete() {
    return this.matchedCount === this.rows * this.cols;
  }

  /** Match accuracy = matched-pairs / moves. Returns 0..1 (or 1 if no moves yet). */
  accuracy() {
    if (this.moves === 0) return 1;
    return (this.matchedCount / 2) / this.moves;
  }
}

/**
 * Default symbol bank — 36 emoji that work well as memory-match faces.
 * Caller can pass a different list (e.g. animal photos, country flags,
 * playing-card ranks). Pick any subset; shuffleDeck handles the rest.
 */
export const MEMORY_DEFAULT_SYMBOLS = [
  "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯",
  "🦁","🐮","🐷","🐸","🐵","🦄","🐔","🐧","🐦","🦆",
  "🐝","🐛","🦋","🐌","🐞","🐢","🐍","🦎","🦖","🐙",
  "🦀","🐠","🐬","🐳","🦈","🦓"
];
// END mchatai-web-components: entities.memory-match-board
