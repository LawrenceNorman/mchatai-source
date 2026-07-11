// BEGIN mChatAI Web Component: effects.audio-manager-3d
//
// Procedural sound for 3D games: ZERO audio files (the World of ClaudeCraft
// pattern). Every SFX is synthesized at play time from oscillator + gain +
// filter graphs with ADSR envelopes, so there are no .mp3/.wav fetches to break
// offline under file:// and no bytes to bloat the bundle. Optionally spatialized
// via THREE.PositionalAudio so sounds pan and attenuate with distance.
//
// Audio MUST start from a user gesture (Safari/iOS). This manager owns one
// AudioContext and hands it to core.three-game-loop via attachTo(loop), so the
// loop's existing first-tap unlock (resume + silent sample) does the unlocking.
// Until then play() is a safe no-op -- the game stays fully playable, just muted
// (tjs-012). Never block the render loop waiting on audio.
//
// Built-in preset bank: shoot, hit, explosion, pickup, coin, levelup, jump,
// footstep, ui, hurt, powerup. Add your own with defineSfx(name, spec).
//
// Offline-safe: THREE is optional (only needed for PositionalAudio). The synth
// is pure WebAudio.
//
// Usage:
//   import { AudioManager3D } from './effects/audio-manager-3d.js';
//   const audio = new AudioManager3D({ camera });    // camera optional (for 3D pan)
//   audio.attachTo(loop);                            // reuse the loop's tap-unlock
//   // gameplay:
//   audio.play('shoot');                             // 2D
//   audio.play('hit', { position: enemy.position }); // spatialized (needs camera+THREE)
//   audio.setMuted(true);                            // mute toggle (game stays playable)
//   audio.dispose();

// A compact ADSR oscillator voice spec. Each preset is {voices:[...], duration}.
// A voice: { type, freqStart, freqEnd, attack, decay, sustain, release, gain,
//            filter:{type,freq,q}, noise:bool, glideExp:bool }
const PRESETS = {
  shoot:    { duration: 0.18, voices: [{ type: 'square', freqStart: 880, freqEnd: 180, attack: 0.001, decay: 0.06, sustain: 0.0, release: 0.06, gain: 0.25, glideExp: true }] },
  hit:      { duration: 0.14, voices: [{ type: 'triangle', freqStart: 320, freqEnd: 120, attack: 0.001, decay: 0.05, sustain: 0.0, release: 0.05, gain: 0.3, glideExp: true }, { noise: true, attack: 0.001, decay: 0.04, sustain: 0, release: 0.02, gain: 0.15, filter: { type: 'bandpass', freq: 1200, q: 1.2 } }] },
  explosion:{ duration: 0.6,  voices: [{ noise: true, attack: 0.002, decay: 0.35, sustain: 0.0, release: 0.25, gain: 0.5, filter: { type: 'lowpass', freq: 600, q: 0.8 } }, { type: 'sine', freqStart: 90, freqEnd: 30, attack: 0.002, decay: 0.4, sustain: 0, release: 0.2, gain: 0.4, glideExp: true }] },
  pickup:   { duration: 0.2,  voices: [{ type: 'sine', freqStart: 660, freqEnd: 990, attack: 0.001, decay: 0.12, sustain: 0.0, release: 0.06, gain: 0.25, glideExp: true }] },
  coin:     { duration: 0.22, voices: [{ type: 'square', freqStart: 988, freqEnd: 988, attack: 0.001, decay: 0.04, sustain: 0.0, release: 0.02, gain: 0.18 }, { type: 'square', freqStart: 1319, freqEnd: 1319, attack: 0.05, decay: 0.12, sustain: 0.0, release: 0.06, gain: 0.18, delay: 0.05 }] },
  levelup:  { duration: 0.6,  voices: [{ type: 'triangle', freqStart: 523, freqEnd: 523, attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.1, gain: 0.22 }, { type: 'triangle', freqStart: 659, freqEnd: 659, attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.1, gain: 0.22, delay: 0.12 }, { type: 'triangle', freqStart: 784, freqEnd: 784, attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.15, gain: 0.22, delay: 0.24 }] },
  jump:     { duration: 0.18, voices: [{ type: 'sine', freqStart: 300, freqEnd: 620, attack: 0.001, decay: 0.1, sustain: 0.0, release: 0.05, gain: 0.22, glideExp: true }] },
  footstep: { duration: 0.08, voices: [{ noise: true, attack: 0.001, decay: 0.03, sustain: 0, release: 0.02, gain: 0.12, filter: { type: 'lowpass', freq: 400, q: 0.7 } }] },
  ui:       { duration: 0.08, voices: [{ type: 'square', freqStart: 740, freqEnd: 740, attack: 0.001, decay: 0.03, sustain: 0, release: 0.02, gain: 0.12 }] },
  hurt:     { duration: 0.25, voices: [{ type: 'sawtooth', freqStart: 440, freqEnd: 110, attack: 0.001, decay: 0.12, sustain: 0.0, release: 0.1, gain: 0.28, glideExp: true }] },
  powerup:  { duration: 0.4,  voices: [{ type: 'square', freqStart: 440, freqEnd: 880, attack: 0.005, decay: 0.3, sustain: 0.1, release: 0.08, gain: 0.2, glideExp: true }] }
};

