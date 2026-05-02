import { TurnBasedManager } from "../../core/TurnBasedManager.js";
import { GridBoard } from "../../entities/GridBoard.js";
import { LetterGrid } from "../../entities/LetterGrid.js";
import { KeyboardInput } from "../../ui/KeyboardInput.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { WEB_COMPONENT_SWATCHES, applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";
import { AudioManager } from "../../resources/AudioManager.js";

const KEY_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
const STATUS_RANK = { absent: 1, present: 2, correct: 3 };

function choose(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function normalizeWord(value) {
  return String(value || "").trim().toUpperCase();
}

export class WordQuestGame {
  constructor(options = {}) {
    this.root = options.root || document;
    this.answerWords = (options.answerWords || ["CRANE"]).map(normalizeWord);
    this.dictionary = new Set([...(options.dictionary || []), ...this.answerWords].map(normalizeWord));
    this.maxRows = options.maxRows || 6;
    this.wordLength = options.wordLength || 5;
    this.storagePrefix = options.storagePrefix || "mchatai.wordQuest";

    this.turns = new TurnBasedManager({ players: ["player"], phase: "guessing" });
    this.boardShape = new GridBoard({ rows: this.maxRows, cols: this.wordLength });
    this.grid = new LetterGrid({ rows: this.maxRows, cols: this.wordLength });
    this.audio = new AudioManager({ masterVolume: 0.06 });
    this.scoreboard = new ScoreBoard({
      target: this.root.querySelector("#scoreboard"),
      storageKey: `${this.storagePrefix}.bestScore`,
      scoreLabel: "Score",
      highScoreLabel: "Best"
    });
    this.keyboard = new KeyboardInput({
      onText: (letter) => this.addLetter(letter),
      onAction: (action) => this.handleAction(action)
    }).bindMany({
      enter: "submit",
      backspace: "delete"
    });

    this.answer = "";
    this.row = 0;
    this.col = 0;
    this.keyStatuses = new Map();
    this.rowScores = new Map();
    this.controlsBound = false;
    this.streak = Number(localStorage.getItem(`${this.storagePrefix}.streak`) || 0);
    this.finished = false;
  }

  start() {
    applySwatchVariables(document.documentElement, getSwatchByID("retro-neon", WEB_COMPONENT_SWATCHES));
    this.renderKeyboard();
    this.newRound();
  }

  newRound() {
    this.answer = choose(this.answerWords);
    this.grid = new LetterGrid({ rows: this.maxRows, cols: this.wordLength });
    this.row = 0;
    this.col = 0;
    this.keyStatuses.clear();
    this.rowScores.clear();
    this.finished = false;
    this.turns.reset({ phase: "guessing" });
    this.renderGrid();
    this.updateKeyboardStatuses();
    this.renderStreak();
    this.setMessage("Guess the hidden five-letter word.");
  }

  addLetter(letter) {
    if (this.finished || this.col >= this.wordLength) {
      return;
    }
    const normalized = normalizeWord(letter)[0];
    if (!/^[A-Z]$/.test(normalized)) {
      return;
    }
    this.grid.set(this.row, this.col, normalized);
    this.col += 1;
    this.renderGrid();
  }

  deleteLetter() {
    if (this.finished || this.col <= 0) {
      return;
    }
    this.col -= 1;
    this.grid.set(this.row, this.col, "");
    this.renderGrid();
  }

  submitGuess() {
    if (this.finished) {
      this.newRound();
      return;
    }

    const guess = this.grid.rowWord(this.row);
    if (guess.length !== this.wordLength || guess.includes(" ")) {
      this.reject("Fill the full row first.");
      return;
    }
    if (!this.dictionary.has(guess)) {
      this.reject(`${guess} is not in this mini dictionary.`);
      return;
    }

    const scored = this.grid.scoreGuess(this.row, this.answer);
    this.markRow(scored);
    this.turns.record({ type: "guess", guess, row: this.row });

    if (guess === this.answer) {
      this.winRound();
      return;
    }

    this.row += 1;
    this.col = 0;
    if (this.row >= this.maxRows) {
      this.loseRound();
      return;
    }
    this.setMessage("Good guess. Keep narrowing it down.");
  }

  handleAction(action) {
    if (action === "submit") {
      this.submitGuess();
    } else if (action === "delete") {
      this.deleteLetter();
    } else if (action === "new") {
      this.newRound();
    } else if (/^[A-Z]$/.test(String(action))) {
      this.addLetter(action);
    }
  }

  winRound() {
    const points = 120 + (this.maxRows - this.row - 1) * 20 + this.streak * 15;
    this.streak += 1;
    localStorage.setItem(`${this.storagePrefix}.streak`, String(this.streak));
    this.scoreboard.add(points);
    this.finished = true;
    this.audio.beep({ freq: 740, slideTo: 1180, duration: 0.16, type: "triangle" });
    this.renderStreak();
    this.setMessage(`Correct: ${this.answer}. +${points} points.`);
  }

  loseRound() {
    this.streak = 0;
    localStorage.setItem(`${this.storagePrefix}.streak`, "0");
    this.finished = true;
    this.audio.noise({ duration: 0.12 });
    this.renderStreak();
    this.setMessage(`The word was ${this.answer}. Try a new word.`);
  }

  reject(message) {
    this.audio.beep({ freq: 180, duration: 0.08 });
    this.setMessage(message);
    const row = this.root.querySelector(`[data-row="${this.row}"]`);
    row?.classList.remove("shake");
    requestAnimationFrame(() => row?.classList.add("shake"));
  }

  markRow(scored) {
    this.rowScores.set(this.row, scored);
    const row = this.root.querySelector(`[data-row="${this.row}"]`);
    scored.forEach((cell, index) => {
      row?.children[index]?.setAttribute("data-status", cell.status);
      const previous = this.keyStatuses.get(cell.letter);
      if (!previous || STATUS_RANK[cell.status] > STATUS_RANK[previous]) {
        this.keyStatuses.set(cell.letter, cell.status);
      }
    });
    this.updateKeyboardStatuses();
  }

  renderGrid() {
    const target = this.root.querySelector("#grid");
    target.innerHTML = "";
    for (let row = 0; row < this.maxRows; row += 1) {
      const rowEl = document.createElement("div");
      rowEl.className = "grid-row";
      rowEl.dataset.row = String(row);
      for (let col = 0; col < this.wordLength; col += 1) {
        const cell = document.createElement("div");
        cell.className = "grid-cell";
        cell.textContent = this.grid.get(row, col) || "";
        const status = this.rowScores.get(row)?.[col]?.status;
        if (status) {
          cell.dataset.status = status;
        }
        rowEl.appendChild(cell);
      }
      target.appendChild(rowEl);
    }
  }

  renderKeyboard() {
    const target = this.root.querySelector("#keyboard");
    target.innerHTML = "";
    KEY_ROWS.forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.className = "key-row";
      for (const letter of row) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "key";
        button.dataset.letter = letter;
        button.textContent = letter;
        button.addEventListener("click", () => this.handleAction(letter));
        rowEl.appendChild(button);
      }
      target.appendChild(rowEl);
    });

    if (!this.controlsBound) {
      this.root.querySelector("#enterButton").addEventListener("click", () => this.handleAction("submit"));
      this.root.querySelector("#deleteButton").addEventListener("click", () => this.handleAction("delete"));
      this.root.querySelector("#newRoundButton").addEventListener("click", () => this.handleAction("new"));
      this.controlsBound = true;
    }
    this.updateKeyboardStatuses();
  }

  updateKeyboardStatuses() {
    this.root.querySelectorAll(".key[data-letter]").forEach((button) => {
      const status = this.keyStatuses.get(button.dataset.letter);
      if (status) {
        button.dataset.status = status;
      } else {
        delete button.dataset.status;
      }
    });
  }

  renderStreak() {
    this.root.querySelector("#streak").textContent = String(this.streak);
  }

  setMessage(message) {
    this.root.querySelector("#message").textContent = message;
  }
}
