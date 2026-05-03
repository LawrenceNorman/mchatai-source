import { TurnBasedManager } from "../../core/TurnBasedManager.js";
import { Deck } from "../../entities/Deck.js";
import { BlackjackRules } from "../../entities/BlackjackRules.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { AudioManager } from "../../resources/AudioManager.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";

const SUIT_LABELS = {
  clubs: "C",
  diamonds: "D",
  hearts: "H",
  spades: "S"
};

function blackjackTarget(root, selector) {
  return root.querySelector(selector);
}

function readBlackjackStorageNumber(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeBlackjackStorageValue(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // ScoreBoard also degrades gracefully; this keeps the example usable in strict sandboxes.
  }
}

export class BlackjackGame {
  constructor(options = {}) {
    this.root = options.root || document;
    this.storagePrefix = options.storagePrefix || "mchatai.blackjack";
    this.startingBankroll = options.startingBankroll || 100;
    this.baseBet = options.baseBet || 10;
    this.bankroll = readBlackjackStorageNumber(`${this.storagePrefix}.bankroll`, this.startingBankroll);
    if (!Number.isFinite(this.bankroll) || this.bankroll <= 0) {
      this.bankroll = this.startingBankroll;
    }

    this.turns = new TurnBasedManager({ players: ["player", "dealer"], phase: "idle" });
    this.deck = new Deck({ decks: 1, shuffle: true });
    this.rules = new BlackjackRules({ dealerStandSoft17: true });
    this.audio = new AudioManager({ masterVolume: 0.055 });
    this.scoreboard = new ScoreBoard({
      target: blackjackTarget(this.root, "#scoreboard"),
      storageKey: `${this.storagePrefix}.bestBankroll`,
      scoreLabel: "Bankroll",
      highScoreLabel: "Best",
      initialScore: this.bankroll,
      initialHighScore: this.bankroll
    });

    this.playerCards = [];
    this.dealerCards = [];
    this.bet = this.baseBet;
    this.phase = "idle";
    this.dealerHoleHidden = true;
  }

  start() {
    applySwatchVariables(document.documentElement, getSwatchByID("sunset-arcade"));
    this.bindControls();
    this.render();
  }

  bindControls() {
    blackjackTarget(this.root, "#dealButton").addEventListener("click", () => this.dealHand());
    blackjackTarget(this.root, "#hitButton").addEventListener("click", () => this.hit());
    blackjackTarget(this.root, "#standButton").addEventListener("click", () => this.stand());
    blackjackTarget(this.root, "#doubleButton").addEventListener("click", () => this.doubleDown());
  }

  dealHand() {
    if (this.deck.remaining() < 18) {
      this.deck.reset({ decks: 1, shuffle: true });
    }
    if (this.bankroll <= 0) {
      this.bankroll = this.startingBankroll;
    }
    this.bet = Math.min(this.baseBet, this.bankroll);
    this.playerCards = [this.drawCard(), this.drawCard()];
    this.dealerCards = [this.drawCard(), this.drawCard()];
    this.phase = "player";
    this.dealerHoleHidden = true;
    this.turns.reset({ phase: "player" });
    this.turns.record({ type: "deal", bet: this.bet });
    this.setMessage("Hit, stand, or double.");
    this.audio.beep({ freq: 440, duration: 0.06, type: "triangle" });

    if (this.rules.isBlackjack(this.playerCards) || this.rules.isBlackjack(this.dealerCards)) {
      this.finishHand("Natural blackjack.");
    } else {
      this.render();
    }
  }

  drawCard() {
    let card = this.deck.draw();
    if (!card) {
      this.deck.reset({ decks: 1, shuffle: true });
      card = this.deck.draw();
    }
    return card;
  }

  hit() {
    if (this.phase !== "player") {
      return;
    }
    this.playerCards.push(this.drawCard());
    this.turns.record({ type: "hit" });
    this.audio.beep({ freq: 520, duration: 0.05, type: "square" });
    if (this.rules.isBust(this.playerCards)) {
      this.finishHand("Player busts.");
    } else {
      this.render();
    }
  }

