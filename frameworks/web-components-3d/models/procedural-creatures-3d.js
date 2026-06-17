// BEGIN mChatAI Web Component: models.procedural-creatures-3d
//
// Rigged, ANIMATED low-poly creatures with ZERO asset files -- the World of
// ClaudeCraft pattern. The existing models.lowpoly-characters-3d builders make
// good static shapes but have no skeleton and no animation, so games place a
// creature and it sits in a T-pose like a statue (the tjs-013/tjs-014 "nothing
// is alive" failure). This component builds creatures out of NESTED PIVOT GROUPS
// (hip -> spine -> head; shoulder -> upperLeg -> lowerLeg) and drives those
// pivots every frame with a tiny pose evaluator keyed by clip name + phase.
//
// No GLTF, no THREE.AnimationMixer, no skinning -- just transform animation on
// grouped meshes. That is offline-safe, dependency-free-of-loaders, and cheap.
//
// Four ARCHETYPES, reskinned by family + seed so one rig yields a whole bestiary:
//   biped       humanoid    -> humanoid, skeleton, goblin, villager
//   quadruped   4 legs      -> wolf, boar, dog, sheep
//   serpentine  segmented   -> spider (legs), snake, dragon
//   floating    hovering    -> slime, wisp, eye, bird (flap)
//
// Animation clips (every archetype supports them; the evaluator no-ops missing
// joints gracefully): 'idle', 'walk', 'attack', 'hit', 'death'.
//
// Offline-safe: THREE is passed in (dependency-free, like the other builders).
//
// Usage:
//   import { buildCreature, animateCreature, CREATURE_FAMILIES }
//     from './models/procedural-creatures-3d.js';
//   const wolf = buildCreature(THREE, { family: 'wolf', color: 0x6b5640 });
//   scene.add(wolf);
//   // each frame, from your fixed-step update (tjs-006):
//   enemy.animTime += dt;
//   animateCreature(wolf, { clip: enemy.state, t: enemy.animTime });
//   //   enemy.state cycles 'idle' -> 'walk' -> 'attack' as your AI decides.

// ----- shared helpers (mirror models.lowpoly-characters-3d) -----
function _resolveColor(THREE, color, def) {
  if (color == null) return def;
  if (typeof color === 'number') return color;
  if (Array.isArray(color) && color.length === 3) {
    let [r, g, b] = color;
    if (r > 1 || g > 1 || b > 1) { r /= 255; g /= 255; b /= 255; }
    return new THREE.Color(r, g, b).getHex();
  }
  if (typeof color === 'string') { try { return new THREE.Color(color).getHex(); } catch (e) { return def; } }
  return def;
}

function _mat(THREE, hex, opts) {
  opts = opts || {};
  return new THREE.MeshStandardMaterial({
    color: hex,
    flatShading: true,
    roughness: opts.roughness != null ? opts.roughness : 0.8,
    metalness: opts.metalness != null ? opts.metalness : 0.05,
    emissive: opts.emissive != null ? opts.emissive : 0x000000,
    emissiveIntensity: opts.emissiveIntensity != null ? opts.emissiveIntensity : 1
  });
}

