// BEGIN mChatAI Web Component: systems.voxel-chunk-3d
//
// The Minecraft seed: a dependency-free, renderer-agnostic voxel-world engine.
// A fixed-extent block grid with sinusoid-sum terrain generation, an
// Amanatides-Woo DDA voxel raycaster (place/destroy + face selection), greedy
// hidden-face-culled mesh emission as plain typed arrays, and AABB collider
// extraction for an FPS controller. NO three.js, NO WebGL, NO external
// dependencies — it manipulates plain Int arrays/numbers and RETURNS geometry
// data ({positions, normals, colors, indices}) that the caller wraps in a
// THREE.BufferGeometry (or feeds straight into a raw-WebGL vertex buffer). This
// keeps it usable with three.js OR hand-rolled WebGL and trivially offline-safe.
//
// Lifted + generalized from the proven raw-WebGL `voxel-sandbox` build
// (wizard.bare-html.ef6ee858, shipped working) — the terrain noise, DDA
// raycast, face-culling mesh, and per-axis collision are that build's algorithms
// made reusable. No new physics/algorithms were invented.
//
// USAGE (three.js)
//   import { VoxelWorld, BLOCK } from './voxel-chunk-3d.js';
//   import { FPSController } from '../controls/fps-controller.js';
//
//   const world = new VoxelWorld({ chunkSize: 30, height: 20 });
//   world.generateTerrain(1337);                       // grass/dirt/stone layers
//
//   // build the render mesh
//   const m = world.buildMeshData();                   // typed arrays
//   const geo = new THREE.BufferGeometry();
//   geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
//   geo.setAttribute('normal',   new THREE.BufferAttribute(m.normals, 3));
//   geo.setAttribute('color',    new THREE.BufferAttribute(m.colors, 3));
//   geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
//   const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
//
//   // wire collision: feed nearby solid-block boxes to the FPS controller
//   const fps = new FPSController(renderer.domElement, { position: [15, 16, 15] });
//   fps.colliders = world.aabbsNear(fps.position, 3);  // refresh each frame / on move
//
//   // place / destroy on click via the raycaster
//   const hit = world.raycastVoxel(fps.position, fps.forward(), 7);
//   if (hit.hit) {
//     world.setBlock(hit.block[0], hit.block[1], hit.block[2], BLOCK.AIR);          // destroy
//     // or place against the hit face:
//     // const [x,y,z] = hit.block, [nx,ny,nz] = hit.normal;
//     // world.setBlock(x+nx, y+ny, z+nz, BLOCK.STONE);
//     rebuildGeometry();                               // re-run buildMeshData()
//   }
//
// Block ids are small ints (see BLOCK). 0 is AIR (empty); anything > 0 is solid.
// Ids >= CUSTOM_BASE (16) are user palette colors — pass a colorForBlock(id) to
// buildMeshData() to map them however you like.

// ---------- block ids (small ints) ----------
/// Built-in block ids. AIR must stay 0 (the "empty / not solid" sentinel).
/// Custom/painted blocks use ids >= CUSTOM_BASE so they never collide with these.
export const BLOCK = Object.freeze({
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  WATER: 4,
  SAND: 5,
  WOOD: 6,
  LEAVES: 7,
});

/// Painted/custom block ids start here (BLOCK.AIR..15 are reserved for built-ins).
export const CUSTOM_BASE = 16;

// ---------- default palette ----------
/// Default [r,g,b] (0..1) per built-in block id. `top` faces of grass get a
/// distinct green; every other face/grass-side reads as dirt — same scheme the
/// proven build used. Returned via colorForBlock() unless the caller overrides.
const DEFAULT_PALETTE = {
  [BLOCK.GRASS]: { top: [0.40, 0.68, 0.28], side: [0.50, 0.37, 0.22] },
  [BLOCK.DIRT]:  [0.50, 0.37, 0.22],
  [BLOCK.STONE]: [0.55, 0.56, 0.59],
  [BLOCK.WATER]: [0.24, 0.45, 0.78],
  [BLOCK.SAND]:  [0.85, 0.78, 0.52],
  [BLOCK.WOOD]:  [0.45, 0.31, 0.16],
  [BLOCK.LEAVES]: [0.27, 0.52, 0.24],
};

