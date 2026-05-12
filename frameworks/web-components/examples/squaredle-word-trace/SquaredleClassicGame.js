import { WordTraceGrid } from "../../entities/WordTraceGrid.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";

// Tiny built-in dictionary so the example is fully runnable offline.
// In a published mini-app the host page wires window.mchatai.dictionary().
const DEMO_DICT = new Set([
  "ARE", "ARC", "ARM", "ART", "EAR", "ERA", "ETA",
  "RAM", "RAT", "REM", "TAR", "TEA", "TEAR", "TARE",
  "MART", "MARS", "MATE", "MATS", "MATH", "MATER",
  "RATE", "RATED", "RATES", "RATIO", "RATIONS",
  "TRAM", "TRAMS", "TEAM", "TEAMS", "TREAT", "TREATS",
  "ART", "ARTS", "ARTIST", "EARN", "EARS", "EAST", "EAT",
  "STEAM", "STREAM", "MASTER", "MATTERS", "ROAM", "TAR"
]);

const PUZZLES = [
  "TIRESMARETAERSAB",
  "PLAYWORDGRIDFINE",
  "STARWINEMAPLOATS",
  "FLOWERSTEAMRATES"
];

/**
 * SquaredleClassicGame — Lego golden-assembly composition.
 *
 * Wires:
 *   - entities.word-trace-grid (WordTraceGrid) — 4x4 path tracing + word validation
 *   - ui.scoreboard (ScoreBoard) — score + best
 *   - resources.swatches — palette tokens
 *
 * Pointer drag traces a path through adjacent letters (8-direction by default,
 * configured via the entity). Release commits the word against the dictionary.
 * Backtracking supported (drag back over previous cell). Found-words tray
 * shows committed words; score uses the entity's defaultScore (length²-ish).
 */
export class SquaredleClassicGame {
  constructor(options = {}) {
    this.rootSelector = options.root || "[data-web-component-example='squaredle-word-trace']";
    this.root = document.querySelector(this.rootSelector);

    const swatch = options.swatch || getSwatchByID("retro-neon");
    if (this.root && swatch) {
      applySwatchVariables(this.root, swatch);
    }

    this.grid = new WordTraceGrid({ rows: 4, cols: 4, adjacency: 8, minLength: 3 });
    this.scoreBoard = new ScoreBoard({
      target: options.hudTarget || "#hudMount",
      scoreLabel: "Score",
      highScoreLabel: "Best",
      storageKey: "squaredle-word-trace.bestScore",
      persistHighScore: true
    });

    this.boardMount = document.querySelector(options.boardTarget || "#boardMount");
    this.meta = document.querySelector(options.metaTarget || "#metaMount");
    this.currentWordMount = document.querySelector(options.currentWordTarget || "#currentWordMount");
    this.foundMount = document.querySelector(options.foundTarget || "#foundMount");
    this.message = document.querySelector(options.messageTarget || "#messageMount");
    this.restartBtn = document.getElementById(options.restartBtnId || "restartBtn");

    this.isTracing = false;
  }

  start() {
    this._loadPuzzle();
    this._bindInputs();
  }

  _loadPuzzle() {
    const letters = PUZZLES[Math.floor(Math.random() * PUZZLES.length)];
    this.grid.resetPuzzle();
    this.grid.setLetters(letters);
    this.scoreBoard.setScore(0);
    this._renderBoard();
    this._renderFound();
    this._renderCurrent();
    this._updateMeta();
    this._hideMessage();
  }

  _bindInputs() {
    if (this._inputsBound) return;
    this._inputsBound = true;

    if (this.boardMount) {
      this.boardMount.addEventListener("pointerdown", (e) => {
        const btn = e.target.closest("[data-row]");
        if (!btn) return;
        this.isTracing = true;
        this.grid.startTrace(+btn.dataset.row, +btn.dataset.col);
        this._renderBoard();
        this._renderCurrent();
        e.preventDefault();
      }, { passive: false });

      this.boardMount.addEventListener("pointermove", (e) => {
        if (!this.isTracing) return;
        // Find which cell the pointer is over
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-row]");
        if (!el) return;
        const r = +el.dataset.row;
        const c = +el.dataset.col;
        if (this.grid.extendTrace(r, c)) {
          this._renderBoard();
          this._renderCurrent();
        }
      }, { passive: true });

      const endTrace = () => {
        if (!this.isTracing) return;
        this.isTracing = false;
        const result = this.grid.commitWord(DEMO_DICT);
        this._renderBoard();
        this._renderCurrent();
        if (result.valid) {
          this.scoreBoard.setScore(this.grid.totalScore());
          this._showMessage(`+${result.score} for ${result.word}!`, 1200);
          this._renderFound();
        } else {
          if (result.word && result.word.length >= 3) {
            this._showMessage(`${result.word}: ${result.reason}`, 900);
          }
        }
        this._updateMeta();
      };
      this.boardMount.addEventListener("pointerup", endTrace, { passive: true });
      this.boardMount.addEventListener("pointercancel", endTrace, { passive: true });
    }

    if (this.restartBtn) {
      this.restartBtn.addEventListener("click", () => this._loadPuzzle());
    }
  }

  _renderBoard() {
    if (!this.boardMount) return;
    this.boardMount.innerHTML = "";
    for (let r = 0; r < this.grid.rows; r += 1) {
      for (let c = 0; c < this.grid.cols; c += 1) {
        const letter = this.grid.get(r, c) || "";
        const el = document.createElement("button");
        el.type = "button";
        el.className = "letter-cell";
        el.dataset.row = String(r);
        el.dataset.col = String(c);
        el.textContent = letter;
        if (this.grid.containsCell(r, c)) {
          el.classList.add("in-path");
          const idx = this.grid.pathIndexOf(r, c);
          if (idx === this.grid.path.length - 1) el.classList.add("path-head");
        }
        this.boardMount.appendChild(el);
      }
    }
  }

  _renderCurrent() {
    if (!this.currentWordMount) return;
    const w = this.grid.currentWord();
    this.currentWordMount.textContent = w || "(drag to trace)";
    this.currentWordMount.classList.toggle("empty", !w);
  }

  _renderFound() {
    if (!this.foundMount) return;
    this.foundMount.innerHTML = "";
    const words = Array.from(this.grid.foundWords).sort();
    for (const w of words) {
      const chip = document.createElement("span");
      chip.className = "found-chip";
      chip.textContent = w;
      this.foundMount.appendChild(chip);
    }
  }

  _updateMeta() {
    if (!this.meta) return;
    this.meta.textContent = `Found ${this.grid.foundWords.size}`;
  }

  _showMessage(text, durationMs = 1200) {
    if (!this.message) return;
    this.message.textContent = text;
    this.message.classList.remove("is-hidden");
    clearTimeout(this._msgTimer);
    this._msgTimer = setTimeout(() => this._hideMessage(), durationMs);
  }

  _hideMessage() {
    if (!this.message) return;
    this.message.classList.add("is-hidden");
  }
}
