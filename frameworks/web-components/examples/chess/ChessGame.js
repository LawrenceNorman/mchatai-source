import { TurnBasedManager } from "../../core/TurnBasedManager.js";
import { Board8x8 } from "../../entities/Board8x8.js";
import { ChessRules } from "../../entities/ChessRules.js";
import { AudioManager } from "../../resources/AudioManager.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";

const PIECES = {
  white: {
    king: "♔",
    queen: "♕",
    rook: "♖",
    bishop: "♗",
    knight: "♘",
    pawn: "♙"
  },
  black: {
    king: "♚",
    queen: "♛",
    rook: "♜",
    bishop: "♝",
    knight: "♞",
    pawn: "♟"
  }
};

function chessTarget(target) {
  return typeof target === "string" ? document.querySelector(target) : target;
}

function colorName(color) {
  return color === "white" ? "White" : "Black";
}

export class ChessGame {
  constructor(options = {}) {
    this.boardEl = chessTarget(options.boardTarget);
    this.turnEl = chessTarget(options.turnTarget);
    this.movesEl = chessTarget(options.movesTarget);
    this.capturedEl = chessTarget(options.capturedTarget);
    this.messageEl = chessTarget(options.messageTarget);
    this.resetButton = chessTarget(options.resetButton);
    this.board = new Board8x8();
    this.rules = new ChessRules();
    this.turns = new TurnBasedManager({ players: ["white", "black"], phase: "playing" });
    this.audio = new AudioManager({ masterVolume: 0.045 });
    this.selected = null;
    this.legalMoves = [];
    this.moveCount = 0;
    this.capturedCount = 0;
    this.humanColor = options.humanColor || "white";
    this.ai = options.ai || null;
    this.aiThinkDelay = typeof options.aiThinkDelay === "number" ? options.aiThinkDelay : 350;
    this._aiPending = false;

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
    this.rules.setupStandardBoard(this.board);
    this.turns.reset({ phase: "playing" });
    this.selected = null;
    this.legalMoves = [];
    this.moveCount = 0;
    this.capturedCount = 0;
    this._aiPending = false;
    this.setMessage("White to move.");
    this.render();
    // If the AI plays White (human chose Black), kick off its first move.
    this._maybeScheduleAIMove();
  }

  handleSquare(row, col) {
    if (this.turns.phase !== "playing") {
      return;
    }
    if (this.ai && this.turns.currentPlayer !== this.humanColor) {
      // It's the AI's turn — clicks are ignored. The AI move is scheduled by applyMove().
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
      this.setMessage(`${colorName(currentColor)} selected ${piece.type} on ${this.board.cellToAlgebraic(row, col)}.`);
      this.audio.beep({ freq: 360, duration: 0.05, type: "triangle" });
      this.render();
      return;
    }

    this.selected = null;
    this.legalMoves = [];
    this.setMessage(`Select a ${colorName(currentColor).toLowerCase()} piece.`);
    this.render();
  }

  applyMove(move) {
    const currentColor = this.turns.currentPlayer;
    const nextColor = currentColor === "white" ? "black" : "white";
    const from = this.board.cellToAlgebraic(move.from.row, move.from.col);
    const to = this.board.cellToAlgebraic(move.to.row, move.to.col);
    const captured = Boolean(move.capture);
    this.rules.applyMove(this.board, move);
    this.turns.record({ type: "move", from, to, capture: captured });
    this.moveCount += 1;
    this.capturedCount += captured ? 1 : 0;
    this.selected = null;
    this.legalMoves = [];

    if (this.rules.isCheckmate(this.board, nextColor)) {
      this.turns.setPhase("checkmate");
      this.setMessage(`Checkmate. ${colorName(currentColor)} wins.`);
      this.audio.beep({ freq: 520, slideTo: 920, duration: 0.18, type: "triangle" });
    } else if (this.rules.isStalemate(this.board, nextColor)) {
      this.turns.setPhase("stalemate");
      this.setMessage("Stalemate.");
      this.audio.beep({ freq: 220, duration: 0.14, type: "sine" });
    } else {
      this.turns.nextTurn();
      const check = this.rules.isKingInCheck(this.board, nextColor) ? " Check." : "";
      this.setMessage(`${colorName(nextColor)} to move.${check}`);
      this.audio.beep({ freq: captured ? 480 : 300, duration: 0.07, type: "square" });
    }
    this.render();
    this._maybeScheduleAIMove();
  }

  _maybeScheduleAIMove() {
    if (!this.ai) return;
    if (this.turns.phase !== "playing") return;
    if (this.turns.currentPlayer === this.humanColor) return;
    if (this._aiPending) return;
    this._aiPending = true;
    setTimeout(() => {
      this._aiPending = false;
      // Re-check phase (user may have hit Reset during the timeout).
      if (this.turns.phase !== "playing" || this.turns.currentPlayer === this.humanColor) return;
      const move = this.ai.pickMove(this.board, this.turns.currentPlayer);
      if (!move) return;
      this.applyMove(move);
    }, this.aiThinkDelay);
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
        square.setAttribute("aria-label", this.squareLabel(row, col, piece));

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
          const span = document.createElement("span");
          span.className = `piece-${piece.color}`;
          span.textContent = PIECES[piece.color]?.[piece.type] || "?";
          square.appendChild(span);
        }
        const coords = document.createElement("span");
        coords.className = "coords";
        coords.textContent = this.board.cellToAlgebraic(row, col);
        square.appendChild(coords);
        this.boardEl.appendChild(square);
      }
    }

    if (this.turnEl) {
      this.turnEl.textContent = colorName(this.turns.currentPlayer);
    }
    if (this.movesEl) {
      this.movesEl.textContent = String(this.moveCount);
    }
    if (this.capturedEl) {
      this.capturedEl.textContent = String(this.capturedCount);
    }
  }

  squareLabel(row, col, piece) {
    const square = this.board.cellToAlgebraic(row, col);
    if (!piece) {
      return `${square}, empty`;
    }
    return `${square}, ${piece.color} ${piece.type}`;
  }

  setMessage(message) {
    if (this.messageEl) {
      this.messageEl.textContent = message;
    }
  }
}