function makeNoiseBuffer(ctx, seconds) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

export class AudioManager3D {
  // opts:
  //   camera   optional THREE camera; required only for spatialized play().
  //   THREE    optional THREE namespace; required only for PositionalAudio.
  //   masterGain  overall volume 0..1. Default 0.7.
  //   context  optional pre-made AudioContext (else created lazily).
  constructor(opts = {}) {
    this.camera = opts.camera || null;
    this.THREE = opts.THREE || null;
    this.masterVolume = typeof opts.masterGain === 'number' ? Math.max(0, Math.min(1, opts.masterGain)) : 0.7;
    this.muted = false;
    this._disposed = false;
    this._presets = Object.assign({}, PRESETS);
    this._noiseBuffer = null;

    // Create the context now if possible; it starts suspended and is resumed by
    // the game loop's first-tap unlock. If construction fails, degrade silently.
    this.context = opts.context || null;
    if (!this.context) {
      try {
        const Ctx = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
        if (Ctx) {
          this.context = new Ctx();
        }
      } catch (e) {
        this.context = null;
      }
    }

    this._master = null;
    if (this.context) {
      try {
        this._master = this.context.createGain();
        this._master.gain.value = this.masterVolume;
        this._master.connect(this.context.destination);
      } catch (e) {
        this._master = null;
      }
    }

    // Optional 3D listener attached to the camera (for PositionalAudio).
    this._listener = null;
    if (this.camera && this.THREE && this.THREE.AudioListener) {
      try {
        this._listener = new this.THREE.AudioListener();
        this.camera.add(this._listener);
      } catch (e) {
        this._listener = null;
      }
    }

    // Self-unlock fallback (2026-07-10): attachTo(loop) is the primary unlock, but a
    // game that forgets to call it (or has no compatible loop) leaves the context
    // SUSPENDED = silence. Resume on the first pointer/key/touch, once, so audio is
    // never dead just because attachTo() was skipped. No-op off-DOM.
    this._installGestureUnlock();
  }

  _installGestureUnlock() {
    if (this._unlockInstalled || typeof globalThis.addEventListener !== 'function') return;
    this._unlockInstalled = true;
    const events = ['pointerdown', 'keydown', 'touchstart', 'mousedown', 'click'];
    const unlock = () => {
      if (this.context && this.context.state === 'suspended') { try { this.context.resume(); } catch (_) {} }
      events.forEach((ev) => globalThis.removeEventListener(ev, unlock, true));
    };
    events.forEach((ev) => globalThis.addEventListener(ev, unlock, { capture: true, passive: true }));
  }

  // Hand our context to core.three-game-loop so its first-tap unlock resumes it.
  attachTo(loop) {
    if (loop && typeof loop.setAudioContext === 'function' && this.context) {
      loop.setAudioContext(this.context);
    }
    return this;
  }

  get unlocked() {
    return !!(this.context && this.context.state === 'running');
  }

  setMuted(on) {
    this.muted = !!on;
    if (this._master) {
      this._master.gain.value = this.muted ? 0 : this.masterVolume;
    }
    return this;
  }

  toggleMuted() {
    return this.setMuted(!this.muted);
  }