// Tiny seeded RNG so a family + seed always produces the same creature (a la
// the WoCC procedural-reskin idea). Mulberry32.
function _rng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Family -> { archetype, base color, accent, scale, eye, traits }.
export const CREATURE_FAMILIES = {
  humanoid:  { archetype: 'biped',      color: 0x8a6f5c, accent: 0x55402f, scale: 1.0 },
  skeleton:  { archetype: 'biped',      color: 0xe8e3d3, accent: 0xb8b09a, scale: 1.0, eye: 0xff5533, bony: true },
  goblin:    { archetype: 'biped',      color: 0x6f8f4a, accent: 0x4a5f33, scale: 0.82, eye: 0xffd23f },
  villager:  { archetype: 'biped',      color: 0xc98b6b, accent: 0x6a8fbf, scale: 1.0 },
  wolf:      { archetype: 'quadruped',  color: 0x6b6b6b, accent: 0x3f3f3f, scale: 0.9, eye: 0xffe066, snout: true },
  boar:      { archetype: 'quadruped',  color: 0x5a4636, accent: 0x3a2c22, scale: 0.95, tusks: true },
  dog:       { archetype: 'quadruped',  color: 0xb98b52, accent: 0x6a4d2c, scale: 0.7, snout: true },
  sheep:     { archetype: 'quadruped',  color: 0xeae6dd, accent: 0x2b2b2b, scale: 0.8, fluffy: true },
  spider:    { archetype: 'serpentine', color: 0x2b2230, accent: 0x120e16, scale: 0.7, legs: 8, eye: 0xff3355 },
  snake:     { archetype: 'serpentine', color: 0x3f7a3f, accent: 0x274d27, scale: 0.8, legs: 0, segments: 7 },
  dragon:    { archetype: 'serpentine', color: 0x8a2b2b, accent: 0x5a1a1a, scale: 1.4, legs: 4, segments: 5, wings: true, eye: 0xffaa33 },
  slime:     { archetype: 'floating',   color: 0x4fd17a, accent: 0x2f9f55, scale: 0.9, jelly: true },
  wisp:      { archetype: 'floating',   color: 0x9fd8ff, accent: 0x5fb0ff, scale: 0.6, eye: 0xffffff, glow: true },
  eye:       { archetype: 'floating',   color: 0xc44, accent: 0x822, scale: 0.7, eye: 0xffffff, glow: true },
  bird:      { archetype: 'floating',   color: 0x4a78c0, accent: 0xf0c040, scale: 0.6, wings: true }
};

// ===== rig construction =====
// Each builder returns a THREE.Group whose userData.rig describes the named
// pivot joints the evaluator animates: { archetype, joints:{name:Object3D},
// rest:{name:{x,y,z}} }. animateCreature reads rest pose + applies clip deltas.

function _registerJoint(rig, name, obj) {
  rig.joints[name] = obj;
  rig.rest[name] = { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z, py: obj.position.y };
}

function _buildBiped(THREE, fam, rng) {
  const g = new THREE.Group();
  const body = _resolveColor(THREE, fam.color, 0x8a6f5c);
  const accent = _resolveColor(THREE, fam.accent, 0x55402f);
  const bodyMat = _mat(THREE, body, { roughness: fam.bony ? 0.6 : 0.85 });
  const accentMat = _mat(THREE, accent);
  const eyeMat = _mat(THREE, fam.eye || 0x222222, fam.eye ? { emissive: fam.eye, emissiveIntensity: 1.3, roughness: 0.3 } : {});

  const rig = { archetype: 'biped', joints: {}, rest: {} };

  // hip (root pivot for the whole body bob)
  const hip = new THREE.Group(); hip.position.y = 1.0; g.add(hip);
  _registerJoint(rig, 'hip', hip);

  // spine -> torso -> head (nested so leaning the spine carries the head)
  const spine = new THREE.Group(); hip.add(spine);
  _registerJoint(rig, 'spine', spine);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(fam.bony ? 0.5 : 0.7, 0.85, 0.4), bodyMat);
  torso.position.y = 0.45; spine.add(torso);

  const neck = new THREE.Group(); neck.position.y = 0.95; spine.add(neck);
  _registerJoint(rig, 'head', neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), bodyMat);
  head.position.y = 0.25; neck.add(head);
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.04), eyeMat);
  eyeL.position.set(-0.11, 0.28, 0.24); neck.add(eyeL);
  const eyeR = eyeL.clone(); eyeR.position.x = 0.11; neck.add(eyeR);

  // arms: shoulder pivot -> upper -> lower
  function arm(dir, label) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.45 * dir, 0.8, 0); spine.add(shoulder);
    _registerJoint(rig, 'arm' + label, shoulder);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.18), accentMat);
    upper.position.y = -0.3; shoulder.add(upper);
    const lower = new THREE.Group(); lower.position.y = -0.6; shoulder.add(lower);
    _registerJoint(rig, 'forearm' + label, lower);
    const fmesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), bodyMat);
    fmesh.position.y = -0.25; lower.add(fmesh);
  }
  arm(1, 'R'); arm(-1, 'L');

  // legs: hip pivot -> thigh -> shin
  function leg(dir, label) {
    const lhip = new THREE.Group();
    lhip.position.set(0.18 * dir, 0, 0); hip.add(lhip);
    _registerJoint(rig, 'leg' + label, lhip);
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.24), bodyMat);
    thigh.position.y = -0.5; lhip.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -0.8; lhip.add(knee);
    _registerJoint(rig, 'shin' + label, knee);
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.22), accentMat);
    shin.position.y = -0.25; knee.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.4), accentMat);
    foot.position.set(0, -0.5, 0.08); knee.add(foot);
  }
  leg(1, 'R'); leg(-1, 'L');

  return { group: g, rig };
}

