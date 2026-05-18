// This example demonstrates a SINGLE-LEVEL match-three (MOVES = 24 budget).
// For level-based gameplay (8+ levels with cumulative leaderboard scoring),
// import LevelProgression and call it from newGame()/handleTile():
//
//   import { LevelProgression } from "../../entities/LevelProgression.js";
//   this.lp = new LevelProgression({ onLevelChange: (i, meta) => { this.moves = meta.moves; this.render(); } });
//   this.lp.mount();    // injects hidden [data-mchatai-score] for leaderboard
//   this.lp.start();
//   // ...on each move: if (this.scoreboard.score >= this.lp.currentMeta().target) endLevel(true);
//   // ...on out of moves: this.lp.recordLevelScore(score); show overlay; on click -> this.lp.advance() or .newGamePlus()
//
// See wisdom rules lb-015-cumulative-across-levels and lb-016-many-levels-or-endless
// for the policy; see entities/LevelProgression.js for the full usage docstring.

import { TurnBasedManager } from "../../core/TurnBasedManager.js";
import { GridBoard } from "../../entities/GridBoard.js";
import { TileSwapper } from "../../entities/TileSwapper.js";
import { Match3Logic } from "../../entities/Match3Logic.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { SvgShapes } from "../../ui/SvgShapes.js";
import { HintPulse } from "../../effects/HintPulse.js";
import { PopBurst } from "../../effects/PopBurst.js";
import { ScoreRise } from "../../effects/ScoreRise.js";
import { BoardShake } from "../../effects/BoardShake.js";
import { SpawnDrop } from "../../effects/SpawnDrop.js";
import { AudioManager } from "../../resources/AudioManager.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";

const ROWS = 8;
const COLS = 8;
const MOVES = 24;
// 6-token palette: prefer the SvgShapes Lego for distinct silhouettes; if the
// inline assembler dropped it, fall back to a flat token list that the render
// path renders as gradient-only tiles (still readable, just less visual variety).
const _DEFAULT_FALLBACK_TOKENS = [
  { id: 0, name: "ruby",      shape: "lozenge",  fill: "#ff5b6e", shine: "#ffc8cf" },
  { id: 1, name: "orange",    shape: "hexagon",  fill: "#ff9c2e", shine: "#ffd9a3" },
  { id: 2, name: "lemon",     shape: "star",     fill: "#ffd83a", shine: "#fff0a3" },
  { id: 3, name: "mint",      shape: "chiclet",  fill: "#5fd24c", shine: "#bdf0b3" },
  { id: 4, name: "blueberry", shape: "circle",   fill: "#3aa9ff", shine: "#bcdfff" },
  { id: 5, name: "plum",      shape: "diamond",  fill: "#c084fc", shine: "#e9d2ff" }
];
const TILE_TYPES = (typeof SvgShapes === "object" && SvgShapes && typeof SvgShapes.defaultTokens === "function")
  ? SvgShapes.defaultTokens()
  : _DEFAULT_FALLBACK_TOKENS;
function _renderTokenGlyph(token) {
  if (typeof SvgShapes === "object" && SvgShapes && typeof SvgShapes.renderToken === "function") {
    return SvgShapes.renderToken(token);
  }
  // No-Lego fallback: use a colored div with a soft inner highlight so the cell
  // still reads as a candy, not a flat square.
  return `<span class="candy-fallback" style="background:${token.fill};box-shadow:inset 0 -4px 0 rgba(0,0,0,.15),inset 0 3px 0 ${token.shine};"></span>`;
}

function candyTarget(target) {
  return typeof target === "string" ? document.querySelector(target) : target;
}

function randomCandyID() {
  return TILE_TYPES[Math.floor(Math.random() * TILE_TYPES.length)].id;
}

