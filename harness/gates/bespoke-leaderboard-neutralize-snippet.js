/* mChatAI reinvention gate -- bespoke-leaderboard neutralize (v2 2026-07-23: data + UI)
 *
 * Fires only when a build shipped BOTH a bespoke localStorage score table AND the hub
 * leaderboard hooks (the <meta name="mchatai-leaderboard-mode"> tag / window.mChatAI.leaderboard).
 * On the community hub the server injects the REAL cross-player board, so the local one
 * double-renders (the "TOP 5 TIMES" duplicate the user reported on weir-rabbit).
 *
 * TWO neutralizations, hub-only (where window.mChatAI.leaderboard exists), strict no-op off
 * the hub (offline preview keeps the local board):
 *   1. DATA: no-op localStorage reads/writes for clearly leaderboard-ish keys, so the local
 *      table can't populate. Never touches non-leaderboard storage (settings/save/progress).
 *   2. UI (v2): hide the bespoke NAME/INITIALS entry prompt. The server board uses the
 *      signed-in account name, so a manual name box is dead (its save is no-op'd by #1) AND
 *      confusing -- the user reported being asked to type a name that goes nowhere. We hide
 *      the SMALLEST container that holds a text <input> whose surrounding text reads like a
 *      high-score name prompt ("New high score! Add your name", "Enter your initials", etc.).
 *      That signal is specific to a bespoke score prompt and does not match ordinary game
 *      inputs. Pre-hides before the game un-hides it (display:none !important wins), and a
 *      MutationObserver catches prompts mounted later. NEVER touches the hub's own mchatai UI
 *      or the game canvas.
 *
 * Idempotent via window.__mchataiLBNeutralize2 (bumped from v1 so a re-publish of an
 * already-v1-neutralized build picks up the UI half). The local board *list* container is
 * left alone (it renders empty on the hub); the gate still flags a re-iterate hint to drop it.
 */
(function () {
  if (window.__mchataiLBNeutralize2) { return; }
  window.__mchataiLBNeutralize2 = 1;

  var KEY_RE = /(leaderboard|high[_\- ]?score|hi[_\- ]?score|top[_\- ]?(scores?|times?)|best[_\- ]?(score|time)|bestscore|besttime)/i;

  function onHub() {
    // The hub (and the dev leaderboard-preview bridge) expose window.mChatAI.leaderboard.
    // Off the hub this is falsy, so the local board keeps working in offline preview.
    try { return !!(window.mChatAI && window.mChatAI.leaderboard); } catch (e) { return false; }
  }

  // 1) DATA de-dupe: no-op leaderboard-key localStorage on the hub.
  var proto = window.Storage && window.Storage.prototype;
  if (proto) {
    var _get = proto.getItem, _set = proto.setItem;
    proto.getItem = function (k) {
      if (onHub() && typeof k === 'string' && KEY_RE.test(k)) { return null; }
      return _get.apply(this, arguments);
    };
    proto.setItem = function (k, v) {
      if (onHub() && typeof k === 'string' && KEY_RE.test(k)) { return; }
      return _set.apply(this, arguments);
    };
  }

  // 2) UI suppression: hide the bespoke name/initials entry prompt on the hub.
  if (!onHub()) { return; }

  // Text that marks a bespoke high-score NAME prompt. Deliberately narrow: it must read like
  // score-name entry, not merely contain "name" (a plain username/chat field won't match).
  var ENTRY_RE = /(high[\- ]?score|hi[\- ]?score|new\s+(record|high)|top\s+score|(add|enter|type)\s+your\s+(name|initials?)|your\s+(name|initials?)\b|save\s+(your\s+)?score|made\s+the\s+board)/i;
  var SKIP_INPUT = { button: 1, submit: 1, checkbox: 1, radio: 1, range: 1, color: 1, file: 1, hidden: 1, number: 1 };

  function hubOwn(el) {
    for (var n = el; n; n = n.parentElement) {
      var cn = n.className;
      var cs = (typeof cn === 'string') ? cn : (cn && cn.baseVal) || '';
      if (/mchatai/i.test((n.id || '') + ' ' + cs)) { return true; }
    }
    return false;
  }

  function hideEntryFor(inp) {
    try {
      var type = ((inp.getAttribute && inp.getAttribute('type')) || 'text').toLowerCase();
      if (SKIP_INPUT[type]) { return; }
      // Walk up to the nearest ancestor whose OWN text reads like a score-name prompt, and
      // hide THAT (the label + input + save button), not the whole game-over overlay.
      var el = inp.parentElement, hops = 0;
      while (el && hops < 5) {
        if (!hubOwn(el) && ENTRY_RE.test((el.textContent || '').slice(0, 400))) {
          el.style.setProperty('display', 'none', 'important');
          return;
        }
        el = el.parentElement; hops++;
      }
    } catch (e) {}
  }

  function sweep(root) {
    try {
      var ins = root.querySelectorAll ? root.querySelectorAll('input') : [];
      for (var i = 0; i < ins.length; i++) { hideEntryFor(ins[i]); }
    } catch (e) {}
  }

  function start() {
    sweep(document);
    try {
      new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var m = muts[i];
          for (var j = 0; j < m.addedNodes.length; j++) {
            var n = m.addedNodes[j];
            if (n.nodeType === 1) {
              if (n.tagName === 'INPUT') { hideEntryFor(n); }
              else if (n.querySelectorAll) { sweep(n); }
            }
          }
          // A prompt commonly appears by removing a `hidden` class → re-scan its inputs.
          if (m.type === 'attributes' && m.target && m.target.querySelectorAll) { sweep(m.target); }
        }
      }).observe(document.documentElement, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden']
      });
    } catch (e) {}
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', start); }
  else { start(); }
})();
