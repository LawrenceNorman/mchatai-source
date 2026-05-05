// CloudOpponent — drop-in opponent that calls window.mChatAI.cloud.llm() for
// move selection. Same `pickMove(board, color)` API as ChessAI / CheckersAI /
// SimpleOpponent, so any wired-up game can swap difficulty without surgery.
//
// Wisdom rule: bg-007 (board games should expose a Strong-AI difficulty toggle
// backed by cloud LLM, with token-cost badge and graceful fallback).
//
// Usage:
//   import { CloudOpponent } from "../../entities/CloudOpponent.js";
//   import { ChessAI } from "../../entities/ChessAI.js";
//   const ai = new CloudOpponent({
//     rules,
//     fallback: new ChessAI({ rules }),  // any AI with pickMove(board, color)
//     promptBuilder: ({ board, color }) => `You are a chess grandmaster. ...`,
//     parseMove: (text, board, rules, color) => /* turn the LLM's text into a move */,
//     timeoutMs: 4000,
//     tokenCostLabel: "1 token / move"
//   });
//   const move = await ai.pickMove(board, color);  // ← async! callers must await
//
// The opponent NEVER throws. On any error (cloud unavailable, parse failure,
// timeout, token budget exhausted) it logs a warning and returns the fallback
// AI's move. If even the fallback fails, returns null.

const DEFAULT_TIMEOUT_MS = 4500;

function bridge() {
  return globalThis?.window?.mChatAI?.cloud || null;
}

function withTimeout(promise, ms) {
  if (!promise || typeof promise.then !== "function") return promise;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("CloudOpponent timeout")), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

export class CloudOpponent {
  constructor(options = {}) {
    if (!options.fallback || typeof options.fallback.pickMove !== "function") {
      throw new Error("CloudOpponent requires { fallback } with pickMove(board, color)");
    }
    this.rules = options.rules || null;
    this.fallback = options.fallback;
    this.promptBuilder = typeof options.promptBuilder === "function" ? options.promptBuilder : null;
    this.parseMove = typeof options.parseMove === "function" ? options.parseMove : null;
    this.timeoutMs = typeof options.timeoutMs === "number" ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
    this.tokenCostLabel = options.tokenCostLabel || "⚡ 1 token";
    this.onError = typeof options.onError === "function" ? options.onError : null;
    this.onFallback = typeof options.onFallback === "function" ? options.onFallback : null;
  }

  /**
   * Async equivalent of ChessAI.pickMove. Returns the parsed move or null.
   * NEVER throws. Falls back to local AI on any failure.
   */
  async pickMove(board, color) {
    const cloud = bridge();
    if (!cloud || typeof cloud.llm !== "function" || !this.promptBuilder || !this.parseMove) {
      return this.fallback.pickMove(board, color);
    }
    if (typeof cloud.isAvailable === "function" && !cloud.isAvailable()) {
      this._reportFallback("cloud-unavailable");
      return this.fallback.pickMove(board, color);
    }
    let prompt;
    try {
      prompt = this.promptBuilder({ board, color, rules: this.rules });
    } catch (err) {
      this._reportError("prompt-builder", err);
      return this.fallback.pickMove(board, color);
    }
    let text;
    try {
      text = await withTimeout(Promise.resolve(cloud.llm({ prompt })), this.timeoutMs);
    } catch (err) {
      this._reportError("cloud-llm", err);
      return this.fallback.pickMove(board, color);
    }
    if (typeof text !== "string" || text.trim().length === 0) {
      this._reportFallback("empty-response");
      return this.fallback.pickMove(board, color);
    }
    let move;
    try {
      move = this.parseMove(text, board, this.rules, color);
    } catch (err) {
      this._reportError("parse-move", err);
      return this.fallback.pickMove(board, color);
    }
    if (!move) {
      this._reportFallback("parse-empty");
      return this.fallback.pickMove(board, color);
    }
    return move;
  }

  _reportError(stage, err) {
    if (typeof console !== "undefined") {
      console.warn(`[CloudOpponent] ${stage} error — falling back`, err);
    }
    if (this.onError) {
      try { this.onError(stage, err); } catch (_) {}
    }
    if (this.onFallback) {
      try { this.onFallback(stage); } catch (_) {}
    }
  }

  _reportFallback(reason) {
    if (this.onFallback) {
      try { this.onFallback(reason); } catch (_) {}
    }
  }
}