export class CandyMatchGame {
  constructor(options = {}) {
    this.boardEl = candyTarget(options.boardTarget);
    this.movesEl = candyTarget(options.movesTarget);
    this.comboEl = candyTarget(options.comboTarget);
    this.clearedEl = candyTarget(options.clearedTarget);
    this.messageEl = candyTarget(options.messageTarget);
    this.shuffleButton = candyTarget(options.shuffleButton);
    this.newGameButton = candyTarget(options.newGameButton);
    this.scoreboard = new ScoreBoard({
      target: candyTarget(options.scoreboardTarget),
      storageKey: "mchatai.candyMatch.bestScore",
      scoreLabel: "Score",
      highScoreLabel: "Best"
    });
    this.audio = (typeof AudioManager === "function") ? new AudioManager({ masterVolume: 0.045 }) : { beep: () => {}, noise: () => {}, fadeIn: () => {}, fadeOut: () => {}, stop: () => {}, loop: () => {}, stopMusic: () => {}, play: () => {} };
    this.turns = new TurnBasedManager({ players: ["player"], phase: "playing" });
    this.grid = new GridBoard({ rows: ROWS, cols: COLS, fill: 0 });
    this.swapper = new TileSwapper({
      onSwap: (from, to) => this.turns.record({ type: "swap", from, to })
    });
    this.logic = new Match3Logic({
      emptyValue: null,
      randomTile: randomCandyID
    });

    this.moves = MOVES;
    this.combo = 1;
    this.totalCleared = 0;
    this.resolving = false;

    // Hint system: per-cell glow on idle inactivity. HintPulse Lego encapsulates
    // the timer + cell-class toggling so future tile games reuse it. Defensive:
    // if the inline assembler dropped HintPulse, .hints stays a no-op stub.
    this.hintButton = candyTarget(options.hintButton);
    this.hints = (typeof HintPulse === "function")
      ? new HintPulse({
          boardEl: this.boardEl,
          findHint: () => this._findAnyValidSwap(),
          idleMs: typeof options.idleHintMs === "number" ? options.idleHintMs : 6000,
          holdMs: 2400
        })
      : { schedule: () => {}, cancel: () => {}, now: () => {}, dispose: () => {} };

    if (typeof applySwatchVariables === "function" && typeof getSwatchByID === "function") {
      applySwatchVariables(document.documentElement, getSwatchByID("sunset-arcade"));
    }

    // Effects: each Lego owns its own keyframes and class names. Inject all
    // CSS once on init; from here on we just call .spawn / .show / .shake /
    // .pop and the visuals work without us touching CSS again. If the
    // assembler dropped any Lego, the import becomes a no-op and the call
    // sites below silently skip — no console errors, no broken layout.
    if (typeof HintPulse?.injectCss === "function") HintPulse.injectCss();
    if (typeof PopBurst?.injectCss === "function") PopBurst.injectCss();
    if (typeof ScoreRise?.injectCss === "function") ScoreRise.injectCss();
    if (typeof BoardShake?.injectCss === "function") BoardShake.injectCss();
    if (typeof SpawnDrop?.injectCss === "function") SpawnDrop.injectCss();

    this.bindControls();
    this.newGame();
  }

  start() {
    this.render();
    return this;
  }

