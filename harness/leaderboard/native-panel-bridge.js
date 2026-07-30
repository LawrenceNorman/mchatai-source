/*
 * native-panel-bridge.js  (Phase LB-HUB-PANEL, 2026-07-29)
 *
 * The game-over leaderboard PANEL for NATIVELY-hosted mini-app play (iOS/macOS
 * Hub playing a locally-installed file:// bundle). Those WebViews inject a
 * native `window.mChatAI.leaderboard` API shim (submit/getTop, routed to the
 * app's LeaderboardService) but NOT the visual board — so a finished game posts
 * its score silently and "nothing engages." This layers the top-3 + your-rank
 * card on top of that API, mirroring what mchataiweb's server bridge
 * (MCHATAI_LEADERBOARD_BRIDGE_SOURCE → showGameOverTop3) renders on the web.
 *
 * Sourced from mchatai-source (RULE #1: content, not binary) and injected by the
 * native app with a frozen bundled fallback. It NEVER talks to a backend itself —
 * it only calls the injected `window.mChatAI.leaderboard.{submit,getTop}`.
 *
 * Self-gating:
 *   - no-op if the web SERVER bridge is present (it already renders the panel),
 *   - no-op if there is no native `window.mChatAI.leaderboard` API,
 *   - idempotent.
 */
