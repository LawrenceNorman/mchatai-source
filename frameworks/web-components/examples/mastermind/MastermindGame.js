import { TurnBasedManager } from "../../core/TurnBasedManager.js";
import { GridBoard } from "../../entities/GridBoard.js";
import { MastermindLogic } from "../../entities/MastermindLogic.js";
import { KeyboardInput } from "../../ui/KeyboardInput.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";
import { AudioManager } from "../../resources/AudioManager.js";

const MASTERMIND_COLORS = ["red", "blue", "green", "yellow", "purple", "orange"];
const MASTERMIND_LABELS = {
  red: "Red",
  blue: "Blue",
  green: "Green",
  yellow: "Yellow",
  purple: "Purple",
  orange: "Orange"
};

function mastermindQuery(root, selector) {
  return root.querySelector(selector);
}

export class MastermindGame {
  constructor(options = {}) {
    this.root = options.root || document;
    this.maxTurns = options.maxTurns || 10;
    this.codeLength = options.codeLength || 4;
    this.storagePrefix = options.storagePrefix || "mchatai.mastermind";

    this.logic = new MastermindLogic({
      colors: MASTERMIND_COLORS,
      codeLength: this.codeLength,
      allowDuplicates: true
    });
    this.turns = new TurnBasedManager({ players: ["codebreaker"], phase: "guessing" });
    this.board = new GridBoard({ rows: this.maxTurns, cols: this.codeLength });
    this.audio = new AudioManager({ masterVolume: 0.055 });
    this.scoreboard = new ScoreBoard({
      target: mastermindQuery(this.root, "#scoreboard"),
      storageKey: `${this.storagePrefix}.bestScore`,
      scoreLabel: "Score",
      highScoreLabel: "Best"
    });
    this.keyboard = new KeyboardInput({
      onAction: (action) => this.handleAction(action)
    }).bindMany({
      "1": "red",
      r: "red",
      "2": "blue",
      b: "blue",
      "3": "green",
      g: "green",
      "4": "yellow",
      y: "yellow",
      "5": "purple",
      p: "purple",
      "6": "orange",
      o: "orange",
      enter: "submit",
      backspace: "delete",
      escape: "new"
    });

    this.secret = [];
    this.currentGuess = [];
    this.history = [];
    this.finished = false;
    this.controlsBound = false;
  }

  start() {
    applySwatchVariables(document.documentElement, getSwatchByID("sunset-arcade"));
    this.renderPalette();
    this.bindControls();
    this.newGame();
  }

  newGame() {
    this.secret = this.logic.generateCode();
    this.currentGuess = [];
    this.history = [];
    this.finished = false;
    this.turns.reset({ phase: "guessing" });
    this.scoreboard.reset(0);
    this.setMessage("Pick four colors, then submit.");
    this.render();
  }

  handleAction(action) {
    if (MASTERMIND_COLORS.includes(action)) {
      this.addColor(action);
    } else if (action === "delete") {
      this.deleteColor();
    } else if (action === "submit") {
      this.submitGuess();
    } else if (action === "new") {
      this.newGame();
    }
  }

  addColor(color) {
    if (this.finished || this.currentGuess.length >= this.codeLength) {
      return;
    }
    this.currentGuess.push(color);
    this.audio.beep({ freq: 360 + this.currentGuess.length * 80, duration: 0.035, type: "triangle" });
    this.renderCurrentGuess();
  }

  deleteColor() {
    if (this.finished || this.currentGuess.length === 0) {
      return;
    }
    this.currentGuess.pop();
    this.renderCurrentGuess();
  }

  submitGuess() {
    if (this.finished) {
      this.newGame();
      return;
    }
    if (this.currentGuess.length !== this.codeLength) {
      this.reject("Fill all four code slots before submitting.");
      return;
    }

    const guess = this.currentGuess.slice();
    const feedback = this.logic.scoreGuess(guess, this.secret);
    this.history.push({ guess, feedback });
    this.turns.record({ type: "guess", guess, feedback });
    this.currentGuess = [];

    const turnNumber = this.history.length;
    const points = feedback.exact * 40 + feedback.colorOnly * 15 + Math.max(0, this.maxTurns - turnNumber) * 4;
    this.scoreboard.add(points);
    this.updateFeedbackHUD(feedback);

    if (feedback.solved) {
      const bonus = 500 + Math.max(0, this.maxTurns - turnNumber) * 70;
      this.scoreboard.add(bonus);
      this.finished = true;
      this.turns.setPhase("won");
      this.setMessage(`Code cracked in ${turnNumber} turn${turnNumber === 1 ? "" : "s"}. Bonus +${bonus}.`);
      this.audio.beep({ freq: 620, slideTo: 1180, duration: 0.16, type: "sine" });
    } else if (turnNumber >= this.maxTurns) {
      this.finished = true;
      this.turns.setPhase("lost");
      this.setMessage("Code locked. The secret is revealed. Start a new code.");
      this.audio.noise({ duration: 0.15, volume: 0.045 });
    } else {
      this.turns.nextTurn({ feedback });
      this.setMessage(`${feedback.exact} exact, ${feedback.colorOnly} color-only. Try another code.`);
    }

    this.render();
  }

