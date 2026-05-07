import { WordQuestGame } from "./WordQuestGame.js";

import { MiniHeader } from "../../ui/MiniHeader.js";

if (typeof MiniHeader !== "undefined" && MiniHeader && typeof MiniHeader.mount === "function") {
  MiniHeader.mount(document.querySelector("[data-mini-header]"), { title: "Word Quest", subtitle: "Six guesses. Five letters. Green, gold, gray feedback." });
}

// Pull the canonical 5-letter wordlists from the platform's dictionary
// fundamental (docs/MCHATAI_FUNDAMENTALS.md). The mchatai-shell.js sibling
// script (auto-generated at install time) wires up window.mchatai.dictionary.
// Falls back to a tiny demo list if the runtime API isn't loaded — keeps the
// example viewable when opened raw in a browser without the install pipeline.
const FALLBACK_ANSWERS = ["CRANE", "PLANT", "BRAVE", "STONE", "LIGHT", "RIVER", "MOUSE", "SPARK"];
const FALLBACK_DICTIONARY = [
  "CRANE", "PLANT", "BRAVE", "STONE", "LIGHT", "RIVER", "MOUSE", "SPARK",
  "HEART", "GRACE", "TRAIL", "CLOUD", "SHARP", "BRAIN", "QUEST", "WORLD"
];

const dictAPI = (typeof window !== "undefined" && window.mchatai && window.mchatai.dictionary) ? window.mchatai.dictionary : null;
const answers = dictAPI ? dictAPI("english-5letter-answers").words() : FALLBACK_ANSWERS;
const dictionary = dictAPI ? dictAPI("english-5letter").words() : FALLBACK_DICTIONARY;

const game = new WordQuestGame({
  root: document.querySelector("[data-app]"),
  answerWords: answers,
  dictionary: dictionary
});

game.start();
