import { PlatformerGame } from "./PlatformerGame.js";

import { MiniHeader } from "../../ui/MiniHeader.js";

if (typeof MiniHeader !== "undefined" && MiniHeader && typeof MiniHeader.mount === "function") {
  // Row 10k (2026-05-29): generic title (was "Plumber Run", too close to Mario).
  MiniHeader.mount(document.querySelector("[data-mini-header]"), { title: "Player Run", subtitle: "Run, jump, collect coins, dodge hazards." });
}
const game = new PlatformerGame({
  canvas: document.querySelector("#stageCanvas"),
  scoreboardTarget: "#scoreboard",
  joystickTarget: "#joystickMount"
});

game.start();
globalThis.mchatPlatformerExample = game;
