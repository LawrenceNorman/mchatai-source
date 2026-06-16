// BEGIN mChatAI Web Component: models.lowpoly-props-3d
//
// Procedural low-poly three.js model builders (props). Each builder is
// buildX(THREE, opts) -> THREE.Group (THREE passed in; dependency-free + offline).
// Ready-made models so games use real shapes instead of bare blocks.
//

// ============================================================================
// props-nature: procedural low-poly three.js model builders.
//
// Each builder is buildX(THREE, opts = {}) -> THREE.Group. THREE is passed in
// (never imported) so the module is dependency-free and offline-safe. Models
// use MeshStandardMaterial({ flatShading: true }) for a clean faceted look,
// are composed from a few named primitive parts, centered near the origin,
// and sit at a sensible default scale of ~1 unit. Every builder honors
// opts.color (hex int OR [r,g,b] 0-255) and opts.scale (number).
// ASCII only. Pure builders: no top-level execution, no DOM.
// ============================================================================

// ---------- shared helpers (closed over by the builders) ----------

// Normalize a color opt into a hex int usable by THREE.Color.
//   - undefined        -> fallback
//   - hex int (0xRRGGBB) passes through
//   - [r,g,b] 0-255    -> packed hex int
function _hex(color, fallback) {
  if (color === undefined || color === null) return fallback;
  if (Array.isArray(color)) {
    var r = Math.max(0, Math.min(255, color[0] | 0));
    var g = Math.max(0, Math.min(255, color[1] | 0));
    var b = Math.max(0, Math.min(255, color[2] | 0));
    return (r << 16) | (g << 8) | b;
  }
  return color;
}

// Tint a hex int by a multiplier k (e.g. 0.7 darker, 1.2 lighter), clamped.
function _tint(hex, k) {
  var r = Math.max(0, Math.min(255, Math.round(((hex >> 16) & 255) * k)));
  var g = Math.max(0, Math.min(255, Math.round(((hex >> 8) & 255) * k)));
  var b = Math.max(0, Math.min(255, Math.round((hex & 255) * k)));
  return (r << 16) | (g << 8) | b;
}

// Build a flat-shaded MeshStandardMaterial (the low-poly look for this catalog).
function _mat(THREE, hex, extra) {
  var def = { color: hex, flatShading: true, roughness: 0.85, metalness: 0.0 };
  if (extra) for (var k in extra) def[k] = extra[k];
  return new THREE.MeshStandardMaterial(def);
}

// Make a named mesh from a geometry + material.
function _part(geo, mat, name) {
  var m = new (mat.constructor === Function ? mat : Object).constructor; // unused guard
  return m;
}

// Apply uniform scale from opts to a group, defaulting to 1.
function _applyScale(group, opts) {
  var s = (opts && typeof opts.scale === 'number' && opts.scale > 0) ? opts.scale : 1;
  group.scale.setScalar(s);
  return group;
}

// ----------------------------------------------------------------------------

/**
 * buildTree(THREE, opts) -> Group. Low-poly conifer: a tapered cylinder trunk
 * plus 2-3 stacked cone foliage tiers. opts: { color (foliage), trunkColor,
 * tiers (2|3, default 3), scale }.
 */
export function buildTree(THREE, opts) {
  opts = opts || {};
  var group = new THREE.Group();
  group.name = 'tree';

  var foliageHex = _hex(opts.color, 0x3f8c4a);
  var trunkHex = _hex(opts.trunkColor, 0x6b4a2b);
  var tiers = (opts.tiers === 2) ? 2 : 3;

  // Trunk: slightly tapered cylinder.
  var trunkH = 0.7;
  var trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.18, trunkH, 6),
    _mat(THREE, trunkHex, { roughness: 0.95 })
  );
  trunk.name = 'trunk';
  trunk.position.y = trunkH / 2;
  group.add(trunk);

  // Foliage: stacked cones, each smaller and higher than the last.
  var baseY = trunkH - 0.05;
  var tierH = 0.7;
  var overlap = 0.42; // each tier overlaps the one below for a full silhouette
  for (var i = 0; i < tiers; i++) {
    var t = i / Math.max(1, tiers - 1);          // 0..1 bottom->top
    var radius = 0.62 - 0.18 * i;
    var cone = new THREE.Mesh(
      new THREE.ConeGeometry(radius, tierH, 7),
      _mat(THREE, _tint(foliageHex, 0.9 + 0.12 * i)) // top tiers slightly brighter
    );
    cone.name = 'foliage_' + i;
    cone.position.y = baseY + i * (tierH - overlap) + tierH / 2;
    group.add(cone);
  }

  return _applyScale(group, opts);
}

