import { FroggerGame } from "./FroggerGame.js";

const game = new FroggerGame({
  canvasId: "froggerCanvas",
  scoreboardTarget: "#scoreboard",
  livesTarget: "#lives",
  homesTarget: "#homes",
  messageTarget: "#message",
  joystickTarget: "#joystickMount",
  restartButton: "#restartButton"
});

game.start();
globalThis.mchatFroggerExample = game;
