import { TurnBasedManager } from "../../core/TurnBasedManager.js";
import { Deck } from "../../entities/Deck.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { AudioManager } from "../../resources/AudioManager.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";

/*
 * Cribbage Lego example - 2-player heads-up.
 *
 * Phases: idle -> deal -> discard -> cut -> pegging -> show -> idle (loop).
 *
 * Rules summary (implemented inline; future Lego: entities.cribbage-rules):
 *   - Deal 6 cards to each player.
 *   - Each player discards 2 to the crib. Dealer owns the crib this hand.
 *   - Cut a card from the rest of the deck; if Jack, dealer pegs 2 (his nobs).
 *   - Pegging: players alternate playing cards; running total. Score:
 *       fifteen (=15)                 -> +2
 *       thirty-one (=31)              -> +2 and reset count
 *       pair (same rank)              -> +2 / triple +6 / quadruple +12
 *       run of 3+                     -> +N
 *       go (cant play under 31)       -> opponent +1
 *   - Show phase scoring (each hand + crib):
 *       fifteens (sums to 15)         -> +2 each combo
 *       pairs / triples / quadruples  -> +2 / +6 / +12
 *       run of 3 / 4 / 5              -> +3 / +4 / +5
 *       flush (4-card)                -> +4 (+1 if cut matches)
 *       his-knobs (J of cut suit)     -> +1
 *   - First to 121 pegs wins.
 */

const SUITS = ["clubs", "diamonds", "hearts", "spades"];
const SUIT_LABELS = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" };
const RANK_VALUES = { A:1, "2":2, "3":3, "4":4, "5":5, "6":6, "7":7, "8":8, "9":9, "10":10, J:10, Q:10, K:10 };
const RANK_ORDER  = { A:1, "2":2, "3":3, "4":4, "5":5, "6":6, "7":7, "8":8, "9":9, "10":10, J:11, Q:12, K:13 };

function $(root, sel) { return root.querySelector(sel); }
function readNum(key, fallback) { try { const v = Number(localStorage.getItem(key)); return Number.isFinite(v) ? v : fallback; } catch { return fallback; } }
function writeNum(key, value) { try { localStorage.setItem(key, String(value)); } catch {} }

export class CribbageGame {
  constructor(options = {}) {
    this.root = options.root || document;
    this.prefix = options.storagePrefix || "mchatai.cribbage";
    this.winningScore = options.winningScore || 121;

    this.pegsYou = readNum(`${this.prefix}.pegsYou`, 0);
    this.pegsCpu = readNum(`${this.prefix}.pegsCpu`, 0);
    this.dealer = "cpu"; // crib goes to dealer; alternates each hand

    this.turns = new TurnBasedManager({ players: ["player", "cpu"], phase: "idle" });
    this.deck = new Deck({ decks: 1, shuffle: true });
    this.audio = (typeof AudioManager === "function")
      ? new AudioManager({ masterVolume: 0.05 })
      : { beep: () => {}, noise: () => {} };

    this.scoreboard = new ScoreBoard({
      target: $(this.root, "#scoreboard"),
      storageKey: `${this.prefix}.bestPegs`,
      scoreLabel: "Pegs",
      highScoreLabel: "Best",
      initialScore: this.pegsYou,
      initialHighScore: this.pegsYou
    });

    this.playerHand = [];     // 6 cards dealt; pruned to 4 after discard
    this.cpuHand = [];
    this.crib = [];           // 4 cards (2 from each)
    this.peggingPile = [];
    this.peggingCount = 0;
    this.cutCard = null;
    this.phase = "idle";
    this.selected = new Set(); // indices in playerHand selected for discard
    this.activeBetter = "player";
    this.lastToPlay = null;   // for "go" credit
    this.gameOver = false;
  }

  start() {
    if (typeof applySwatchVariables === "function" && typeof getSwatchByID === "function") {
      applySwatchVariables(document.documentElement, getSwatchByID("sunset-arcade"));
    }
    this.bind();
    this.renderPegBoard();
    this.render();
  }

  bind() {
    $(this.root, "#dealButton").addEventListener("click", () => this.dealHand());
    $(this.root, "#discardButton").addEventListener("click", () => this.commitDiscard());
    $(this.root, "#playButton").addEventListener("click", () => this.playSelectedCard());
    $(this.root, "#goButton").addEventListener("click", () => this.declareGo());
    $(this.root, "#continueButton").addEventListener("click", () => {
      const cb = this._pendingContinue;
      this._pendingContinue = null;
      $(this.root, "#continueButton").hidden = true;
      if (cb) cb();
    });
  }

