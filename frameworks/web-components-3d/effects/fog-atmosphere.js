// BEGIN mChatAI Web Component: effects.fog-atmosphere
//
// Applies distance fog to a three.js scene so far geometry fades into the
// horizon / skybox colour. Supports both linear THREE.Fog (near/far falloff)
// and exponential THREE.FogExp2 (single density term). The returned handle
// lets game code retune density at runtime (weather, depth fade) and dispose
// on teardown without leaking the scene reference.
//
// Offline-safe: imports only the canonical bare 'three' specifier, which the
// local relative importmap maps to ./resources/three/three.module.min.js.
// No CDN, no network, WebGL2 only.
//
// Usage:
//   import { applyFogAtmosphere } from './effects/fog-atmosphere.js';
//   const fog = applyFogAtmosphere(scene, { mode: 'exp2', color: 0x101824, density: 0.018 });
//   // later, e.g. when entering a tunnel:
//   fog.setDensity(0.06);
//   // on teardown:
//   fog.dispose();

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

function resolveColor(input, fallback) {
  if (input === undefined || input === null) {
    return new THREE.Color(fallback);
  }
  if (input instanceof THREE.Color) {
    return input.clone();
  }
  // Accepts hex number (0x101824) or CSS string ("#101824", "skyblue").
  return new THREE.Color(input);
}

// applyFogAtmosphere(scene, opts) -> handle
//
// opts:
//   mode     "exp2" (default) | "linear"
//   color    fog colour; hex number, CSS string, or THREE.Color. Default 0x9fb8d4.
//            Tip: match this to the skybox bottom colour for a seamless horizon.
//   density  exp2 density term, clamped 0..1. Default 0.02.
//   near     linear-mode near plane (fog starts). Default 1.
//   far      linear-mode far plane (full fog). Default 120.
//   matchBackground  when true, also sets scene.background to the fog colour
//                    if the scene has no background yet. Default false.
export function applyFogAtmosphere(scene, opts = {}) {
  if (!scene || typeof scene !== 'object') {
    throw new Error('applyFogAtmosphere requires a THREE.Scene as the first argument.');
  }

  const mode = opts.mode === 'linear' ? 'linear' : 'exp2';
  const color = resolveColor(opts.color, 0x9fb8d4);

  let density = isFiniteNumber(opts.density) ? opts.density : 0.02;
  density = clamp(density, 0, 1);

  let near = isFiniteNumber(opts.near) ? opts.near : 1;
  let far = isFiniteNumber(opts.far) ? opts.far : 120;
  near = Math.max(0, near);
  far = Math.max(near + 0.001, far);

  // Remember any prior fog so dispose() can restore the scene to its
  // original state instead of just nulling it out.
  const previousFog = scene.fog || null;

  let fog;
  if (mode === 'linear') {
    fog = new THREE.Fog(color.getHex(), near, far);
  } else {
    fog = new THREE.FogExp2(color.getHex(), density);
  }
  scene.fog = fog;

  let attachedBackground = false;
  if (opts.matchBackground === true && (scene.background === null || scene.background === undefined)) {
    scene.background = color.clone();
    attachedBackground = true;
  }

  let disposed = false;

  const handle = {
    mode,
    fog,
    // Live-tune the exponential density (no-op in linear mode beyond clamp).
    setDensity(value) {
      if (disposed || !isFiniteNumber(value)) {
        return handle;
      }
      density = clamp(value, 0, 1);
      if (fog.isFogExp2) {
        fog.density = density;
      }
      return handle;
    },
    // Live-tune linear near/far. Ignored for exp2 fog.
    setRange(nextNear, nextFar) {
      if (disposed) {
        return handle;
      }
      if (fog.isFog) {
        if (isFiniteNumber(nextNear)) {
          near = Math.max(0, nextNear);
          fog.near = near;
        }
        if (isFiniteNumber(nextFar)) {
          far = Math.max(near + 0.001, nextFar);
          fog.far = far;
        }
      }
      return handle;
    },
    // Recolour the fog (and matched background) for weather / day-night blends.
    setColor(value) {
      if (disposed) {
        return handle;
      }
      const next = resolveColor(value, color.getHex());
      fog.color.copy(next);
      if (attachedBackground && scene.background && scene.background.isColor) {
        scene.background.copy(next);
      }
      return handle;
    },
    getDensity() {
      return density;
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      // THREE.Fog / FogExp2 hold no GPU resources, but we detach from the
      // scene and restore prior state so the scene can be reused or GC'd.
      if (scene.fog === fog) {
        scene.fog = previousFog;
      }
      if (attachedBackground && scene.background && scene.background.isColor) {
        scene.background = null;
      }
    }
  };

  return handle;
}

// END mChatAI Web Component: effects.fog-atmosphere
