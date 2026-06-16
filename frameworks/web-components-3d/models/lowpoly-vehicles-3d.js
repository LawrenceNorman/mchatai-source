// BEGIN mChatAI Web Component: models.lowpoly-vehicles-3d
//
// Procedural low-poly three.js model builders (vehicles). Each builder is
// buildX(THREE, opts) -> THREE.Group (THREE passed in; dependency-free + offline).
// Ready-made models so games use real shapes instead of bare blocks.
//

/* ============================================================================
 * mChatAI web-components-3d — VEHICLES batch
 * Procedural low-poly three.js model builders.
 * Each builder: buildX(THREE, opts = {}) -> THREE.Group
 *   - THREE is passed in (dependency-free / offline-safe — never import three)
 *   - MeshStandardMaterial + flatShading:true for clean low-poly look
 *   - opts.color : hex int (0xRRGGBB) OR [r,g,b] in 0..1 OR 0..255 — primary tint
 *   - opts.scale : number — uniform scale (default 1)
 * ==========================================================================*/

/* ---- shared helpers (not exported) ------------------------------------- */

// Normalize opts.color into a hex int. Accepts hex int, [r,g,b] (0..1 or 0..255).
// Falls back to `def` when color is absent/invalid.
function _vColor(color, def) {
  if (color == null) return def;
  if (typeof color === 'number') return color;
  if (Array.isArray(color) && color.length >= 3) {
    let r = color[0], g = color[1], b = color[2];
    const max = Math.max(r, g, b);
    if (max <= 1.0) { r *= 255; g *= 255; b *= 255; } // 0..1 -> 0..255
    r = Math.max(0, Math.min(255, Math.round(r)));
    g = Math.max(0, Math.min(255, Math.round(g)));
    b = Math.max(0, Math.min(255, Math.round(b)));
    return (r << 16) | (g << 8) | b;
  }
  return def;
}

// Quick flat-shaded standard material.
function _vMat(THREE, color, roughness, metalness) {
  return new THREE.MeshStandardMaterial({
    color: color,
    flatShading: true,
    roughness: roughness == null ? 0.7 : roughness,
    metalness: metalness == null ? 0.0 : metalness
  });
}

// A billowing low-poly sail: convex 3-triangle fan from a bulged centroid.
// (Lifted + generalized from the landed sunset-ocean artifact's makeSail.)
function _vSail(THREE, A, B, C, bulge) {
  const M = [
    (A[0] + B[0] + C[0]) / 3 + bulge,
    (A[1] + B[1] + C[1]) / 3,
    (A[2] + B[2] + C[2]) / 3
  ];
  const verts = [].concat(A, B, M,  B, C, M,  C, A, M);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------------ */
/**
 * buildSpaceship — sleek low-poly fighter: tapered fuselage, two swept delta
 * wings, a tinted cockpit canopy, twin fins and a glowing engine nozzle.
 * opts.color = hull tint (default steel blue). opts.scale = uniform scale.
 * @param {object} THREE three.js namespace (passed in)
 * @param {object} [opts] {color, scale}
 * @returns {THREE.Group}
 */
export function buildSpaceship(THREE, opts = {}) {
  const g = new THREE.Group();
  g.name = 'spaceship';
  const hullColor = _vColor(opts.color, 0x9aa6b4);
  const hullMat   = _vMat(THREE, hullColor, 0.5, 0.35);
  const accentMat = _vMat(THREE, 0xd24b3a, 0.55, 0.2);   // wing/fin trim
  const glassMat  = new THREE.MeshStandardMaterial({
    color: 0x3fd0ff, flatShading: true, roughness: 0.15,
    metalness: 0.1, emissive: 0x123a55, emissiveIntensity: 0.6
  });
  const glowMat   = new THREE.MeshStandardMaterial({
    color: 0x66e0ff, flatShading: true, roughness: 0.4,
    emissive: 0x33c9ff, emissiveIntensity: 1.3
  });

  // Fuselage: a stretched, sharply-tapered nose cone + cylindrical body.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.2, 8), hullMat);
  nose.name = 'nose';
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 1.6;
  g.add(nose);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 2.4, 8), hullMat);
  body.name = 'fuselage';
  body.rotation.x = Math.PI / 2;
  body.position.z = -0.4;
  g.add(body);

  // Cockpit canopy: a half-icosa bubble on the spine.
  const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), glassMat);
  canopy.name = 'cockpit';
  canopy.scale.set(1.0, 0.7, 1.5);
  canopy.position.set(0, 0.34, 0.55);
  g.add(canopy);

  // Swept delta wings (mirrored). Built as a thin tapered box, angled back.
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 1.5), hullMat);
    wing.name = 'wing-' + (side < 0 ? 'L' : 'R');
    wing.position.set(side * 1.35, -0.05, -0.45);
    wing.rotation.y = side * -0.42;   // sweep back
    wing.rotation.z = side * 0.12;    // slight dihedral
    g.add(wing);

    // Wing-tip accent stripe.
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.5), accentMat);
    tip.name = 'wingtip-' + (side < 0 ? 'L' : 'R');
    tip.position.set(side * 2.35, -0.05, -0.95);
    g.add(tip);
  }

  // Twin tail fins.
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.0, 4), accentMat);
    fin.name = 'fin-' + (side < 0 ? 'L' : 'R');
    fin.scale.set(0.35, 1.0, 1.0);
    fin.position.set(side * 0.4, 0.45, -1.35);
    fin.rotation.z = side * -0.25;
    g.add(fin);
  }

  // Engine nozzle + glow at the tail.
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.6, 8), _vMat(THREE, 0x2b2f36, 0.4, 0.6));
  nozzle.name = 'nozzle';
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.z = -1.7;
  g.add(nozzle);

  const glow = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.1, 8), glowMat);
  glow.name = 'engineGlow';
  glow.rotation.x = -Math.PI / 2;   // flame points backward
  glow.position.z = -2.35;
  g.add(glow);

  g.scale.setScalar(opts.scale == null ? 1 : opts.scale);
  return g;
}