(function () {
  "use strict";
  if (window.__MCHATAI_LEADERBOARD_BRIDGE__) return;      // web server bridge owns the panel
  if (window.__mchataiNativePanelBridge) return;          // idempotent
  var lb = window.mChatAI && window.mChatAI.leaderboard;
  if (!lb || typeof lb.submit !== "function") return;     // no native API to build on
  window.__mchataiNativePanelBridge = true;

  var GAME_OVER_RE = /(game\s*over|you\s*(win|won|lose|lost|died)|you\s*reached|final\s*score|victory|defeat|checkmate|stalemate|caught|you\s*escaped|time'?s?\s*up)/i;
  var LOW_IS_GOOD = { fastest: "seconds", "fewest-moves": "moves", lowest: "points" };

  function mode() {
    var m = document.querySelector('meta[name="mchatai-leaderboard-mode"]');
    return (m && m.content ? m.content.trim() : "default");
  }
  function scoreTypeFor(md) { return (md in LOW_IS_GOOD) ? "lowIsGood" : "highIsGood"; }
  function scoreUnitFor(md) { return LOW_IS_GOOD[md] || "points"; }

  // 186 -> "3:06", 3723 -> "1:02:03" on a 'fastest' board; plain number otherwise.
  function fmtScore(n, md) {
    n = Number(n);
    if (!isFinite(n)) return "—";
    if ((md || mode()) !== "fastest") return n.toLocaleString();
    var t = Math.max(0, Math.round(n));
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    var pad = function (x) { return (x < 10 ? "0" : "") + x; };
    return h > 0 ? (h + ":" + pad(m) + ":" + pad(s)) : (m + ":" + pad(s));
  }

  // ── submit() wrapper ──────────────────────────────────────────────────────
  // The game calls window.mChatAI.leaderboard.submit({score, metadata}). We
  // enrich it with the board direction (from the meta tag) + stringify metadata
  // (the native handler only accepts [String:String]), call the native submit,
  // then render the panel. Rejection = not signed in → CTA panel + public top-3.
  var nativeSubmit = lb.submit.bind(lb);
  lb.submit = function (payload) {
    payload = payload || {};
    var md = mode();
    var raw = Number(payload.score);
    var lowIsGood = md in LOW_IS_GOOD;
    // Guard a poisoned score: NEVER coerce a NaN/undefined score to 0 (the old
    // `Number(x)||0` did) — on a lowIsGood board a 0 is an unbeatable "0:00" at
    // rank #1 that best-merge can never displace. Skip the post, still surface
    // the public board. (highIsGood 0 is legitimate — bottom of the board.)
    if (!isFinite(raw) || (lowIsGood && raw <= 0)) {
      try { showPanel({ score: null, result: null, md: md, signedIn: true, explicit: true }); } catch (_) {}
      return Promise.resolve(null);
    }
    var meta = {};
    if (payload.metadata && typeof payload.metadata === "object") {
      for (var k in payload.metadata) {
        if (Object.prototype.hasOwnProperty.call(payload.metadata, k)) meta[k] = String(payload.metadata[k]);
      }
    }
    var enriched = {
      score: raw,
      metadata: meta,
      scoreType: scoreTypeFor(md),
      scoreUnit: scoreUnitFor(md),
      contentType: payload.contentType || "miniApp",
    };
    return nativeSubmit(enriched).then(function (result) {
      try { showPanel({ score: enriched.score, result: result, md: md, signedIn: true, explicit: true }); } catch (_) {}
      return result;
    }, function (err) {
      // Not signed in (or transient) — still surface the board + a save CTA.
      try { showPanel({ score: enriched.score, result: null, md: md, signedIn: false, explicit: true }); } catch (_) {}
      throw err;
    });
  };

  // ── Panel ─────────────────────────────────────────────────────────────────
  var PANEL_ID = "__mchatai-gameover-top3__";
  var panelUp = false;
  // Per-PANEL flags (reset on removal), NOT a session latch: submitTriggeredPanel
  // keeps a submit()-opened card sticky (no auto-remove on restart, since a
  // time/score game may show no recognized restart text); panelSawGameOverText
  // lets a submit panel auto-hide on restart when the game ALSO shows recognized
  // game-over text. Mirrors mchataiweb's server bridge.
  var submitTriggeredPanel = false;
  var panelSawGameOverText = false;

  function removePanel() {
    var el = document.getElementById(PANEL_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    panelUp = false;
    submitTriggeredPanel = false;
    panelSawGameOverText = false;
  }

  function addCloseBtn(card) {
    var x = document.createElement("button");
    x.type = "button";
    x.setAttribute("aria-label", "Close leaderboard");
    x.textContent = "×";
    x.style.cssText = "position:absolute;top:5px;right:6px;width:30px;height:30px;line-height:27px;text-align:center;border:none;background:transparent;color:rgba(226,232,240,0.75);font-size:22px;font-weight:700;cursor:pointer;padding:0;border-radius:8px;";
    x.onclick = removePanel;
    card.appendChild(x);
  }

  // opts = { score, result|null, md, signedIn, explicit?, topOnly? }
  function showPanel(opts) {
    if (panelUp) removePanel();
    panelUp = true;
    if (opts && opts.explicit) submitTriggeredPanel = true;
    var md = (opts && opts.md) || mode();

    var card = document.createElement("div");
    card.id = PANEL_ID;
    card.style.cssText = "position:fixed;left:50%;top:max(16px,env(safe-area-inset-top,16px));transform:translateX(-50%);z-index:2147483600;background:rgba(15,23,42,0.96);color:#f8fafc;border:1px solid rgba(148,163,184,0.22);border-radius:14px;padding:14px 18px;max-width:340px;width:calc(100% - 32px);box-shadow:0 12px 32px rgba(0,0,0,0.5);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;";
    card.innerHTML = '<div style="font-size:12px;opacity:0.75;text-align:center;padding:8px 0">Loading leaderboard…</div>';
    document.body.appendChild(card);
    document.addEventListener("keydown", onEsc);

    lb.getTop(3).then(function (res) {
      var rows = (res && res.scores) || [];
      renderCard(card, opts, md, rows);
    }, function () {
      renderCard(card, opts, md, []);
    });
  }

  function onEsc(e) { if (e.key === "Escape" || e.key === "Esc") { removePanel(); document.removeEventListener("keydown", onEsc); } }

  function renderCard(card, opts, md, rows) {
    card.innerHTML = "";
    addCloseBtn(card);
    var signedIn = !!(opts && opts.signedIn);
    var result = opts && opts.result;
    var score = opts ? opts.score : null;

    var header = document.createElement("div");
    header.style.cssText = "font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(148,163,184,0.9);font-weight:700;margin-bottom:6px;text-align:center";
    header.textContent = (signedIn && result) ? "Your rank" : (md === "fastest" ? "Fastest times" : "Top scores");
    card.appendChild(header);

    if (signedIn && result && result.rank != null) {
      var rankRow = document.createElement("div");
      rankRow.style.cssText = "text-align:center;font-size:16px;margin-bottom:10px;padding:10px 12px;background:rgba(251,191,36,0.10);border-radius:8px;";
      var rankLabel = result.rank === 1
        ? '#<strong style="color:#fbbf24;font-size:22px">1</strong>'
        : '#<strong style="color:#fbbf24;font-size:22px">' + result.rank + '</strong> of ' + (result.totalPlayers || rows.length);
      var lines = ['<div>' + rankLabel + '</div>'];
      if (score != null) {
        var noun = md === "fastest" ? "Your time" : "Your score";
        lines.push('<div style="font-size:13px;opacity:0.92;margin-top:4px">' + noun + ': <strong style="color:#fbbf24">' + fmtScore(score, md) + '</strong></div>');
      }
      rankRow.innerHTML = lines.join("");
      card.appendChild(rankRow);
    }

    if (rows.length > 0) {
      var list = document.createElement("div");
      list.style.cssText = "display:flex;flex-direction:column;gap:3px;";
      rows.slice(0, 3).forEach(function (entry, idx) {
        var row = document.createElement("div");
        row.style.cssText = "display:flex;justify-content:space-between;gap:12px;font-size:13px;padding:4px 8px;border-radius:6px;";
        var medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉";
        row.innerHTML = '<span style="opacity:0.92">' + medal + " " + escapeHtml(entry.displayName || "Player") + '</span><span style="font-variant-numeric:tabular-nums">' + fmtScore(entry.score, md) + "</span>";
        list.appendChild(row);
      });
      card.appendChild(list);
    } else if (!signedIn) {
      var empty = document.createElement("div");
      empty.style.cssText = "text-align:center;font-size:13px;opacity:0.8;padding:4px 0";
      empty.textContent = "No scores yet.";
      card.appendChild(empty);
    }

    if (!signedIn) {
      var cta = document.createElement("div");
      cta.style.cssText = "margin-top:10px;padding:10px 12px;background:rgba(251,191,36,0.14);border:1px solid rgba(251,191,36,0.38);border-radius:8px;text-align:center;font-size:12px;line-height:1.4";
      var youScored = (score != null && score > 0)
        ? ((md === "fastest" ? "Your time was " : "You scored ") + "<strong>" + fmtScore(score, md) + "</strong>. ")
        : "";
      cta.innerHTML = youScored + "Sign in in the mChatAI app to save your score on the leaderboard.";
      card.appendChild(cta);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ── Game-over text watcher ────────────────────────────────────────────────
  // Fallback for games that show a game-over screen but never call submit()
  // (or a loss with no submit): surface the public top-3 so the leaderboard is
  // still discoverable. Never posts a score.
  //
  // CAPABILITY-GATED: only runs when the app declares a leaderboard via the
  // meta tag. Without this gate the 800ms watcher runs on EVERY injected
  // mini-app and would pop a spurious board whenever a non-game app happens to
  // show "game over"-like text. Games that use submit() without a meta tag
  // still get the submit()-triggered panel above; they just skip the fallback.
  function checkGameOver() {
    var over = false;
    try { over = GAME_OVER_RE.test(document.body ? document.body.innerText : ""); } catch (_) {}
    if (over) {
      if (!panelUp) showPanel({ score: null, result: null, md: mode(), signedIn: true, topOnly: true });
      else panelSawGameOverText = true;   // recognized text alongside the current panel → can auto-hide on restart
    } else if (panelUp && (!submitTriggeredPanel || panelSawGameOverText)) {
      removePanel();   // restart: remove text-triggered panels, and submit panels that saw recognized text
    }
  }
  if (document.querySelector('meta[name="mchatai-leaderboard-mode"]')) {
    setInterval(checkGameOver, 800);
  }
})();
