import { MinesweeperGame } from "./MinesweeperGame.js";

const game = new MinesweeperGame({
  root: document.querySelector("[data-app]"),
  rows: 9,
  cols: 9,
  mines: 10
});

game.start();