/* ------------------------------------------------------------------------ */
/**
 * buildPlane — low-poly prop/jet plane: cylindrical fuselage, main wings,
 * horizontal + vertical tail surfaces, a cockpit window, and a spinning-ready
 * nose propeller (named "propeller" so callers can rotate it).
 * opts.color = body tint (default cream). opts.scale = uniform scale.
 * @param {object} THREE three.js namespace (passed in)
 * @param {object} [opts] {color, scale}
 * @returns {THREE.Group}
 */
export function buildPlane(THREE, opts = {}) {
  const g = new THREE.Group();
  g.name = 'plane';
  const bodyColor = _vColor(opts.color, 0xe8e2d0);
  const bodyMat   = _vMat(THREE, bodyColor, 0.6, 0.1);
  const wingMat   = _vMat(THREE, 0xc8412f, 0.6, 0.1);   // red wings/tail
  const metalMat  = _vMat(THREE, 0x40454d, 0.4, 0.6);
  const glassMat  = new THREE.MeshStandardMaterial({
    color: 0x8fd0ff, flatShading: true, roughness: 0.2,
    metalness: 0.1, emissive: 0x12303f, emissiveIntensity: 0.4
  });

  // Fuselage + tapered tail.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.5, 3.6, 10), bodyMat);
  body.name = 'fuselage';
  body.rotation.x = Math.PI / 2;
  body.position.z = -0.2;
  g.add(body);

  const tailCone = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 10), bodyMat);
  tailCone.name = 'tailCone';
  tailCone.rotation.x = -Math.PI / 2;   // taper toward the rear
  tailCone.position.z = -2.4;
  g.add(tailCone);

  const noseCone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.7, 10), bodyMat);
  noseCone.name = 'nose';
  noseCone.rotation.x = Math.PI / 2;
  noseCone.position.z = 1.95;
  g.add(noseCone);

  // Cockpit window.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), glassMat);
  canopy.name = 'cockpit';
  canopy.scale.set(0.9, 0.7, 1.3);
  canopy.position.set(0, 0.4, 0.55);
  g.add(canopy);

  // Main wings: one long thin tapered box across the body.
  const wings = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.14, 1.1), wingMat);
  wings.name = 'wings';
  wings.position.set(0, 0.0, 0.2);
  g.add(wings);

  // Horizontal stabilizer (tail wing).
  const hStab = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 0.6), wingMat);
  hStab.name = 'hStab';
  hStab.position.set(0, 0.1, -2.55);
  g.add(hStab);

  // Vertical stabilizer (tail fin).
  const vStab = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.95, 0.9), wingMat);
  vStab.name = 'vStab';
  vStab.position.set(0, 0.55, -2.55);
  g.add(vStab);

  // Prop hub + 2-blade propeller (named "propeller" for animation).
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.22, 8), metalMat);
  hub.name = 'propHub';
  hub.rotation.x = Math.PI / 2;
  hub.position.z = 2.32;
  g.add(hub);

  const prop = new THREE.Group();
  prop.name = 'propeller';
  prop.position.z = 2.42;
  for (let i = 0; i < 2; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.7, 0.06), metalMat);
    blade.rotation.z = i * (Math.PI / 2);
    prop.add(blade);
  }
  g.add(prop);

  g.scale.setScalar(opts.scale == null ? 1 : opts.scale);
  return g;
}

