import { PongGame } from "./PongGame.js";

import { MiniHeader } from "../../ui/MiniHeader.js";

MiniHeader.mount(document.querySelector("[data-mini-header]"), { title: "Pong Duel", subtitle: "First to seven wins. W/S or arrow keys." });

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
