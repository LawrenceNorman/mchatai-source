import { CandyMatchGame } from "./CandyMatchGame.js";

const game = new CandyMatchGame({
  boardTarget: "#board",
  scoreboardTarget: "#scoreboard",
  movesTarget: "#moves",
  comboTarget: "#combo",
  clearedTarget: "#cleared",
  messageTarget: "#message",
  shuffleButton: "#shuffleButton",
  newGameButton: "#newGameButton"
});

game.start();
globalThis.mchatCandyMatchExample = game;
