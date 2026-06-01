import { SolitaireKlondike, CARD_SYMBOLS } from "../../entities/SolitaireKlondike.js";
import { ScoreBoard } from "../../ui/ScoreBoard.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";

const SUITS = ["H", "D", "C", "S"];

/**
 * McSolitaireAssembly — Lego golden-assembly composition.
 *
 * Wires:
 *   - entities.solitaire-klondike (SolitaireKlondike, CARD_SYMBOLS) — state machine + undo
 *   - ui.scoreboard (ScoreBoard) — score + best
 *   - resources.swatches — palette tokens
 *
 * Selection-based interaction model: tap a card to select, tap a destination
 * (tableau column or foundation slot) to move. Stock tap = draw 3. Foundation
 * watermarks show empty suit slots. Mobile-friendly: no drag required.
 */
export class McSolitaireAssembly {
  constructor(options = {}) {
    this.rootSelector = options.root || "[data-web-component-example='solitaire-klondike']";
    this.root = document.querySelector(this.rootSelector);

    const swatch = options.swatch || getSwatchByID("retro-neon");
    if (this.root && swatch) {
      applySwatchVariables(this.root, swatch);
    }

    this.game = new SolitaireKlondike();
    this.scoreBoard = new ScoreBoard({
      target: options.hudTarget || "#hudMount",
      scoreLabel: "Score",
      highScoreLabel: "Best",
      storageKey: "solitaire-klondike.bestScore",
      persistHighScore: true
    });

    this.stockMount = document.querySelector(options.stockTarget || "#stockMount");
    this.wasteMount = document.querySelector(options.wasteTarget || "#wasteMount");
    this.foundationsMount = document.querySelector(options.foundationsTarget || "#foundationsMount");
    this.tableauMount = document.querySelector(options.tableauTarget || "#tableauMount");
    this.meta = document.querySelector(options.metaTarget || "#metaMount");
    this.message = document.querySelector(options.messageTarget || "#messageMount");
    this.newDealBtn = document.getElementById(options.newDealBtnId || "newDealBtn");
    this.undoBtn = document.getElementById(options.undoBtnId || "undoBtn");

    // Selection state: { kind: "waste" } | { kind: "tableau", col, idx } | { kind: "foundation", suit }
    this.selection = null;
  }

  start() {
    this.game.newGame();
    this.scoreBoard.setScore(0);
    this.selection = null;
    this._renderAll();
    this._bindInputs();
  }

  _bindInputs() {
    if (this._inputsBound) return;
    this._inputsBound = true;
    if (this.stockMount) this.stockMount.addEventListener("click", () => this._onStockClick());
    if (this.wasteMount) this.wasteMount.addEventListener("click", () => this._onWasteClick());
    if (this.foundationsMount) {
      this.foundationsMount.addEventListener("click", (e) => {
        const slot = e.target.closest("[data-foundation]");
        if (!slot) return;
        this._onFoundationClick(slot.dataset.foundation);
      });
    }
    if (this.tableauMount) {
      this.tableauMount.addEventListener("click", (e) => {
        const card = e.target.closest("[data-tableau-col]");
        if (!card) return;
        const col = +card.dataset.tableauCol;
        const idx = card.dataset.tableauIdx ? +card.dataset.tableauIdx : -1;
        this._onTableauClick(col, idx);
      });
    }
    // 2026-05-31: dblclick on the waste OR the top card of a tableau pile
    // promotes that card directly to its suit's foundation. The single-
    // click two-step (pick up + drop on foundation) is precise but slow;
    // double-tap is the muscle-memory shortcut every solitaire player
    // expects. Falls back silently when the card can't legally promote.
    if (this.wasteMount) {
      this.wasteMount.addEventListener("dblclick", () => this._dblTapPromoteWaste());
    }
    if (this.tableauMount) {
      this.tableauMount.addEventListener("dblclick", (e) => {
        const card = e.target.closest("[data-tableau-col]");
        if (!card) return;
        const col = +card.dataset.tableauCol;
        this._dblTapPromoteTableau(col);
      });
    }
    if (this.newDealBtn) this.newDealBtn.addEventListener("click", () => this.start());
    if (this.undoBtn) this.undoBtn.addEventListener("click", () => {
      if (this.game.undo()) {
        this.selection = null;
        this.scoreBoard.setScore(this.game.score);
        this._renderAll();
      }
    });
  }

