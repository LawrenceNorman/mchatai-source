import { TurnBasedManager } from "../../core/TurnBasedManager.js";
import { Deck } from "../../entities/Deck.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { AudioManager } from "../../resources/AudioManager.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";

/*
 * Spades Lego example - 4-player partnership.
 *
 * Seating (clockwise): you, east, north (partner), west.
 * Partnerships: NS (you+north) vs EW (east+west).
 *
 * Phases: idle -> bidding -> playing -> handDone -> idle (loop until 500).
 *
 * Rules:
 *  - Deal 13 cards each.
 *  - Each player bids 0-13 expected tricks (0 = nil).
 *  - Lead the first trick (whoever has 2-of-clubs starts in some rules;
 *    here we just rotate dealer).
 *  - Must follow suit if possible. Otherwise free choice including trump.
 *  - Spades cannot be led until "broken" (someone has played a spade
 *    off-suit) unless your hand is all spades.
 *  - Highest card of the lead suit wins, unless trumped (spades), then
 *    the highest spade wins.
 *  - Scoring per partnership: bidMet -> +10*bid + 1*overtricks;
 *    bidMissed -> -10*bid. Nil success +100, nil failure -100.
 *  - Game to 500.
 */

const SUITS = ["clubs", "diamonds", "hearts", "spades"];
const SUIT_LABELS = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" };
const RANK_ORDER = { "2":2, "3":3, "4":4, "5":5, "6":6, "7":7, "8":8, "9":9, "10":10, J:11, Q:12, K:13, A:14 };
const SEATS = ["you", "east", "north", "west"];
const PARTNER = { you: "north", north: "you", east: "west", west: "east" };
const TEAM = { you: "ns", north: "ns", east: "ew", west: "ew" };

function $(root, sel) { return root.querySelector(sel); }
function nextSeat(s) { return SEATS[(SEATS.indexOf(s) + 1) % 4]; }
function readNum(key, fallback) { try { const v = Number(localStorage.getItem(key)); return Number.isFinite(v) ? v : fallback; } catch { return fallback; } }
function writeNum(key, value) { try { localStorage.setItem(key, String(value)); } catch {} }

export class SpadesGame {
  constructor(options = {}) {
    this.root = options.root || document;
    this.prefix = options.storagePrefix || "mchatai.spades";
    this.winningScore = options.winningScore || 500;

    this.scoreNS = readNum(`${this.prefix}.scoreNS`, 0);
    this.scoreEW = readNum(`${this.prefix}.scoreEW`, 0);
    this.handNum = readNum(`${this.prefix}.handNum`, 1);
    this.dealer = "east"; // dealer rotates; first-to-bid is dealer+1

    this.turns = new TurnBasedManager({ players: SEATS, phase: "idle" });
    this.deck = new Deck({ decks: 1, shuffle: true });
    this.audio = (typeof AudioManager === "function") ? new AudioManager({ masterVolume: 0.05 }) : { beep: () => {}, noise: () => {} };

    this.scoreboard = new ScoreBoard({
      target: $(this.root, "#scoreboard"),
      storageKey: `${this.prefix}.bestScore`,
      scoreLabel: "NS",
      highScoreLabel: "Best",
      initialScore: this.scoreNS,
      initialHighScore: this.scoreNS
    });

    this.hands = { you: [], east: [], north: [], west: [] };
    this.bids = { you: null, east: null, north: null, west: null };
    this.tricks = { you: 0, east: 0, north: 0, west: 0 };
    this.currentTrick = []; // [{ seat, card }]
    this.leader = null;
    this.activeSeat = null;
    this.spadesBroken = false;
    this.trickNum = 0;
    this.phase = "idle";
    this.gameOver = false;
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
  }

  // ----- dealing -----
  dealHand() {
    if (this.gameOver) {
      this.scoreNS = 0; this.scoreEW = 0; this.handNum = 1; this.gameOver = false;
      writeNum(`${this.prefix}.scoreNS`, 0);
      writeNum(`${this.prefix}.scoreEW`, 0);
      writeNum(`${this.prefix}.handNum`, 1);
    }
    this.deck.reset({ decks: 1, shuffle: true });
    SEATS.forEach(s => { this.hands[s] = Array.from({ length: 13 }, () => this.deck.draw()); });
    SEATS.forEach(s => this.sortHand(s));
    this.bids = { you: null, east: null, north: null, west: null };
    this.tricks = { you: 0, east: 0, north: 0, west: 0 };
    this.currentTrick = [];
    this.spadesBroken = false;
    this.trickNum = 0;
    this.dealer = nextSeat(this.dealer);
    this.activeSeat = nextSeat(this.dealer); // bid starts left of dealer
    this.phase = "bidding";
    this.turns.reset({ phase: "bidding" });
    this.setMessage(`New hand. Bidding starts with ${this.label(this.activeSeat)}.`);
    this.render();
    this.askBid();
  }