  // Pause + Continue at a scoring-event boundary so the player can absorb
  // what happened before the table clears (universal wisdom rule
  // cg-round-end-pause-or-continue). The pile + count remain visible
  // until the player clicks Continue.
  pauseAndContinue(message, callback) {
    this.setMessage(message + "  —  press Continue.");
    this._pendingContinue = callback;
    const btn = $(this.root, "#continueButton");
    btn.hidden = false;
    // Disable other action buttons while paused
    $(this.root, "#playButton").disabled = true;
    $(this.root, "#goButton").disabled = true;
  }

  // ----- Phase: deal -----
  dealHand() {
    if (this.gameOver) {
      this.pegsYou = 0; this.pegsCpu = 0;
      writeNum(`${this.prefix}.pegsYou`, 0);
      writeNum(`${this.prefix}.pegsCpu`, 0);
      this.gameOver = false;
    }
    this.deck.reset({ decks: 1, shuffle: true });
    this.playerHand = Array.from({ length: 6 }, () => this.draw());
    this.cpuHand    = Array.from({ length: 6 }, () => this.draw());
    this.crib = [];
    this.peggingPile = [];
    this.peggingCount = 0;
    this.cutCard = null;
    this.selected.clear();
    this.lastToPlay = null;
    this.dealer = this.dealer === "cpu" ? "player" : "cpu";
    this.phase = "discard";
    this.activeBetter = "player";
    this.turns.reset({ phase: "discard" });
    this.setMessage(`New hand. Dealer: ${this.dealer === "cpu" ? "CPU" : "You"}. Select 2 cards to discard to the crib.`);
    this.audio.beep({ freq: 440, duration: 0.05 });
    this.render();
  }

  draw() {
    let c = this.deck.draw();
    if (!c) { this.deck.reset({ decks: 1, shuffle: true }); c = this.deck.draw(); }
    return c;
  }

  // ----- Phase: discard -----
  toggleSelect(index) {
    if (this.phase !== "discard") return;
    if (this.selected.has(index)) this.selected.delete(index);
    else if (this.selected.size < 2) this.selected.add(index);
    this.render();
  }

  commitDiscard() {
    if (this.phase !== "discard" || this.selected.size !== 2) return;
    const indices = [...this.selected].sort((a,b) => b - a);
    for (const i of indices) {
      this.crib.push(this.playerHand[i]);
      this.playerHand.splice(i, 1);
    }
    // CPU picks its 2 worst (smallest pip total - simple heuristic).
    const cpuChoice = [...this.cpuHand.keys()]
      .sort((a, b) => RANK_VALUES[this.cpuHand[a].rank] - RANK_VALUES[this.cpuHand[b].rank])
      .slice(0, 2)
      .sort((a, b) => b - a);
    for (const i of cpuChoice) {
      this.crib.push(this.cpuHand[i]);
      this.cpuHand.splice(i, 1);
    }
    this.selected.clear();
    this.cutCard = this.draw();
    // His nobs: dealer scores 2 for cut Jack.
    if (this.cutCard.rank === "J") {
      this.score(this.dealer, 2, "His nobs (cut Jack)");
      if (this.gameOver) return;
    }
    this.phase = "pegging";
    this.activeBetter = this.dealer === "cpu" ? "player" : "cpu"; // non-dealer leads
    this.turns.setPhase("pegging");
    this.setMessage(`Cut: ${this.cutCard.rank}${SUIT_LABELS[this.cutCard.suit]}. Pegging begins. ${this.activeBetter === "player" ? "Your" : "CPU"} lead.`);
    this.render();
    if (this.activeBetter === "cpu") setTimeout(() => this.cpuPlay(), 600);
  }

  // ----- Phase: pegging -----
  playSelectedCard() {
    if (this.phase !== "pegging" || this.activeBetter !== "player" || this.selected.size !== 1) return;
    const idx = [...this.selected][0];
    const card = this.playerHand[idx];
    if (this.peggingCount + RANK_VALUES[card.rank] > 31) {
      this.setMessage("Cant play - would exceed 31. Press Go.");
      return;
    }
    this.playerHand.splice(idx, 1);
    this.peggingPile.push({ ...card, by: "player" });
    this.peggingCount += RANK_VALUES[card.rank];
    this.lastToPlay = "player";
    this.selected.clear();
    this.scorePegging("player");
    if (this.gameOver) return;
    this.afterPlay();
  }