function _buildQuadruped(THREE, fam, rng) {
  const g = new THREE.Group();
  const body = _resolveColor(THREE, fam.color, 0x6b6b6b);
  const accent = _resolveColor(THREE, fam.accent, 0x3f3f3f);
  const bodyMat = _mat(THREE, body, { roughness: fam.fluffy ? 0.95 : 0.8 });
  const accentMat = _mat(THREE, accent);
  const eyeMat = _mat(THREE, fam.eye || 0x111111, fam.eye ? { emissive: fam.eye, emissiveIntensity: 1.2, roughness: 0.3 } : {});

  const rig = { archetype: 'quadruped', joints: {}, rest: {} };

  const hip = new THREE.Group(); hip.position.y = 0.7; g.add(hip);
  _registerJoint(rig, 'hip', hip);

  const spine = new THREE.Group(); hip.add(spine);
  _registerJoint(rig, 'spine', spine);
  // horizontal body (long axis along Z)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, fam.fluffy ? 1.0 : 1.1), bodyMat);
  spine.add(torso);

  // neck + head reach forward (-Z is forward)
  const neck = new THREE.Group(); neck.position.set(0, 0.15, -0.6); spine.add(neck);
  _registerJoint(rig, 'head', neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.45), bodyMat);
  head.position.z = -0.25; neck.add(head);
  if (fam.snout) {
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.3), accentMat);
    snout.position.set(0, -0.05, -0.55); neck.add(snout);
  }
  if (fam.tusks) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 5), _mat(THREE, 0xeeeedd));
    t.position.set(-0.12, -0.1, -0.5); t.rotation.x = -0.6; neck.add(t);
    const t2 = t.clone(); t2.position.x = 0.12; neck.add(t2);
  }
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), eyeMat);
  eyeL.position.set(-0.13, 0.08, -0.45); neck.add(eyeL);
  const eyeR = eyeL.clone(); eyeR.position.x = 0.13; neck.add(eyeR);

  // tail
  const tail = new THREE.Group(); tail.position.set(0, 0.1, 0.55); spine.add(tail);
  _registerJoint(rig, 'tail', tail);
  const tailMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.4), accentMat);
  tailMesh.position.z = 0.2; tail.add(tailMesh);

  // four legs (FL FR BL BR). +Z = back, -Z = front.
  function leg(dx, dz, label) {
    const lhip = new THREE.Group();
    lhip.position.set(0.22 * dx, -0.15, 0.4 * dz); hip.add(lhip);
    _registerJoint(rig, 'leg' + label, lhip);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.4, 0.16), bodyMat);
    upper.position.y = -0.2; lhip.add(upper);
    const knee = new THREE.Group(); knee.position.y = -0.4; lhip.add(knee);
    _registerJoint(rig, 'shin' + label, knee);
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.35, 0.14), accentMat);
    shin.position.y = -0.18; knee.add(shin);
  }
  leg(-1, -1, 'FL'); leg(1, -1, 'FR'); leg(-1, 1, 'BL'); leg(1, 1, 'BR');

  return { group: g, rig };
}

