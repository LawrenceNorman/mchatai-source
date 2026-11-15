// BEGIN mchatai-web-components: ui.podcast-player (ui/learning/PodcastPlayer.js)
//
// <podcast-player>: plays a two-voice Teacher/Learner podcast script (podcast-script.v1, the ED.8 service's output,
// mchatai_macOS/docs/EDUCATION_CLOUD_SERVICES.md) with the listener's own browser voices. Free, on the device, no
// audio file and no network beyond `src`: the "free unless it costs" rule. The transcript is always shown, so it
// also works where a browser cannot speak, and for anyone who would rather read.
//
// A WEB CUSTOM ELEMENT, like <quiz-block> beside it: load this one script (classic or module) and write the tag.
//
// Usage, three ways to give it the script:
//   <podcast-player><script type="application/json">{ "schema": "podcast-script.v1", "sections": [ … ] }</script></podcast-player>
//   <podcast-player src="podcast/07.json"></podcast-player>     the script, or the service's whole reply ({ script })
//   el.script = script;                                         from code
//   el.text = "TEACHER: …\nLEARNER: …";                         the TEACHER:/LEARNER: text form also works
//
// Attributes: src · rate (0.5–2, default 1) · teacher-voice / learner-voice (part of a voice name to prefer)
//             · lang (default "en")
// Events (bubble, composed): "podcast-line" { index, speaker } · "podcast-end" {}
// Theming: --pod-accent --pod-bg --pod-text --pod-muted --pod-line --pod-radius --pod-font --pod-on-accent
(function () {
  "use strict";
  if (typeof window === "undefined" || !window.customElements || window.customElements.get("podcast-player")) return;

  const SPEAKERS = { teacher: "Teacher", learner: "Learner" };
  const GAP_MS = 220; // a breath between turns

  function parseText(text) {
    const sections = [];
    let current = { heading: "", lines: [] };
    let title = "";
    for (const raw of String(text || "").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("# ") && !title) { title = line.slice(2).trim(); continue; }
      if (line.startsWith("## ")) {
        if (current.lines.length) sections.push(current);
        current = { heading: line.slice(3).trim(), lines: [] };
        continue;
      }
      const m = line.match(/^(TEACHER|LEARNER):\s*(.+)$/i);
      if (m) current.lines.push({ speaker: m[1].toLowerCase(), text: m[2].replace(/\[pause [\d.]+\]/gi, "").trim() });
    }
    if (current.lines.length) sections.push(current);
    return { title: title || "Podcast", sections };
  }

  function normalize(input) {
    const s = input && input.script ? input.script : input;
    if (!s || !Array.isArray(s.sections)) return null;
    const lines = [];
    const sections = [];
    for (const sec of s.sections) {
      const start = lines.length;
      for (const l of Array.isArray(sec.lines) ? sec.lines : []) {
        const speaker = String(l && l.speaker || "").toLowerCase();
        const text = String(l && l.text || "").trim();
        if (text && SPEAKERS[speaker]) lines.push({ speaker, text });
      }
      if (lines.length > start) sections.push({ heading: String(sec.heading || ""), start });
    }
    return lines.length ? { title: String(s.title || "Podcast"), lines, sections } : null;
  }

  const CSS = `
    :host { display:block; --_accent:var(--pod-accent,#0b6e8c); --_bg:var(--pod-bg,#fffdf8); --_text:var(--pod-text,#1c2227);
      --_muted:var(--pod-muted,#5d6970); --_line:var(--pod-line,#e3ddd0); --_radius:var(--pod-radius,12px);
      --_on:var(--pod-on-accent,#fff); font:var(--pod-font,16px/1.55 -apple-system,"Segoe UI",system-ui,sans-serif); color:var(--_text); }
    @media (prefers-color-scheme: dark) { :host { --_bg:var(--pod-bg,#1b1d1f); --_text:var(--pod-text,#e9e6df); --_muted:var(--pod-muted,#a3a8ab); --_line:var(--pod-line,#34383b); } }
    .card { background:var(--_bg); border:1px solid var(--_line); border-radius:var(--_radius); padding:16px; }
    .top { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
    h3 { margin:0; font-size:1.05em; flex:1 1 200px; }
    button { font:inherit; border-radius:999px; border:1px solid var(--_line); background:transparent; color:var(--_text); padding:6px 12px; cursor:pointer; }
    button.play { background:var(--_accent); color:var(--_on); border-color:var(--_accent); min-width:84px; }
    button:focus-visible, li:focus-visible { outline:2px solid var(--_accent); outline-offset:2px; }
    .status { color:var(--_muted); font-size:.85em; margin:8px 0 0; }
    ol { list-style:none; margin:12px 0 0; padding:0; max-height:24em; overflow:auto; }
    li { padding:6px 8px; border-radius:8px; cursor:pointer; }
    li[aria-current="true"] { background:color-mix(in srgb, var(--_accent) 14%, transparent); }
    li b { color:var(--_accent); font-size:.8em; letter-spacing:.04em; text-transform:uppercase; margin-right:6px; }
    .h { color:var(--_muted); font-size:.8em; text-transform:uppercase; letter-spacing:.06em; margin:12px 8px 2px; cursor:default; }
  `;

  class PodcastPlayer extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._data = null;
      this._index = 0;
      this._playing = false;
      this._token = 0; // a cancelled line's onend must not advance
    }

    connectedCallback() {
      if (this._started) return;
      this._started = true;
      for (const p of ["script", "text"]) {
        if (Object.prototype.hasOwnProperty.call(this, p)) { const v = this[p]; delete this[p]; this[p] = v; }
      }
      if (this._data) return this._render();
      // Loaded in <head>, the element connects before the parser reaches its inline JSON child: wait for it.
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => this._load(), { once: true });
        return;
      }
      this._load();
    }

    _load() {
      if (this._data) return this._render();
      const inline = this.querySelector('script[type="application/json"]');
      if (inline) { try { this.script = JSON.parse(inline.textContent); return; } catch (_) { /* fall through */ } }
      const src = this.getAttribute("src");
      if (src) {
        this._message("Loading…");
        fetch(src).then((r) => r.json()).then((j) => { this.script = j; }).catch(() => this._message("The podcast could not be loaded."));
      } else this._message("No podcast to play.");
    }

    disconnectedCallback() { this._stop(); }

    set script(v) { this._data = normalize(v); this._index = 0; if (this.isConnected) this._render(); }
    get script() { return this._data; }
    set text(v) { this.script = parseText(v); }

    _synth() { return typeof window.speechSynthesis === "object" && window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function" ? window.speechSynthesis : null; }

    // Two different voices in the page's language; an attribute can prefer one by name.
    _voices() {
      const synth = this._synth();
      const all = synth ? synth.getVoices() : [];
      const lang = (this.getAttribute("lang") || "en").toLowerCase();
      const pool = all.filter((v) => String(v.lang || "").toLowerCase().startsWith(lang));
      const list = pool.length ? pool : all;
      const prefer = (attr) => { const want = (this.getAttribute(attr) || "").toLowerCase(); return want ? list.find((v) => v.name.toLowerCase().includes(want)) : null; };
      const teacher = prefer("teacher-voice") || list.find((v) => v.default) || list[0] || null;
      const learner = prefer("learner-voice") || list.find((v) => v !== teacher) || teacher;
      return { teacher, learner };
    }

    _message(text) {
      this.shadowRoot.innerHTML = `<style>${CSS}</style><div class="card"><p class="status" role="status"></p></div>`;
      this.shadowRoot.querySelector(".status").textContent = text;
    }

    _render() {
      const d = this._data;
      if (!d) return this._message("This podcast has no lines to play.");
      const root = this.shadowRoot;
      root.innerHTML = `<style>${CSS}</style><div class="card">
        <div class="top"><h3></h3>
          <button class="prev" type="button" aria-label="Previous line">‹</button>
          <button class="play" type="button"></button>
          <button class="next" type="button" aria-label="Next line">›</button></div>
        <p class="status" role="status"></p><ol></ol></div>`;
      root.querySelector("h3").textContent = d.title;
      const ol = root.querySelector("ol");
      const starts = new Map(d.sections.map((s) => [s.start, s.heading]));
      d.lines.forEach((l, i) => {
        if (starts.get(i)) { const h = document.createElement("li"); h.className = "h"; h.setAttribute("role", "presentation"); h.textContent = starts.get(i); ol.appendChild(h); }
        const li = document.createElement("li");
        li.tabIndex = 0;
        li.dataset.i = String(i);
        const b = document.createElement("b"); b.textContent = SPEAKERS[l.speaker];
        li.append(b, document.createTextNode(l.text));
        li.addEventListener("click", () => this._jump(i));
        li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this._jump(i); } });
        ol.appendChild(li);
      });
      root.querySelector(".play").addEventListener("click", () => (this._playing ? this._pause() : this._play()));
      root.querySelector(".prev").addEventListener("click", () => this._jump(Math.max(0, this._index - 1)));
      root.querySelector(".next").addEventListener("click", () => this._jump(Math.min(d.lines.length - 1, this._index + 1)));
      if (!this._synth()) root.querySelector(".play").disabled = true;
      this._update();
    }

    _update() {
      const root = this.shadowRoot;
      const d = this._data;
      if (!d || !root.querySelector(".play")) return;
      const synth = this._synth();
      root.querySelector(".play").textContent = this._playing ? "Pause" : this._paused ? "Resume" : "Play";
      root.querySelector(".status").textContent = synth
        ? `Line ${this._index + 1} of ${d.lines.length} · read aloud by this device's voices`
        : "This browser cannot read aloud. The script is below.";
      for (const li of root.querySelectorAll("li[data-i]")) {
        const on = Number(li.dataset.i) === this._index;
        li.setAttribute("aria-current", on ? "true" : "false");
        if (on && this._playing && typeof li.scrollIntoView === "function") li.scrollIntoView({ block: "nearest" });
      }
    }

    _play() {
      const synth = this._synth();
      if (!synth || !this._data) return;
      this._playing = true;
      this._paused = false;
      this._speak();
    }

    _pause() { this._stop(); this._paused = true; this._update(); }

    _stop() {
      this._playing = false;
      this._token += 1;
      const synth = this._synth();
      if (synth) synth.cancel();
    }

    _jump(i) {
      const was = this._playing;
      this._stop();
      this._index = i;
      if (!was) this._paused = true; // a chosen line is where Resume starts
      if (was) this._play(); else this._update();
    }

    _speak() {
      const synth = this._synth();
      const d = this._data;
      if (!this._playing || !synth) return;
      if (this._index >= d.lines.length) {
        this._playing = false; this._paused = false; this._index = 0; this._update();
        this.dispatchEvent(new CustomEvent("podcast-end", { bubbles: true, composed: true, detail: {} }));
        return;
      }
      const line = d.lines[this._index];
      const token = ++this._token;
      const u = new window.SpeechSynthesisUtterance(line.text);
      const voices = this._voices();
      const voice = voices[line.speaker];
      if (voice) { u.voice = voice; u.lang = voice.lang; }
      const rate = parseFloat(this.getAttribute("rate"));
      u.rate = Number.isFinite(rate) ? Math.min(Math.max(rate, 0.5), 2) : 1;
      // The second voice is told apart by pitch too, where a device has only one voice.
      if (voices.teacher === voices.learner && line.speaker === "learner") u.pitch = 1.25;
      const next = () => {
        if (token !== this._token || !this._playing) return;
        this._index += 1;
        setTimeout(() => this._speak(), GAP_MS);
      };
      u.onend = next;
      u.onerror = next;
      this._update();
      this.dispatchEvent(new CustomEvent("podcast-line", { bubbles: true, composed: true, detail: { index: this._index, speaker: line.speaker } }));
      synth.speak(u);
    }
  }

  window.customElements.define("podcast-player", PodcastPlayer);
  window.PodcastPlayer = PodcastPlayer;
})();
// END mchatai-web-components: ui.podcast-player
