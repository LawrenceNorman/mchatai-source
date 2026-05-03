import { ChessGame } from "./ChessGame.js";

const game = new ChessGame({
  boardTarget: "#board",
  turnTarget: "#turn",
  movesTarget: "#moves",
  capturedTarget: "#captured",
  messageTarget: "#message",
  resetButton: "#resetButton"
});

game.start();
globalThis.mchatChessExample = game;
