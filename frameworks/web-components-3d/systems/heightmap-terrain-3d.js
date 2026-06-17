// BEGIN mChatAI Web Component: systems.heightmap-terrain-3d
//
// Smooth procedural terrain (the continuous-landscape complement to the blocky
// systems.voxel-chunk-3d). Generates a seeded fBm/sinusoid-sum height field and
// emits raw mesh data ({positions, normals, colors, indices}) the caller wraps
// in a THREE.BufferGeometry -- exactly the voxel-chunk contract -- so it merges
// into ONE mesh = ONE draw call (tjs-004). Vertex-coloured by altitude and slope
// so it reads as grass/rock/snow with no textures and no network.
//
// heightAt(x,z) and normalAt(x,z) let you ground characters and vehicles on the
// real surface (set entity.y = terrain.heightAt(entity.x, entity.z)), and
// slopeAt(x,z) gates where things can stand or roll.
//
// Dependency-free: returns typed arrays + plain numbers; the caller owns THREE.
// Offline-safe by construction.
//
// Usage:
//   import { HeightmapTerrain } from './systems/heightmap-terrain-3d.js';
//   const terrain = new HeightmapTerrain({ size: 200, segments: 128, seed: 1337 });
//   const m = terrain.buildMeshData();
//   const geo = new THREE.BufferGeometry();
//   geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
//   geo.setAttribute('normal',   new THREE.BufferAttribute(m.normals, 3));
//   geo.setAttribute('color',    new THREE.BufferAttribute(m.colors, 3));
//   geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
//   const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors:true, flatShading:true }));
//   scene.add(mesh);
//   // ground a character each frame:
//   player.position.y = terrain.heightAt(player.position.x, player.position.z) + 0.9;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function smooth(t) {
  return t * t * (3 - 2 * t);
}

// Seeded value-noise: hash a lattice, bilinear-smooth between cells. Deterministic
// for a given seed (fBm-friendly, no external libs).
function _hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 2654435761) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296; // 0..1
}
function _valueNoise(x, z, seed) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = smooth(x - x0);
  const tz = smooth(z - z0);
  const v00 = _hash2(x0, z0, seed);
  const v10 = _hash2(x0 + 1, z0, seed);
  const v01 = _hash2(x0, z0 + 1, seed);
  const v11 = _hash2(x0 + 1, z0 + 1, seed);
  return lerp(lerp(v00, v10, tx), lerp(v01, v11, tx), tz);
}

// Fractal Brownian motion: sum of octaves of value noise.
function _fbm(x, z, seed, octaves, lacunarity, gain) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * _valueNoise(x * freq, z * freq, seed + o * 131);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0; // 0..1
}

export class HeightmapTerrain {
  // opts:
  //   size       world extent (square), centered at origin. Default 200.
  //   segments   grid resolution per side. Default 128 (~33k tris). Higher =
  //              smoother + heavier; keep <=192 for the draw-call budget.
  //   amplitude  peak terrain height. Default 18.
  //   seed       integer for deterministic terrain. Default 1337.
  //   octaves    fBm detail octaves. Default 5.
  //   lacunarity per-octave frequency multiplier. Default 2.0.
  //   gain       per-octave amplitude falloff. Default 0.5.
  //   frequency  base noise frequency (smaller = broader hills). Default 0.012.
  //   noise      optional (x,z)->[0..1] override; replaces the built-in fBm.
  //   colorBands optional [{ maxHeight01, color:[r,g,b] }] altitude palette.
  //   waterLevel optional normalised height (0..1) flattened to a flat plane
  //              region; informational (the caller can render water). Default null.
  constructor(opts = {}) {
    this.size = isFiniteNumber(opts.size) ? Math.max(2, opts.size) : 200;
    this.segments = isFiniteNumber(opts.segments) ? Math.max(2, Math.min(256, Math.floor(opts.segments))) : 128;
    this.amplitude = isFiniteNumber(opts.amplitude) ? opts.amplitude : 18;
    this.seed = Number.isInteger(opts.seed) ? opts.seed : 1337;
    this.octaves = isFiniteNumber(opts.octaves) ? Math.max(1, Math.floor(opts.octaves)) : 5;
    this.lacunarity = isFiniteNumber(opts.lacunarity) ? opts.lacunarity : 2.0;
    this.gain = isFiniteNumber(opts.gain) ? opts.gain : 0.5;
    this.frequency = isFiniteNumber(opts.frequency) ? opts.frequency : 0.012;
    this._noise = typeof opts.noise === 'function' ? opts.noise : null;

    this.colorBands = Array.isArray(opts.colorBands) && opts.colorBands.length
      ? opts.colorBands
      : [
          { maxHeight01: 0.30, color: [0.16, 0.36, 0.18] }, // low grass
          { maxHeight01: 0.55, color: [0.32, 0.46, 0.22] }, // hills
          { maxHeight01: 0.78, color: [0.42, 0.36, 0.28] }, // rock
          { maxHeight01: 1.01, color: [0.92, 0.92, 0.95] }  // snow
        ];
    this.waterLevel = isFiniteNumber(opts.waterLevel) ? clamp(opts.waterLevel, 0, 1) : null;

    // Cache the normalised height field (0..1) so heightAt/buildMeshData agree.
    this._field = null;
  }

