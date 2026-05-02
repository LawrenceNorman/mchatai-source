import { blackjackHandValue } from "./Deck.js";

export class BlackjackRules {
  constructor(options = {}) {
    this.blackjackPayout = options.blackjackPayout ?? 1.5;
    this.dealerStandSoft17 = options.dealerStandSoft17 !== false;
  }

  handValue(cards) {
    return blackjackHandValue(cards);
  }

  isBlackjack(cards) {
    return cards.length === 2 && blackjackHandValue(cards).total === 21;
  }

  isBust(cards) {
    return blackjackHandValue(cards).total > 21;
  }

  shouldDealerHit(cards) {
    const value = blackjackHandValue(cards);
    if (value.total < 17) {
      return true;
    }
    if (value.total === 17 && value.soft && !this.dealerStandSoft17) {
      return true;
    }
    return false;
  }

  settle(playerCards, dealerCards, bet = 1) {
    const player = blackjackHandValue(playerCards);
    const dealer = blackjackHandValue(dealerCards);
    const playerBlackjack = this.isBlackjack(playerCards);
    const dealerBlackjack = this.isBlackjack(dealerCards);

    if (player.total > 21) return { outcome: "lose", payout: -bet, player, dealer };
    if (dealer.total > 21) return { outcome: "win", payout: bet, player, dealer };
    if (playerBlackjack && !dealerBlackjack) return { outcome: "blackjack", payout: bet * this.blackjackPayout, player, dealer };
    if (dealerBlackjack && !playerBlackjack) return { outcome: "lose", payout: -bet, player, dealer };
    if (player.total > dealer.total) return { outcome: "win", payout: bet, player, dealer };
    if (player.total < dealer.total) return { outcome: "lose", payout: -bet, player, dealer };
    return { outcome: "push", payout: 0, player, dealer };
  }
}
