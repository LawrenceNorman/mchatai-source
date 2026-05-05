import { TicTacToeGame } from "./TicTacToeGame.js";
import { MiniHeader } from "../../ui/MiniHeader.js";

MiniHeader.mount(document.querySelector("[data-mini-header]"), {
  title: "Tic-Tac-Toe",
  subtitle: "Three in a row beats the computer."
});

const game = new TicTacToeGame({
  boardTarget: "#board",
  statusTarget: "#status",
  scoreTarget: "#score",
  restartHostTarget: "[data-app]",
  toggleHostTarget: "#difficulty",
  rankCardHostTarget: "#rank-card"
});

game.start();
globalThis.mchatTicTacToeExample = game;
