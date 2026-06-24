// BEGIN mChatAI Web Component: systems.cellular-sand-grid
//
// A falling-sand CELLULAR-AUTOMATA material grid -- the engine behind
// powder-toy / falling-sand sandboxes, "Noita-like" goo, sand-rescue puzzles,
// erosion toys, and any granular-material simulation. Each cell holds ONE
// material id (a byte in a flat Uint8Array). Every frame the grid is scanned
// bottom-up and each cell runs its material's behavior:
//
//   POWDER  (sand)  : falls straight down, then diagonally -> piles at the
//                     angle of repose. Sinks through lighter liquids.
//   LIQUID  (water) : falls, then flows diagonally, then spreads sideways to
//                     seek its own level. Denser liquids sink under lighter.
//   GAS     (steam) : rises (the mirror of liquid) and has a finite life,
//                     then condenses back to a product or vanishes.
//   FIRE          : finite life; ignites flammable neighbors, is quenched by
//                     "douser" materials (water) into a product (steam), and
//                     flickers upward.
//   STATIC (wall/wood): never moves; may still be flammable / dissolvable.
//
// Reactions (water+fire->steam, fire spreads to oil/wood, acid eats wall, ...)
// are NOT hard-coded -- they live in a MATERIAL TABLE you pass in. The engine
// ships a sensible default set (EMPTY/WALL/SAND/WATER/OIL/WOOD/FIRE/STEAM) but
// you can add ANY material: give it a `kind` (one of the behaviors above), a
// `density`, a `color`, optional `flammable`, `ignites`, `quenchedBy`, and
// `react` hooks. See defaultMaterials() and the CONTRACTS block.
//
// Performance: cells are grouped into ACTIVE CHUNKS (a dirty-rectangle grid).
// A chunk only steps if something near it moved last frame; settled regions
// cost nothing, so a mostly-still grid runs at 60fps. A change wakes its chunk
// plus the 8 neighbors. Movement alternates left-first / right-first per frame
// to kill directional drift.
//
// PURE JS: no p5, no three, no DOM, no canvas. The CALLER owns rendering. Use
// renderToBuffer() to fill an RGBA Uint8ClampedArray (e.g. an ImageData /
// p5.Image pixels / a texture) from the current grid, then blit it yourself.
// Delta-time aware via stepFor(dt) (fixed-timestep accumulator) so the sim is
// stable at 30, 60, or 144 fps. Extracted + generalized from the Powdermind
// stepSim / stepCell falling-sand loop.
//
// Exports:
//   CellularSandGrid     stateful grid: step / stepFor / paint / erase /
//                        setCell / get / renderToBuffer / clear / addMaterial
//   defaultMaterials()   a fresh copy of the built-in material table
//   stepGridOnce(grid)   functional one-shot: advance a plain grid object by
//                        one tick (for callers who manage their own buffers)
//   MaterialKind         the behavior enum ('static'|'powder'|'liquid'|'gas'|'fire')
//
// Usage (basic powder sandbox wired to a canvas ImageData):
//   import { CellularSandGrid } from './systems/cellular-sand-grid.js';
//   const sim = new CellularSandGrid({ width: 160, height: 240 });
//   const SAND = sim.id('sand'), WATER = sim.id('water');
//   const ctx = canvas.getContext('2d');
//   const imageData = ctx.createImageData(sim.width, sim.height);
//   function frame(dtSeconds) {
//     if (pointerDown) sim.paint(gridX, gridY, sim.brushFor(currentMat), { radius: 5 });
//     sim.stepFor(dtSeconds);            // fixed-timestep, runs N sub-steps
//     sim.renderToBuffer(imageData.data);
//     ctx.putImageData(imageData, 0, 0); // then scale-blit to the display canvas
//     requestAnimationFrame(t => frame((t - last) / 1000));
//   }
//
// Usage (add a custom material -- "snow": slow, light powder that melts in fire):
//   sim.addMaterial({
//     name: 'snow', kind: 'powder', density: 1, color: [235, 240, 255],
//     fallChance: 0.5,                          // only falls ~half the ticks (slow)
//     react(api, x, y) {                        // melt next to fire -> water
//       if (api.neighborIs(x, y, 'fire')) { api.set(x, y, 'water'); return true; }
//       return false;
//     }
//   });
//
// Usage (one-shot functional form, you own the typed arrays):
//   import { stepGridOnce, defaultMaterials } from './systems/cellular-sand-grid.js';
//   const g = { width:W, height:H, cells:new Uint8Array(W*H), life:new Uint8Array(W*H),
//               materials: defaultMaterials(), frame: 0 };
//   stepGridOnce(g); // advances one tick, mutating g.cells / g.life in place
//
// Contracts:
//   - new CellularSandGrid(opts):
//       width, height       : grid dimensions in cells (required-ish; default 120x180).
//       chunk               : active-chunk size in cells (default 12). Bigger = fewer
//                             chunks but coarser waking. 8-16 is a good range.
//       materials           : a material table (Array of material defs OR the object
//                             returned by defaultMaterials()). If omitted, the
//                             built-in set is used. Index 0 MUST be 'empty'.
//       boundary            : material name treated as the out-of-bounds value that
//                             get() returns for off-grid coords (default 'wall').
//       substeps            : sub-steps run per stepFor() second-slice (default 2 --
//                             matches Powdermind's double stepSim for snappier flow).
//       fixedStep           : seconds per sub-step for stepFor()'s accumulator
//                             (default 1/120). stepFor caps catch-up at 5 sub-steps.
//       rng                 : () => [0,1) deterministic random for seeded worlds
//                             (default Math.random). Reactions/branching use it.
//       texture             : if true, seeds a per-cell brightness jitter so flat
//                             materials look granular in renderToBuffer (default true).
//   - A MATERIAL DEF is { name, kind, density, color, ... }:
//       name (string)       : unique id, used by id()/paint()/react helpers.
//       kind (MaterialKind) : 'static' | 'powder' | 'liquid' | 'gas' | 'fire'.
//       density (number)    : heavier sinks through lighter (powder/liquid). 0 = gas-ish.
//       color ([r,g,b])     : base RGB used by renderToBuffer (0-255 each).
//       fallChance          : 0..1, probability the cell attempts to move this tick
//                             (default 1; lower = slower powder/liquid/lava).
//       life                : initial countdown for finite materials (gas/fire);
//                             0/undefined = lives forever. Decremented each tick.
//       decayTo             : material name a finite material becomes at life 0
//                             (default 'empty'). e.g. steam->water-or-empty.
//       decayChance         : 0..1 chance decayTo applies vs 'empty' at life end.
//       flammable           : true if FIRE can ignite this cell.
//       ignites             : material name a flammable cell becomes when lit
//                             (default 'fire').
//       igniteChance        : 0..1 per-neighbor chance fire spreads here (default 0.3).
//       igniteLife          : life granted to the resulting fire (per-fuel burn time).
//       quenchedBy          : material name that puts THIS fire out on contact.
//       quenchProduct       : what the quenching neighbor becomes (e.g. water->steam).
//       buoyant             : 'up' makes a liquid-kind actually rise (rare; gases
//                             already rise). Mostly unused; gas handles rising.
//       react(api, x, y)    : optional custom hook run BEFORE built-in motion. Return
//                             true to consume the cell's turn (you handled it). `api`
//                             exposes get/set/swap/neighborIs/inBounds/rng/idOf/nameOf
//                             /wake -- everything you need to write erosion, growth,
//                             corrosion, phase-change, etc. without engine edits.
//   - step()              : advance the grid exactly one tick. Mutates cells in place.
//   - stepFor(dtSeconds)  : delta-time wrapper -- accumulates dt and runs whole
//                           sub-steps (substeps per fixedStep). Returns # ticks run.
//   - paint(x, y, materialName|id, { radius=3, replace=false, life })  -> count painted.
//       By default only fills 'empty' cells (and lights flammables when painting
//       fire). Pass replace:true to overwrite anything. Circular brush.
//   - erase(x, y, { radius=3, only })  -> count erased. Sets cells to 'empty'.
//       Pass only:[names] to erase just those materials (e.g. don't erase walls).
//   - setCell(x,y,name|id,life?) / get(x,y) -> id / nameAt(x,y) -> string.
//   - renderToBuffer(rgba, opts) : fills a length>=width*height*4 RGBA byte array
//       from the grid (life-based shading for fire/gas, texture jitter for solids).
//       opts.tint(id, life, frame) -> [r,g,b] overrides a material's color per cell.
//   - addMaterial(def) -> id ; id(name) -> number ; name(id) -> string.
//   - clear() resets all cells to empty and wakes the whole grid.
//   - Renderer-agnostic & deps-free: nothing to dispose (no GPU/DOM/listeners).

