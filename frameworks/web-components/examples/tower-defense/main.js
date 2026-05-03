import { TowerDefenseGame } from "./TowerDefenseGame.js";

const game = new TowerDefenseGame({
  canvas: document.querySelector("#battleCanvas"),
  scoreboardTarget: "#scoreboard"
});

game.start();
globalThis.mchatTowerDefenseExample = game;
