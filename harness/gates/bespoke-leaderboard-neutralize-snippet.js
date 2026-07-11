/* mChatAI reinvention gate -- bespoke-leaderboard neutralize (Phase LB-GATE.DRY 2026-07-11)
 *
 * Fires only when a build shipped BOTH a bespoke localStorage score table AND the hub
 * leaderboard hooks (the <meta name="mchatai-leaderboard-mode"> tag / window.mChatAI.leaderboard).
 * On the community hub the server injects the REAL cross-player board, so the local one
 * double-renders (the "TOP 5 TIMES" duplicate the user reported on weir-rabbit). This
 * deterministically neutralizes the LOCAL table's DATA on the hub ONLY -- where
 * window.mChatAI.leaderboard exists -- by no-op'ing localStorage reads/writes for
 * leaderboard-ish keys, so the duplicate table can't populate. It is a strict NO-OP off
 * the hub (local dev / offline preview without the bridge) and it NEVER touches
 * non-leaderboard storage (settings, save-state, progress) -- only keys that clearly name a
 * score/leaderboard. Idempotent via window.__mchataiLBNeutralize.
 *
 * This is a data-level de-dupe, not a full strip: the empty local container may still show,
 * so the gate also flags the build with a re-iterate hint to remove the local UI entirely.
 */
(function () {
  if (window.__mchataiLBNeutralize) { return; }
  window.__mchataiLBNeutralize = 1;

  // Conservative: only names that clearly denote a score/leaderboard store. A game storing
  // "volume", "brightness", "savedGame", "progress" etc. is untouched.
  var KEY_RE = /(leaderboard|high[_\- ]?score|hi[_\- ]?score|top[_\- ]?(scores?|times?)|best[_\- ]?(score|time)|bestscore|besttime)/i;

  function onHub() {
    // The hub (and the dev leaderboard-preview bridge) expose window.mChatAI.leaderboard.
    // Off the hub this is falsy, so the local board keeps working in offline preview.
    try { return !!(window.mChatAI && window.mChatAI.leaderboard); } catch (e) { return false; }
  }

  var proto = window.Storage && window.Storage.prototype;
  if (!proto) { return; }
  var _get = proto.getItem;
  var _set = proto.setItem;

  proto.getItem = function (k) {
    if (onHub() && typeof k === 'string' && KEY_RE.test(k)) { return null; }
    return _get.apply(this, arguments);
  };
  proto.setItem = function (k, v) {
    if (onHub() && typeof k === 'string' && KEY_RE.test(k)) { return; }
    return _set.apply(this, arguments);
  };
})();