  stand() {
    if (this.phase !== "player") {
      return;
    }
    this.turns.record({ type: "stand" });
    this.playDealer();
  }

  doubleDown() {
    if (this.phase !== "player" || this.playerCards.length !== 2 || this.bankroll < this.bet * 2) {
      return;
    }
    this.bet *= 2;
    this.playerCards.push(this.drawCard());
    this.turns.record({ type: "double", bet: this.bet });
    if (this.rules.isBust(this.playerCards)) {
      this.finishHand("Double down bust.");
    } else {
      this.playDealer();
    }
  }

  playDealer() {
    this.phase = "dealer";
    this.dealerHoleHidden = false;
    this.turns.setPhase("dealer");
    while (this.rules.shouldDealerHit(this.dealerCards)) {
      this.dealerCards.push(this.drawCard());
    }
    this.finishHand("Dealer stands.");
  }

  finishHand(prefix) {
    this.phase = "settled";
    this.dealerHoleHidden = false;
    const result = this.rules.settle(this.playerCards, this.dealerCards, this.bet);
    this.bankroll = Math.max(0, Math.round(this.bankroll + result.payout));
    writeBlackjackStorageValue(`${this.storagePrefix}.bankroll`, this.bankroll);
    this.scoreboard.setScore(this.bankroll);
    this.turns.setPhase("settled", { outcome: result.outcome });

    const phrase = {
      blackjack: "Blackjack pays 3:2.",
      win: "You win.",
      lose: "Dealer wins.",
      push: "Push."
    }[result.outcome] || result.outcome;
    this.setMessage(`${prefix} ${phrase} Bankroll ${this.bankroll}.`);
    this.audio.noise({ duration: 0.08, volume: 0.035 });
    this.render();
  }

  render() {
    blackjackTarget(this.root, "#bet").textContent = String(this.bet);
    blackjackTarget(this.root, "#deckCount").textContent = String(this.deck.remaining());
    blackjackTarget(this.root, "#phase").textContent = this.phase === "idle" ? "Deal" : this.phase;
    blackjackTarget(this.root, "#playerTotal").textContent = this.handLabel(this.playerCards);
    blackjackTarget(this.root, "#dealerTotal").textContent = this.dealerHoleHidden
      ? "?"
      : this.handLabel(this.dealerCards);
    this.renderHand("#playerCards", this.playerCards, false);
    this.renderHand("#dealerCards", this.dealerCards, this.dealerHoleHidden);
    this.updateButtons();
  }

  handLabel(cards) {
    if (cards.length === 0) {
      return "0";
    }
    const value = this.rules.handValue(cards);
    return value.soft ? `${value.total} soft` : String(value.total);
  }

  renderHand(selector, cards, hideHole) {
    const target = blackjackTarget(this.root, selector);
    target.innerHTML = "";
    cards.forEach((card, index) => {
      target.appendChild(this.cardElement(card, hideHole && index === 1));
    });
  }

  cardElement(card, faceDown = false) {
    const el = document.createElement("div");
    el.className = "card";
    el.dataset.faceDown = String(faceDown);
    if (faceDown) {
      el.textContent = "mAI";
      return el;
    }
    el.dataset.color = card.color;
    el.innerHTML = `
      <div class="rank">${card.rank}</div>
      <div class="suit">${SUIT_LABELS[card.suit] || card.suit[0].toUpperCase()}</div>
    `;
    return el;
  }

  updateButtons() {
    const inHand = this.phase === "player";
    blackjackTarget(this.root, "#dealButton").disabled = inHand || this.phase === "dealer";
    blackjackTarget(this.root, "#hitButton").disabled = !inHand;
    blackjackTarget(this.root, "#standButton").disabled = !inHand;
    blackjackTarget(this.root, "#doubleButton").disabled = !inHand || this.playerCards.length !== 2 || this.bankroll < this.bet * 2;
  }

  setMessage(message) {
    blackjackTarget(this.root, "#message").textContent = message;
  }
}
