// BEGIN mChatAI Web Component: systems.echo-sonar
//
// A SONAR-to-SOUND bridge for three.js + Tone.js. One ping() fires a fan of N
// camera-aimed raycasts; each ray that HITS geometry lights a short-lived,
// fading sprite-dot at the hit point AND triggers a pooled Tone "echo" voice
// whose timing/timbre encodes the geometry:
//   DELAY   ~ distance        (sound has to travel out and back -> far = late)
//   PITCH   ~ distance        (near = bright/tight click, far = low/dull)
//   PAN     ~ azimuth         (the ray's angle within the fan -> left/right ear)
//   REVERB  ~ MEAN distance   (a tight corridor clicks dry; a vast chamber washes)
// Each ray that returns NOTHING is a "chasm" -- it plays a distinct pooled
// hollow-wind cue (filtered brown noise) instead of a click, so the player can
// HEAR an open drop in a given direction. This is the entire "see the dark by
// sound" mechanic, decoupled from any particular maze/level/objective.
//
// The audio graph is POOLED and MOBILE-SAFE: every Tone voice is pre-allocated
// once (no allocation during a ping), reused round-robin, and routed through a
// single shared reverb -> limiter -> destination chain. The visual dots are a
// pre-allocated Sprite ring-buffer too -- spawning never news up a mesh. This is
// what lets a phone fire a 24-ray ping every frame without GC stutter.
//
// PEER DEPENDENCIES (this lego intrinsically needs both -- it IS a 3D+audio
// bridge, so unlike most systems.* it is NOT dependency-free):
//   - three.js  (window.THREE or passed in opts.THREE) -- Raycaster, camera,
//                Vector3, Sprite/SpriteMaterial, CanvasTexture. Vendored locally
//                at ./resources/three/three.min.js (offline; never a CDN).
//   - Tone.js   (window.Tone or passed in opts.Tone) -- Limiter, Gain, Reverb,
//                Panner, MembraneSynth, NoiseSynth, Filter. Vendored at
//                ./libs/Tone.js. The caller MUST have started Tone (await
//                Tone.start()) from a user gesture before the first ping().
//
// What the CALLER owns (NOT in this lego): the camera + its yaw/pitch, the
// scene/renderer + render loop, what counts as a sonar target (you pass the
// target meshes in), movement, and any game objective. This lego only turns
// "where is the geometry?" into "what does it sound + look like?".
//
// Exports:
//   ping(opts)               functional one-shot: fire a fan, return the result
//   EchoSonar                stateful wrapper -- builds the pooled audio graph +
//                            dot pool ONCE, exposes .ping() and .update(dt) and
//                            .dispose(). This is the normal entry point.
//   DEFAULT_SONAR_OPTS       the tunable defaults (read-only reference)
//   makeDotTexture(THREE)    the soft radial sprite texture helper (reusable)
//
// Usage (typical -- one sonar for the whole scene):
//   import { EchoSonar } from './systems/echo-sonar.js';
//   // after the user taps "start" and you have awaited Tone.start():
//   const sonar = new EchoSonar({
//     scene, camera,                 // your three.js scene + camera
//     up: new THREE.Vector3(0,1,0),  // fan rotation axis (world up)
//     rayCount: 24, fanHalfAngle: 1.0, maxRange: 46,
//     soundSpeed: 92,                // world-units/sec -> echo delay scale
//   });
//   // each ping (a tap, SPACE, etc.):
//   const r = sonar.ping({
//     targets: walls.concat(pickups), // meshes to raycast; each may carry
//                                      // userData.sonar = { hueHex, freqMult, ... }
//   });
//   // r => { hitCount, missCount, meanDistance, foundChasm, hits:[...] }
//   if (r.foundChasm) showHint('a drop yawns somewhere ahead');
//   // each frame, fade the dots:
//   sonar.update(dt);
//   // on teardown:
//   sonar.dispose();
//
// Per-target tuning (optional): tag any target mesh with
//   mesh.userData.sonar = {
//     hueHex:   0x22e0d6,  // dot colour for hits on this mesh
//     freqMult: 2.2,       // multiply the distance-derived pitch (crystals chime
//                          // bright, an enemy thuds low with freqMult<1)
//     fixedFreq: 70,       // OR pin an absolute Hz, ignoring distance (e.g. a
//                          // menacing constant low for a "stalker")
//     dotScale: 1.3,       // dot size multiplier
//   }
// Untagged targets use the neutral wall preset (bright near, dim far).
//
// CONTRACTS:
//   - ping(opts) -> { hitCount, missCount, meanDistance, foundChasm, hits }
//       Fires `rayCount` rays evenly across [-fanHalfAngle, +fanHalfAngle]
//       around the camera forward, rotating about `up`. For each HIT it spawns a
//       fading dot (if a dot pool is supplied) and schedules a pooled echo voice
//       at t0 + distance/soundSpeed. For each MISS it schedules a pooled wind
//       cue. Reverb wet is ramped to a function of the MEAN hit distance.
//       `hits` is an array of { point:Vector3, distance, azimuth, pan, target }.
//       Returns immediately; audio + dots play/fade over the following ~2s.
//   - opts (functional ping, all required-ish unless a pool is reused):
//       THREE, Tone        the libraries (or set window.THREE/window.Tone).
//       camera             a THREE.Camera with a world position + getWorldDirection.
//       targets            Array<THREE.Object3D> to raycast against.
//       raycaster          a reused THREE.Raycaster (recommended; else one is made).
//       up                 THREE.Vector3 fan axis (default world +Y).
//       audioPool          { echoes, winds, reverb, now() } pre-built voices
//                          (EchoSonar builds this for you).
//       dotPool            { spawn(point, hueHex, distance, dotScale) } (optional;
//                          EchoSonar builds this for you).
//       rayCount, fanHalfAngle, maxRange, soundSpeed, ... see DEFAULT_SONAR_OPTS.
//   - EchoSonar(opts): builds the shared audio chain (limiter->reverb->panners->
//       voices) and a Sprite dot pool added to `scene`. Call .ping(frameOpts)
//       (frameOpts merged over construction opts -- usually just { targets }),
//       .update(dt) every frame to fade dots, .dispose() to free GPU + audio.
//   - DISPOSE: EchoSonar owns Tone voices, a CanvasTexture, Sprites, and a
//       scene Group, so it DOES expose dispose() -- call it on level teardown.
//       The functional ping() owns nothing it didn't receive.
//
// Extracted + generalized from the Echo Cartographer doPing() fan-raycast loop
// plus its initAudio() pooled-voice graph, spawnDot()/updateDots() dot pool, and
// azimuthTo() helper.

