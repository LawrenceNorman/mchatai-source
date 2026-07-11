/* mchatai output-gate audio-unlock (Phase LB-GATE, 2026-07-10)
 * Injected at the TOP of <head> by BespokeReinventionAuditor when a generated
 * game uses WebAudio but the model forgot the gesture-unlock (the #1 silent-audio
 * bug: an AudioContext boots SUSPENDED and rejects resume() outside a user gesture,
 * so a first sfx() fired from the render loop is silent). This wraps the AudioContext
 * constructor so EVERY context the app later creates is auto-resumed on the first
 * pointer/key/touch, once. Purely additive + idempotent  -  harmless if the app already
 * unlocks. Runs before the app's own scripts (head-top injection). */
(function () {
  if (window.__mchataiAudioUnlock) return;
  window.__mchataiAudioUnlock = true;
  var Native = window.AudioContext || window.webkitAudioContext;
  if (!Native) return;
  var contexts = [];
  function Patched() {
    var ctx = arguments.length ? new Native(arguments[0]) : new Native();
    contexts.push(ctx);
    return ctx;
  }
  Patched.prototype = Native.prototype;
  try {
    window.AudioContext = Patched;
    if (window.webkitAudioContext) window.webkitAudioContext = Patched;
  } catch (e) { return; } // some environments freeze these; bail harmlessly
  var events = ["pointerdown", "keydown", "touchstart", "mousedown", "click"];
  var done = false;
  function unlock() {
    if (done) return;
    done = true;
    for (var i = 0; i < contexts.length; i++) {
      try { if (contexts[i].state === "suspended") contexts[i].resume(); } catch (e) {}
    }
    events.forEach(function (ev) { window.removeEventListener(ev, unlock, true); });
  }
  events.forEach(function (ev) { window.addEventListener(ev, unlock, { capture: true, passive: true }); });
})();
