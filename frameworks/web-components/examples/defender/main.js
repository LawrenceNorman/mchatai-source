import { DefenderGame } from "./DefenderGame.js";

import { MiniHeader } from "../../ui/MiniHeader.js";

MiniHeader.mount(document.querySelector("[data-mini-header]"), { title: "Stellar Defender", subtitle: "Patrol the horizon, rescue humans, stop the abductors." });

const game = new DefenderGame({
  canvas: document.querySelector("#defenderCanvas"),
  scoreboardTarget: "#scoreboard"
});

game.start();
globalThis.mchatDefenderExample = game;
