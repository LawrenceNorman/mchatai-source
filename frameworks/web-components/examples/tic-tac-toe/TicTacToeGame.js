import { TurnBasedManager } from "../../core/TurnBasedManager.js";
import { AudioManager } from "../../resources/AudioManager.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";
import { RestartOverlay } from "../../ui/RestartOverlay.js";
import { Leaderboard } from "../../ui/Leaderboard.js";
import { CloudAIToggle } from "../../ui/CloudAIToggle.js";
import { TicTacToeRules, TicTacToeAI, emptyBoard } from "../../entities/TicTacToeRules.js";

const HUMAN = "x";
const AI = "o";

function ttQuery(target) {
  return typeof target === "string" ? document.querySelector(target) : target;
}

export class TicTacToeGame {
  constructor(options = {}) {
    this.boardEl = ttQuery(options.boardTarget);
    this.statusEl = ttQuery(options.statusTarget);
    this.scoreEl = ttQuery(options.scoreTarget);
    this.restartHostEl = ttQuery(options.restartHostTarget);
    this.toggleHostEl = ttQuery(options.toggleHostTarget);
    this.rankCardHostEl = ttQuery(options.rankCardHostTarget);

    this.rules = new TicTacToeRules();
    this.ai = new TicTacToeAI({ rules: this.rules, difficulty: "perfect" });
    this.turns = new TurnBasedManager({ players: [HUMAN, AI], phase: "playing" });
    this.audio = (typeof AudioManager === "function") ? new AudioManager({ masterVolume: 0.05 }) : { beep: () => {}, fadeIn: () => {}, fadeOut: () => {}, stop: () => {}, loop: () => {}, stopMusic: () => {}, play: () => {} };
    this.board = emptyBoard();
    this.score = { wins: 0, losses: 0, draws: 0 };
    this._aiPending = false;
    this._winningLine = null;
    this.difficulty = "perfect";

    this.restart = (typeof RestartOverlay === "function") ? new RestartOverlay({
      host: this.restartHostEl,
      onRestart: () => this.reset()
    }) : { show: () => {}, hide: () => {} };
    this.toggle = (typeof CloudAIToggle === "function") ? new CloudAIToggle({
      target: this.toggleHostEl,
      defaultLevel: "medium",
      tokenCost: 1,
      tokenCostUnit: "/ game",
      onChange: (level) => this._onDifficultyChange(level)
    }) : { mount: () => {}, getMode: () => "local", isCloudActive: () => false };

    if (typeof applySwatchVariables === "function" && typeof getSwatchByID === "function") {
      applySwatchVariables(document.documentElement, getSwatchByID("retro-neon"));
    }
    this._bindControls();
  }

  start() {
    this._render();
  }

  reset() {
    this.board = emptyBoard();
    this.turns.reset({ phase: "playing" });
    this._winningLine = null;
    this._aiPending = false;
    this.restart.hide();
    if (this.rankCardHostEl) this.rankCardHostEl.innerHTML = "";
    this._setStatus("Your turn — tap a square.");
    this._render();
  }