/**
 * buildRock(THREE, opts) -> Group. A single jittered icosahedron boulder.
 * Per-vertex random displacement breaks the regular facets into an organic
 * low-poly rock. opts: { color, scale, seed, jitter (0..1, default 0.22) }.
 */
export function buildRock(THREE, opts) {
  opts = opts || {};
  var group = new THREE.Group();
  group.name = 'rock';

  var hex = _hex(opts.color, 0x8b8c8f);
  var jitter = (typeof opts.jitter === 'number') ? opts.jitter : 0.22;

  var geo = new THREE.IcosahedronGeometry(0.55, 0);
  // Deterministic per-vertex jitter (seeded LCG) so a rock looks identical each load.
  var seed = (typeof opts.seed === 'number' ? opts.seed : 1337) >>> 0;
  function rand() { seed = (seed * 1664525 + 1013904223) & 0x7fffffff; return seed / 0x7fffffff; }
  var pos = geo.attributes.position;
  for (var i = 0; i < pos.count; i++) {
    var f = 1 + (rand() - 0.5) * jitter;
    // squash slightly on Y so it reads as a grounded boulder, not a ball
    pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * 0.78, pos.getZ(i) * f);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  var rock = new THREE.Mesh(geo, _mat(THREE, hex, { roughness: 1.0 }));
  rock.name = 'boulder';
  rock.position.y = 0.3; // rest on the ground plane
  group.add(rock);

  return _applyScale(group, opts);
}

/**
 * buildCrate(THREE, opts) -> Group. Wooden supply crate: a box body plus a
 * darker edge frame (12 thin beams) for the classic banded-crate read.
 * opts: { color (wood), frameColor, scale }.
 */
export function buildCrate(THREE, opts) {
  opts = opts || {};
  var group = new THREE.Group();
  group.name = 'crate';

  var woodHex = _hex(opts.color, 0xb5853f);
  var frameHex = _hex(opts.frameColor, _tint(woodHex, 0.55));
  var s = 0.8;             // body edge length
  var t = 0.07;            // frame beam thickness
  var half = s / 2;

  var body = new THREE.Mesh(
    new THREE.BoxGeometry(s, s, s),
    _mat(THREE, woodHex, { roughness: 0.9 })
  );
  body.name = 'body';
  group.add(body);

  // 12 edge beams of a cube. Each edge: pick which axis it runs along.
  var frameMat = _mat(THREE, frameHex, { roughness: 0.8 });
  var longGeo = new THREE.BoxGeometry(s + 0.001, t, t); // runs along X (reused/rotated)
  var ei = 0;
  function beam(px, py, pz, axis) {
    var m = new THREE.Mesh(longGeo, frameMat);
    if (axis === 'y') m.rotation.z = Math.PI / 2;
    else if (axis === 'z') m.rotation.y = Math.PI / 2;
    m.position.set(px, py, pz);
    m.name = 'frame_' + (ei++);
    group.add(m);
  }
  // 4 edges along each of the 3 axes (at the +/- corners of the other two axes)
  var corners = [[-half, -half], [-half, half], [half, -half], [half, half]];
  for (var c = 0; c < 4; c++) {
    var a = corners[c][0], b = corners[c][1];
    beam(0, a, b, 'x'); // edges parallel to X
    beam(a, 0, b, 'y'); // edges parallel to Y
    beam(a, b, 0, 'z'); // edges parallel to Z
  }

  return _applyScale(group, opts);
}