export const DEFAULT_SONAR_OPTS = Object.freeze({
  rayCount: 24,        // rays per ping, spread across the fan
  fanHalfAngle: 1.02,  // radians each side of forward (~58 deg) -> ~116 deg cone
  maxRange: 46,        // world units; raycaster.far + the distance-normalize ceiling
  soundSpeed: 92,      // world units/sec; echo delay = distance / soundSpeed
  // --- pitch mapping (distance -> Hz) ---
  freqNear: 450,       // bright Hz for a wall right in your face (norm=0)
  freqFar: 90,         // low Hz for a wall at max range (norm=1)
  // --- echo voice envelope (distance scales it) ---
  echoDurNear: 0.10,   // short tight click up close
  echoDurFar: 0.40,    // longer wash far away
  echoVelNear: 0.74,   // louder near
  echoVelFar: 0.12,    // quieter far (never silent -- floor)
  // --- reverb wet from mean distance ---
  reverbWetMin: 0.08,  // dry: tight corridor
  reverbWetMax: 0.85,  // wash: vast chamber
  reverbRamp: 0.05,    // seconds to ramp wet toward the new target
  // --- pool sizes (pre-allocated; mobile-safe) ---
  poolEcho: 16,        // round-robin echo (click) voices
  poolWind: 6,         // round-robin chasm (wind) voices
  poolDot: 300,        // sprite dot ring-buffer
  // --- dot visuals ---
  dotLife: 1.8,        // seconds a dot stays lit before fully faded
  dotScaleBase: 0.45,  // base sprite scale
  dotScalePerUnit: 0.018, // + this * distance (far hits read as bigger blooms)
  dotHueDefault: 0x9fe8ff, // neutral wall-echo colour
  // --- wind (chasm) cue ---
  windDelay: 0.02,     // seconds before the hollow wind starts after a ping
  windVel: 0.7
});

