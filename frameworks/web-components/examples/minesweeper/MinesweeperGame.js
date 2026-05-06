import { TurnBasedManager } from "../../core/TurnBasedManager.js";
import { GridBoard } from "../../entities/GridBoard.js";
import { RevealLogic } from "../../entities/RevealLogic.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { RestartOverlay } from "../../ui/RestartOverlay.js";
import { Leaderboard } from "../../ui/Leaderboard.js";
import { getSwatchByID, applySwatchVariables } from "../../resources/Swatches.js";
import { AudioManager } from "../../resources/AudioManager.js";
import { BoardShake } from "../../effects/BoardShake.js";
import { PopBurst } from "../../effects/PopBurst.js";
import { ScoreRise } from "../../effects/ScoreRise.js";

export class MinesweeperGame {
  constructor(options = {}) {
    this.root = options.root || document.body;
    this.rows = options.rows ?? 9;
    this.cols = options.cols ?? 9;
    this.mineCount = options.mines ?? 10;
    this.turns = new TurnBasedManager({ players: ["player"], phase: "ready" });
    this.logic = new RevealLogic();
    this.audio = (typeof AudioManager === "function") ? new AudioManager({ masterVolume: 0.05 }) : { beep: () => {}, fadeIn: () => {}, fadeOut: () => {}, stop: () => {}, loop: () => {}, stopMusic: () => {}, play: () => {} };
    this.scoreboard = new ScoreBoard({
      target: "#scoreboard",
      storageKey: "mchatai.minesweeper99.bestScore",
      scoreLabel: "Score",
      highScoreLabel: "Best"
    });
    this.flagMode = false;
    this.startedAt = 0;
    this.timerID = null;
    this.elapsed = 0;
    this.gameOver = false;
    this.boardElement = document.querySelector("#board");
    this.messageElement = document.querySelector("#message");
    this.timerElement = document.querySelector("#timer");
    this.minesLeftElement = document.querySelector("#minesLeft");
    this.flagModeButton = document.querySelector("#flagModeButton");
    this.newGameButton = document.querySelector("#newGameButton");
    this.rankCardHostEl = document.querySelector("#rankCard");
    if (typeof applySwatchVariables === "function" && typeof getSwatchByID === "function") {
      applySwatchVariables(document.documentElement, getSwatchByID("retro-neon"));
    }
    if (typeof BoardShake?.injectCss === "function") BoardShake.injectCss();
    if (typeof PopBurst?.injectCss === "function") PopBurst.injectCss();
    if (typeof ScoreRise?.injectCss === "function") ScoreRise.injectCss();
    this.restart = (typeof RestartOverlay === "function") ? new RestartOverlay({
      host: document.querySelector("[data-app]") || document.body,
      onRestart: () => this.reset()
    }) : { show: () => {}, hide: () => {} };
  }

  start() {
    this.bindControls();
    this.reset();
  }

  bindControls() {
    this.flagModeButton.addEventListener("click", () => {
      this.flagMode = !this.flagMode;
      this.renderStatus();
    });
    this.newGameButton.addEventListener("click", () => this.reset());
  }

  reset() {
    clearInterval(this.timerID);
    this.board = new GridBoard({
      rows: this.rows,
      cols: this.cols,
      fill: () => ({ value: 0, adjacent: 0, revealed: false, flagged: false })
    });
    this.logic.seedMines(this.board, this.mineCount, [{ row: 0, col: 0 }]);
    this.flagMode = false;
    this.startedAt = 0;
    this.elapsed = 0;
    this.gameOver = false;
    this.turns.reset({ phase: "playing" });
    this.scoreboard.reset(0);
    this.restart?.hide();
    if (this.rankCardHostEl) this.rankCardHostEl.innerHTML = "";
    this.setMessage("Reveal a cell to start. Right-click or use Flag Mode to mark mines.");
    this.renderBoard();
    this.renderStatus();
  }

