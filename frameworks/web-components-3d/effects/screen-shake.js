// BEGIN mChatAI Web Component: effects.screen-shake
//
// Trauma-based camera shake (the Vlambeer / Squirrel Eiserloh model). Game
// code adds "trauma" on impacts; the actual screen offset scales with
// trauma SQUARED so small trauma is subtle and big trauma is violent, and
// trauma decays linearly over time so the shake always settles. Offsets are
// driven by smooth pseudo-noise (not raw Math.random per frame), which reads
// as a physical shake rather than jitter.
//
// The shake is applied as a temporary positional + rotational offset on the
// camera each frame and then fully reverted on the next update, so it never
// accumulates drift and composes cleanly with a chase / follow camera rig that
// owns the base transform. Pass a separate `target` if you drive the base pose
// elsewhere and want the shake on a parent pivot instead.
//
// Offline-safe: imports only the canonical bare 'three' specifier.
//
// Usage:
//   import { ScreenShake } from './effects/screen-shake.js';
//   const shake = new ScreenShake({ maxOffset: 0.6, maxRoll: 0.08 });
//   // on an explosion:
//   shake.addTrauma(0.7);
//   // each frame, AFTER the camera rig has set the base transform:
//   shake.update(dt, camera);

import * as THREE from 'three';

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value, min, max) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

// Smooth value-noise in 1D: hash integer samples and cosine-interpolate.
// Deterministic per seed so each axis shakes independently but smoothly.
function hash1(n) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s); // 0..1
}

function valueNoise(x, seed) {
  const xi = Math.floor(x);
  const xf = x - xi;
  const a = hash1(xi + seed * 57.0);
  const b = hash1(xi + 1 + seed * 57.0);
  // Cosine (smoothstep-like) interpolation for continuous velocity.
  const t = xf * xf * (3 - 2 * xf);
  return (a + (b - a) * t) * 2 - 1; // -1..1
}

export class ScreenShake {
  // opts:
  //   maxOffset    peak positional shake in world units at trauma=1. Default 0.5.
  //   maxRoll      peak roll (radians, around camera forward) at trauma=1. Default 0.06.
  //   maxPitchYaw  peak pitch/yaw wobble (radians) at trauma=1. Default 0.04.
  //   frequency    noise oscillation speed (Hz-ish). Default 18.
  //   decay        trauma units removed per second. Default 1.4.
  //   maxTrauma    trauma clamp ceiling. Default 1.
  constructor(opts = {}) {
    this.maxOffset = isFiniteNumber(opts.maxOffset) ? Math.max(0, opts.maxOffset) : 0.5;
    this.maxRoll = isFiniteNumber(opts.maxRoll) ? Math.max(0, opts.maxRoll) : 0.06;
    this.maxPitchYaw = isFiniteNumber(opts.maxPitchYaw) ? Math.max(0, opts.maxPitchYaw) : 0.04;
    this.frequency = isFiniteNumber(opts.frequency) ? Math.max(0.1, opts.frequency) : 18;
    this.decay = isFiniteNumber(opts.decay) ? Math.max(0, opts.decay) : 1.4;
    this.maxTrauma = isFiniteNumber(opts.maxTrauma) ? clamp(opts.maxTrauma, 0, 1) : 1;

    this.trauma = 0;
    this._time = 0;

    // Per-axis random seeds so X, Y, Z and roll do not move in lockstep.
    this._seedX = Math.random() * 100;
    this._seedY = Math.random() * 100 + 31;
    this._seedZ = Math.random() * 100 + 67;
    this._seedRoll = Math.random() * 100 + 113;
    this._seedPitch = Math.random() * 100 + 151;
    this._seedYaw = Math.random() * 100 + 199;

    // The offset applied last frame, so we can revert exactly before reapplying.
    this._appliedPos = new THREE.Vector3();
    this._appliedRot = new THREE.Euler(0, 0, 0, 'XYZ');
    this._hasApplied = false;

    this._scratchEuler = new THREE.Euler(0, 0, 0, 'XYZ');
    this._scratchQuat = new THREE.Quaternion();
  }

