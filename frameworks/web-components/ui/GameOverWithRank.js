// GameOverWithRank — game-over panel composed with Leaderboard rank-card + top-list.
//
// Companion to ui/Leaderboard.js. Wraps the standard "you died / you won" panel
// pattern around the leaderboard widgets so any scoring mini-app can wire a
// complete competitive end-of-run screen with one call.
//
// Wisdom rules: u-leaderboard-addon-recipe (recipe.with-leaderboard contract),
// u-018 (call submitFinal on game-over), score-show-personal-best-on-game-over
// (BEST chrome belongs HERE, never in-play HUD), u-029 (visible restart).
//
// Design principle — signed-in is the funnel:
//   When submitFinal() resolves null (player not signed in / bridge absent),
//   we render a persuasive "Sign in to post your score" CTA, not a passive
//   notice. The leaderboard is the reason to sign up at mchatai.com.
//   The top-list still renders for everyone (public read).
//
// Usage:
//   import { GameOverWithRank } from "../../ui/GameOverWithRank.js";
//   await GameOverWithRank.show({
//     host: document.querySelector("#game-over"),
//     score: finalScore,
//     metadata: { level, moves, duration_ms },
//     title: "Game Over",
//     subtitle: `You scored ${finalScore.toLocaleString()}`,
//     onRestart: () => game.restart(),
//   });
//
// Returns the panel DOM node so callers can mount custom extras inside it.

import { Leaderboard } from "./Leaderboard.js";

const GAME_OVER_STYLE_ID = "mchatai-game-over-with-rank-styles";

const GAME_OVER_STYLE_CSS = `
.mchatai-game-over {
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: stretch;
  padding: 20px;
  border-radius: 16px;
  background: linear-gradient(160deg, #0f172a, #020617);
  color: #f8fafc;
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
  font-family: inherit;
  max-width: 420px;
  margin: 0 auto;
}
.mchatai-game-over__title {
  margin: 0;
  font-size: clamp(1.4rem, 4.6vw, 1.8rem);
  font-weight: 800;
  text-align: center;
  letter-spacing: 0.01em;
}
.mchatai-game-over__subtitle {
  margin: 0;
  font-size: 0.95rem;
  text-align: center;
  opacity: 0.82;
}
.mchatai-game-over__rank-slot,
.mchatai-game-over__top-slot,
.mchatai-game-over__cta-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.mchatai-game-over__signin-cta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.16), rgba(244, 114, 182, 0.14));
  border: 1px solid rgba(251, 191, 36, 0.36);
  text-align: center;
}
.mchatai-game-over__signin-headline {
  font-size: 0.95rem;
  font-weight: 700;
  color: #fbbf24;
}
.mchatai-game-over__signin-body {
  font-size: 0.82rem;
  opacity: 0.88;
  line-height: 1.4;
}
.mchatai-game-over__signin-button {
  display: inline-block;
  margin-top: 4px;
  padding: 10px 18px;
  border-radius: 999px;
  background: #fbbf24;
  color: #1f2937;
  font-weight: 700;
  font-size: 0.88rem;
  text-decoration: none;
  border: none;
  cursor: pointer;
  letter-spacing: 0.02em;
}
.mchatai-game-over__signin-button:hover { filter: brightness(1.05); }
.mchatai-game-over__restart {
  align-self: center;
  margin-top: 4px;
  padding: 12px 28px;
  border-radius: 999px;
  background: #f8fafc;
  color: #0f172a;
  font-weight: 700;
  font-size: 0.95rem;
  border: none;
  cursor: pointer;
  min-height: 44px;
  min-width: 44px;
}
.mchatai-game-over__restart:hover { filter: brightness(0.95); }
`.trim();

function gameOverEnsureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(GAME_OVER_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = GAME_OVER_STYLE_ID;
  style.textContent = GAME_OVER_STYLE_CSS;
  document.head.appendChild(style);
}

