// Spanish phrase memory match - assembled from Lego: a 400+ phrase bank + the
// MemoryMatchBoard state machine. Match each Spanish phrase to its English
// translation. This file is just glue; the deck-building (non-identical pairs)
// and match logic live in entities/MemoryMatchBoard.js.
import { MemoryMatchBoard } from "../../entities/MemoryMatchBoard.js";
import { SPANISH_PHRASES } from "../../resources/SpanishPhrasebook.js";

const SIZES = { Easy: [4, 4], Medium: [4, 6], Hard: [6, 6] };
let level = "Easy";
let board = null;
let locked = false;

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function newGame() {
  const [rows, cols] = SIZES[level];
  const pairs = shuffle(SPANISH_PHRASES).slice(0, (rows * cols) / 2).map((p) => ({ a: p.es, b: p.en }));
  board = new MemoryMatchBoard({ rows, cols });
  board.setCards(MemoryMatchBoard.buildPairDeck(pairs, rows * cols));
  locked = false;
  render();
  setMessage("Match each Spanish phrase to its English meaning.");
}

function render() {
  const grid = document.getElementById("grid");
  grid.style.gridTemplateColumns = `repeat(${board.cols}, 1fr)`;
  grid.innerHTML = "";
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const cell = board.get(r, c);
      const btn = document.createElement("button");
      const face = cell.state === "down" ? "down" : cell.state === "matched" ? "matched" : "up";
      btn.className = `card face-${face}`;
      btn.textContent = cell.state === "down" ? "" : cell.face;
      btn.setAttribute("aria-label", cell.state === "down" ? "Hidden card" : cell.face);
      btn.addEventListener("pointerup", () => flip(r, c));
      grid.appendChild(btn);
    }
  }
  const pairsTotal = (board.rows * board.cols) / 2;
  document.getElementById("meta").textContent =
    `Pairs ${board.matchedCount / 2}/${pairsTotal}  -  Moves ${board.moves}  -  Misses ${board.misses}`;
}

function flip(r, c) {
  if (locked || !board) return;
  const res = board.flipCard(r, c);
  if (res.state === "ignored") return;
  render();
  if (res.state === "mismatch") {
    locked = true;
    setTimeout(() => { board.resolveMismatch(); locked = false; render(); }, 950);
  }
  if (board.isComplete()) {
    setMessage(`Solved in ${board.moves} moves, ${board.misses} misses!`, true);
    const key = `spanish-memory.best.${level}`;
    const best = Number(localStorage.getItem(key) || 0);
    if (!best || board.moves < best) localStorage.setItem(key, String(board.moves));
  }
}

function setMessage(text, solved) {
  const m = document.getElementById("message");
  m.textContent = text;
  m.dataset.solved = String(!!solved);
}

function buildControls() {
  const bar = document.getElementById("controls");
  bar.innerHTML = "";
  Object.keys(SIZES).forEach((name) => {
    const b = document.createElement("button");
    b.className = "pill" + (name === level ? " active" : "");
    b.textContent = name;
    b.addEventListener("pointerup", () => { level = name; buildControls(); newGame(); });
    bar.appendChild(b);
  });
  const again = document.createElement("button");
  again.className = "pill primary";
  again.textContent = "New game";
  again.addEventListener("pointerup", () => newGame());
  bar.appendChild(again);
}

buildControls();
newGame();
