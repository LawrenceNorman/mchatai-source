// Leaderboard — global leaderboard wiring for any scoring mini-app.
//
// Wisdom rules: bg-006 (board games must submit final scores), ag-010 (arcade
// games must submit final scores + show top-10), u-018 (any scoring app should
// wire leaderboard).
//
// All methods are NO-OP SAFE when `window.mChatAI?.leaderboard` is undefined
// (offline / signed-out / local preview). Callers can always `await` and never
// branch on availability.
//
// Usage:
//   import { Leaderboard } from "../../ui/Leaderboard.js";
//   // on game over:
//   const result = await Leaderboard.submitFinal(score, { level, moves });
//   if (result) Leaderboard.renderRankCard(host, result);
//   // optionally show top-N table on game-over screen:
//   Leaderboard.renderTopList(host, 10);
//
// The leaderboardBridge contract (set by mChatAI+):
//   window.mChatAI.leaderboard.submit({ score, metadata })
//     -> Promise<{ rank, percentile, played, topPlayer? }>
//   window.mChatAI.leaderboard.getTop(count)
//     -> Promise<Array<{ displayName, score, submittedAt, platform? }>>

const LEADERBOARD_STYLE_ID = "mchatai-leaderboard-styles";

const LEADERBOARD_STYLE_CSS = `
.mchatai-rank-card {
  display: inline-flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 18px;
  border-radius: 14px;
  background: linear-gradient(135deg, #1f2937, #111827);
  color: #f8fafc;
  border: 1px solid rgba(251, 191, 36, 0.32);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32);
  font-family: inherit;
  text-align: center;
}
.mchatai-rank-card__rank {
  font-size: clamp(1.4rem, 4vw, 2rem);
  font-weight: 800;
  color: #fbbf24;
}
.mchatai-rank-card__caption {
  font-size: 0.78rem;
  opacity: 0.78;
  letter-spacing: 0.04em;
}
.mchatai-top-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.6);
  color: #f8fafc;
  font-size: 0.85rem;
  min-width: 220px;
  max-width: 360px;
}
.mchatai-top-list__row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 8px;
  border-radius: 6px;
}
.mchatai-top-list__row:nth-child(odd) { background: rgba(255, 255, 255, 0.04); }
.mchatai-top-list__row--self { background: rgba(251, 191, 36, 0.18); font-weight: 700; }
.mchatai-top-list__rank { font-variant-numeric: tabular-nums; opacity: 0.7; min-width: 2.5em; }
.mchatai-top-list__name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mchatai-top-list__score { font-weight: 700; font-variant-numeric: tabular-nums; }
.mchatai-top-list__title {
  margin: 0 0 6px;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.75;
}
.mchatai-top-list__empty {
  padding: 8px;
  font-size: 0.78rem;
  opacity: 0.6;
  text-align: center;
}
`.trim();

function leaderboardEnsureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(LEADERBOARD_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = LEADERBOARD_STYLE_ID;
  style.textContent = LEADERBOARD_STYLE_CSS;
  document.head.appendChild(style);
}

function leaderboardBridge() {
  return globalThis?.window?.mChatAI?.leaderboard || null;
}

function leaderboardResolveTarget(target) {
  if (!target || typeof document === "undefined") return null;
  return typeof target === "string" ? document.querySelector(target) : target;
}

