// BEGIN mChatAI Web Component: models.lowpoly-characters-3d
//
// Procedural low-poly three.js model builders (characters). Each builder is
// buildX(THREE, opts) -> THREE.Group (THREE passed in; dependency-free + offline).
// Ready-made models so games use real shapes instead of bare blocks.
//

// ===== shared helpers (assume hoisted alongside builders) =====

/** Resolve opts.color (hex int OR [r,g,b] 0-1 OR 0-255) to a hex int; fall back to def. */
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

/** Standard low-poly material: flatShading, matte, optional emissive glow. */
function _mat(THREE, hex, opts) {
  opts = opts || {};
  return new THREE.MeshStandardMaterial({
    color: hex,
    flatShading: true,
    roughness: opts.roughness != null ? opts.roughness : 0.7,
    metalness: opts.metalness != null ? opts.metalness : 0.1,
    emissive: opts.emissive != null ? opts.emissive : 0x000000,
    emissiveIntensity: opts.emissiveIntensity != null ? opts.emissiveIntensity : 1,
    side: opts.side || THREE.FrontSide
  });
}

/**
 * buildRobot — blocky low-poly humanoid robot usable as a player character.
 * Parts: head (+visor +antenna), torso (+chest light), two arms, two legs.
 * opts: color (body hex/[r,g,b]), accent (limbs/trim), scale.
 */
export function buildRobot(THREE, opts = {}) {
  const g = new THREE.Group();
  g.name = 'Robot';
  const body = _resolveColor(THREE, opts.color, 0x5b8fb9);
  const accent = _resolveColor(THREE, opts.accent, 0x2b3a4a);
  const metal = 0x9aa6b2;
  const bodyMat = _mat(THREE, body, { metalness: 0.35, roughness: 0.5 });
  const accentMat = _mat(THREE, accent, { metalness: 0.4, roughness: 0.5 });
  const metalMat = _mat(THREE, metal, { metalness: 0.6, roughness: 0.4 });
  const eyeMat = _mat(THREE, 0x66ffcc, { emissive: 0x33ffbb, emissiveIntensity: 1.4, roughness: 0.3 });

  // torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 0.5), bodyMat);
  torso.name = 'torso'; torso.position.y = 1.1; g.add(torso);
  // chest light
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 8), eyeMat);
  chest.name = 'chestLight'; chest.rotation.x = Math.PI / 2;
  chest.position.set(0, 1.25, 0.27); g.add(chest);
  // pelvis
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.45), accentMat);
  pelvis.name = 'pelvis'; pelvis.position.y = 0.55; g.add(pelvis);

  // head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 0.55), bodyMat);
  head.name = 'head'; head.position.y = 1.95; g.add(head);
  // visor / eyes
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.08), eyeMat);
  visor.name = 'visor'; visor.position.set(0, 2.0, 0.29); g.add(visor);
  // antenna
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 6), metalMat);
  antenna.name = 'antenna'; antenna.position.set(0, 2.45, 0); g.add(antenna);
  const antTip = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), eyeMat);
  antTip.name = 'antennaTip'; antTip.position.set(0, 2.65, 0); g.add(antTip);

  // arms (shoulder, upper, hand)
  function makeArm(dir, label) {
    const arm = new THREE.Group(); arm.name = 'arm' + label;
    const shoulder = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), metalMat);
    shoulder.name = 'shoulder'; arm.add(shoulder);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.85, 0.24), accentMat);
    upper.name = 'upperArm'; upper.position.y = -0.5; arm.add(upper);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.3), metalMat);
    hand.name = 'hand'; hand.position.y = -1.0; arm.add(hand);
    arm.position.set(0.65 * dir, 1.5, 0);
    return arm;
  }
  g.add(makeArm(1, 'R'));
  g.add(makeArm(-1, 'L'));

  // legs (thigh, foot)
  function makeLeg(dir, label) {
    const leg = new THREE.Group(); leg.name = 'leg' + label;
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.95, 0.32), bodyMat);
    thigh.name = 'thigh'; thigh.position.y = -0.45; leg.add(thigh);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.5), accentMat);
    foot.name = 'foot'; foot.position.set(0, -0.95, 0.08); leg.add(foot);
    leg.position.set(0.22 * dir, 0.45, 0);
    return leg;
  }
  g.add(makeLeg(1, 'R'));
  g.add(makeLeg(-1, 'L'));

  g.scale.setScalar(opts.scale != null ? opts.scale : 1);
  return g;
}

/**
 * buildDrone — hovering enemy: central core, a spinning rotor ring with blades,
 * a single forward-facing glowing eye, and underslung sensor stalks.
 * opts: color (core hex/[r,g,b]), eyeColor, scale. userData.rotor = ring group (spin it).
 */
