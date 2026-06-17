// BEGIN mChatAI Web Component: effects.particle-presets-3d
//
// Named one-call FX presets layered over effects.instanced-particle-pool, so a
// game calls spawnExplosion(pool, point) instead of hand-tuning spawnBurst
// parameters every time. Each preset is just a tuned spawnBurst call; the pool
// owns all allocation/recycling (tjs-009), so these add zero per-frame cost
// beyond the pool itself.
//
// All presets take the pool as the first argument so you can share ONE pool
// across every effect (one draw call). They no-op safely if pool is missing.
//
// Offline-safe (operates on the pool; THREE comes via the pool).
//
// Usage:
//   import { InstancedParticlePool } from './effects/instanced-particle-pool.js';
//   import { spawnExplosion, spawnPickupSparkle } from './effects/particle-presets-3d.js';
//   const fx = new InstancedParticlePool({ capacity: 600 });
//   scene.add(fx.object3d);
//   // on an enemy death:
//   spawnExplosion(fx, enemy.position);
//   // each frame:
//   fx.update(dt);

function _emit(pool, point, opts) {
  if (!pool || typeof pool.spawnBurst !== 'function' || !point) return;
  pool.spawnBurst(point, opts);
}

// Big radial blast: an enemy/barrel/projectile dying.
export function spawnExplosion(pool, point, opts = {}) {
  _emit(pool, point, {
    count: opts.count != null ? opts.count : 40,
    speed: opts.speed != null ? opts.speed : 9,
    color: opts.color != null ? opts.color : 0xff8833,
    life: opts.life != null ? opts.life : 0.7,
    spread: 1.0
  });
}

// A short directional jet behind a moving thing (thruster, dash trail).
export function spawnTrail(pool, point, opts = {}) {
  _emit(pool, point, {
    count: opts.count != null ? opts.count : 4,
    speed: opts.speed != null ? opts.speed : 1.5,
    color: opts.color != null ? opts.color : 0x66ccff,
    life: opts.life != null ? opts.life : 0.4,
    spread: 0.3
  });
}

// A tight forward flash when a weapon fires.
export function spawnMuzzleFlash(pool, point, opts = {}) {
  _emit(pool, point, {
    count: opts.count != null ? opts.count : 10,
    speed: opts.speed != null ? opts.speed : 6,
    color: opts.color != null ? opts.color : 0xffee88,
    life: opts.life != null ? opts.life : 0.18,
    spread: 0.5
  });
}

// Celebratory upward burst for a level-up / win.
export function spawnLevelUp(pool, point, opts = {}) {
  _emit(pool, point, {
    count: opts.count != null ? opts.count : 30,
    speed: opts.speed != null ? opts.speed : 5,
    color: opts.color != null ? opts.color : 0x66ff99,
    life: opts.life != null ? opts.life : 1.0,
    spread: 0.8
  });
}

// Gentle twinkle when a pickup is collected.
export function spawnPickupSparkle(pool, point, opts = {}) {
  _emit(pool, point, {
    count: opts.count != null ? opts.count : 14,
    speed: opts.speed != null ? opts.speed : 3,
    color: opts.color != null ? opts.color : 0xffd23f,
    life: opts.life != null ? opts.life : 0.6,
    spread: 0.6
  });
}

// Dust puff on a footstep / landing.
export function spawnDust(pool, point, opts = {}) {
  _emit(pool, point, {
    count: opts.count != null ? opts.count : 8,
    speed: opts.speed != null ? opts.speed : 2,
    color: opts.color != null ? opts.color : 0xb8a988,
    life: opts.life != null ? opts.life : 0.5,
    spread: 0.4
  });
}

// END mChatAI Web Component: effects.particle-presets-3d
