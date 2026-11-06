// HeartsAI — card play and passing for computer seats in Hearts.
//
// The rules engine stays the caller's: pass the cards the rules allow now
// (`legal`) and this picks one. What it adds is the strategy a weak Hearts
// opponent lacks. The usual weak bot leads low, follows low and discards low,
// so it saves every high card for the middle of the hand, where it has to win
// tricks and collects the Queen of Spades. This one:
//   - sheds high cards while that is safe: on the first trick, when it is last
//     to play and the trick has no points, and when it has to win a trick anyway;
//   - ducks under the current winner with its highest card that still loses;
//   - drops the Q♠ on whoever plays the K♠ or A♠, and never wins a trick with it;
//   - keeps the K♠/A♠ out of spade tricks while the Q♠ is unseen, and leads low
//     spades to force the Q♠ out when it holds none of Q/K/A;
//   - when it can't follow suit, discards the Q♠, then the K♠/A♠, then its most
//     dangerous high card;
//   - passes the Q♠/K♠/A♠ when its spades are short, high hearts, and short suits;
//   - guards against a moon shot: while another seat could still take all 26, it keeps
//     one high heart (and won't pass it), never throws that heart away, takes a point
//     trick from a seat that has every point so far, and gives that seat no points.
//
// Cards are { rank, suit }. Ranks "2".."10","J","Q","K","A" (or numbers, ace 1
// or 14); suits as words ("hearts"), letters ("H") or glyphs ("♥").
//
// Usage:
//   import { HeartsAI } from "./HeartsAI.js";
//   const ai = new HeartsAI();
//   const card = ai.chooseCard({
//     hand, legal,            // this seat's cards, and the ones the rules allow now
//     trick,                  // this trick so far, in play order: [{ player, card }]
//     played,                 // cards from earlier tricks this hand
//     me: "west",             // optional: this seat's id
//     pointsTaken             // { seatId: points taken this hand }, keyed like `me` (moon defense)
//   });
//   const three = ai.choosePass(hand);

const RANK_INDEX = {
  "2": 0, "3": 1, "4": 2, "5": 3, "6": 4, "7": 5, "8": 6, "9": 7,
  "10": 8, "J": 9, "Q": 10, "K": 11, "A": 12
};
const SUIT_KEY = {
  "c": "c", "♣": "c", "♧": "c",
  "d": "d", "♦": "d", "♢": "d",
  "h": "h", "♥": "h", "♡": "h",
  "s": "s", "♠": "s", "♤": "s"
};
const Q = RANK_INDEX.Q;
const K = RANK_INDEX.K;

export function rankOf(card) {
  const r = card.rank;
  if (typeof r === "number") {
    if (r === 1 || r === 14) return RANK_INDEX.A;
    if (r === 11) return RANK_INDEX.J;
    if (r === 12) return Q;
    if (r === 13) return K;
    return r - 2;
  }
  const key = String(r).toUpperCase();
  return key in RANK_INDEX ? RANK_INDEX[key] : RANK_INDEX[key[0]];
}

export function suitOf(card) {
  return SUIT_KEY[String(card.suit).trim().toLowerCase()[0]];
}

const keyOf = (c) => suitOf(c) + rankOf(c);
const isQS = (c) => suitOf(c) === "s" && rankOf(c) === Q;
const isHighSpade = (c) => suitOf(c) === "s" && rankOf(c) > Q;
const pointsOf = (c) => (suitOf(c) === "h" ? 1 : isQS(c) ? 13 : 0);
const lowest = (cards) => cards.reduce((lo, c) => (rankOf(c) < rankOf(lo) ? c : lo), cards[0]);
const highest = (cards) => cards.reduce((hi, c) => (rankOf(c) > rankOf(hi) ? c : hi), cards[0]);
const cardOf = (entry) => (entry && entry.card ? entry.card : entry);

export class HeartsAI {
  constructor(options = {}) {
    // A trick won with no points is free when the seat plays last. Shed the
    // winner only if it is at least this high (index: 8 = "10").
    this.shedFrom = options.shedFrom ?? RANK_INDEX["10"];
    // Moon defense starts once one other seat has taken every point so far, at least this many.
    this.moonAlert = options.moonAlert ?? 3;
  }

  chooseCard(state) {
    const legal = state.legal && state.legal.length ? state.legal : state.hand;
    if (legal.length === 1) return legal[0];
    const s = this.read(state);
    if (s.trick.length === 0) return this.lead(s, legal);
    const follow = legal.filter((c) => suitOf(c) === s.ledSuit);
    if (follow.length) return this.follow(s, follow);
    return this.discard(s, legal);
  }

