import { PlatformerGame } from "./PlatformerGame.js";

const game = new PlatformerGame({
  canvas: document.querySelector("#stageCanvas"),
  scoreboardTarget: "#scoreboard",
  joystickTarget: "#joystickMount"
});

game.start();
globalThis.mchatPlatformerExample = game;