  bindControls() {
    this.boardEl?.addEventListener("click", (event) => {
      const tile = event.target.closest("[data-row][data-col]");
      if (!tile) {
        return;
      }
      this.handleTile(Number(tile.dataset.row), Number(tile.dataset.col));
    });
    this.boardEl?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      const tile = event.target.closest("[data-row][data-col]");
      if (!tile) {
        return;
      }
      event.preventDefault();
      this.handleTile(Number(tile.dataset.row), Number(tile.dataset.col));
    });
    this.shuffleButton?.addEventListener("click", () => this.shuffle());
    this.newGameButton?.addEventListener("click", () => this.newGame());
    this.hintButton?.addEventListener("click", () => this.hints?.now());
  }

  _findAnyValidSwap() {
    // Brute force: try every adjacent pair, see if swap creates a match.
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        for (const [dr, dc] of [[0, 1], [1, 0]]) {
          const r2 = r + dr, c2 = c + dc;
          if (r2 >= ROWS || c2 >= COLS) continue;
          if (this._swapWouldMatch(r, c, r2, c2)) {
            return [{ row: r, col: c }, { row: r2, col: c2 }];
          }
        }
      }
    }
    return null;
  }

  _swapWouldMatch(r1, c1, r2, c2) {
    const a = this.grid.get(r1, c1);
    const b = this.grid.get(r2, c2);
    if (a == null || b == null) return false;
    this.grid.set(r1, c1, b);
    this.grid.set(r2, c2, a);
    const matches = (typeof this.logic.findMatches === "function")
      ? this.logic.findMatches(this.grid)
      : this.logic.findMatchesAt?.(this.grid, [{ row: r1, col: c1 }, { row: r2, col: c2 }]) || [];
    this.grid.set(r1, c1, a);
    this.grid.set(r2, c2, b);
    return Array.isArray(matches) ? matches.length > 0 : Boolean(matches);
  }

  newGame() {
    this.hints?.cancel();
    this.moves = MOVES;
    this.combo = 1;
    this.totalCleared = 0;
    this.resolving = false;
    this.swapper.clear();
    this.turns.reset({ phase: "playing", round: 1 });
    this.scoreboard.reset(0);
    this.fillPlayableBoard();
    this.setMessage("Swipe a candy to swap with a neighbor.");
    this.render();
    this.hints?.schedule();
  }

  shuffle() {
    if (this.resolving) {
      return;
    }
    this.fillPlayableBoard();
    this.swapper.clear();
    this.combo = 1;
    this.turns.record({ type: "shuffle" });
    this.setMessage("Board shuffled. Find a new swap.");
    this.audio.beep({ freq: 260, slideTo: 520, duration: 0.1, type: "triangle" });
    this.render();
  }

  fillPlayableBoard() {
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        this.grid.set(row, col, this.randomSafeTile(row, col));
      }
    }
    if (!this.hasPossibleMove()) {
      this.fillPlayableBoard();
    }
  }

  randomSafeTile(row, col) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const value = randomCandyID();
      const horizontal = col >= 2 && this.grid.get(row, col - 1) === value && this.grid.get(row, col - 2) === value;
      const vertical = row >= 2 && this.grid.get(row - 1, col) === value && this.grid.get(row - 2, col) === value;
      if (!horizontal && !vertical) {
        return value;
      }
    }
    return randomCandyID();
  }

  handleTile(row, col) {
    if (this.resolving || this.turns.phase !== "playing" || !this.grid.inBounds(row, col)) {
      return;
    }

    const result = this.swapper.trySwap(this.grid, row, col);
    if (!result.swapped) {
      this.setMessage("Selected. Tap a neighboring candy to swap.");
      this.render();
      return;
    }

    const matches = this.logic.findMatches(this.grid);
    if (!matches.length) {
      this.grid.swap(result.from, result.to);
      this.setMessage("No match there. Try a different adjacent swap.");
      this.audio.beep({ freq: 150, duration: 0.08, type: "sawtooth" });
      // BoardShake Lego: invalid-swap feedback. Universal pattern — same
      // call works on any container that needs a "no-go" beat.
      BoardShake?.shake?.(this.boardEl);
      this.render();
      return;
    }

    this.moves -= 1;
    this.resolveMatches(matches);
  }

  resolveMatches(initialMatches) {
    this.resolving = true;
    let matches = initialMatches;
    let combo = 1;
    let clearedThisMove = 0;

    while (matches.length) {
      const cleared = this.logic.clearMatches(this.grid, matches);
      // PopBurst + ScoreRise Legos: visible "thing happened here" feedback
      // for each cleared cell + a floating score popup at the board level.
      // Both helpers are no-ops if the Lego was dropped by the assembler.
      const cellsToBurst = matches.flat ? matches.flat() : matches;
      if (Array.isArray(cellsToBurst)) {
        for (const cellRef of cellsToBurst) {
          const r = cellRef?.row, c = cellRef?.col;
          if (typeof r === "number" && typeof c === "number") {
            const el = this.boardEl?.querySelector(`[data-row="${r}"][data-col="${c}"]`);
            if (el) PopBurst?.spawn?.(el);
          }
        }
      }
      const points = cleared * 10 * combo;
      this.scoreboard.add(points);
      if (this.boardEl && points > 0) {
        ScoreRise?.show?.(this.boardEl, `+${points}${combo > 1 ? ` ×${combo}` : ""}`, {
          color: combo > 1 ? "#ffd766" : undefined,
          fontSize: combo > 1 ? 18 : 14
        });
      }
      clearedThisMove += cleared;
      this.totalCleared += cleared;
      this.logic.collapseColumns(this.grid);
      combo += 1;
      matches = this.logic.findMatches(this.grid);
    }

    this.combo = Math.max(1, combo - 1);
    this.audio.beep({ freq: 420, slideTo: 720 + this.combo * 45, duration: 0.11, type: "triangle" });
    if (this.combo > 1) {
      this.setMessage(`Combo x${this.combo}. Cleared ${clearedThisMove} candies.`);
    } else {
      this.setMessage(`Cleared ${clearedThisMove} candies.`);
    }

    if (!this.hasPossibleMove()) {
      this.fillPlayableBoard();
      this.setMessage("No swaps remained, so the board reshuffled.");
    }

    if (this.moves <= 0) {
      this.turns.setPhase("gameover");
      this.setMessage(`Game over. Final score ${this.scoreboard.score}.`);
    }

    this.resolving = false;
    this.render();
  }

  hasPossibleMove() {
    const directions = [{ row: 0, col: 1 }, { row: 1, col: 0 }];
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        for (const delta of directions) {
          const other = { row: row + delta.row, col: col + delta.col };
          if (!this.grid.inBounds(other.row, other.col)) {
            continue;
          }
          this.grid.swap({ row, col }, other);
          const hasMatch = this.logic.findMatches(this.grid).length > 0;
          this.grid.swap({ row, col }, other);
          if (hasMatch) {
            return true;
          }
        }
      }
    }
    return false;
  }

  render() {
    if (!this.boardEl) {
      return;
    }
    this.boardEl.innerHTML = "";
    this.grid.forEach((value, row, col) => {
      const type = TILE_TYPES[value] || TILE_TYPES[0];
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = `tile kind-${type.id}`;
      tile.dataset.row = String(row);
      tile.dataset.col = String(col);
      tile.setAttribute("role", "gridcell");
      tile.setAttribute("aria-label", `${type.name} candy row ${row + 1} column ${col + 1}`);
      if (this.swapper.selected?.row === row && this.swapper.selected?.col === col) {
        tile.classList.add("selected");
      }
      tile.innerHTML = _renderTokenGlyph(type);
      this.boardEl.appendChild(tile);
      // SpawnDrop Lego: every newly-rendered tile gets the .spawn class so
      // it animates in with the canonical overshoot curve. Auto-cleans
      // after ~360ms so re-renders don't re-trigger forever.
      SpawnDrop?.spawn?.(tile);
    });
    if (this.movesEl) {
      this.movesEl.textContent = String(this.moves);
    }
    if (this.comboEl) {
      this.comboEl.textContent = `x${this.combo}`;
    }
    if (this.clearedEl) {
      this.clearedEl.textContent = String(this.totalCleared);
    }
  }

  setMessage(message) {
    if (this.messageEl) {
      this.messageEl.textContent = message;
    }
  }
}
