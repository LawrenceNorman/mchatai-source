// VERBATIM (Hearts rules): copy this block into the generated mini-app's
// <script>. Adapt:
//   - For Spades: replace point logic in resolveTrick() with bid-vs-tricks scoring.
//   - For Bridge: prepend a bidding phase before the play loop.
//   - For Euchre: add trump suit selection + jacks-as-bowers ranking override.
// Do NOT remove: isLegalPlay, playCard, resolveTrick — every trick-taking game
// needs all three. Do NOT skip the "must follow suit" gate.

const SUITS = ['♣','♦','♠','♥'];                               // black, red, black, red
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const SUIT_ORDER = {'♣':0,'♦':1,'♠':2,'♥':3};
const RANK_ORDER = Object.fromEntries(RANKS.map((r,i)=>[r,i]));
const SEATS = ['S','W','N','E'];                                // human + 3 AI, clockwise
const SEAT_NAMES = {S:'You', W:'West', N:'North', E:'East'};

const state = {
  hands: {S:[], W:[], N:[], E:[]},
  scores: {S:0, W:0, N:0, E:0},
  trick: [],                                                    // [{seat, card}]
  leader: 'S',
  turn: 'S',
  heartsBroken: false
};

function makeDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({s, r});
  return d;
}
function shuffle(arr) {                                         // Fisher-Yates
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function sortHand(h) {
  h.sort((a,b) =>
    SUIT_ORDER[a.s] - SUIT_ORDER[b.s] ||
    RANK_ORDER[a.r] - RANK_ORDER[b.r]);
}
function deal() {
  const deck = shuffle(makeDeck());
  for (const seat of SEATS) state.hands[seat] = [];
  for (let i = 0; i < deck.length; i++) state.hands[SEATS[i % 4]].push(deck[i]);
  for (const seat of SEATS) sortHand(state.hands[seat]);
}

// LEGAL-PLAY GATE — required by every trick-taking game.
// Hearts variant: must follow lead suit; can't lead hearts until broken.
// IMPORTANT: compare against state.trick[0].card.s (the LEADING card of the
// trick), NOT against the player's own first card. The earlier Hearts
// generation got this wrong.
function isLegalPlay(seat, card) {
  const hand = state.hands[seat];
  if (state.trick.length === 0) {
    // Leading the trick.
    if (card.s === '♥' && !state.heartsBroken) {
      const hasNonHearts = hand.some(c => c.s !== '♥');
      if (hasNonHearts) return false;          // can't lead hearts until broken
    }
    return true;
  }
  const leadSuit = state.trick[0].card.s;      // ← LEAD CARD's suit, not the hand
  const hasLead = hand.some(c => c.s === leadSuit);
  if (hasLead && card.s !== leadSuit) return false;  // must follow suit if you have it
  return true;
}

function playCard(seat, card) {
  state.hands[seat] = state.hands[seat].filter(c => !(c.s === card.s && c.r === card.r));
  state.trick.push({seat, card});
  if (card.s === '♥') state.heartsBroken = true;
  render();
  if (state.trick.length === 4) {
    setTimeout(resolveTrick, 800);
    return;
  }
  state.turn = nextSeat(state.turn);
  render();
  if (state.turn !== 'S') setTimeout(() => cpuPlayTurn(state.turn), 500);
}

// TRICK RESOLUTION + SCORING — Hearts: ♥=1 each, Q♠=13.
// For Spades: replace with `+= tricks_won` and bid-vs-actual settlement.
function resolveTrick() {
  const leadSuit = state.trick[0].card.s;
  let winner = state.trick[0];
  for (const play of state.trick) {
    if (play.card.s === leadSuit &&
        RANK_ORDER[play.card.r] > RANK_ORDER[winner.card.r]) {
      winner = play;
    }
  }
  const points = state.trick.reduce((acc, p) => {
    if (p.card.s === '♥') return acc + 1;
    if (p.card.s === '♠' && p.card.r === 'Q') return acc + 13;
    return acc;
  }, 0);
  state.scores[winner.seat] += points;
  toast(`${SEAT_NAMES[winner.seat]} takes the trick${points ? ` (+${points})` : ''}`);
  state.trick = [];
  state.leader = winner.seat;
  state.turn = winner.seat;
  render();
  const handsEmpty = SEATS.every(s => state.hands[s].length === 0);
  if (handsEmpty) {
    setTimeout(() => toast('Hand complete — click New Game to deal again.', 3000), 600);
    return;
  }
  if (state.turn !== 'S') setTimeout(() => cpuPlayTurn(state.turn), 600);
}

function nextSeat(seat) {
  const order = ['S','W','N','E'];           // clockwise
  return order[(order.indexOf(seat) + 1) % 4];
}

function newGame() {
  state.scores = {S:0, W:0, N:0, E:0};
  state.trick = [];
  state.heartsBroken = false;
  deal();
  state.leader = 'S';                        // simplified: human leads (real Hearts: 2♣)
  state.turn = 'S';
  render();
  toast('New game dealt — your turn', 1400);
}
