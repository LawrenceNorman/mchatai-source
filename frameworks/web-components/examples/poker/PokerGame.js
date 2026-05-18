import { TurnBasedManager } from "../../core/TurnBasedManager.js";
import { Deck } from "../../entities/Deck.js";
import { PokerHandEvaluator } from "../../entities/PokerHandEvaluator.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { AudioManager } from "../../resources/AudioManager.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";

/*
 * Heads-Up Texas Hold'em poker example.
 *
 * Two players (You + CPU). Each gets 2 hole cards. Five community cards
 * are dealt in three streets (flop, turn, river). Players check / call /
 * raise / fold each street. Best 5-card poker hand wins the pot at
 * showdown. CPU is intentionally simple — calls small bets, raises with
 * strong made hands, folds garbage. Beat it on bluffs.
 *
 * Phases: idle → preflop → flop → turn → river → showdown → idle.
 */

const SUIT_LABELS = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠"
};

const SMALL_BLIND = 5;
const BIG_BLIND = 10;
const RAISE_STEP = 20;

const HAND_NAMES = {
  "straight-flush": "Straight flush",
  "four-kind": "Four of a kind",
  "full-house": "Full house",
  "flush": "Flush",
  "straight": "Straight",
  "three-kind": "Three of a kind",
  "two-pair": "Two pair",
  "pair": "Pair",
  "high-card": "High card"
};

function $(root, sel) {
  return root.querySelector(sel);
}

