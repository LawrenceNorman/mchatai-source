import { PacmanGame } from "./PacmanGame.js";

const game = new PacmanGame({
  canvas: document.querySelector("#mazeCanvas"),
  scoreboardTarget: "#scoreboard",
  joystickTarget: "#joystickMount"
});

game.start();
globalThis.mchatPacmanExample = game;
