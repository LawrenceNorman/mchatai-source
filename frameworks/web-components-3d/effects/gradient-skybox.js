// BEGIN mChatAI Web Component: effects.gradient-skybox
//
// A large inverted sphere whose ShaderMaterial paints a smooth vertical
// gradient from a top colour to a bottom (horizon) colour, with an optional
// mid band for sunset / aurora looks. Renders on the inside of the sphere
// (side = BackSide) so the camera always sits within it. Pure GLSL / WebGL2
// path -- no postprocessing, no textures, no network.
//
// The gradient is computed in the vertex shader from world-space Y (normalised
// by the sphere radius) and interpolated across the fragment, which is cheap
// and band-free. Because the material has depthWrite=false and a large render
// order pushing it to draw first, scene geometry composites on top correctly.
//
// Offline-safe: imports only the canonical bare 'three' specifier.
//
// Usage:
//   import { createGradientSkybox } from './effects/gradient-skybox.js';
//   const sky = createGradientSkybox({ top: 0x1b2a4a, bottom: 0x9ec7f0, radius: 800 });
//   scene.add(sky);
//   // sky.userData.setColors(...) to retune; dispose via sky.userData.dispose().

import * as THREE from 'three';

function resolveColorVec(input, fallback) {
  let c;
  if (input instanceof THREE.Color) {
    c = input.clone();
  } else if (input === undefined || input === null) {
    c = new THREE.Color(fallback);
  } else {
    c = new THREE.Color(input);
  }
  return new THREE.Vector3(c.r, c.g, c.b);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp01(value) {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

const VERTEX_SHADER = [
  'varying float vGradient;',
  'uniform float uRadius;',
  'void main() {',
  '  vec4 worldPos = modelMatrix * vec4(position, 1.0);',
  // Map world Y from [-radius, +radius] into [0, 1]; 0 = bottom, 1 = top.
  '  vGradient = clamp((worldPos.y / uRadius) * 0.5 + 0.5, 0.0, 1.0);',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
  '}'
].join('\n');

const FRAGMENT_SHADER = [
  'precision mediump float;',
  'varying float vGradient;',
  'uniform vec3 uTop;',
  'uniform vec3 uMid;',
  'uniform vec3 uBottom;',
  'uniform float uMidPoint;',
  'uniform float uExponent;',
  'void main() {',
  '  float t = clamp(vGradient, 0.0, 1.0);',
  '  vec3 color;',
  '  if (t < uMidPoint) {',
  '    float k = pow(t / max(uMidPoint, 0.0001), uExponent);',
  '    color = mix(uBottom, uMid, k);',
  '  } else {',
  '    float k = pow((t - uMidPoint) / max(1.0 - uMidPoint, 0.0001), uExponent);',
  '    color = mix(uMid, uTop, k);',
  '  }',
  '  gl_FragColor = vec4(color, 1.0);',
  '}'
].join('\n');

// createGradientSkybox(opts) -> THREE.Mesh
//
// opts:
//   top      colour at the zenith. Default 0x1b2a4a.
//   bottom   colour at the horizon / nadir. Default 0x9ec7f0.
//   mid      optional middle band colour. Defaults to the average of top+bottom.
//   midPoint normalised height (0..1) where the mid band sits. Default 0.5.
//   exponent gradient curve sharpness, >0. Default 1.0 (linear). Larger = tighter
//            band near the midpoint.
//   radius   sphere radius; keep comfortably inside the camera far plane. Default 800.
//   segments sphere tessellation. Default 32 (smooth, cheap).
export function createGradientSkybox(opts = {}) {
  const radius = isFiniteNumber(opts.radius) ? Math.max(1, opts.radius) : 800;
  const segments = isFiniteNumber(opts.segments)
    ? Math.max(8, Math.min(96, Math.floor(opts.segments)))
    : 32;

  const topVec = resolveColorVec(opts.top, 0x1b2a4a);
  const bottomVec = resolveColorVec(opts.bottom, 0x9ec7f0);

  let midVec;
  if (opts.mid !== undefined && opts.mid !== null) {
    midVec = resolveColorVec(opts.mid, 0x4f6fa0);
  } else {
    midVec = new THREE.Vector3(
      (topVec.x + bottomVec.x) * 0.5,
      (topVec.y + bottomVec.y) * 0.5,
      (topVec.z + bottomVec.z) * 0.5
    );
  }

  const midPoint = isFiniteNumber(opts.midPoint) ? clamp01(opts.midPoint) : 0.5;
  const exponent = isFiniteNumber(opts.exponent) ? Math.max(0.05, opts.exponent) : 1.0;

  const geometry = new THREE.SphereGeometry(radius, segments, Math.max(8, Math.floor(segments / 2)));

  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uTop: { value: topVec },
      uMid: { value: midVec },
      uBottom: { value: bottomVec },
      uMidPoint: { value: midPoint },
      uExponent: { value: exponent },
      uRadius: { value: radius }
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'mchatai-gradient-skybox';
  // Draw first so opaque scene geometry composites over it; the sky never
  // writes depth, so it never occludes anything.
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  // Keep the sky centered on the camera if the host updates this each frame.
  mesh.matrixAutoUpdate = true;

  let disposed = false;

  mesh.userData.setColors = function setColors(next = {}) {
    if (disposed) {
      return mesh;
    }
    if (next.top !== undefined) {
      material.uniforms.uTop.value.copy(resolveColorVec(next.top, 0x1b2a4a));
    }
    if (next.bottom !== undefined) {
      material.uniforms.uBottom.value.copy(resolveColorVec(next.bottom, 0x9ec7f0));
    }
    if (next.mid !== undefined) {
      material.uniforms.uMid.value.copy(resolveColorVec(next.mid, 0x4f6fa0));
    }
    if (isFiniteNumber(next.midPoint)) {
      material.uniforms.uMidPoint.value = clamp01(next.midPoint);
    }
    if (isFiniteNumber(next.exponent)) {
      material.uniforms.uExponent.value = Math.max(0.05, next.exponent);
    }
    return mesh;
  };

  // Call each frame (optional) to lock the sky to the camera position so the
  // player can never travel to its edge.
  mesh.userData.follow = function follow(camera) {
    if (disposed || !camera || !camera.position) {
      return mesh;
    }
    mesh.position.copy(camera.position);
    return mesh;
  };

  mesh.userData.dispose = function dispose() {
    if (disposed) {
      return;
    }
    disposed = true;
    if (mesh.parent) {
      mesh.parent.remove(mesh);
    }
    geometry.dispose();
    material.dispose();
  };

  return mesh;
}

// END mChatAI Web Component: effects.gradient-skybox
