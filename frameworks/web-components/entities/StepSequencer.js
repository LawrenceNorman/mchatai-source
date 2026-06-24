// BEGIN mchatai-web-components: entities.step-sequencer (entities/StepSequencer.js)
//
// PLAIN JS CLASS — NOT A WEB CUSTOM ELEMENT.
// DO NOT call customElements.define() on this class.
// DO NOT use <stepsequencer-foo> tags in HTML.
// Instantiate with `new` and call methods. YOU draw the UI.
// See wisdom rule fs-015 for the full pattern + worked examples.
//
// AUDIO LIB: Tone.js. This file expects `Tone` to be available as a global
// (window.Tone), exactly the way a drum machine / beat-maker page loads it.
// The host page is responsible for loading Tone from a VENDORED OFFLINE copy
// (e.g. <script src="./resources/tone/Tone.js"></script>) — NEVER a CDN URL.
// This module touches ONLY Tone.Transport / Tone.Loop / Tone.Draw / Tone.now()
// for scheduling; it does NOT create any voices or synths. YOU supply the
// instruments by passing a `trigger(rowKey, step, time, velocity)` callback,
// so the engine stays renderer- AND sound-agnostic. If `Tone` is missing the
// engine still runs the pure pattern logic (toggle/paint/clear/randomize); only
// playback scheduling no-ops.

/**
 * Generic step-sequencer engine for drum machines, beat makers, arpeggiators,
 * loop stations, and any ROWS×STEPS on/off grid driven by a clock.
 *
 * Model:
 *   - `rows` = an ordered list of instrument lanes, each { key, name?, ...meta }.
 *     `key` is the stable id you use everywhere (trigger callbacks, get/set).
 *     Any extra fields (color, note, sample) ride along untouched for YOUR UI.
 *   - `steps` = columns in the pattern (default 16).
 *   - `pattern[key]` = an Array(steps) of booleans. true = the lane fires on
 *     that step. This is the single source of truth — read it to draw cells.
 *
 * Scheduling (Tone.js):
 *   - A single Tone.Loop ticks once per `subdivision` (default "16n"), walking a
 *     wrapping `stepIndex` 0..steps-1.
 *   - On each tick, every lane whose pattern[key][step] is true invokes your
 *     `trigger(key, step, time, velocity)` with the sample-accurate Tone time.
 *   - Tone.Draw.schedule fires `onStep(step)` in visual sync so you can paint a
 *     playhead column WITHOUT drifting from the audio clock.
 *   - Tempo is Tone.Transport.bpm; setTempo() updates it live while playing.
 *
 * Editing:
 *   - toggle(key, step) / setCell(key, step, on) flip a single cell. When a cell
 *     is switched ON while the engine is idle (audio ready, not playing) the
 *     lane is auditioned once via trigger(...) so painting "clicks" feedback.
 *   - Drag-paint: call beginPaint(key, step) on pointerdown (it samples the
 *     opposite of the current cell as the paint value and applies it), then
 *     paintCell(key, step) on pointermove over each cell, then endPaint() on
 *     pointerup. The engine tracks paint state; YOU map pointer coords → (key,
 *     step) (e.g. via dataset attributes / elementFromPoint).
 *   - clear() blanks every lane. randomize(density) fills cells from a seeded
 *     LCG (deterministic, avoids Math.random clustering); density is a number
 *     applied to all lanes or a { [key]: 0..1 } map for per-lane probabilities.
 *
 * The engine NEVER touches the DOM. It is pure pattern + clock. Build the grid,
 * cells, labels, transport buttons, and tempo slider yourself; read `pattern`,
 * `playing`, and the current step (from onStep) to render.
 *
 * CONTRACTS
 *   new StepSequencer({
 *     rows,            // [{ key, name?, ... }] — required, lane definitions
 *     steps,           // int columns (default 16)
 *     tempo,           // initial BPM (default 120)
 *     subdivision,     // Tone loop interval (default "16n")
 *     trigger,         // (key, step, time, velocity) => void — YOU make sound
 *     onStep,          // (step) => void — visual playhead, in Tone.Draw sync
 *     defaultVelocity, // 0..1 passed to trigger (default 1)
 *     seed,            // int RNG seed for randomize() (default 1337)
 *     Tone             // optional explicit Tone handle (else uses globalThis.Tone)
 *   })
 *
 *   helpers:
 *     setupAudio()                      // build the Tone.Loop (call after Tone.start())
 *     play()                            // start transport from step 0
 *     stop()                            // stop transport, reset playhead
 *     toggle(key, step) -> bool         // returns new cell value
 *     setCell(key, step, on)
 *     getCell(key, step) -> bool
 *     beginPaint(key, step) -> bool     // pointerdown: start drag, returns paintValue
 *     paintCell(key, step)              // pointermove: apply current paintValue
 *     endPaint()                        // pointerup/cancel
 *     clear()
 *     randomize(density)                // number | { [key]: 0..1 }
 *     setTempo(bpm)
 *     setPattern(key, bools)            // load a lane (Array(steps) of bool)
 *     toJSON() -> { tempo, steps, pattern }
 *     loadJSON(obj)
 *     dispose()                         // tear down the Tone.Loop
 *
 *   state:
 *     pattern: { [key]: bool[] }        // the editable grid — draw from this
 *     rows: [{ key, name?, ... }]
 *     steps: int
 *     tempo: int (BPM)
 *     playing: bool
 *     audioReady: bool
 *     currentStep: int  (-1 when stopped)
 */
