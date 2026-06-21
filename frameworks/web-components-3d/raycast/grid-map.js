// BEGIN mChatAI Web Component: raycast.grid-map
//
// The level substrate for grid raycasters and 2D top-down dungeons.
// PURE data + integer math: NO canvas, NO three.js, NO WebGL, NO external
// dependencies, fully offline-safe. It turns ASCII levels OR procedural mazes
// into a plain tile grid (a row-array of cell strings), scans typed symbols
// into an entity list, and runs the small graph kernels (BFS flood, BFS next
// step) that raycaster games lean on for far-placement, exit selection, torch
// placement, and stalker pathfinding.
//
// CONTRAST WITH systems.voxel-chunk-3d: that module is a 3D get/setBlock voxel
// WORLD (Int arrays of block ids, DDA raycast, mesh emission). THIS module is
// 2D: an ASCII / maze tile grid plus BFS-DISTANCE graph utilities. No 3D, no
// geometry, no rendering. Pair it with raycast.grid-enemy-ai (consumes
// bfsNextStep) and any DDA wall-caster (consumes isWall / solidAt).
//
// Lifted + generalized (NO new algorithms invented) from four shipped builds:
//   - catacomb-carnage : ASCII build + outer-border seal + reachable() flood +
//                        far-cell placement of enemies and torches.
//   - crypt-of-the-bone-lord : symbol scan + solidAt() with an openDoors Set so
//                        opened doors become passable.
//   - aztec-temple-raycaster : recursive-backtracker (stack) genMaze + ~14%
//                        braid pass + farthest-open-cell-as-exit.
//   - asylum-long-ward : recursive-carve genMaze + bfsNext() stalker step.
//
// GRID SHAPE
//   A grid is `string[][]` (grid[y][x] is a one-char cell token). Walls default
//   to '#'. Anything not in the wall set is "open / floor" ('.' by convention).
//   genMaze() returns a grid whose walls are '#' and floors are '.'.
//
// EXPORTS (named)
//   fromAscii(rows, symbolMap, opts) -> { grid, entities, width, height }
//   genMaze(cellsW, cellsH, opts)    -> grid           (string[][])
//   isWall(grid, x, y, opts)         -> boolean        (int OR float coords)
//   solidAt(grid, x, y, openDoors, opts) -> boolean    (doors + Set passthru)
//   scanSymbols(grid, symbolMap)     -> entities[]     (typed positions)
//   bfsReachable(grid, sx, sy, opts) -> { cells, dist } (flood + distances)
//   bfsNextStep(grid, fromX, fromY, toX, toY, opts) -> {x,y} | null
//   WALL, FLOOR, DEFAULT_SYMBOLS                        (handy constants)
//
// USAGE (ASCII level)
//   import { fromAscii, isWall, solidAt, bfsReachable } from './grid-map.js';
//   const level = [
//     '########',
//     '#S...K.#',
//     '#.##.#D#',
//     '#....#E#',
//     '########',
//   ];
//   const { grid, entities, width, height } = fromAscii(level, {
//     '#':'wall', 'S':'start', 'K':'key', 'D':'door', 'E':'exit',
//   });
//   const start = entities.find(e => e.type === 'start');     // {type,x,y}
//   const openDoors = new Set();                              // 'x,y' keys
//   if (solidAt(grid, px, py, openDoors)) { /* blocked */ }
//   const { cells } = bfsReachable(grid, start.x, start.y);   // reachable floor
//
// USAGE (procedural maze)
//   import { genMaze, bfsReachable, bfsNextStep } from './grid-map.js';
//   const grid = genMaze(10, 10, { style: 'backtracker', braid: 0.12 });
//   const flood = bfsReachable(grid, 1, 1);
//   const exit = flood.cells.reduce((a, b) => (b.dist > a.dist ? b : a));
//   const step = bfsNextStep(grid, enemyX, enemyY, playerX, playerY);
//
// CONTRACTS
//   - Pure: no DOM, no canvas, no globals, no timers, no GPU. Nothing to
//     dispose() (owns no resources). Deterministic given an injected rng.
//   - Coords: isWall/solidAt accept integer OR float coords (Math.floor'd).
//     bfs* operate on integer cells; returned {x,y} are integer cell coords.
//   - Out-of-bounds is ALWAYS solid (treated as wall) so casters never escape.
//   - genMaze seals an outer border of walls; fromAscii seals one too (and pads
//     ragged rows). Both guarantee a non-null, rectangular grid.
//   - symbolMap maps a single-char token to a type STRING. Tokens mapped to
//     'wall' (or listed in opts.walls) are solid; every OTHER mapped token is
//     scanned into entities AND its cell is replaced with FLOOR (so symbols do
//     not also read as walls). Unmapped tokens are left as-is (open unless in
//     the wall set).
//   - Graph utils are zero-allocation-per-call where practical (BFS reuses a
//     flat visited array sized to the grid; bfsNextStep early-outs same-cell).

