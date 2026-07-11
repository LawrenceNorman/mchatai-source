/*
 * leaderboard-preview-bridge.js  (Phase LB-PREVIEW, 2026-07-10)
 *
 * DEV-ONLY preview layer for the hub leaderboard. The REAL leaderboard is
 * server-injected by mchataiweb serveUserProject at serve time (the trophy pill,
 * top-scores panel, game-over rank card, and window.mChatAI.leaderboard DOM-polling
 * auto-submit). macOS never injects that (RULE #1), so in LOCAL preview a correctly-
 * built game (meta tag + score element + "Game Over" text, no bespoke board) shows
 * NOTHING  -  which reads as "the leaderboard didn't get added." This bridge closes
 * that verifiability gap: it replays the server bridge's behavior against a LOCAL
 * mock (localStorage), clearly labeled PREVIEW, so an author can SEE the leaderboard
 * work before publishing. It never talks to the real backend and never ships to the
 * hub (the hub uses the real server bridge).
 *
 * Self-gating: activates only when the app declares a leaderboard (meta tag) or has a
 * score element the server bridge would read. No-op for everything else.
 */
(function () {
  "use strict";
  if (window.__mchataiPreviewLeaderboard) return;      // idempotent
  window.__mchataiPreviewLeaderboard = true;

  var GAME_OVER_RE = /(game\s*over|you\s*(win|won|lose|lost|died)|you\s*reached|final\s*score|victory|defeat|caught|you\s*escaped|time'?s?\s*up)/i;
  var SCORE_SELECTORS = ["[data-mchatai-score]", "#final-score", "#finalScore", "#score", "#points"];

  function boot() {
    var meta = document.querySelector('meta[name="mchatai-leaderboard-mode"]');
    var mode = (meta && meta.getAttribute("content")) || "default"; // default|winstreak|fastest|fewest-moves
    var scoreEl = firstScoreEl();
    // Only activate for games that actually declare/expose a leaderboard signal.
    if (!meta && !scoreEl) return;

    var key = "__mchatai_preview_lb__" + (location.pathname || "app") + "|" + (document.title || "");
    var lowerBetter = (mode === "fastest" || mode === "fewest-moves");
    var lastOver = false;

    injectStyles();
    var pill = injectPill();
    pollLoop();

    function firstScoreEl() {
      for (var i = 0; i < SCORE_SELECTORS.length; i++) {
        var el = document.querySelector(SCORE_SELECTORS[i]);
        if (el) return el;
      }
      // substring fallback (id/class contains 'score')
      var cands = document.querySelectorAll('[id*="core"],[class*="core"]');
      for (var j = 0; j < cands.length; j++) {
        if (/score/i.test(cands[j].id + " " + cands[j].className)) return cands[j];
      }
      return null;
    }

    function readScore() {
      var el = firstScoreEl();
      if (!el) return null;
      var raw = (el.getAttribute && el.getAttribute("data-mchatai-score")) || el.textContent || "";
      var m = String(raw).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
      return m ? parseFloat(m[0]) : null;
    }

    function load() { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch (_) { return []; } }
    function save(a) { try { localStorage.setItem(key, JSON.stringify(a.slice(0, 20))); } catch (_) {} }

    function record(score) {
      var rows = load();
      rows.push({ score: score, at: Date.now() });
      rows.sort(function (a, b) { return lowerBetter ? a.score - b.score : b.score - a.score; });
      save(rows);
      var rank = rows.findIndex(function (r) { return r.at === rows[rows.length - 1].at; });
      // recompute rank of THIS score deterministically
      rank = 1;
      for (var i = 0; i < rows.length; i++) {
        if (lowerBetter ? rows[i].score < score : rows[i].score > score) rank++;
      }
      return { rows: rows, rank: rank, total: rows.length };
    }

    function pollLoop() {
      setInterval(function () {
        var over = GAME_OVER_RE.test(visibleText());
        if (over && !lastOver) onGameOver();
        lastOver = over;
      }, 800);
    }

    function visibleText() {
      // Only text that is actually shown (skip display:none panels).
      var t = "";
      var overlays = document.querySelectorAll("body *");
      for (var i = 0; i < overlays.length && i < 4000; i++) {
        var e = overlays[i];
        if (e.children.length === 0 && e.offsetParent !== null) t += " " + (e.textContent || "");
      }
      return t;
    }

    function onGameOver() {
      var score = readScore();
      if (score === null || isNaN(score)) score = 0;
      var res = record(score);
      showPanel(score, res.rank, res.total, res.rows);
    }

    // ---- UI ----
    function injectPill() {
      var b = document.createElement("button");
      b.className = "mch-lb-pill";
      b.type = "button";
      b.innerHTML = "🏆 <span>Leaderboard</span>";
      b.title = "Preview leaderboard (local). Real scores appear when you publish.";
      b.addEventListener("click", function () {
        var rows = load();
        showPanel(rows.length ? rows[0].score : null, rows.length ? 1 : 0, rows.length, rows, true);
      });
      document.body.appendChild(b);
      return b;
    }

    function showPanel(score, rank, total, rows, browseOnly) {
      var old = document.querySelector(".mch-lb-panel");
      if (old) old.remove();
      var wrap = document.createElement("div");
      wrap.className = "mch-lb-panel";
      var list = rows.slice(0, 5).map(function (r, i) {
        var me = (!browseOnly && r.score === score && i + 1 === rank);
        return '<li' + (me ? ' class="me"' : "") + '><b>' + (i + 1) + "</b>" +
          fmt(r.score) + "</li>";
      }).join("");
      wrap.innerHTML =
        '<div class="mch-lb-head">🏆 Leaderboard <span class="mch-lb-tag">PREVIEW</span></div>' +
        (browseOnly ? "" : '<div class="mch-lb-you">Your score: <b>' + fmt(score) + "</b> &middot; rank <b>#" + rank + "</b> of " + total + "</div>") +
        '<ol class="mch-lb-list">' + (list || "<li>No scores yet  -  finish a game.</li>") + "</ol>" +
        '<div class="mch-lb-note">Local preview only. When you <b>Publish</b> &amp; sign in at mchatai.com, real player scores show here.</div>' +
        '<button class="mch-lb-close" type="button">Close</button>';
      wrap.querySelector(".mch-lb-close").addEventListener("click", function () { wrap.remove(); });
      document.body.appendChild(wrap);
    }

    function fmt(s) {
      if (s === null || s === undefined) return "-";
      if (mode === "fastest" && s > 0) { var m = Math.floor(s / 60), sec = (s % 60).toFixed(2); return " " + (m ? m + ":" + (sec < 10 ? "0" : "") : "") + sec + "s"; }
      return " " + s;
    }

    function injectStyles() {
      var css = document.createElement("style");
      css.textContent =
        ".mch-lb-pill{position:fixed;top:10px;right:10px;z-index:2147483000;background:rgba(20,20,28,.82);color:#ffd54a;border:1px solid rgba(255,213,74,.4);border-radius:20px;padding:6px 12px;font:600 13px system-ui,sans-serif;cursor:pointer;display:flex;gap:5px;align-items:center;backdrop-filter:blur(6px)}" +
        ".mch-lb-pill span{color:#eee}" +
        ".mch-lb-panel{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2147483001;min-width:260px;max-width:340px;background:rgba(18,18,26,.97);color:#eee;border:1px solid rgba(255,213,74,.35);border-radius:14px;padding:18px 20px;font:14px system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.6)}" +
        ".mch-lb-head{font-size:18px;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:8px}" +
        ".mch-lb-tag{font-size:10px;letter-spacing:.08em;background:#ffd54a;color:#111;border-radius:4px;padding:2px 6px;font-weight:800}" +
        ".mch-lb-you{margin-bottom:10px;color:#ffd54a}" +
        ".mch-lb-list{list-style:none;margin:0 0 10px;padding:0;font-variant-numeric:tabular-nums}" +
        ".mch-lb-list li{display:flex;gap:10px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.06)}" +
        ".mch-lb-list li b{color:#ffd54a;min-width:20px}" +
        ".mch-lb-list li.me{color:#8fffb0}" +
        ".mch-lb-note{font-size:11px;color:#9aa;line-height:1.5;margin-bottom:12px}" +
        ".mch-lb-close{width:100%;background:#2a2a38;color:#eee;border:0;border-radius:8px;padding:8px;cursor:pointer;font:600 13px system-ui}";
      document.head.appendChild(css);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