export const Leaderboard = {
  /**
   * Returns true if the leaderboardBridge is available in this runtime.
   */
  isAvailable() {
    const b = leaderboardBridge();
    return !!(b && typeof b.submit === "function");
  },

  /**
   * Submit a final score with arbitrary metadata. Resolves to the leaderboardBridge's
   * response { rank, percentile, played, topPlayer? } OR null when the leaderboardBridge
   * is absent. NEVER throws — caller can `await` without try/catch.
   */
  async submitFinal(score, metadata = {}) {
    const b = leaderboardBridge();
    if (!b || typeof b.submit !== "function") return null;
    try {
      const result = await b.submit({ score, metadata });
      return result || null;
    } catch (err) {
      if (typeof console !== "undefined") console.warn("[Leaderboard] submit failed", err);
      return null;
    }
  },

  /**
   * Fetch top N scores. Resolves to an array (possibly empty) OR null on leaderboardBridge
   * absence. Empty array means "leaderboardBridge is there but board has no entries yet."
   */
  async getTop(count = 10) {
    const b = leaderboardBridge();
    if (!b || typeof b.getTop !== "function") return null;
    try {
      const list = await b.getTop(count);
      return Array.isArray(list) ? list : [];
    } catch (err) {
      if (typeof console !== "undefined") console.warn("[Leaderboard] getTop failed", err);
      return [];
    }
  },

  /**
   * Render a small rank-card pill. Returns the DOM node so the caller can
   * unmount it (`node.remove()`) on next round.
   */
  renderRankCard(target, result, options = {}) {
    if (!result || typeof document === "undefined") return null;
    leaderboardEnsureStyles();
    const host = leaderboardResolveTarget(target);
    if (!host) return null;
    const root = document.createElement("div");
    root.className = "mchatai-rank-card";
    const rank = result.rank ? `#${result.rank}` : "—";
    const played = result.played ? `of ${result.played.toLocaleString()} players` : "";
    const percentile = typeof result.percentile === "number"
      ? `Top ${Math.max(1, Math.round(result.percentile))}%`
      : "";
    root.innerHTML = `
      <span class="mchatai-rank-card__caption">${options.label || "Your rank"}</span>
      <span class="mchatai-rank-card__rank">${rank}</span>
      <span class="mchatai-rank-card__caption">${[played, percentile].filter(Boolean).join(" · ")}</span>
    `;
    host.appendChild(root);
    return root;
  },

  /**
   * Render a top-N list with optional self-highlight. Returns the DOM node.
   * Async because it fetches; caller can await or fire-and-forget.
   */
  async renderTopList(target, count = 10, options = {}) {
    if (typeof document === "undefined") return null;
    leaderboardEnsureStyles();
    const host = leaderboardResolveTarget(target);
    if (!host) return null;
    const root = document.createElement("div");
    root.className = "mchatai-top-list";
    root.innerHTML = `<p class="mchatai-top-list__title">${options.title || "Top players"}</p>`;
    host.appendChild(root);
    const list = await Leaderboard.getTop(count);
    if (list === null) {
      // Bridge absent — render a neutral empty state.
      const empty = document.createElement("p");
      empty.className = "mchatai-top-list__empty";
      empty.textContent = options.offlineMessage || "Leaderboard available with mChatAI+ account";
      root.appendChild(empty);
      return root;
    }
    if (list.length === 0) {
      const empty = document.createElement("p");
      empty.className = "mchatai-top-list__empty";
      empty.textContent = options.emptyMessage || "Be the first to post a score!";
      root.appendChild(empty);
      return root;
    }
    const selfId = options.selfId || null;
    list.forEach((entry, idx) => {
      const row = document.createElement("div");
      row.className = "mchatai-top-list__row";
      if (selfId && entry?.id === selfId) row.classList.add("mchatai-top-list__row--self");
      const rank = idx + 1;
      const displayName = entry?.displayName || entry?.name || "Anonymous";
      const score = typeof entry?.score === "number" ? entry.score.toLocaleString() : (entry?.score ?? "—");
      row.innerHTML = `
        <span class="mchatai-top-list__rank">#${rank}</span>
        <span class="mchatai-top-list__name">${displayName}</span>
        <span class="mchatai-top-list__score">${score}</span>
      `;
      root.appendChild(row);
    });
    return root;
  }
};

/**
 * Convenience composite: submit + render rank card on the same host. Returns
 * the rank-card DOM node (or null on leaderboardBridge absence).
 */
export async function submitAndShowRank(host, score, metadata = {}, options = {}) {
  const result = await Leaderboard.submitFinal(score, metadata);
  if (!result) return null;
  return Leaderboard.renderRankCard(host, result, options);
}