  sortHand(seat) {
    this.hands[seat].sort((a, b) => {
      const sa = SUITS.indexOf(a.suit), sb = SUITS.indexOf(b.suit);
      if (sa !== sb) return sa - sb;
      return RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
    });
  }

  // ----- bidding -----
  askBid() {
    if (this.phase !== "bidding") return;
    if (this.activeSeat === "you") {
      $(this.root, "#biddingControls").hidden = false;
      this.renderBidButtons();
      this.setMessage("Your bid. Click a number (0 = nil).");
      this.render();
    } else {
      setTimeout(() => this.cpuBid(this.activeSeat), 400);
    }
  }

  renderBidButtons() {
    const target = $(this.root, "#bidButtons");
    target.innerHTML = "";
    for (let n = 0; n <= 13; n += 1) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = n === 0 ? "Nil" : String(n);
      btn.addEventListener("click", () => this.placeBid("you", n));
      target.appendChild(btn);
    }
  }

  cpuBid(seat) {
    const hand = this.hands[seat];
    let expected = 0;
    for (const c of hand) {
      const ro = RANK_ORDER[c.rank];
      if (c.suit === "spades") {
        if (ro >= 12) expected += 1;       // Q, K, A spades = strong
        else if (ro >= 9) expected += 0.5; // 9-J spades = decent
      } else {
        if (ro === 14) expected += 1;      // A of off-suit
        else if (ro === 13) expected += 0.5;
      }
    }
    const bid = Math.max(1, Math.round(expected)); // CPUs avoid nil for simplicity
    this.placeBid(seat, bid);
  }

  placeBid(seat, n) {
    if (this.phase !== "bidding" || this.bids[seat] !== null || this.activeSeat !== seat) return;
    this.bids[seat] = n;
    $(this.root, "#biddingControls").hidden = true;
    this.setMessage(`${this.label(seat)} bids ${n === 0 ? "Nil" : n}.`);
    this.audio.beep({ freq: 480, duration: 0.04 });
    if (SEATS.every(s => this.bids[s] !== null)) {
      this.beginPlay();
      return;
    }
    this.activeSeat = nextSeat(this.activeSeat);
    this.render();
    this.askBid();
  }

  // ----- play -----
  beginPlay() {
    this.phase = "playing";
    this.activeSeat = nextSeat(this.dealer);
    this.leader = this.activeSeat;
    this.turns.setPhase("playing");
    this.trickNum = 1;
    this.setMessage(`${this.label(this.leader)} leads.`);
    this.render();
    if (this.activeSeat !== "you") setTimeout(() => this.cpuPlay(this.activeSeat), 500);
  }

  legalPlays(seat) {
    const hand = this.hands[seat];
    if (this.currentTrick.length === 0) {
      // Leading. Can't lead spades unless broken or hand is all spades.
      const allSpades = hand.every(c => c.suit === "spades");
      if (this.spadesBroken || allSpades) return hand;
      return hand.filter(c => c.suit !== "spades");
    }
    const ledSuit = this.currentTrick[0].card.suit;
    const sameSuit = hand.filter(c => c.suit === ledSuit);
    return sameSuit.length > 0 ? sameSuit : hand;
  }

  playCard(seat, index) {
    if (this.phase !== "playing" || this.activeSeat !== seat) return;
    const card = this.hands[seat][index];
    const legal = this.legalPlays(seat);
    if (!legal.includes(card)) {
      if (seat === "you") this.setMessage("That card is illegal - follow suit if you can.");
      return;
    }
    this.hands[seat].splice(index, 1);
    if (card.suit === "spades" && !this.spadesBroken) this.spadesBroken = true;
    this.currentTrick.push({ seat, card });
    this.audio.beep({ freq: 540, duration: 0.04 });
    if (this.currentTrick.length === 4) {
      const winner = this.resolveTrick();
      this.tricks[winner] += 1;
      this.setMessage(`${this.label(winner)} takes the trick.`);
      this.render();
      setTimeout(() => {
        this.currentTrick = [];
        this.trickNum += 1;
        if (this.trickNum > 13) { this.endHand(); return; }
        this.activeSeat = winner;
        this.leader = winner;
        this.render();
        if (this.activeSeat !== "you") setTimeout(() => this.cpuPlay(this.activeSeat), 500);
      }, 800);
      return;
    }
    this.activeSeat = nextSeat(this.activeSeat);
    this.render();
    if (this.activeSeat !== "you") setTimeout(() => this.cpuPlay(this.activeSeat), 500);
  }

  resolveTrick() {
    const ledSuit = this.currentTrick[0].card.suit;
    let winner = this.currentTrick[0];
    for (const play of this.currentTrick.slice(1)) {
      if (play.card.suit === "spades" && winner.card.suit !== "spades") winner = play;
      else if (play.card.suit === winner.card.suit && RANK_ORDER[play.card.rank] > RANK_ORDER[winner.card.rank]) winner = play;
    }
    return winner.seat;
  }

  cpuPlay(seat) {
    if (this.phase !== "playing" || this.activeSeat !== seat) return;
    const legal = this.legalPlays(seat);
    // Heuristic: if leading or partner is winning trick, play low; else win cheap if you can.
    let pick;
    if (this.currentTrick.length === 0) {
      // Lead lowest non-spade if possible.
      const nonSpades = legal.filter(c => c.suit !== "spades");
      pick = (nonSpades.length ? nonSpades : legal).sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank])[0];
    } else {
      const currentWinner = this.resolvePartialTrickWinner();
      const myCardWinsBeats = (c) => {
        const ledSuit = this.currentTrick[0].card.suit;
        if (c.suit === "spades" && currentWinner.card.suit !== "spades") return true;
        if (c.suit === currentWinner.card.suit && RANK_ORDER[c.rank] > RANK_ORDER[currentWinner.card.rank]) return true;
        return false;
      };
      const winning = legal.filter(myCardWinsBeats);
      if (currentWinner && TEAM[currentWinner.seat] === TEAM[seat] && this.currentTrick.length < 3) {
        // partner is winning; play lowest
        pick = legal.sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank])[0];
      } else if (winning.length > 0) {
        pick = winning.sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank])[0]; // cheapest winner
      } else {
        pick = legal.sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank])[0];
      }
    }
    const idx = this.hands[seat].indexOf(pick);
    this.playCard(seat, idx);
  }

  resolvePartialTrickWinner() {
    if (this.currentTrick.length === 0) return null;
    let winner = this.currentTrick[0];
    for (const p of this.currentTrick.slice(1)) {
      if (p.card.suit === "spades" && winner.card.suit !== "spades") winner = p;
      else if (p.card.suit === winner.card.suit && RANK_ORDER[p.card.rank] > RANK_ORDER[winner.card.rank]) winner = p;
    }
    return winner;
  }

  // ----- scoring + game state -----
  endHand() {
    this.phase = "handDone";
    const nsBid = this.bids.you + this.bids.north;
    const ewBid = this.bids.east + this.bids.west;
    const nsTricks = this.tricks.you + this.tricks.north;
    const ewTricks = this.tricks.east + this.tricks.west;

    const scoreTeam = (bid, taken, nilSeats) => {
      let s = 0;
      if (taken >= bid) s += bid * 10 + (taken - bid); // overtricks +1 each
      else s -= bid * 10;
      for (const seat of nilSeats) {
        if (this.bids[seat] === 0) s += (this.tricks[seat] === 0 ? 100 : -100);
      }
      return s;
    };

    const nsDelta = scoreTeam(nsBid, nsTricks, ["you", "north"]);
    const ewDelta = scoreTeam(ewBid, ewTricks, ["east", "west"]);
    this.scoreNS += nsDelta;
    this.scoreEW += ewDelta;
    writeNum(`${this.prefix}.scoreNS`, this.scoreNS);
    writeNum(`${this.prefix}.scoreEW`, this.scoreEW);
    this.scoreboard.setScore(this.scoreNS);
    this.handNum += 1;
    writeNum(`${this.prefix}.handNum`, this.handNum);

    this.setMessage(`Hand done. NS ${nsDelta >= 0 ? "+" : ""}${nsDelta} (took ${nsTricks}, bid ${nsBid}). EW ${ewDelta >= 0 ? "+" : ""}${ewDelta} (took ${ewTricks}, bid ${ewBid}). Score: NS ${this.scoreNS} - EW ${this.scoreEW}.`);
    if (this.scoreNS >= this.winningScore || this.scoreEW >= this.winningScore) {
      this.gameOver = true;
      const winner = this.scoreNS >= this.scoreEW ? "You + North" : "East + West";
      this.setMessage(`Game over - ${winner} wins! Final: NS ${this.scoreNS} - EW ${this.scoreEW}. Deal to start new game.`);
    }
    this.phase = "idle";
    this.render();
  }

  // ----- rendering -----
  render() {
    $(this.root, "#phase").textContent = this.phase[0].toUpperCase() + this.phase.slice(1);
    $(this.root, "#handNum").textContent = String(this.handNum);
    $(this.root, "#spadesBroken").textContent = this.spadesBroken ? "Yes" : "No";
    $(this.root, "#trickNum").textContent = String(this.trickNum);
    $(this.root, "#scoreNS").textContent = String(this.scoreNS);
    $(this.root, "#scoreEW").textContent = String(this.scoreEW);

    for (const seat of SEATS) {
      const bidEl = $(this.root, `#bid-${seat}`);
      const trickEl = $(this.root, `#tricks-${seat}`);
      if (bidEl) bidEl.textContent = this.bids[seat] === null ? "-" : (this.bids[seat] === 0 ? "Nil" : String(this.bids[seat]));
      if (trickEl) trickEl.textContent = `${this.tricks[seat]} taken`;
      const seatEl = this.root.querySelector(`.seat-${seat}`);
      if (seatEl) {
        seatEl.classList.toggle("active", this.activeSeat === seat);
        seatEl.classList.toggle("partner", seat === "north" && this.phase !== "idle");
      }
      // Render opponent fan as small face-down stacks (one per remaining card).
      // User's seat skips the fan — the bottom-of-screen .hand is their hand.
      if (seat !== "you") {
        const fan = $(this.root, `#fan-${seat}`);
        if (fan) {
          const remaining = this.hands[seat].length;
          fan.innerHTML = "";
          for (let i = 0; i < remaining; i += 1) {
            fan.appendChild(this.cardElement({ rank: "?", suit: "?" }, true));
          }
        }
      }
    }

    // Trick center
    const tc = $(this.root, "#trickCenter");
    tc.innerHTML = "";
    for (const play of this.currentTrick) {
      const wrap = document.createElement("div");
      wrap.className = "played-card";
      const label = document.createElement("div");
      label.className = "played-seat";
      label.textContent = this.label(play.seat);
      wrap.appendChild(label);
      wrap.appendChild(this.cardElement(play.card, false));
      tc.appendChild(wrap);
    }
    if (this.currentTrick.length === 0 && this.phase === "playing") {
      tc.textContent = "Waiting on lead...";
    }

    // Player hand
    const playerHand = $(this.root, "#playerHand");
    playerHand.innerHTML = "";
    const legal = (this.phase === "playing" && this.activeSeat === "you") ? new Set(this.legalPlays("you")) : new Set();
    this.hands.you.forEach((c, i) => {
      const el = this.cardElement(c, false);
      if (this.phase === "playing" && this.activeSeat === "you") {
        if (legal.has(c)) {
          el.addEventListener("click", () => this.playCard("you", i));
        } else {
          el.classList.add("disabled");
        }
      } else {
        el.classList.add("disabled");
      }
      playerHand.appendChild(el);
    });

    $(this.root, "#dealButton").disabled = (this.phase !== "idle");
  }

  cardElement(card, faceDown) {
    const el = document.createElement("div");
    el.className = "card";
    el.dataset.faceDown = String(faceDown);
    if (faceDown) { el.textContent = "mAI"; return el; }
    el.dataset.color = card.color || ((card.suit === "hearts" || card.suit === "diamonds") ? "red" : "black");
    const suit = SUIT_LABELS[card.suit] || card.suit[0].toUpperCase();
    el.innerHTML = `
      <div class="card-corner card-corner-tl"><div class="rank">${card.rank}</div><div class="suit">${suit}</div></div>
      <div class="card-center">${suit}</div>
      <div class="card-corner card-corner-br"><div class="rank">${card.rank}</div><div class="suit">${suit}</div></div>
    `;
    return el;
  }

  label(seat) { return seat === "you" ? "You" : seat[0].toUpperCase() + seat.slice(1); }
  setMessage(text) { $(this.root, "#message").textContent = text; }
}