export const MaterialKind = Object.freeze({
  STATIC: 'static',
  POWDER: 'powder',
  LIQUID: 'liquid',
  GAS: 'gas',
  FIRE: 'fire'
});

function clamp01(v, d) {
  return typeof v === 'number' && Number.isFinite(v) ? (v < 0 ? 0 : v > 1 ? 1 : v) : d;
}
function num(v, d) {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

// ---------------------------------------------------------------------------
// Default material table. Mirrors Powdermind's set but fully data-driven so
// callers can clone + extend it. Returns a FRESH array each call (no shared
// mutable state). Index 0 is always 'empty'.
// ---------------------------------------------------------------------------
export function defaultMaterials() {
  return [
    { name: 'empty', kind: MaterialKind.STATIC, density: 0, color: [31, 16, 38] },
    { name: 'wall',  kind: MaterialKind.STATIC, density: 99, color: [58, 44, 66] },
    { name: 'sand',  kind: MaterialKind.POWDER, density: 5, color: [245, 197, 99], flammable: false },
    { name: 'water', kind: MaterialKind.LIQUID, density: 3, color: [43, 196, 214],
      quenchProduct: 'steam' /* what fire turns adjacent water into */ },
    { name: 'oil',   kind: MaterialKind.LIQUID, density: 2, color: [120, 86, 46],
      flammable: true, ignites: 'fire', igniteChance: 0.34, igniteLife: 120 },
    { name: 'wood',  kind: MaterialKind.STATIC, density: 99, color: [124, 74, 43],
      flammable: true, ignites: 'fire', igniteChance: 0.06, igniteLife: 170 },
    { name: 'fire',  kind: MaterialKind.FIRE,   density: 0, color: [255, 150, 40],
      life: 90, decayTo: 'empty', quenchedBy: 'water', quenchProduct: 'steam' },
    { name: 'steam', kind: MaterialKind.GAS,    density: 0, color: [206, 214, 232],
      life: 230, decayTo: 'water', decayChance: 0.18 }
  ];
}

// Normalize a caller-supplied table (array OR {list} from defaultMaterials) into
// the engine's internal form: an indexed array + name->id map + per-id flags.
function buildMaterialIndex(input, rng) {
  let defs;
  if (Array.isArray(input)) defs = input.slice();
  else defs = defaultMaterials();
  if (!defs.length || defs[0].name !== 'empty') {
    // Guarantee an 'empty' at index 0 (the swap/erase/decay target).
    defs = defs.filter(d => d && d.name !== 'empty');
    defs.unshift({ name: 'empty', kind: MaterialKind.STATIC, density: 0, color: [0, 0, 0] });
  }
  const byName = Object.create(null);
  const table = defs.map((d, i) => {
    byName[d.name] = i;
    return normalizeDef(d);
  });
  // Second pass: resolve name references (decayTo / ignites / quenchedBy / ...) to ids.
  for (const t of table) {
    t.decayToId = t.decayTo != null && byName[t.decayTo] != null ? byName[t.decayTo] : 0;
    t.ignitesId = t.ignites != null && byName[t.ignites] != null ? byName[t.ignites] : byName['fire'] ?? 0;
    t.quenchedById = t.quenchedBy != null && byName[t.quenchedBy] != null ? byName[t.quenchedBy] : -1;
    t.quenchProductId = t.quenchProduct != null && byName[t.quenchProduct] != null ? byName[t.quenchProduct] : 0;
  }
  return { table, byName };
}

function normalizeDef(d) {
  return {
    name: d.name,
    kind: d.kind || MaterialKind.STATIC,
    density: num(d.density, 0),
    color: Array.isArray(d.color) ? [num(d.color[0], 0) | 0, num(d.color[1], 0) | 0, num(d.color[2], 0) | 0] : [128, 128, 128],
    fallChance: clamp01(d.fallChance, 1),
    life: num(d.life, 0),
    decayTo: d.decayTo,
    decayChance: clamp01(d.decayChance, 0),
    flammable: !!d.flammable,
    ignites: d.ignites,
    igniteChance: clamp01(d.igniteChance, 0.3),
    igniteLife: num(d.igniteLife, num(d.life, 90)),
    quenchedBy: d.quenchedBy,
    quenchProduct: d.quenchProduct,
    buoyant: d.buoyant === 'up' ? 'up' : null,
    react: typeof d.react === 'function' ? d.react : null
  };
}

// 4- and 8-neighbor offset tables, shared by reactions (allocated once).
const NB4 = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const NB8 = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];

