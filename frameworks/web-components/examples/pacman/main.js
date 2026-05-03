import { PacmanGame } from "./PacmanGame.js";

import { MiniHeader } from "../../ui/MiniHeader.js";

MiniHeader.mount(document.querySelector("[data-mini-header]"), { title: "Pac-Man", subtitle: "Eat pellets, dodge ghosts, use power pellets." });

const game = new PacmanGame({
  canvas: document.querySelector("#mazeCanvas"),
  scoreboardTarget: "#scoreboard",
  joystickTarget: "#joystickMount"
});

game.start();
globalThis.mchatPacmanExample = game;