function readNum(key, fallback) {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function writeNum(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {}
}

export class PokerGame {
  constructor(options = {}) {
    this.root = options.root || document;
    this.prefix = options.storagePrefix || "mchatai.poker";
    this.startingStack = options.startingStack || 100;

    this.playerStack = readNum(`${this.prefix}.playerStack`, this.startingStack);
    this.cpuStack = readNum(`${this.prefix}.cpuStack`, this.startingStack);
    if (this.playerStack <= 0) this.playerStack = this.startingStack;
    if (this.cpuStack <= 0) this.cpuStack = this.startingStack;

    this.turns = new TurnBasedManager({ players: ["player", "cpu"], phase: "idle" });
    this.deck = new Deck({ decks: 1, shuffle: true });
    this.evaluator = new PokerHandEvaluator();
    this.audio = (typeof AudioManager === "function")
      ? new AudioManager({ masterVolume: 0.055 })
      : { beep: () => {}, noise: () => {} };

    this.scoreboard = new ScoreBoard({
      target: $(this.root, "#scoreboard"),
      storageKey: `${this.prefix}.bestStack`,
      scoreLabel: "Stack",
      highScoreLabel: "Best",
      initialScore: this.playerStack,
      initialHighScore: this.playerStack
    });

    this.playerHole = [];
    this.cpuHole = [];
    this.community = [];
    this.pot = 0;
    this.toCall = 0;
    this.phase = "idle";
    this.activeBetter = "player"; // who acts next
    this.lastAggressor = null;    // who put in the last bet/raise
    this.handBets = { player: 0, cpu: 0 };
    this.handResult = null;
    this.cpuRevealed = false;
  }

  start() {
    if (typeof applySwatchVariables === "function" && typeof getSwatchByID === "function") {
      applySwatchVariables(document.documentElement, getSwatchByID("sunset-arcade"));
    }
    this.bind();
    this.render();
  }

  bind() {
    $(this.root, "#dealButton").addEventListener("click", () => this.dealHand());
    $(this.root, "#checkButton").addEventListener("click", () => this.act("check"));
    $(this.root, "#callButton").addEventListener("click", () => this.act("call"));
    $(this.root, "#raiseButton").addEventListener("click", () => this.act("raise"));
    $(this.root, "#foldButton").addEventListener("click", () => this.act("fold"));
    $(this.root, "#continueButton").addEventListener("click", () => {
      const cb = this._pendingContinue;
      this._pendingContinue = null;
      $(this.root, "#continueButton").hidden = true;
      $(this.root, "#dealButton").disabled = false;
      if (cb) cb();
    });
  }

  // Pause + Continue at the showdown so the player can read both hole
  // cards + the hand-evaluation reason ("Two Pair beats Pair") before
  // the pot is awarded and the table resets. Wisdom rule
  // cg-round-end-pause-or-continue.
  pauseAndContinue(message, callback) {
    this.setMessage(message + "  —  press Continue.");
    this._pendingContinue = callback;
    $(this.root, "#continueButton").hidden = false;
    $(this.root, "#dealButton").disabled = true;
  }

  // ── Hand lifecycle ────────────────────────────────────────────────

  dealHand() {
    if (this.playerStack <= 0 || this.cpuStack <= 0) {
      this.playerStack = this.startingStack;
      this.cpuStack = this.startingStack;
    }
    if (this.deck.remaining() < 16) {
      this.deck.reset({ decks: 1, shuffle: true });
    }

    this.playerHole = [this.draw(), this.draw()];
    this.cpuHole = [this.draw(), this.draw()];
    this.community = [];
    this.cpuRevealed = false;
    this.handResult = null;
    this.handBets = { player: 0, cpu: 0 };
    this.lastAggressor = null;

    // Player posts small, CPU posts big. Player acts first pre-flop.
    this.takeFromStack("player", SMALL_BLIND);
    this.takeFromStack("cpu", BIG_BLIND);
    this.pot = SMALL_BLIND + BIG_BLIND;
    this.toCall = BIG_BLIND - SMALL_BLIND;
    this.handBets.player = SMALL_BLIND;
    this.handBets.cpu = BIG_BLIND;

    this.phase = "preflop";
    this.activeBetter = "player";
    this.turns.reset({ phase: "preflop" });
    this.turns.record({ type: "deal", pot: this.pot });
    this.setMessage(`Pre-flop. You posted SB (${SMALL_BLIND}). CPU posted BB (${BIG_BLIND}). To call: ${this.toCall}.`);
    this.audio.beep({ freq: 440, duration: 0.06, type: "triangle" });
    this.render();
  }

  draw() {
    let card = this.deck.draw();
    if (!card) {
      this.deck.reset({ decks: 1, shuffle: true });
      card = this.deck.draw();
    }
    return card;
  }

  act(action) {
    if (this.activeBetter !== "player" || this.phase === "idle" || this.phase === "showdown") {
      return;
    }
    this.applyAction("player", action);
    if (this.phase !== "showdown" && this.phase !== "idle") {
      this.runCPU();
    }
  }

  runCPU() {
    // CPU strategy: evaluate its current best hand from hole + community.
    // Strong made hand (pair or better with a real kicker) raises if it can,
    // mid-strength calls, weak folds to a raise / checks when free.
    if (this.activeBetter !== "cpu") return;
    setTimeout(() => {
      const cpuStrength = this.evaluator.evaluate([...this.cpuHole, ...this.community]);
      const strength = cpuStrength ? cpuStrength.score : 0;
      const callCost = this.toCall;
      let action;
      if (callCost === 0) {
        action = strength >= 2 ? "raise" : "check";
      } else if (callCost <= BIG_BLIND) {
        action = strength >= 3 ? "raise" : "call";
      } else {
        action = strength >= 4 ? "raise" : (strength >= 1 ? "call" : "fold");
      }
      if (action === "raise" && this.cpuStack < callCost + RAISE_STEP) {
        action = callCost > 0 && this.cpuStack >= callCost ? "call" : "fold";
      }
      this.applyAction("cpu", action);
      this.render();
    }, 350);
  }

  applyAction(who, action) {
    if (action === "fold") {
      this.endHand({ winner: other(who), reason: `${labelFor(who)} folded` });
      return;
    }
    if (action === "check") {
      if (this.toCall > 0) {
        // Treat illegal check as a call for simplicity.
        action = "call";
      } else {
        this.turns.record({ type: "check", who });
        this.advanceTurnAfterAction(who, false);
        return;
      }
    }
    if (action === "call") {
      const amount = Math.min(this.toCall, this.stackOf(who));
      this.takeFromStack(who, amount);
      this.pot += amount;
      this.handBets[who] += amount;
      this.toCall = 0;
      this.turns.record({ type: "call", who, amount });
      this.advanceTurnAfterAction(who, false);
      return;
    }
    if (action === "raise") {
      const callPart = Math.min(this.toCall, this.stackOf(who));
      const raisePart = Math.min(RAISE_STEP, this.stackOf(who) - callPart);
      const total = callPart + raisePart;
      this.takeFromStack(who, total);
      this.pot += total;
      this.handBets[who] += total;
      this.toCall = raisePart;
      this.lastAggressor = who;
      this.turns.record({ type: "raise", who, amount: total });
      this.advanceTurnAfterAction(who, true);
      return;
    }
  }

  advanceTurnAfterAction(who, wasAggressive) {
    const opponent = other(who);
    if (wasAggressive) {
      this.activeBetter = opponent;
      this.setMessage(`${labelFor(who)} raises. ${labelFor(opponent)} to act. To call: ${this.toCall}.`);
      return;
    }
    // Non-aggressive close-out: if both players are even AND it's now the
    // aggressor's (or post-deal initiator's) turn, advance the street.
    const allEqual = this.handBets.player === this.handBets.cpu;
    if (allEqual) {
      this.advanceStreet();
    } else {
      this.activeBetter = opponent;
      this.setMessage(`${labelFor(who)} acts. ${labelFor(opponent)} to call ${this.toCall}.`);
    }
  }

  advanceStreet() {
    this.toCall = 0;
    this.handBets = { player: 0, cpu: 0 };
    if (this.phase === "preflop") {
      this.phase = "flop";
      this.community.push(this.draw(), this.draw(), this.draw());
      this.setMessage("Flop is out. Action on you.");
    } else if (this.phase === "flop") {
      this.phase = "turn";
      this.community.push(this.draw());
      this.setMessage("Turn is out. Action on you.");
    } else if (this.phase === "turn") {
      this.phase = "river";
      this.community.push(this.draw());
      this.setMessage("River is out. Action on you.");
    } else if (this.phase === "river") {
      this.showdown();
      return;
    }
    this.activeBetter = "player";
    this.turns.setPhase(this.phase);
  }

  showdown() {
    this.phase = "showdown";
    this.cpuRevealed = true;
    const playerBest = this.evaluator.evaluate([...this.playerHole, ...this.community]);
    const cpuBest = this.evaluator.evaluate([...this.cpuHole, ...this.community]);
    const cmp = this.evaluator.compare(playerBest, cpuBest);
    let winner;
    let reason;
    if (cmp > 0) {
      winner = "player";
      reason = `${HAND_NAMES[playerBest.name] || playerBest.name} beats ${HAND_NAMES[cpuBest.name] || cpuBest.name}`;
    } else if (cmp < 0) {
      winner = "cpu";
      reason = `${HAND_NAMES[cpuBest.name] || cpuBest.name} beats ${HAND_NAMES[playerBest.name] || playerBest.name}`;
    } else {
      winner = "split";
      reason = `Tie — ${HAND_NAMES[playerBest.name] || playerBest.name}`;
    }
    // Render the revealed CPU hand + community before pausing so the
    // player can see both hands while reading the result.
    this.render();
    const headline = winner === "split"
      ? `Split pot — ${reason}.`
      : `${labelFor(winner)} wins ${this.pot} — ${reason}.`;
    this.pauseAndContinue(headline, () => this.endHand({ winner, reason }));
  }

  endHand({ winner, reason }) {
    if (winner === "player") {
      this.playerStack += this.pot;
    } else if (winner === "cpu") {
      this.cpuStack += this.pot;
    } else {
      const half = Math.floor(this.pot / 2);
      this.playerStack += half;
      this.cpuStack += this.pot - half;
    }
    writeNum(`${this.prefix}.playerStack`, this.playerStack);
    writeNum(`${this.prefix}.cpuStack`, this.cpuStack);
    this.scoreboard.setScore(this.playerStack);

    this.handResult = { winner, reason };
    this.pot = 0;
    this.toCall = 0;
    this.cpuRevealed = true;
    this.phase = "idle";
    this.activeBetter = "player";
    this.turns.setPhase("idle", { winner, reason });
    this.setMessage(`${winner === "split" ? "Pot split" : labelFor(winner) + " wins"}: ${reason}. Press Deal for next hand.`);
    this.audio.noise({ duration: 0.07 });
  }

  // ── Helpers ────────────────────────────────────────────────────────

  stackOf(who) { return who === "player" ? this.playerStack : this.cpuStack; }

  takeFromStack(who, amount) {
    if (who === "player") this.playerStack = Math.max(0, this.playerStack - amount);
    else this.cpuStack = Math.max(0, this.cpuStack - amount);
  }

  // ── Rendering ──────────────────────────────────────────────────────

  render() {
    $(this.root, "#pot").textContent = String(this.pot);
    $(this.root, "#toCall").textContent = String(this.toCall);
    $(this.root, "#phase").textContent = this.phaseLabel();
    $(this.root, "#playerStack").textContent = String(this.playerStack);
    $(this.root, "#cpuStack").textContent = String(this.cpuStack);
    $(this.root, "#playerStatus").textContent = this.activeBetter === "player" && this.phase !== "idle" ? "Your move" : "Waiting…";
    $(this.root, "#cpuStatus").textContent = this.activeBetter === "cpu" && this.phase !== "idle" ? "Thinking…" : (this.phase === "idle" ? "Ready" : "Waiting…");
    this.renderHand("#playerCards", this.playerHole, false);
    this.renderHand("#cpuCards", this.cpuHole, !this.cpuRevealed);
    this.renderHand("#communityCards", this.community, false);
    this.updateButtons();
  }

  phaseLabel() {
    return {
      idle: "Press Deal",
      preflop: "Pre-flop",
      flop: "Flop",
      turn: "Turn",
      river: "River",
      showdown: "Showdown"
    }[this.phase] || this.phase;
  }

  renderHand(selector, cards, hidden) {
    const target = $(this.root, selector);
    target.innerHTML = "";
    cards.forEach((card) => {
      target.appendChild(this.cardElement(card, hidden));
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
    const suit = SUIT_LABELS[card.suit] || card.suit[0].toUpperCase();
    el.innerHTML = `
      <div class="card-corner card-corner-tl">
        <div class="rank">${card.rank}</div>
        <div class="suit">${suit}</div>
      </div>
      <div class="card-center">${suit}</div>
      <div class="card-corner card-corner-br">
        <div class="rank">${card.rank}</div>
        <div class="suit">${suit}</div>
      </div>
    `;
    return el;
  }

  updateButtons() {
    const idle = this.phase === "idle" || this.phase === "showdown";
    const playerToAct = this.activeBetter === "player" && !idle;
    $(this.root, "#dealButton").disabled = !idle;
    $(this.root, "#checkButton").disabled = !playerToAct || this.toCall > 0;
    $(this.root, "#callButton").disabled = !playerToAct || this.toCall === 0 || this.playerStack === 0;
    $(this.root, "#raiseButton").disabled = !playerToAct || this.playerStack < this.toCall + RAISE_STEP;
    $(this.root, "#foldButton").disabled = !playerToAct;
  }

  setMessage(text) {
    $(this.root, "#message").textContent = text;
  }
}

function other(who) { return who === "player" ? "cpu" : "player"; }
function labelFor(who) { return who === "player" ? "You" : "CPU"; }