/**
 * Stateful falling-sand grid. Owns its typed arrays + the active-chunk dirty
 * map; the caller owns rendering. See the CONTRACTS block for every option.
 */
export class CellularSandGrid {
  constructor(opts = {}) {
    this.width = Math.max(1, num(opts.width, 120) | 0);
    this.height = Math.max(1, num(opts.height, 180) | 0);
    this.n = this.width * this.height;
    this.rng = typeof opts.rng === 'function' ? opts.rng : Math.random;

    const built = buildMaterialIndex(opts.materials, this.rng);
    this.materials = built.table;
    this._byName = built.byName;

    this.EMPTY = 0;
    this.BOUNDARY = this._byName[opts.boundary || 'wall'] != null ? this._byName[opts.boundary || 'wall'] : (this._byName['wall'] ?? 0);

    this.cells = new Uint8Array(this.n);
    this.life = new Uint8Array(this.n);
    this.movedAt = new Uint32Array(this.n);
    this.frame = 0;

    // Active-chunk dirty grid (double-buffered: current scans, next collects wakes).
    this.chunk = Math.max(2, num(opts.chunk, 12) | 0);
    this.cx = Math.ceil(this.width / this.chunk);
    this.cy = Math.ceil(this.height / this.chunk);
    this.nc = this.cx * this.cy;
    this._activeCur = new Uint8Array(this.nc).fill(1); // first frame: everything live
    this._activeNext = new Uint8Array(this.nc);

    this.substeps = Math.max(1, num(opts.substeps, 2) | 0);
    this.fixedStep = num(opts.fixedStep, 1 / 120);
    this._accum = 0;

    // Per-cell brightness jitter so flat fills read as granular (cosmetic only).
    this.useTexture = opts.texture !== false;
    if (this.useTexture) {
      this.tex = new Int8Array(this.n);
      for (let i = 0; i < this.n; i++) this.tex[i] = (this.rng() * 16 - 8) | 0;
    } else {
      this.tex = null;
    }

    // The api object handed to material.react hooks (bound once, reused).
    this._api = this._makeApi();
  }

