import { CheckersGame } from "./CheckersGame.js";

const game = new CheckersGame({
  boardTarget: "#board",
  turnTarget: "#turn",
  movesTarget: "#moves",
  capturedTarget: "#captured",
  messageTarget: "#message",
  resetButton: "#resetButton"
});

game.start();
globalThis.mchatCheckersExample = game;
