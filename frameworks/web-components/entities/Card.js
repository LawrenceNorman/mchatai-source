export const SUITS = ["clubs", "diamonds", "hearts", "spades"];
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export class Card {
  constructor(rank, suit, options = {}) {
    this.rank = rank;
    this.suit = suit;
    this.faceUp = options.faceUp !== false;
  }

  get id() {
    return `${this.rank}${this.suit[0].toUpperCase()}`;
  }

  get color() {
    return this.suit === "hearts" || this.suit === "diamonds" ? "red" : "black";
  }

  get blackjackValue() {
    if (this.rank === "A") {
      return 11;
    }
    if (["K", "Q", "J"].includes(this.rank)) {
      return 10;
    }
    return Number(this.rank);
  }

  toString() {
    return `${this.rank} of ${this.suit}`;
  }
}
