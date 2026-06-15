// BEGIN mChatAI Web Component: effects.instanced-particle-pool
//
// A single additive-blended THREE.Points cloud that recycles a fixed pool of
// particles. All buffers are pre-allocated once; spawn()/update(dt)/reset()
// do ZERO per-frame allocation -- they only write into typed arrays already on
// the GPU-backed BufferGeometry. This is the convergence target for every
// particle effect in the 3D catalog (explosions, sparks, pickups, trails).
//
// Each particle carries position, velocity, age, lifetime, base colour and
// base size in parallel typed arrays. Dead particles have size 0 (invisible)
// and are reused on the next spawn via a free-list head pointer. A round-robin
// fallback overwrites the oldest live particle when the pool is full, so the
// effect degrades gracefully under burst load instead of dropping spawns.
//
// Offline-safe: imports only the canonical bare 'three' specifier. WebGL2 only.
//
// Usage:
//   import { InstancedParticlePool } from './effects/instanced-particle-pool.js';
//   const sparks = new InstancedParticlePool({ capacity: 600, size: 0.4 });
//   scene.add(sparks.object3d);
//   // on a hit:
//   sparks.spawnBurst(hitPoint, { count: 24, speed: 6, color: 0xffcc44, life: 0.8 });
//   // in the loop:
//   sparks.update(dt);
//   // on teardown:
//   sparks.dispose();

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

const VERTEX_SHADER = [
  'attribute float aSize;',
  'attribute vec3 aColor;',
  'attribute float aAlpha;',
  'varying vec3 vColor;',
  'varying float vAlpha;',
  'uniform float uPixelScale;',
  'void main() {',
  '  vColor = aColor;',
  '  vAlpha = aAlpha;',
  '  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
  // Perspective size attenuation: closer particles are larger.
  '  gl_PointSize = aSize * uPixelScale / max(-mvPosition.z, 0.001);',
  '  gl_Position = projectionMatrix * mvPosition;',
  '}'
].join('\n');

const FRAGMENT_SHADER = [
  'precision mediump float;',
  'varying vec3 vColor;',
  'varying float vAlpha;',
  'void main() {',
  // Soft round sprite from point coords; discard the square corners.
  '  vec2 d = gl_PointCoord - vec2(0.5);',
  '  float r = dot(d, d);',
  '  if (r > 0.25) { discard; }',
  '  float falloff = 1.0 - (r * 4.0);',
  '  gl_FragColor = vec4(vColor, vAlpha * falloff);',
  '}'
].join('\n');

const SCRATCH_COLOR = new THREE.Color();

