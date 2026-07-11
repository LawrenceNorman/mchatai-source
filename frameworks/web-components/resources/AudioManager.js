export class AudioManager {
  constructor(options = {}) {
    this.context = null;
    this.masterVolume = options.masterVolume ?? 0.08;
    this.enabled = options.enabled !== false;
    this._installGestureUnlock();
  }

  // Self-unlock (2026-07-10): browsers start an AudioContext SUSPENDED and reject
  // resume() outside a user gesture, so a game whose FIRST sfx() fires from the
  // render loop (not a tap/key) plays into a dead context = silence. Rather than
  // require every game to prime audio from a gesture handler (a step generators
  // routinely forget — see wisdom se-003), the manager resumes itself on the first
  // pointer/key/touch, once. No-op off-DOM (SSR/tests).
  _installGestureUnlock() {
    if (this._unlockInstalled || typeof globalThis.addEventListener !== "function") return;
    this._unlockInstalled = true;
    const events = ["pointerdown", "keydown", "touchstart", "mousedown", "click"];
    const unlock = () => {
      const ctx = this.ensureContext();
      if (ctx && ctx.state === "suspended") { try { ctx.resume(); } catch (_) {} }
      events.forEach((ev) => globalThis.removeEventListener(ev, unlock, true));
    };
    events.forEach((ev) => globalThis.addEventListener(ev, unlock, { capture: true, passive: true }));
  }

  ensureContext() {
    if (!this.enabled) {
      return null;
    }
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }
    if (!this.context) {
      this.context = new AudioContextClass();
    }
    return this.context;
  }

  beep(options = {}) {
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }
    const freq = options.freq ?? options.frequency ?? 440;
    const duration = options.duration ?? 0.08;
    const type = options.type || "square";
    const volume = options.volume ?? this.masterVolume;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (options.slideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, options.slideTo), now + duration);
    }
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  noise(options = {}) {
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }
    const duration = options.duration ?? 0.18;
    const volume = options.volume ?? this.masterVolume;
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain).connect(ctx.destination);
    source.start();
  }

  // ─── recipe.with-sound-effects v0.1 surface (2026-05-12) ──────────────────
  // Higher-level API the addon recipe documents. Mute state persists across
  // reloads via localStorage. iOS Safari resumes the AudioContext on first
  // user gesture — DO NOT call sfx() at module load time; wait for tap/key.

  // Lazy persistent-mute state. Read on first access; never throw on
  // localStorage failure (private browsing, sandboxed contexts).
  _mutedStorageKey() { return "__mchatai_audio_muted"; }

  isMuted() {
    if (typeof this._muted === "boolean") return this._muted;
    try {
      this._muted = localStorage.getItem(this._mutedStorageKey()) === "1";
    } catch (_) {
      this._muted = false;
    }
    return this._muted;
  }

  setMuted(value) {
    this._muted = !!value;
    try { localStorage.setItem(this._mutedStorageKey(), this._muted ? "1" : "0"); } catch (_) {}
  }

  toggleMuted() {
    this.setMuted(!this.isMuted());
    return this.isMuted();
  }

  // High-level SFX dispatcher used by the recipe.with-sound-effects addon.
  // Names map to common game events; unknown names play a soft default
  // tick so generators that pass through arbitrary event names still hear
  // SOMETHING during testing.
  sfx(name) {
    if (this.isMuted()) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      try { ctx.resume(); } catch (_) {}
    }
    switch (name) {
      case "score":
        this.beep({ freq: 660, slideTo: 880, duration: 0.18, type: "square", volume: this.masterVolume * 2 });
        break;
      case "hit":
        this.noise({ duration: 0.12, volume: this.masterVolume * 3 });
        break;
      case "gameover":
        this.beep({ freq: 440, slideTo: 110, duration: 0.6, type: "sawtooth", volume: this.masterVolume * 2 });
        break;
      case "levelup":
        // simple ascending arpeggio
        this.beep({ freq: 523.25, duration: 0.12, type: "triangle" });
        setTimeout(() => this.beep({ freq: 659.25, duration: 0.12, type: "triangle" }), 110);
        setTimeout(() => this.beep({ freq: 783.99, duration: 0.18, type: "triangle" }), 220);
        break;
      case "click":
        this.beep({ freq: 880, duration: 0.06, type: "sine", volume: this.masterVolume });
        break;
      case "powerup":
        this.beep({ freq: 440, slideTo: 1320, duration: 0.28, type: "triangle", volume: this.masterVolume * 2 });
        break;
      default:
        this.beep({ freq: 440, duration: 0.08, type: "sine", volume: this.masterVolume });
        break;
    }
  }
}
