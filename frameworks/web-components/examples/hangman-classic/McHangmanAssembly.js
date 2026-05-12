import { HangmanGame, HANGMAN_DEFAULT_WORDS } from "../../entities/HangmanGame.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";

/**
 * McHangmanAssembly — Lego golden-assembly composition.
 *
 * Wires:
 *   - entities.hangman-game (HangmanGame, HANGMAN_DEFAULT_WORDS) — state machine
 *   - ui.scoreboard (ScoreBoard) — rounds won + best
 *   - resources.swatches — palette tokens
 *
 * Draws gallows scaffold + figure on canvas (one limb per wrong guess), renders
 * dash placeholders for the secret word, and a tappable A-Z keyboard.
 */
export class McHangmanAssembly {
  constructor(options = {}) {
    this.rootSelector = options.root || "[data-web-component-example='hangman-classic']";
    this.root = document.querySelector(this.rootSelector);

    const swatch = options.swatch || getSwatchByID("retro-neon");
    if (this.root && swatch) {
      applySwatchVariables(this.root, swatch);
    }

    this.game = new HangmanGame({ maxWrong: 6 });
    this.scoreBoard = new ScoreBoard({
      target: options.hudTarget || "#hudMount",
      scoreLabel: "Won",
      highScoreLabel: "Best Streak",
      storageKey: "hangman-classic.bestStreak",
      persistHighScore: true
    });

    this.gallowsCanvas = document.getElementById(options.gallowsCanvasId || "gallowsCanvas");
    this.gallowsCtx = this.gallowsCanvas?.getContext("2d") ?? null;
    this.wordMount = document.querySelector(options.wordTarget || "#wordMount");
    this.keyboardMount = document.querySelector(options.keyboardTarget || "#keyboardMount");
    this.message = document.querySelector(options.messageTarget || "#messageMount");
    this.meta = document.querySelector(options.metaTarget || "#metaMount");
    this.restartBtn = document.getElementById(options.restartButtonId || "restartBtn");

    this.wordsList = HANGMAN_DEFAULT_WORDS;
    this.roundsWon = 0;
    this.streak = 0;
  }

  start() {
    this._renderKeyboard();
    this._bindInputs();
    this._newRound();
  }

  _newRound() {
    const w = this.wordsList[Math.floor(Math.random() * this.wordsList.length)];
    this.game.newRound(w);
    this._renderWord();
    this._renderGallows();
    this._renderKeyboard();
    this._hideMessage();
    this._updateMeta();
  }

  _bindInputs() {
    if (this._inputsBound) return;
    this._inputsBound = true;

    if (this.keyboardMount) {
      this.keyboardMount.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-letter]");
        if (!btn || btn.disabled) return;
        this._onGuess(btn.dataset.letter);
      });
    }

    window.addEventListener("keydown", (e) => {
      const k = e.key.toUpperCase();
      if (k >= "A" && k <= "Z" && k.length === 1) {
        this._onGuess(k);
      }
    });

    if (this.restartBtn) {
      this.restartBtn.addEventListener("click", () => this._newRound());
    }
  }

  _onGuess(letter) {
    if (this.game.state !== "playing") return;
    const result = this.game.guessLetter(letter);
    this._renderWord();
    this._renderGallows();
    this._renderKeyboard();
    this._updateMeta();
    if (result.state === "won") {
      this.roundsWon += 1;
      this.streak += 1;
      this.scoreBoard.setScore(this.streak);
      this._showMessage(`You got it! Word was "${this.game.target}".`);
    } else if (result.state === "lost") {
      this.streak = 0;
      this.scoreBoard.setScore(this.streak);
      this._showMessage(`Out of guesses. Word was "${this.game.target}".`);
    }
  }

  _renderWord() {
    if (!this.wordMount) return;
    this.wordMount.textContent = this.game.maskedWord().split("").join(" ");
  }

  _renderKeyboard() {
    if (!this.keyboardMount) return;
    if (this.keyboardMount.childElementCount === 0) {
      for (let code = 65; code <= 90; code += 1) {
        const letter = String.fromCharCode(code);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "key";
        btn.dataset.letter = letter;
        btn.textContent = letter;
        this.keyboardMount.appendChild(btn);
      }
    }
    for (const btn of this.keyboardMount.querySelectorAll("[data-letter]")) {
      const letter = btn.dataset.letter;
      const guessed = this.game.guessed.has(letter);
      btn.disabled = guessed || this.game.state !== "playing";
      btn.classList.toggle("guessed", guessed);
      btn.classList.toggle("hit", guessed && this.game.target.includes(letter));
    }
  }

  _renderGallows() {
    if (!this.gallowsCtx || !this.gallowsCanvas) return;
    const ctx = this.gallowsCtx;
    const W = this.gallowsCanvas.width;
    const H = this.gallowsCanvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = "#fde047";
    ctx.lineWidth = 3;
    // Gallows scaffold
    ctx.beginPath();
    ctx.moveTo(40, H - 10); ctx.lineTo(W - 40, H - 10); // ground
    ctx.moveTo(80, H - 10); ctx.lineTo(80, 20);         // post
    ctx.lineTo(180, 20);                                 // arm
    ctx.lineTo(180, 50);                                 // rope
    ctx.stroke();
    // Body parts per wrong count (6 limbs: head, body, l-arm, r-arm, l-leg, r-leg)
    ctx.strokeStyle = "#f87171";
    const wc = this.game.wrongCount;
    if (wc >= 1) {
      ctx.beginPath(); ctx.arc(180, 70, 18, 0, Math.PI * 2); ctx.stroke();
    }
    if (wc >= 2) {
      ctx.beginPath(); ctx.moveTo(180, 88); ctx.lineTo(180, 150); ctx.stroke();
    }
    if (wc >= 3) {
      ctx.beginPath(); ctx.moveTo(180, 100); ctx.lineTo(155, 130); ctx.stroke();
    }
    if (wc >= 4) {
      ctx.beginPath(); ctx.moveTo(180, 100); ctx.lineTo(205, 130); ctx.stroke();
    }
    if (wc >= 5) {
      ctx.beginPath(); ctx.moveTo(180, 150); ctx.lineTo(160, 185); ctx.stroke();
    }
    if (wc >= 6) {
      ctx.beginPath(); ctx.moveTo(180, 150); ctx.lineTo(200, 185); ctx.stroke();
    }
  }

  _updateMeta() {
    if (!this.meta) return;
    this.meta.textContent = `Wrong ${this.game.wrongCount}/${this.game.maxWrong}  •  Won ${this.roundsWon}`;
  }

  _showMessage(text) {
    if (!this.message) return;
    this.message.textContent = text;
    this.message.classList.remove("is-hidden");
  }

  _hideMessage() {
    if (!this.message) return;
    this.message.classList.add("is-hidden");
  }
}