/**
 * buildBarrel(THREE, opts) -> Group. Bulged wooden barrel (lathe-style profile)
 * with two darker metal hoop bands near top and bottom. opts: { color (wood),
 * bandColor, scale }.
 */
export function buildBarrel(THREE, opts) {
  opts = opts || {};
  var group = new THREE.Group();
  group.name = 'barrel';

  var woodHex = _hex(opts.color, 0x9c6b34);
  var bandHex = _hex(opts.bandColor, 0x4a4a4f);
  var seg = 10;            // radial segments (low-poly)
  var h = 0.9;

  // Lathe profile: a slight outward bulge in the middle for the barrel belly.
  var pts = [];
  var profile = [
    [0.30, 0.0],   // bottom edge
    [0.36, 0.18],
    [0.40, 0.45],  // belly (max radius)
    [0.36, 0.72],
    [0.30, 0.9],   // top edge
  ];
  for (var i = 0; i < profile.length; i++) {
    pts.push(new THREE.Vector2(profile[i][0], profile[i][1]));
  }
  var body = new THREE.Mesh(
    new THREE.LatheGeometry(pts, seg),
    _mat(THREE, woodHex, { roughness: 0.9 })
  );
  body.name = 'staves';
  body.position.y = -h / 2; // center the barrel about the origin
  group.add(body);

  // Hoop bands: thin open-ended cylinders at two heights.
  function band(yLocal, radius) {
    var ring = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, 0.08, seg, 1, true),
      _mat(THREE, bandHex, { roughness: 0.5, metalness: 0.4 })
    );
    ring.name = 'hoop';
    ring.position.y = yLocal - h / 2;
    group.add(ring);
  }
  band(0.22, 0.385);
  band(0.68, 0.385);

  return _applyScale(group, opts);
}

/**
 * buildCoin(THREE, opts) -> Group. Spinning-friendly gold coin: a thin faceted
 * disc plus a raised rim torus, upright on the XY plane so a y-axis spin reads
 * as the classic pickup flip. opts: { color (gold), rimColor, scale }.
 */
export function buildCoin(THREE, opts) {
  opts = opts || {};
  var group = new THREE.Group();
  group.name = 'coin';

  var goldHex = _hex(opts.color, 0xffcf3f);
  var rimHex = _hex(opts.rimColor, _tint(goldHex, 0.8));
  var radius = 0.5;
  var thickness = 0.1;
  var seg = 16; // enough to read as round, still low-poly

  // Disc body: a short cylinder laid flat-faced toward +Z (upright coin).
  var disc = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, thickness, seg),
    _mat(THREE, goldHex, { roughness: 0.3, metalness: 0.7 })
  );
  disc.name = 'disc';
  disc.rotation.x = Math.PI / 2; // stand it up so it faces the camera
  group.add(disc);

  // Raised rim for a coined-edge highlight.
  var rim = new THREE.Mesh(
    new THREE.TorusGeometry(radius, thickness * 0.45, 6, seg),
    _mat(THREE, rimHex, { roughness: 0.25, metalness: 0.85 })
  );
  rim.name = 'rim';
  group.add(rim);

  // Spin pivot lives at the group origin; caller animates group.rotation.y.
  return _applyScale(group, opts);
}

/**
 * buildGem(THREE, opts) -> Group. Faceted emissive gemstone: a stretched
 * octahedron crystal that glows, useful as a collectible / objective marker.
 * opts: { color, scale, emissiveIntensity (default 0.6) }.
 */
