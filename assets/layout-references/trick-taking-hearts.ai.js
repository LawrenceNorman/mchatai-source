// VERBATIM (CPU turn): copy this into the generated mini-app's <script>.
// MUST exist — sessions where AI seats never play freeze the game forever
// (vq-007 violation). The 300-800ms setTimeout is a UX requirement; instant
// AI plays look broken. Random-legal is the floor; replace with heuristic AI
// (avoid hearts when leading low, dump Q♠ on a heavy trick, etc.) for higher
// quality.

function cpuPlayTurn(seat) {
  if (state.turn !== seat) return;             // race-guard: turn might have advanced
  const hand = state.hands[seat];
  if (!hand || hand.length === 0) return;

  // Build the legal subset by re-asking the rule gate for each card.
  // Required because legality depends on whether you can follow lead suit;
  // a hand-only filter would let illegal plays through.
  const legal = hand.filter(c => isLegalPlay(seat, c));
  const pool = legal.length ? legal : hand;    // fallback when caller bug means no legal — never fatal

  // Random legal pick. UPGRADE PATH: heuristic — avoid taking the trick when
  // you'd accumulate hearts; dump high penalty cards (Q♠) when a non-hearts
  // suit is lead; lead low-rank in a non-heart suit when on lead.
  const pick = pool[Math.floor(Math.random() * pool.length)];
  playCard(seat, pick);
}