  renderBoard() {
    this.boardElement.innerHTML = "";
    this.boardElement.style.setProperty("--rows", String(this.rows));
    this.boardElement.style.setProperty("--cols", String(this.cols));

    this.board.forEach((cell, row, col) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mine-cell";
      button.dataset.row = String(row);
      button.dataset.col = String(col);
      button.setAttribute("aria-label", `Cell ${row + 1}, ${col + 1}`);
      button.addEventListener("click", () => this.handleCell(row, col, false));
      button.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        this.handleCell(row, col, true);
      });
      this.bindLongPress(button, row, col);
      this.boardElement.appendChild(button);
      this.paintCell(button, cell);
    });
  }

  bindLongPress(button, row, col) {
    let pressTimer = null;
    const clear = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };
    button.addEventListener("pointerdown", () => {
      clear();
      pressTimer = setTimeout(() => {
        pressTimer = null;
        this.handleCell(row, col, true);
      }, 450);
    });
    button.addEventListener("pointerup", clear);
    button.addEventListener("pointerleave", clear);
    button.addEventListener("pointercancel", clear);
  }

  handleCell(row, col, forceFlag) {
    if (this.gameOver) {
      return;
    }
    this.startTimer();

    if (forceFlag || this.flagMode) {
      if (this.logic.toggleFlag(this.board, row, col)) {
        this.audio.beep({ freq: 330, duration: 0.05 });
        this.turns.record({ type: "flag", row, col });
      }
      this.renderBoard();
      this.renderStatus();
      return;
    }

    const result = this.logic.reveal(this.board, row, col);
    if (result.revealed.length === 0) {
      return;
    }

    this.turns.record({ type: "reveal", row, col, count: result.revealed.length });
    if (result.hitMine) {
      this.audio.noise({ duration: 0.18, volume: 0.08 });
      const mineCell = this.boardElement?.querySelector(`[data-row="${row}"][data-col="${col}"]`);
      if (mineCell) PopBurst?.spawn?.(mineCell, { color: "#ff5b6e", size: 1.4 });
      BoardShake?.shake?.(this.boardElement, { intensity: "strong" });
      this.finish(false);
      return;
    }

    const points = result.revealed.length * 10;
    this.scoreboard.add(points);
    this.audio.beep({ freq: 520, duration: 0.04 });
    if (result.revealed.length >= 4) {
      const clickedCell = this.boardElement?.querySelector(`[data-row="${row}"][data-col="${col}"]`);
      if (clickedCell) ScoreRise?.show?.(clickedCell, `+${points}`, { color: "#7ee787", fontSize: 14 });
    }
    if (this.hasWon()) {
      this.finish(true);
      return;
    }
    this.renderBoard();
    this.renderStatus();
  }

  startTimer() {
    if (this.startedAt !== 0) {
      return;
    }
    this.startedAt = Date.now();
    this.timerID = setInterval(() => {
      this.elapsed = Math.floor((Date.now() - this.startedAt) / 1000);
      this.renderStatus();
    }, 250);
  }

  finish(won) {
    this.gameOver = true;
    clearInterval(this.timerID);
    this.board.forEach((cell, row, col) => {
      if (cell.value === this.logic.mineValue) {
        this.board.set(row, col, { ...cell, revealed: true });
      }
    });
    if (won) {
      const bonus = Math.max(0, 300 - this.elapsed * 3);
      const winPoints = 500 + bonus;
      this.scoreboard.add(winPoints);
      this.audio.beep({ freq: 760, slideTo: 1040, duration: 0.16 });
      ScoreRise?.show?.(this.boardElement || this.root, `+${winPoints}${bonus > 0 ? " ⏱️" : ""}`, {
        color: "#ffd766",
        fontSize: 22
      });
      this.setMessage(`Board cleared in ${this.elapsed}s. New field ready when you are.`);
      this.turns.setPhase("won");
      this.restart?.show({
        title: "Field cleared!",
        subtitle: `Cleared in ${this.elapsed}s with ${this.mineCount} mines avoided.`,
        buttonLabel: "New Field"
      });
      if (this.rankCardHostEl) {
        this.rankCardHostEl.innerHTML = "";
        Leaderboard.submitFinal(this.scoreboard.score, {
          result: "win",
          time_seconds: this.elapsed,
          mines: this.mineCount,
          rows: this.rows,
          cols: this.cols
        }).then((rank) => {
          if (rank) Leaderboard.renderRankCard(this.rankCardHostEl, rank);
        });
      }
    } else {
      this.setMessage("Mine hit. Study the field and start a new game.");
      this.turns.setPhase("lost");
      this.restart?.show({
        title: "Mine!",
        subtitle: "The field is lost. Tap New Field to try again.",
        buttonLabel: "New Field"
      });
    }
    this.renderBoard();
    this.renderStatus();
  }

  hasWon() {
    let hiddenSafe = 0;
    this.board.forEach((cell) => {
      if (cell.value !== this.logic.mineValue && !cell.revealed) {
        hiddenSafe += 1;
      }
    });
    return hiddenSafe === 0;
  }

  renderStatus() {
    const flags = this.countFlags();
    this.timerElement.textContent = String(this.elapsed);
    this.minesLeftElement.textContent = String(Math.max(0, this.mineCount - flags));
    this.flagModeButton.classList.toggle("is-active", this.flagMode);
    this.flagModeButton.textContent = this.flagMode ? "Flag Mode (on)" : "Flag Mode";
  }

  renderCells() {
    this.boardElement.querySelectorAll(".mine-cell").forEach((button) => {
      const row = Number(button.dataset.row);
      const col = Number(button.dataset.col);
      this.paintCell(button, this.board.get(row, col));
    });
  }

  paintCell(button, cell) {
    button.className = "mine-cell";
    button.textContent = "";
    if (cell.flagged && !cell.revealed) {
      button.classList.add("is-flagged");
      button.textContent = "F";
      return;
    }
    if (!cell.revealed) {
      return;
    }
    button.classList.add("is-revealed");
    if (cell.value === this.logic.mineValue) {
      button.classList.add("is-mine");
      button.textContent = "*";
    } else if ((cell.adjacent ?? cell.value) > 0) {
      button.dataset.count = String(cell.adjacent ?? cell.value);
      button.textContent = String(cell.adjacent ?? cell.value);
    }
  }

  countFlags() {
    let flags = 0;
    this.board.forEach((cell) => {
      if (cell.flagged) {
        flags += 1;
      }
    });
    return flags;
  }

  setMessage(message) {
    this.messageElement.textContent = message;
  }
}