export class StepSequencer {
  constructor(options = {}) {
    this.rows = Array.isArray(options.rows) ? options.rows.slice() : [];
    if (this.rows.length === 0) {
      throw new Error("StepSequencer: `rows` must be a non-empty array of { key } lane definitions");
    }
    this.steps = options.steps ?? 16;
    this.tempo = options.tempo ?? 120;
    this.subdivision = options.subdivision ?? "16n";
    this.trigger = options.trigger ?? (() => {});
    this.onStep = options.onStep ?? (() => {});
    this.defaultVelocity = options.defaultVelocity ?? 1;
    this.Tone = options.Tone ?? (typeof globalThis !== "undefined" ? globalThis.Tone : undefined);

    // pattern[key] = Array(steps) of booleans (source of truth)
    this.pattern = {};
    for (const row of this.rows) {
      this.pattern[row.key] = new Array(this.steps).fill(false);
    }

    this.playing = false;
    this.audioReady = false;
    this.currentStep = -1;
    this._stepIndex = 0;
    this._loop = null;

    // drag-paint state
    this._painting = false;
    this._paintValue = false;

    // deterministic RNG for randomize()
    this._seed = (options.seed ?? 1337) >>> 0 || 1337;
  }

  /** True if `key` is a known lane. */
  hasRow(key) {
    return Object.prototype.hasOwnProperty.call(this.pattern, key);
  }

  // ---------- pattern editing (pure, no audio required) ----------

  getCell(key, step) {
    const lane = this.pattern[key];
    return !!(lane && lane[step]);
  }

  /** Set one cell. Returns true if it changed. Auditions the lane once when a
   *  cell is switched ON while idle (audio ready, not playing). */
  setCell(key, step, on) {
    const lane = this.pattern[key];
    if (!lane || step < 0 || step >= this.steps) return false;
    const val = !!on;
    if (lane[step] === val) return false;
    lane[step] = val;
    if (val && this.audioReady && !this.playing) {
      const t = this.Tone ? this.Tone.now() + 0.02 : 0;
      this.trigger(key, step, t, this.defaultVelocity);
    }
    return true;
  }

  /** Flip one cell. Returns the new value. */
  toggle(key, step) {
    const next = !this.getCell(key, step);
    this.setCell(key, step, next);
    return next;
  }

  /** Replace a whole lane with `bools` (Array of length `steps`). */
  setPattern(key, bools) {
    if (!this.hasRow(key) || !Array.isArray(bools)) return;
    const lane = this.pattern[key];
    for (let i = 0; i < this.steps; i += 1) lane[i] = !!bools[i];
  }

  /** Blank every lane. */
  clear() {
    for (const row of this.rows) {
      this.pattern[row.key].fill(false);
    }
  }