function _buildSerpentine(THREE, fam, rng) {
  const g = new THREE.Group();
  const body = _resolveColor(THREE, fam.color, 0x3f7a3f);
  const accent = _resolveColor(THREE, fam.accent, 0x274d27);
  const bodyMat = _mat(THREE, body, { roughness: 0.7 });
  const accentMat = _mat(THREE, accent);
  const eyeMat = _mat(THREE, fam.eye || 0xff3355, { emissive: fam.eye || 0xff3355, emissiveIntensity: 1.3, roughness: 0.3 });

  const rig = { archetype: 'serpentine', joints: {}, rest: {} };

  const root = new THREE.Group(); root.position.y = fam.legs ? 0.5 : 0.35; g.add(root);
  _registerJoint(rig, 'hip', root);

  // body segments chained head-to-tail (each a pivot so the body can undulate)
  const segCount = fam.segments || 5;
  let parent = root;
  const segSize = 0.45 * (fam.scale ? 1 : 1);
  for (let i = 0; i < segCount; i++) {
    const seg = new THREE.Group();
    seg.position.z = i === 0 ? 0 : segSize * 0.9;
    parent.add(seg);
    _registerJoint(rig, 'seg' + i, seg);
    const r = (segCount - i) / segCount; // taper toward tail
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.4 * r + 0.12, 0.4 * r + 0.12, segSize),
      i % 2 === 0 ? bodyMat : accentMat
    );
    seg.add(mesh);
    parent = seg;
    if (i === 0) {
      // head at the front segment (-Z forward)
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), bodyMat);
      head.position.z = -0.45; seg.add(head);
      const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), eyeMat);
      eyeL.position.set(-0.16, 0.12, -0.65); seg.add(eyeL);
      const eyeR = eyeL.clone(); eyeR.position.x = 0.16; seg.add(eyeR);
      _registerJoint(rig, 'head', seg);
    }
  }

  // optional radial legs (spider) hung off the root
  if (fam.legs && fam.legs > 0) {
    const n = fam.legs;
    for (let i = 0; i < n; i++) {
      const side = i < n / 2 ? -1 : 1;
      const idx = i % Math.max(1, Math.floor(n / 2));
      const leg = new THREE.Group();
      leg.position.set(0.35 * side, -0.1, -0.3 + idx * 0.35);
      leg.rotation.z = side * 0.5;
      root.add(leg);
      _registerJoint(rig, 'leg' + i, leg);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.5), accentMat);
      upper.position.z = 0; upper.rotation.x = Math.PI / 2; leg.add(upper);
      const knee = new THREE.Group(); knee.position.set(0.25 * side, -0.1, 0); leg.add(knee);
      _registerJoint(rig, 'legknee' + i, knee);
      const lower = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.05), bodyMat);
      lower.position.y = -0.2; knee.add(lower);
    }
  }

  // optional wings (dragon)
  if (fam.wings) {
    function wing(dir, label) {
      const w = new THREE.Group();
      w.position.set(0.3 * dir, 0.2, 0.2); root.add(w);
      _registerJoint(rig, 'wing' + label, w);
      const membrane = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.6), accentMat);
      membrane.position.x = 0.45 * dir; w.add(membrane);
    }
    wing(1, 'R'); wing(-1, 'L');
  }

  return { group: g, rig };
}

