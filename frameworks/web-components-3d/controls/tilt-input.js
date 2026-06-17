// BEGIN mChatAI Web Component: controls.tilt-input
//
// Device-orientation tilt that writes into the shared input.move, for marble /
// balance / labyrinth games on phones. CRITICAL: it is NEVER tilt-only -- it
// always pairs with a keyboard/joystick fallback so the game is fully playable
// on desktop and in the mChatAI+ WKWebView preview (the tjs-mobile-friendly +
// CONTEXT.md "device-orientation + keyboard fallback, never tilt-only" rule).
//
// iOS 13+ requires a user-gesture permission grant for motion sensors; this
// exposes requestPermission() to call from a tap, and degrades silently to the
// fallback if permission is denied or the API is absent.
//
// Dependency-free (DOM only). Writes into the same { move:{x,y} } state the
// other controls use, so it composes with controls.input-manager-3d.
//
// Usage:
//   import { TiltInput } from './controls/tilt-input.js';
//   const tilt = new TiltInput({ state: input.state });
//   // from a tap (iOS permission):  startButton.onclick = () => tilt.requestPermission();
//   // tilt now blends into input.state.move; keyboard/joystick still work.
//   tilt.dispose();

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export class TiltInput {
  // opts:
  //   state       shared input state with a .move {x,y}. Required to be useful.
  //   maxTiltDeg  tilt angle (deg) mapped to full deflection. Default 25.
  //   deadzoneDeg ignore tiny tilts below this. Default 3.
  //   invertY     flip forward/back. Default false.
  //   additive    if true, ADD tilt to existing move (so keyboard still wins
  //               when pressed); if false, tilt drives move directly. Default true.
  constructor(opts = {}) {
    this.state = opts.state || { move: { x: 0, y: 0 } };
    if (!this.state.move) this.state.move = { x: 0, y: 0 };
    this.maxTilt = typeof opts.maxTiltDeg === 'number' ? opts.maxTiltDeg : 25;
    this.deadzone = typeof opts.deadzoneDeg === 'number' ? opts.deadzoneDeg : 3;
    this.invertY = !!opts.invertY;
    this.additive = opts.additive !== false;
    this.enabled = false;
    this._disposed = false;
    this._tilt = { x: 0, y: 0 };

    this._onOrient = (e) => this._handle(e);
    // If no permission gate is needed, start listening immediately.
    if (typeof window !== 'undefined' && typeof window.DeviceOrientationEvent !== 'undefined') {
      const needsPermission = typeof window.DeviceOrientationEvent.requestPermission === 'function';
      if (!needsPermission) {
        this._listen();
      }
      // else wait for requestPermission() from a user gesture.
    }
  }

  // Call from a tap on iOS 13+ to grant motion-sensor access.
  requestPermission() {
    if (typeof window === 'undefined' || typeof window.DeviceOrientationEvent === 'undefined') {
      return Promise.resolve(false);
    }
    if (typeof window.DeviceOrientationEvent.requestPermission === 'function') {
      return window.DeviceOrientationEvent.requestPermission()
        .then((res) => {
          if (res === 'granted') { this._listen(); return true; }
          return false;
        })
        .catch(() => false);
    }
    this._listen();
    return Promise.resolve(true);
  }

  _listen() {
    if (this.enabled || this._disposed || typeof window === 'undefined') return;
    window.addEventListener('deviceorientation', this._onOrient, true);
    this.enabled = true;
  }

  _handle(e) {
    // gamma = left/right tilt (-90..90), beta = front/back tilt (-180..180).
    const gamma = typeof e.gamma === 'number' ? e.gamma : 0;
    const beta = typeof e.beta === 'number' ? e.beta : 0;
    // Treat ~45deg of forward lean as neutral hold posture; subtract it.
    const bx = gamma;
    const by = beta - 45;
    this._tilt.x = this._map(bx);
    this._tilt.y = (this.invertY ? -1 : 1) * this._map(by);
  }

  _map(deg) {
    if (Math.abs(deg) < this.deadzone) return 0;
    const sign = deg < 0 ? -1 : 1;
    const mag = clamp((Math.abs(deg) - this.deadzone) / (this.maxTilt - this.deadzone), 0, 1);
    return sign * mag;
  }

  // Blend tilt into the shared state. Call each frame (cheap; the event already
  // updated _tilt). With additive=true, keyboard/joystick override tilt when
  // they push move past the tilt magnitude.
  update() {
    if (this._disposed || !this.enabled) return this;
    const m = this.state.move;
    if (this.additive) {
      // Only contribute where the user isn't already pushing harder.
      if (Math.abs(this._tilt.x) > Math.abs(m.x)) m.x = this._tilt.x;
      if (Math.abs(this._tilt.y) > Math.abs(m.y)) m.y = this._tilt.y;
    } else {
      m.x = this._tilt.x;
      m.y = this._tilt.y;
    }
    return this;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    if (this.enabled && typeof window !== 'undefined') {
      window.removeEventListener('deviceorientation', this._onOrient, true);
    }
    this.enabled = false;
  }
}

// END mChatAI Web Component: controls.tilt-input