function num(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function resolveThree(opts) {
  const T = (opts && opts.THREE) || (typeof window !== 'undefined' ? window.THREE : null);
  if (!T) throw new Error('echo-sonar: three.js not found (set window.THREE or pass opts.THREE)');
  return T;
}
function resolveTone(opts) {
  const T = (opts && opts.Tone) || (typeof window !== 'undefined' ? window.Tone : null);
  if (!T) throw new Error('echo-sonar: Tone.js not found (set window.Tone or pass opts.Tone)');
  return T;
}

/**
 * Build the soft white-core radial-falloff sprite texture used for echo dots.
 * Reusable on its own for any additive glow sprite.
 * @param {object} THREE the three.js module
 * @returns {THREE.CanvasTexture}
 */
export function makeDotTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.28, 'rgba(210,248,255,0.85)');
  grd.addColorStop(1, 'rgba(120,200,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/**
 * Signed azimuth of a world point relative to where the camera is looking, in
 * radians (-left .. +right), measured in the horizontal (XZ) plane. Handy for
 * panning ANY positional sound source (a pickup chime, a footstep), not just
 * sonar hits. Wraps to (-PI, PI].
 * @param {object} THREE
 * @param {THREE.Camera} camera
 * @param {number} wx world X of the source
 * @param {number} wz world Z of the source
 * @returns {number} signed angle in radians
 */
export function azimuthTo(THREE, camera, wx, wz) {
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  const dx = wx - camera.position.x;
  const dz = wz - camera.position.z;
  const fa = Math.atan2(fwd.x, fwd.z);
  const ta = Math.atan2(dx, dz);
  let d = ta - fa;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/* ============================================================
   POOLED AUDIO GRAPH
   ============================================================ */

/**
 * Pre-allocate the shared, mobile-safe Tone audio graph for a sonar:
 *   limiter -> reverb -> [echo panners -> MembraneSynths]
 *                     -> [wind panners -> lowpass -> NoiseSynths]
 * Every voice exists for the lifetime of the sonar and is reused round-robin,
 * so a ping never allocates. Returns a handle the ping() function drives.
 * @param {object} Tone the Tone.js module
 * @param {object} [opts] merged over DEFAULT_SONAR_OPTS (uses pool sizes only)
 * @returns {{echoes, winds, reverb, master, masterGain, now, dispose}}
 */
export function buildSonarAudioPool(Tone, opts) {
  const o = resolveOpts(opts);

  const master = new Tone.Limiter(-2).toDestination();
  const masterGain = new Tone.Gain(0.9).connect(master);

  // Shared reverb: wet is modulated per-ping from the mean hit distance, so the
  // SAME chain renders both a dry corridor click and a cavernous wash.
  const reverb = new Tone.Reverb({ decay: 5.5, preDelay: 0.02, wet: 0.3 });
  // reverb.ready is async; connect now, it warms up in the background.
  if (reverb.ready && typeof reverb.ready.then === 'function') {
    reverb.ready.then(() => {}).catch(() => {});
  }
  reverb.connect(masterGain);

  // Echo voices: a percussive membrane "click" -> per-voice panner -> reverb.
  const echoes = [];
  for (let i = 0; i < o.poolEcho; i++) {
    const p = new Tone.Panner(0).connect(reverb);
    const s = new Tone.MembraneSynth({
      pitchDecay: 0.012,
      octaves: 5,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.12 }
    });
    s.volume.value = -5;
    s.connect(p);
    echoes.push({ s, p });
  }

  // Wind voices (chasm = no return): filtered brown noise -> panner -> reverb.
  const winds = [];
  for (let i = 0; i < o.poolWind; i++) {
    const p = new Tone.Panner(0).connect(reverb);
    const f = new Tone.Filter({ type: 'lowpass', frequency: 360, Q: 3.5 }).connect(p);
    const n = new Tone.NoiseSynth({
      noise: { type: 'brown' },
      envelope: { attack: 0.22, decay: 0.35, sustain: 0.5, release: 1.1 }
    });
    n.volume.value = -7;
    n.connect(f);
    winds.push({ n, f, p });
  }

  return {
    echoes,
    winds,
    reverb,
    master,
    masterGain,
    now: () => Tone.now(),
    dispose() {
      for (const v of echoes) { try { v.s.dispose(); } catch (e) {} try { v.p.dispose(); } catch (e) {} }
      for (const v of winds) { try { v.n.dispose(); } catch (e) {} try { v.f.dispose(); } catch (e) {} try { v.p.dispose(); } catch (e) {} }
      try { reverb.dispose(); } catch (e) {}
      try { masterGain.dispose(); } catch (e) {}
      try { master.dispose(); } catch (e) {}
    }
  };
}

/* ============================================================
   POOLED VISUAL DOTS (sprite ring-buffer)
   ============================================================ */

/**
 * Pre-allocate a ring-buffer of additive glow Sprites added to `scene`, and
 * return a handle with spawn()/update()/dispose(). Spawning never allocates --
 * it just repositions/recolours the next sprite in the ring. This is the
 * visual half of a ping (the audible half is the audio pool).
 * @param {object} THREE
 * @param {THREE.Object3D} scene parent to add the dot group to
 * @param {object} [opts] merged over DEFAULT_SONAR_OPTS
 * @returns {{group, spawn, update, reset, dispose}}
 */
export function buildSonarDotPool(THREE, scene, opts) {
  const o = resolveOpts(opts);
  const tex = makeDotTexture(THREE);
  const group = new THREE.Group();
  scene.add(group);

  const dots = [];
  for (let i = 0; i < o.poolDot; i++) {
    const m = new THREE.SpriteMaterial({
      map: tex, color: o.dotHueDefault, transparent: true,
      opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true
    });
    const s = new THREE.Sprite(m);
    s.visible = false;
    s.scale.set(0.6, 0.6, 1);
    group.add(s);
    dots.push({ s, life: 0, max: o.dotLife, base: 1 });
  }
  let ptr = 0;

  return {
    group,
    // Light the next dot in the ring at `point`, coloured/sized for the hit.
    spawn(point, hueHex, distance, dotScale) {
      const d = dots[ptr];
      ptr = (ptr + 1) % dots.length;
      d.s.position.copy(point);
      // Untagged walls dim with distance; tagged hits keep their full base.
      const base = (typeof dotScale === 'number')
        ? dotScale
        : (0.7 + 0.6 * (1 - Math.min(1, distance / o.maxRange)));
      d.s.material.color.setHex(num(hueHex, o.dotHueDefault));
      d.base = base;
      d.life = o.dotLife;
      d.max = o.dotLife;
      const sc = o.dotScaleBase + distance * o.dotScalePerUnit;
      d.s.scale.set(sc, sc, 1);
      d.s.visible = true;
      d.s.material.opacity = base;
    },
    // Fade every live dot by dt; quadratic falloff so they bloom then vanish.
    update(dt) {
      const d = num(dt, 0);
      for (const e of dots) {
        if (e.life > 0) {
          e.life -= d;
          if (e.life <= 0) { e.s.visible = false; e.s.material.opacity = 0; }
          else { const k = e.life / e.max; e.s.material.opacity = e.base * k * k; }
        }
      }
    },
    // Snuff all dots (e.g. on level rebuild).
    reset() {
      for (const e of dots) { e.life = 0; e.s.visible = false; e.s.material.opacity = 0; }
    },
    dispose() {
      for (const e of dots) {
        group.remove(e.s);
        if (e.s.material) e.s.material.dispose();
      }
      if (group.parent) group.parent.remove(group);
      tex.dispose();
    }
  };
}

/* ============================================================
   FUNCTIONAL ONE-SHOT PING
   ============================================================ */

function resolveOpts(opts) {
  const o = {};
  for (const k in DEFAULT_SONAR_OPTS) o[k] = DEFAULT_SONAR_OPTS[k];
  if (opts) {
    for (const k in DEFAULT_SONAR_OPTS) {
      if (k in opts) o[k] = num(opts[k], o[k]);
    }
  }
  return o;
}

/**
 * Fire ONE sonar ping: a fan of `rayCount` raycasts about the camera forward.
 * Hits -> fading dots + pooled distance-mapped echo voices. Misses -> pooled
 * hollow-wind chasm cues. Reverb wet ramps to a function of the mean hit
 * distance. Pure per-call orchestration -- it owns nothing it wasn't handed.
 *
 * @param {object} opts
 * @param {object}  opts.THREE       three.js module (or window.THREE)
 * @param {object} [opts.Tone]       Tone.js module (or window.Tone); only needed
 *                                   if opts.audioPool isn't supplied (it always
 *                                   should be -- build one with buildSonarAudioPool)
 * @param {THREE.Camera} opts.camera the player camera (position + getWorldDirection)
 * @param {Array<THREE.Object3D>} opts.targets meshes to raycast against. Each may
 *                                   carry userData.sonar = { hueHex, freqMult,
 *                                   fixedFreq, dotScale } for per-target timbre/colour.
 * @param {object} opts.audioPool    handle from buildSonarAudioPool(Tone, opts)
 * @param {object} [opts.dotPool]    handle from buildSonarDotPool(THREE, scene, opts)
 * @param {THREE.Raycaster} [opts.raycaster] a reused raycaster (recommended)
 * @param {THREE.Vector3} [opts.up]  fan rotation axis (default world +Y)
 * @param {number} [opts.t0]         absolute Tone time to anchor the ping (default now)
 * @returns {{hitCount:number, missCount:number, meanDistance:number, foundChasm:boolean, hits:Array}}
 */
export function ping(opts) {
  const THREE = resolveThree(opts);
  const o = resolveOpts(opts);
  const camera = opts.camera;
  const targets = Array.isArray(opts.targets) ? opts.targets : [];
  const pool = opts.audioPool || null;
  const dotPool = opts.dotPool || null;
  if (!camera) throw new Error('echo-sonar.ping: opts.camera is required');

  const up = opts.up instanceof THREE.Vector3 ? opts.up : new THREE.Vector3(0, 1, 0);
  const raycaster = opts.raycaster || new THREE.Raycaster();
  raycaster.far = o.maxRange;

  const t0 = (typeof opts.t0 === 'number') ? opts.t0 : (pool ? pool.now() : 0);

  const origin = camera.position.clone();
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);

  const hits = [];
  let sum = 0, hitCount = 0, missCount = 0;
  let ei = 0, wi = 0, foundChasm = false;

  const denom = o.rayCount > 1 ? (o.rayCount - 1) : 1;
  for (let i = 0; i < o.rayCount; i++) {
    // Evenly fan from -fanHalfAngle (left) to +fanHalfAngle (right).
    const a = -o.fanHalfAngle + (2 * o.fanHalfAngle) * (i / denom);
    const dir = fwd.clone().applyAxisAngle(up, a).normalize();
    raycaster.set(origin, dir);
    raycaster.far = o.maxRange;
    const hit = raycaster.intersectObjects(targets, false)[0];
    // Pan: the ray's own angle within the fan -> stereo placement of the echo.
    const pan = Math.max(-1, Math.min(1, a / o.fanHalfAngle));

    if (hit) {
      const dist = hit.distance;
      sum += dist; hitCount++;
      const tag = (hit.object && hit.object.userData && hit.object.userData.sonar) || null;

      // --- visual dot ---
      if (dotPool) {
        const hue = tag ? num(tag.hueHex, o.dotHueDefault) : o.dotHueDefault;
        const dotScale = tag && typeof tag.dotScale === 'number' ? tag.dotScale : undefined;
        dotPool.spawn(hit.point, hue, dist, dotScale);
      }

      // --- pooled echo voice: distance -> delay, pitch, duration, velocity ---
      if (pool && pool.echoes.length) {
        const v = pool.echoes[ei % pool.echoes.length]; ei++;
        v.p.pan.value = pan;
        const norm = Math.min(1, dist / o.maxRange); // 0 near .. 1 far
        let freq;
        if (tag && typeof tag.fixedFreq === 'number') {
          freq = tag.fixedFreq;                       // pinned timbre (e.g. enemy thud)
        } else {
          freq = o.freqFar + (1 - norm) * (o.freqNear - o.freqFar); // near=bright
          if (tag && typeof tag.freqMult === 'number') freq *= tag.freqMult;
        }
        const dur = o.echoDurNear + norm * (o.echoDurFar - o.echoDurNear);
        const vel = Math.max(o.echoVelFar, o.echoVelNear * (1 - norm) + 0.12);
        const delay = dist / o.soundSpeed;            // out-and-back travel time
        try { v.s.triggerAttackRelease(freq, dur, t0 + delay, vel); } catch (e) {}
      }

      hits.push({ point: hit.point, distance: dist, azimuth: a, pan, target: hit.object });
    } else {
      // --- no return = chasm: pooled hollow wind in this direction ---
      missCount++;
      foundChasm = true;
      if (pool && pool.winds.length) {
        const v = pool.winds[wi % pool.winds.length]; wi++;
        v.p.pan.value = pan;
        try { v.n.triggerAttackRelease(1.2, t0 + o.windDelay, o.windVel); } catch (e) {}
      }
    }
  }

  // --- reverb wet from MEAN hit distance: tight space = dry, vast = wash ---
  const meanDistance = hitCount ? sum / hitCount : o.maxRange;
  if (pool && pool.reverb) {
    const wet = Math.max(o.reverbWetMin, Math.min(o.reverbWetMax, meanDistance / o.maxRange));
    try { pool.reverb.wet.rampTo(wet, o.reverbRamp); } catch (e) {}
  }

  return { hitCount, missCount, meanDistance, foundChasm, hits };
}