  /** Fill cells randomly (deterministic via seeded LCG).
   *  `density` is a number for all lanes, or { [key]: 0..1 } per lane. */
  randomize(density = 0.25) {
    const perLane = typeof density === "object" && density !== null;
    for (const row of this.rows) {
      const p = perLane ? (density[row.key] ?? 0) : density;
      const lane = this.pattern[row.key];
      for (let i = 0; i < this.steps; i += 1) {
        lane[i] = this._random() < p;
      }
    }
  }

  // simple LCG — avoids Math.random clustering; deterministic per seed
  _random() {
    this._seed = (this._seed * 1103515245 + 12345) & 0x7fffffff;
    return this._seed / 0x7fffffff;
  }

  // ---------- drag painting ----------

  /** pointerdown on a cell: begin a drag that paints the OPPOSITE of this
   *  cell's current value across cells dragged over. Applies it to the start
   *  cell and returns the paint value being applied. */
  beginPaint(key, step) {
    this._painting = true;
    this._paintValue = !this.getCell(key, step);
    this.setCell(key, step, this._paintValue);
    return this._paintValue;
  }

  /** pointermove over a cell while painting: stamp the active paint value. */
  paintCell(key, step) {
    if (!this._painting) return;
    this.setCell(key, step, this._paintValue);
  }

  /** pointerup / pointercancel: end the drag. */
  endPaint() {
    this._painting = false;
  }

  get isPainting() {
    return this._painting;
  }

  // ---------- audio scheduling (Tone.js) ----------

  /** Build the Tone.Loop step scheduler. Call AFTER Tone.start() has unlocked
   *  audio (e.g. from your tap-to-start overlay). Safe to call once; no-ops if
   *  Tone is unavailable or already set up. */
  setupAudio() {
    if (this.audioReady || !this.Tone) return false;
    const Tone = this.Tone;

    this._loop = new Tone.Loop((time) => {
      const step = this._stepIndex;
      for (const row of this.rows) {
        if (this.pattern[row.key][step]) {
          this.trigger(row.key, step, time, this.defaultVelocity);
        }
      }
      // visual playhead in lockstep with the audio clock
      Tone.Draw.schedule(() => {
        this.currentStep = step;
        this.onStep(step);
      }, time);
      this._stepIndex = (step + 1) % this.steps;
    }, this.subdivision);
    this._loop.start(0);

    Tone.Transport.bpm.value = this.tempo;
    this.audioReady = true;
    return true;
  }

  /** Start the transport from step 0. Requires setupAudio() first. */
  play() {
    if (!this.audioReady || !this.Tone) return false;
    this._stepIndex = 0;
    this.Tone.Transport.bpm.value = this.tempo;
    this.Tone.Transport.start();
    this.playing = true;
    return true;
  }

  /** Stop the transport and reset the playhead. */
  stop() {
    if (this.Tone) this.Tone.Transport.stop();
    this.playing = false;
    this._stepIndex = 0;
    this.currentStep = -1;
    this.onStep(-1);
    return true;
  }

  /** Toggle play/stop. Returns the new `playing` value. */
  togglePlay() {
    if (this.playing) {
      this.stop();
    } else {
      this.play();
    }
    return this.playing;
  }

  /** Update tempo (BPM). Applies live to the transport if audio is ready. */
  setTempo(bpm) {
    this.tempo = bpm;
    if (this.audioReady && this.Tone) this.Tone.Transport.bpm.value = bpm;
  }

  // ---------- persistence ----------

  toJSON() {
    const pattern = {};
    for (const row of this.rows) pattern[row.key] = this.pattern[row.key].slice();
    return { tempo: this.tempo, steps: this.steps, pattern };
  }

  loadJSON(obj) {
    if (!obj || typeof obj !== "object") return;
    if (typeof obj.tempo === "number") this.setTempo(obj.tempo);
    if (obj.pattern && typeof obj.pattern === "object") {
      for (const row of this.rows) {
        if (Array.isArray(obj.pattern[row.key])) {
          this.setPattern(row.key, obj.pattern[row.key]);
        }
      }
    }
  }

  /** Tear down the Tone.Loop. Call before discarding the instance. */
  dispose() {
    if (this._loop) {
      this._loop.stop();
      this._loop.dispose();
      this._loop = null;
    }
    this.playing = false;
    this.audioReady = false;
    this.currentStep = -1;
  }
}
// END mchatai-web-components: entities.step-sequencer
