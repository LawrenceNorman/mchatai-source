import { AdventureGame } from "./AdventureGame.js";

import { MiniHeader } from "../../ui/MiniHeader.js";

MiniHeader.mount(document.querySelector("[data-mini-header]"), { title: "Adventure", subtitle: "Find the key, unlock the gate, dodge the dragon." });

const game = new AdventureGame({
  canvas: document.querySelector("#adventureCanvas"),
  scoreboardTarget: "#scoreboard"
});

game.start();
globalThis.mchatAdventureExample = game;
