export class WaveManager {
  constructor(options = {}) {
    this.waves = options.waves ?? [];
    this.spawn = options.spawn ?? (() => {});
    this.waveIndex = -1;
    this.remaining = 0;
    this.spawned = 0;
    this.elapsed = 0;
    this.active = false;
  }

  start(index = 0) {
    this.waveIndex = index - 1;
    return this.nextWave();
  }

  nextWave() {
    this.waveIndex += 1;
    const wave = this.currentWave;
    if (!wave) {
      this.active = false;
      return null;
    }
    this.remaining = wave.count ?? 0;
    this.spawned = 0;
    this.elapsed = 0;
    this.active = true;
    return wave;
  }

  get currentWave() {
    return this.waves[this.waveIndex] ?? null;
  }

  update(dt) {
    if (!this.active || !this.currentWave) {
      return [];
    }
    const wave = this.currentWave;
    const interval = wave.interval ?? 0.75;
    const spawned = [];
    this.elapsed += dt;
    while (this.remaining > 0 && this.elapsed >= interval) {
      this.elapsed -= interval;
      this.remaining -= 1;
      this.spawned += 1;
      const entity = this.spawn({ wave, waveIndex: this.waveIndex, spawnIndex: this.spawned - 1 });
      if (entity) {
        spawned.push(entity);
      }
    }
    if (this.remaining <= 0 && wave.autoAdvance === true) {
      this.nextWave();
    }
    return spawned;
  }
}
