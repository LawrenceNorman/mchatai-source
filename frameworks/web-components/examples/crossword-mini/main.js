// Mini Crossword — assembled entirely from Lego: a 425-word dictionary, a
// deterministic generator, and a self-contained board. This whole file is the
// "glue" a generated app needs; the hard parts live in the components.
import { CROSSWORD_BANK } from "../../resources/CrosswordDictionary.js";
import { CrosswordGenerator } from "../../entities/CrosswordGenerator.js";
import { CrosswordBoard } from "../../ui/CrosswordBoard.js";

// Daily puzzle: a stable seed per calendar day (same puzzle for everyone that
// day). Each "New puzzle" reload bumps an offset so you can keep playing fresh,
// still-deterministic puzzles. Date.now() is browser-runtime, not workflow code.
const daySeed = Math.floor(Date.now() / 86400000);
let offset = Number(sessionStorage.getItem("cw.offset") || 0);
sessionStorage.setItem("cw.offset", String(offset + 1));

function bestLabel() {
  const b = Number(localStorage.getItem("cw.best") || 0);
  if (!b) return "";
  return `Best ${Math.floor(b / 60)}:${String(b % 60).padStart(2, "0")}`;
}

const puzzle = new CrosswordGenerator({ size: 9, maxWords: 14, seed: daySeed + offset })
  .generate(CROSSWORD_BANK);

new CrosswordBoard({
  root: document.getElementById("app"),
  puzzle,
  title: "Mini Crossword",
  onSolved: ({ seconds }) => {
    const best = Number(localStorage.getItem("cw.best") || 0);
    if (!best || seconds < best) localStorage.setItem("cw.best", String(seconds));
    const tag = document.getElementById("best");
    if (tag) tag.textContent = bestLabel();
  },
}).start();

const tag = document.getElementById("best");
if (tag) tag.textContent = bestLabel();
