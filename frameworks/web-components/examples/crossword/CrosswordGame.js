import { TurnBasedManager } from "../../core/TurnBasedManager.js";
import { GridBoard } from "../../entities/GridBoard.js";
import { KeyboardInput } from "../../ui/KeyboardInput.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { AudioManager } from "../../resources/AudioManager.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";

const PUZZLE = [
  ["C", "O", "D", "E", "#"],
  ["A", "#", "A", "#", "A"],
  ["N", "O", "T", "E", "S"],
  ["V", "#", "A", "#", "I"],
  ["A", "G", "E", "N", "T"]
];
const CLUES = {
  across: [
    [1, "What Lego blocks help produce"],
    [3, "Things a piano records here"],
    [5, "Builder that can use this catalog"]
  ],
  down: [
    [1, "Canvas target for mini-apps"],
    [2, "Information for app logic"],
    [4, "Artificial intelligence, briefly"]
  ]
};

function crosswordQuery(root, selector) {
  return root.querySelector(selector);
}

export class CrosswordGame {
  constructor(options = {}) {
    this.root = options.root || document;
    this.board = new GridBoard({ rows: 5, cols: 5, fill: "" });
    this.turns = new TurnBasedManager({ players: ["solver"], phase: "solving" });
    this.audio = new AudioManager({ masterVolume: 0.045 });
    this.scoreboard = new ScoreBoard({
      target: "#scoreboard",
      storageKey: "mchatai.crossword.best",
      scoreLabel: "Score",
      highScoreLabel: "Best"
    });
    this.keyboard = new KeyboardInput({
      target: window,
      onText: (letter) => this.enterLetter(letter),
      onAction: (action) => this.handleAction(action)
    }).bindMany({
      backspace: "delete",
      delete: "delete",
      arrowright: "right",
      arrowleft: "left",
      arrowup: "up",
      arrowdown: "down"
    });
    this.selected = { row: 0, col: 0 };
    this.startedAt = Date.now();
    this.timerEl = crosswordQuery(this.root, "#timer");
    this.message = crosswordQuery(this.root, "#message");
    this.cells = [];
  }

  start() {
    applySwatchVariables(document.documentElement, getSwatchByID("vector-noir"));
    this.renderClues();
    this.renderGrid();
    crosswordQuery(this.root, "#checkButton").addEventListener("click", () => this.check());
    crosswordQuery(this.root, "#restartButton").addEventListener("click", () => this.reset());
    window.setInterval(() => this.renderTimer(), 1000);
  }

  renderGrid() {
    const grid = crosswordQuery(this.root, "#grid");
    grid.innerHTML = "";
    this.cells = [];
    PUZZLE.forEach((row, rowIndex) => {
      row.forEach((answer, colIndex) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "cell";
        button.dataset.block = String(answer === "#");
        button.dataset.row = String(rowIndex);
        button.dataset.col = String(colIndex);
        if (answer !== "#" && this.clueNumber(rowIndex, colIndex)) {
          button.innerHTML = `<small>${this.clueNumber(rowIndex, colIndex)}</small><span></span>`;
        } else {
          button.innerHTML = "<span></span>";
        }
        button.addEventListener("click", () => this.select(rowIndex, colIndex));
        grid.appendChild(button);
        this.cells.push(button);
      });
    });
    this.renderCells();
  }

  clueNumber(row, col) {
    const starts = { "0,0": 1, "0,2": 2, "1,4": 4, "2,0": 3, "4,0": 5 };
    return starts[`${row},${col}`] || "";
  }

  renderClues() {
    const across = crosswordQuery(this.root, "#acrossClues");
    const down = crosswordQuery(this.root, "#downClues");
    across.innerHTML = "";
    down.innerHTML = "";
    CLUES.across.forEach(([number, clue]) => across.appendChild(this.clueItem(number, clue)));
    CLUES.down.forEach(([number, clue]) => down.appendChild(this.clueItem(number, clue)));
  }

  clueItem(number, clue) {
    const item = document.createElement("li");
    item.value = number;
    item.textContent = clue;
    return item;
  }

  select(row, col) {
    if (PUZZLE[row]?.[col] === "#") {
      return;
    }
    this.selected = { row, col };
    this.renderCells();
  }

  enterLetter(letter) {
    const value = String(letter).toUpperCase();
    if (!/^[A-Z]$/.test(value)) {
      return;
    }
    this.board.set(this.selected.row, this.selected.col, value);
    this.move(0, 1);
    this.audio.beep({ freq: 520, duration: 0.04, type: "triangle" });
    this.renderCells();
  }

  handleAction(action) {
    if (action === "delete") {
      this.board.set(this.selected.row, this.selected.col, "");
      this.move(0, -1);
    }
    if (action === "right") this.move(0, 1);
    if (action === "left") this.move(0, -1);
    if (action === "up") this.move(-1, 0);
    if (action === "down") this.move(1, 0);
    this.renderCells();
  }

  move(dr, dc) {
    let row = this.selected.row;
    let col = this.selected.col;
    for (let i = 0; i < 8; i += 1) {
      row = Math.max(0, Math.min(4, row + dr));
      col = Math.max(0, Math.min(4, col + dc));
      if (PUZZLE[row][col] !== "#") {
        this.select(row, col);
        return;
      }
    }
  }

  check() {
    let correct = 0;
    let total = 0;
    PUZZLE.forEach((row, rowIndex) => {
      row.forEach((answer, colIndex) => {
        if (answer === "#") return;
        total += 1;
        if (this.board.get(rowIndex, colIndex) === answer) correct += 1;
      });
    });
    this.scoreboard.setScore(correct * 10);
    this.message.textContent = correct === total ? "Solved." : `${correct}/${total} letters correct.`;
    this.renderCells();
  }

  reset() {
    this.board = new GridBoard({ rows: 5, cols: 5, fill: "" });
    this.selected = { row: 0, col: 0 };
    this.startedAt = Date.now();
    this.scoreboard.reset();
    this.message.textContent = "Click a cell and type.";
    this.renderCells();
  }

  renderCells() {
    this.cells.forEach((cell) => {
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      cell.dataset.selected = String(row === this.selected.row && col === this.selected.col);
      if (PUZZLE[row][col] !== "#") {
        cell.querySelector("span").textContent = this.board.get(row, col) || "";
      }
    });
  }

  renderTimer() {
    const seconds = Math.floor((Date.now() - this.startedAt) / 1000);
    const minutes = Math.floor(seconds / 60);
    this.timerEl.textContent = `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
  }
}