/* ============================================================
   STATEFUL WRAPPER
   ============================================================ */

/**
 * Stateful sonar: builds the pooled audio graph + sprite dot pool ONCE at
 * construction, then exposes the per-frame mechanic. This is the normal way to
 * use the lego -- you only manage targets + dt.
 */
export class EchoSonar {
  /**
   * @param {object} opts
   * @param {object}  opts.THREE        three.js module (or window.THREE)
   * @param {object}  opts.Tone         Tone.js module (or window.Tone)
   * @param {THREE.Object3D} opts.scene parent for the dot pool group
   * @param {THREE.Camera}   opts.camera the player camera
   * @param {THREE.Vector3} [opts.up]   fan axis (default world +Y)
   * @param {THREE.Raycaster} [opts.raycaster] optional reused raycaster
   * @param {boolean} [opts.dots=true]  build the visual dot pool
   * @param {...} any DEFAULT_SONAR_OPTS overrides (rayCount, maxRange, ...)
   */
  constructor(opts = {}) {
    this.THREE = resolveThree(opts);
    this.Tone = resolveTone(opts);
    this.opts = resolveOpts(opts);
    this.scene = opts.scene || null;
    this.camera = opts.camera || null;
    this.up = opts.up instanceof this.THREE.Vector3 ? opts.up : new this.THREE.Vector3(0, 1, 0);
    this.raycaster = opts.raycaster || new this.THREE.Raycaster();
    this.raycaster.far = this.opts.maxRange;

    // Pre-allocate both halves of a ping ONCE (mobile-safe; no per-ping alloc).
    this.audioPool = buildSonarAudioPool(this.Tone, this.opts);
    this.dotPool = (opts.dots !== false && this.scene)
      ? buildSonarDotPool(this.THREE, this.scene, this.opts)
      : null;
  }