  cpuPlay() {
    if (this.phase !== "pegging" || this.activeBetter !== "cpu") return;
    const playable = this.cpuHand
      .map((c, i) => ({ c, i }))
      .filter(x => this.peggingCount + RANK_VALUES[x.c.rank] <= 31);
    if (playable.length === 0) {
      this.declareGo();
      return;
    }
    // Simple CPU: prefer the play that scores most points right now.
    let best = playable[0];
    let bestScore = -1;
    for (const x of playable) {
      const after = this.peggingCount + RANK_VALUES[x.c.rank];
      let s = 0;
      if (after === 15 || after === 31) s += 2;
      // pair / run scan (light heuristic)
      const recent = this.peggingPile.slice(-3).map(p => p.rank);
      if (recent[recent.length - 1] === x.c.rank) s += 2;
      if (s > bestScore) { bestScore = s; best = x; }
    }
    const card = this.cpuHand[best.i];
    this.cpuHand.splice(best.i, 1);
    this.peggingPile.push({ ...card, by: "cpu" });
    this.peggingCount += RANK_VALUES[card.rank];
    this.lastToPlay = "cpu";
    this.scorePegging("cpu");
    if (this.gameOver) return;
    this.afterPlay();
  }

  scorePegging(who) {
    let gain = 0;
    const notes = [];
    if (this.peggingCount === 15) { gain += 2; notes.push("fifteen"); }
    if (this.peggingCount === 31) { gain += 2; notes.push("thirty-one"); }
    // pairs: consecutive same-rank cards from the end
    let pairRun = 1;
    const reversed = this.peggingPile.slice().reverse();
    const last = reversed[0];
    for (let i = 1; i < reversed.length; i += 1) {
      if (reversed[i].rank === last.rank) pairRun += 1; else break;
    }
    if (pairRun >= 2) {
      const pts = pairRun === 2 ? 2 : pairRun === 3 ? 6 : 12;
      gain += pts;
      notes.push(`${pairRun}-of-a-kind`);
    }
    // run of 3+: scan the trailing window
    for (let len = Math.min(7, reversed.length); len >= 3; len -= 1) {
      const tail = reversed.slice(0, len).map(c => RANK_ORDER[c.rank]).sort((a,b)=>a-b);
      let isRun = true;
      for (let i = 1; i < tail.length; i += 1) {
        if (tail[i] - tail[i-1] !== 1) { isRun = false; break; }
      }
      if (isRun) { gain += len; notes.push(`run of ${len}`); break; }
    }
    if (gain > 0) this.score(who, gain, notes.join(", "));
  }

  declareGo() {
    if (this.phase !== "pegging") return;
    const opponent = this.activeBetter === "player" ? "cpu" : "player";
    const opponentHand = opponent === "player" ? this.playerHand : this.cpuHand;
    const opponentCanPlay = opponentHand.some(c => this.peggingCount + RANK_VALUES[c.rank] <= 31);
    if (opponentCanPlay) {
      this.activeBetter = opponent;
      this.setMessage(`${this.activeBetter === "player" ? "Your turn" : "CPU plays"} - count at ${this.peggingCount}.`);
      this.render();
      if (this.activeBetter === "cpu") setTimeout(() => this.cpuPlay(), 600);
      return;
    }
    // Both stuck. Last-to-play scores 1 (or 2 if count===31).
    if (this.lastToPlay) {
      const pts = this.peggingCount === 31 ? 0 : 1; // already scored 31 above
      if (pts) this.score(this.lastToPlay, pts, "go");
    }
    const who = this.lastToPlay === "player" ? "You" : "CPU";
    const handsEmpty = this.playerHand.length === 0 && this.cpuHand.length === 0;
    const msg = handsEmpty
      ? `${who} laid the last card. On to The Show.`
      : `${who} scored Go (last to play). Round resets to 0.`;
    this.render();
    this.pauseAndContinue(msg, () => {
      // Reset count, continue pegging if cards remain.
      this.peggingPile = [];
      this.peggingCount = 0;
      if (this.playerHand.length === 0 && this.cpuHand.length === 0) {
        this.beginShow();
        return;
      }
      this.activeBetter = this.lastToPlay === "player" ? "cpu" : "player";
      if (!opponentHand.length) this.activeBetter = this.activeBetter === "player" ? "cpu" : "player";
      this.lastToPlay = null;
      this.render();
      if (this.activeBetter === "cpu") setTimeout(() => this.cpuPlay(), 600);
    });
  }

