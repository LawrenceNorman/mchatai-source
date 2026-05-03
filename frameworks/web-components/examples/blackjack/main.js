import { BlackjackGame } from "./BlackjackGame.js";

import { MiniHeader } from "../../ui/MiniHeader.js";

MiniHeader.mount(document.querySelector("[data-mini-header]"), { title: "Blackjack", subtitle: "Hit, stand, or double. Dealer stands on soft 17." });

const game = new BlackjackGame({
  root: document,
  startingBankroll: 100,
  baseBet: 10
});

game.start();
globalThis.mchatBlackjackExample = game;