  // Normalised height 0..1 at grid-space (gx, gz) in [0, segments].
  _sample01(nx, nz) {
    if (this._noise) {
      return clamp(this._noise(nx, nz), 0, 1);
    }
    let h = _fbm(nx * this.frequency, nz * this.frequency, this.seed, this.octaves, this.lacunarity, this.gain);
    // Ridge the upper band a touch so peaks feel mountainous, not domed.
    h = Math.pow(h, 1.3);
    if (this.waterLevel != null && h < this.waterLevel) {
      h = this.waterLevel; // flatten below the water line
    }
    return clamp(h, 0, 1);
  }

  // World-space surface height at (x, z). Bilinear over the field for smoothness.
  heightAt(x, z) {
    return this._sample01(x, z) * this.amplitude;
  }

  // Approximate surface normal at (x, z) via central differences.
  normalAt(x, z, eps = 0.5) {
    const hl = this.heightAt(x - eps, z);
    const hr = this.heightAt(x + eps, z);
    const hd = this.heightAt(x, z - eps);
    const hu = this.heightAt(x, z + eps);
    const nx = hl - hr;
    const nz = hd - hu;
    const ny = 2 * eps;
    const len = Math.hypot(nx, ny, nz) || 1;
    return [nx / len, ny / len, nz / len];
  }

  // Slope at (x, z) in radians from flat (0 = flat ground, PI/2 = vertical).
  slopeAt(x, z) {
    const n = this.normalAt(x, z);
    return Math.acos(clamp(n[1], -1, 1));
  }

  _colorFor(h01, out) {
    for (const band of this.colorBands) {
      if (h01 <= band.maxHeight01) {
        out[0] = band.color[0];
        out[1] = band.color[1];
        out[2] = band.color[2];
        return;
      }
    }
    const last = this.colorBands[this.colorBands.length - 1].color;
    out[0] = last[0]; out[1] = last[1]; out[2] = last[2];
  }

  // Build raw mesh data the caller wraps in THREE.BufferGeometry. Mirrors the
  // systems.voxel-chunk-3d buildMeshData contract.
  buildMeshData() {
    const seg = this.segments;
    const verts = (seg + 1) * (seg + 1);
    const positions = new Float32Array(verts * 3);
    const normals = new Float32Array(verts * 3);
    const colors = new Float32Array(verts * 3);
    const indices = new Uint32Array(seg * seg * 6);

    const half = this.size / 2;
    const cell = this.size / seg;
    const col = [0, 0, 0];

    let p = 0;
    let c = 0;
    for (let iz = 0; iz <= seg; iz++) {
      for (let ix = 0; ix <= seg; ix++) {
        const wx = -half + ix * cell;
        const wz = -half + iz * cell;
        const h01 = this._sample01(wx, wz);
        const y = h01 * this.amplitude;
        positions[p] = wx;
        positions[p + 1] = y;
        positions[p + 2] = wz;
        const n = this.normalAt(wx, wz, cell * 0.5);
        normals[p] = n[0];
        normals[p + 1] = n[1];
        normals[p + 2] = n[2];
        this._colorFor(h01, col);
        // darken steeper slopes a touch for depth
        const shade = 0.85 + 0.15 * n[1];
        colors[c] = col[0] * shade;
        colors[c + 1] = col[1] * shade;
        colors[c + 2] = col[2] * shade;
        p += 3;
        c += 3;
      }
    }

    let i = 0;
    const row = seg + 1;
    for (let iz = 0; iz < seg; iz++) {
      for (let ix = 0; ix < seg; ix++) {
        const a = iz * row + ix;
        const b = a + 1;
        const d = a + row;
        const e = d + 1;
        // two triangles, CCW from above
        indices[i] = a; indices[i + 1] = d; indices[i + 2] = b;
        indices[i + 3] = b; indices[i + 4] = d; indices[i + 5] = e;
        i += 6;
      }
    }

    return { positions, normals, colors, indices };
  }
}

// fbmNoise(x, z, seed, opts) -- standalone noise for callers who want to drive
// their own systems (clouds, scatter density) from the same field.
export function fbmNoise(x, z, seed = 1337, opts = {}) {
  const octaves = isFiniteNumber(opts.octaves) ? opts.octaves : 5;
  const lacunarity = isFiniteNumber(opts.lacunarity) ? opts.lacunarity : 2.0;
  const gain = isFiniteNumber(opts.gain) ? opts.gain : 0.5;
  const freq = isFiniteNumber(opts.frequency) ? opts.frequency : 0.012;
  return _fbm(x * freq, z * freq, seed, octaves, lacunarity, gain);
}

// sampleHeight(terrain, x, z) -- convenience pass-through.
export function sampleHeight(terrain, x, z) {
  return terrain && typeof terrain.heightAt === 'function' ? terrain.heightAt(x, z) : 0;
}

// END mChatAI Web Component: systems.heightmap-terrain-3d
