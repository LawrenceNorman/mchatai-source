// BEGIN mchatai-web-components: entities.solitaire-klondike (entities/SolitaireKlondike.js)
//
// PLAIN JS CLASS — NOT A WEB CUSTOM ELEMENT.
// DO NOT call customElements.define() on this class.
// DO NOT use <solitaireklondike-foo> tags in HTML.
// Instantiate with `new` and call methods. YOU draw the UI.
// See wisdom rule fs-015 for the full pattern + worked examples.
//

/**
 * Klondike Solitaire game state machine. The classic Windows 95 / iOS-stock
 * solitaire variant: 7 tableau columns, 4 foundations, 1 stock + 1 waste,
 * 3-card flip from stock, build foundations A→K by suit, build tableau
 * runs K→A in alternating colors.
 *
 * State shape:
 *   tableau:   array of 7 columns; each column is array of cards
 *              (index 0 = bottom of pile, last = top/visible)
 *   stock:     array of cards; player draws from the END (top of pile)
 *   waste:     array of cards drawn from stock; only top is playable
 *   foundations: 4 arrays, one per suit (HEARTS/DIAMONDS/CLUBS/SPADES)
 *
 * Each card: { suit: 'H'|'D'|'C'|'S', rank: 1-13, faceUp: bool }
 *   - rank 1 = Ace, 11 = Jack, 12 = Queen, 13 = King
 *   - red suits: H, D; black suits: C, S
 *
 * Caller drives input via:
 *   - draw() — flip next 3 cards from stock to waste (or recycle waste→stock)
 *   - moveFromWaste(toKind, toIdx) — move waste-top card
 *   - moveFromTableau(fromCol, fromIdx, toKind, toIdx) — move card + everything below it
 *   - moveFromFoundation(fromSuit, toKind, toIdx) — pull a card off a foundation
 * toKind: "tableau" | "foundation"; toIdx: column index or suit index
 *
 * Each move call returns { ok: bool, reason?: string }.
 *
 * Win detection: isWon() — all 4 foundations have 13 cards each.
 */

const SUITS = ["H", "D", "C", "S"];

export class SolitaireKlondike {
  constructor() {
    this.tableau = [[], [], [], [], [], [], []];
    this.stock = [];
    this.waste = [];
    this.foundations = { H: [], D: [], C: [], S: [] };
    this.moves = 0;
    this.score = 0;
    this.history = []; // for undo
  }

  /** Start a new deal. Shuffle a fresh deck and lay out the tableau. */
  newGame() {
    this.tableau = [[], [], [], [], [], [], []];
    this.stock = [];
    this.waste = [];
    this.foundations = { H: [], D: [], C: [], S: [] };
    this.moves = 0;
    this.score = 0;
    this.history = [];

    const deck = SolitaireKlondike.buildDeck();
    SolitaireKlondike.shuffle(deck);

    // Tableau deal: column i has i+1 cards; only the top one is face-up.
    let idx = 0;
    for (let col = 0; col < 7; col += 1) {
      for (let pos = 0; pos <= col; pos += 1) {
        const card = deck[idx];
        idx += 1;
        card.faceUp = (pos === col);
        this.tableau[col].push(card);
      }
    }
    // Remaining cards form the stock (face-down).
    while (idx < deck.length) {
      const card = deck[idx];
      idx += 1;
      card.faceUp = false;
      this.stock.push(card);
    }
  }

  static buildDeck() {
    const deck = [];
    for (const suit of SUITS) {
      for (let rank = 1; rank <= 13; rank += 1) {
        deck.push({ suit, rank, faceUp: false });
      }
    }
    return deck;
  }

  static shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  static isRed(suit) { return suit === "H" || suit === "D"; }
  static isBlack(suit) { return suit === "C" || suit === "S"; }
  static rankName(rank) {
    if (rank === 1) return "A";
    if (rank === 11) return "J";
    if (rank === 12) return "Q";
    if (rank === 13) return "K";
    return String(rank);
  }

