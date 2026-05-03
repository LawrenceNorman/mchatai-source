import { CheckersGame } from "./CheckersGame.js";
import { MiniHeader } from "../../ui/MiniHeader.js";
import { CheckersRules } from "../../entities/CheckersRules.js";
import { CheckersAI } from "../../entities/CheckersAI.js";

MiniHeader.mount(document.querySelector("[data-mini-header]"), { title: "Checkers", subtitle: "Select a piece, then a highlighted diagonal move." });

const game = new CheckersGame({
  boardTarget: "#board",
  turnTarget: "#turn",
  movesTarget: "#moves",
  capturedTarget: "#captured",
  messageTarget: "#message",
  resetButton: "#resetButton",
  humanColor: "red",
  ai: new CheckersAI({ rules: new CheckersRules(), depth: 3 })
});

game.start();
globalThis.mchatCheckersExample = game;