  afterPlay() {
    const hitThirtyOne = this.peggingCount === 31;
    const handsEmpty = this.playerHand.length === 0 && this.cpuHand.length === 0;
    if (hitThirtyOne || handsEmpty) {
      this.render();
      const who = this.lastToPlay === "player" ? "You" : "CPU";
      const msg = handsEmpty
        ? `${who} laid the last card. On to The Show.`
        : `${who} hit 31 — round resets to 0.`;
      this.pauseAndContinue(msg, () => {
        this.peggingPile = [];
        this.peggingCount = 0;
        this.lastToPlay = null;
        if (this.playerHand.length === 0 && this.cpuHand.length === 0) {
          this.beginShow();
          return;
        }
        this.activeBetter = this.activeBetter === "player" ? "cpu" : "player";
        this.render();
        if (this.activeBetter === "cpu") setTimeout(() => this.cpuPlay(), 600);
      });
      return;
    }
    this.activeBetter = this.activeBetter === "player" ? "cpu" : "player";
    this.render();
    if (this.activeBetter === "cpu") setTimeout(() => this.cpuPlay(), 600);
  }

  // ----- Phase: show -----
  beginShow() {
    this.phase = "show";
    const nonDealer = this.dealer === "cpu" ? "player" : "cpu";
    // Score non-dealer's 4-card hand first, then dealer's hand, then dealer's crib.
    const nonDealerHand = nonDealer === "player" ? this.playerHand : this.cpuHand;
    const dealerHand    = this.dealer === "player" ? this.playerHand : this.cpuHand;
    const showA = this.scoreShowHand(nonDealerHand, this.cutCard, false);
    if (showA > 0) this.score(nonDealer, showA, "show hand");
    if (this.gameOver) return;
    const showB = this.scoreShowHand(dealerHand, this.cutCard, false);
    if (showB > 0) this.score(this.dealer, showB, "show hand");
    if (this.gameOver) return;
    const showCrib = this.scoreShowHand(this.crib, this.cutCard, true);
    if (showCrib > 0) this.score(this.dealer, showCrib, "crib");
    if (this.gameOver) return;
    this.phase = "idle";
    this.setMessage(`Show complete. Deal next hand. You ${this.pegsYou} | CPU ${this.pegsCpu}.`);
    this.render();
  }

  scoreShowHand(hand, cut, isCrib) {
    const cards = [...hand, cut];
    let total = 0;
    // fifteens
    const sumsTo = (arr) => arr.reduce((s, c) => s + RANK_VALUES[c.rank], 0);
    const subsets = (arr) => {
      const out = [[]];
      for (const x of arr) {
        const len = out.length;
        for (let i = 0; i < len; i += 1) out.push([...out[i], x]);
      }
      return out.filter(s => s.length >= 2);
    };
    for (const s of subsets(cards)) if (sumsTo(s) === 15) total += 2;
    // pairs
    const rankBuckets = new Map();
    for (const c of cards) rankBuckets.set(c.rank, (rankBuckets.get(c.rank) || 0) + 1);
    for (const count of rankBuckets.values()) {
      if (count === 2) total += 2;
      else if (count === 3) total += 6;
      else if (count === 4) total += 12;
    }
    // runs (longest only, multiplied by repeats handled implicitly by counting subsets)
    const orderVals = cards.map(c => RANK_ORDER[c.rank]).sort((a,b)=>a-b);
    let bestRunLen = 0;
    for (let len = 5; len >= 3; len -= 1) {
      for (let i = 0; i + len <= orderVals.length; i += 1) {
        const slice = orderVals.slice(i, i + len);
        const dedup = [...new Set(slice)];
        if (dedup.length === len) {
          let isRun = true;
          for (let j = 1; j < len; j += 1) if (dedup[j] - dedup[j-1] !== 1) { isRun = false; break; }
          if (isRun) { bestRunLen = Math.max(bestRunLen, len); }
        }
      }
      if (bestRunLen >= len) break;
    }
    if (bestRunLen >= 3) total += bestRunLen;
    // flush (4-card hand of same suit; crib needs all 5)
    const handSuits = hand.map(c => c.suit);
    if (handSuits.every(s => s === handSuits[0])) {
      if (isCrib) { if (cut.suit === handSuits[0]) total += 5; }
      else { total += 4; if (cut.suit === handSuits[0]) total += 1; }
    }
    // his-knobs: Jack matching cut suit in hand
    for (const c of hand) if (c.rank === "J" && c.suit === cut.suit) total += 1;
    return total;
  }

