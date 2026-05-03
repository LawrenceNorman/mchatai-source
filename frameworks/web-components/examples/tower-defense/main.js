import { TowerDefenseGame } from "./TowerDefenseGame.js";

import { MiniHeader } from "../../ui/MiniHeader.js";

MiniHeader.mount(document.querySelector("[data-mini-header]"), { title: "Tower Defense", subtitle: "Place turrets beside the road. Stop the waves." });

const game = new TowerDefenseGame({
  canvas: document.querySelector("#battleCanvas"),
  scoreboardTarget: "#scoreboard"
});

game.start();
globalThis.mchatTowerDefenseExample = game;
