import { SpadesGame } from "./SpadesGame.js";
import { MiniHeader } from "../../ui/MiniHeader.js";

if (typeof MiniHeader !== "undefined" && MiniHeader && typeof MiniHeader.mount === "function") {
  MiniHeader.mount(document.querySelector("[data-mini-header]"), {
    title: "Spades",
    subtitle: "4-player partnership. Bid 0-13. Game to 500."
  });
}

const game = new SpadesGame({
  root: document,
  winningScore: 500
});

game.start();
globalThis.mchatSpadesExample = game;
