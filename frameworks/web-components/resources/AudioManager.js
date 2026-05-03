export class AudioManager {
  constructor(options = {}) {
    this.context = null;
    this.masterVolume = options.masterVolume ?? 0.08;
    this.enabled = options.enabled !== false;
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
}