export class InstancedParticlePool {
  // opts:
  //   capacity     max live particles. Default 512. Clamped 1..100000.
  //   size         default base point size. Default 0.5.
  //   color        default base colour (hex/CSS/THREE.Color). Default 0xffffff.
  //   gravity      world-space acceleration applied each update. Default {x:0,y:0,z:0}.
  //   drag         per-second velocity damping factor 0..1. Default 0 (no drag).
  //   pixelScale   point-size projection constant. Default 300.
  //   blending     THREE blending constant. Default THREE.AdditiveBlending.
  //   fadeOut      when true, alpha ramps 1 -> 0 across each particle life. Default true.
  constructor(opts = {}) {
    this.capacity = isFiniteNumber(opts.capacity)
      ? Math.floor(clamp(opts.capacity, 1, 100000))
      : 512;
    this.defaultSize = isFiniteNumber(opts.size) ? Math.max(0, opts.size) : 0.5;
    this.fadeOut = opts.fadeOut !== false;
    this.drag = isFiniteNumber(opts.drag) ? clamp(opts.drag, 0, 1) : 0;

    const g = opts.gravity || {};
    this.gravity = new THREE.Vector3(
      isFiniteNumber(g.x) ? g.x : 0,
      isFiniteNumber(g.y) ? g.y : 0,
      isFiniteNumber(g.z) ? g.z : 0
    );

    const defColor = new THREE.Color(opts.color === undefined ? 0xffffff : opts.color);
    this.defaultColor = defColor;

    const n = this.capacity;

    // Pre-allocated parallel arrays. No allocation after this point.
    this._positions = new Float32Array(n * 3);
    this._colors = new Float32Array(n * 3);
    this._sizes = new Float32Array(n);
    this._alphas = new Float32Array(n);
    this._velocities = new Float32Array(n * 3);
    this._ages = new Float32Array(n);
    this._lifetimes = new Float32Array(n);
    this._baseSizes = new Float32Array(n);
    this._alive = new Uint8Array(n);

    // Free-list of available slots (LIFO). Pre-filled with every index.
    this._freeList = new Int32Array(n);
    this._freeCount = n;
    for (let i = 0; i < n; i += 1) {
      this._freeList[i] = n - 1 - i;
      this._sizes[i] = 0; // dead particles render at size 0.
    }

    this._roundRobin = 0;
    this.liveCount = 0;
    this._disposed = false;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this._positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(this._colors, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this._sizes, 1));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this._alphas, 1));
    // Keep a wide bounding sphere so the GPU never culls the live cloud.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: opts.blending !== undefined ? opts.blending : THREE.AdditiveBlending,
      uniforms: {
        uPixelScale: { value: isFiniteNumber(opts.pixelScale) ? opts.pixelScale : 300 }
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER
    });

    this._geometry = geometry;
    this._material = material;

    this.object3d = new THREE.Points(geometry, material);
    this.object3d.name = 'mchatai-particle-pool';
    this.object3d.frustumCulled = false;
  }

  // Acquire one free slot, or recycle the oldest live one if the pool is full.
  _acquireSlot() {
    if (this._freeCount > 0) {
      this._freeCount -= 1;
      return this._freeList[this._freeCount];
    }
    // Pool full: round-robin overwrite so bursts degrade instead of dropping.
    const slot = this._roundRobin;
    this._roundRobin = (this._roundRobin + 1) % this.capacity;
    return slot;
  }

  // spawn(position, opts) -> slot index or -1.
  // position: THREE.Vector3 or {x,y,z}. opts overrides defaults per particle:
  //   velocity {x,y,z}, color, size, life (seconds), alpha (start alpha).
  spawn(position, opts = {}) {
    if (this._disposed) {
      return -1;
    }
    const slot = this._acquireSlot();
    const wasAlive = this._alive[slot] === 1;

    const p3 = slot * 3;
    const px = position && isFiniteNumber(position.x) ? position.x : 0;
    const py = position && isFiniteNumber(position.y) ? position.y : 0;
    const pz = position && isFiniteNumber(position.z) ? position.z : 0;
    this._positions[p3] = px;
    this._positions[p3 + 1] = py;
    this._positions[p3 + 2] = pz;

    const v = opts.velocity || {};
    this._velocities[p3] = isFiniteNumber(v.x) ? v.x : 0;
    this._velocities[p3 + 1] = isFiniteNumber(v.y) ? v.y : 0;
    this._velocities[p3 + 2] = isFiniteNumber(v.z) ? v.z : 0;

    if (opts.color !== undefined && opts.color !== null) {
      SCRATCH_COLOR.set(opts.color);
    } else {
      SCRATCH_COLOR.copy(this.defaultColor);
    }
    this._colors[p3] = SCRATCH_COLOR.r;
    this._colors[p3 + 1] = SCRATCH_COLOR.g;
    this._colors[p3 + 2] = SCRATCH_COLOR.b;

    const baseSize = isFiniteNumber(opts.size) ? Math.max(0, opts.size) : this.defaultSize;
    this._baseSizes[slot] = baseSize;
    this._sizes[slot] = baseSize;

    const life = isFiniteNumber(opts.life) ? Math.max(0.001, opts.life) : 1.0;
    this._lifetimes[slot] = life;
    this._ages[slot] = 0;

    const startAlpha = isFiniteNumber(opts.alpha) ? clamp(opts.alpha, 0, 1) : 1.0;
    this._alphas[slot] = startAlpha;
    this._startAlphaForSlot(slot, startAlpha);

    if (!wasAlive) {
      this._alive[slot] = 1;
      this.liveCount += 1;
    }
    return slot;
  }

  _startAlphaForSlot(slot, alpha) {
    // Stash the spawn alpha in baseSizes' sibling channel via lifetimes only;
    // we recompute alpha from age each frame, so just store start in _alphas.
    this._alphas[slot] = alpha;
  }

  // Convenience: emit a radial burst of `count` particles from one point.
  // opts: count, speed, speedJitter (0..1), color, size, life, spread (0..1
  //       cone bias toward +Y; 1 = full sphere).
  spawnBurst(position, opts = {}) {
    if (this._disposed) {
      return 0;
    }
    const count = isFiniteNumber(opts.count) ? Math.max(0, Math.floor(opts.count)) : 16;
    const speed = isFiniteNumber(opts.speed) ? opts.speed : 4;
    const jitter = isFiniteNumber(opts.speedJitter) ? clamp(opts.speedJitter, 0, 1) : 0.4;
    let emitted = 0;
    for (let i = 0; i < count; i += 1) {
      // Uniform point on a sphere (no allocation: reuse SCRATCH math inline).
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.max(0, 1 - u * u));
      const dx = r * Math.cos(theta);
      const dy = u;
      const dz = r * Math.sin(theta);
      const s = speed * (1 - jitter + Math.random() * jitter);
      this.spawn(position, {
        velocity: { x: dx * s, y: dy * s, z: dz * s },
        color: opts.color,
        size: opts.size,
        life: opts.life,
        alpha: opts.alpha
      });
      emitted += 1;
    }
    return emitted;
  }

  // Integrate every live particle by dt seconds. Kills expired ones and pushes
  // their slot back onto the free-list. No allocation.
  update(dt) {
    if (this._disposed || !isFiniteNumber(dt) || dt <= 0 || this.liveCount === 0) {
      return;
    }
    const clampedDt = Math.min(dt, 1 / 15);
    const dragFactor = this.drag > 0 ? Math.max(0, 1 - this.drag * clampedDt) : 1;
    const gx = this.gravity.x * clampedDt;
    const gy = this.gravity.y * clampedDt;
    const gz = this.gravity.z * clampedDt;

    for (let i = 0; i < this.capacity; i += 1) {
      if (this._alive[i] !== 1) {
        continue;
      }
      const age = this._ages[i] + clampedDt;
      const life = this._lifetimes[i];
      if (age >= life) {
        this._killSlot(i);
        continue;
      }
      this._ages[i] = age;

      const p3 = i * 3;
      // velocity += gravity; velocity *= drag.
      let vx = this._velocities[p3] + gx;
      let vy = this._velocities[p3 + 1] + gy;
      let vz = this._velocities[p3 + 2] + gz;
      if (dragFactor !== 1) {
        vx *= dragFactor;
        vy *= dragFactor;
        vz *= dragFactor;
      }
      this._velocities[p3] = vx;
      this._velocities[p3 + 1] = vy;
      this._velocities[p3 + 2] = vz;

      this._positions[p3] += vx * clampedDt;
      this._positions[p3 + 1] += vy * clampedDt;
      this._positions[p3 + 2] += vz * clampedDt;

      if (this.fadeOut) {
        const t = 1 - age / life;
        this._alphas[i] = t;
        // Slight shrink near death looks better than a pop.
        this._sizes[i] = this._baseSizes[i] * (0.4 + 0.6 * t);
      }
    }

    this._geometry.attributes.position.needsUpdate = true;
    this._geometry.attributes.aColor.needsUpdate = true;
    this._geometry.attributes.aSize.needsUpdate = true;
    this._geometry.attributes.aAlpha.needsUpdate = true;
  }

  _killSlot(slot) {
    if (this._alive[slot] !== 1) {
      return;
    }
    this._alive[slot] = 0;
    this._sizes[slot] = 0;
    this._alphas[slot] = 0;
    this.liveCount -= 1;
    if (this._freeCount < this.capacity) {
      this._freeList[this._freeCount] = slot;
      this._freeCount += 1;
    }
  }

  // Kill every particle and restore the full free-list. No allocation.
  reset() {
    for (let i = 0; i < this.capacity; i += 1) {
      this._alive[i] = 0;
      this._sizes[i] = 0;
      this._alphas[i] = 0;
      this._freeList[i] = this.capacity - 1 - i;
    }
    this._freeCount = this.capacity;
    this._roundRobin = 0;
    this.liveCount = 0;
    if (!this._disposed) {
      this._geometry.attributes.aSize.needsUpdate = true;
      this._geometry.attributes.aAlpha.needsUpdate = true;
    }
  }

  // Free all GPU resources. The pool is unusable afterward.
  dispose() {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    if (this.object3d.parent) {
      this.object3d.parent.remove(this.object3d);
    }
    this._geometry.dispose();
    this._material.dispose();
  }
}

// END mChatAI Web Component: effects.instanced-particle-pool