  // ----- Scoring + game state -----
  score(who, points, note) {
    if (points <= 0) return;
    if (who === "player") this.pegsYou = Math.min(this.winningScore, this.pegsYou + points);
    else this.pegsCpu = Math.min(this.winningScore, this.pegsCpu + points);
    writeNum(`${this.prefix}.pegsYou`, this.pegsYou);
    writeNum(`${this.prefix}.pegsCpu`, this.pegsCpu);
    this.scoreboard.setScore(this.pegsYou);
    this.audio.beep({ freq: 580, duration: 0.04 });
    this.setMessage(`${who === "player" ? "You" : "CPU"} +${points} (${note}). ${this.pegsYou} - ${this.pegsCpu}.`);
    this.renderPegBoard();
    if (this.pegsYou >= this.winningScore || this.pegsCpu >= this.winningScore) {
      this.gameOver = true;
      this.phase = "idle";
      const winner = this.pegsYou >= this.winningScore ? "You" : "CPU";
      this.setMessage(`Game over - ${winner} wins! Press Deal to start a new game.`);
    }
  }

  // ----- Rendering -----
  render() {
    $(this.root, "#phase").textContent = this.phase[0].toUpperCase() + this.phase.slice(1);
    $(this.root, "#cutCard").textContent = this.cutCard ? `${this.cutCard.rank}${SUIT_LABELS[this.cutCard.suit]}` : "-";
    $(this.root, "#pegsYou").textContent = String(this.pegsYou);
    $(this.root, "#pegsCpu").textContent = String(this.pegsCpu);
    $(this.root, "#peggingCount").textContent = String(this.peggingCount);
    $(this.root, "#youDealerTag").textContent = this.dealer === "player" ? "Dealer" : "-";
    $(this.root, "#cpuDealerTag").textContent = this.dealer === "cpu" ? "Dealer" : "-";

    this.renderHand("#playerCards", this.playerHand, false, true);
    this.renderHand("#cpuCards", this.cpuHand, this.phase !== "show", false);
    this.renderHand("#cribCards", this.crib, this.phase !== "show", false);
    this.renderHand("#peggingCards", this.peggingPile, false, false);

    this.updateButtons();
  }

  renderHand(selector, cards, hidden, selectable) {
    const target = $(this.root, selector);
    target.innerHTML = "";
    cards.forEach((card, i) => {
      const el = this.cardElement(card, hidden);
      if (selectable && this.phase === "discard") {
        el.addEventListener("click", () => this.toggleSelect(i));
        if (this.selected.has(i)) el.classList.add("selected");
      } else if (selectable && this.phase === "pegging" && this.activeBetter === "player") {
        el.addEventListener("click", () => {
          this.selected.clear();
          this.selected.add(i);
          this.render();
        });
        if (this.selected.has(i)) el.classList.add("selected");
        if (this.peggingCount + RANK_VALUES[card.rank] > 31) el.classList.add("disabled");
      }
      target.appendChild(el);
    });
  }

  cardElement(card, faceDown) {
    const el = document.createElement("div");
    el.className = "card";
    el.dataset.faceDown = String(faceDown);
    if (faceDown) { el.textContent = "mAI"; return el; }
    el.dataset.color = card.color;
    const suit = SUIT_LABELS[card.suit] || card.suit[0].toUpperCase();
    el.innerHTML = `
      <div class="card-corner card-corner-tl"><div class="rank">${card.rank}</div><div class="suit">${suit}</div></div>
      <div class="card-center">${suit}</div>
      <div class="card-corner card-corner-br"><div class="rank">${card.rank}</div><div class="suit">${suit}</div></div>
    `;
    return el;
  }

  renderPegBoard() {
    const buildTrack = (selector, points, klass) => {
      const target = $(this.root, selector);
      target.innerHTML = "";
      for (let i = 0; i < this.winningScore; i += 1) {
        const hole = document.createElement("div");
        hole.className = "peg-hole";
        if (i < points) hole.classList.add(klass);
        target.appendChild(hole);
      }
    };
    buildTrack("#pegTrackYou", this.pegsYou, "you");
    buildTrack("#pegTrackCpu", this.pegsCpu, "cpu");
  }

  updateButtons() {
    $(this.root, "#dealButton").disabled = (this.phase !== "idle");
    const discardBtn = $(this.root, "#discardButton");
    discardBtn.disabled = !(this.phase === "discard" && this.selected.size === 2);
    discardBtn.textContent = this.dealer === "player" ? "Discard to Your Crib" : "Discard to CPU's Crib";
    $(this.root, "#playButton").disabled = !(this.phase === "pegging" && this.activeBetter === "player" && this.selected.size === 1);
    $(this.root, "#goButton").disabled = !(this.phase === "pegging" && this.activeBetter === "player");
  }

  setMessage(text) { $(this.root, "#message").textContent = text; }
}
