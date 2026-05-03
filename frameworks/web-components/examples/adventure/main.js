import { AdventureGame } from "./AdventureGame.js";

const game = new AdventureGame({
  canvas: document.querySelector("#adventureCanvas"),
  scoreboardTarget: "#scoreboard"
});

game.start();
globalThis.mchatAdventureExample = game;
