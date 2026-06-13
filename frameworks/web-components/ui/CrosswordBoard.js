// BEGIN mchatai-web-components: ui.crossword-board (ui/CrosswordBoard.js)

/**
 * Renders and plays a generated crossword (the output of CrosswordGenerator).
 * Self-contained: hand it a root element and a puzzle, and it builds the grid,
 * the across/down clue lists, the controls, and wires keyboard + click input,
 * cell highlighting, the active-word strip, a Check button, and a win state.
 *
 * Pairs with entities/CrosswordGenerator.js (the puzzle maker) and
 * resources/CrosswordDictionary.js (which exports CROSSWORD_BANK, the 425-word
 * bank). Together they are
 * the whole "deep dictionary -> good crossword" stack; a generated app only
 * has to: gen.generate(CROSSWORD_BANK) -> new CrosswordBoard({ root, puzzle }).start().
 *
 * Optional deps are duck-typed so the board works standalone or richer when the
 * AudioManager / Swatches Lego are present.
 *
 * Usage (install-relative import paths - copy EXACTLY; the bundled files live
 * under ./web-components/<category>/<File>.js, NOT flat under ./web-components/):
 *   import { CrosswordGenerator } from "./web-components/entities/CrosswordGenerator.js";
 *   import { CrosswordBoard } from "./web-components/ui/CrosswordBoard.js";
 *   import { CROSSWORD_BANK } from "./web-components/resources/CrosswordDictionary.js";
 *   const puzzle = new CrosswordGenerator({ size: 9, maxWords: 12, seed: 3 }).generate(CROSSWORD_BANK);
 *   new CrosswordBoard({ root: document.getElementById("app"), puzzle,
 *     onSolved: () => console.log("solved!") }).start();
 */
export class CrosswordBoard {
  constructor(opts = {}) {
    this.root = opts.root || document.body;
    this.puzzle = opts.puzzle;
    this.audio = opts.audio || null;           // optional AudioManager-like { beep() }
    this.onSolved = typeof opts.onSolved === "function" ? opts.onSolved : () => {};
    this.title = opts.title || "Mini Crossword";
    this.dir = "across";                        // current typing direction
    this.cursor = { r: 0, c: 0 };
    this.entry = null;                          // user letters grid
    this.startedAt = 0;
    this._els = {};
    this._tick = null;
  }

  start() {
    if (!this.puzzle || !this.puzzle.grid) {
      this.root.innerHTML = "<p>Could not build a puzzle from the word bank.</p>";
      return;
    }
    const { rows, cols } = this.puzzle;
    this.entry = Array.from({ length: rows }, () => Array(cols).fill(""));
    this.cursor = this._firstOpenCell();
    this._build();
    this.startedAt = nowMs();
    this._tick = setInterval(() => this._renderTimer(), 1000);
    this._renderAll();
  }

  destroy() { if (this._tick) clearInterval(this._tick); }

  _firstOpenCell() {
    const g = this.puzzle.grid;
    for (let r = 0; r < g.length; r++) for (let c = 0; c < g[r].length; c++) if (g[r][c] !== "#") return { r, c };
    return { r: 0, c: 0 };
  }

