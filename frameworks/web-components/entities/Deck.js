import { Card, RANKS, SUITS } from "./Card.js";

export class Deck {
  constructor(options = {}) {
    this.ranks = options.ranks || RANKS;
    this.suits = options.suits || SUITS;
    this.cards = [];
    this.reset(options);
  }

  reset(options = {}) {
    const decks = options.decks ?? 1;
    this.cards = [];
    for (let d = 0; d < decks; d += 1) {
      for (const suit of this.suits) {
        for (const rank of this.ranks) {
          this.cards.push(new Card(rank, suit));
        }
      }
    }
    if (options.shuffle !== false) {
      this.shuffle();
    }
    return this;
  }

  shuffle(random = Math.random) {
    for (let i = this.cards.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
    return this;
  }

  draw(count = 1) {
    if (count === 1) {
      return this.cards.pop() || null;
    }
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const card = this.draw(1);
      if (card) {
        out.push(card);
      }
    }
    return out;
  }

  remaining() {
    return this.cards.length;
  }
}

export function scoreBlackjackHand(cards) {
  return blackjackHandValue(cards).total;
}

export function blackjackHandValue(cards) {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += card.blackjackValue;
    if (card.rank === "A") {
      aces += 1;
    }
  }
  const naturalAces = aces;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return {
    total,
    soft: naturalAces > 0 && aces > 0
  };
}