  // Add trauma from an impact. x is 0..1 (a big hit ~0.6, a huge one ~1.0).
  // Trauma accumulates and clamps; it does not stack past maxTrauma.
  addTrauma(x) {
    if (!isFiniteNumber(x) || x <= 0) {
      return this;
    }
    this.trauma = clamp(this.trauma + x, 0, this.maxTrauma);
    return this;
  }

  // Force trauma to an exact value (e.g. 0 to instantly stop the shake).
  setTrauma(x) {
    this.trauma = isFiniteNumber(x) ? clamp(x, 0, this.maxTrauma) : 0;
    return this;
  }

  getTrauma() {
    return this.trauma;
  }

  isShaking() {
    return this.trauma > 0;
  }

  // update(dt, camera): revert the previous frame's offset, then -- if any
  // trauma remains -- apply a fresh shake offset scaled by trauma squared.
  // Call this AFTER the base camera transform is set for the frame.
  update(dt, camera) {
    if (!camera || !camera.position || !camera.quaternion) {
      return;
    }

    // 1. Revert whatever we added last frame so the base pose is clean.
    if (this._hasApplied) {
      camera.position.sub(this._appliedPos);
      // Undo the rotation offset: apply the inverse of the stored offset quat.
      this._scratchEuler.copy(this._appliedRot);
      this._scratchQuat.setFromEuler(this._scratchEuler).invert();
      camera.quaternion.multiply(this._scratchQuat);
      this._appliedPos.set(0, 0, 0);
      this._appliedRot.set(0, 0, 0);
      this._hasApplied = false;
    }

    if (!isFiniteNumber(dt) || dt < 0) {
      dt = 0;
    }
    const clampedDt = Math.min(dt, 1 / 15);

    // 2. Decay trauma linearly.
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - this.decay * clampedDt);
    }
    if (this.trauma <= 0) {
      return;
    }

    this._time += clampedDt;

    // 3. Shake magnitude scales with trauma squared (the key behaviour).
    const shake = this.trauma * this.trauma;
    const phase = this._time * this.frequency;

    const ox = valueNoise(phase, this._seedX) * this.maxOffset * shake;
    const oy = valueNoise(phase, this._seedY) * this.maxOffset * shake;
    const oz = valueNoise(phase, this._seedZ) * this.maxOffset * shake * 0.5;

    const roll = valueNoise(phase, this._seedRoll) * this.maxRoll * shake;
    const pitch = valueNoise(phase, this._seedPitch) * this.maxPitchYaw * shake;
    const yaw = valueNoise(phase, this._seedYaw) * this.maxPitchYaw * shake;

    // 4. Apply positional offset relative to the camera's own orientation so
    // the shake is in view space (left/right/up of the screen), not world axes.
    this._appliedPos.set(ox, oy, oz).applyQuaternion(camera.quaternion);
    camera.position.add(this._appliedPos);

    // 5. Apply rotational offset (pitch X, yaw Y, roll Z) in local space.
    this._appliedRot.set(pitch, yaw, roll, 'XYZ');
    this._scratchQuat.setFromEuler(this._appliedRot);
    camera.quaternion.multiply(this._scratchQuat);

    this._hasApplied = true;
  }

  // Reset all state and remove any residual applied offset from the camera.
  reset(camera) {
    if (this._hasApplied && camera && camera.position && camera.quaternion) {
      camera.position.sub(this._appliedPos);
      this._scratchEuler.copy(this._appliedRot);
      this._scratchQuat.setFromEuler(this._scratchEuler).invert();
      camera.quaternion.multiply(this._scratchQuat);
    }
    this.trauma = 0;
    this._time = 0;
    this._appliedPos.set(0, 0, 0);
    this._appliedRot.set(0, 0, 0);
    this._hasApplied = false;
    return this;
  }

  // Nothing GPU-backed here, but provided for teardown-symmetry with the kit.
  dispose() {
    this.trauma = 0;
    this._hasApplied = false;
  }
}

// END mChatAI Web Component: effects.screen-shake