  setMasterVolume(v) {
    this.masterVolume = Math.max(0, Math.min(1, v));
    if (this._master && !this.muted) {
      this._master.gain.value = this.masterVolume;
    }
    return this;
  }

  // Register or override a preset. spec = { duration, voices:[...] }.
  defineSfx(name, spec) {
    if (name && spec) {
      this._presets[name] = spec;
    }
    return this;
  }

  // Play a preset. opts.position (Vector3 or Object3D) spatializes it (requires
  // camera + THREE; otherwise plays in 2D). Safe no-op if audio isn't unlocked.
  play(name, opts = {}) {
    if (this._disposed || this.muted || !this.context || !this._master) {
      return;
    }
    if (this.context.state !== 'running') {
      // Not unlocked yet -- stay silent, never throw, never block.
      return;
    }
    const preset = this._presets[name];
    if (!preset) {
      return;
    }
    const ctx = this.context;
    const now = ctx.currentTime;

    // A per-sound gain that either feeds the master (2D) or a PositionalAudio.
    let sink = this._master;
    let positional = null;
    if (opts.position && this._listener && this.THREE && this.THREE.PositionalAudio) {
      try {
        positional = new this.THREE.PositionalAudio(this._listener);
        positional.setRefDistance(opts.refDistance || 6);
        positional.setMaxDistance(opts.maxDistance || 80);
        positional.setRolloffFactor(opts.rolloff || 1);
        const p = opts.position.position ? opts.position.position : opts.position;
        if (p && typeof p.x === 'number') {
          positional.position.set(p.x, p.y, p.z);
        }
        // PositionalAudio exposes a gain node we can route voices into.
        sink = positional.gain;
      } catch (e) {
        positional = null;
        sink = this._master;
      }
    }

    for (const voice of preset.voices) {
      this._playVoice(ctx, now, voice, sink);
    }
  }

  _playVoice(ctx, now, voice, sink) {
    const t0 = now + (voice.delay || 0);
    const env = ctx.createGain();
    const peak = (voice.gain != null ? voice.gain : 0.2);
    const a = voice.attack != null ? voice.attack : 0.005;
    const d = voice.decay != null ? voice.decay : 0.1;
    const s = voice.sustain != null ? voice.sustain : 0.0;
    const r = voice.release != null ? voice.release : 0.05;

    // ADSR
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + a);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * (s > 0 ? s : 0.0001)), t0 + a + d);
    const endTime = t0 + a + d + r;
    env.gain.exponentialRampToValueAtTime(0.0001, endTime);

    let node;
    if (voice.noise) {
      if (!this._noiseBuffer) {
        this._noiseBuffer = makeNoiseBuffer(ctx, 1);
      }
      node = ctx.createBufferSource();
      node.buffer = this._noiseBuffer;
      node.loop = true;
    } else {
      node = ctx.createOscillator();
      node.type = voice.type || 'sine';
      const f0 = voice.freqStart != null ? voice.freqStart : 440;
      const f1 = voice.freqEnd != null ? voice.freqEnd : f0;
      node.frequency.setValueAtTime(f0, t0);
      if (f1 !== f0) {
        if (voice.glideExp) {
          node.frequency.exponentialRampToValueAtTime(Math.max(1, f1), endTime);
        } else {
          node.frequency.linearRampToValueAtTime(f1, endTime);
        }
      }
    }

    let chainTail = node;
    if (voice.filter) {
      const filt = ctx.createBiquadFilter();
      filt.type = voice.filter.type || 'lowpass';
      filt.frequency.value = voice.filter.freq != null ? voice.filter.freq : 1000;
      filt.Q.value = voice.filter.q != null ? voice.filter.q : 1;
      node.connect(filt);
      chainTail = filt;
    }

    chainTail.connect(env);
    env.connect(sink);

    node.start(t0);
    node.stop(endTime + 0.02);
    node.onended = () => {
      try {
        node.disconnect();
        env.disconnect();
      } catch (e) { /* already gone */ }
    };
  }

  dispose() {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    if (this._listener && this.camera) {
      try { this.camera.remove(this._listener); } catch (e) { /* ignore */ }
    }
    // We do NOT close the context here: the game loop may still own it for
    // unlock bookkeeping, and closing a shared context can throw. Just mute.
    this.setMuted(true);
  }
}

// END mChatAI Web Component: effects.audio-manager-3d