export function buildDrone(THREE, opts = {}) {
  const g = new THREE.Group();
  g.name = 'Drone';
  const core = _resolveColor(THREE, opts.color, 0x3a3f4b);
  const eyeHex = _resolveColor(THREE, opts.eyeColor, 0xff3b3b);
  const coreMat = _mat(THREE, core, { metalness: 0.5, roughness: 0.4 });
  const trimMat = _mat(THREE, 0x70757f, { metalness: 0.6, roughness: 0.35 });
  const eyeMat = _mat(THREE, eyeHex, { emissive: eyeHex, emissiveIntensity: 1.6, roughness: 0.25 });

  // core body
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), coreMat);
  body.name = 'core'; g.add(body);
  // top cap
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.35, 6), coreMat);
  cap.name = 'cap'; cap.position.y = 0.45; g.add(cap);

  // glowing eye (forward = -Z)
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), eyeMat);
  eye.name = 'eye'; eye.position.set(0, 0.0, -0.45); g.add(eye);
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.1), trimMat);
  brow.name = 'brow'; brow.position.set(0, 0.18, -0.42); g.add(brow);

  // rotor ring (spin via userData.rotor.rotation.y)
  const rotor = new THREE.Group(); rotor.name = 'rotor';
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.07, 6, 16), trimMat);
  ring.name = 'ring'; ring.rotation.x = Math.PI / 2; rotor.add(ring);
  const bladeMat = _mat(THREE, 0xc8ccd2, { metalness: 0.5, roughness: 0.4 });
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.03, 0.12), bladeMat);
    blade.name = 'blade' + i;
    const a = (i / 4) * Math.PI * 2;
    blade.position.set(Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7);
    blade.rotation.y = -a;
    rotor.add(blade);
  }
  rotor.position.y = 0.05;
  g.add(rotor);

  // underslung sensor stalks
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 5), trimMat);
    stalk.name = 'stalk' + i;
    stalk.position.set(Math.cos(a) * 0.25, -0.45, Math.sin(a) * 0.25);
    g.add(stalk);
    const tip = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), eyeMat);
    tip.name = 'stalkTip' + i;
    tip.position.set(Math.cos(a) * 0.25, -0.6, Math.sin(a) * 0.25);
    g.add(tip);
  }

  g.userData.rotor = rotor;
  g.scale.setScalar(opts.scale != null ? opts.scale : 1);
  return g;
}

/**
 * buildAlienShip — classic low-poly UFO: flat saucer disc, glass dome with pilot
 * nub, and a ring of glowing under-lights.
 * opts: color (hull hex/[r,g,b]), domeColor, lightColor, lights (count), scale.
 */
export function buildAlienShip(THREE, opts = {}) {
  const g = new THREE.Group();
  g.name = 'AlienShip';
  const hull = _resolveColor(THREE, opts.color, 0x8a93a0);
  const domeHex = _resolveColor(THREE, opts.domeColor, 0x66ddff);
  const lightHex = _resolveColor(THREE, opts.lightColor, 0xffe066);
  const hullMat = _mat(THREE, hull, { metalness: 0.65, roughness: 0.3 });
  const rimMat = _mat(THREE, 0x4a5360, { metalness: 0.7, roughness: 0.3 });
  const domeMat = new THREE.MeshStandardMaterial({
    color: domeHex, flatShading: true, roughness: 0.1, metalness: 0.2,
    transparent: true, opacity: 0.7, emissive: domeHex, emissiveIntensity: 0.3
  });
  const lightMat = _mat(THREE, lightHex, { emissive: lightHex, emissiveIntensity: 1.5, roughness: 0.3 });

  // saucer (two opposed shallow cones -> lens disc)
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 0.45, 0.4, 16), hullMat);
  top.name = 'saucerTop'; top.position.y = 0.1; g.add(top);
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 1.4, 0.4, 16), hullMat);
  bottom.name = 'saucerBottom'; bottom.position.y = -0.3; g.add(bottom);
  // rim band
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.1, 6, 20), rimMat);
  rim.name = 'rim'; rim.rotation.x = Math.PI / 2; rim.position.y = -0.1; g.add(rim);

  // dome
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
  dome.name = 'dome'; dome.position.y = 0.3; g.add(dome);
  // pilot nub
  const pilot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), _mat(THREE, 0x6fdc6f, { roughness: 0.5 }));
  pilot.name = 'pilot'; pilot.position.y = 0.45; g.add(pilot);

  // under-lights ring
  const n = opts.lights != null ? opts.lights : 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), lightMat);
    light.name = 'light' + i;
    light.position.set(Math.cos(a) * 1.05, -0.35, Math.sin(a) * 1.05);
    g.add(light);
  }

  g.scale.setScalar(opts.scale != null ? opts.scale : 1);
  return g;
}