  _onStockClick() {
    this.selection = null;
    this.game.draw();
    this.scoreBoard.setScore(this.game.score);
    this._renderAll();
  }

  _onWasteClick() {
    if (!this.game.wasteTop()) return;
    if (this.selection && this.selection.kind === "waste") {
      this.selection = null;
    } else {
      this.selection = { kind: "waste" };
    }
    this._renderAll();
  }

  _onFoundationClick(suit) {
    const sel = this.selection;
    if (!sel) {
      // Pick a foundation card up
      if (this.game.foundationTop(suit)) {
        this.selection = { kind: "foundation", suit };
      }
      this._renderAll();
      return;
    }
    const foundationIdx = SUITS.indexOf(suit);
    let result;
    if (sel.kind === "waste") {
      result = this.game.moveFromWaste("foundation", foundationIdx);
    } else if (sel.kind === "tableau") {
      result = this.game.moveFromTableau(sel.col, sel.idx, "foundation", foundationIdx);
    } else {
      result = { ok: false };
    }
    if (result.ok) {
      this.scoreBoard.setScore(this.game.score);
      if (this.game.isWon()) this._showMessage("🎉 You won! Tap New Deal to play again.");
    }
    this.selection = null;
    this._renderAll();
  }

  _onTableauClick(col, idx) {
    const sel = this.selection;
    if (!sel) {
      // Select a card from tableau
      const pile = this.game.tableau[col];
      if (pile.length === 0) return;
      const targetIdx = idx >= 0 ? idx : pile.length - 1;
      const card = pile[targetIdx];
      if (!card.faceUp) return;
      this.selection = { kind: "tableau", col, idx: targetIdx };
      this._renderAll();
      return;
    }
    let result;
    if (sel.kind === "waste") {
      result = this.game.moveFromWaste("tableau", col);
    } else if (sel.kind === "tableau") {
      result = this.game.moveFromTableau(sel.col, sel.idx, "tableau", col);
    } else if (sel.kind === "foundation") {
      result = this.game.moveFromFoundation(sel.suit, "tableau", col);
    }
    if (result && result.ok) {
      this.scoreBoard.setScore(this.game.score);
    }
    this.selection = null;
    this._renderAll();
  }

  // 2026-05-31: double-tap promotion helpers. Send the waste-top or the
  // top card of a tableau column directly to its suit's foundation when
  // legal. Clears any single-click selection first so the player can
  // double-tap without first deselecting whatever was previously selected.
  _dblTapPromoteWaste() {
    this.selection = null;
    const card = this.game.wasteTop();
    if (!card) return;
    const foundationIdx = SUITS.indexOf(card.suit);
    if (foundationIdx < 0) return;
    if (!this.game.canStackFoundation(card, card.suit)) {
      this._renderAll();
      return;
    }
    const result = this.game.moveFromWaste("foundation", foundationIdx);
    if (result && result.ok) {
      this.scoreBoard.setScore(this.game.score);
      if (this.game.isWon()) this._showMessage("🎉 You won! Tap New Deal to play again.");
    }
    this._renderAll();
  }

  _dblTapPromoteTableau(col) {
    this.selection = null;
    const pile = this.game.tableau[col];
    if (!pile || pile.length === 0) return;
    const topIdx = pile.length - 1;
    const card = pile[topIdx];
    if (!card || !card.faceUp) return;
    const foundationIdx = SUITS.indexOf(card.suit);
    if (foundationIdx < 0) return;
    if (!this.game.canStackFoundation(card, card.suit)) {
      this._renderAll();
      return;
    }
    const result = this.game.moveFromTableau(col, topIdx, "foundation", foundationIdx);
    if (result && result.ok) {
      this.scoreBoard.setScore(this.game.score);
      if (this.game.isWon()) this._showMessage("🎉 You won! Tap New Deal to play again.");
    }
    this._renderAll();
  }

