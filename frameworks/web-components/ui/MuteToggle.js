// ui.mute-toggle — small mute/unmute pill for mini-app games that use
// AudioManager. v0.1 ships alongside recipe.with-sound-effects (Phase 1C
// of the enhancement-offers framework, 2026-05-12).
//
// USAGE
//   import { AudioManager } from "../resources/AudioManager.js";
//   import { MuteToggle } from "./MuteToggle.js";
//   const audio = new AudioManager();
//   MuteToggle.mount(document.body, { audio });
//
// The toggle floats top-right (offset 12px) by default. Override placement
// via the `host` argument + your own positioning if needed. Persists mute
// state via AudioManager.setMuted (which writes localStorage).

/* BEGIN mChatAI Web Component: ui.mute-toggle */
export const MuteToggle = {
  mount(host, { audio, position } = {}) {
    if (!host || !audio) return null;
    if (host.querySelector("[data-mchatai-mute-toggle]")) {
      return host.querySelector("[data-mchatai-mute-toggle]");
    }

    const btn = document.createElement("button");
    btn.dataset.mchataiMuteToggle = "1";
    btn.type = "button";
    btn.setAttribute("aria-label", audio.isMuted() ? "Unmute sound" : "Mute sound");
    btn.style.cssText = [
      "position:fixed",
      position?.top ? `top:${position.top}` : "top:12px",
      position?.right ? `right:${position.right}` : "right:12px",
      "z-index:9999",
      "width:34px",
      "height:34px",
      "border-radius:50%",
      "border:none",
      "background:rgba(15,23,42,0.75)",
      "color:#fff",
      "cursor:pointer",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "font-size:16px",
      "line-height:1",
      "user-select:none",
      "transition:background 0.15s ease, transform 0.1s ease",
      "box-shadow:0 1px 3px rgba(0,0,0,0.3)"
    ].join(";");

    const render = () => {
      btn.textContent = audio.isMuted() ? "🔇" : "🔊";
      btn.setAttribute("aria-pressed", audio.isMuted() ? "true" : "false");
      btn.setAttribute("aria-label", audio.isMuted() ? "Unmute sound" : "Mute sound");
    };
    render();

    btn.addEventListener("click", () => {
      audio.toggleMuted();
      // The first click on iOS Safari is the user-gesture that unlocks
      // AudioContext — play a tiny click so the user gets immediate
      // feedback that audio works.
      if (!audio.isMuted()) {
        try { audio.sfx("click"); } catch (_) {}
      }
      render();
    });
    btn.addEventListener("mouseenter", () => { btn.style.background = "rgba(15,23,42,0.92)"; });
    btn.addEventListener("mouseleave", () => { btn.style.background = "rgba(15,23,42,0.75)"; });

    host.appendChild(btn);
    return btn;
  }
};
/* END mChatAI Web Component: ui.mute-toggle */