/**
 * buildSlime — wobbly gelatinous blob enemy: a low-detail translucent dome body
 * with two googly eyes. Animate squash via userData.body (scale.y).
 * opts: color (body hex/[r,g,b]), scale.
 */
export function buildSlime(THREE, opts = {}) {
  const g = new THREE.Group();
  g.name = 'Slime';
  const bodyHex = _resolveColor(THREE, opts.color, 0x5fd35f);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: bodyHex, flatShading: true, roughness: 0.35, metalness: 0.0,
    transparent: true, opacity: 0.85, emissive: bodyHex, emissiveIntensity: 0.15
  });
  const whiteMat = _mat(THREE, 0xffffff, { roughness: 0.4 });
  const pupilMat = _mat(THREE, 0x111319, { roughness: 0.5 });

  // blob body — squashed low-poly icosahedron
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), bodyMat);
  body.name = 'body'; body.scale.set(1.0, 0.75, 1.0); body.position.y = 0.5; g.add(body);
  // base puddle skirt
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.85, 0.18, 12), bodyMat);
  skirt.name = 'skirt'; skirt.position.y = 0.12; g.add(skirt);

  // eyes (forward = -Z)
  function makeEye(dir) {
    const eye = new THREE.Group(); eye.name = 'eye';
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), whiteMat);
    white.name = 'white'; eye.add(white);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), pupilMat);
    pupil.name = 'pupil'; pupil.position.z = -0.11; eye.add(pupil);
    eye.position.set(0.22 * dir, 0.62, -0.5);
    return eye;
  }
  g.add(makeEye(1));
  g.add(makeEye(-1));

  g.userData.body = body;
  g.scale.setScalar(opts.scale != null ? opts.scale : 1);
  return g;
}

/**
 * buildBird — low-poly bird (cone body, triangle wings, flared tail) lifted &
 * generalized from the Murmuration boids artifact. Forward = -Z (matches lookAt).
 * Flap by rotating userData.wingR/.wingL about Z. opts: color (hex/[r,g,b]), scale.
 */
export function buildBird(THREE, opts = {}) {
  const g = new THREE.Group();
  g.name = 'Bird';
  const bodyHex = _resolveColor(THREE, opts.color, 0x394b66);
  const mat = new THREE.MeshStandardMaterial({
    color: bodyHex, flatShading: true, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide
  });
  const beakMat = _mat(THREE, _resolveColor(THREE, opts.beakColor, 0xffa83b), { roughness: 0.6 });
  const eyeMat = _mat(THREE, 0x111319, { roughness: 0.5 });

  // body — cone, nose toward -Z (forward)
  const bodyGeo = new THREE.ConeGeometry(0.45, 2.1, 5);
  bodyGeo.rotateX(-Math.PI / 2);
  const body = new THREE.Mesh(bodyGeo, mat); body.name = 'body'; g.add(body);

  // wings — flat triangles, pivoted at the shoulder so flapping looks right
  function makeWing(dir) {
    const t = 1.9 * dir;
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(
      [0, 0, -0.6, 0, 0, 0.8, t, 0.05, -0.05], 3));
    wg.computeVertexNormals();
    return wg;
  }
  const wingR = new THREE.Mesh(makeWing(1), mat); wingR.name = 'wingR'; g.add(wingR);
  const wingL = new THREE.Mesh(makeWing(-1), mat); wingL.name = 'wingL'; g.add(wingL);

  // tail — flared cone at the rear (+Z)
  const tailGeo = new THREE.ConeGeometry(0.5, 0.9, 4);
  tailGeo.rotateX(Math.PI / 2);
  const tail = new THREE.Mesh(tailGeo, mat); tail.name = 'tail';
  tail.position.z = 1.05; tail.scale.set(1, 0.4, 1); g.add(tail);

  // beak — small cone at the nose (-Z)
  const beakGeo = new THREE.ConeGeometry(0.12, 0.4, 4);
  beakGeo.rotateX(-Math.PI / 2);
  const beak = new THREE.Mesh(beakGeo, beakMat); beak.name = 'beak';
  beak.position.z = -1.15; g.add(beak);

  // eyes
  for (const dir of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), eyeMat);
    eye.name = 'eye'; eye.position.set(0.16 * dir, 0.12, -0.7); g.add(eye);
  }

  g.userData.wingR = wingR;
  g.userData.wingL = wingL;
  g.scale.setScalar(opts.scale != null ? opts.scale : 1);
  return g;
}

// END mChatAI Web Component: models.lowpoly-characters-3d
