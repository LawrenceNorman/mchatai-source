// BEGIN mChatAI Web Component: core.three-game-loop
//
// ThreeGameLoop - the shared baseplate every web-components-3d game imports.
//
// Responsibilities:
//   - renderer.setAnimationLoop driven master loop (three.js native; pauses
//     automatically when the WebXR/visibility system requests it).
//   - Fixed-timestep accumulator: update(dt) runs at a constant simulation step
//     (default 1/60 s) regardless of display refresh; render() interpolates
//     between the previous and current simulation state via an alpha factor so
//     120Hz and 60Hz displays both look smooth and behave identically.
//   - dt clamp: a long stall (tab backgrounded, GC pause) never injects a giant
//     delta that tunnels objects through walls; the frame delta is clamped.
//   - MENU / PLAYING / PAUSED / GAMEOVER state machine. update() only advances
//     the simulation while PLAYING; render() always runs so the scene is never
//     blank in a menu or pause overlay.
//   - resize + visibilitychange handling, devicePixelRatio clamp.
//   - audio-unlock on the first user tap (resume an AudioContext, play one
//     silent sample) - the #1 file:// gotcha on iOS/WKWebView.
//   - window.__threeFrameCount increment on every RENDERED frame (the macOS
//     InstalledMiniAppRenderProbe reads this to confirm the canvas is live).
//   - dispose() teardown: stop the loop, drop every listener, null references.
//
// Offline-safe under file://. WebGL2 only (the renderer is built by
// core.three-scene-rig). No CDN, no network, ASCII only.

import * as THREE from 'three';

export const ThreeGameState = Object.freeze({
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  GAMEOVER: 'GAMEOVER'
});

const DEFAULT_STEP = 1 / 60;       // fixed simulation timestep in seconds
const DEFAULT_MAX_FRAME_DT = 0.25; // never feed more than 250ms of catch-up
const MAX_SUBSTEPS = 5;            // bound the catch-up loop to avoid spirals
const DEFAULT_MAX_DPR = 2;         // clamp devicePixelRatio for fill-rate sanity

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value, lo, hi) {
  return value < lo ? lo : (value > hi ? hi : value);
}

if (typeof window !== 'undefined' && !isFiniteNumber(window.__threeFrameCount)) {
  // Initialize the probe counter exactly once so the first loop increments
  // from a known value even if several mini-apps share a page.
  window.__threeFrameCount = 0;
}

export class ThreeGameLoop {
  // options:
  //   renderer  (required) THREE.WebGLRenderer - usually from ThreeSceneRig
  //   scene     (required) THREE.Scene
  //   camera    (required) THREE.Camera
  //   onUpdate(dt, loop)        fixed-step simulation tick (PLAYING only)
  //   onRender(alpha, loop)     per-display-frame render hook (interpolation)
  //   onStateChange(next, prev, loop)
  //   onResize(width, height, loop)
  //   audioContext              optional AudioContext to unlock on first tap
  //   onAudioUnlock(loop)       fires once after the context resumes
  //   step          fixed timestep seconds (default 1/60)
  //   maxFrameDt    frame delta clamp seconds (default 0.25)
  //   maxDpr        devicePixelRatio clamp (default 2)
  //   domElement    element to attach pointer/touch unlock listeners to
  //                 (default renderer.domElement)
  //   autoStart     begin the animation loop immediately (default true)
  constructor(options = {}) {
    if (!options.renderer || !options.scene || !options.camera) {
      throw new Error('ThreeGameLoop requires { renderer, scene, camera }.');
    }

    this.renderer = options.renderer;
    this.scene = options.scene;
    this.camera = options.camera;

    this.onUpdate = typeof options.onUpdate === 'function' ? options.onUpdate : null;
    this.onRender = typeof options.onRender === 'function' ? options.onRender : null;
    this.onStateChange = typeof options.onStateChange === 'function' ? options.onStateChange : null;
    this.onResize = typeof options.onResize === 'function' ? options.onResize : null;
    this.onAudioUnlock = typeof options.onAudioUnlock === 'function' ? options.onAudioUnlock : null;

    this.step = isFiniteNumber(options.step) && options.step > 0 ? options.step : DEFAULT_STEP;
    this.maxFrameDt = isFiniteNumber(options.maxFrameDt) && options.maxFrameDt > 0
      ? options.maxFrameDt
      : DEFAULT_MAX_FRAME_DT;
    this.maxDpr = isFiniteNumber(options.maxDpr) && options.maxDpr >= 1
      ? options.maxDpr
      : DEFAULT_MAX_DPR;

    this.domElement = options.domElement || this.renderer.domElement || null;
    this.audioContext = options.audioContext || null;

    this.state = ThreeGameState.MENU;
    this.running = false;
    this.disposed = false;

    // Fixed-timestep bookkeeping.
    this._clock = new THREE.Clock(false);
    this._accumulator = 0;
    this._alpha = 0;

    // Aggregate metrics exposed to game code / the probe.
    this.frameCount = 0;       // rendered frames
    this.simStepCount = 0;     // fixed update steps executed
    this.elapsed = 0;          // accumulated simulation time (seconds)

    this.audioUnlocked = false;

    // Bound handlers so dispose() can remove the exact references.
    this._boundLoop = (timestamp, frame) => this._onAnimationFrame(timestamp, frame);
    this._boundResize = () => this._handleResize();
    this._boundVisibility = () => this._handleVisibility();
    this._boundUnlock = () => this._handleAudioUnlock();

    this._installListeners();
    this._handleResize();

    if (options.autoStart !== false) {
      this.start();
    }
  }

