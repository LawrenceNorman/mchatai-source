import { PokerGame } from "./PokerGame.js";
import { MiniHeader } from "../../ui/MiniHeader.js";

if (typeof MiniHeader !== "undefined" && MiniHeader && typeof MiniHeader.mount === "function") {
  MiniHeader.mount(document.querySelector("[data-mini-header]"), {
    title: "Heads-Up Poker",
    subtitle: "Texas Hold'em vs CPU. Bet, call, raise, or fold."
  });
}

const game = new PokerGame({
  root: document,
  startingStack: 100
});

game.start();
globalThis.mchatPokerExample = game;