  reject(message) {
    this.setMessage(message);
    const current = mastermindQuery(this.root, "#currentGuess");
    current?.classList.remove("shake");
    requestAnimationFrame(() => current?.classList.add("shake"));
    this.audio.beep({ freq: 180, duration: 0.07, type: "square" });
  }

  bindControls() {
    if (this.controlsBound) {
      return;
    }
    mastermindQuery(this.root, "#submitButton")?.addEventListener("click", () => this.handleAction("submit"));
    mastermindQuery(this.root, "#deleteButton")?.addEventListener("click", () => this.handleAction("delete"));
    mastermindQuery(this.root, "#newButton")?.addEventListener("click", () => this.handleAction("new"));
    this.controlsBound = true;
  }

  render() {
    this.renderSecret();
    this.renderBoard();
    this.renderCurrentGuess();
    this.renderTurn();
  }

  renderSecret() {
    const target = mastermindQuery(this.root, "#secretRow");
    target.innerHTML = "";
    const reveal = this.finished;
    for (let index = 0; index < this.codeLength; index += 1) {
      const slot = document.createElement("div");
      slot.className = "secret-slot";
      if (reveal) {
        slot.dataset.color = this.secret[index];
        slot.setAttribute("aria-label", MASTERMIND_LABELS[this.secret[index]]);
      } else {
        slot.textContent = "?";
      }
      target.appendChild(slot);
    }
  }

  renderBoard() {
    const target = mastermindQuery(this.root, "#board");
    target.innerHTML = "";
    for (let row = 0; row < this.maxTurns; row += 1) {
      const entry = this.history[row];
      const rowEl = document.createElement("div");
      rowEl.className = "guess-row";
      rowEl.dataset.active = String(!this.finished && row === this.history.length);

      const turn = document.createElement("div");
      turn.className = "turn-index";
      turn.textContent = String(row + 1);
      rowEl.appendChild(turn);

      for (let col = 0; col < this.codeLength; col += 1) {
        rowEl.appendChild(this.createCodeSlot(entry?.guess[col]));
      }

      rowEl.appendChild(this.createFeedback(entry?.feedback));
      target.appendChild(rowEl);
    }
  }

  renderCurrentGuess() {
    const target = mastermindQuery(this.root, "#currentGuess");
    target.innerHTML = "";
    for (let index = 0; index < this.codeLength; index += 1) {
      target.appendChild(this.createCodeSlot(this.currentGuess[index]));
    }
  }

  renderPalette() {
    const target = mastermindQuery(this.root, "#palette");
    target.innerHTML = "";
    MASTERMIND_COLORS.forEach((color, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "peg-button";
      button.dataset.color = color;
      button.setAttribute("aria-label", `${MASTERMIND_LABELS[color]} (${index + 1})`);
      button.title = `${MASTERMIND_LABELS[color]} (${index + 1})`;
      button.addEventListener("click", () => this.handleAction(color));
      target.appendChild(button);
    });
  }

  createCodeSlot(color) {
    const slot = document.createElement("div");
    slot.className = "code-slot";
    if (color) {
      slot.dataset.color = color;
      slot.setAttribute("aria-label", MASTERMIND_LABELS[color]);
    }
    return slot;
  }

  createFeedback(feedback) {
    const wrap = document.createElement("div");
    wrap.className = "feedback";
    const exact = feedback?.exact || 0;
    const colorOnly = feedback?.colorOnly || 0;
    for (let index = 0; index < this.codeLength; index += 1) {
      const peg = document.createElement("div");
      peg.className = "feedback-peg";
      if (index < exact) {
        peg.dataset.kind = "exact";
      } else if (index < exact + colorOnly) {
        peg.dataset.kind = "color";
      }
      wrap.appendChild(peg);
    }
    return wrap;
  }

  renderTurn() {
    const nextTurn = Math.min(this.history.length + 1, this.maxTurns);
    mastermindQuery(this.root, "#turn").textContent = `${nextTurn}/${this.maxTurns}`;
  }

  updateFeedbackHUD(feedback) {
    mastermindQuery(this.root, "#exact").textContent = String(feedback.exact);
    mastermindQuery(this.root, "#colorOnly").textContent = String(feedback.colorOnly);
  }

  setMessage(message) {
    mastermindQuery(this.root, "#message").textContent = message;
  }
}
