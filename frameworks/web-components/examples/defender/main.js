import { DefenderGame } from "./DefenderGame.js";

const game = new DefenderGame({
  canvas: document.querySelector("#defenderCanvas"),
  scoreboardTarget: "#scoreboard"
});

game.start();
globalThis.mchatDefenderExample = game;