  // Everything the choice depends on, from public information plus this hand.
  read(state) {
    const hand = state.hand || [];
    const trick = (state.trick || []).map((e) => ({ player: e && e.card ? e.player : undefined, card: cardOf(e) }));
    const played = (state.played || []).map(cardOf);
    const gone = new Set([...played, ...trick.map((t) => t.card)].map(keyOf));
    const mine = new Set(hand.map(keyOf));
    // Cards other seats may still hold.
    const unseen = [];
    for (const suit of ["c", "d", "h", "s"]) {
      for (let r = 0; r < 13; r++) {
        const k = suit + r;
        if (!gone.has(k) && !mine.has(k)) unseen.push({ suit, r });
      }
    }
    const ledSuit = trick.length ? suitOf(trick[0].card) : null;
    let win = null;
    for (const t of trick) {
      if (suitOf(t.card) === ledSuit && (!win || rankOf(t.card) > rankOf(win.card))) win = t;
    }
    const points = state.pointsTaken || {};
    const scorers = Object.keys(points).filter((p) => points[p] > 0);
    // Another seat can take all 26 only while this seat has none and no third seat has any.
    const moonOpen = !scorers.includes(state.me) && scorers.length <= 1;
    const suspect = moonOpen && scorers.length === 1 ? scorers[0] : null;
    const moonRisk = suspect && points[suspect] >= this.moonAlert ? suspect : null;
    return {
      hand, trick, played, ledSuit, win, moonRisk, moonOpen,
      riskToPlay: moonRisk && !trick.some((t) => t.player === moonRisk),
      firstTrick: played.length === 0,
      last: trick.length === 3,
      trickPoints: trick.reduce((n, t) => n + pointsOf(t.card), 0),
      qsUnseen: unseen.some((u) => u.suit === "s" && u.r === Q),
      holdQS: hand.some(isQS),
      unseen,
      unseenIn: (suit) => unseen.filter((u) => u.suit === suit),
      countIn: (suit) => hand.filter((c) => suitOf(c) === suit).length,
      playedIn: (suit) => played.filter((c) => suitOf(c) === suit).length
    };
  }

  lead(s, legal) {
    // Moon defense: lead the top heart left to take one heart away from the shooter.
    if (s.moonRisk) {
      const topHeart = legal.filter((c) => suitOf(c) === "h" && !s.unseenIn("h").some((u) => u.r > rankOf(c)));
      if (topHeart.length) return highest(topHeart);
    }
    let pool = legal.filter((c) => !isQS(c));
    if (!pool.length) pool = legal;
    if (s.qsUnseen) {
      const safe = pool.filter((c) => !isHighSpade(c));
      if (safe.length) pool = safe;
    }
    // Force the Q♠ out: lead spades below the queen when holding none of Q/K/A.
    if (s.qsUnseen && !s.hand.some((c) => suitOf(c) === "s" && rankOf(c) >= Q)) {
      const spades = pool.filter((c) => suitOf(c) === "s");
      if (spades.length) return highest(spades);
    }
    // Otherwise lead the card least likely to win the trick. A lead wins unless
    // someone plays higher, so the safest lead is low against many higher
    // cards still out; a suit the others may be out of invites a dump.
    let best = null;
    let bestCost = Infinity;
    for (const c of pool) {
      const out = s.unseenIn(suitOf(c));
      const higher = out.filter((u) => u.r > rankOf(c)).length;
      const lower = out.length - higher;
      let cost;
      if (!out.length) cost = 50;
      else if (!higher) cost = 30;
      else cost = (lower + 1) / higher;
      if (out.length && out.length <= 3) cost += 2;
      // Between similar leads, empty the shorter suit first.
      cost += s.countIn(suitOf(c)) * 0.05;
      if (cost < bestCost) { best = c; bestCost = cost; }
    }
    return best;
  }