  /** Merge new options (e.g. tighten the fan, change maxRange). Returns this. */
  configure(partial = {}) {
    this.opts = resolveOpts(Object.assign({}, this.opts, partial));
    this.raycaster.far = this.opts.maxRange;
    return this;
  }

  /**
   * Fire one ping. `frameOpts` is merged over the construction opts -- usually
   * you only pass { targets }. Returns the same shape as the functional ping().
   * @param {object} frameOpts { targets, camera?, up?, t0? }
   */
  ping(frameOpts = {}) {
    return ping(Object.assign({}, this.opts, {
      THREE: this.THREE,
      Tone: this.Tone,
      camera: frameOpts.camera || this.camera,
      targets: frameOpts.targets || [],
      audioPool: this.audioPool,
      dotPool: this.dotPool,
      raycaster: this.raycaster,
      up: frameOpts.up || this.up,
      t0: frameOpts.t0
    }, frameOpts.optsOverride || {}));
  }

  /** Advance dot fading. Call every render frame with the frame's dt (seconds). */
  update(dt) {
    if (this.dotPool) this.dotPool.update(dt);
  }

  /** Snuff all live dots (e.g. when rebuilding a level). */
  resetDots() {
    if (this.dotPool) this.dotPool.reset();
  }

  /** Free all GPU + audio resources. Call on level teardown. */
  dispose() {
    if (this.dotPool) { this.dotPool.dispose(); this.dotPool = null; }
    if (this.audioPool) { this.audioPool.dispose(); this.audioPool = null; }
  }
}

// END mChatAI Web Component: systems.echo-sonar