/* ------------------------------------------------------------------------ */
/**
 * buildKart — chunky low-poly go-kart: flat chassis, nose cone, 4 cylinder
 * wheels (named wheelFL/FR/RL/RR so callers can spin them), a bucket seat,
 * steering wheel and a simple driver nub (head + torso).
 * opts.color = chassis tint (default racing yellow). opts.scale = uniform scale.
 * @param {object} THREE three.js namespace (passed in)
 * @param {object} [opts] {color, scale}
 * @returns {THREE.Group}
 */
export function buildKart(THREE, opts = {}) {
  const g = new THREE.Group();
  g.name = 'kart';
  const chassisColor = _vColor(opts.color, 0xf2c014);
  const chassisMat   = _vMat(THREE, chassisColor, 0.55, 0.2);
  const tireMat      = _vMat(THREE, 0x1c1c20, 0.85, 0.0);
  const rimMat       = _vMat(THREE, 0xcfd4da, 0.4, 0.6);
  const seatMat      = _vMat(THREE, 0x2b2f36, 0.7, 0.1);
  const skinMat      = _vMat(THREE, 0xe0a878, 0.8, 0.0);
  const shirtMat     = _vMat(THREE, 0x2f7de0, 0.7, 0.0);

  // Chassis / floor pan.
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 2.7), chassisMat);
  chassis.name = 'chassis';
  chassis.position.y = 0.42;
  g.add(chassis);

  // Pointed front nose.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 4), chassisMat);
  nose.name = 'nose';
  nose.scale.set(1.3, 1.0, 0.7);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.42, 1.65);
  g.add(nose);

  // Side pods.
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 1.4), chassisMat);
    pod.name = 'pod-' + (side < 0 ? 'L' : 'R');
    pod.position.set(side * 0.95, 0.45, 0.0);
    g.add(pod);
  }

  // Rear wing.
  const rearWing = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.4), chassisMat);
  rearWing.name = 'rearWing';
  rearWing.position.set(0, 1.0, -1.35);
  g.add(rearWing);
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), seatMat);
    strut.position.set(side * 0.45, 0.75, -1.35);
    g.add(strut);
  }

  // 4 wheels (front pair slightly smaller). Named for spin animation.
  const wheelDefs = [
    ['wheelFL', -0.92, 0.95, 0.34],
    ['wheelFR',  0.92, 0.95, 0.34],
    ['wheelRL', -0.95, -1.0, 0.42],
    ['wheelRR',  0.95, -1.0, 0.42]
  ];
  for (const [name, x, z, r] of wheelDefs) {
    const wheel = new THREE.Group();
    wheel.name = name;
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.34, 10), tireMat);
    tire.rotation.z = Math.PI / 2;   // axle runs along X
    wheel.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, 0.36, 8), rimMat);
    rim.rotation.z = Math.PI / 2;
    wheel.add(rim);
    wheel.position.set(x, r, z);
    g.add(wheel);
  }

  // Bucket seat.
  const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.7), seatMat);
  seatBase.name = 'seat';
  seatBase.position.set(0, 0.65, -0.55);
  g.add(seatBase);
  const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.16), seatMat);
  seatBack.name = 'seatBack';
  seatBack.position.set(0, 0.95, -0.9);
  g.add(seatBack);

  // Steering column + wheel.
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), seatMat);
  column.name = 'steeringColumn';
  column.rotation.x = 0.5;
  column.position.set(0, 0.85, 0.45);
  g.add(column);
  const steering = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 12), seatMat);
  steering.name = 'steeringWheel';
  steering.rotation.x = 1.0;
  steering.position.set(0, 1.08, 0.65);
  g.add(steering);

  // Driver nub: torso + head.
  const driver = new THREE.Group();
  driver.name = 'driver';
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.7, 8), shirtMat);
  torso.position.set(0, 1.05, -0.5);
  driver.add(torso);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 0), skinMat);
  head.position.set(0, 1.55, -0.5);
  driver.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.27, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), chassisMat);
  helmet.position.set(0, 1.6, -0.5);
  driver.add(helmet);
  g.add(driver);

  g.scale.setScalar(opts.scale == null ? 1 : opts.scale);
  return g;
}