  /** Draw 3 cards from stock to waste (or fewer if stock is short).
   *  If stock is empty, recycle waste → stock (face-down). */
  draw() {
    this._snapshot();
    if (this.stock.length === 0) {
      // Recycle: move all waste back to stock face-down, in REVERSE order
      // so the next draw produces the same waste sequence again.
      while (this.waste.length > 0) {
        const c = this.waste.pop();
        c.faceUp = false;
        this.stock.push(c);
      }
      this.moves += 1;
      return { ok: true, drew: 0 };
    }
    let drew = 0;
    for (let i = 0; i < 3 && this.stock.length > 0; i += 1) {
      const card = this.stock.pop();
      card.faceUp = true;
      this.waste.push(card);
      drew += 1;
    }
    this.moves += 1;
    return { ok: true, drew };
  }

  /** Top card of waste (the only one playable). */
  wasteTop() {
    return this.waste.length > 0 ? this.waste[this.waste.length - 1] : null;
  }

  /** Top card of a tableau column (the visible playable one). */
  tableauTop(col) {
    const pile = this.tableau[col];
    return pile.length > 0 ? pile[pile.length - 1] : null;
  }

  /** Top card of a foundation. */
  foundationTop(suit) {
    const pile = this.foundations[suit];
    return pile.length > 0 ? pile[pile.length - 1] : null;
  }

  /** True if `card` can legally land on `target` in the tableau (alternating
   *  colors, descending rank). target=null means moving onto an empty column,
   *  which only accepts a King. */
  canStackTableau(card, target) {
    if (!card) return false;
    if (!target) return card.rank === 13; // empty col only takes a King
    if (!target.faceUp) return false;
    const colorOK = (SolitaireKlondike.isRed(card.suit) !== SolitaireKlondike.isRed(target.suit));
    return colorOK && card.rank === target.rank - 1;
  }

  /** True if `card` can legally land on a foundation pile (same suit,
   *  rank+1 of the current top — Ace if foundation is empty). */
  canStackFoundation(card, suit) {
    if (!card || card.suit !== suit) return false;
    const top = this.foundationTop(suit);
    if (!top) return card.rank === 1; // Ace
    return card.rank === top.rank + 1;
  }

  /** Move the waste top to a tableau column or foundation. */
  moveFromWaste(toKind, toIdx) {
    const card = this.wasteTop();
    if (!card) return { ok: false, reason: "waste-empty" };
    if (toKind === "tableau") {
      const target = this.tableauTop(toIdx);
      if (!this.canStackTableau(card, target)) return { ok: false, reason: "illegal-stack" };
      this._snapshot();
      this.waste.pop();
      this.tableau[toIdx].push(card);
      this.score += 5;
      this.moves += 1;
      return { ok: true };
    }
    if (toKind === "foundation") {
      const suit = SUITS[toIdx];
      if (!this.canStackFoundation(card, suit)) return { ok: false, reason: "illegal-foundation" };
      this._snapshot();
      this.waste.pop();
      this.foundations[suit].push(card);
      this.score += 10;
      this.moves += 1;
      return { ok: true };
    }
    return { ok: false, reason: "unknown-target" };
  }

  /** Move a card (and everything stacked on it) from tableau to another
   *  tableau column or foundation. fromIdx = position in source pile.
   *  toKind="foundation" only accepts a SINGLE card (you can't move a run
   *  onto a foundation). */
  moveFromTableau(fromCol, fromIdx, toKind, toIdx) {
    const sourcePile = this.tableau[fromCol];
    if (!sourcePile || fromIdx >= sourcePile.length) return { ok: false, reason: "no-card" };
    const card = sourcePile[fromIdx];
    if (!card.faceUp) return { ok: false, reason: "card-face-down" };
    const cards = sourcePile.slice(fromIdx); // cards being moved (incl. card)

    if (toKind === "foundation") {
      if (cards.length !== 1) return { ok: false, reason: "foundation-single-only" };
      const suit = SUITS[toIdx];
      if (!this.canStackFoundation(card, suit)) return { ok: false, reason: "illegal-foundation" };
      this._snapshot();
      sourcePile.pop();
      this.foundations[suit].push(card);
      this.score += 10;
    } else if (toKind === "tableau") {
      const target = this.tableauTop(toIdx);
      if (!this.canStackTableau(card, target)) return { ok: false, reason: "illegal-stack" };
      this._snapshot();
      // Remove `cards` from source
      sourcePile.splice(fromIdx, cards.length);
      // Append to destination
      for (const c of cards) this.tableau[toIdx].push(c);
      this.score += 5;
    } else {
      return { ok: false, reason: "unknown-target" };
    }

    // Reveal newly-exposed card on the source if it's face-down.
    const newTop = sourcePile[sourcePile.length - 1];
    if (newTop && !newTop.faceUp) {
      newTop.faceUp = true;
      this.score += 5;
    }
    this.moves += 1;
    return { ok: true };
  }