  follow(s, cards) {
    const winRank = rankOf(s.win.card);
    const under = cards.filter((c) => rankOf(c) < winRank);
    const over = cards.filter((c) => rankOf(c) > winRank);
    const spades = s.ledSuit === "s";

    // Moon defense: the shooter is winning a trick with points; take it as cheaply as possible.
    if (s.moonRisk && s.win.player === s.moonRisk && s.trickPoints > 0) {
      const takers = over.filter((c) => !isQS(c));
      if (takers.length) return lowest(takers);
    }

    // A K♠ or A♠ is winning: give it the queen.
    if (spades && winRank > Q) {
      const qs = under.find(isQS);
      if (qs) return qs;
    }

    // No one can add points to this trick: winning it is free, so spend a high card.
    const freeWin = (s.last && s.trickPoints === 0) || s.firstTrick;
    if (freeWin) {
      const shed = cards.filter((c) => !isQS(c));
      const top = shed.length ? highest(shed) : null;
      if (top && rankOf(top) > winRank && rankOf(top) >= this.shedFrom) return top;
    }

    if (under.length) {
      // Duck with the highest card that still loses. Never volunteer the Q♠ under a lower spade.
      const keep = this.stopper(s);
      const safe = under.filter((c) => !isQS(c) && c !== keep);
      return highest(safe.length ? safe : under);
    }

    // Every card wins (unless someone after us goes higher).
    const noQueen = over.filter((c) => !isQS(c));
    const pool = noQueen.length ? noQueen : over;
    if (s.last) return highest(pool);
    if (spades && s.qsUnseen) {
      // The Q♠ can still land on this trick: stay below K♠ if possible.
      const belowKing = pool.filter((c) => !isHighSpade(c));
      return lowest(belowKing.length ? belowKing : pool);
    }
    // First round of a suit: everyone can still follow, so few points land.
    // Win with the highest and keep the low cards for later.
    if (s.playedIn(s.ledSuit) === 0 && s.trickPoints === 0) return highest(pool);
    return lowest(pool);
  }

  discard(s, cards) {
    const nonPoint = cards.filter((c) => pointsOf(c) === 0);
    if (s.moonRisk) {
      if (s.win.player === s.moonRisk || s.riskToPlay) {
        // The shooter is winning this trick or still to play: give them nothing, or the
        // smallest heart, and keep the one that can stop them later.
        if (nonPoint.length) return this.mostDangerous(s, nonPoint);
        const keep = this.stopper(s);
        const give = cards.filter((c) => c !== keep);
        const small = give.filter((c) => !isQS(c));
        return lowest(small.length ? small : give.length ? give : cards);
      }
      // The shooter has played and lost this trick: any point card on it ends the moon.
      const pts = cards.filter((c) => pointsOf(c) > 0);
      if (pts.length) return pts.find(isQS) || highest(pts);
    }
    const qs = cards.find(isQS);
    if (qs) return qs;
    if (s.qsUnseen) {
      const high = cards.filter(isHighSpade);
      if (high.length) return highest(high);
    }
    return this.mostDangerous(s, cards);
  }

  // While another seat could still take all 26, keep one heart that can win a heart trick:
  // taking a single heart is what stops a moon.
  stopper(s) {
    if (!s.moonOpen) return null;
    const hearts = s.hand.filter((c) => suitOf(c) === "h");
    if (!hearts.length) return null;
    const top = highest(hearts);
    return s.unseenIn("h").filter((u) => u.r > rankOf(top)).length <= 2 ? top : null;
  }

  // The card most likely to win a trick later.
  mostDangerous(s, cards) {
    const keep = this.stopper(s);
    if (keep && cards.length > 1) cards = cards.filter((c) => c !== keep);
    let best = cards[0];
    let bestScore = -Infinity;
    for (const c of cards) {
      const suit = suitOf(c);
      const r = rankOf(c);
      const out = s.unseenIn(suit);
      const lower = out.filter((u) => u.r < r).length;
      let score = r;
      if (suit === "h") score += 2;
      if (out.length && !out.some((u) => u.r > r)) score += 3;  // a sure winner if that suit comes back
      if (s.countIn(suit) <= 2) score += 1.5;                   // one step from a void
      if (!lower && out.length) score -= 3;                     // nothing lower out: it can never win
      if (score > bestScore) { best = c; bestScore = score; }
    }
    return best;
  }

  choosePass(hand) {
    const spades = hand.filter((c) => suitOf(c) === "s");
    const lowSpades = spades.filter((c) => rankOf(c) < Q).length;
    const counts = {};
    for (const c of hand) counts[suitOf(c)] = (counts[suitOf(c)] || 0) + 1;
    const myHearts = hand.filter((c) => suitOf(c) === "h");
    const topHeart = myHearts.length ? highest(myHearts) : null;
    const danger = (c) => {
      const suit = suitOf(c);
      const r = rankOf(c);
      if (isQS(c)) return lowSpades >= 4 ? 10 : 100;     // four low spades guard the queen
      if (isHighSpade(c)) return lowSpades >= 4 ? 15 + r : 90 + r;
      if (suit === "s") return r;                           // low spades guard against the Q♠
      let d = r >= RANK_INDEX["10"] ? 30 + r : r;
      if (suit === "h") d += r >= RANK_INDEX.J ? 5 : -5;    // keep low hearts: they lose tricks
      if (c === topHeart && r >= Q) d = -100;               // keep one high heart to stop a moon
      if (counts[suit] <= 2 && suit !== "h") d += 12;       // emptying a suit lets us discard later
      return d;
    };
    return [...hand].sort((a, b) => danger(b) - danger(a)).slice(0, 3);
  }
}
