import { TowerDefenseGame } from "./TowerDefenseGame.js";
import { MiniHeader } from "../../ui/MiniHeader.js";

MiniHeader.mount(document.querySelector("[data-mini-header]"), { title: "Bunker Defense", subtitle: "Build turrets, stop the zombie horde." });

const game = new TowerDefenseGame({
  canvas: document.querySelector("#battleCanvas"),
  scoreboardTarget: "#scoreboard"
});

game.start();
globalThis.mchatTowerDefenseExample = game;
