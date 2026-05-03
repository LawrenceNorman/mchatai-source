import { FroggerGame } from "./FroggerGame.js";

import { MiniHeader } from "../../ui/MiniHeader.js";

MiniHeader.mount(document.querySelector("[data-mini-header]"), { title: "Frogger Crossing", subtitle: "Hop through traffic and reach all five home pads." });

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