/* ------------------------------------------------------------------------ */
/**
 * buildBoat — small low-poly sailboat: pointed-bow V-bottom hull, waterline
 * stripe, deck cabin, mast + boom, a billowing main sail + jib and a masthead
 * pennant. Geometry lifted + generalized from the landed sunset-ocean artifact.
 * Modeled deck-relative so the hull bottom sits near y=0.
 * opts.color = hull tint (default warm wood). opts.scale = uniform scale.
 * @param {object} THREE three.js namespace (passed in)
 * @param {object} [opts] {color, scale}
 * @returns {THREE.Group}
 */
export function buildBoat(THREE, opts = {}) {
  const boat = new THREE.Group();
  boat.name = 'boat';
  const hullColor = _vColor(opts.color, 0x9a4226);

  // Hull: a box reshaped into a pointed-bow, V-bottom hull.
  const hullGeo = new THREE.BoxGeometry(3.2, 1.7, 8.4, 1, 1, 1);
  const hp = hullGeo.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    let x = hp.getX(i), y = hp.getY(i); const z = hp.getZ(i);
    if (z > 4.0)       { x = 0; y += 0.55; }  // pointed, slightly raised bow
    else if (z < -4.0) { x *= 0.78; }          // narrower transom
    if (y < 0)         { x *= 0.45; }          // V-shaped bottom
    hp.setXYZ(i, x, y, z);
  }
  hullGeo.computeVertexNormals();
  const hull = new THREE.Mesh(hullGeo, _vMat(THREE, hullColor, 0.85));
  hull.name = 'hull';
  hull.position.y = 0.55;
  boat.add(hull);

  // Waterline stripe / deck.
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.25, 0.35, 8.0), _vMat(THREE, 0xf2efe6, 0.7));
  stripe.name = 'deck';
  stripe.position.y = 1.15;
  boat.add(stripe);

  // Deck cabin.
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.0, 2.6), _vMat(THREE, 0xd9b98c, 0.7));
  cabin.name = 'cabin';
  cabin.position.set(0, 1.85, -1.4);
  boat.add(cabin);

  // Mast + boom.
  const woodMat = _vMat(THREE, 0x6b4a2f, 0.7);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 9.4, 6), woodMat);
  mast.name = 'mast';
  mast.position.set(0, 5.4, 0.4);
  boat.add(mast);

  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.8, 6), woodMat);
  boom.name = 'boom';
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, 2.7, -0.6);
  boat.add(boom);

  // Sails.
  const sailMat = new THREE.MeshStandardMaterial({ color: 0xfff4e6, flatShading: true, roughness: 0.9, side: THREE.DoubleSide });
  const mainSail = new THREE.Mesh(_vSail(THREE, [0, 9.6, 0.3], [0, 2.7, 2.1], [0, 2.7, -1.4], 0.95), sailMat);
  mainSail.name = 'mainSail';
  boat.add(mainSail);
  const jib = new THREE.Mesh(_vSail(THREE, [0, 7.4, 0.7], [0, 2.6, 4.4], [0, 2.6, 0.6], 0.6), sailMat);
  jib.name = 'jib';
  boat.add(jib);

  // Masthead pennant.
  const flag = new THREE.Mesh(
    _vSail(THREE, [0, 10.0, 0.4], [0, 9.3, 1.7], [0, 9.0, 0.4], 0.05),
    new THREE.MeshStandardMaterial({ color: 0xe24b4b, flatShading: true, roughness: 0.9, side: THREE.DoubleSide })
  );
  flag.name = 'pennant';
  boat.add(flag);

  boat.scale.setScalar(opts.scale == null ? 1 : opts.scale);
  return boat;
}


// END mChatAI Web Component: models.lowpoly-vehicles-3d