// ---------- constants ----------

/// Canonical wall / floor tokens used by genMaze() and the default wall set.
export const WALL = '#';
export const FLOOR = '.';

/// A convenience symbolMap covering the common dungeon/raycaster vocabulary.
/// Callers may supply their own; nothing here is required.
export const DEFAULT_SYMBOLS = Object.freeze({
  '#': 'wall',
  '.': 'floor',
  'S': 'start',
  'K': 'key',
  'D': 'door',
  'E': 'exit',
  'T': 'torch',
});

// ---------- internal helpers ----------

/// Resolve the set of tokens that count as solid walls. Always includes WALL.
/// `walls` may be a string ("#T"), an array, or a Set of single chars.
function resolveWallSet(walls) {
  const s = new Set([WALL]);
  if (walls) {
    if (typeof walls === 'string') for (const c of walls) s.add(c);
    else for (const c of walls) s.add(c);
  }
  return s;
}

/// Read a cell token with out-of-bounds returning WALL (always solid).
function cellAt(grid, x, y) {
  if (y < 0 || y >= grid.length) return WALL;
  const row = grid[y];
  if (x < 0 || x >= row.length) return WALL;
  return row[x];
}

/// Default rng is Math.random; callers may inject opts.rng for determinism.
function pickRng(opts) {
  return opts && typeof opts.rng === 'function' ? opts.rng : Math.random;
}

// ---------- ASCII level building ----------

/**
 * Build a tile grid from an ASCII level (a single newline-joined string or an
 * array of row strings), scanning every typed NON-wall symbol into an entity
 * list and replacing those cells with FLOOR. A solid outer border is sealed.
 *
 * Generalized from catacomb-carnage buildMap() (pad + border seal) and
 * crypt-of-the-bone-lord's symbol scan.
 *
 * @param {string|string[]} rows   Level as "a\nb\nc" or ['a','b','c'].
 * @param {Object<string,string>} symbolMap  token -> type string. Tokens whose
 *        type is 'wall' (or that appear in opts.walls) stay solid; every other
 *        mapped token is scanned out to `entities` and its cell becomes FLOOR.
 *        Doors mapped here become FLOOR + a {type:'door'} entity; if you instead
 *        want IN-GRID openable doors (the crypt pattern fed to solidAt), keep
 *        the door token OUT of symbolMap and add it to opts.keep so the token
 *        survives in the grid.
 * @param {Object} [opts]
 * @param {boolean} [opts.border=true]  Seal a solid outer wall border.
 * @param {string|string[]|Set} [opts.keep]  Tokens to leave IN the grid (still
 *        also scanned to entities) -- e.g. 'D' to keep doors testable by solidAt.
 * @param {string|string[]|Set} [opts.walls]  Extra solid tokens (besides '#').
 * @returns {{grid:string[][], entities:Array<{type:string,x:number,y:number}>,
 *           width:number, height:number}}
 */
export function fromAscii(rows, symbolMap, opts) {
  opts = opts || {};
  symbolMap = symbolMap || DEFAULT_SYMBOLS;
  const raw = Array.isArray(rows) ? rows.slice() : String(rows).split('\n');
  if (raw.length === 0) raw.push(WALL);

  // pad ragged rows out to the widest row, filling with WALL
  const width = raw.reduce((m, r) => Math.max(m, r.length), 0) || 1;
  const grid = raw.map((r) => {
    const padded = r.length < width ? r + WALL.repeat(width - r.length) : r;
    return padded.split('');
  });
  const height = grid.length;

  // which tokens are walls? '#' always, anything mapped to 'wall', plus opts
  const wallSet = resolveWallSet(opts.walls);
  for (const tok in symbolMap) {
    if (symbolMap[tok] === 'wall') wallSet.add(tok);
  }

  // tokens to leave in the grid (still scanned), e.g. in-grid openable doors
  const keepSet = new Set();
  if (opts.keep) {
    if (typeof opts.keep === 'string') for (const c of opts.keep) keepSet.add(c);
    else for (const c of opts.keep) keepSet.add(c);
  }

  // scan typed non-wall symbols -> entities, replace those cells with FLOOR
  // (unless the token is in keepSet, in which case it survives in the grid)
  const entities = [];
  for (let y = 0; y < height; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      const tok = row[x];
      const type = symbolMap[tok];
      if (type === undefined) continue;
      if (type === 'wall' || type === 'floor') continue;
      entities.push({ type, x, y });
      if (!keepSet.has(tok)) row[x] = FLOOR;
    }
  }

  // seal a solid outer border (catacomb buildMap)
  if (opts.border !== false && height > 0) {
    const w = grid[0].length;
    for (let x = 0; x < w; x++) {
      grid[0][x] = WALL;
      grid[height - 1][x] = WALL;
    }
    for (let y = 0; y < height; y++) {
      grid[y][0] = WALL;
      grid[y][grid[y].length - 1] = WALL;
    }
  }

  return { grid, entities, width: grid[0] ? grid[0].length : 0, height };
}