  /** Pull a card off a foundation (e.g. to free up a tableau move).
   *  toKind=="tableau" only — you can't move foundation→foundation. */
  moveFromFoundation(fromSuit, toKind, toIdx) {
    if (toKind !== "tableau") return { ok: false, reason: "unsupported" };
    const card = this.foundationTop(fromSuit);
    if (!card) return { ok: false, reason: "foundation-empty" };
    const target = this.tableauTop(toIdx);
    if (!this.canStackTableau(card, target)) return { ok: false, reason: "illegal-stack" };
    this._snapshot();
    this.foundations[fromSuit].pop();
    this.tableau[toIdx].push(card);
    this.score -= 10; // pulling off foundation is rare; standard scoring penalizes
    this.moves += 1;
    return { ok: true };
  }

  /** True if all 4 foundations contain 13 cards. */
  isWon() {
    for (const suit of SUITS) {
      if (this.foundations[suit].length !== 13) return false;
    }
    return true;
  }

  /** Snapshot for undo (deep copy). Caller invokes undo() to revert. */
  _snapshot() {
    this.history.push(JSON.stringify({
      tableau: this.tableau,
      stock: this.stock,
      waste: this.waste,
      foundations: this.foundations,
      moves: this.moves,
      score: this.score
    }));
    if (this.history.length > 30) this.history.shift(); // cap
  }

  /** Revert to the most recent snapshot. Returns true on undo, false if
   *  no history. */
  undo() {
    if (this.history.length === 0) return false;
    const snap = JSON.parse(this.history.pop());
    this.tableau = snap.tableau;
    this.stock = snap.stock;
    this.waste = snap.waste;
    this.foundations = snap.foundations;
    this.moves = Math.max(0, snap.moves);
    this.score = snap.score;
    return true;
  }

  /** Auto-flip waste-top + each tableau-top card to its foundation if legal.
   *  Useful as an "auto-complete" button at endgame. Returns count moved. */
  autoFinishToFoundations() {
    let moved = 0;
    let progress = true;
    while (progress) {
      progress = false;
      // Try waste top
      const wt = this.wasteTop();
      if (wt) {
        const idx = SUITS.indexOf(wt.suit);
        if (this.canStackFoundation(wt, wt.suit)) {
          this.moveFromWaste("foundation", idx);
          moved += 1;
          progress = true;
          continue;
        }
      }
      // Try each tableau column
      for (let col = 0; col < 7; col += 1) {
        const top = this.tableauTop(col);
        if (top && top.faceUp) {
          const idx = SUITS.indexOf(top.suit);
          if (this.canStackFoundation(top, top.suit)) {
            const i = this.tableau[col].length - 1;
            this.moveFromTableau(col, i, "foundation", idx);
            moved += 1;
            progress = true;
            break;
          }
        }
      }
    }
    return moved;
  }
}

/** Card display helpers. Use Unicode card symbols + suit chars. */
export const CARD_SYMBOLS = {
  H: { char: "♥", color: "#dc2626" },
  D: { char: "♦", color: "#dc2626" },
  C: { char: "♣", color: "#1f2937" },
  S: { char: "♠", color: "#1f2937" }
};
// END mchatai-web-components: entities.solitaire-klondike