  // ---- material lookup ---------------------------------------------------
  id(name) { return this._byName[name] != null ? this._byName[name] : -1; }
  name(id) { return this.materials[id] ? this.materials[id].name : 'empty'; }
  brushFor(nameOrId) { return typeof nameOrId === 'number' ? nameOrId : this.id(nameOrId); }

  // Register a new material at runtime. Returns its id. Re-resolves references.
  addMaterial(def) {
    const norm = normalizeDef(def);
    const id = this.materials.length;
    this._byName[norm.name] = id;
    this.materials.push(norm);
    // Re-resolve cross-refs across the whole table (cheap; tables are tiny).
    for (const t of this.materials) {
      t.decayToId = t.decayTo != null && this._byName[t.decayTo] != null ? this._byName[t.decayTo] : 0;
      t.ignitesId = t.ignites != null && this._byName[t.ignites] != null ? this._byName[t.ignites] : (this._byName['fire'] ?? 0);
      t.quenchedById = t.quenchedBy != null && this._byName[t.quenchedBy] != null ? this._byName[t.quenchedBy] : -1;
      t.quenchProductId = t.quenchProduct != null && this._byName[t.quenchProduct] != null ? this._byName[t.quenchProduct] : 0;
    }
    return id;
  }

  // ---- grid access -------------------------------------------------------
  idx(x, y) { return y * this.width + x; }
  inBounds(x, y) { return x >= 0 && x < this.width && y >= 0 && y < this.height; }
  get(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return this.BOUNDARY;
    return this.cells[y * this.width + x];
  }
  nameAt(x, y) { return this.name(this.get(x, y)); }

