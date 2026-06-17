// BEGIN mChatAI Web Component: systems.spawn-wave-3d
//
// Data-driven enemy/obstacle wave scheduler -- the backbone of horde, survival,
// and tower-defense loops. You declare waves as plain data; update(dt) fires an
// onSpawn callback at the right times, tracks how many are alive vs remaining,
// and fires onWaveClear / onAllClear so win/lose wiring is trivial (tjs-016).
//
// It does NOT create meshes or own entities -- it just schedules. You spawn the
// actual creature (e.g. models.procedural-creatures-3d) in onSpawn and tell the
// manager when one dies via notifyKilled(). This keeps it dependency-free and
// reusable across genres.
//
// Dependency-free (pure timing + counters). Drive it from the fixed-step update
// (tjs-006): waveManager.update(dt).
//
// Usage:
//   import { SpawnWaveManager } from './systems/spawn-wave-3d.js';
//   const waves = new SpawnWaveManager({
//     waves: [
//       { count: 5,  type: 'wolf',     interval: 1.0, delay: 1.5 },
//       { count: 8,  type: 'goblin',   interval: 0.8 },
//       { count: 1,  type: 'dragon',   interval: 0,   delay: 2.0 }, // boss
//     ],
//     onSpawn:    (type, waveIndex) => spawnEnemy(type),     // you create the mesh
//     onWaveClear:(waveIndex) => hud.setMessage('Wave cleared!'),
//     onAllClear: () => win(),
//   });
//   // each frame:
//   waves.update(dt);
//   // when an enemy dies:
//   waves.notifyKilled(enemy);

function isFiniteNumber(v) { return typeof v === 'number' && Number.isFinite(v); }

export function makeWave(count, type, opts = {}) {
  return {
    count: Math.max(0, Math.floor(count)),
    type: type,
    interval: isFiniteNumber(opts.interval) ? Math.max(0, opts.interval) : 1.0,
    delay: isFiniteNumber(opts.delay) ? Math.max(0, opts.delay) : 0
  };
}

export class SpawnWaveManager {
  // opts:
  //   waves       array of { count, type, interval, delay }.
  //   onSpawn     (type, waveIndex, spawnIndex) -> entity. Called per spawn.
  //   onWaveClear (waveIndex) -> void. All of a wave spawned AND killed.
  //   onAllClear  () -> void. Every wave cleared.
  //   onWaveStart (waveIndex) -> void. A new wave began spawning.
  //   autoAdvance start the next wave automatically once one clears. Default true.
  constructor(opts = {}) {
    this.waves = Array.isArray(opts.waves) ? opts.waves.map(w => makeWave(w.count, w.type, w)) : [];
    this.onSpawn = typeof opts.onSpawn === 'function' ? opts.onSpawn : null;
    this.onWaveClear = typeof opts.onWaveClear === 'function' ? opts.onWaveClear : null;
    this.onAllClear = typeof opts.onAllClear === 'function' ? opts.onAllClear : null;
    this.onWaveStart = typeof opts.onWaveStart === 'function' ? opts.onWaveStart : null;
    this.autoAdvance = opts.autoAdvance !== false;

    this.waveIndex = -1;        // current wave (-1 = not started)
    this.spawnedThisWave = 0;   // how many of the current wave have spawned
    this.aliveThisWave = 0;     // alive (spawned but not killed) this wave
    this._timer = 0;            // counts toward the next spawn
    this._delayTimer = 0;       // start-of-wave delay countdown
    this._waveActive = false;
    this._allClear = false;
    this._started = false;
  }

  // Begin the schedule (or restart). Call once when the game starts.
  start() {
    this.waveIndex = -1;
    this.spawnedThisWave = 0;
    this.aliveThisWave = 0;
    this._timer = 0;
    this._allClear = false;
    this._started = true;
    this._beginNextWave();
    return this;
  }

  _beginNextWave() {
    this.waveIndex += 1;
    if (this.waveIndex >= this.waves.length) {
      this._waveActive = false;
      if (!this._allClear) {
        this._allClear = true;
        if (this.onAllClear) this.onAllClear();
      }
      return;
    }
    this.spawnedThisWave = 0;
    this.aliveThisWave = 0;
    this._timer = 0;
    this._delayTimer = this.waves[this.waveIndex].delay || 0;
    this._waveActive = true;
    if (this.onWaveStart) this.onWaveStart(this.waveIndex);
  }

  update(dt) {
    if (!this._started || !this._waveActive || this._allClear) return this;
    const wave = this.waves[this.waveIndex];
    if (!wave) return this;

    if (this._delayTimer > 0) {
      this._delayTimer -= dt;
      if (this._delayTimer > 0) return this;
      dt = -this._delayTimer; // carry the remainder into spawning
    }

    // Spawn on cadence until the wave's count is exhausted.
    if (this.spawnedThisWave < wave.count) {
      this._timer -= dt;
      // First spawn is immediate (timer starts at 0).
      while (this.spawnedThisWave < wave.count && this._timer <= 0) {
        let entity = null;
        if (this.onSpawn) {
          entity = this.onSpawn(wave.type, this.waveIndex, this.spawnedThisWave);
        }
        this.spawnedThisWave += 1;
        this.aliveThisWave += 1;
        this._timer += wave.interval;
      }
    }

    // Wave clears when all are spawned AND all are dead.
    if (this.spawnedThisWave >= wave.count && this.aliveThisWave <= 0) {
      this._waveActive = false;
      if (this.onWaveClear) this.onWaveClear(this.waveIndex);
      if (this.autoAdvance) {
        this._beginNextWave();
      }
    }
    return this;
  }

  // Tell the manager an enemy from the current wave died.
  notifyKilled() {
    if (this.aliveThisWave > 0) this.aliveThisWave -= 1;
    return this;
  }

  // Manually advance to the next wave (when autoAdvance is false).
  nextWave() {
    if (!this._allClear) this._beginNextWave();
    return this;
  }

  get totalWaves() { return this.waves.length; }
  get remainingThisWave() {
    const w = this.waves[this.waveIndex];
    return w ? Math.max(0, w.count - this.spawnedThisWave) + this.aliveThisWave : 0;
  }
  get isComplete() { return this._allClear; }
}

// END mChatAI Web Component: systems.spawn-wave-3d