function gameOverResolveTarget(target) {
  if (!target || typeof document === "undefined") return null;
  return typeof target === "string" ? document.querySelector(target) : target;
}

function gameOverBuildSignInCTA(options) {
  const wrap = document.createElement("div");
  wrap.className = "mchatai-game-over__signin-cta";

  const headline = document.createElement("div");
  headline.className = "mchatai-game-over__signin-headline";
  headline.textContent = options.headline || "Want your score on the leaderboard?";
  wrap.appendChild(headline);

  const body = document.createElement("div");
  body.className = "mchatai-game-over__signin-body";
  body.textContent =
    options.body ||
    "Free mChatAI account — your scores show up on the public leaderboard for this game so friends can challenge you back.";
  wrap.appendChild(body);

  const button = document.createElement("a");
  button.className = "mchatai-game-over__signin-button";
  button.textContent = options.buttonText || "Sign in at mchatai.com →";
  button.href = options.signInURL || "https://mchatai.com/signin";
  button.target = "_top";
  button.rel = "noopener";
  wrap.appendChild(button);

  return wrap;
}

export const GameOverWithRank = {
  /**
   * Render a full game-over panel with rank card (if signed-in), top-list,
   * sign-in CTA (if not signed-in), and restart button.
   *
   * Resolves to the panel DOM node. NEVER throws — leaderboard absence is
   * handled gracefully via Leaderboard.js's no-op-safe contract.
   *
   * Required:
   *   - host: DOM element or selector string to render INTO (cleared first).
   *   - score: final score number.
   *
   * Optional:
   *   - metadata: object passed to Leaderboard.submitFinal.
   *   - title: panel headline (default "Game Over").
   *   - subtitle: secondary line (default "You scored {score}").
   *   - topCount: number of top scores to show (default 10).
   *   - onRestart: () => void; if provided, renders a restart button.
   *   - restartLabel: button text (default "Play Again").
   *   - signIn: { headline?, body?, buttonText?, signInURL? } — CTA copy overrides.
   */
  async show({ host, score, metadata = {}, title = "Game Over",
                subtitle, topCount = 10, onRestart, restartLabel = "Play Again",
                signIn = {} } = {}) {
    const target = gameOverResolveTarget(host);
    if (!target) return null;
    gameOverEnsureStyles();

    target.innerHTML = "";
    const panel = document.createElement("div");
    panel.className = "mchatai-game-over";

    const titleEl = document.createElement("h2");
    titleEl.className = "mchatai-game-over__title";
    titleEl.textContent = title;
    panel.appendChild(titleEl);

    const subtitleEl = document.createElement("p");
    subtitleEl.className = "mchatai-game-over__subtitle";
    subtitleEl.textContent =
      subtitle || `You scored ${Number(score).toLocaleString()}`;
    panel.appendChild(subtitleEl);

    const rankSlot = document.createElement("div");
    rankSlot.className = "mchatai-game-over__rank-slot";
    panel.appendChild(rankSlot);

    const ctaSlot = document.createElement("div");
    ctaSlot.className = "mchatai-game-over__cta-slot";
    panel.appendChild(ctaSlot);

    const topSlot = document.createElement("div");
    topSlot.className = "mchatai-game-over__top-slot";
    panel.appendChild(topSlot);

    if (typeof onRestart === "function") {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mchatai-game-over__restart";
      button.textContent = restartLabel;
      button.addEventListener("click", () => onRestart());
      panel.appendChild(button);
    }

    target.appendChild(panel);

    // Submit + render rank-card (or sign-in CTA if not signed in / no bridge).
    const result = await Leaderboard.submitFinal(score, metadata);
    if (result) {
      Leaderboard.renderRankCard(rankSlot, result);
    } else {
      ctaSlot.appendChild(gameOverBuildSignInCTA(signIn));
    }

    // Render top-list for everyone (public read).
    await Leaderboard.renderTopList(topSlot, topCount);

    return panel;
  }
};