/// Default color lookup: returns an [r,g,b] (0..1) for a block id + face key
/// ('top' | 'bottom' | 'side'). Magenta for unknown ids (visible "missing" tint).
export function defaultColorForBlock(id, faceKey = 'side') {
  const e = DEFAULT_PALETTE[id];
  if (!e) return [1, 0, 1];
  if (Array.isArray(e)) return e;
  // grass-style {top, side}: bottom + sides share the side color
  return faceKey === 'top' ? (e.top || e.side) : (e.side || e.top);
}

// ---------- the six cube faces ----------
// offset = neighbor direction to test for culling; normal = outward face normal;
// key = lighting/color bucket; corners = the 4 vertices (in unit-cube space, CCW
// when viewed from outside) so callers get correct winding + per-face flat normals.
const FACES = [
  { offset: [0, 1, 0],  normal: [0, 1, 0],  key: 'top',    corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { offset: [0, -1, 0], normal: [0, -1, 0], key: 'bottom', corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { offset: [1, 0, 0],  normal: [1, 0, 0],  key: 'side',   corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { offset: [-1, 0, 0], normal: [-1, 0, 0], key: 'side',   corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { offset: [0, 0, 1],  normal: [0, 0, 1],  key: 'side',   corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { offset: [0, 0, -1], normal: [0, 0, -1], key: 'side',   corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];

// Per-face flat-shade multiplier — fakes ambient occlusion / directional light
// so a vertex-color-only material still reads as a lit cube. (From the build.)
const FACE_SHADE = { top: 1.0, bottom: 0.5, side: 0.78 };

/// Deterministic LCG — same seed => same world every load (no popping terrain).
function seededRng(seed = 1337) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export class VoxelWorld {
  /// opts:
  ///   chunkSize : grid extent in X and Z (default 30)
  ///   height    : grid extent in Y      (default 20)
  ///   noise     : optional (x,z) => number override for terrain height; if
  ///               omitted, the proven sinusoid-sum field is used.
  ///   solidBorder : if true (default), out-of-bounds XZ counts as solid wall
  ///               for collision (invisible boundary). Y below 0 is always solid;
  ///               Y above the grid is always air.
  constructor({ chunkSize = 30, height = 20, noise = null, solidBorder = true } = {}) {
    this.sizeX = chunkSize | 0;
    this.sizeZ = chunkSize | 0;
    this.sizeY = height | 0;
    this.noise = typeof noise === 'function' ? noise : null;
    this.solidBorder = solidBorder !== false;
    // y-major then z then x: idx = (y*sizeZ + z)*sizeX + x  (matches the build)
    this.blocks = new Int16Array(this.sizeX * this.sizeY * this.sizeZ);
  }

  // ---------- indexing ----------
  _idx(x, y, z) { return (y * this.sizeZ + z) * this.sizeX + x; }

  /// In the addressable grid box?
  inBounds(x, y, z) {
    return x >= 0 && x < this.sizeX && y >= 0 && y < this.sizeY && z >= 0 && z < this.sizeZ;
  }

  /// Block id at a cell. Out-of-bounds reads return AIR (so meshing/raycast see
  /// open sky past the edges); use isSolid() for collision-aware queries.
  getBlock(x, y, z) {
    x |= 0; y |= 0; z |= 0;
    return this.inBounds(x, y, z) ? this.blocks[this._idx(x, y, z)] : BLOCK.AIR;
  }

  /// Write a block id (any small int; 0 = AIR clears the cell). No-op if oob.
  setBlock(x, y, z, id) {
    x |= 0; y |= 0; z |= 0;
    if (this.inBounds(x, y, z)) this.blocks[this._idx(x, y, z)] = id | 0;
  }

  /// Collision-aware solidity: treats sub-floor and (optionally) the XZ border as
  /// solid walls so the player can't fall through the bottom or walk off the edge.
  isSolid(x, y, z) {
    if (y < 0) return true;                  // bedrock floor
    if (y >= this.sizeY) return false;       // open sky
    if (x < 0 || x >= this.sizeX || z < 0 || z >= this.sizeZ) return this.solidBorder;
    return this.blocks[this._idx(x, y, z)] > BLOCK.AIR;
  }

  // ---------- terrain ----------
  /// Sinusoid-sum height field (the proven "Perlin-like" noise): a few sines of
  /// different frequencies summed into a smooth rolling surface. Clamped to leave
  /// headroom + a stone floor. Returns an integer column height.
  _terrainHeight(x, z) {
    if (this.noise) {
      const h = Math.floor(this.noise(x, z));
      return Math.max(1, Math.min(this.sizeY - 2, h));
    }
    let h = this.sizeY * 0.4
      + 3.0 * Math.sin(x * 0.32)
      + 2.4 * Math.cos(z * 0.27)
      + 1.6 * Math.sin((x + z) * 0.18)
      + 1.2 * Math.cos((x - z) * 0.21);
    h = Math.floor(h);
    return Math.max(3, Math.min(this.sizeY - 4, h));
  }

  /// Fill the whole grid with terrain: each column gets STONE up to height-3,
  /// DIRT for the next two, GRASS on top — exactly the build's layering. `seed`
  /// is reserved for callers who pass a noise fn that consumes it; the built-in
  /// field is deterministic by position. Returns this for chaining.
  generateTerrain(seed = 1337) {
    const rng = seededRng(seed);       // available for noise fns / future jitter
    void rng;
    this.blocks.fill(BLOCK.AIR);
    for (let x = 0; x < this.sizeX; x++) {
      for (let z = 0; z < this.sizeZ; z++) {
        const h = this._terrainHeight(x, z);
        for (let y = 0; y <= h && y < this.sizeY; y++) {
          let t = BLOCK.STONE;
          if (y === h) t = BLOCK.GRASS;
          else if (y >= h - 2) t = BLOCK.DIRT;
          this.blocks[this._idx(x, y, z)] = t;
        }
      }
    }
    return this;
  }

  /// Surface (top-most solid) Y at a column — handy for spawning the player.
  surfaceHeight(x, z) {
    x |= 0; z |= 0;
    if (x < 0 || x >= this.sizeX || z < 0 || z >= this.sizeZ) return 0;
    for (let y = this.sizeY - 1; y >= 0; y--) {
      if (this.blocks[this._idx(x, y, z)] > BLOCK.AIR) return y;
    }
    return 0;
  }

  // ---------- raycast (Amanatides-Woo DDA) ----------
  /// March a ray through the voxel grid one cell-boundary at a time and return
  /// the first solid cell hit, plus the face normal of the side the ray entered
  /// through. That normal is what you add to the hit cell to place a block on the
  /// correct face. This is the exact DDA from the proven build, parameterized.
  ///   origin  : [x,y,z] world-space ray start (e.g. the camera/eye position)
  ///   dir     : [x,y,z] direction (need not be normalized)
  ///   maxDist : how far (in world units) to march before giving up
  /// Returns { hit, block:[x,y,z], normal:[x,y,z] }. On a miss, hit=false and
  /// block/normal hold the last stepped values (ignore them).
  raycastVoxel(origin, dir, maxDist = 8) {
    const ox = origin[0], oy = origin[1], oz = origin[2];
    let dx = dir[0], dy = dir[1], dz = dir[2];
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;

    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const stepX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
    const stepY = dy > 0 ? 1 : (dy < 0 ? -1 : 0);
    const stepZ = dz > 0 ? 1 : (dz < 0 ? -1 : 0);

    const BIG = 1e9;
    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : BIG;
    const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : BIG;
    const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : BIG;
    let tMaxX = dx !== 0 ? ((stepX > 0 ? x + 1 : x) - ox) / dx : BIG;
    let tMaxY = dy !== 0 ? ((stepY > 0 ? y + 1 : y) - oy) / dy : BIG;
    let tMaxZ = dz !== 0 ? ((stepZ > 0 ? z + 1 : z) - oz) / dz : BIG;

    let nx = 0, ny = 0, nz = 0;
    // generous iteration cap; the tMax > maxDist guards are the real terminator.
    const guard = Math.max(64, Math.ceil(maxDist) * 4 + 8);
    for (let i = 0; i < guard; i++) {
      if (this.getBlock(x, y, z) > BLOCK.AIR) {
        return { hit: true, block: [x, y, z], normal: [nx, ny, nz] };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        if (tMaxX > maxDist) break;
        x += stepX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0;
      } else if (tMaxY < tMaxZ) {
        if (tMaxY > maxDist) break;
        y += stepY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0;
      } else {
        if (tMaxZ > maxDist) break;
        z += stepZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ;
      }
    }
    return { hit: false, block: [x, y, z], normal: [nx, ny, nz] };
  }

  // ---------- mesh ----------
  /// Build an indexed render mesh with hidden-face culling: a cube face is only
  /// emitted when its neighbor in that direction is AIR (skip faces between two
  /// solid blocks — the bulk of the triangle savings). Returns plain typed arrays
  /// the caller wraps in THREE.BufferGeometry (or a raw-WebGL VBO):
  ///   { positions:Float32Array, normals:Float32Array,
  ///     colors:Float32Array, indices:Uint32Array }
  /// colorForBlock(id, faceKey) -> [r,g,b] (0..1) overrides the default palette;
  /// the face shade multiplier is applied on top for cheap directional lighting.
  buildMeshData(colorForBlock = defaultColorForBlock) {
    const positions = [];
    const normals = [];
    const colors = [];
    const indices = [];
    let vbase = 0;

    for (let y = 0; y < this.sizeY; y++) {
      for (let z = 0; z < this.sizeZ; z++) {
        for (let x = 0; x < this.sizeX; x++) {
          const id = this.blocks[this._idx(x, y, z)];
          if (id === BLOCK.AIR) continue;

          for (let f = 0; f < 6; f++) {
            const face = FACES[f];
            // hidden-face cull: emit only if the neighbor cell is empty
            if (this.getBlock(x + face.offset[0], y + face.offset[1], z + face.offset[2]) > BLOCK.AIR) continue;
            // also skip the world's true bottom face (never seen, saves quads)
            if (face.key === 'bottom' && y === 0) continue;

            const base = colorForBlock(id, face.key) || [1, 0, 1];
            const k = FACE_SHADE[face.key] ?? 1;
            const r = base[0] * k, g = base[1] * k, b = base[2] * k;
            const n = face.normal;

            for (let c = 0; c < 4; c++) {
              const corner = face.corners[c];
              positions.push(x + corner[0], y + corner[1], z + corner[2]);
              normals.push(n[0], n[1], n[2]);
              colors.push(r, g, b);
            }
            // two triangles per quad (corners are CCW-from-outside)
            indices.push(vbase, vbase + 1, vbase + 2, vbase, vbase + 2, vbase + 3);
            vbase += 4;
          }
        }
      }
    }

    return {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      colors: new Float32Array(colors),
      indices: new Uint32Array(indices),
    };
  }

  // ---------- collision ----------
  /// Collect the AABBs of every solid block within `radius` cells of `pos`, as
  /// [{min:[x,y,z], max:[x,y,z]}] — feed straight into FPSController.colliders so
  /// its swept-AABB wall-slide resolves against the actual voxels. Each block's
  /// box is its unit cell ([x,y,z] .. [x+1,y+1,z+1]). Call when the player moves
  /// to a new cell (it's cheap, but no need to rebuild every frame).
  aabbsNear(pos, radius = 3) {
    const cx = Math.floor(pos[0]), cy = Math.floor(pos[1]), cz = Math.floor(pos[2]);
    const r = Math.max(1, radius | 0);
    const boxes = [];
    for (let y = cy - r; y <= cy + r; y++) {
      if (y < 0 || y >= this.sizeY) continue;
      for (let z = cz - r; z <= cz + r; z++) {
        if (z < 0 || z >= this.sizeZ) continue;
        for (let x = cx - r; x <= cx + r; x++) {
          if (x < 0 || x >= this.sizeX) continue;
          if (this.blocks[this._idx(x, y, z)] > BLOCK.AIR) {
            boxes.push({ min: [x, y, z], max: [x + 1, y + 1, z + 1] });
          }
        }
      }
    }
    return boxes;
  }

  /// True if an AABB (player capsule box) overlaps any solid voxel — a direct
  /// swept-collision test if you'd rather not route through aabbsNear/colliders.
  /// min/max are [x,y,z] world coords. Mirrors the build's `collides()` sweep.
  intersectsSolid(min, max) {
    const x0 = Math.floor(min[0]), x1 = Math.floor(max[0]);
    const y0 = Math.floor(min[1]), y1 = Math.floor(max[1] - 1e-3);
    const z0 = Math.floor(min[2]), z1 = Math.floor(max[2]);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++)
          if (this.isSolid(x, y, z)) return true;
    return false;
  }

  /// Drop the backing buffer (the only retained resource). Safe to call once.
  dispose() {
    this.blocks = null;
    this.noise = null;
  }
}

// END mChatAI Web Component: systems.voxel-chunk-3d