  _renderAll() {
    this._renderStockWaste();
    this._renderFoundations();
    this._renderTableau();
    this._updateMeta();
    if (this.game.isWon()) this._showMessage("🎉 You won! Tap New Deal to play again.");
    else this._hideMessage();
  }

  _renderStockWaste() {
    if (this.stockMount) {
      this.stockMount.innerHTML = "";
      if (this.game.stock.length > 0) {
        this.stockMount.appendChild(this._cardBackEl());
      } else {
        const empty = document.createElement("div");
        empty.className = "card-empty";
        empty.textContent = "↻";
        this.stockMount.appendChild(empty);
      }
    }
    if (this.wasteMount) {
      this.wasteMount.innerHTML = "";
      const top = this.game.wasteTop();
      if (top) {
        const el = this._cardEl(top);
        if (this.selection?.kind === "waste") el.classList.add("selected");
        this.wasteMount.appendChild(el);
      } else {
        const empty = document.createElement("div");
        empty.className = "card-empty";
        this.wasteMount.appendChild(empty);
      }
    }
  }

  _renderFoundations() {
    if (!this.foundationsMount) return;
    this.foundationsMount.innerHTML = "";
    for (const suit of SUITS) {
      const slot = document.createElement("div");
      slot.className = "card-slot foundation";
      slot.dataset.foundation = suit;
      const top = this.game.foundationTop(suit);
      if (top) {
        const el = this._cardEl(top);
        if (this.selection?.kind === "foundation" && this.selection.suit === suit) {
          el.classList.add("selected");
        }
        slot.appendChild(el);
      } else {
        const watermark = document.createElement("div");
        watermark.className = "card-watermark";
        watermark.style.color = CARD_SYMBOLS[suit].color;
        watermark.textContent = CARD_SYMBOLS[suit].char;
        slot.appendChild(watermark);
      }
      this.foundationsMount.appendChild(slot);
    }
  }

  _renderTableau() {
    if (!this.tableauMount) return;
    this.tableauMount.innerHTML = "";
    for (let col = 0; col < 7; col += 1) {
      const colEl = document.createElement("div");
      colEl.className = "tableau-col";
      colEl.dataset.tableauCol = String(col);
      const pile = this.game.tableau[col];
      if (pile.length === 0) {
        const empty = document.createElement("div");
        empty.className = "card-empty tableau-empty";
        colEl.appendChild(empty);
      } else {
        for (let idx = 0; idx < pile.length; idx += 1) {
          const card = pile[idx];
          const el = card.faceUp ? this._cardEl(card) : this._cardBackEl();
          el.dataset.tableauCol = String(col);
          el.dataset.tableauIdx = String(idx);
          if (this.selection?.kind === "tableau" && this.selection.col === col && idx >= this.selection.idx) {
            el.classList.add("selected");
          }
          el.style.marginTop = idx === 0 ? "0" : "-30px";
          colEl.appendChild(el);
        }
      }
      this.tableauMount.appendChild(colEl);
    }
  }

  _cardEl(card) {
    const el = document.createElement("div");
    el.className = "card face-up";
    const sym = CARD_SYMBOLS[card.suit];
    el.style.color = sym.color;
    el.innerHTML = `<span class="rank">${SolitaireKlondike.rankName(card.rank)}</span><span class="suit">${sym.char}</span>`;
    return el;
  }

  _cardBackEl() {
    const el = document.createElement("div");
    el.className = "card face-down";
    return el;
  }

  _updateMeta() {
    if (!this.meta) return;
    this.meta.textContent = `Moves ${this.game.moves}  •  Stock ${this.game.stock.length}`;
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