  setCell(x, y, nameOrId, life) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const id = typeof nameOrId === 'number' ? nameOrId : this.id(nameOrId);
    if (id < 0) return;
    const i = y * this.width + x;
    this.cells[i] = id;
    this.life[i] = life != null ? (life & 0xff) : (this.materials[id] ? this.materials[id].life & 0xff : 0);
    this._wakeNow(x, y);
  }

  clear() {
    this.cells.fill(this.EMPTY);
    this.life.fill(0);
    this.movedAt.fill(0);
    this._activeCur.fill(1);
    this._activeNext.fill(0);
    this.frame = 0;
    this._accum = 0;
  }

  // ---- chunk waking ------------------------------------------------------
  _wakeInto(arr, x, y) {
    const ccx = (x / this.chunk) | 0, ccy = (y / this.chunk) | 0;
    for (let oy = -1; oy <= 1; oy++) {
      const ny = ccy + oy; if (ny < 0 || ny >= this.cy) continue;
      for (let ox = -1; ox <= 1; ox++) {
        const nx = ccx + ox; if (nx < 0 || nx >= this.cx) continue;
        arr[ny * this.cx + nx] = 1;
      }
    }
  }
  _wake(x, y) { this._wakeInto(this._activeNext, x, y); }              // visible next frame
  _wakeNow(x, y) { this._wakeInto(this._activeCur, x, y); this._wakeInto(this._activeNext, x, y); }

  // Swap two cells (material + life), record the move, wake both regions.
  _swap(x1, y1, x2, y2) {
    const i1 = y1 * this.width + x1, i2 = y2 * this.width + x2;
    const m = this.cells[i1]; this.cells[i1] = this.cells[i2]; this.cells[i2] = m;
    const l = this.life[i1]; this.life[i1] = this.life[i2]; this.life[i2] = l;
    this.movedAt[i2] = this.frame;
    this._wake(x1, y1); this._wake(x2, y2);
  }

  // Lightweight density helper (moving cells sink through lighter cells).
  _densityOf(id) { const m = this.materials[id]; return m ? m.density : 0; }
  _isLiquid(id) { const m = this.materials[id]; return m && m.kind === MaterialKind.LIQUID; }
  _isGas(id) { const m = this.materials[id]; return m && m.kind === MaterialKind.GAS; }

  // ---- the api passed to material.react(api, x, y) -----------------------
  _makeApi() {
    const self = this;
    return {
      width: self.width, height: self.height,
      get: (x, y) => self.get(x, y),
      nameAt: (x, y) => self.nameAt(x, y),
      set: (x, y, nameOrId, life) => self.setCell(x, y, nameOrId, life),
      swap: (x1, y1, x2, y2) => self._swap(x1, y1, x2, y2),
      inBounds: (x, y) => self.inBounds(x, y),
      idOf: (name) => self.id(name),
      nameOf: (id) => self.name(id),
      neighborIs: (x, y, name) => {
        const id = self.id(name);
        for (let k = 0; k < NB4.length; k++) if (self.get(x + NB4[k][0], y + NB4[k][1]) === id) return true;
        return false;
      },
      neighbor8Is: (x, y, name) => {
        const id = self.id(name);
        for (let k = 0; k < NB8.length; k++) if (self.get(x + NB8[k][0], y + NB8[k][1]) === id) return true;
        return false;
      },
      lifeAt: (x, y) => (self.inBounds(x, y) ? self.life[y * self.width + x] : 0),
      wake: (x, y) => self._wakeNow(x, y),
      rng: () => self.rng()
    };
  }

  // =======================================================================
  // SIMULATION
  // =======================================================================

  /**
   * Advance the grid exactly one tick. Scans active chunks BOTTOM-UP (so a
   * falling stack resolves in one pass) and alternates row direction per frame.
   * @returns {this}
   */
  step() {
    this.frame++;
    const leftFirst = (this.frame & 1) === 0;
    const cur = this._activeCur, W = this.width, H = this.height, CS = this.chunk;
    for (let cyi = this.cy - 1; cyi >= 0; cyi--) {
      for (let cxi = 0; cxi < this.cx; cxi++) {
        if (!cur[cyi * this.cx + cxi]) continue;
        const x0 = cxi * CS, x1 = Math.min(x0 + CS, W);
        const y0 = cyi * CS, y1 = Math.min(y0 + CS, H);
        for (let y = y1 - 1; y >= y0; y--) {
          if (leftFirst) { for (let x = x0; x < x1; x++) this._stepCell(x, y); }
          else { for (let x = x1 - 1; x >= x0; x--) this._stepCell(x, y); }
        }
      }
    }
    // Swap the active-chunk buffers: next frame scans what woke this frame.
    const t = this._activeCur; this._activeCur = this._activeNext; this._activeNext = t;
    this._activeNext.fill(0);
    return this;
  }

  /**
   * Delta-time wrapper. Accumulates real seconds and runs whole sub-steps so
   * the sim is frame-rate independent. Each second-slice runs `substeps` ticks
   * per fixedStep. Catch-up is capped so a tab-resume can't freeze the frame.
   * @param {number} dtSeconds
   * @returns {number} number of step() ticks actually run
   */
  stepFor(dtSeconds) {
    const dt = num(dtSeconds, 0);
    if (dt <= 0) return 0;
    this._accum += dt > 0.25 ? 0.25 : dt; // clamp huge gaps
    let ticks = 0;
    let guard = 0;
    while (this._accum >= this.fixedStep && guard < 5) {
      for (let s = 0; s < this.substeps; s++) { this.step(); ticks++; }
      this._accum -= this.fixedStep;
      guard++;
    }
    return ticks;
  }

  // Dispatch a single cell to its kind's behavior (after its react() hook).
  _stepCell(x, y) {
    const i = y * this.width + x;
    const id = this.cells[i];
    if (id === this.EMPTY) return;
    const mat = this.materials[id];
    if (!mat) return;
    if (this.movedAt[i] === this.frame) return; // already moved into this cell this tick

    // Custom reaction first -- may consume the cell's turn entirely.
    if (mat.react && mat.react(this._api, x, y)) return;
    // The hook may have changed this cell; re-read before built-in motion.
    if (this.cells[i] !== id) return;

    switch (mat.kind) {
      case MaterialKind.POWDER: this._stepPowder(x, y, id, mat); break;
      case MaterialKind.LIQUID: this._stepLiquid(x, y, id, mat); break;
      case MaterialKind.GAS:    this._stepGas(x, y, id, mat); break;
      case MaterialKind.FIRE:   this._stepFire(x, y, id, mat); break;
      case MaterialKind.STATIC: /* immovable -- only react() (above) acts */ break;
    }
  }

  // POWDER: down, then diagonal-down. Sinks through lower-density liquids.
  _stepPowder(x, y, id, mat) {
    if (mat.fallChance < 1 && this.rng() > mat.fallChance) { this._wake(x, y); return; }
    const myD = mat.density;
    const below = this.get(x, y + 1);
    if (below === this.EMPTY || (this._isLiquid(below) && this._densityOf(below) < myD)) {
      this._swap(x, y, x, y + 1); return;
    }
    const dirs = (this.frame & 1) ? [-1, 1] : [1, -1];
    for (let k = 0; k < 2; k++) {
      const nx = x + dirs[k];
      const dd = this.get(nx, y + 1);
      if ((dd === this.EMPTY || (this._isLiquid(dd) && this._densityOf(dd) < myD)) && this.get(nx, y) !== this.BOUNDARY) {
        this._swap(x, y, nx, y + 1); return;
      }
    }
  }

  // LIQUID: down, then diagonal-down, then spread sideways to seek level.
  // Denser liquid sinks under lighter (water under oil). buoyant:'up' inverts.
  _stepLiquid(x, y, id, mat) {
    if (mat.fallChance < 1 && this.rng() > mat.fallChance) { this._wake(x, y); return; }
    const myD = mat.density;
    const downDir = mat.buoyant === 'up' ? -1 : 1;
    const passable = (cell) => cell === this.EMPTY || (this._isLiquid(cell) && this._densityOf(cell) < myD);

    const below = this.get(x, y + downDir);
    if (passable(below)) { this._swap(x, y, x, y + downDir); return; }

    const dirs = (this.frame & 1) ? [-1, 1] : [1, -1];
    for (let k = 0; k < 2; k++) {
      const nx = x + dirs[k];
      if (passable(this.get(nx, y + downDir)) && this.get(nx, y) !== this.BOUNDARY) {
        this._swap(x, y, nx, y + downDir); return;
      }
    }
    // Seek level: flow into an empty horizontal neighbor.
    for (let k = 0; k < 2; k++) {
      const nx = x + dirs[k];
      if (this.get(nx, y) === this.EMPTY) { this._swap(x, y, nx, y); return; }
    }
    this._wake(x, y);
  }

  // GAS: mirror of liquid -- rises, spreads, has finite life, then condenses.
  _stepGas(x, y, id, mat) {
    const i = y * this.width + x;
    if (mat.life > 0) {
      this.life[i]--;
      if (this.life[i] <= 0) {
        const becomes = (mat.decayChance > 0 && this.rng() < mat.decayChance) ? mat.decayToId : this.EMPTY;
        this.cells[i] = becomes; this.life[i] = becomes ? (this.materials[becomes].life & 0xff) : 0;
        this._wake(x, y); return;
      }
    }
    this._wake(x, y);
    const up = this.get(x, y - 1);
    if (up === this.EMPTY) { this._swap(x, y, x, y - 1); return; }
    const dirs = (this.frame & 1) ? [-1, 1] : [1, -1];
    for (let k = 0; k < 2; k++) {
      const nx = x + dirs[k];
      if (this.get(nx, y - 1) === this.EMPTY) { this._swap(x, y, nx, y - 1); return; }
    }
    for (let k = 0; k < 2; k++) {
      const nx = x + dirs[k];
      if (this.get(nx, y) === this.EMPTY) { this._swap(x, y, nx, y); return; }
    }
  }

  // FIRE: finite life; quenched by quenchedBy (-> quenchProduct), spreads to
  // flammable neighbors, flickers upward, then dies to decayTo.
  _stepFire(x, y, id, mat) {
    const i = y * this.width + x;
    if (mat.life > 0) {
      this.life[i]--;
      if (this.life[i] <= 0) {
        this.cells[i] = mat.decayToId; this.life[i] = 0; this._wake(x, y); return;
      }
    }
    this._wake(x, y);
    for (let k = 0; k < NB8.length; k++) {
      const nx = x + NB8[k][0], ny = y + NB8[k][1];
      const t = this.get(nx, ny);
      if (t === this.EMPTY || t === this.BOUNDARY) continue;
      const tm = this.materials[t];
      if (!tm) continue;
      // Quench: a douser neighbor (water) extinguishes this fire into a product (steam).
      if (mat.quenchedById >= 0 && t === mat.quenchedById) {
        this.cells[i] = this.EMPTY; this.life[i] = 0;
        this.setCell(nx, ny, mat.quenchProductId, this.materials[mat.quenchProductId] ? this.materials[mat.quenchProductId].life : 0);
        this._wake(x, y); this._wake(nx, ny);
        return;
      }
      // Ignite flammable neighbors (oil fast, wood slow -- per-material chance).
      if (tm.flammable && this.rng() < tm.igniteChance) {
        this.setCell(nx, ny, tm.ignitesId, tm.igniteLife);
        this._wake(nx, ny);
      }
    }
    // Flicker upward into empty space.
    if (this.rng() < 0.25 && this.get(x, y - 1) === this.EMPTY) this._swap(x, y, x, y - 1);
  }

  // =======================================================================
  // BRUSH (deposit / erase)
  // =======================================================================

  /**
   * Circular deposit. Default fills only 'empty' cells (and lights flammables
   * when painting a fire-kind material), matching powder-toy feel. Pass
   * replace:true to overwrite anything.
   * @returns {number} cells painted
   */
  paint(cx, cy, nameOrId, opts = {}) {
    const id = typeof nameOrId === 'number' ? nameOrId : this.id(nameOrId);
    if (id < 0) return 0;
    const mat = this.materials[id];
    const r = Math.max(0, num(opts.radius, 3) | 0), r2 = r * r;
    const replace = !!opts.replace;
    const lifeOverride = opts.life;
    const ox = cx | 0, oy = cy | 0;
    let painted = 0;
    const isFire = mat && mat.kind === MaterialKind.FIRE;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const x = ox + dx, y = oy + dy;
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) continue;
        const i = y * this.width + x;
        const cur = this.cells[i];
        if (isFire && !replace) {
          // Fire acts as an igniter: light flammables or kindle a brief flame in empty.
          const cm = this.materials[cur];
          if (cur === this.EMPTY) {
            this.cells[i] = id; this.life[i] = lifeOverride != null ? (lifeOverride & 0xff) : 40; painted++; this._wakeNow(x, y);
          } else if (cm && cm.flammable) {
            this.cells[i] = cm.ignitesId; this.life[i] = cm.igniteLife & 0xff; painted++; this._wakeNow(x, y);
          }
          continue;
        }
        if (replace || cur === this.EMPTY) {
          this.cells[i] = id;
          this.life[i] = lifeOverride != null ? (lifeOverride & 0xff) : (mat ? mat.life & 0xff : 0);
          painted++; this._wakeNow(x, y);
        }
      }
    }
    return painted;
  }

  /**
   * Circular erase to 'empty'. Pass only:[names] to spare everything else
   * (e.g. erase powders/liquids but never walls).
   * @returns {number} cells erased
   */
  erase(cx, cy, opts = {}) {
    const r = Math.max(0, num(opts.radius, 3) | 0), r2 = r * r;
    let onlyIds = null;
    if (Array.isArray(opts.only)) onlyIds = opts.only.map(n => (typeof n === 'number' ? n : this.id(n)));
    const ox = cx | 0, oy = cy | 0;
    let erased = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const x = ox + dx, y = oy + dy;
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) continue;
        const i = y * this.width + x;
        const cur = this.cells[i];
        if (cur === this.EMPTY) continue;
        if (onlyIds && onlyIds.indexOf(cur) === -1) continue;
        this.cells[i] = this.EMPTY; this.life[i] = 0; erased++; this._wakeNow(x, y);
      }
    }
    return erased;
  }

  // =======================================================================
  // RENDERING (caller wires the output to its own canvas/texture)
  // =======================================================================

  /**
   * Fill an RGBA byte buffer (length >= width*height*4) from the current grid.
   * Fire/gas shade by remaining life; solids get a subtle texture jitter.
   * @param {Uint8ClampedArray|Uint8Array|number[]} rgba destination (caller-owned)
   * @param {object} [opts] { tint(id, life, frame) -> [r,g,b] } per-cell override
   * @returns {typeof rgba} the same buffer
   */
  renderToBuffer(rgba, opts = {}) {
    const tint = typeof opts.tint === 'function' ? opts.tint : null;
    const cells = this.cells, life = this.life, mats = this.materials, n = this.n, frame = this.frame;
    const empty = mats[this.EMPTY].color;
    for (let i = 0, q = 0; i < n; i++, q += 4) {
      const id = cells[i];
      let r, g, b;
      if (tint) {
        const c = tint(id, life[i], frame);
        if (c) { r = c[0]; g = c[1]; b = c[2]; }
      }
      if (r === undefined) {
        const mat = mats[id];
        const col = mat ? mat.color : empty;
        if (mat && mat.kind === MaterialKind.FIRE) {
          // Hotter (more life) -> brighter/whiter; cooler -> deep red.
          const lf = mat.life > 0 ? life[i] / mat.life : 1;
          r = 255; g = 110 + (lf * 150) | 0; b = 20 + (lf * 60) | 0;
        } else if (mat && mat.kind === MaterialKind.GAS) {
          // Fade gas toward the background as it ages (semi-transparent feel).
          const lf = mat.life > 0 ? life[i] / mat.life : 1;
          const a = 0.35 + lf * 0.4;
          r = empty[0] + (col[0] - empty[0]) * a | 0;
          g = empty[1] + (col[1] - empty[1]) * a | 0;
          b = empty[2] + (col[2] - empty[2]) * a | 0;
        } else {
          const t = this.tex ? this.tex[i] : 0;
          r = col[0] + t | 0; g = col[1] + t | 0; b = col[2] + t | 0;
        }
      }
      rgba[q] = r < 0 ? 0 : r > 255 ? 255 : r;
      rgba[q + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      rgba[q + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      rgba[q + 3] = 255;
    }
    return rgba;
  }
}

/**
 * Functional one-shot tick for callers that manage their own buffers. Pass a
 * plain grid object and it is advanced one tick in place. The object MUST carry
 * { width, height, cells:Uint8Array, life:Uint8Array, materials:array, frame }
 * and optionally { movedAt, rng, chunk, _grid }. The first call lazily attaches
 * a private CellularSandGrid view bound to the SAME typed arrays, so subsequent
 * calls are cheap. Mutates cells/life/frame in place.
 * @param {object} grid
 * @returns {object} the same grid
 */
export function stepGridOnce(grid) {
  if (!grid || !grid.cells) return grid;
  if (!grid._grid) {
    const view = new CellularSandGrid({
      width: grid.width, height: grid.height,
      materials: grid.materials, rng: grid.rng,
      chunk: grid.chunk, texture: false
    });
    // Bind the engine view to the caller's existing arrays (zero-copy).
    view.cells = grid.cells;
    view.life = grid.life || (grid.life = new Uint8Array(grid.cells.length));
    view.movedAt = grid.movedAt || (grid.movedAt = new Uint32Array(grid.cells.length));
    view.frame = grid.frame || 0;
    grid._grid = view;
  }
  const view = grid._grid;
  view.frame = grid.frame || view.frame;
  view.step();
  grid.frame = view.frame;
  return grid;
}

// END mChatAI Web Component: systems.cellular-sand-grid
