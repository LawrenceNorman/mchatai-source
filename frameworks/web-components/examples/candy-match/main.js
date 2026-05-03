import { CandyMatchGame } from "./CandyMatchGame.js";

import { MiniHeader } from "../../ui/MiniHeader.js";

MiniHeader.mount(document.querySelector("[data-mini-header]"), { title: "Candy Match", subtitle: "Swap adjacent candies. Match three or more to cascade." });

const game = new CandyMatchGame({
  boardTarget: "#board",
  scoreboardTarget: "#scoreboard",
  movesTarget: "#moves",
  comboTarget: "#combo",
  clearedTarget: "#cleared",
  messageTarget: "#message",
  shuffleButton: "#shuffleButton",
  newGameButton: "#newGameButton"
});

game.start();
globalThis.mchatCandyMatchExample = game;