function _buildFloating(THREE, fam, rng) {
  const g = new THREE.Group();
  const body = _resolveColor(THREE, fam.color, 0x4fd17a);
  const accent = _resolveColor(THREE, fam.accent, 0x2f9f55);
  const glow = fam.glow ? { emissive: body, emissiveIntensity: 0.7, roughness: 0.4 } : {};
  const bodyMat = fam.jelly
    ? new THREE.MeshStandardMaterial({ color: body, transparent: true, opacity: 0.85, flatShading: true, roughness: 0.3 })
    : _mat(THREE, body, glow);
  const eyeMat = _mat(THREE, fam.eye || 0x111111, fam.eye ? { emissive: fam.eye, emissiveIntensity: 1.4, roughness: 0.2 } : {});

  const rig = { archetype: 'floating', joints: {}, rest: {} };

  const core = new THREE.Group(); core.position.y = 1.0; g.add(core);
  _registerJoint(rig, 'hip', core);     // the body bob pivot
  _registerJoint(rig, 'body', core);    // alias for squash/stretch

  let bodyMesh;
  if (fam.jelly) {
    bodyMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), bodyMat);
  } else if (fam.archetype === 'floating' && fam.eye && !fam.wings) {
    bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), bodyMat);
  } else {
    bodyMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), bodyMat);
  }
  bodyMesh.name = 'body'; core.add(bodyMesh);

  // single big eye
  if (fam.eye) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), _mat(THREE, 0xffffff, { roughness: 0.2 }));
    eye.position.set(0, 0.05, 0.42); core.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), eyeMat);
    pupil.position.set(0, 0.05, 0.56); core.add(pupil);
  } else {
    // small eyes for slime-type
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), _mat(THREE, 0x111111));
    eyeL.position.set(-0.18, 0.08, 0.5); core.add(eyeL);
    const eyeR = eyeL.clone(); eyeR.position.x = 0.18; core.add(eyeR);
  }

  // wings (bird) flap; otherwise it just bobs
  if (fam.wings) {
    function wing(dir, label) {
      const w = new THREE.Group();
      w.position.set(0.25 * dir, 0.05, 0); core.add(w);
      _registerJoint(rig, 'wing' + label, w);
      const membrane = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.4), _mat(THREE, accent));
      membrane.position.x = 0.32 * dir; w.add(membrane);
    }
    wing(1, 'R'); wing(-1, 'L');
  }

  return { group: g, rig };
}

const _BUILDERS = {
  biped: _buildBiped,
  quadruped: _buildQuadruped,
  serpentine: _buildSerpentine,
  floating: _buildFloating
};

// buildCreature(THREE, opts) -> THREE.Group (with userData.rig + userData.animTime)
//
// opts:
//   family   key from CREATURE_FAMILIES (e.g. 'wolf'). Default 'humanoid'.
//   color    override base color (hex / [r,g,b] / css string).
//   accent   override accent color.
//   scale    uniform scale multiplier (combined with the family's base scale).
//   seed     integer for deterministic reskinning. Default derived from family.
export function buildCreature(THREE, opts = {}) {
  const familyKey = opts.family && CREATURE_FAMILIES[opts.family] ? opts.family : 'humanoid';
  const base = CREATURE_FAMILIES[familyKey];
  // Merge family defaults with caller overrides.
  const fam = Object.assign({}, base);
  if (opts.color != null) fam.color = opts.color;
  if (opts.accent != null) fam.accent = opts.accent;
  const seed = Number.isInteger(opts.seed) ? opts.seed : _hashFamily(familyKey);
  const rng = _rng(seed);

  const builder = _BUILDERS[fam.archetype] || _buildBiped;
  const { group, rig } = builder(THREE, fam, rng);

  group.name = 'Creature:' + familyKey;
  const finalScale = (base.scale || 1) * (opts.scale != null ? opts.scale : 1);
  group.scale.setScalar(finalScale);

  group.userData.rig = rig;
  group.userData.family = familyKey;
  group.userData.animTime = 0;
  group.userData.clip = 'idle';
  return group;
}