  _build() {
    const { rows, cols } = this.puzzle;
    this.root.innerHTML = "";
    const wrap = el("div", "cw-wrap");
    const head = el("div", "cw-head");
    head.appendChild(el("h1", "cw-title", this.title));
    const stats = el("div", "cw-stats");
    this._els.timer = el("span", "cw-timer", "0:00");
    this._els.progress = el("span", "cw-progress", "");
    stats.append(this._els.timer, this._els.progress);
    head.appendChild(stats);
    wrap.appendChild(head);

    // active clue strip
    this._els.active = el("div", "cw-active", "");
    wrap.appendChild(this._els.active);

    // grid
    const gridEl = el("div", "cw-grid");
    gridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    this._els.cells = [];
    for (let r = 0; r < rows; r++) {
      this._els.cells[r] = [];
      for (let c = 0; c < cols; c++) {
        const isBlock = this.puzzle.grid[r][c] === "#";
        const cell = el("div", "cw-cell" + (isBlock ? " cw-block" : ""));
        if (!isBlock) {
          const num = this.puzzle.numbers[`${r},${c}`];
          if (num) cell.appendChild(el("small", "cw-num", String(num)));
          cell.appendChild(el("span", "cw-letter", ""));
          cell.tabIndex = 0;
          cell.addEventListener("click", () => this._onCellClick(r, c));
        }
        gridEl.appendChild(cell);
        this._els.cells[r][c] = cell;
      }
    }
    wrap.appendChild(gridEl);

    // controls
    const ctrl = el("div", "cw-controls");
    const check = el("button", "cw-btn cw-primary", "Check");
    check.addEventListener("click", () => this._check());
    const reveal = el("button", "cw-btn", "Reveal letter");
    reveal.addEventListener("click", () => this._revealLetter());
    const again = el("button", "cw-btn", "New puzzle");
    again.addEventListener("click", () => location.reload());
    ctrl.append(check, reveal, again);
    wrap.appendChild(ctrl);

    this._els.message = el("p", "cw-message", "Click a square and type. Click again to switch across/down.");
    wrap.appendChild(this._els.message);

    // clue lists
    const clues = el("div", "cw-clues");
    clues.append(this._clueColumn("Across", this.puzzle.across, "across"),
                 this._clueColumn("Down", this.puzzle.down, "down"));
    wrap.appendChild(clues);

    this.root.appendChild(wrap);
    window.addEventListener("keydown", (e) => this._onKey(e));
  }

  _clueColumn(label, list, dir) {
    const col = el("div", "cw-clue-col");
    col.appendChild(el("h2", "cw-clue-h", label));
    const ul = el("ul", "cw-clue-list");
    list.forEach((w) => {
      const li = el("li", "cw-clue", `${w.number}. ${w.clue}`);
      li.dataset.r = w.row; li.dataset.c = w.col; li.dataset.dir = dir;
      li.addEventListener("click", () => { this.dir = dir; this.cursor = { r: w.row, c: w.col }; this._renderAll(); });
      ul.appendChild(li);
    });
    col.appendChild(ul);
    return col;
  }

  _onCellClick(r, c) {
    if (this.cursor.r === r && this.cursor.c === c) this.dir = this.dir === "across" ? "down" : "across";
    this.cursor = { r, c };
    this._renderAll();
  }

  _onKey(e) {
    const k = e.key;
    if (/^[a-zA-Z]$/.test(k)) { this._type(k.toUpperCase()); e.preventDefault(); return; }
    if (k === "Backspace") { this._backspace(); e.preventDefault(); return; }
    if (k === "ArrowRight") { this.dir = "across"; this._step(0, 1); e.preventDefault(); }
    else if (k === "ArrowLeft") { this.dir = "across"; this._step(0, -1); e.preventDefault(); }
    else if (k === "ArrowDown") { this.dir = "down"; this._step(1, 0); e.preventDefault(); }
    else if (k === "ArrowUp") { this.dir = "down"; this._step(-1, 0); e.preventDefault(); }
    else if (k === " ") { this.dir = this.dir === "across" ? "down" : "across"; e.preventDefault(); this._renderAll(); }
  }

  _type(letter) {
    const { r, c } = this.cursor;
    if (this.puzzle.grid[r][c] === "#") return;
    this.entry[r][c] = letter;
    if (this.audio && this.audio.beep) this.audio.beep({ freq: 540, duration: 0.03, type: "triangle" });
    this._advance();
    this._renderAll();
    if (this._isComplete()) this._check();
  }

  _backspace() {
    const { r, c } = this.cursor;
    if (this.entry[r][c]) { this.entry[r][c] = ""; }
    else { this._step(this.dir === "down" ? -1 : 0, this.dir === "across" ? -1 : 0); this.entry[this.cursor.r][this.cursor.c] = ""; }
    this._renderAll();
  }

