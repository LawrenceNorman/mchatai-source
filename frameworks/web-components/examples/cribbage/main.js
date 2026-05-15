import { CribbageGame } from "./CribbageGame.js";
import { MiniHeader } from "../../ui/MiniHeader.js";

if (typeof MiniHeader !== "undefined" && MiniHeader && typeof MiniHeader.mount === "function") {
  MiniHeader.mount(document.querySelector("[data-mini-header]"), {
    title: "Cribbage",
    subtitle: "2-player. Peg to 121. Crib alternates."
  });
}

const game = new CribbageGame({
  root: document,
  winningScore: 121
});

game.start();
globalThis.mchatCribbageExample = game;
