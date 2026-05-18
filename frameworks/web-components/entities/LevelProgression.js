// LevelProgression - manages N-level progression with target scores, move
// budgets, and cumulative score tracking across cleared levels for the
// hosted-page leaderboard bridge.
//
// Solves a recurring leaderboard bug: per-level games reset their score
// counter on each level start, so leaderboards see only the score from the
// level the player was on when they ran out of moves (often tiny). A
// cumulativeScore that adds each level's reached score on level-complete and
// is mirrored into a hidden <span data-mchatai-score> element makes the
// hosted-page leaderboard bridge pick up the full run instead.
//
// Also enforces wisdom rule lb-016-many-levels-or-endless: ship at least 8
// levels with a smooth difficulty curve, with an explicit "New Game+" final
// action instead of auto-looping back to level 1.
//
// Usage:
//   import { LevelProgression } from "./LevelProgression.js";
//   const lp = new LevelProgression({
//     levels: [
//       { target: 1500, moves: 30 },
//       { target: 3000, moves: 30 },
//       { target: 5000, moves: 28 },
//       // ... at least 8 entries
//     ],
//     onLevelChange: (level, levelMeta, cumulative) => { /* re-render HUD */ },
//   });
//   lp.start();                              // begin level 0
//   lp.recordLevelScore(playerScore);        // call when a level ends (pass or fail)
//   if (lp.passed()) lp.advance();           // next level OR new-game-plus
//   else lp.retryLevel();                    // restart current
//   const cumulative = lp.getCumulativeScore();
//
// The class also wires a hidden DOM element so the leaderboard bridge can
// read cumulative score regardless of what the visible HUD shows. Pass
// { leaderboardElementId: "leaderboardScore" } (the default). Call mount()
// once on init to inject the element.

const DEFAULT_LEVELS = [
  { target: 1500, moves: 30 },
  { target: 3000, moves: 30 },
  { target: 5000, moves: 28 },
  { target: 7500, moves: 26 },
  { target: 10500, moves: 25 },
  { target: 14000, moves: 24 },
  { target: 18000, moves: 22 },
  { target: 22500, moves: 22 },
  { target: 28000, moves: 20 },
  { target: 34500, moves: 20 },
  { target: 42000, moves: 18 },
  { target: 50000, moves: 18 }
];

export class LevelProgression {
  constructor(options = {}) {
    this.levels = Array.isArray(options.levels) && options.levels.length > 0
      ? options.levels
      : DEFAULT_LEVELS.slice();
    if (this.levels.length < 8) {
      console.warn("[LevelProgression] Fewer than 8 levels configured. Wisdom rule lb-016 recommends 8+ levels or endless.");
    }
    this.leaderboardElementId = options.leaderboardElementId || "leaderboardScore";
    this.onLevelChange = typeof options.onLevelChange === "function" ? options.onLevelChange : null;
    this.onCumulativeChange = typeof options.onCumulativeChange === "function" ? options.onCumulativeChange : null;
    this.cumulativeScore = 0;
    this.currentIndex = 0;
    this.lastLevelScore = 0;
    this.lastPassed = false;
  }

  // Inject a hidden DOM element that the hosted-page leaderboard bridge
  // (pickScoreFromDOM) reads via [data-mchatai-score] (highest priority).
  // Idempotent: re-mounting won't create duplicates.
  mount() {
    if (typeof document === "undefined") return;
    let el = document.getElementById(this.leaderboardElementId);
    if (!el) {
      el = document.createElement("span");
      el.id = this.leaderboardElementId;
      el.setAttribute("data-mchatai-score", "");
      el.setAttribute("aria-hidden", "true");
      el.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;";
      el.textContent = "0";
      (document.body || document.documentElement).appendChild(el);
    }
    this._lbEl = el;
    this._writeLeaderboard();
  }

  start() {
    this.currentIndex = 0;
    this.cumulativeScore = 0;
    this.lastLevelScore = 0;
    this.lastPassed = false;
    this._writeLeaderboard();
    this._fireLevelChange();
  }

  // Record the score the player achieved on the just-ended level. If they
  // hit the target, advance() will bank it into cumulative; if not, the
  // partial level score is still exposed to the leaderboard so out-of-moves
  // submits reflect the full run (cleared levels + partial current).
  recordLevelScore(score) {
    this.lastLevelScore = score;
    const target = this.currentMeta().target;
    this.lastPassed = score >= target;
    // Expose cumulative + partial-current to the leaderboard. On a pass,
    // advance() will then bank lastLevelScore into cumulative; on a fail,
    // the leaderboard already reflects the partial run.
    this._writeLeaderboard(this.cumulativeScore + score);
    if (this.onCumulativeChange) this.onCumulativeChange(this.cumulativeScore + score);
  }

  advance() {
    if (!this.lastPassed) return false;
    this.cumulativeScore += this.lastLevelScore;
    this.lastLevelScore = 0;
    if (this.currentIndex >= this.levels.length - 1) {
      // Cleared all levels - caller should show "New Game+" UI. Until the
      // user clicks it, leave state intact so endgame can display totals.
      return false;
    }
    this.currentIndex += 1;
    this._writeLeaderboard();
    this._fireLevelChange();
    return true;
  }

  newGamePlus() {
    this.currentIndex = 0;
    this.cumulativeScore = 0;
    this.lastLevelScore = 0;
    this.lastPassed = false;
    this._writeLeaderboard();
    this._fireLevelChange();
  }

  retryLevel() {
    this.lastLevelScore = 0;
    this.lastPassed = false;
    this._writeLeaderboard();
    this._fireLevelChange();
  }

  currentMeta() {
    return this.levels[this.currentIndex];
  }

  isLastLevel() {
    return this.currentIndex >= this.levels.length - 1;
  }

  getCumulativeScore() {
    return this.cumulativeScore;
  }

  totalLevels() {
    return this.levels.length;
  }

  _writeLeaderboard(value) {
    const v = typeof value === "number" ? value : this.cumulativeScore;
    if (this._lbEl) this._lbEl.textContent = String(v);
  }

  _fireLevelChange() {
    if (this.onLevelChange) {
      this.onLevelChange(this.currentIndex, this.currentMeta(), this.cumulativeScore);
    }
  }
}