  _advance() { this._step(this.dir === "down" ? 1 : 0, this.dir === "across" ? 1 : 0); }

  _step(dr, dc) {
    const { rows, cols } = this.puzzle;
    let { r, c } = this.cursor;
    for (let i = 0; i < Math.max(rows, cols); i++) {
      r += dr; c += dc;
      if (r < 0 || c < 0 || r >= rows || c >= cols) return;
      if (this.puzzle.grid[r][c] !== "#") { this.cursor = { r, c }; return; }
    }
  }

  _revealLetter() {
    const { r, c } = this.cursor;
    if (this.puzzle.grid[r][c] !== "#") { this.entry[r][c] = this.puzzle.grid[r][c]; this._advance(); this._renderAll(); }
  }

  _activeCells() {
    // all cells of the current word under the cursor
    const out = [];
    const { rows, cols } = this.puzzle;
    let { r, c } = this.cursor;
    const dr = this.dir === "down" ? 1 : 0, dc = this.dir === "across" ? 1 : 0;
    // walk back to word start
    while (true) { const pr = r - dr, pc = c - dc; if (pr < 0 || pc < 0 || this.puzzle.grid[pr]?.[pc] === "#" || this.puzzle.grid[pr]?.[pc] === undefined) break; r = pr; c = pc; }
    for (let rr = r, cc = c; rr < rows && cc < cols && this.puzzle.grid[rr][cc] !== "#"; rr += dr || 0, cc += dc || 0) {
      out.push({ r: rr, c: cc });
      if (!dr && !dc) break;
    }
    return out;
  }

  _renderAll() {
    const active = this._activeCells();
    const activeKey = new Set(active.map(p => `${p.r},${p.c}`));
    const { rows, cols } = this.puzzle;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const cell = this._els.cells[r][c];
      if (this.puzzle.grid[r][c] === "#") continue;
      cell.querySelector(".cw-letter").textContent = this.entry[r][c] || "";
      cell.dataset.cursor = String(r === this.cursor.r && c === this.cursor.c);
      cell.dataset.active = String(activeKey.has(`${r},${c}`));
    }
    // active clue text
    const word = this._wordAt(active[0]);
    this._els.active.textContent = word ? `${word.number} ${this.dir === "across" ? "Across" : "Down"}: ${word.clue}` : "";
    // progress
    let filled = 0, total = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (this.puzzle.grid[r][c] !== "#") { total++; if (this.entry[r][c]) filled++; }
    this._els.progress.textContent = `${filled}/${total}`;
  }

  _wordAt(start) {
    if (!start) return null;
    const list = this.dir === "across" ? this.puzzle.across : this.puzzle.down;
    return list.find(w => w.row === start.r && w.col === start.c) || null;
  }

  _isComplete() {
    const { rows, cols } = this.puzzle;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (this.puzzle.grid[r][c] !== "#" && !this.entry[r][c]) return false;
    return true;
  }

  _check() {
    const { rows, cols } = this.puzzle;
    let correct = 0, total = 0, wrong = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (this.puzzle.grid[r][c] === "#") continue;
      total++;
      if (this.entry[r][c] === this.puzzle.grid[r][c]) correct++;
      else if (this.entry[r][c]) wrong++;
    }
    if (correct === total) {
      this._els.message.textContent = "Solved! Nicely done.";
      this._els.message.dataset.solved = "true";
      if (this.audio && this.audio.beep) this.audio.beep({ freq: 720, duration: 0.18, type: "sine" });
      this.destroy();
      this.onSolved({ seconds: Math.floor((nowMs() - this.startedAt) / 1000) });
    } else {
      this._els.message.dataset.solved = "false";
      this._els.message.textContent = wrong ? `${correct}/${total} correct, ${wrong} to fix.` : `${correct}/${total} filled in.`;
    }
  }

  _renderTimer() {
    const s = Math.floor((nowMs() - this.startedAt) / 1000);
    this._els.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function nowMs() { return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now(); }

// END mchatai-web-components: ui.crossword-board
