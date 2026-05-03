import { CrosswordGame } from "./CrosswordGame.js";

import { MiniHeader } from "../../ui/MiniHeader.js";

MiniHeader.mount(document.querySelector("[data-mini-header]"), { title: "Mini Crossword", subtitle: "Click a cell, type letters, follow the clues." });

const game = new CrosswordGame({
  root: document
});

game.start();
globalThis.mchatCrosswordExample = game;