/**
 * Collect typed positions from an already-built grid (the standalone variant of
 * the fromAscii scan -- it does NOT mutate the grid).
 *
 * @param {string[][]} grid
 * @param {Object<string,string>} symbolMap  token -> type string.
 * @returns {Array<{type:string,x:number,y:number}>}
 */
export function scanSymbols(grid, symbolMap) {
  symbolMap = symbolMap || DEFAULT_SYMBOLS;
  const entities = [];
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      const type = symbolMap[row[x]];
      if (type === undefined || type === 'wall' || type === 'floor') continue;
      entities.push({ type, x, y });
    }
  }
  return entities;
}

// ---------- procedural maze generation ----------

/**
 * Generate a procedural maze grid of cell-tokens (WALL / FLOOR). Supports two
 * proven styles plus a braid pass that opens a fraction of interior walls so
 * corridors form loops/vistas (NOT a pure spanning tree).
 *
 * Output grid is (cellsW*2+1) x (cellsH*2+1): a 1-wide wall lattice between
 * carved cells, with a sealed solid border. Start cell is (1,1).
 *
 * Styles:
 *   'backtracker' : stack-based recursive backtracker (aztec genMaze).
 *   'carve'       : recursive carve, 2-step jumps (asylum carve()). Recursion
 *                   is depth-bounded by grid size; safe for typical maze sizes.
 *
 * @param {number} cellsW  logical maze width in carved cells (>=1).
 * @param {number} cellsH  logical maze height in carved cells (>=1).
 * @param {Object} [opts]
 * @param {'backtracker'|'carve'} [opts.style='backtracker']
 * @param {number} [opts.braid=0.12]  fraction (0..1) of interior walls to open
 *        for loops/vistas. ~0.10-0.14 reads well. 0 => perfect maze.
 * @param {function():number} [opts.rng=Math.random]  inject for determinism.
 * @returns {string[][]}  WALL/FLOOR grid.
 */
