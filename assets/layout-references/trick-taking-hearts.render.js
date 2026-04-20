// VERBATIM (rendering + click handlers): copy this block into the generated
// mini-app's <script>, AFTER the rules block. Wires the human's click → playCard,
// re-renders all four zones + trick + scores after every state change, and
// shows toasts. Without this block the cards exist in `state` but nothing reaches
// the DOM and the game is unplayable (this was the round-4 failure mode).

function renderHand() {
  const zone = document.getElementById('zoneS');
  zone.innerHTML = '';
  for (const card of state.hands.S) {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.suit = card.s;
    el.dataset.rank = card.r;
    el.innerHTML = `
      <span class="rank">${card.r}</span>
      <span class="suit-tl">${card.s}</span>
      <span class="suit-center">${card.s}</span>
      <span class="rank-br">${card.r}</span>`;
    const legal = isLegalPlay('S', card);
    if (!legal) el.classList.add('disabled');
    else if (state.turn === 'S') el.classList.add('playable');
    el.addEventListener('click', () => {
      if (state.turn !== 'S' || !legal) return;
      playCard('S', card);
    });
    zone.appendChild(el);
  }
}

function renderAIZones() {
  for (const seat of ['N','W','E']) {
    const zone = document.getElementById('zone' + seat);
    if (!zone) continue;
    const count = state.hands[seat].length;
    const current = zone.querySelectorAll('.card-back').length;
    if (current !== count) {
      zone.querySelectorAll('.card-back').forEach(el => el.remove());
      for (let i = 0; i < count; i++) {
        const cb = document.createElement('div');
        cb.className = 'card-back';
        zone.appendChild(cb);
      }
    }
    const badge = zone.querySelector('.count-badge');
    if (badge) badge.textContent = count;
  }
}

function renderTrick() {
  const tr = document.getElementById('trick');
  tr.innerHTML = '';
  for (const play of state.trick) {
    const el = document.createElement('div');
    el.className = 'card trick-card';
    el.dataset.suit = play.card.s;
    el.dataset.rank = play.card.r;
    el.dataset.seat = play.seat;
    el.innerHTML = `
      <span class="rank">${play.card.r}</span>
      <span class="suit-tl">${play.card.s}</span>
      <span class="suit-center">${play.card.s}</span>
      <span class="rank-br">${play.card.r}</span>`;
    tr.appendChild(el);
  }
}

function renderScores() {
  for (const seat of SEATS) {
    const el = document.querySelector(`#hud .score[data-seat="${seat}"]`);
    if (el) {
      el.querySelector('b').textContent = state.scores[seat];
      el.classList.toggle('active', state.turn === seat);
    }
  }
  const turnEl = document.querySelector('#hud .turn');
  if (turnEl) turnEl.textContent = state.turn === 'S' ? 'Your turn' : SEAT_NAMES[state.turn] + "'s turn";
}

function render() {
  renderHand();
  renderAIZones();
  renderTrick();
  renderScores();
}

function toast(msg, dur = 1600) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove('show'), dur);
}

document.getElementById('new-game').addEventListener('click', newGame);
newGame();
