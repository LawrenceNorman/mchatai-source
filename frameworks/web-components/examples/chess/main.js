import { ChessGame } from "./ChessGame.js";
import { MiniHeader } from "../../ui/MiniHeader.js";
import { ChessRules } from "../../entities/ChessRules.js";
import { ChessAI } from "../../entities/ChessAI.js";

// Defensive: MiniHeader is optional. If the inline assembler dropped it,
// the [data-mini-header] container stays empty and the game still mounts.
if (typeof MiniHeader !== "undefined" && MiniHeader && typeof MiniHeader.mount === "function") {
  MiniHeader.mount(document.querySelector("[data-mini-header]"), { title: "Chess", subtitle: "Select a piece, then a highlighted legal square." });
}

const game = new ChessGame({
  boardTarget: "#board",
  turnTarget: "#turn",
  movesTarget: "#moves",
  capturedTarget: "#captured",
  messageTarget: "#message",
  resetButton: "#resetButton",
  restartHostTarget: "[data-app]",
  rankCardHostTarget: "#rankCard",
  humanColor: "white",
  // Depth 3 is the recommended default (wisdom rule bg-chess-ai-default-depth-three):
  // depth 2 played at beginner level; depth 3 with PST + capture-first move
  // ordering plays competently and still moves in under ~1s on typical hardware.
  ai: new ChessAI({ rules: new ChessRules(), depth: 3 })
});

game.start();
globalThis.mchatChessExample = game;
