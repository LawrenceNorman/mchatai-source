import { TurnBasedManager } from "../../core/TurnBasedManager.js";
import { Board8x8 } from "../../entities/Board8x8.js";
import { CheckersRules } from "../../entities/CheckersRules.js";
import { AudioManager } from "../../resources/AudioManager.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";

function checkersTarget(target) {
  return typeof target === "string" ? document.querySelector(target) : target;
}

function titleColor(color) {
  return color === "red" ? "Red" : "Black";
}

export class CheckersGame {
  constructor(options = {}) {
    this.boardEl = checkersTarget(options.boardTarget);
    this.turnEl = checkersTarget(options.turnTarget);
    this.movesEl = checkersTarget(options.movesTarget);
    this.capturedEl = checkersTarget(options.capturedTarget);
    this.messageEl = checkersTarget(options.messageTarget);
    this.resetButton = checkersTarget(options.resetButton);
    this.board = new Board8x8();
    this.rules = new CheckersRules();
    this.turns = new TurnBasedManager({ players: ["red", "black"], phase: "playing" });
    this.audio = new AudioManager({ masterVolume: 0.045 });
    this.selected = null;
    this.legalMoves = [];
    this.moveCount = 0;
    this.capturedCount = 0;

    applySwatchVariables(document.documentElement, getSwatchByID("retro-neon"));
    this.bindControls();
    this.reset();
  }

  start() {
    this.render();
    return this;
  }

  bindControls() {
    this.boardEl?.addEventListener("click", (event) => {
      const square = event.target.closest("[data-row][data-col]");
      if (!square) {
        return;
      }
      this.handleSquare(Number(square.dataset.row), Number(square.dataset.col));
    });
    this.boardEl?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      const square = event.target.closest("[data-row][data-col]");
      if (!square) {
        return;
      }
      event.preventDefault();
      this.handleSquare(Number(square.dataset.row), Number(square.dataset.col));
    });
    this.resetButton?.addEventListener("click", () => this.reset());
  }

  reset() {
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        this.board.set(row, col, null);
        if (this.board.isDarkSquare(row, col) && row < 3) {
          this.board.set(row, col, { color: "black", king: false });
        }
        if (this.board.isDarkSquare(row, col) && row > 4) {
          this.board.set(row, col, { color: "red", king: false });
        }
      }
    }
    this.turns.reset({ phase: "playing" });
    this.selected = null;
    this.legalMoves = [];
    this.moveCount = 0;
    this.capturedCount = 0;
    this.setMessage("Red to move.");
    this.render();
  }

  handleSquare(row, col) {
    if (this.turns.phase !== "playing") {
      return;
    }

    const piece = this.board.get(row, col);
    const currentColor = this.turns.currentPlayer;
    const selectedMove = this.legalMoves.find((move) => move.to.row === row && move.to.col === col);
    if (selectedMove) {
      this.applyMove(selectedMove);
      return;
    }

    if (piece?.color === currentColor) {
      this.selected = { row, col };
      this.legalMoves = this.rules.legalMoves(this.board, row, col);
      this.setMessage(`${titleColor(currentColor)} selected a ${piece.king ? "king" : "piece"}.`);
      this.audio.beep({ freq: 340, duration: 0.05, type: "triangle" });
      this.render();
      return;
    }

    this.selected = null;
    this.legalMoves = [];
    this.setMessage(`Select a ${titleColor(currentColor).toLowerCase()} piece.`);
    this.render();
  }

  applyMove(move) {
    const currentColor = this.turns.currentPlayer;
    const nextColor = currentColor === "red" ? "black" : "red";
    const captured = Boolean(move.capture);
    this.rules.applyMove(this.board, move);
    this.turns.record({ type: "move", from: move.from, to: move.to, capture: captured });
    this.moveCount += 1;
    this.capturedCount += captured ? 1 : 0;
    this.selected = null;
    this.legalMoves = [];

    if (this.availableMoves(nextColor).length === 0) {
      this.turns.setPhase("gameover");
      this.setMessage(`${titleColor(currentColor)} wins.`);
      this.audio.beep({ freq: 520, slideTo: 880, duration: 0.18, type: "triangle" });
    } else {
      this.turns.nextTurn();
      this.setMessage(`${titleColor(nextColor)} to move.`);
      this.audio.beep({ freq: captured ? 480 : 300, duration: 0.07, type: "square" });
    }
    this.render();
  }

  availableMoves(color) {
    const moves = [];
    this.board.forEach((piece, row, col) => {
      if (piece?.color === color) {
        moves.push(...this.rules.legalMoves(this.board, row, col));
      }
    });
    return moves;
  }

  render() {
    if (!this.boardEl) {
      return;
    }
    this.boardEl.innerHTML = "";
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = this.board.get(row, col);
        const square = document.createElement("button");
        square.type = "button";
        square.className = `square ${this.board.isDarkSquare(row, col) ? "dark" : "light"}`;
        square.dataset.row = String(row);
        square.dataset.col = String(col);
        square.setAttribute("role", "gridcell");
        square.setAttribute("aria-label", piece ? `${piece.color} ${piece.king ? "king" : "piece"}` : "empty square");

        if (this.selected?.row === row && this.selected?.col === col) {
          square.classList.add("selected");
        }
        const legal = this.legalMoves.find((move) => move.to.row === row && move.to.col === col);
        if (legal) {
          square.classList.add("legal");
          if (legal.capture) {
            square.classList.add("capture");
          }
        }
        if (piece) {
          const checker = document.createElement("span");
          checker.className = `piece ${piece.color}${piece.king ? " king" : ""}`;
          square.appendChild(checker);
        }
        this.boardEl.appendChild(square);
      }
    }
    if (this.turnEl) {
      this.turnEl.textContent = titleColor(this.turns.currentPlayer);
    }
    if (this.movesEl) {
      this.movesEl.textContent = String(this.moveCount);
    }
    if (this.capturedEl) {
      this.capturedEl.textContent = String(this.capturedCount);
    }
  }

  setMessage(message) {
    if (this.messageEl) {
      this.messageEl.textContent = message;
    }
  }
}