export function genMaze(cellsW, cellsH, opts) {
  opts = opts || {};
  const rng = pickRng(opts);
  const style = opts.style || 'backtracker';
  const braid = opts.braid === undefined ? 0.12 : opts.braid;

  const cw = Math.max(1, cellsW | 0);
  const ch = Math.max(1, cellsH | 0);
  const w = cw * 2 + 1;
  const h = ch * 2 + 1;

  // numeric scratch grid: 1 = wall, 0 = floor (lifted from both sources)
  const m = [];
  for (let y = 0; y < h; y++) m.push(new Array(w).fill(1));

  if (style === 'carve') {
    // recursive carve with 2-step jumps (asylum carve())
    const dirs4 = [
      [0, -2],
      [0, 2],
      [-2, 0],
      [2, 0],
    ];
    const carve = (cx, cy) => {
      m[cy][cx] = 0;
      // shuffle directions (Fisher-Yates) so the maze is varied
      const d = dirs4.slice();
      for (let i = d.length - 1; i > 0; i--) {
        const j = (rng() * (i + 1)) | 0;
        const t = d[i];
        d[i] = d[j];
        d[j] = t;
      }
      for (let k = 0; k < d.length; k++) {
        const nx = cx + d[k][0];
        const ny = cy + d[k][1];
        if (nx > 0 && nx < w - 1 && ny > 0 && ny < h - 1 && m[ny][nx] === 1) {
          m[cy + d[k][1] / 2][cx + d[k][0] / 2] = 0;
          carve(nx, ny);
        }
      }
    };
    carve(1, 1);
  } else {
    // stack-based recursive backtracker (aztec genMaze)
    const vis = [];
    for (let y = 0; y < ch; y++) vis.push(new Array(cw).fill(false));
    const dirs = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ];
    const stack = [[0, 0]];
    vis[0][0] = true;
    m[1][1] = 0;
    while (stack.length) {
      const cur = stack[stack.length - 1];
      const cx = cur[0];
      const cy = cur[1];
      const nb = [];
      for (const d of dirs) {
        const nx = cx + d[0];
        const ny = cy + d[1];
        if (nx >= 0 && nx < cw && ny >= 0 && ny < ch && !vis[ny][nx]) {
          nb.push([nx, ny, d[0], d[1]]);
        }
      }
      if (nb.length) {
        const n = nb[(rng() * nb.length) | 0];
        vis[n[1]][n[0]] = true;
        m[cy * 2 + 1 + n[3]][cx * 2 + 1 + n[2]] = 0;
        m[n[1] * 2 + 1][n[0] * 2 + 1] = 0;
        stack.push([n[0], n[1]]);
      } else {
        stack.pop();
      }
    }
  }

  // braid: open a fraction of interior walls to make loops + vistas
  if (braid > 0) {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (m[y][x] === 1 && rng() < braid) m[y][x] = 0;
      }
    }
  }

  // re-seal the outer border solid (braid could nibble an edge)
  for (let x = 0; x < w; x++) {
    m[0][x] = 1;
    m[h - 1][x] = 1;
  }
  for (let y = 0; y < h; y++) {
    m[y][0] = 1;
    m[y][w - 1] = 1;
  }

  // materialize tokens
  const grid = [];
  for (let y = 0; y < h; y++) {
    const row = new Array(w);
    for (let x = 0; x < w; x++) row[x] = m[y][x] === 1 ? WALL : FLOOR;
    grid.push(row);
  }
  return grid;
}

// ---------- solidity tests ----------

/**
 * Is the cell containing (x,y) a wall? Accepts integer OR float coords
 * (Math.floor'd internally). Out-of-bounds is solid.
 *
 * @param {string[][]} grid
 * @param {number} x  integer or float
 * @param {number} y  integer or float
 * @param {Object} [opts]
 * @param {string|string[]|Set} [opts.walls]  extra solid tokens (besides '#').
 * @returns {boolean}
 */
export function isWall(grid, x, y, opts) {
  const wallSet = resolveWallSet(opts && opts.walls);
  return wallSet.has(cellAt(grid, Math.floor(x), Math.floor(y)));
}

/**
 * Solidity test that also understands openable doors. Door cells are solid
 * UNLESS their 'x,y' key is present in `openDoors`. Accepts int OR float coords.
 * Generalized from crypt-of-the-bone-lord solidAt().
 *
 * @param {string[][]} grid
 * @param {number} x  integer or float
 * @param {number} y  integer or float
 * @param {Set<string>} [openDoors]  set of opened-door keys, "ix,iy" form.
 * @param {Object} [opts]
 * @param {string|string[]|Set} [opts.walls]  extra solid tokens (besides '#').
 * @param {string} [opts.door='D']  the door token.
 * @returns {boolean}
 */
export function solidAt(grid, x, y, openDoors, opts) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const c = cellAt(grid, ix, iy);
  const doorTok = (opts && opts.door) || 'D';
  if (c === doorTok) {
    return !(openDoors && openDoors.has(ix + ',' + iy));
  }
  const wallSet = resolveWallSet(opts && opts.walls);
  return wallSet.has(c);
}

// ---------- graph utilities (BFS over the tile grid) ----------

/// Build the open-test for BFS: a cell is open if it is NOT a wall and (when a
/// door token + openDoors set are given) doors only block while closed.
function makeOpenTest(grid, opts) {
  const wallSet = resolveWallSet(opts && opts.walls);
  const doorTok = opts && opts.door;
  const openDoors = opts && opts.openDoors;
  if (doorTok) {
    return (x, y) => {
      const c = cellAt(grid, x, y);
      if (c === doorTok) return !!(openDoors && openDoors.has(x + ',' + y));
      return !wallSet.has(c);
    };
  }
  return (x, y) => !wallSet.has(cellAt(grid, x, y));
}

const BFS_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Breadth-first flood from (sx,sy) over open cells, returning every reachable
 * open cell with its BFS distance from the start. Use it for far-placement
 * (enemies/items), torch wall-placement, or "farthest open cell as the exit".
 * Generalized from catacomb-carnage reachable().
 *
 * @param {string[][]} grid
 * @param {number} sx  integer start cell x
 * @param {number} sy  integer start cell y
 * @param {Object} [opts]  see makeOpenTest (walls / door / openDoors).
 * @returns {{cells:Array<{x:number,y:number,dist:number}>,
 *           dist:Object<string,number>}}  cells (BFS order) + a 'x,y'->dist map.
 */