  // ----- lifecycle -------------------------------------------------------

  start() {
    if (this.disposed || this.running) {
      return this;
    }
    this.running = true;
    this._accumulator = 0;
    this._clock.start();
    this.renderer.setAnimationLoop(this._boundLoop);
    return this;
  }

  // Stop the animation loop without tearing down resources (dispose() does that).
  stop() {
    if (!this.running) {
      return this;
    }
    this.running = false;
    this.renderer.setAnimationLoop(null);
    this._clock.stop();
    return this;
  }

  // ----- state machine ---------------------------------------------------

  setState(next) {
    if (this.disposed || next === this.state) {
      return this;
    }
    if (!ThreeGameState[next]) {
      throw new Error('ThreeGameLoop unknown state: ' + String(next));
    }
    const prev = this.state;
    this.state = next;

    // Re-entering PLAYING after a pause: drop any accumulated lag so the sim
    // does not fast-forward through the time spent paused.
    if (next === ThreeGameState.PLAYING) {
      this._accumulator = 0;
      this._clock.getDelta(); // discard the stale delta captured while paused
    }

    if (this.onStateChange) {
      this.onStateChange(next, prev, this);
    }
    return this;
  }

  // Convenience transitions used by most games / HUD buttons.
  play() { return this.setState(ThreeGameState.PLAYING); }
  pause() {
    if (this.state === ThreeGameState.PLAYING) {
      this.setState(ThreeGameState.PAUSED);
    }
    return this;
  }
  togglePause() {
    if (this.state === ThreeGameState.PLAYING) {
      return this.setState(ThreeGameState.PAUSED);
    }
    if (this.state === ThreeGameState.PAUSED) {
      return this.setState(ThreeGameState.PLAYING);
    }
    return this;
  }
  gameOver() { return this.setState(ThreeGameState.GAMEOVER); }
  toMenu() { return this.setState(ThreeGameState.MENU); }

  isPlaying() { return this.state === ThreeGameState.PLAYING; }

  // ----- core loop -------------------------------------------------------

  _onAnimationFrame(timestamp, xrFrame) {
    if (this.disposed) {
      return;
    }

    // Frame delta in seconds, clamped so a long stall cannot inject a giant
    // step that tunnels physics or fast-forwards the whole simulation.
    let frameDt = this._clock.getDelta();
    if (!isFiniteNumber(frameDt) || frameDt < 0) {
      frameDt = 0;
    }
    frameDt = Math.min(frameDt, this.maxFrameDt);

    // Advance the simulation only while PLAYING, with a fixed-timestep
    // accumulator. The catch-up loop is bounded by MAX_SUBSTEPS so we never
    // spiral if a frame is catastrophically slow.
    if (this.state === ThreeGameState.PLAYING && this.onUpdate) {
      this._accumulator += frameDt;
      let substeps = 0;
      while (this._accumulator >= this.step && substeps < MAX_SUBSTEPS) {
        this.onUpdate(this.step, this);
        this._accumulator -= this.step;
        this.elapsed += this.step;
        this.simStepCount += 1;
        substeps += 1;
      }
      if (substeps >= MAX_SUBSTEPS) {
        // We hit the ceiling; drop the remaining lag rather than carrying it.
        this._accumulator = 0;
      }
    } else {
      // Not simulating: keep the accumulator empty so resuming is crisp.
      this._accumulator = 0;
    }

    // Interpolation factor for renderers that want to lerp visual state between
    // the last completed sim step and the next one. 0..1.
    this._alpha = this.step > 0 ? clamp(this._accumulator / this.step, 0, 1) : 0;

    // Render every display frame, even in MENU / PAUSED / GAMEOVER, so the
    // scene behind an overlay stays visible.
    if (this.onRender) {
      this.onRender(this._alpha, this);
    }
    this.renderer.render(this.scene, this.camera);

    // The probe heartbeat. Increment on every rendered frame.
    this.frameCount += 1;
    if (typeof window !== 'undefined') {
      window.__threeFrameCount = (window.__threeFrameCount | 0) + 1;
    }
  }

  get alpha() {
    return this._alpha;
  }

  // ----- resize / visibility / DPR --------------------------------------

