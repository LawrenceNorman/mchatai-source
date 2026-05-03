import { PlatformerGame } from "./PlatformerGame.js";

import { MiniHeader } from "../../ui/MiniHeader.js";

MiniHeader.mount(document.querySelector("[data-mini-header]"), { title: "Plumber Run", subtitle: "Run, jump, collect coins, dodge hazards." });

const game = new PlatformerGame({
  canvas: document.querySelector("#stageCanvas"),
  scoreboardTarget: "#scoreboard",
  joystickTarget: "#joystickMount"
});

game.start();
globalThis.mchatPlatformerExample = game;
