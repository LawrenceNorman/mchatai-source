/*
 * Retro FPS runtime for mChatAI mini-apps.
 *
 * A game page holds its levels as text (<script type="text/x-retro-fps-map">),
 * loads ./libs/rfps.js (this runtime + the Woof! engine glue) and
 * ./libs/rfps-data.js (engine, resources and Freedoom art), then calls
 * RetroFPS.start(). The runtime compiles the text into a Doom map, writes it
 * into the engine's file system and boots the engine. Nothing is fetched, so
 * the page runs from file:// as well as from mchatai.com. Around the engine the
 * page draws a start card and pause menu (controls, difficulty, music, sound),
 * touch controls on phones, and the "press E to try again" hint.
 *
 * Engine: Woof! (GPL-2.0-or-later). Art and sound: Freedoom (BSD-3-Clause).
 * Corresponding source and build: mchatai-source/frameworks/retro-fps/.
 *
 * The map compiler also runs under Node (module.exports) so tools can check a
 * level without a browser: node tools/rfps-check.js <index.html|map.txt>.
 */
(function (root) {
  "use strict";

  var VERSION = "1.1.1";
  var CELL = 64;
  var MAX_STEP = 24;       // tallest step a player can climb
  var PLAYER_HEIGHT = 56;  // headroom a player needs

  // Doom editor numbers. The names are the ones a level legend uses.
  var THING_TYPES = {
    player1: 1, player2: 2, player3: 3, player4: 4, deathmatch: 11, teleportdest: 14,
    zombieman: 3004, shotgunguy: 9, chaingunner: 65, imp: 3001, demon: 3002, spectre: 58,
    lostsoul: 3006, cacodemon: 3005, hellknight: 69, baron: 3003, revenant: 66,
    mancubus: 67, arachnotron: 68, painelemental: 71, archvile: 64,
    stimpack: 2011, medikit: 2012, healthbonus: 2014, armorbonus: 2015, greenarmor: 2018,
    bluearmor: 2019, soulsphere: 2013, megasphere: 83, berserk: 2023, invulnerability: 2022,
    radsuit: 2025, lightamp: 2045, computermap: 2026,
    clip: 2007, bullets: 2048, shells: 2008, shellbox: 2049, rocket: 2010, rocketbox: 2046,
    cell: 2047, cellpack: 17, backpack: 8,
    shotgun: 2001, supershotgun: 82, chaingun: 2002, rocketlauncher: 2003, plasmagun: 2004,
    chainsaw: 2005, bfg: 2006,
    bluekey: 5, yellowkey: 6, redkey: 13, blueskull: 40, yellowskull: 39, redskull: 38,
    barrel: 2035, burningbarrel: 70, floorlamp: 2028, techlamp: 85, shorttechlamp: 86,
    techcolumn: 48, tallgreencolumn: 30, tallredcolumn: 32, shortgreencolumn: 31,
    shortredcolumn: 33, candle: 34, candelabra: 35, tallbluetorch: 44, tallgreentorch: 45,
    tallredtorch: 46, shortbluetorch: 55, shortgreentorch: 56, shortredtorch: 57,
    deadplayer: 15, deadzombieman: 18, deadimp: 20, bloodpool: 24, tree: 43, bigtree: 54
  };

  var MONSTERS = {
    zombieman: 1, shotgunguy: 1, chaingunner: 1, imp: 1, demon: 1, spectre: 1, lostsoul: 1,
    cacodemon: 1, hellknight: 1, baron: 1, revenant: 1, mancubus: 1, arachnotron: 1,
    painelemental: 1, archvile: 1
  };

  var LOCKS = {
    blue: { special: 26, track: "DOORBLU", keys: ["bluekey", "blueskull"] },
    yellow: { special: 27, track: "DOORYEL", keys: ["yellowkey", "yellowskull"] },
    red: { special: 28, track: "DOORRED", keys: ["redkey", "redskull"] }
  };
  var LIGHT_EFFECTS = { blink: 1, fastblink: 2, slowblink: 3, glow: 8, strobe: 12, faststrobe: 13, flicker: 17 };
  var DAMAGE_BITS = { 0: 0, 5: 32, 10: 64, 20: 96 };   // Boom generalized sector damage
  var SECRET_BIT = 128;
  var ML_BLOCKING = 1, ML_TWOSIDED = 4, ML_DONTPEGBOTTOM = 16;
  var SPECIAL_DOOR = 1, SPECIAL_EXIT = 52;
  var SOLID = "#";
  var RESERVED = { "#": 1, " ": 1, "D": 1, "X": 1 };

  function MapError(message, where) {
    this.name = "MapError";
    this.message = where ? where + ": " + message : message;
  }
  MapError.prototype = Object.create(Error.prototype);

  // ---------------------------------------------------------------- parsing

  function parseProps(tokens, where) {
    var props = {};
    tokens.forEach(function (tok) {
      var eq = tok.indexOf("=");
      if (eq < 1) throw new MapError("expected key=value, got '" + tok + "'", where);
      props[tok.slice(0, eq).trim().toLowerCase()] = tok.slice(eq + 1).trim();
    });
    return props;
  }

  function parseMap(text) {
    var meta = {}, zones = {}, things = {}, grid = [], section = null;
    var lines = String(text).replace(/\r\n?/g, "\n").split("\n");
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i], where = "line " + (i + 1);
      if (section === "grid") {
        if (!raw.trim()) { if (grid.length) section = "done"; continue; }
        grid.push(raw.replace(/\s+$/, ""));
        continue;
      }
      var line = raw.split("#")[0].trim();
      if (section === "done" || !line) continue;
      var head = line.match(/^(zones|things|grid)\s*:$/i);
      if (head) { section = head[1].toLowerCase(); continue; }
      if (section === null) {
        var colon = line.indexOf(":");
        if (colon > 0) meta[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
        continue;
      }
      var parts = line.split(/\s+/), ch = parts[0], rest = parts.slice(1);
      if (ch.length !== 1 || RESERVED[ch]) {
        throw new MapError("'" + ch + "' must be a single character other than # D X or space", where);
      }
      if (zones[ch] || things[ch]) throw new MapError("'" + ch + "' is declared twice", where);
      if (section === "zones") {
        zones[ch] = parseProps(rest, where);
      } else {
        var kind = (rest[0] || "").toLowerCase();
        if (!kind) throw new MapError("thing '" + ch + "' needs a type, such as imp", where);
        if (!(kind in THING_TYPES)) {
          throw new MapError("unknown thing type '" + kind + "'. Known types: " + Object.keys(THING_TYPES).join(", "), where);
        }
        var tp = parseProps(rest.slice(1), where);
        tp.kind = kind;
        things[ch] = tp;
      }
    }
    if (!grid.length) throw new MapError("the map has no grid: section");
    if (!Object.keys(zones).length) throw new MapError("the map has no zones: section");
    var indent = Math.min.apply(null, grid.map(function (r) { return r.length - r.replace(/^\s+/, "").length; }));
    grid = grid.map(function (r) { return r.slice(indent); });
    var width = Math.max.apply(null, grid.map(function (r) { return r.length; }));
    grid = grid.map(function (r) {
      while (r.length < width) r += SOLID;
      return r.replace(/ /g, SOLID);
    });
    return { meta: meta, zones: zones, things: things, grid: grid };
  }

  function zoneDef(z) {
    var n = function (v, d) { var x = parseInt(v, 10); return isNaN(x) ? d : x; };
    var lightfx = (z.lightfx || "").toLowerCase();
    var special = n(z.special, 0);
    if (!special) {
      special = (LIGHT_EFFECTS[lightfx] || 0) | (DAMAGE_BITS[n(z.damage, 0)] || 0) |
        (/^(1|true|yes)$/i.test(z.secret || "") ? SECRET_BIT : 0);
    }
    return {
      floor: n(z.floor, 0), ceil: n(z.ceil, 128),
      floorflat: (z.floorflat || "FLOOR4_8").toUpperCase(),
      ceilflat: (z.ceilflat || "CEIL3_5").toUpperCase(),
      wall: (z.wall || "STARTAN3").toUpperCase(),
      light: Math.max(0, Math.min(255, n(z.light, 160))),
      special: special,
      door: (z.door || "").toLowerCase(),
      exit: /^(1|true|yes)$/i.test(z.exit || ""),
      heightsGiven: z.floor !== undefined || z.ceil !== undefined
    };
  }

  function thingAngle(v) {
    if (v === undefined) return 0;
    var named = { e: 0, east: 0, n: 90, north: 90, w: 180, west: 180, s: 270, south: 270 };
    var key = String(v).toLowerCase();
    if (key in named) return named[key];
    var a = parseInt(v, 10);
    return isNaN(a) ? 0 : ((a % 360) + 360) % 360;
  }

  function thingFlags(t) {
    var flags = 0;
    var skill = (t.skill || "all").toLowerCase();
    if (skill === "all") flags |= 7;
    else skill.split(",").forEach(function (s) {
      flags |= { easy: 1, medium: 2, hard: 4 }[s.trim()] || 0;
    });
    if (!flags) flags = 7;
    if (/^(1|true|yes)$/i.test(t.ambush || "")) flags |= 8;
    return flags;
  }

  // -------------------------------------------------------------- compiling

  function compileMap(parsed, opts) {
    opts = opts || {};
    var meta = parsed.meta, zones = parsed.zones, things = parsed.things, grid = parsed.grid;
    var H = grid.length, W = grid[0].length, warnings = [];
    var zdef = {};
    Object.keys(zones).forEach(function (ch) { zdef[ch] = zoneDef(zones[ch]); });

    function at(c, r) { return (r >= 0 && r < H && c >= 0 && c < W) ? grid[r][c] : SOLID; }
    function cellName(c, r) { return "grid row " + (r + 1) + " col " + (c + 1); }
    function isDoorChar(ch) { return ch === "D" || (zdef[ch] && zdef[ch].door); }
    function isExitChar(ch) { return ch === "X" || (zdef[ch] && zdef[ch].exit); }
    function isPlainZone(ch) { return zdef[ch] && !zdef[ch].door && !zdef[ch].exit; }

    for (var r = 0; r < H; r++) {
      for (var c = 0; c < W; c++) {
        var ch = at(c, r);
        if (!RESERVED[ch] && !zones[ch] && !things[ch]) {
          throw new MapError("'" + ch + "' is not declared under zones: or things:", cellName(c, r));
        }
        if (ch !== SOLID && (r === 0 || r === H - 1 || c === 0 || c === W - 1)) {
          throw new MapError("open cell on the edge of the map; surround the map with #", cellName(c, r));
        }
      }
    }

    // Each open cell's zone. Things, doors and exits borrow one from their neighbours.
    var cellZone = {};
    var key = function (c, r) { return c + "," + r; };
    var pending = [];
    for (r = 0; r < H; r++) for (c = 0; c < W; c++) {
      ch = at(c, r);
      if (isPlainZone(ch)) cellZone[key(c, r)] = ch;
      else if (ch !== SOLID) pending.push([c, r]);
    }
    while (pending.length) {
      var next = [];
      pending.forEach(function (p) {
        var votes = {}, best = null;
        [[p[0] - 1, p[1]], [p[0] + 1, p[1]], [p[0], p[1] - 1], [p[0], p[1] + 1]].forEach(function (nb) {
          var z = cellZone[key(nb[0], nb[1])];
          if (z) { votes[z] = (votes[z] || 0) + 1; if (best === null || votes[z] > votes[best]) best = z; }
        });
        if (best) cellZone[key(p[0], p[1])] = best; else next.push(p);
      });
      if (next.length === pending.length) {
        throw new MapError("cannot tell which zone '" + at(next[0][0], next[0][1]) + "' belongs to; put it next to a zone cell",
          cellName(next[0][0], next[0][1]));
      }
      pending = next;
    }

    // Sectors: one per plain zone; one per connected door; one per connected exit pad.
    var sectors = [], sectorOf = {};
    function addSector(base, over) {
      var s = {};
      Object.keys(base).forEach(function (k) { s[k] = base[k]; });
      Object.keys(over || {}).forEach(function (k) { s[k] = over[k]; });
      sectors.push(s);
      return sectors.length - 1;
    }
    var zoneSector = {};
    Object.keys(zdef).forEach(function (ch) { if (isPlainZone(ch)) zoneSector[ch] = addSector(zdef[ch], { kind: "room" }); });
    for (r = 0; r < H; r++) for (c = 0; c < W; c++) {
      ch = at(c, r);
      if (isPlainZone(ch) || things[ch]) sectorOf[key(c, r)] = zoneSector[cellZone[key(c, r)]];
    }
    var seen = {};
    for (r = 0; r < H; r++) for (c = 0; c < W; c++) {
      ch = at(c, r);
      if (seen[key(c, r)] || !(isDoorChar(ch) || isExitChar(ch))) continue;
      var comp = [], queue = [[c, r]];
      seen[key(c, r)] = 1;
      while (queue.length) {
        var q = queue.shift();
        comp.push(q);
        [[q[0] - 1, q[1]], [q[0] + 1, q[1]], [q[0], q[1] - 1], [q[0], q[1] + 1]].forEach(function (nb) {
          if (at(nb[0], nb[1]) === ch && !seen[key(nb[0], nb[1])]) { seen[key(nb[0], nb[1])] = 1; queue.push(nb); }
        });
      }
      var base = zdef[cellZone[key(c, r)]];
      var own = zdef[ch];
      var sid;
      if (isDoorChar(ch)) {
        var lock = ch === "D" ? "" : own.door === "normal" ? "" : own.door;
        if (lock && !LOCKS[lock]) throw new MapError("door=" + own.door + " must be normal, blue, yellow or red", cellName(c, r));
        sid = addSector(base, {
          kind: "door", lock: lock,
          ceil: base.floor,
          ceilflat: base.ceilflat === "F_SKY1" ? "CEIL5_1" : base.ceilflat,
          special: 0,
          wall: own && own.heightsGiven ? own.wall : base.wall
        });
      } else {
        sid = addSector(base, { kind: "exit", floorflat: (own && own.floorflat !== "FLOOR4_8" ? own.floorflat : (meta.exitflat || "GATE3").toUpperCase()) });
      }
      comp.forEach(function (cell) { sectorOf[key(cell[0], cell[1])] = sid; });
    }

    // Door openings: a door opens to its lowest neighbouring ceiling minus 4.
    var doorOpening = {};
    for (r = 0; r < H; r++) for (c = 0; c < W; c++) {
      var s = sectorOf[key(c, r)];
      if (s === undefined || sectors[s].kind !== "door") continue;
      [[c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]].forEach(function (nb) {
        var o = sectorOf[key(nb[0], nb[1])];
        if (o !== undefined && o !== s) {
          var open = sectors[o].ceil - 4 - sectors[s].floor;
          doorOpening[s] = doorOpening[s] === undefined ? open : Math.min(doorOpening[s], open);
        }
      });
    }
    function doorTexture(s) {
      if (meta.doortexture) return meta.doortexture.toUpperCase();
      return (doorOpening[s] || 0) <= 72 ? "DOOR3" : "SPCDOOR3";
    }

    // Edges between cells in different sectors.
    var keyed = {};
    function chooseFront(a, b) {
      if (a === undefined) return [b, undefined];
      if (b === undefined) return [a, undefined];
      var ka = sectors[a].kind, kb = sectors[b].kind;
      if ((ka === "door" || ka === "exit") && kb === "room") return [b, a];
      return [a, b];
    }
    function addEdge(axis, fixed, along, a, b) {
      var fb = chooseFront(a, b), front = fb[0], back = fb[1];
      var side = front === a ? "low" : "high";
      var k = [axis, fixed, front, back === undefined ? "-" : back, side].join("|");
      (keyed[k] = keyed[k] || { axis: axis, fixed: fixed, front: front, back: back, side: side, alongs: [] }).alongs.push(along);
    }
    for (r = 0; r < H; r++) for (c = 0; c <= W; c++) {
      var a = sectorOf[key(c - 1, r)], b = sectorOf[key(c, r)];
      if (a !== b) addEdge("v", c, r, a, b);
    }
    for (r = 0; r <= H; r++) for (c = 0; c < W; c++) {
      a = sectorOf[key(c, r - 1)]; b = sectorOf[key(c, r)];
      if (a !== b) addEdge("h", r, c, a, b);
    }

    var vertices = [], vindex = {}, linedefs = [], sidedefs = [];
    function vid(x, y) {
      var k2 = x + "," + y;
      if (!(k2 in vindex)) { vindex[k2] = vertices.length; vertices.push([x, y]); }
      return vindex[k2];
    }
    function addSide(sector, upper, lower, middle) {
      sidedefs.push([0, 0, upper || "-", lower || "-", middle || "-", sector]);
      return sidedefs.length - 1;
    }
    Object.keys(keyed).forEach(function (k3) {
      var e = keyed[k3];
      e.alongs.sort(function (x, y) { return x - y; });
      var runs = [], start = e.alongs[0], prev = start;
      for (var i = 1; i <= e.alongs.length; i++) {
        var v = e.alongs[i];
        if (v === prev + 1) { prev = v; continue; }
        runs.push([start, prev + 1]);
        start = prev = v;
      }
      runs.forEach(function (run) {
        var p1, p2;
        if (e.axis === "v") {
          var x = e.fixed * CELL, yTop = -run[0] * CELL, yBot = -run[1] * CELL;
          if (e.side === "high") { p1 = [x, yBot]; p2 = [x, yTop]; } else { p1 = [x, yTop]; p2 = [x, yBot]; }
        } else {
          var y = -e.fixed * CELL, xl = run[0] * CELL, xr = run[1] * CELL;
          if (e.side === "high") { p1 = [xl, y]; p2 = [xr, y]; } else { p1 = [xr, y]; p2 = [xl, y]; }
        }
        var fs = sectors[e.front], flags = 0, special = 0, right, left;
        if (e.back === undefined) {
          var tex = fs.wall;
          if (fs.kind === "door") {
            tex = fs.lock ? LOCKS[fs.lock].track : "DOORTRAK";
            flags |= ML_DONTPEGBOTTOM;
          }
          right = addSide(e.front, null, null, tex);
          left = 0xFFFF;
          flags |= ML_BLOCKING;
        } else {
          var bs = sectors[e.back];
          flags |= ML_TWOSIDED;
          if (bs.kind === "door") {
            special = bs.lock ? LOCKS[bs.lock].special : SPECIAL_DOOR;
            var dt = doorTexture(e.back);
            right = addSide(e.front, dt, fs.wall, null);
            left = addSide(e.back, dt, fs.wall, null);
          } else {
            if (bs.kind === "exit") special = SPECIAL_EXIT;
            right = addSide(e.front, fs.wall, fs.wall, null);
            left = addSide(e.back, bs.wall, bs.wall, null);
          }
        }
        linedefs.push([vid(p1[0], p1[1]), vid(p2[0], p2[1]), flags, special, 0, right, left]);
      });
    });

    var thingList = [], starts = [], keysPresent = {}, monsters = [];
    for (r = 0; r < H; r++) for (c = 0; c < W; c++) {
      ch = at(c, r);
      if (!things[ch]) continue;
      var t = things[ch];
      var type = THING_TYPES[t.kind];
      thingList.push([c * CELL + CELL / 2, -r * CELL - CELL / 2, thingAngle(t.angle), type, thingFlags(t)]);
      if (type === 1) starts.push([c, r]);
      if (MONSTERS[t.kind]) monsters.push({ c: c, r: r, ch: ch, index: thingList.length - 1 });
      keysPresent[t.kind] = 1;
    }

    validate();
    return { vertices: vertices, linedefs: linedefs, sidedefs: sidedefs, sectors: sectors, things: thingList,
             warnings: warnings, startSeenBy: seenFromStart() };

    // Monsters with a clear line to the player's starting spot. Doom monsters
    // wake when they see the player, so these open fire before the player has
    // moved. Walls and doors block the line; heights are ignored.
    function seenFromStart() {
      var s = starts[0], out = [];
      monsters.forEach(function (m) {
        var x0 = s[0] + 0.5, y0 = s[1] + 0.5, x1 = m.c + 0.5, y1 = m.r + 0.5;
        var n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 8);
        for (var i = 1; i < n; i++) {
          var cx = Math.floor(x0 + (x1 - x0) * i / n), cy = Math.floor(y0 + (y1 - y0) * i / n);
          var cc = at(cx, cy);
          if (cc === SOLID || isDoorChar(cc)) return;
        }
        // The angle that faces straight away from the start (grid rows run south).
        var away = Math.round(Math.atan2(s[1] - m.r, m.c - s[0]) * 180 / Math.PI / 45) * 45;
        out.push({ ch: m.ch, row: m.r + 1, col: m.c + 1, index: m.index, away: (away + 360) % 360 });
      });
      return out;
    }

    function validate() {
      if (starts.length !== 1) throw new MapError("needs exactly one player1 start, found " + starts.length);
      var exits = [];
      for (var rr = 0; rr < H; rr++) for (var cc = 0; cc < W; cc++) if (isExitChar(at(cc, rr))) exits.push(key(cc, rr));
      if (!exits.length) throw new MapError("no exit: put an X (or a zone with exit=1) where the player can reach it");
      sectors.forEach(function (s) {
        if (s.kind === "door" && s.lock && !LOCKS[s.lock].keys.some(function (k) { return keysPresent[k]; })) {
          throw new MapError("a " + s.lock + " door needs a " + s.lock + "key (or " + s.lock + "skull) thing somewhere in the map");
        }
      });
      Object.keys(zdef).forEach(function (zc) {
        var z = zdef[zc];
        if (isPlainZone(zc) && z.ceil - z.floor < PLAYER_HEIGHT && z.ceilflat !== "F_SKY1") {
          warnings.push("zone '" + zc + "' is only " + (z.ceil - z.floor) + " units tall; a player needs " + PLAYER_HEIGHT);
        }
      });
      // Walk from the start the way a player can: steps of at most 24 up, 56 of headroom.
      var seenWalk = {}, queue2 = [starts[0]], reached = false;
      seenWalk[key(starts[0][0], starts[0][1])] = 1;
      function walk(cell) {
        var s = sectors[sectorOf[key(cell[0], cell[1])]];
        if (s.kind === "door") return { floor: s.floor, ceil: Infinity };
        return { floor: s.floor, ceil: s.ceilflat === "F_SKY1" ? Infinity : s.ceil };
      }
      while (queue2.length) {
        var cur = queue2.shift();
        if (exits.indexOf(key(cur[0], cur[1])) >= 0) { reached = true; break; }
        var from = walk(cur);
        [[cur[0] - 1, cur[1]], [cur[0] + 1, cur[1]], [cur[0], cur[1] - 1], [cur[0], cur[1] + 1]].forEach(function (nb) {
          var nk = key(nb[0], nb[1]);
          if (seenWalk[nk] || sectorOf[nk] === undefined) return;
          var to = walk(nb);
          if (to.floor - from.floor > MAX_STEP) return;
          if (Math.min(from.ceil, to.ceil) - Math.max(from.floor, to.floor) < PLAYER_HEIGHT) return;
          seenWalk[nk] = 1;
          queue2.push(nb);
        });
      }
      if (!reached) {
        throw new MapError("the player cannot reach the exit: look for walls in the way, steps up of more than " +
          MAX_STEP + " units, and openings with less than " + PLAYER_HEIGHT + " units of headroom");
      }
    }
  }

  // ------------------------------------------------------------- WAD output

  function lumpName(s) {
    var out = new Uint8Array(8);
    var t = String(s).toUpperCase();
    for (var i = 0; i < 8 && i < t.length; i++) out[i] = t.charCodeAt(i) & 0x7f;
    return out;
  }

  function Writer() { this.parts = []; this.length = 0; }
  Writer.prototype.bytes = function (u8) { this.parts.push(u8); this.length += u8.length; };
  Writer.prototype.i16 = function (v) { var b = new Uint8Array(2); new DataView(b.buffer).setInt16(0, v, true); this.bytes(b); };
  Writer.prototype.u16 = function (v) { var b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, true); this.bytes(b); };
  Writer.prototype.i32 = function (v) { var b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v, true); this.bytes(b); };
  Writer.prototype.done = function () {
    var out = new Uint8Array(this.length), o = 0;
    this.parts.forEach(function (p) { out.set(p, o); o += p.length; });
    return out;
  };
  function lump(fill) { var w = new Writer(); fill(w); return w.done(); }

  function mapLumps(name, m) {
    return [
      [name, new Uint8Array(0)],
      ["THINGS", lump(function (w) { m.things.forEach(function (t) { t.forEach(function (v) { w.i16(v); }); }); })],
      ["LINEDEFS", lump(function (w) {
        m.linedefs.forEach(function (l) { w.u16(l[0]); w.u16(l[1]); w.i16(l[2]); w.i16(l[3]); w.i16(l[4]); w.u16(l[5]); w.u16(l[6]); });
      })],
      ["SIDEDEFS", lump(function (w) {
        m.sidedefs.forEach(function (s) { w.i16(s[0]); w.i16(s[1]); w.bytes(lumpName(s[2])); w.bytes(lumpName(s[3])); w.bytes(lumpName(s[4])); w.i16(s[5]); });
      })],
      ["VERTEXES", lump(function (w) { m.vertices.forEach(function (v) { w.i16(v[0]); w.i16(v[1]); }); })],
      ["SEGS", new Uint8Array(0)], ["SSECTORS", new Uint8Array(0)], ["NODES", new Uint8Array(0)],
      ["SECTORS", lump(function (w) {
        m.sectors.forEach(function (s) {
          w.i16(s.floor); w.i16(s.ceil); w.bytes(lumpName(s.floorflat)); w.bytes(lumpName(s.ceilflat));
          w.i16(s.light); w.i16(s.special); w.i16(0);
        });
      })],
      ["REJECT", new Uint8Array(0)], ["BLOCKMAP", new Uint8Array(0)]
    ];
  }

  function umapinfo(levels) {
    var q = function (s) { return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'; };
    return levels.map(function (lv, i) {
      var m = lv.meta, out = ["MAP " + lv.lumpName, "{"];
      out.push("  levelname = " + q(m.name || ("Level " + (i + 1))));
      out.push("  label = clear");
      out.push("  music = " + q((m.music || "D_RUNNIN").toUpperCase()));
      out.push("  skytexture = " + q((m.sky || "SKY1").toUpperCase()));
      if (m.intertext) {
        out.push("  intertext = " + m.intertext.split(/\\n|\|/).map(function (s) { return q(s.trim()); }).join(", "));
      }
      if (i < levels.length - 1) out.push("  next = " + q(levels[i + 1].lumpName));
      else out.push("  endgame = true");
      out.push("}");
      return out.join("\n");
    }).join("\n\n") + "\n";
  }

  function buildPwad(levels, extra) {
    var lumps = [];
    levels.forEach(function (lv) { lumps = lumps.concat(mapLumps(lv.lumpName, lv.compiled)); });
    lumps.push(["UMAPINFO", textBytes(umapinfo(levels))]);
    (extra || []).forEach(function (l) { lumps.push(l); });
    var dataLen = lumps.reduce(function (n, l) { return n + l[1].length; }, 0);
    return lump(function (w) {
      w.bytes(textBytes("PWAD")); w.i32(lumps.length); w.i32(12 + dataLen);
      lumps.forEach(function (l) { w.bytes(l[1]); });
      var offset = 12;
      lumps.forEach(function (l) { w.i32(offset); w.i32(l[1].length); w.bytes(lumpName(l[0])); offset += l[1].length; });
    });
  }

  function textBytes(s) {
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
    return out;
  }

  // Compile a list of level texts into one PWAD. Throws MapError naming the level.
  // `design` lists levels that load but play unfairly (rfps-check fails on them).
  // The page itself still plays them: with opts.fairStart (on in the page) the
  // monsters that can see the start are turned to face away from it.
  function compileLevels(texts, opts) {
    opts = opts || {};
    var levels = [], warnings = [], design = [];
    texts.forEach(function (text, i) {
      var label = "level " + (i + 1);
      try {
        var parsed = parseMap(text);
        if (parsed.meta.name) label += " (" + parsed.meta.name + ")";
        var compiled = compileMap(parsed, opts);
        compiled.warnings.forEach(function (w) { warnings.push(label + ": " + w); });
        var seen = compiled.startSeenBy;
        if (seen.length) {
          var where = seen.slice(0, 6).map(function (m) { return m.ch + " at row " + m.row + " col " + m.col; }).join(", ");
          design.push(label + ": " + seen.length + (seen.length === 1 ? " monster has" : " monsters have") +
            " a clear line to the player start (" + where + (seen.length > 6 ? ", ..." : "") + "), so " +
            (seen.length === 1 ? "it shoots" : "they shoot") + " before the player has moved. Keep the start " +
            "area clear: put the first monsters out of sight of P, behind a wall or a door.");
          if (opts.fairStart) {
            seen.forEach(function (m) { compiled.things[m.index][2] = m.away; });
            warnings.push(label + ": turned " + seen.length + " monster(s) that could see the start to face away from it");
          }
        }
        levels.push({ lumpName: "MAP" + (i + 1 < 10 ? "0" : "") + (i + 1), meta: parsed.meta, compiled: compiled });
      } catch (e) {
        if (e instanceof MapError) throw new MapError(e.message, label);
        throw e;
      }
    });
    if (opts.names) warnings = warnings.concat(checkNames(levels, opts.names));
    return { levels: levels, warnings: warnings, design: design };
  }

  // Texture, flat and music names the base art does not have. The engine
  // draws nothing there, which reads as a broken level, so say which.
  function checkNames(levels, names) {
    var out = [], seen = {};
    function check(kind, name, set, where) {
      if (!name || name === "-" || set[name] || seen[kind + name]) return;
      seen[kind + name] = 1;
      out.push(where + ": unknown " + kind + " '" + name + "'");
    }
    levels.forEach(function (lv, i) {
      var where = "level " + (i + 1);
      lv.compiled.sidedefs.forEach(function (s) {
        check("texture", s[2], names.textures, where); check("texture", s[3], names.textures, where);
        check("texture", s[4], names.textures, where);
      });
      lv.compiled.sectors.forEach(function (s) {
        check("flat", s.floorflat, names.flats, where); check("flat", s.ceilflat, names.flats, where);
      });
      check("music", (lv.meta.music || "D_RUNNIN").toUpperCase(), names.music, where);
      check("texture", (lv.meta.sky || "SKY1").toUpperCase(), names.textures, where);
    });
    return out;
  }

  // ------------------------------------------------------------- the page

  var KEY_CODES = {
    KeyW: [87, "w"], KeyS: [83, "s"], KeyA: [65, "a"], KeyD: [68, "d"], KeyE: [69, "e"],
    ArrowLeft: [37, "ArrowLeft"], ArrowRight: [39, "ArrowRight"],
    ArrowUp: [38, "ArrowUp"], ArrowDown: [40, "ArrowDown"],
    Space: [32, " "], ControlRight: [17, "Control"], Tab: [9, "Tab"],
    Enter: [13, "Enter"], Escape: [27, "Escape"]
  };

  function sendKey(type, code) {
    var k = KEY_CODES[code];
    var ev = new KeyboardEvent(type, { code: code, key: k[1], keyCode: k[0], which: k[0], bubbles: true, cancelable: true });
    window.dispatchEvent(ev);
  }

  function el(tag, attrs, parent) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]);
    });
    if (parent) parent.appendChild(e);
    return e;
  }

  var CSS = [
    "html,body{margin:0;height:100%;background:#000;overflow:hidden;overscroll-behavior:none;",
    "-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}",
    // !important: when SDL recreates its window for WebGL it leaves an inline
    // 1px size on the canvas, decides the page is not sizing it, and from then
    // on writes its own pixel size inline, which overflows a phone screen.
    "#canvas{position:fixed;left:0;top:0;width:100vw!important;height:100vh!important;",
    "height:100dvh!important;display:block;outline:none}",
    "#rfps-status{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;",
    "gap:12px;color:#e8e8e8;font:600 18px system-ui,-apple-system,sans-serif;text-align:center;padding:24px;",
    "background:#000;z-index:5}",
    "#rfps-status small{font-weight:400;font-size:14px;color:#aaa;max-width:640px;white-space:pre-wrap;",
    "font-family:ui-monospace,Menlo,monospace;text-align:left}",
    "#rfps-status button,#rfps-card .go{font:600 16px system-ui,sans-serif;padding:12px 22px;border-radius:10px;",
    "border:0;background:#c9302c;color:#fff;min-height:44px;cursor:pointer}",
    "#rfps-card{position:fixed;inset:0;z-index:4;display:flex;align-items:center;justify-content:center;",
    "background:rgba(0,0,0,.55);padding:16px;box-sizing:border-box}",
    "#rfps-card .panel{width:100%;max-width:540px;max-height:100%;overflow:auto;box-sizing:border-box;",
    "background:rgba(16,16,18,.95);color:#e8e8e8;border:1px solid rgba(255,255,255,.14);border-radius:14px;",
    "padding:20px 22px;font:15px/1.45 system-ui,-apple-system,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.6)}",
    "#rfps-card h1{margin:0 0 6px;font:700 22px/1.2 system-ui,-apple-system,sans-serif}",
    "#rfps-card .brief{margin:0 0 12px;color:#b8b8b8}",
    "#rfps-card table{width:100%;border-collapse:collapse;margin:4px 0 10px}",
    "#rfps-card td{padding:5px 0;vertical-align:top;border-top:1px solid rgba(255,255,255,.07)}",
    "#rfps-card td:first-child{width:40%;padding-right:12px;color:#a8a8a8}",
    "#rfps-card kbd{display:inline-block;min-width:12px;text-align:center;padding:1px 6px;margin:0 2px 2px 0;",
    "border:1px solid rgba(255,255,255,.3);border-bottom-width:2px;border-radius:5px;",
    "font:600 12px/1.5 ui-monospace,Menlo,monospace;color:#fff}",
    "#rfps-card .opt{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0}",
    "#rfps-card .opt>span{min-width:84px;color:#a8a8a8}",
    "#rfps-card .opt button{font:600 14px system-ui,sans-serif;min-height:38px;padding:6px 14px;border-radius:9px;",
    "border:1px solid rgba(255,255,255,.25);background:transparent;color:#e8e8e8;cursor:pointer}",
    "#rfps-card .opt button[aria-pressed=true]{background:#e8e8e8;border-color:#e8e8e8;color:#111}",
    "#rfps-card .note{font-size:13px;color:#8a8a8a}",
    "#rfps-card .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}",
    "#rfps-card .actions .plain{font:600 15px system-ui,sans-serif;min-height:44px;padding:10px 18px;",
    "border-radius:10px;border:1px solid rgba(255,255,255,.25);background:transparent;color:#e8e8e8;cursor:pointer}",
    "#rfps-card .credits{margin:14px 0 0;font-size:12px;line-height:1.4;color:#8a8a8a}",
    "#rfps-card .credits a{color:#b8b8b8}",
    // A phone on its side is short and wide: controls left, options and Start right.
    "@media (max-height:560px) and (min-width:560px){",
    "#rfps-card{padding:10px}",
    "#rfps-card .panel{max-width:880px;padding:12px 18px}",
    "#rfps-card .cols{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:0 22px;align-items:start}",
    "#rfps-card h1{font-size:19px;margin-bottom:2px}",
    "#rfps-card .brief{margin-bottom:6px}",
    "#rfps-card table{margin:0}",
    "#rfps-card td{padding:3px 0;font-size:14px}",
    "#rfps-card .opt{margin:2px 0 6px}",
    "#rfps-card .opt button{min-height:36px;padding:4px 12px}",
    "#rfps-card .actions{margin-top:8px}",
    "#rfps-card .credits{margin-top:6px;font-size:11px}}",
    "#rfps-hint{position:fixed;left:50%;top:38%;transform:translate(-50%,-50%);z-index:3;display:none;",
    "background:rgba(0,0,0,.72);color:#fff;font:600 17px system-ui,sans-serif;padding:12px 18px;",
    "border-radius:10px;pointer-events:none;text-align:center;max-width:80vw}",
    "#rfps-menu{position:fixed;top:calc(env(safe-area-inset-top,0px) + 12px);z-index:3;width:44px;height:44px;",
    "border-radius:10px;border:1px solid rgba(255,255,255,.3);background:rgba(0,0,0,.35);color:#fff;",
    "font:700 18px system-ui,sans-serif;cursor:pointer;opacity:.8;padding:0}",
    "#rfps-touch{position:fixed;inset:0;z-index:2;touch-action:none}",
    "#rfps-touch .zone{position:absolute;top:0;bottom:0}",
    "#rfps-touch .btn{position:absolute;display:flex;align-items:center;justify-content:center;border-radius:50%;",
    "background:rgba(255,255,255,.14);border:2px solid rgba(255,255,255,.35);color:rgba(255,255,255,.85);",
    "font:700 13px system-ui,sans-serif;letter-spacing:.04em}",
    "#rfps-touch .btn.on{background:rgba(255,255,255,.32)}",
    "#rfps-touch .stick{position:absolute;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;",
    "border:2px solid rgba(255,255,255,.3);background:rgba(255,255,255,.08);display:none;pointer-events:none}",
    "#rfps-touch .knob{position:absolute;left:35px;top:35px;width:50px;height:50px;border-radius:50%;",
    "background:rgba(255,255,255,.35)}"
  ].join("");

  function installTouchControls() {
    var pad = el("div", { id: "rfps-touch" }, document.body);
    var left = el("div", { class: "zone" }, pad);
    left.style.left = "0"; left.style.width = "45%";
    var right = el("div", { class: "zone" }, pad);
    right.style.left = "45%"; right.style.right = "0";
    var stick = el("div", { class: "stick" }, pad);
    var knob = el("div", { class: "knob" }, stick);
    var held = {};
    function hold(code, on) {
      if (!!held[code] === on) return;
      held[code] = on;
      sendKey(on ? "keydown" : "keyup", code);
    }
    var R = 56;

    // Left half: a joystick that appears where the thumb lands. Up/down walk,
    // left/right strafe.
    var stickId = null, ox = 0, oy = 0;
    left.addEventListener("pointerdown", function (e) {
      if (stickId !== null) return;
      stickId = e.pointerId; ox = e.clientX; oy = e.clientY;
      left.setPointerCapture(e.pointerId);
      stick.style.left = ox + "px"; stick.style.top = oy + "px"; stick.style.display = "block";
      e.preventDefault();
    });
    left.addEventListener("pointermove", function (e) {
      if (e.pointerId !== stickId) return;
      var dx = e.clientX - ox, dy = e.clientY - oy, d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = "translate(" + dx + "px," + dy + "px)";
      hold("KeyW", dy < -0.3 * R); hold("KeyS", dy > 0.3 * R);
      hold("KeyA", dx < -0.35 * R); hold("KeyD", dx > 0.35 * R);
      e.preventDefault();
    });
    function stickUp(e) {
      if (e.pointerId !== stickId) return;
      stickId = null; stick.style.display = "none"; knob.style.transform = "";
      ["KeyW", "KeyS", "KeyA", "KeyD"].forEach(function (k) { hold(k, false); });
    }
    left.addEventListener("pointerup", stickUp);
    left.addEventListener("pointercancel", stickUp);

    // Right half: drag sideways to turn.
    var lookId = null, lx = 0;
    right.addEventListener("pointerdown", function (e) {
      if (lookId !== null) return;
      lookId = e.pointerId; lx = e.clientX;
      right.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    right.addEventListener("pointermove", function (e) {
      if (e.pointerId !== lookId) return;
      var dx = e.clientX - lx;
      hold("ArrowLeft", dx < -14); hold("ArrowRight", dx > 14);
      e.preventDefault();
    });
    function lookUp(e) {
      if (e.pointerId !== lookId) return;
      lookId = null; hold("ArrowLeft", false); hold("ArrowRight", false);
    }
    right.addEventListener("pointerup", lookUp);
    right.addEventListener("pointercancel", lookUp);

    function button(label, size, place, press, release) {
      var b = el("div", { class: "btn", text: label }, pad);
      b.style.width = b.style.height = size + "px";
      Object.keys(place).forEach(function (k) { b.style[k] = place[k]; });
      var downAt = 0;
      b.addEventListener("pointerdown", function (e) {
        b.classList.add("on"); b.setPointerCapture(e.pointerId); downAt = Date.now(); press();
        e.preventDefault(); e.stopPropagation();
      });
      // The engine samples buttons once per tic (1/35 s); a tap whose press and
      // release land in the same tic never fires, so hold it for three tics.
      function up() {
        b.classList.remove("on");
        if (release) setTimeout(release, Math.max(0, 90 - (Date.now() - downAt)));
      }
      b.addEventListener("pointerup", up);
      b.addEventListener("pointercancel", up);
      return b;
    }
    var safeR = "calc(env(safe-area-inset-right,0px) + ", safeB = "calc(env(safe-area-inset-bottom,0px) + ";
    button("FIRE", 92, { right: safeR + "22px)", bottom: safeB + "30px)" },
      function () { hold("ControlRight", true); }, function () { hold("ControlRight", false); });
    button("USE", 64, { right: safeR + "128px)", bottom: safeB + "40px)" },
      function () { hold("KeyE", true); }, function () { hold("KeyE", false); });
    button("GUN", 52, { right: safeR + "42px)", bottom: safeB + "138px)" }, function () {
      var canvas = document.getElementById("canvas");
      canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, deltaMode: 0, bubbles: true, cancelable: true }));
    });
    button("MAP", 48, { right: safeR + "18px)", top: "calc(env(safe-area-inset-top,0px) + 16px)" },
      function () { sendKey("keydown", "Tab"); }, function () { sendKey("keyup", "Tab"); });
  }

  function isTouchDevice() {
    return (navigator.maxTouchPoints || 0) > 0 || "ontouchstart" in window;
  }

  function config(touch, prefs) {
    return [
      "fullscreen 0",            // windowed, so the canvas follows the page's CSS size
      "grabmouse 0",             // the page asks for pointer lock itself (see watchMouse)
      "show_endoom 0",
      "autorun 1",
      "hud_crosshair 1",
      // Dynamic resolution compares each frame with the display's refresh, but
      // a browser frame includes the wait for the next animation frame, so it
      // drops to 400 lines within seconds and keeps changing. Use one height.
      "dynamic_resolution 0",
      "current_video_height " + (touch ? 400 : 600),
      "sfx_volume " + (prefs.sfx ? 8 : 0),
      "music_volume " + (prefs.music ? 8 : 0),
      // Space fires (what new players press first); E opens doors and flips
      // switches; Q changes weapon. The engine's defaults put use on Space.
      "input_fire ctrl, spacebar, mouse1, rt",
      "input_use e, enter, pada",
      "input_nextweapon q, wheelup, rb",
      "window_width " + Math.max(320, window.innerWidth || 960),
      "window_height " + Math.max(200, window.innerHeight || 600)
    ].join("\n") + "\n";
  }

  // Corresponding source for the engine build in dist/ (GPL-2.0-or-later), plus licenses.
  var SOURCE_URL = "https://github.com/LawrenceNorman/mchatai-source/tree/main/frameworks/retro-fps";

  var PREFS_KEY = "rfps.prefs";
  var SKILLS = [[2, "Easy"], [3, "Normal"], [4, "Hard"]];

  // The player's own choices (music, sound, difficulty), kept in this browser.
  function loadPrefs() {
    var p = { music: true, sfx: true, skill: 0 };
    try {
      var saved = JSON.parse(root.localStorage.getItem(PREFS_KEY) || "{}");
      if (typeof saved.music === "boolean") p.music = saved.music;
      if (typeof saved.sfx === "boolean") p.sfx = saved.sfx;
      if (saved.skill >= 1 && saved.skill <= 5) p.skill = saved.skill;
    } catch (e) { /* storage blocked: defaults */ }
    return p;
  }

  function savePrefs(p) {
    try { root.localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) { /* not kept */ }
  }

  function nameSets(names) {
    var sets = {};
    ["textures", "flats", "music"].forEach(function (k) {
      sets[k] = {};
      (names[k] || []).forEach(function (n) { sets[k][n] = 1; });
    });
    return sets;
  }

  function decodeBase64(b64) {
    if (Uint8Array.fromBase64) return Uint8Array.fromBase64(b64);
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function inflate(b64) {
    var stream = new Blob([decodeBase64(b64)]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
  }

  function showStatus(title, detail, action) {
    var s = document.getElementById("rfps-status") || el("div", { id: "rfps-status" }, document.body);
    s.innerHTML = "";
    el("div", { text: title }, s);
    if (detail) el("small", { text: detail }, s);
    if (action) {
      var b = el("button", { text: action.label }, s);
      b.addEventListener("click", action.run);
    }
    return s;
  }

  function fail(title, detail) {
    console.error("[retro-fps] " + title + (detail ? "\n" + detail : ""));
    showStatus(title, detail);
  }

  function keys(parent, list) {
    list.forEach(function (k, i) {
      if (typeof k === "string" && k.charAt(0) === " ") parent.appendChild(document.createTextNode(k));
      else el("kbd", { text: k }, parent);
    });
  }

  // The game running on this page: the engine module and the overlay around it.
  function Game(M, canvas, opts) {
    this.M = M; this.canvas = canvas; this.opts = opts;
    this.started = false; this.lockFailed = false;
  }

  Game.prototype.call = function (name, args) {
    var f = this.M && this.M["_" + name];
    return f ? f.apply(null, args || []) : undefined;
  };

  Game.prototype.state = function () {
    try { return JSON.parse(this.M.UTF8ToString(this.call("rfps_state"))); } catch (e) { return null; }
  };

  Game.prototype.applyVolumes = function () {
    var p = this.opts.prefs;
    this.call("rfps_set_volume", [p.sfx ? 8 : 0, p.music ? 8 : 0]);
  };

  Game.prototype.cardOpen = function () { return !!document.getElementById("rfps-card"); };

  Game.prototype.lockPointer = function () {
    var self = this, c = this.canvas;
    if (this.opts.touch || this.lockFailed || !c.requestPointerLock || document.pointerLockElement === c) return;
    try {
      var p = c.requestPointerLock();
      if (p && p.catch) p.catch(function () { self.lockFailed = true; });
    } catch (e) { this.lockFailed = true; }
  };

  Game.prototype.toggleMusic = function () {
    this.opts.prefs.music = !this.opts.prefs.music;
    savePrefs(this.opts.prefs);
    this.applyVolumes();
    this.flash(this.opts.prefs.music ? "Music on" : "Music off");
  };

  Game.prototype.flash = function (text) {
    var h = this.hint, self = this;
    h.textContent = text; h.style.display = "block";
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(function () { self.flashTimer = 0; h.style.display = "none"; }, 1400);
  };

  Game.prototype.resume = function () {
    var card = document.getElementById("rfps-card");
    if (card) card.remove();
    this.started = true;
    this.call("rfps_pause", [0]);
    this.canvas.focus();
  };

  Game.prototype.openCard = function (mode) {
    var self = this, o = this.opts, prefs = o.prefs;
    if (this.cardOpen()) return;
    this.call("rfps_pause", [1]);
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    var wrap = el("div", { id: "rfps-card", role: "dialog", "aria-modal": "true" }, document.body);
    var panel = el("div", { class: "panel" }, wrap);
    el("h1", { text: mode === "start" ? o.title : "Paused" }, panel);
    if (mode === "start" && o.briefing) el("p", { class: "brief", text: o.briefing }, panel);

    var cols = el("div", { class: "cols" }, panel);
    var table = el("table", {}, cols);
    var side = el("div", { class: "side" }, cols);
    function row(label, list) {
      var tr = el("tr", {}, table);
      el("td", { text: label }, tr);
      keys(el("td", {}, tr), list);
    }
    if (o.touch) {
      row("Move", [" Drag on the left side"]);
      row("Turn", [" Drag on the right side"]);
      row("Fire", ["FIRE"]);
      row("Open doors, flip switches", ["USE"]);
      row("Change weapon", ["GUN"]);
      row("Map / menu", ["MAP", "☰"]);
    } else {
      row("Move", ["W", "S", " or ", "↑", "↓"]);
      row("Step sideways", ["A", "D"]);
      row("Turn", this.lockFailed ? ["←", "→"] : ["←", "→", " or the mouse (click the game)"]);
      row("Fire", ["Space", "Ctrl", " or click"]);
      row("Open doors, flip switches", ["E"]);
      row("Change weapon", ["1", " to ", "7", " ", "Q", " or mouse wheel"]);
      row("Map", ["Tab"]);
      row("Menu", ["Esc"]);
      row("Music on / off", ["M"]);
    }

    function option(label, items, note) {
      var line = el("div", { class: "opt" }, side);
      el("span", { text: label }, line);
      items.forEach(function (it) {
        var b = el("button", { type: "button", "aria-pressed": String(!!it.on), text: it.label }, line);
        b.addEventListener("click", function () { it.run(); self.refreshCard(mode); });
      });
      if (note) el("span", { class: "note", text: note }, line);
    }
    var skillNow = o.skill;
    option("Difficulty", SKILLS.map(function (s) {
      var on = skillNow === s[0] || (s[0] === 2 && skillNow < 2) || (s[0] === 4 && skillNow > 4);
      return { label: s[1], on: on, run: function () {
        if (on) return;
        o.skill = prefs.skill = s[0];
        savePrefs(prefs);
        self.call("rfps_new_game", [s[0], mode === "start" ? 1 : 0]);
      } };
    }), mode === "start" ? null : "Restarts this level");
    option("Music", [{ label: "On", on: prefs.music, run: function () { if (!prefs.music) self.toggleMusic(); } },
                     { label: "Off", on: !prefs.music, run: function () { if (prefs.music) self.toggleMusic(); } }]);
    option("Sound", [{ label: "On", on: prefs.sfx, run: function () { prefs.sfx = true; savePrefs(prefs); self.applyVolumes(); } },
                     { label: "Off", on: !prefs.sfx, run: function () { prefs.sfx = false; savePrefs(prefs); self.applyVolumes(); } }]);

    var actions = el("div", { class: "actions" }, side);
    var go = el("button", { class: "go", type: "button", text: mode === "start" ? "Start" : "Resume" }, actions);
    go.addEventListener("click", function () { self.resume(); self.lockPointer(); });
    if (mode !== "start") {
      var again = el("button", { class: "plain", type: "button", text: "Restart level" }, actions);
      again.addEventListener("click", function () { self.call("rfps_new_game", [0, 0]); self.resume(); self.lockPointer(); });
    }
    // The engine is GPL software: every copy of the game names it and links to its source.
    var credits = el("p", { class: "credits" }, panel);
    credits.appendChild(document.createTextNode("Engine: Woof! (GPL-2.0). Art and sound: Freedoom (BSD). "));
    el("a", { href: SOURCE_URL, target: "_blank", rel: "noopener", text: "Source code" }, credits);
    this.cardMode = mode;
    this.primary = function () { go.click(); };
    setTimeout(function () { try { go.focus({ preventScroll: true }); } catch (e) { /* older engines */ } }, 0);
  };

  Game.prototype.refreshCard = function (mode) {
    var card = document.getElementById("rfps-card");
    if (!card) return;
    card.remove();
    this.openCard(mode);
  };

  // Keys the page handles itself, ahead of the engine: Esc/F1 open the menu,
  // M switches music, and nothing reaches the engine while the menu is up.
  Game.prototype.watchKeys = function () {
    var self = this;
    window.addEventListener("keydown", function (e) {
      if (self.cardOpen()) {
        e.stopImmediatePropagation();
        var onButton = e.target && e.target.closest && e.target.closest("#rfps-card button");
        if (e.code === "Escape" && self.started) { e.preventDefault(); self.resume(); }
        else if ((e.code === "Enter" || e.code === "Space") && !onButton) { e.preventDefault(); self.primary(); }
        return;
      }
      if (e.code === "Escape" || e.code === "F1") {
        e.stopImmediatePropagation(); e.preventDefault();
        self.openCard("pause");
      } else if (e.code === "KeyM" && !e.repeat) {
        e.stopImmediatePropagation();
        self.toggleMusic();
      } else if (e.code === "Tab") {
        e.preventDefault();      // the map, not the browser's focus ring
      }
    }, true);
  };

  // Mouse movement turns the player only while the pointer is locked to the
  // game. Unlocked, every cursor or trackpad move over the page would spin the
  // view. A click on the game asks for the lock (browsers that allow it);
  // losing it (Esc) opens the menu.
  Game.prototype.watchMouse = function () {
    var self = this, c = this.canvas;
    function guard(e) {
      if (e.pointerType && e.pointerType !== "mouse") return;
      if (document.pointerLockElement === c) return;
      e.stopImmediatePropagation();
    }
    window.addEventListener("pointermove", guard, true);
    window.addEventListener("mousemove", guard, true);
    c.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && self.started) self.lockPointer();
    });
    var wasLocked = false;
    document.addEventListener("pointerlockchange", function () {
      var locked = document.pointerLockElement === c;
      if (!locked && wasLocked && self.started && !self.cardOpen()) self.openCard("pause");
      wasLocked = locked;
    });
    document.addEventListener("pointerlockerror", function () { self.lockFailed = true; });
  };

  Game.prototype.watchState = function () {
    var self = this, o = this.opts, h = this.hint;
    var killed = o.touch ? "You were killed. Tap USE to try again." : "You were killed. Press E to try again.";
    setInterval(function () {
      if (self.flashTimer) return;
      var s = self.started && !self.cardOpen() ? self.state() : null;
      var show = !!(s && s.gamestate === 0 && s.dead);
      if (show) h.textContent = killed;
      h.style.display = show ? "block" : "none";
    }, 300);
  };

  Game.prototype.mount = function () {
    var self = this, o = this.opts;
    // The engine names its window after itself ("Commercial mode - Woof ..."),
    // which becomes the tab title. Keep the game's own.
    function keepTitle() { if (document.title !== o.title) document.title = o.title; }
    keepTitle();
    var titleEl = document.querySelector("title");
    if (titleEl && root.MutationObserver) {
      new MutationObserver(keepTitle).observe(titleEl, { childList: true, characterData: true, subtree: true });
    }
    this.hint = el("div", { id: "rfps-hint", role: "status" }, document.body);
    if (o.touch) installTouchControls();
    var menu = el("button", { id: "rfps-menu", type: "button", tabindex: "-1", "aria-label": "Menu", text: "☰" }, document.body);
    menu.style.right = o.touch ? "calc(env(safe-area-inset-right,0px) + 78px)" : "calc(env(safe-area-inset-right,0px) + 12px)";
    menu.addEventListener("click", function () { menu.blur(); self.openCard("pause"); });
    this.watchMouse();
    this.watchState();
    this.call("rfps_pause", [1]);
    this.applyVolumes();
    if (o.intro === false) this.resume();
    else this.openCard("start");
  };

  var current = null;   // the game on this page, for RetroFPS.state()

  function start(options) {
    options = options || {};
    var style = el("style", { text: CSS }, document.head);
    style.setAttribute("data-rfps", VERSION);
    if (!document.querySelector('meta[name="viewport"]')) {
      el("meta", { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" }, document.head);
    }
    var title = options.title || document.title || "Retro FPS";
    showStatus("Loading " + title + "…");

    var texts = Array.prototype.map.call(
      document.querySelectorAll('script[type="text/x-retro-fps-map"]'),
      function (s) { return s.textContent; });
    if (!texts.length) {
      return fail("No levels found", 'Add a <script type="text/x-retro-fps-map"> block with a level.');
    }
    var data = root.RetroFPSData;
    if (!data || !root.createWoof) {
      return fail("The engine did not load",
        "The page needs <script src=\"./libs/rfps.js\"></script> and <script src=\"./libs/rfps-data.js\"></script>.");
    }

    var compiled;
    try {
      compiled = compileLevels(texts, { names: data.names && nameSets(data.names), fairStart: true });
    } catch (e) {
      return fail("This level has a mistake", e.message);
    }
    compiled.warnings.concat(compiled.design).forEach(function (w) { console.warn("[retro-fps] " + w); });

    // The page's own menu says "Paused"; an empty M_PAUSE patch (1x1, no
    // posts) keeps the engine from drawing its PAUSE title above it.
    var extra = [["M_PAUSE", new Uint8Array([1, 0, 1, 0, 0, 0, 0, 0, 12, 0, 0, 0, 255])]];
    var deh = document.querySelector('script[type="text/x-retro-fps-dehacked"]');
    if (deh && deh.textContent.trim()) extra.push(["DEHACKED", textBytes(deh.textContent.replace(/^\s*\n/, ""))]);
    var pwad = buildPwad(compiled.levels, extra);

    var touch = isTouchDevice();
    var prefs = loadPrefs();
    var canvas = document.getElementById("canvas");
    if (!canvas) {
      canvas = el("canvas", { id: "canvas", tabindex: "-1" });
      document.body.insertBefore(canvas, document.body.firstChild);
    }
    canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });

    var skill = Math.max(1, Math.min(5, prefs.skill || parseInt(options.skill, 10) || 3));
    var game = new Game(null, canvas, {
      title: title, touch: touch, prefs: prefs, skill: skill, intro: options.intro,
      briefing: options.briefing || compiled.levels[0].meta.name || ""
    });
    // Before the engine starts, so these listeners run ahead of its own.
    game.watchKeys();

    var lastErrors = [];
    Promise.all([inflate(data.wasm), inflate(data.pk3), inflate(data.base)]).then(function (bins) {
      return root.createWoof({
        canvas: canvas,
        wasmBinary: bins[0],
        arguments: ["-iwad", "/base.wad", "-file", "/game.wad", "-config", "/rfps.cfg",
          "-warp", "1", "-skill", String(skill)],
        preRun: [function (M) {
          M.FS.writeFile("/woof.pk3", bins[1]);
          M.FS.writeFile("/base.wad", bins[2]);
          M.FS.writeFile("/game.wad", pwad);
          M.FS.writeFile("/rfps.cfg", config(touch, prefs));
        }],
        print: options.debug ? function (t) { console.log(t); } : function () {},
        printErr: function (t) {
          if (options.debug) console.log(t);
          if (/error/i.test(t) && !/CacheSound/.test(t)) {
            lastErrors = lastErrors.concat(t.replace(/\u001b\[[0-9;]*m/g, "").trim()).slice(-3);
            console.warn("[retro-fps] " + lastErrors[lastErrors.length - 1]);
          }
        },
        onAbort: function (what) { fail("The game stopped", String(what)); },
        onExit: function (status) {
          if (status) return fail("The game stopped with an error", lastErrors.join("\n"));
          showStatus(title, "Thanks for playing.", { label: "Play again", run: function () { location.reload(); } });
        }
      });
    }).then(function (M) {
      var status = document.getElementById("rfps-status");
      if (status) status.remove();
      game.M = M;
      current = game;
      game.mount();
      // The engine sizes its window before it knows the page; a resize makes
      // it read the canvas's CSS size again.
      [50, 400, 1500].forEach(function (ms) {
        setTimeout(function () { window.dispatchEvent(new Event("resize")); }, ms);
      });
    }).catch(function (e) {
      fail("The game could not start", String(e && e.message || e));
    });
  }

  // The running game's state (health, ammo, kills, map, ...) or null.
  function state() { return current ? current.state() : null; }

  var api = {
    VERSION: VERSION, THING_TYPES: THING_TYPES,
    parseMap: parseMap, compileMap: compileMap, compileLevels: compileLevels,
    buildPwad: buildPwad, umapinfo: umapinfo, checkNames: checkNames, MapError: MapError,
    start: start, state: state
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RetroFPS = api;
})(typeof window !== "undefined" ? window : globalThis);
