import { ChessGame } from "./ChessGame.js";
import { MiniHeader } from "../../ui/MiniHeader.js";
import { ChessRules } from "../../entities/ChessRules.js";
import { ChessAI } from "../../entities/ChessAI.js";

MiniHeader.mount(document.querySelector("[data-mini-header]"), { title: "Chess", subtitle: "Select a piece, then a highlighted legal square." });

const game = new ChessGame({
  boardTarget: "#board",
  turnTarget: "#turn",
  movesTarget: "#moves",
  capturedTarget: "#captured",
  messageTarget: "#message",
  resetButton: "#resetButton",
  humanColor: "white",
  ai: new ChessAI({ rules: new ChessRules(), depth: 2 })
});

game.start();
globalThis.mchatChessExample = game;