export function bfsReachable(grid, sx, sy, opts) {
  const h = grid.length;
  const w = h > 0 ? grid[0].length : 0;
  const cells = [];
  const dist = {};
  sx = Math.floor(sx);
  sy = Math.floor(sy);
  if (h === 0 || w === 0) return { cells, dist };

  const isOpen = makeOpenTest(grid, opts);
  // flat visited array sized to the grid (zero per-call object churn for keys)
  const seen = new Int32Array(w * h).fill(-1);

  const startIdx = sy * w + sx;
  if (sx < 0 || sy < 0 || sx >= w || sy >= h || !isOpen(sx, sy)) {
    return { cells, dist };
  }
  const q = [[sx, sy]];
  seen[startIdx] = 0;
  let head = 0;
  while (head < q.length) {
    const cur = q[head++];
    const x = cur[0];
    const y = cur[1];
    const d = seen[y * w + x];
    cells.push({ x, y, dist: d });
    dist[x + ',' + y] = d;
    for (let i = 0; i < 4; i++) {
      const nx = x + BFS_DIRS[i][0];
      const ny = y + BFS_DIRS[i][1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (seen[ni] !== -1) continue;
      if (!isOpen(nx, ny)) continue;
      seen[ni] = d + 1;
      q.push([nx, ny]);
    }
  }
  return { cells, dist };
}

/**
 * Compute the next cell to move INTO when walking the shortest open path from
 * (fromX,fromY) toward (toX,toY). The stalker pathfinder kernel; pairs with
 * raycast.grid-enemy-ai. Returns {x,y} (the immediate neighbor cell to step to)
 * or null if no path exists. If already on the target cell, returns that cell.
 * Generalized from asylum-long-ward bfsNext().
 *
 * @param {string[][]} grid
 * @param {number} fromX  integer or float (Math.floor'd to a cell)
 * @param {number} fromY
 * @param {number} toX
 * @param {number} toY
 * @param {Object} [opts]
 * @param {number} [opts.maxSteps]  cap on BFS pops (default w*h). Guards huge maps.
 *        Also accepts walls / door / openDoors (see makeOpenTest).
 * @returns {{x:number,y:number}|null}
 */
export function bfsNextStep(grid, fromX, fromY, toX, toY, opts) {
  const h = grid.length;
  const w = h > 0 ? grid[0].length : 0;
  if (h === 0 || w === 0) return null;

  const sx = Math.floor(fromX);
  const sy = Math.floor(fromY);
  const tx = Math.floor(toX);
  const ty = Math.floor(toY);
  if (sx === tx && sy === ty) return { x: sx, y: sy };
  if (tx < 0 || ty < 0 || tx >= w || ty >= h) return null;

  const isOpen = makeOpenTest(grid, opts);
  const maxSteps = (opts && opts.maxSteps) || w * h;

  // BFS from the SOURCE, recording each cell's predecessor, until we hit target
  const prev = new Int32Array(w * h).fill(-2); // -2 = unvisited, -1 = root
  const q = [[sx, sy]];
  prev[sy * w + sx] = -1;
  let head = 0;
  let found = false;
  let steps = 0;
  while (head < q.length && steps < maxSteps) {
    steps++;
    const cur = q[head++];
    const cx = cur[0];
    const cy = cur[1];
    if (cx === tx && cy === ty) {
      found = true;
      break;
    }
    for (let i = 0; i < 4; i++) {
      const nx = cx + BFS_DIRS[i][0];
      const ny = cy + BFS_DIRS[i][1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (prev[ni] !== -2) continue;
      if (!isOpen(nx, ny)) continue;
      prev[ni] = cy * w + cx; // encode predecessor as a flat index
      q.push([nx, ny]);
    }
  }
  if (!found) return null;

  // walk predecessors back from target to the cell adjacent to the source
  let node = ty * w + tx;
  const rootIdx = sy * w + sx;
  let p = prev[node];
  while (p !== -1 && p !== rootIdx) {
    node = p;
    p = prev[node];
  }
  // if p === rootIdx, `node` is the neighbor of the source on the path.
  // if p === -1, target was directly the source's neighbor (node===target).
  return { x: node % w, y: (node / w) | 0 };
}

// END mChatAI Web Component: raycast.grid-map