  _bindControls() {
    if (!this.boardEl) return;
    this.boardEl.addEventListener("click", (event) => {
      const cell = event.target.closest("[data-cell]");
      if (!cell) return;
      const index = Number(cell.dataset.cell);
      this._handleHumanMove(index);
    });
    this.boardEl.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const cell = event.target.closest("[data-cell]");
      if (!cell) return;
      event.preventDefault();
      this._handleHumanMove(Number(cell.dataset.cell));
    });
  }

  _onDifficultyChange(level) {
    this.difficulty = level;
    if (level === "easy") this.ai.difficulty = "easy";
    else this.ai.difficulty = "perfect";
    this._setStatus(`Difficulty: ${level}. ${this.turns.currentPlayer === HUMAN ? "Your turn." : "Thinking…"}`);
  }

  _handleHumanMove(index) {
    if (this.turns.phase !== "playing") return;
    if (this.turns.currentPlayer !== HUMAN) return;
    if (!this.rules.applyMove(this.board, index, HUMAN)) return;
    this.audio.beep({ freq: 520, duration: 0.06, type: "triangle" });
    this._postMove(HUMAN);
  }

  _postMove(color) {
    const result = this.rules.winner(this.board);
    if (result) {
      this._winningLine = this.rules.winningLine(this.board);
      this._endGame(result);
      this._render();
      return;
    }
    this.turns.nextTurn();
    this._render();
    if (this.turns.currentPlayer === AI) this._scheduleAIMove();
    else this._setStatus("Your turn — tap a square.");
  }

  _scheduleAIMove() {
    if (this._aiPending) return;
    this._aiPending = true;
    this._setStatus("Thinking…");
    setTimeout(() => {
      this._aiPending = false;
      if (this.turns.phase !== "playing" || this.turns.currentPlayer !== AI) return;
      const move = this.ai.pickMove(this.board, AI);
      if (move === null) return;
      this.rules.applyMove(this.board, move, AI);
      this.audio.beep({ freq: 320, duration: 0.07, type: "square" });
      this._postMove(AI);
    }, 380);
  }

  _endGame(result) {
    this.turns.setPhase("game-over");
    let title;
    let subtitle;
    let scoreDelta = 0;
    if (result === HUMAN) {
      title = "You win!";
      subtitle = `Perfect play means you found a flaw. Difficulty: ${this.difficulty}.`;
      this.score.wins += 1;
      scoreDelta = this.difficulty === "perfect" ? 100 : 50;
      this.audio.beep({ freq: 660, slideTo: 990, duration: 0.18, type: "triangle" });
    } else if (result === AI) {
      title = "You lost";
      subtitle = "Computer wins. Tap Play Again to try once more.";
      this.score.losses += 1;
      this.audio.beep({ freq: 220, duration: 0.18, type: "sawtooth" });
    } else {
      title = "Draw";
      subtitle = "Cat's game. Even ground.";
      this.score.draws += 1;
      scoreDelta = 25;
      this.audio.beep({ freq: 440, duration: 0.12, type: "sine" });
    }
    this._setStatus(`${title} ${subtitle}`);
    this.restart.show({ title, subtitle, buttonLabel: "Play Again" });

    // Wisdom rule bg-006 / ag-010: submit final score and show rank card.
    if (scoreDelta > 0 && this.rankCardHostEl) {
      this.rankCardHostEl.innerHTML = "";
      Leaderboard.submitFinal(scoreDelta, {
        result,
        difficulty: this.difficulty,
        moves: this.board.filter((c) => c !== null).length
      }).then((rankResult) => {
        if (rankResult) Leaderboard.renderRankCard(this.rankCardHostEl, rankResult);
      });
    }
  }

  _setStatus(text) {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  _render() {
    if (this.boardEl) {
      this.boardEl.innerHTML = "";
      for (let i = 0; i < 9; i += 1) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "ttt-cell";
        cell.dataset.cell = String(i);
        cell.setAttribute("role", "gridcell");
        const value = this.board[i];
        if (value === HUMAN) cell.textContent = "✕";
        else if (value === AI) cell.textContent = "○";
        if (this._winningLine && this._winningLine.includes(i)) cell.classList.add("ttt-cell--win");
        if (value !== null) cell.disabled = true;
        cell.setAttribute("aria-label", value ? `${value === HUMAN ? "X" : "O"} at cell ${i + 1}` : `Empty cell ${i + 1}`);
        this.boardEl.appendChild(cell);
      }
    }
    if (this.scoreEl) {
      const { wins, losses, draws } = this.score;
      this.scoreEl.innerHTML = `<span>W <strong>${wins}</strong></span> <span>L <strong>${losses}</strong></span> <span>D <strong>${draws}</strong></span>`;
    }
  }
}