export function buildGem(THREE, opts) {
  opts = opts || {};
  var group = new THREE.Group();
  group.name = 'gem';

  var hex = _hex(opts.color, 0x4fd6ff);
  var emi = (typeof opts.emissiveIntensity === 'number') ? opts.emissiveIntensity : 0.6;

  var geo = new THREE.OctahedronGeometry(0.5, 0);
  // Stretch vertically into a cut-gem silhouette (taller than wide).
  geo.scale(0.72, 1.25, 0.72);
  geo.computeVertexNormals();

  var gem = new THREE.Mesh(
    geo,
    _mat(THREE, hex, {
      roughness: 0.15,
      metalness: 0.1,
      emissive: hex,
      emissiveIntensity: emi
    })
  );
  gem.name = 'crystal';
  gem.position.y = 0.55; // float just above the ground for a collectible feel
  group.add(gem);

  return _applyScale(group, opts);
}

/**
 * buildTurret(THREE, opts) -> Group. Tower-defense turret: a fixed base/pedestal
 * plus a named "head" sub-group (dome + forward barrel) that the caller rotates
 * to aim. Returns group; group.userData.head is the pivot to yaw toward a target.
 * opts: { color (base), headColor, barrelColor, scale }.
 */
export function buildTurret(THREE, opts) {
  opts = opts || {};
  var group = new THREE.Group();
  group.name = 'turret';

  var baseHex = _hex(opts.color, 0x5a6470);
  var headHex = _hex(opts.headColor, 0x8a95a3);
  var barrelHex = _hex(opts.barrelColor, 0x3a4048);

  // Base: a wide tapered pedestal.
  var base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.55, 0.4, 8),
    _mat(THREE, baseHex, { roughness: 0.8, metalness: 0.2 })
  );
  base.name = 'base';
  base.position.y = 0.2;
  group.add(base);

  // Rotating head pivot (yaw about Y). Caller sets head.rotation.y to aim.
  var head = new THREE.Group();
  head.name = 'head';
  head.position.y = 0.5;
  group.add(head);
  group.userData.head = head;

  // Head dome.
  var dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    _mat(THREE, headHex, { roughness: 0.55, metalness: 0.3 })
  );
  dome.name = 'dome';
  head.add(dome);

  // Barrel pointing along +Z (the head's forward axis).
  var barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.11, 0.6, 7),
    _mat(THREE, barrelHex, { roughness: 0.4, metalness: 0.6 })
  );
  barrel.name = 'barrel';
  barrel.rotation.x = Math.PI / 2;   // lay it horizontal
  barrel.position.set(0, 0.08, 0.36); // jut forward out of the dome
  head.add(barrel);

  return _applyScale(group, opts);
}

/**
 * buildPortal(THREE, opts) -> Group. Glowing ring gate: an emissive torus frame
 * around a faint translucent inner disc, standing upright. The whole group is a
 * convenient pivot for a slow spin. opts: { color (ring glow), scale,
 * emissiveIntensity (default 0.9) }.
 */
export function buildPortal(THREE, opts) {
  opts = opts || {};
  var group = new THREE.Group();
  group.name = 'portal';

  var hex = _hex(opts.color, 0xa64bff);
  var emi = (typeof opts.emissiveIntensity === 'number') ? opts.emissiveIntensity : 0.9;
  var radius = 0.85;

  // Outer glowing ring (faceted torus -> low-poly).
  var ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.12, 8, 18),
    _mat(THREE, hex, {
      roughness: 0.3,
      metalness: 0.2,
      emissive: hex,
      emissiveIntensity: emi
    })
  );
  ring.name = 'ring';
  group.add(ring);

  // Inner gate surface: a faint translucent disc that catches the ring's glow.
  var inner = new THREE.Mesh(
    new THREE.CircleGeometry(radius - 0.1, 18),
    new THREE.MeshStandardMaterial({
      color: hex,
      emissive: hex,
      emissiveIntensity: emi * 0.5,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      flatShading: true,
      roughness: 0.5
    })
  );
  inner.name = 'gate';
  group.add(inner);

  // Stand the portal upright on the ground (center of ring at radius height).
  group.position.y = radius;
  return _applyScale(group, opts);
}

// END mChatAI Web Component: models.lowpoly-props-3d
