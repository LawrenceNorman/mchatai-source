import { MinesweeperGame } from "./MinesweeperGame.js";

import { MiniHeader } from "../../ui/MiniHeader.js";

MiniHeader.mount(document.querySelector("[data-mini-header]"), { title: "Minesweeper 99", subtitle: "Reveal safe cells. Flag hidden mines." });

const game = new MinesweeperGame({
  root: document.querySelector("[data-app]"),
  rows: 9,
  cols: 9,
  mines: 10
});

game.start();
