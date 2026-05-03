import { MastermindGame } from "./MastermindGame.js";

import { MiniHeader } from "../../ui/MiniHeader.js";

MiniHeader.mount(document.querySelector("[data-mini-header]"), { title: "Codebreaker", subtitle: "Crack the four-color code in ten turns." });

const game = new MastermindGame({
  root: document,
  maxTurns: 10
});

game.start();
globalThis.mchatMastermindExample = game;
