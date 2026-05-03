import { PongGame } from "./PongGame.js";

const game = new PongGame({
  canvasId: "pongCanvas",
  scoreboardTarget: "#scoreboard",
  playerScoreTarget: "#playerScore",
  cpuScoreTarget: "#cpuScore",
  roundTarget: "#round",
  messageTarget: "#message",
  serveButton: "#serveButton",
  resetButton: "#resetButton"
});

game.start();
globalThis.mchatPongExample = game;