  _handleResize() {
    if (this.disposed) {
      return;
    }
    const width = (typeof window !== 'undefined' && window.innerWidth) || 1;
    const height = (typeof window !== 'undefined' && window.innerHeight) || 1;

    const rawDpr = (typeof window !== 'undefined' && isFiniteNumber(window.devicePixelRatio))
      ? window.devicePixelRatio
      : 1;
    const dpr = clamp(rawDpr, 1, this.maxDpr);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, true);

    if (this.camera && this.camera.isPerspectiveCamera) {
      this.camera.aspect = width / Math.max(1, height);
      this.camera.updateProjectionMatrix();
    } else if (this.camera && this.camera.isOrthographicCamera) {
      // Leave ortho frustum to the game, but keep aspect-correct half-extents
      // if the camera carries a viewSize hint.
      const viewSize = isFiniteNumber(this.camera.userData?.viewSize)
        ? this.camera.userData.viewSize
        : null;
      if (viewSize !== null) {
        const aspect = width / Math.max(1, height);
        this.camera.left = -viewSize * aspect;
        this.camera.right = viewSize * aspect;
        this.camera.top = viewSize;
        this.camera.bottom = -viewSize;
        this.camera.updateProjectionMatrix();
      }
    }

    if (this.onResize) {
      this.onResize(width, height, this);
    }
  }

  _handleVisibility() {
    if (this.disposed || typeof document === 'undefined') {
      return;
    }
    if (document.hidden) {
      // Auto-pause an active game when the tab is backgrounded so it does not
      // burn a giant catch-up delta on return.
      if (this.state === ThreeGameState.PLAYING) {
        this._wasPlayingBeforeHide = true;
        this.setState(ThreeGameState.PAUSED);
      }
    } else if (this._wasPlayingBeforeHide) {
      this._wasPlayingBeforeHide = false;
      // Do NOT auto-resume play; let the user tap to continue. We just reset the
      // delta so the first visible frame is small.
      this._clock.getDelta();
    }
  }

  // ----- audio unlock ----------------------------------------------------

  // Resume a suspended AudioContext and play one silent sample on the first
  // real user gesture. Listeners self-remove after success.
  _handleAudioUnlock() {
    if (this.disposed || this.audioUnlocked) {
      return;
    }
    const ctx = this.audioContext;
    if (ctx && typeof ctx.resume === 'function') {
      const finish = () => {
        try {
          const buffer = ctx.createBuffer(1, 1, ctx.sampleRate || 22050);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          if (typeof source.start === 'function') {
            source.start(0);
          }
        } catch (err) {
          // A failed silent-sample play is non-fatal; the resume is what counts.
        }
        this.audioUnlocked = true;
        this._removeUnlockListeners();
        if (this.onAudioUnlock) {
          this.onAudioUnlock(this);
        }
      };
      const result = ctx.resume();
      if (result && typeof result.then === 'function') {
        result.then(finish, finish);
      } else {
        finish();
      }
    } else {
      // No audio context provided; still mark unlocked so we stop listening.
      this.audioUnlocked = true;
      this._removeUnlockListeners();
      if (this.onAudioUnlock) {
        this.onAudioUnlock(this);
      }
    }
  }

  // Allow game code to point the loop at an AudioContext created lazily.
  setAudioContext(ctx) {
    this.audioContext = ctx || null;
    return this;
  }

  // ----- listeners -------------------------------------------------------

  _installListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this._boundResize, { passive: true });
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._boundVisibility, { passive: true });
    }
    const target = this.domElement || (typeof window !== 'undefined' ? window : null);
    if (target && typeof target.addEventListener === 'function') {
      target.addEventListener('pointerdown', this._boundUnlock, { passive: true });
      target.addEventListener('touchstart', this._boundUnlock, { passive: true });
      target.addEventListener('mousedown', this._boundUnlock, { passive: true });
      target.addEventListener('keydown', this._boundUnlock, { passive: true });
    }
  }

  _removeUnlockListeners() {
    const target = this.domElement || (typeof window !== 'undefined' ? window : null);
    if (target && typeof target.removeEventListener === 'function') {
      target.removeEventListener('pointerdown', this._boundUnlock);
      target.removeEventListener('touchstart', this._boundUnlock);
      target.removeEventListener('mousedown', this._boundUnlock);
      target.removeEventListener('keydown', this._boundUnlock);
    }
  }

  // ----- teardown --------------------------------------------------------

  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.stop();

    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this._boundResize);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._boundVisibility);
    }
    this._removeUnlockListeners();

    // Drop hook references so closures over scene graphs can be collected.
    this.onUpdate = null;
    this.onRender = null;
    this.onStateChange = null;
    this.onResize = null;
    this.onAudioUnlock = null;
    this.audioContext = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.domElement = null;
  }
}

export default ThreeGameLoop;

// END mChatAI Web Component: core.three-game-loop