function _hashFamily(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ===== animation =====
// animateCreature(group, { clip, t, speed }) mutates joint rotations each frame.
// Pure function of t (delta-time-driven per tjs-006). Unknown joints are skipped
// so every archetype shares one evaluator.
//
//   clip  'idle' | 'walk' | 'attack' | 'hit' | 'death'. Default group.userData.clip.
//   t     animation time in seconds (accumulate dt yourself). Default uses
//         group.userData.animTime (auto-advanced if you pass dt instead).
//   speed clip playback rate multiplier. Default 1.
//   dt    if given (and t omitted), advances group.userData.animTime by dt.
export function animateCreature(group, params = {}) {
  if (!group || !group.userData || !group.userData.rig) return group;
  const rig = group.userData.rig;
  const joints = rig.joints;
  const rest = rig.rest;

  let t = params.t;
  if (t == null) {
    if (typeof params.dt === 'number') {
      group.userData.animTime += params.dt;
    }
    t = group.userData.animTime;
  }
  const clip = params.clip || group.userData.clip || 'idle';
  group.userData.clip = clip;
  const speed = typeof params.speed === 'number' ? params.speed : 1;
  const phase = t * speed;

  // reset every joint to rest first so clips never accumulate drift
  for (const name in joints) {
    const j = joints[name];
    const r = rest[name];
    if (!j || !r) continue;
    j.rotation.set(r.x, r.y, r.z);
    if (r.py != null) j.position.y = r.py;
  }

  if (clip === 'walk') _clipWalk(rig, phase);
  else if (clip === 'attack') _clipAttack(rig, phase);
  else if (clip === 'hit') _clipHit(rig, phase);
  else if (clip === 'death') _clipDeath(group, rig, phase);
  else _clipIdle(rig, phase);

  return group;
}

function _set(joints, name, axis, value, additive) {
  const j = joints[name];
  if (!j) return;
  if (additive) j.rotation[axis] += value;
  else j.rotation[axis] = value;
}

function _clipIdle(rig, phase) {
  const j = rig.joints;
  const bob = Math.sin(phase * 2.2) * 0.04;
  if (j.hip) j.hip.position.y += bob;
  if (j.head) j.head.rotation.x += Math.sin(phase * 1.3) * 0.05;
  if (j.spine) j.spine.rotation.x += Math.sin(phase * 2.2) * 0.02;
  // floating things hover; serpents sway; bipeds breathe
  if (rig.archetype === 'floating') {
    if (j.hip) j.hip.position.y += Math.sin(phase * 1.6) * 0.12;
    _flapWings(j, phase, 0.25, 4);
  }
  if (rig.archetype === 'serpentine') _undulate(rig, phase, 0.08, 1.5);
}

function _clipWalk(rig, phase) {
  const j = rig.joints;
  const a = rig.archetype;
  const w = phase * 6; // stride speed
  if (a === 'biped') {
    const swing = Math.sin(w) * 0.6;
    _set(j, 'legR', 'x', swing, true);
    _set(j, 'legL', 'x', -swing, true);
    _set(j, 'shinR', 'x', Math.max(0, Math.sin(w + 1)) * 0.5, true);
    _set(j, 'shinL', 'x', Math.max(0, Math.sin(w + 1 + Math.PI)) * 0.5, true);
    _set(j, 'armR', 'x', -swing * 0.7, true);
    _set(j, 'armL', 'x', swing * 0.7, true);
    if (j.hip) j.hip.position.y += Math.abs(Math.sin(w)) * 0.06;
    if (j.spine) j.spine.rotation.y += Math.sin(w) * 0.05;
  } else if (a === 'quadruped') {
    // diagonal gait: FL+BR together, FR+BL together
    const s = Math.sin(w) * 0.7;
    _set(j, 'legFL', 'x', s, true); _set(j, 'legBR', 'x', s, true);
    _set(j, 'legFR', 'x', -s, true); _set(j, 'legBL', 'x', -s, true);
    _set(j, 'shinFL', 'x', Math.max(0, Math.sin(w + 1)) * 0.5, true);
    _set(j, 'shinBR', 'x', Math.max(0, Math.sin(w + 1)) * 0.5, true);
    _set(j, 'shinFR', 'x', Math.max(0, Math.sin(w + 1 + Math.PI)) * 0.5, true);
    _set(j, 'shinBL', 'x', Math.max(0, Math.sin(w + 1 + Math.PI)) * 0.5, true);
    if (j.hip) j.hip.position.y += Math.abs(Math.sin(w * 2)) * 0.04;
    if (j.tail) j.tail.rotation.y += Math.sin(w) * 0.2;
    if (j.head) j.head.rotation.x += Math.sin(w * 2) * 0.05;
  } else if (a === 'serpentine') {
    _undulate(rig, phase, 0.3, 5);
    // skitter radial legs if present
    let i = 0;
    while (j['leg' + i]) {
      _set(j, 'leg' + i, 'x', Math.sin(w + i) * 0.4, true);
      _set(j, 'legknee' + i, 'x', Math.cos(w + i) * 0.3, true);
      i++;
    }
  } else {
    // floating: bob faster + flap
    if (j.hip) j.hip.position.y += Math.sin(w) * 0.15;
    _flapWings(j, phase, 0.6, 10);
  }
}

function _clipAttack(rig, phase) {
  const j = rig.joints;
  const a = rig.archetype;
  // one-shot-ish lunge driven by a triangle of the phase fraction
  const k = (phase % 1);
  const lunge = Math.sin(Math.min(1, k) * Math.PI); // 0..1..0
  if (a === 'biped') {
    _set(j, 'armR', 'x', -lunge * 1.6, true);
    _set(j, 'forearmR', 'x', -lunge * 0.8, true);
    if (j.spine) j.spine.rotation.x += lunge * 0.25;
  } else if (a === 'quadruped') {
    if (j.hip) j.hip.position.y += lunge * 0.2;
    if (j.head) j.head.rotation.x += -lunge * 0.4; // bite down
    if (j.spine) j.spine.rotation.x += lunge * 0.15;
  } else if (a === 'serpentine') {
    if (j.head) j.head.rotation.x += -lunge * 0.5;
    if (j.seg0) j.seg0.rotation.x += -lunge * 0.4; // strike forward
    if (j.wingR) j.wingR.rotation.z += -lunge * 0.6;
    if (j.wingL) j.wingL.rotation.z += lunge * 0.6;
  } else {
    // floating: squash-stretch pulse
    if (j.body) j.body.scale && j.body.scale.set(1 + lunge * 0.3, 1 - lunge * 0.2, 1 + lunge * 0.3);
    if (j.hip) j.hip.position.y += lunge * 0.1;
  }
}

function _clipHit(rig, phase) {
  const j = rig.joints;
  const flinch = Math.sin(phase * 30) * Math.max(0, 1 - (phase % 1) * 2) * 0.25;
  if (j.spine) j.spine.rotation.x += flinch;
  if (j.head) j.head.rotation.z += flinch * 0.8;
  if (j.hip) j.hip.rotation.z += flinch * 0.4;
}

function _clipDeath(group, rig, phase) {
  const j = rig.joints;
  // fall over within ~0.6s then stay down
  const k = Math.min(1, (phase % 1000) / 0.6);
  const fall = k * (Math.PI / 2);
  if (j.hip) {
    j.hip.rotation.x = fall;
    j.hip.position.y = Math.max(0.1, (rig.rest.hip.py || 1) * (1 - k));
  }
  if (j.spine) j.spine.rotation.x += k * 0.3;
  if (j.head) j.head.rotation.x += k * 0.2;
}

// ---- shared motion helpers ----
function _undulate(rig, phase, amp, freq) {
  const j = rig.joints;
  let i = 0;
  while (j['seg' + i]) {
    j['seg' + i].rotation.y += Math.sin(phase * freq + i * 0.8) * amp;
    i++;
  }
}

function _flapWings(joints, phase, amp, freq) {
  const f = Math.sin(phase * freq) * amp;
  if (joints.wingR) joints.wingR.rotation.z += -f;
  if (joints.wingL) joints.wingL.rotation.z += f;
}

// makeCreatureRig(THREE, archetype, fam) -> { group, rig }
// Escape hatch for advanced callers who want the rig but their own meshes.
export function makeCreatureRig(THREE, archetype, fam = {}) {
  const builder = _BUILDERS[archetype] || _buildBiped;
  return builder(THREE, Object.assign({ archetype }, fam), _rng(_hashFamily(archetype)));
}

// END mChatAI Web Component: models.procedural-creatures-3d
