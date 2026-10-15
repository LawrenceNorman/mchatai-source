/* mChatAI Versus Fighter (VF) — a 1v1 fighting-game runtime where the game is data.
 *
 * Track: mchatai-source/frameworks/versus-fighter (CONTEXT.md says what a game file holds).
 * Art bases register themselves: dist/vf-base-<name>.js calls VersusFighter.registerBase(...)
 * with the atlas (frames, hit/hurt boxes, animations) and the sprite sheet as a data URI (a data
 * URI keeps the canvas untainted under file://, so fighters can be recolored).
 * Default art: the Alpha Strikers sprites by Puffolotti, CC0 (opengameart.org).
 *
 *   VersusFighter.mount(element, game, options) -> handle
 *   VersusFighter.state() -> { screen, round, timer, p1, p2, wins, winner, ... }
 */
(function (G) {
  "use strict";

  var VERSION = "0.4.0";
  var W = 384, H = 216, FLOOR = 204, STAGE_W = 680, STEP = 1000 / 60;
  var SCALE = 2;                       // sprites (and their boxes) are drawn at 2x: ~88 px fighters on a 216 px screen;
                                       // a base drawn at full size sets "drawScale": 1
  var EDGE = 28;                       // closest a fighter's centre gets to the stage edge
  var BODY = 16;                       // half-width of a fighter's push box (a base's feel.body overrides it)
  var BASES = {};
  var MODES = {};                      // other game modes (vf-brawler.js adds "brawler"), keyed by game.mode
  var active = null;                   // the mounted game (one per page)

  // ---------------------------------------------------------------- utilities
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function overlap(a, b) { return a && b && a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function hashSeed(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
  function hexToRgb(h) { h = String(h || "").replace("#", ""); if (h.length === 3) h = h.replace(/./g, "$&$&"); var n = parseInt(h, 16); return isNaN(n) ? null : [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgbToHsl(r, g, b) { r /= 255; g /= 255; b /= 255; var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
    if (d) { s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; } return [h, s, l]; }
  function brightest(colors) {     // the most vivid of a fighter's colours (projectiles, accents)
    var best = null, score = -1; for (var k in colors || {}) { var rgb = hexToRgb(colors[k]); if (!rgb) continue;
      var hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]), sc = hsl[2] + hsl[1] * 0.5; if (sc > score) { score = sc; best = colors[k]; } }
    return best;
  }
  function hslToRgb(h, s, l) { function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }
    if (!s) return [l * 255, l * 255, l * 255]; var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255]; }

  // ---------------------------------------------------------------- bases
  // A base = one sprite set: atlas JSON + image. Recolors are cached per palette.
  function registerBase(def) {
    var b = { def: def, img: new Image(), ready: false, waiters: [], recolors: {} };
    b.img.onload = function () { b.ready = true; b.waiters.splice(0).forEach(function (f) { f(); }); };
    b.img.src = def.image;
    BASES[def.base] = b;
  }
  function whenBasesReady(names, cb) {
    var left = names.length; if (!left) return cb();
    names.forEach(function (n) { var b = BASES[n]; if (!b) throw new Error("Versus Fighter: no art base '" + n + "' (load dist/vf-base-" + n + ".js)");
      if (b.ready) { if (--left === 0) cb(); } else b.waiters.push(function () { if (--left === 0) cb(); }); });
  }
  // Recolor: the base's "palette" groups pixels by hue band (e.g. top = reds, pants = navy).
  // A fighter's colors { top: "#3fa7ff" } move each group to the new hue and saturation and keep
  // every pixel's own lightness, so the shading survives.
  function recolorInto(x, w, h, groups, colors) {
    var names = Object.keys(colors || {}).filter(function (n) { return groups[n]; });
    if (!names.length) return;
    var id = x.getImageData(0, 0, w, h), d = id.data;
    var targets = names.map(function (n) { var rgb = hexToRgb(colors[n]); var hsl = rgb ? rgbToHsl(rgb[0], rgb[1], rgb[2]) : null; return { g: groups[n], hsl: hsl }; });
    var memo = {};         // atlases have a few hundred distinct colours: map each one once
    function mapColor(r0, g0, b0) {
      var hsl = rgbToHsl(r0, g0, b0), hue = hsl[0] * 360;
      for (var t = 0; t < targets.length; t++) {
        var g = targets[t].g, tg = targets[t].hsl; if (!tg) continue;
        var inBand = g.hue[0] <= g.hue[1] ? hue >= g.hue[0] && hue <= g.hue[1] : hue >= g.hue[0] || hue <= g.hue[1];
        if (inBand && hsl[1] >= (g.minSat || 0) && hsl[2] >= (g.minLight || 0) && hsl[2] <= (g.maxLight == null ? 1 : g.maxLight)) {
          var shift = tg[2] - (g.refLight || 0.5);
          return hslToRgb(tg[0], tg[1], clamp(hsl[2] + shift, 0.04, 0.96));
        }
      }
      return null;
    }
    for (var i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      var key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2], out = memo[key];
      if (out === undefined) out = memo[key] = mapColor(d[i], d[i + 1], d[i + 2]);
      if (out) { d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; }
    }
    x.putImageData(id, 0, 0);
  }
  function recolored(base, colors) {           // the whole sheet, for a fighter in a match
    var key = JSON.stringify(colors || {});
    if (base.recolors[key]) return base.recolors[key];
    var c = document.createElement("canvas"); c.width = base.img.width; c.height = base.img.height;
    var x = c.getContext("2d"); x.drawImage(base.img, 0, 0);
    recolorInto(x, c.width, c.height, base.def.palette || {}, colors);
    return (base.recolors[key] = c);
  }
  function recoloredFrame(base, colors, fr) {  // one frame, for a portrait: cheap on character select
    var c = document.createElement("canvas"), r = fr.rect; c.width = r[2]; c.height = r[3];
    var x = c.getContext("2d"); x.drawImage(base.img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
    recolorInto(x, c.width, c.height, base.def.palette || {}, colors);
    return c;
  }

  // ---------------------------------------------------------------- moves
  // Frame data in ticks (1/60 s). The animation's active window (atlas) splits its frames into
  // startup / active / recovery; these tick counts are spread over those frames.
  var CLASSES = {
    light:   { startup: 4, active: 3, recovery: 9,  damage: 6,  hitstun: 14, blockstun: 10, push: 2.2, hitstop: 4 },
    heavy:   { startup: 8, active: 4, recovery: 17, damage: 12, hitstun: 20, blockstun: 15, push: 3.4, hitstop: 7 },
    special: { startup: 6, active: 6, recovery: 20, damage: 14, hitstun: 22, blockstun: 17, push: 4.0, hitstop: 8, chip: 0.15 }
  };
  var NORMALS = {
    LP:  { anim: "jab",          cls: "light" },
    HP:  { anim: "straight",     cls: "heavy" },
    LK:  { anim: "kick_light",   cls: "light", damage: 7 },
    HK:  { anim: "kick_heavy",   cls: "heavy", damage: 13 },
    cLP: { anim: "crouch_punch", cls: "light", damage: 5 },
    cHP: { anim: "crouch_punch", cls: "heavy", damage: 9, startup: 6 },
    cLK: { anim: "crouch_kick",  cls: "light", damage: 6, low: true },
    cHK: { anim: "sweep",        cls: "heavy", damage: 10, low: true, knockdown: true, recovery: 22 },
    jLP: { anim: "jump_punch",   cls: "light", damage: 8, overhead: true },
    jHP: { anim: "jump_punch",   cls: "heavy", damage: 11, overhead: true },
    jLK: { anim: "jump_kick",    cls: "light", damage: 8, overhead: true },
    jHK: { anim: "jump_kick",    cls: "heavy", damage: 12, overhead: true }
  };
  // Motion inputs, in numpad notation relative to facing (6 = toward the opponent).
  var MOTIONS = { QCF: [2, 3, 6], QCB: [2, 1, 4], DP: [6, 2, 3], HCF: [4, 1, 2, 3, 6], HCB: [6, 3, 2, 1, 4] };

  function buildMove(spec, base) {
    var c = CLASSES[spec.cls || "light"] || CLASSES.light, m = {};
    for (var k in c) m[k] = c[k];
    for (var s in spec) m[s] = spec[s];
    var a = base.def.anims[m.anim];
    if (!a) return null;
    m.frames = a.frames.slice();
    var win = a.active || [0, a.frames.length - 1];
    // Ticks per frame: startup frames share `startup`, active frames share `active`, the rest `recovery`.
    var nS = win[0], nA = win[1] - win[0] + 1, nR = a.frames.length - win[1] - 1;
    m.ticks = []; m.activeFrom = 0; m.activeTo = 0; var t = 0;
    function spread(n, total) { var out = []; for (var i = 0; i < n; i++) out.push(Math.max(1, Math.round(total / Math.max(1, n)))); return out; }
    var tS = nS ? spread(nS, m.startup) : [], tA = spread(nA, m.active), tR = nR ? spread(nR, m.recovery) : [];
    if (!nS) tA[0] += m.startup;            // no startup art: hold the first active frame for the startup
    if (!nR) tA[tA.length - 1] += m.recovery;
    m.ticks = tS.concat(tA, tR);
    tS.forEach(function (x) { t += x; }); m.activeFrom = t; tA.forEach(function (x) { t += x; }); m.activeTo = t;
    tR.forEach(function (x) { t += x; }); m.total = t;
    m.activeOffset = win[0];
    // A projectile special throws a glowing orb at the start of its active window instead of striking.
    if (m.projectile) { var pj = m.projectile === true ? {} : m.projectile;
      m.projectile = { speed: clamp(+pj.speed || 3.4, 1.5, 6), size: clamp(+pj.size || 7, 3, 14), color: pj.color || null }; }
    return m;
  }

  // ---------------------------------------------------------------- input
  var KEYMAPS = {
    solo: { left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"], up: ["KeyW", "ArrowUp"], down: ["KeyS", "ArrowDown"],
            LP: ["KeyJ", "KeyZ"], HP: ["KeyK", "KeyX"], LK: ["KeyU", "KeyC"], HK: ["KeyI", "KeyV"] },
    p1:   { left: ["KeyA"], right: ["KeyD"], up: ["KeyW"], down: ["KeyS"], LP: ["KeyF"], HP: ["KeyG"], LK: ["KeyR"], HK: ["KeyT"] },
    p2:   { left: ["ArrowLeft"], right: ["ArrowRight"], up: ["ArrowUp"], down: ["ArrowDown"],
            LP: ["Numpad4", "KeyK"], HP: ["Numpad5", "KeyL"], LK: ["Numpad7", "Comma"], HK: ["Numpad8", "Period"] }
  };
  var BUTTONS = ["LP", "HP", "LK", "HK"];
  function Controls() { this.held = { left: 0, right: 0, up: 0, down: 0 }; this.edge = {}; this.down = {}; this.history = []; }
  Controls.prototype.dirFor = function (facing) {     // numpad direction relative to facing
    var h = this.held, fx = (h.right ? 1 : 0) - (h.left ? 1 : 0), fwd = fx * facing, v = h.up ? 1 : h.down ? -1 : 0;
    return v === 1 ? (fwd > 0 ? 9 : fwd < 0 ? 7 : 8) : v === -1 ? (fwd > 0 ? 3 : fwd < 0 ? 1 : 2) : (fwd > 0 ? 6 : fwd < 0 ? 4 : 5);
  };
  Controls.prototype.motion = function (name, now) {  // was this motion done in the last ~14 ticks?
    var seq = MOTIONS[name]; if (!seq) return false; var i = seq.length - 1;
    for (var k = this.history.length - 1; k >= 0 && i >= 0; k--) {
      var e = this.history[k]; if (now - e.t > 14 + seq.length * 3) break;
      if (e.d === seq[i]) i--;
    }
    return i < 0;
  };

  // ---------------------------------------------------------------- fighter
  function Fighter(def, base, side, game) {
    this.def = def; this.base = base; this.side = side; this.game = game;
    this.name = def.name || "Fighter"; this.maxHp = def.health || 100;
    this.sheet = recolored(base, def.colors);
    // The body's feel (atlas "feel"): push-box half-width, walk and jump speed. A big body is wider and slower.
    var feel = base.def.feel || {};
    this.body = feel.body || BODY; this.walkSpeed = feel.walk || 1; this.jumpPower = feel.jump || 1;
    this.scale = base.def.drawScale || SCALE;
    this.glow = brightest(def.colors) || "#8fd8ff";      // its projectiles' colour
    this.moves = {};
    var over = def.moves || {};
    for (var k in NORMALS) { var spec = {}; var n = NORMALS[k]; for (var a in n) spec[a] = n[a]; var o = over[k] || {}; for (var b in o) spec[b] = o[b]; var m = buildMove(spec, base); if (m) this.moves[k] = m; }
    this.specials = (def.specials || []).map(function (s) {
      var spec = { cls: "special" }; for (var q in s) spec[q] = s[q];
      var parts = String(s.input || "QCF+P").toUpperCase().split("+");
      spec.motion = parts[0]; spec.button = parts[1] || "P";
      var m = buildMove(spec, base); return m;
    }).filter(Boolean);
    // Check longer motions first: a half circle ends in a quarter circle, and DP beats QCF.
    var PRIO = { HCF: 0, HCB: 0, DP: 1, QCF: 2, QCB: 2 };
    this.specials = this.specials.map(function (m, i) { return [m, i]; })
      .sort(function (a, b) { return ((PRIO[a[0].motion] || 3) - (PRIO[b[0].motion] || 3)) || a[1] - b[1]; }).map(function (x) { return x[0]; });
    this.reset(side);
  }
  Fighter.prototype.reset = function (side) {
    this.hp = this.maxHp; this.shownHp = this.maxHp;
    this.x = side === 0 ? STAGE_W / 2 - 75 : STAGE_W / 2 + 75; this.y = 0; this.vx = 0; this.vy = 0;
    this.facing = side === 0 ? 1 : -1; this.state = "stand"; this.anim = "idle"; this.fi = 0; this.ft = 0; this.t = 0;
    this.move = null; this.mt = 0; this.hitThisMove = false; this.stun = 0; this.combo = 0; this.airAttackUsed = false;
    this.buffer = null; this.invuln = 0; this.crouching = false; this.proj = null; this.fired = false;
  };
  Fighter.prototype.setAnim = function (name, restart) {
    if (this.anim === name && !restart) return; this.anim = name; this.fi = 0; this.ft = 0;
  };
  Fighter.prototype.frame = function () {
    var a = this.base.def.anims[this.anim] || this.base.def.anims.idle;
    return this.base.def.frames[a.frames[Math.min(this.fi, a.frames.length - 1)]];
  };
  Fighter.prototype.tickAnim = function () {
    if (this.state === "attack") return;              // attacks are driven by move ticks
    var a = this.base.def.anims[this.anim]; if (!a) return;
    var per = a.per || { walk_fwd: 4, walk_back: 5, idle: 7, jump_air: 5, jump_start: 3, knockdown: 3, ko: 4, getup: 3, win: 6, hit_high: 3, hit_low: 3 }[this.anim] || 4;
    if (++this.ft >= per) { this.ft = 0;
      if (this.fi < a.frames.length - 1) this.fi++;
      else if (a.loop) this.fi = 0; }
  };
  Fighter.prototype.box = function (b) {               // atlas box -> world box
    if (!b) return null; var k = this.scale, x0 = this.x + this.facing * b[0] * k, x1 = this.x + this.facing * b[2] * k;
    return [Math.min(x0, x1), this.y + b[1] * k, Math.max(x0, x1), this.y + b[3] * k];
  };
  Fighter.prototype.hurtbox = function () { return this.invuln > 0 || this.state === "knockdown" || this.state === "getup" || this.state === "ko" ? null : this.box(this.frame().hurt); };
  Fighter.prototype.hitbox = function () {
    if (this.state !== "attack" || this.hitThisMove || this.move.projectile || this.mt < this.move.activeFrom || this.mt >= this.move.activeTo) return null;
    return this.box(this.frame().hit) || this.box([0, -30, 22, -14]);
  };
  Fighter.prototype.canAct = function () { return this.state === "stand" || this.state === "crouch"; };
  Fighter.prototype.startMove = function (m, now) {
    this.state = "attack"; this.move = m; this.mt = 0; this.hitThisMove = false; this.fired = false; this.anim = m.anim; this.fi = 0;
    if (m.invuln) this.invuln = m.invuln;
    if (m.dash) this.vx = this.facing * m.dash * 1.6;
    if (m.rise && this.y === 0) this.vy = -m.rise * 1.6;
    this.game.sfx("whoosh", m.cls);
  };
  Fighter.prototype.updateAttack = function () {
    var m = this.move; this.mt++;
    var t = 0, k = 0; while (k < m.ticks.length - 1 && t + m.ticks[k] <= this.mt) { t += m.ticks[k]; k++; }
    this.fi = k;
    if (m.projectile && !this.fired && this.mt >= m.activeFrom) { this.fired = true; this.game.fire(this, m); }
    if (this.mt >= m.total) {
      this.move = null;
      if (this.y < 0) { this.state = "air"; this.setAnim("jump_air", true); }
      else { this.state = this.crouching ? "crouch" : "stand"; this.setAnim(this.crouching ? "crouch" : "idle", true); }
    }
  };

  // ---------------------------------------------------------------- CPU
  // react = ticks between decisions; aggro = chance a decision in range is an attack.
  var DIFFICULTY = { easy: { react: 32, block: 0.1, aa: 0.05, aggro: 0.22, special: 0.04 },
                     normal: { react: 20, block: 0.4, aa: 0.3, aggro: 0.38, special: 0.1 },
                     hard: { react: 10, block: 0.7, aa: 0.65, aggro: 0.58, special: 0.18 } };
  function CPU(level) { this.p = DIFFICULTY[level] || DIFFICULTY.normal; this.wait = 0; this.plan = null; this.hold = 0; }
  CPU.prototype.think = function (me, foe, ctl, now, projs) {
    var p = this.p; ctl.edge = {};
    var dist = Math.abs(foe.x - me.x), toward = foe.x > me.x ? "right" : "left", away = toward === "right" ? "left" : "right";
    if (this.hold > 0) { this.hold--; return; }
    ctl.held = { left: 0, right: 0, up: 0, down: 0 };
    // A projectile coming at us: decide once per projectile whether to block it, jump it or eat it.
    var q = (projs || []).filter(function (o) { return o.owner === foe && (o.x - me.x) * o.vx < 0 && Math.abs(o.x - me.x) < 120; })[0];
    if (q && me.canAct()) {
      if (!q.plan) { var r = Math.random(); q.plan = r < p.block ? "block" : r < p.block + p.aa * 0.6 ? "jump" : "none"; }
      if (q.plan === "block") { ctl.held[away] = 1; if (q.move.low) ctl.held.down = 1; this.hold = 6; return; }
      if (q.plan === "jump" && Math.abs(q.x - me.x) < 80) { q.plan = "none"; ctl.held.up = 1; ctl.held[toward] = 1; this.hold = 4; return; }
    }
    // Defend: the foe is attacking within reach, or jumping in.
    if (foe.state === "attack" && dist < 115 && Math.random() < p.block) { ctl.held[away] = 1; if (foe.move && foe.move.low) ctl.held.down = 1; this.hold = 10; return; }
    if (foe.y < -24 && foe.vx * (me.x - foe.x) > 0 && dist < 130 && Math.random() < p.aa) {
      var aa = me.specials.filter(function (s) { return s.motion === "DP"; })[0];
      if (aa && me.canAct()) { me.startMove(aa, now); this.hold = p.react; return; }
    }
    if (this.wait-- > 0) return;
    this.wait = p.react + Math.floor(Math.random() * p.react);
    if (!me.canAct()) return;
    if (dist > 125) {
      if (Math.random() < 0.08) { ctl.held.up = 1; ctl.held[toward] = 1; this.hold = 4; }
      else if (Math.random() < p.special) { var proj = me.specials.filter(function (s) { return s.motion === "QCF"; })[0]; if (proj) me.startMove(proj, now); }
      else { ctl.held[toward] = 1; this.hold = 12 + Math.floor(Math.random() * 18); }
      return;
    }
    if (Math.random() < p.aggro) {
      var pool = dist < 58 ? ["LP", "LK", "HP", "cLK", "cHK", "HK"] : ["HK", "HP", "cHK", "LK"];
      if (Math.random() < p.special && me.specials.length) { me.startMove(me.specials[Math.floor(Math.random() * me.specials.length)], now); return; }
      var b = pool[Math.floor(Math.random() * pool.length)];
      if (b[0] === "c") { ctl.held.down = 1; b = b.slice(1); }
      ctl.edge[b] = 1; this.hold = 2;
    } else if (Math.random() < 0.3) { ctl.held[away] = 1; this.hold = 10; }
    else { ctl.held[toward] = 1; this.hold = 8; }
  };

  // ---------------------------------------------------------------- audio (tiny synth)
  function Audio() { this.ctx = null; this.sound = true; this.music = true; this.musicNodes = null; }
  Audio.prototype.unlock = function () {
    if (this.ctx) return; var AC = G.AudioContext || G.webkitAudioContext; if (!AC) return;
    this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
  };
  Audio.prototype.noise = function (dur, freq, gain, q) {
    var c = this.ctx; if (!c || !this.sound) return; var n = c.createBufferSource(), len = Math.max(1, Math.floor(c.sampleRate * dur));
    var buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    n.buffer = buf; var f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q || 1;
    var g = c.createGain(); g.gain.value = gain; n.connect(f); f.connect(g); g.connect(this.master); n.start();
  };
  Audio.prototype.tone = function (f0, f1, dur, gain, type) {
    var c = this.ctx; if (!c || !this.sound) return; var o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
    o.type = type || "square"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur);
  };
  Audio.prototype.sfx = function (kind, weight) {
    if (kind === "whoosh") this.noise(0.12, weight === "light" ? 2400 : 1500, 0.18, 2);
    else if (kind === "hit") { this.noise(0.09, weight === "light" ? 1800 : 900, 0.5, 1.5); this.tone(weight === "light" ? 220 : 140, 60, 0.12, 0.25, "triangle"); }
    else if (kind === "block") this.tone(900, 600, 0.06, 0.12, "square");
    else if (kind === "ko") { this.tone(160, 40, 0.8, 0.4, "sawtooth"); this.noise(0.5, 400, 0.4, 0.7); }
    else if (kind === "bell") this.tone(880, 860, 0.35, 0.2, "triangle");
    else if (kind === "land") this.noise(0.05, 300, 0.15, 1);
    else if (kind === "fireball") { this.noise(0.28, 650, 0.22, 0.8); this.tone(260, 820, 0.2, 0.1, "sawtooth"); }
  };
  Audio.prototype.startMusic = function () {
    var c = this.ctx; if (!c || this.musicNodes || !this.music) return;
    var g = c.createGain(); g.gain.value = 0.07; g.connect(this.master);
    var bass = [55, 55, 65.4, 49, 55, 55, 73.4, 65.4], step = 0.22, self = this, i = 0;
    function beat() {
      if (!self.musicNodes) return; var t = c.currentTime, o = c.createOscillator(), og = c.createGain();
      o.type = "sawtooth"; o.frequency.value = bass[i % bass.length] * (i % 16 < 8 ? 1 : 1.5);
      og.gain.setValueAtTime(0.9, t); og.gain.exponentialRampToValueAtTime(0.01, t + step * 0.9); o.connect(og); og.connect(g); o.start(t); o.stop(t + step);
      if (i % 2 === 0) { var h = c.createOscillator(), hg = c.createGain(); h.type = "square"; h.frequency.value = bass[(i + 3) % bass.length] * 4;
        hg.gain.setValueAtTime(0.25, t); hg.gain.exponentialRampToValueAtTime(0.01, t + step * 0.5); h.connect(hg); hg.connect(g); h.start(t); h.stop(t + step); }
      i++;
    }
    this.musicNodes = { g: g, timer: setInterval(beat, step * 1000) };
  };
  Audio.prototype.stopMusic = function () { if (!this.musicNodes) return; clearInterval(this.musicNodes.timer); this.musicNodes.g.disconnect(); this.musicNodes = null; };

  // ---------------------------------------------------------------- stage painter
  // A stage is data: { name, theme, sky: [top, bottom], floor, accent }. Themes give the far and
  // mid layers their shapes; colors and the seed (the stage name) make each one its own.
  function paintStage(stage, R) {
    R = R || 1;
    var c = document.createElement("canvas"); c.width = STAGE_W * R; c.height = H * R;
    var x = c.getContext("2d"), r = rng(hashSeed(stage.name || "stage")); x.scale(R, R);
    var sky = stage.sky || ["#1b2440", "#f08a5d"], floor = stage.floor || "#2c2633", accent = stage.accent || "#ffd27a";
    var g = x.createLinearGradient(0, 0, 0, FLOOR); g.addColorStop(0, sky[0]); g.addColorStop(1, sky[1] || sky[0]);
    x.fillStyle = g; x.fillRect(0, 0, STAGE_W, H);
    var theme = stage.theme || "city";
    if (stage.sun !== false) { x.fillStyle = accent; x.globalAlpha = 0.85; x.beginPath(); x.arc(STAGE_W * (0.25 + r() * 0.5), 38 + r() * 30, 14 + r() * 10, 0, 7); x.fill(); x.globalAlpha = 1; }
    function shade(hex, f) { var c3 = hexToRgb(hex) || [40, 40, 50]; return "rgb(" + c3.map(function (v) { return Math.round(v * f); }).join(",") + ")"; }
    var far = shade(sky[0], 0.55), mid = shade(floor, 0.8);
    if (theme === "space") {            // stars and a ringed planet instead of a skyline
      for (var st = 0; st < 160; st++) { x.fillStyle = "rgba(255,255,255," + (0.3 + r() * 0.7).toFixed(2) + ")"; x.fillRect(Math.floor(r() * STAGE_W), Math.floor(r() * (FLOOR - 40)), 1, 1); }
      var px = STAGE_W * (0.2 + r() * 0.6), py = 60 + r() * 30; x.fillStyle = shade(accent, 0.8); x.beginPath(); x.arc(px, py, 26, 0, 7); x.fill();
      x.strokeStyle = shade(accent, 1.1); x.lineWidth = 2; x.beginPath(); x.ellipse(px, py, 44, 8, -0.3, 0, 7); x.stroke();
    }
    x.fillStyle = far;
    if (theme === "space") { /* no far layer */ }
    else if (theme === "desert") { for (var dn = 0; dn < 6; dn++) { var dx = r() * STAGE_W, dw = 120 + r() * 140, dh = 18 + r() * 26; x.beginPath(); x.ellipse(dx, FLOOR - 36, dw, dh, 0, Math.PI, 0); x.fill(); }
      x.fillStyle = mid; for (var me = 0; me < 3; me++) { var mx = r() * STAGE_W; x.fillRect(mx, FLOOR - 36 - 50, 60 + r() * 40, 50); } }
    else if (theme === "mountains" || theme === "temple" || theme === "forest") {
      for (var m = 0; m < 7; m++) { var cx = r() * STAGE_W, w = 90 + r() * 120, h = 50 + r() * 60; x.beginPath(); x.moveTo(cx - w, FLOOR - 40); x.lineTo(cx, FLOOR - 40 - h); x.lineTo(cx + w, FLOOR - 40); x.fill(); }
    } else {
      for (var b = 0; b < STAGE_W; b += 14 + r() * 22) { var bh = 30 + r() * 70; x.fillRect(b, FLOOR - 36 - bh, 12 + r() * 18, bh); }
    }
    x.fillStyle = mid;
    if (theme === "temple") { for (var p = 40; p < STAGE_W; p += 110) { x.fillRect(p, FLOOR - 70, 10, 70); x.fillRect(p + 60, FLOOR - 70, 10, 70); x.fillRect(p - 8, FLOOR - 78, 86, 8); } }
    else if (theme === "harbor") { for (var s = 0; s < 5; s++) { var sx = r() * STAGE_W; x.fillRect(sx, FLOOR - 52, 46, 14); x.fillRect(sx + 18, FLOOR - 84, 3, 32); } x.fillStyle = shade(sky[1] || sky[0], 0.6); x.fillRect(0, FLOOR - 38, STAGE_W, 10); }
    else if (theme === "forest") { for (var f = 0; f < STAGE_W; f += 26 + r() * 20) { x.beginPath(); x.moveTo(f, FLOOR - 36); x.lineTo(f + 14, FLOOR - 96 - r() * 30); x.lineTo(f + 28, FLOOR - 36); x.fill(); } }
    else if (theme === "dojo") { x.fillRect(0, FLOOR - 92, STAGE_W, 6); for (var d = 0; d < STAGE_W; d += 64) x.fillRect(d, FLOOR - 92, 6, 92); }
    else if (theme === "desert" || theme === "space") { /* mid layer drawn above */ }
    else if (theme === "rooftop") { for (var t = 30; t < STAGE_W; t += 150 + r() * 80) { x.fillRect(t, FLOOR - 92, 30, 26); x.fillRect(t + 4, FLOOR - 66, 4, 30); x.fillRect(t + 22, FLOOR - 66, 4, 30); }
      x.fillStyle = shade(floor, 1.2); x.fillRect(0, FLOOR - 40, STAGE_W, 4); }
    else { for (var bb = 0; bb < STAGE_W; bb += 30 + r() * 40) { var h2 = 20 + r() * 40; x.fillRect(bb, FLOOR - 36 - h2, 26, h2); x.fillStyle = accent; x.globalAlpha = 0.5; for (var wy = FLOOR - 32 - h2; wy < FLOOR - 40; wy += 8) if (r() < 0.5) x.fillRect(bb + 4 + Math.floor(r() * 3) * 7, wy, 3, 3); x.globalAlpha = 1; x.fillStyle = mid; } }
    // floor with perspective lines
    x.fillStyle = floor; x.fillRect(0, FLOOR - 36, STAGE_W, H - FLOOR + 36);
    x.strokeStyle = shade(floor, 1.35); x.globalAlpha = 0.35; x.lineWidth = 1;
    for (var lx = -STAGE_W; lx < STAGE_W * 2; lx += 40) { x.beginPath(); x.moveTo(STAGE_W / 2 + (lx - STAGE_W / 2) * 0.35, FLOOR - 36); x.lineTo(lx, H); x.stroke(); }
    for (var ly = FLOOR - 36; ly < H; ly += 6 + (ly - FLOOR + 36) * 0.4) { x.beginPath(); x.moveTo(0, ly); x.lineTo(STAGE_W, ly); x.stroke(); }
    x.globalAlpha = 1;
    return c;
  }

  // ---------------------------------------------------------------- game
  function Game(root, game, opts) {
    this.root = root; this.data = game; this.opts = opts || {};
    this.audio = new Audio(); this.screen = "loading"; this.mode = "solo"; this.difficulty = game.cpu || "normal";
    this.roundsToWin = clamp(game.rounds || 2, 1, 5); this.roundTime = clamp(game.timer || 60, 20, 99);
    this.wins = [0, 0]; this.round = 1; this.now = 0; this.banner = null; this.freeze = 0; this.sparks = []; this.projectiles = [];
    this.ctl = [new Controls(), new Controls()]; this.cpu = null; this.keys = {}; this.taps = {}; this.paused = false;
    this.roster = (game.fighters || []).slice(0, 12);
    if (!this.roster.length) throw new Error("Versus Fighter: the game file has no fighters");
    this.stages = (game.stages && game.stages.length ? game.stages : [game.stage || { name: game.title || "Arena" }]);
    this.picks = [0, Math.min(1, this.roster.length - 1)];
    this.build();
    var self = this, bases = {};
    this.roster.forEach(function (f) { bases[f.base || "ava"] = 1; });
    whenBasesReady(Object.keys(bases), function () { self.showCard(); self.loop(); });
  }

  Game.prototype.build = function () {
    var r = this.root; r.classList.add("vf-root"); r.innerHTML = "";
    this.canvas = el("canvas", "vf-canvas"); this.canvas.width = W; this.canvas.height = H; this.R = 1;
    this.ctx = this.canvas.getContext("2d"); this.ctx.imageSmoothingEnabled = false;
    // "look": "pixel" keeps the chunky retro pixels; the default draws at the screen's resolution.
    this.pixel = (this.data.look || this.opts.look) === "pixel";
    if (!this.pixel) this.canvas.style.imageRendering = "auto";
    this.layer = el("div", "vf-layer");
    r.appendChild(this.canvas); r.appendChild(this.layer);
    var self = this;
    this.onKey = function (e) {
      var down = e.type === "keydown";
      if (/^(Arrow|Space)/.test(e.code)) e.preventDefault();
      if (down && (e.code === "Escape" || e.code === "KeyP") && self.screen === "fight") { self.togglePause(); return; }
      if (down && e.code === "KeyM") { self.audio.music = !self.audio.music; if (self.audio.music) self.audio.startMusic(); else self.audio.stopMusic(); self.refreshToggles(); }
      self.keys[e.code] = down;
      if (down && !e.repeat) self.taps[e.code] = 1;   // a tap shorter than one tick still counts
    };
    G.addEventListener("keydown", this.onKey); G.addEventListener("keyup", this.onKey);
    G.addEventListener("blur", function () { self.keys = {}; if (self.screen === "fight" && !self.paused) self.togglePause(); });
    this.resize = function () {
      var bw = r.clientWidth || W, bh = r.clientHeight || H, s = Math.min(bw / W, bh / H);
      // Pixel look on desktop: whole or half steps keep every pixel the same size. Phones fill the screen.
      if (self.pixel && s >= 1 && !self.touch) s = Math.floor(s * 2) / 2;
      self.canvas.style.width = Math.round(W * s) + "px"; self.canvas.style.height = Math.round(H * s) + "px";
      // Sharp look: the canvas has as many pixels as the screen shows (capped: 3x the game's
      // 384 x 216 on touch devices, 5x on desktops). The game itself still runs in W x H units.
      var R = self.pixel ? 1 : clamp(Math.round(s * (G.devicePixelRatio || 1)), 1, self.touch ? 3 : 5);
      if (R !== self.R) { self.R = R; self.canvas.width = W * R; self.canvas.height = H * R; self.attract = null; }
    };
    this.touch = ("ontouchstart" in G) || (navigator.maxTouchPoints || 0) > 0;
    G.addEventListener("resize", this.resize); this.resize();
    if (this.touch) this.buildTouch();
  };

  // ---- overlays
  Game.prototype.panel = function (cls) { this.layer.innerHTML = ""; var p = el("div", "vf-panel " + (cls || "")); this.layer.appendChild(p); return p; };
  Game.prototype.controlsText = function () {
    return this.mode === "versus"
      ? ["Player 1: W A S D to move · F G punch · R T kick", "Player 2: arrows to move · K L (or numpad 4 5) punch · , . (or numpad 7 8) kick"]
      : ["Move: arrows or W A S D (up jumps, down crouches, hold back to block)",
         "Punch: J light · K heavy (or Z X)   Kick: U light · I heavy (or C V)",
         "Specials: down, down-forward, forward + punch · forward, down, down-forward + punch · down, down-back, back + kick"];
  };
  Game.prototype.showCard = function () {
    this.screen = "card"; var self = this, d = this.data, p = this.panel("vf-card");
    p.appendChild(el("h1", "", d.title || "Versus"));
    if (d.tagline) p.appendChild(el("p", "vf-tag", d.tagline));
    var modes = el("div", "vf-row");
    [["solo", "1 player vs CPU"], ["versus", "2 players"]].forEach(function (m) {
      var b = el("button", "vf-chip" + (self.mode === m[0] ? " on" : ""), m[1]); b.onclick = function () { self.mode = m[0]; self.showCard(); }; modes.appendChild(b); });
    p.appendChild(modes);
    if (this.mode === "solo") { var dif = el("div", "vf-row");
      ["easy", "normal", "hard"].forEach(function (v) { var b = el("button", "vf-chip" + (self.difficulty === v ? " on" : ""), v[0].toUpperCase() + v.slice(1)); b.onclick = function () { self.difficulty = v; self.showCard(); }; dif.appendChild(b); });
      p.appendChild(dif); }
    var ctl = el("div", "vf-controls"); (this.touch ? ["Touch: the pad moves and blocks (hold away), the four buttons attack"] : this.controlsText()).forEach(function (t) { ctl.appendChild(el("div", "", t)); });
    p.appendChild(ctl);
    p.appendChild(this.toggles());
    var go = el("button", "vf-go", "Start"); go.onclick = function () { self.audio.unlock(); self.audio.startMusic(); self.afterCard(); }; p.appendChild(go);
    p.appendChild(this.credits());
    setTimeout(function () { try { go.focus(); } catch (e) {} }, 0);
  };
  Game.prototype.toggles = function () {
    var self = this, row = el("div", "vf-row vf-toggles");
    var mu = el("button", "vf-chip" + (this.audio.music ? " on" : ""), "Music " + (this.audio.music ? "on" : "off"));
    mu.onclick = function () { self.audio.music = !self.audio.music; if (self.audio.music) { self.audio.unlock(); self.audio.startMusic(); } else self.audio.stopMusic(); mu.textContent = "Music " + (self.audio.music ? "on" : "off"); mu.classList.toggle("on", self.audio.music); };
    var so = el("button", "vf-chip" + (this.audio.sound ? " on" : ""), "Sound " + (this.audio.sound ? "on" : "off"));
    so.onclick = function () { self.audio.sound = !self.audio.sound; so.textContent = "Sound " + (self.audio.sound ? "on" : "off"); so.classList.toggle("on", self.audio.sound); };
    row.appendChild(mu); row.appendChild(so); this.toggleRow = row; return row;
  };
  Game.prototype.refreshToggles = function () { if (this.toggleRow && this.toggleRow.isConnected) { var b = this.toggleRow.children[0]; b.textContent = "Music " + (this.audio.music ? "on" : "off"); b.classList.toggle("on", this.audio.music); } };
  Game.prototype.credits = function () {
    var seen = {}, lines = ["Engine: mChatAI Versus Fighter " + VERSION];
    this.roster.forEach(function (f) { var b = BASES[f.base || "ava"]; if (b && !seen[b.def.base]) { seen[b.def.base] = 1; lines.push("Art: " + (b.def.credit || b.def.base)); } });
    var c = el("div", "vf-credits"); lines.forEach(function (t) { c.appendChild(el("div", "", t)); }); return c;
  };
  Game.prototype.afterCard = function () { if (this.roster.length > 2) this.showSelect(0); else this.startMatch(); };
  Game.prototype.showSelect = function (who) {
    this.screen = "select"; var self = this, p = this.panel("vf-select");
    p.appendChild(el("h2", "", this.mode === "versus" ? "Player " + (who + 1) + ", choose" : "Choose your fighter"));
    var grid = el("div", "vf-grid");
    this.roster.forEach(function (f, i) {
      var card = el("button", "vf-pick"), cv = el("canvas"); cv.width = 128; cv.height = 128; if (!self.pixel) cv.style.imageRendering = "auto";
      var base = BASES[f.base || "ava"], fr = base.def.frames[base.def.anims.idle.frames[0]], sheet = recoloredFrame(base, f.colors, fr), an = fr.anchor || base.def.anchor;
      var ps = (base.def.drawScale || SCALE) / SCALE;   // a full-size base is halved to fit the card
      var cx = cv.getContext("2d"); cx.scale(2, 2); cx.imageSmoothingEnabled = !self.pixel || ps < 1; cx.imageSmoothingQuality = "high"; cx.drawImage(sheet, 0, 0, fr.rect[2], fr.rect[3], 32 - an[0] * ps, 62 - an[1] * ps, fr.rect[2] * ps, fr.rect[3] * ps);
      card.appendChild(cv); card.appendChild(el("span", "", f.name || "Fighter"));
      if (f.style) card.appendChild(el("small", "", f.style));
      card.onclick = function () {
        self.picks[who] = i;
        if (self.mode === "versus" && who === 0) self.showSelect(1);
        else { if (self.mode === "solo") { var others = self.roster.map(function (_, k) { return k; }).filter(function (k) { return k !== i; }); self.picks[1] = others.length ? others[Math.floor(Math.random() * others.length)] : i; } self.startMatch(); }
      };
      grid.appendChild(card);
    });
    p.appendChild(grid);
  };
  Game.prototype.startMatch = function () {
    this.layer.innerHTML = ""; this.wins = [0, 0]; this.round = 1;
    var d0 = this.roster[this.picks[0]], d1 = this.roster[this.picks[1]];
    var c1 = d1.colors; if (this.picks[0] === this.picks[1]) c1 = d1.altColors || { top: "#4aa3ff", pants: "#2b2b2b" };   // mirror match: second outfit
    var d1b = {}; for (var k in d1) d1b[k] = d1[k]; d1b.colors = c1;
    this.f = [new Fighter(d0, BASES[d0.base || "ava"], 0, this), new Fighter(d1b, BASES[d1.base || "ava"], 1, this)];
    this.cpu = this.mode === "solo" ? new CPU(this.difficulty) : null;
    this.stage = this.stages[Math.floor(Math.random() * this.stages.length)];
    this.stageImg = paintStage(this.stage, this.R); this.stageR = this.R;
    this.startRound();
  };
  Game.prototype.startRound = function () {
    this.f[0].reset(0); this.f[1].reset(1); this.timer = this.roundTime; this.timerTicks = 0; this.sparks = []; this.projectiles = [];
    this.screen = "intro"; this.introT = 0; this.banner = { text: "Round " + this.round, sub: null, t: 0 }; this.audio.sfx("bell");
  };
  Game.prototype.togglePause = function () {
    var self = this;
    if (this.paused) { this.paused = false; this.layer.innerHTML = ""; if (this.touchEl) this.touchEl.style.display = ""; return; }
    this.paused = true; var p = this.panel("vf-pause");
    p.appendChild(el("h2", "", "Paused"));
    var res = el("button", "vf-go", "Resume"); res.onclick = function () { self.togglePause(); }; p.appendChild(res);
    p.appendChild(this.toggles());
    var ctl = el("div", "vf-controls"); (this.touch ? ["Touch: the pad moves and blocks (hold away), the four buttons attack"] : this.controlsText()).forEach(function (t) { ctl.appendChild(el("div", "", t)); }); p.appendChild(ctl);
    var menu = el("button", "vf-chip", "Main menu"); menu.onclick = function () { self.paused = false; self.showCard(); }; p.appendChild(menu);
    p.appendChild(this.credits());
  };
  Game.prototype.showResult = function (winner) {
    this.screen = "result"; var self = this, p = this.panel("vf-result");
    p.appendChild(el("h2", "", winner == null ? "Draw" : this.f[winner].name + " wins the match"));
    var again = el("button", "vf-go", "Rematch"); again.onclick = function () { self.startMatch(); }; p.appendChild(again);
    if (this.roster.length > 2) { var sel = el("button", "vf-chip", "Choose fighters"); sel.onclick = function () { self.showSelect(0); }; p.appendChild(sel); }
    var menu = el("button", "vf-chip", "Main menu"); menu.onclick = function () { self.showCard(); }; p.appendChild(menu);
  };

  // ---- touch
  Game.prototype.buildTouch = function () {
    var self = this, t = el("div", "vf-touch"), pad = el("div", "vf-pad"), knob = el("div", "vf-knob"), btns = el("div", "vf-btns");
    pad.appendChild(knob); t.appendChild(pad); t.appendChild(btns); this.root.appendChild(t); this.touchEl = t;
    this.touchHeld = { left: 0, right: 0, up: 0, down: 0 }; this.touchEdge = {};
    function padMove(e) {
      var r = pad.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 2 - 1, y = (e.clientY - r.top) / r.height * 2 - 1;
      self.touchHeld = { left: x < -0.35 ? 1 : 0, right: x > 0.35 ? 1 : 0, up: y < -0.45 ? 1 : 0, down: y > 0.45 ? 1 : 0 };
      knob.style.transform = "translate(" + clamp(x, -1, 1) * 30 + "px," + clamp(y, -1, 1) * 30 + "px)";
    }
    function padEnd() { self.touchHeld = { left: 0, right: 0, up: 0, down: 0 }; knob.style.transform = ""; }
    pad.addEventListener("pointerdown", function (e) { pad.setPointerCapture(e.pointerId); padMove(e); e.preventDefault(); });
    pad.addEventListener("pointermove", function (e) { if (e.buttons || e.pointerType === "touch") padMove(e); });
    pad.addEventListener("pointerup", padEnd); pad.addEventListener("pointercancel", padEnd);
    [["LP", "Jab"], ["HP", "Punch"], ["LK", "Kick"], ["HK", "Heavy kick"]].forEach(function (b) {
      var e = el("button", "vf-tb", b[1]); e.addEventListener("pointerdown", function (ev) { self.touchEdge[b[0]] = 1; ev.preventDefault(); }); btns.appendChild(e); });
  };

  // ---- input sampling
  Game.prototype.sample = function () {
    var self = this, keys = this.keys, taps = this.taps, pads = (navigator.getGamepads ? navigator.getGamepads() : []) || [];
    function fromMap(ctl, map, pad) {
      var held = {}; ["left", "right", "up", "down"].forEach(function (k) { held[k] = map[k].some(function (c) { return keys[c]; }) ? 1 : 0; });
      var down = {}; BUTTONS.forEach(function (b) { down[b] = map[b].some(function (c) { return keys[c]; }); });
      if (pad) { var ax = pad.axes || [], bt = pad.buttons || [];
        held.left |= (ax[0] < -0.5 || (bt[14] && bt[14].pressed)) ? 1 : 0; held.right |= (ax[0] > 0.5 || (bt[15] && bt[15].pressed)) ? 1 : 0;
        held.up |= (ax[1] < -0.5 || (bt[12] && bt[12].pressed)) ? 1 : 0; held.down |= (ax[1] > 0.5 || (bt[13] && bt[13].pressed)) ? 1 : 0;
        down.LP = down.LP || !!(bt[2] && bt[2].pressed); down.HP = down.HP || !!(bt[3] && bt[3].pressed); down.LK = down.LK || !!(bt[0] && bt[0].pressed); down.HK = down.HK || !!(bt[1] && bt[1].pressed); }
      ctl.held = held; ctl.edge = {};
      BUTTONS.forEach(function (b) { if ((down[b] && !ctl.down[b]) || map[b].some(function (c) { return taps[c]; })) ctl.edge[b] = 1; ctl.down[b] = down[b]; });
    }
    if (this.mode === "solo") {
      fromMap(this.ctl[0], KEYMAPS.solo, pads[0]);
      if (this.touchHeld) { var h = this.ctl[0].held; for (var k in this.touchHeld) h[k] |= this.touchHeld[k]; for (var e in this.touchEdge) this.ctl[0].edge[e] = 1; this.touchEdge = {}; }
    } else { fromMap(this.ctl[0], KEYMAPS.p1, pads[0]); fromMap(this.ctl[1], KEYMAPS.p2, pads[1]); }
    this.taps = {};
    for (var i = 0; i < 2; i++) { var c = this.ctl[i], f = this.f[i], d = c.dirFor(f.facing), hist = c.history;
      if (!hist.length || hist[hist.length - 1].d !== d) { hist.push({ d: d, t: this.now }); if (hist.length > 24) hist.shift(); } }
  };

  // ---- simulation
  Game.prototype.step = function () {
    this.now++;
    if (this.screen !== "intro" && this.screen !== "fight" && this.screen !== "ko") return;
    if (this.paused) return;
    this.sample();
    if (this.screen === "intro") {
      this.introT++;
      if (this.introT === 70) { this.banner = { text: "Fight!", t: 0 }; this.audio.sfx("bell"); }
      if (this.introT > 100) { this.screen = "fight"; this.banner = null; }
    }
    if (this.freeze > 0) { this.freeze--; this.updateSparks(); return; }
    var p1 = this.f[0], p2 = this.f[1];
    if (this.screen === "fight" && this.cpu) this.cpu.think(p2, p1, this.ctl[1], this.now, this.projectiles);
    for (var i = 0; i < 2; i++) this.control(this.f[i], this.ctl[i], this.f[1 - i]);
    for (var j = 0; j < 2; j++) this.physics(this.f[j], this.f[1 - j]);
    this.separate(p1, p2);
    this.updateProjectiles();
    this.collide(p1, p2);
    for (var k = 0; k < 2; k++) { var f = this.f[k]; f.tickAnim(); if (f.invuln > 0) f.invuln--; f.shownHp += (f.hp - f.shownHp) * 0.06; }
    this.updateSparks();
    if (this.screen === "fight") {
      if (++this.timerTicks >= 60) { this.timerTicks = 0; if (--this.timer <= 0) this.endRound(null, "Time"); }
      if (p1.hp <= 0 || p2.hp <= 0) this.endRound(p1.hp <= 0 && p2.hp <= 0 ? null : p1.hp <= 0 ? 1 : 0, "K.O.");
    } else if (this.screen === "ko" && ++this.koT > 150) {
      if (this.wins[0] >= this.roundsToWin || this.wins[1] >= this.roundsToWin) this.showResult(this.wins[0] === this.wins[1] ? null : this.wins[0] > this.wins[1] ? 0 : 1);
      else { this.round++; this.startRound(); }
    }
  };
  Game.prototype.control = function (f, ctl, foe) {
    if (this.screen !== "fight") { if (this.screen === "intro" && f.state === "stand") f.setAnim("idle"); return; }
    var held = ctl.held, fwd = ((held.right ? 1 : 0) - (held.left ? 1 : 0)) * f.facing, now = this.now;
    var pressed = null; BUTTONS.forEach(function (b) { if (ctl.edge[b]) pressed = pressed || b; });
    if (pressed) f.buffer = { b: pressed, t: now };
    if (f.buffer && now - f.buffer.t > 5) f.buffer = null;
    // Special cancel: a special motion during a normal that has hit.
    if (f.state === "attack" && f.hitThisMove && f.move && f.move.cls !== "special" && f.buffer) { var sp = this.findSpecial(f, ctl, f.buffer.b, now); if (sp) { f.buffer = null; f.startMove(sp, now); return; } }
    if (f.state === "air" && f.buffer && !f.airAttackUsed) { var am = f.moves["j" + f.buffer.b]; if (am) { f.buffer = null; f.airAttackUsed = true; f.startMove(am, now); return; } }
    if (!f.canAct()) return;
    f.facing = foe.x >= f.x ? 1 : -1;
    if (f.buffer) {
      var b = f.buffer.b, special = this.findSpecial(f, ctl, b, now);
      f.buffer = null;
      if (special) { f.startMove(special, now); return; }
      var m = f.moves[(held.down ? "c" : "") + b] || f.moves[b];
      if (m) { f.crouching = !!held.down; f.startMove(m, now); return; }
    }
    if (held.up) { f.state = "jumpsquat"; f.jumpDir = fwd; f.squat = 3; f.setAnim("jump_start", true); return; }
    if (held.down) { if (f.state !== "crouch") { f.state = "crouch"; f.setAnim("crouch", true); } f.crouching = true; f.vx = 0; return; }
    f.crouching = false; f.state = "stand";
    f.vx = (fwd > 0 ? 2.3 : fwd < 0 ? -1.8 : 0) * f.walkSpeed * f.facing;
    f.setAnim(fwd > 0 ? "walk_fwd" : fwd < 0 ? "walk_back" : "idle");
  };
  Game.prototype.findSpecial = function (f, ctl, button, now) {
    var kind = button[1] === "P" ? "P" : "K";
    for (var i = 0; i < f.specials.length; i++) { var s = f.specials[i];
      if (s.projectile && f.proj) continue;               // one projectile on screen per fighter
      if ((s.button === kind || s.button === button) && ctl.motion(s.motion, now)) return s; }
    return null;
  };
  Game.prototype.physics = function (f, foe) {
    if (f.state === "jumpsquat") { if (--f.squat <= 0) { f.state = "air"; f.vy = -8.2 * f.jumpPower; f.vx = (f.jumpDir > 0 ? 2.7 : f.jumpDir < 0 ? -2.7 : 0) * f.jumpPower * f.facing; f.airAttackUsed = false; f.setAnim("jump_air", true); } return; }
    if (f.state === "attack") { f.updateAttack(); if (f.move && f.move.dash && f.mt > f.move.activeTo) f.vx *= 0.8; }
    if (f.state === "hitstun" || f.state === "blockstun") { if (--f.stun <= 0) { f.state = f.crouching ? "crouch" : "stand"; f.setAnim(f.crouching ? "crouch" : "idle", true); f.combo = 0; } f.vx *= 0.82; }
    if (f.state === "knockdown") { if (f.y === 0) f.vx *= 0.85; if (--f.stun <= 0 && f.y === 0) { if (f.hp <= 0) { f.state = "ko"; } else { f.state = "getup"; f.stun = 24; f.setAnim("getup", true); } } }
    else if (f.state === "getup") { if (--f.stun <= 0) { f.state = "stand"; f.invuln = 8; f.setAnim("idle", true); f.combo = 0; } }
    // gravity
    if (f.y < 0 || f.vy < 0) { f.vy += 0.4; f.y += f.vy; if (f.y >= 0) { f.y = 0; f.vy = 0; this.audio.sfx("land");
      if (f.state === "air" || (f.state === "attack" && f.move && f.move.overhead)) { f.state = "stand"; f.move = null; f.setAnim("idle", true); }
      if (f.state === "hitstun" && f.airHit) { f.state = "knockdown"; f.stun = 30; f.setAnim("knockdown", true); f.fi = 6; } } }
    if (f.state === "stand" && f.anim === "idle" && Math.abs(f.vx) < 0.1) f.vx = 0;
    f.x = clamp(f.x + f.vx, EDGE, STAGE_W - EDGE);
    if (f.state === "air" || f.state === "hitstun" || f.state === "knockdown") { /* keep momentum */ } else if (f.state !== "attack" && f.state !== "stand") f.vx = 0;
  };
  Game.prototype.separate = function (a, b) {
    if (a.state === "ko" || b.state === "ko") return;
    var dx = b.x - a.x, need = a.body + b.body; if (Math.abs(dx) >= need || Math.abs(a.y - b.y) > 70) return;
    var push = (need - Math.abs(dx)) / 2 * (dx >= 0 ? 1 : -1);
    a.x = clamp(a.x - push, EDGE, STAGE_W - EDGE); b.x = clamp(b.x + push, EDGE, STAGE_W - EDGE);
    if (Math.abs(b.x - a.x) < need) { if (a.x <= EDGE + 1) b.x = a.x + need; else if (b.x >= STAGE_W - EDGE - 1) a.x = b.x - need; }
  };
  Game.prototype.collide = function (a, b) {
    var ha = a.hitbox(), hb = b.hitbox(), ra = ha && overlap(ha, b.hurtbox()), rb = hb && overlap(hb, a.hurtbox());
    if (ra) this.resolve(a, b); if (rb) this.resolve(b, a);
  };
  Game.prototype.isBlocking = function (d, atk) {
    if (!(d.state === "stand" || d.state === "crouch" || d.state === "blockstun")) return false;
    var ctl = this.ctl[d.side], back = (atk.x > d.x ? ctl.held.left : ctl.held.right);
    if (this.cpu && d.side === 1 && this.cpuBlocking) back = 1;
    if (!back) return false;
    var crouch = !!ctl.held.down, m = atk.move;
    if (m.low && !crouch) return false; if (m.overhead && crouch) return false;
    return true;
  };
  Game.prototype.resolve = function (atk, def, proj) {
    var m = proj ? proj.move : atk.move; if (!proj) atk.hitThisMove = true;
    var from = proj ? { x: proj.x - (proj.vx > 0 ? 12 : -12), move: m } : atk;   // where the hit comes from
    var dir = from.x <= def.x ? 1 : -1;
    var hx = proj ? [proj.x - proj.r, proj.y - proj.r, proj.x + proj.r, proj.y + proj.r] : atk.box(atk.frame().hit) || [def.x, def.y - 30, def.x, def.y - 30];
    var sx = (Math.max(hx[0], def.x - 8) + Math.min(hx[2], def.x + 8)) / 2, sy = (hx[1] + hx[3]) / 2;
    if (this.isBlocking(def, from)) {
      def.state = "blockstun"; def.stun = m.blockstun; def.crouching = !!this.ctl[def.side].held.down;
      def.setAnim(def.crouching ? "block_crouch" : "block_stand", true); def.vx = dir * m.push * 1.4;
      if (m.chip) def.hp = Math.max(1, def.hp - Math.round(m.damage * m.chip));
      this.freeze = Math.max(2, m.hitstop - 3); this.spark(sx, sy, "#9fd3ff", 6); this.audio.sfx("block"); return;
    }
    var scale = [1, 0.85, 0.72, 0.62, 0.55][Math.min(def.combo, 4)];
    def.hp = Math.max(0, def.hp - Math.max(1, Math.round(m.damage * scale))); def.combo++;
    this.freeze = m.hitstop; this.spark(sx, sy, m.cls === "light" ? "#ffe9a8" : "#ff8a5c", m.cls === "light" ? 8 : 14);
    this.audio.sfx("hit", m.cls);
    def.move = null;
    if (m.knockdown || def.hp <= 0 || def.y < 0) {
      def.state = "knockdown"; def.stun = 46; def.vx = dir * 3.4; def.vy = def.y < 0 ? -3.8 : -4.6; if (def.y === 0) def.y = -1;
      def.setAnim(def.hp <= 0 ? "ko" : "knockdown", true); def.airHit = false;
    } else {
      def.state = "hitstun"; def.stun = m.hitstun; def.vx = dir * m.push * 1.6; def.airHit = def.y < 0;
      def.setAnim(m.low || def.crouching ? "hit_low" : "hit_high", true);
    }
  };
  Game.prototype.endRound = function (winner, why) {
    this.screen = "ko"; this.koT = 0;
    if (winner != null) this.wins[winner]++;
    else if (this.f[0].hp !== this.f[1].hp && why === "Time") { winner = this.f[0].hp > this.f[1].hp ? 0 : 1; this.wins[winner]++; }
    else { this.wins[0]++; this.wins[1]++; }
    var perfect = winner != null && this.f[winner].hp === this.f[winner].maxHp;
    this.banner = { text: why, sub: winner == null ? "Draw" : this.f[winner].name + (perfect ? " — perfect" : ""), t: 0 };
    if (why === "K.O.") this.audio.sfx("ko"); else this.audio.sfx("bell");
    if (winner != null) { var w = this.f[winner], l = this.f[1 - winner]; w.state = "win"; w.move = null; w.setAnim("win", true); if (l.hp <= 0 && l.state !== "knockdown") { l.state = "knockdown"; l.stun = 40; l.setAnim("ko", true); } }
  };
  // ---- projectiles: thrown at the start of a projectile special's active window; one per fighter
  Game.prototype.fire = function (f, m) {
    var st = f.base.def.stance, hb = f.box(f.frame().hit);
    var x = hb ? (f.facing > 0 ? hb[2] : hb[0]) : f.x + f.facing * (st[2] * f.scale + 6);
    var y = hb ? (hb[1] + hb[3]) / 2 : f.y + st[1] * f.scale * 0.6;
    var p = { owner: f, x: x, y: y, vx: f.facing * m.projectile.speed, r: m.projectile.size, color: m.projectile.color || f.glow, move: m, life: 260, t: 0, trail: [] };
    this.projectiles.push(p); f.proj = p; this.audio.sfx("fireball");
  };
  Game.prototype.updateProjectiles = function () {
    var ps = this.projectiles, self = this;
    ps.forEach(function (p) { p.trail.unshift([p.x, p.y]); if (p.trail.length > 5) p.trail.pop(); p.x += p.vx; p.t++;
      if (--p.life <= 0 || p.x < -20 || p.x > STAGE_W + 20) p.dead = true; });
    for (var i = 0; i < ps.length; i++) for (var j = i + 1; j < ps.length; j++) { var a = ps[i], b = ps[j];   // two projectiles cancel
      if (!a.dead && !b.dead && a.owner !== b.owner && Math.abs(a.x - b.x) < a.r + b.r && Math.abs(a.y - b.y) < a.r + b.r + 10) {
        a.dead = b.dead = true; self.spark((a.x + b.x) / 2, (a.y + b.y) / 2, "#ffffff", 14); self.audio.sfx("block"); } }
    ps.forEach(function (p) { if (p.dead) return; var foe = self.f[1 - p.owner.side], hb = foe.hurtbox();
      if (hb && overlap([p.x - p.r, p.y - p.r, p.x + p.r, p.y + p.r], hb)) { p.dead = true; self.resolve(p.owner, foe, p); } });
    this.projectiles = ps.filter(function (p) { if (p.dead && p.owner.proj === p) p.owner.proj = null; return !p.dead; });
  };
  Game.prototype.drawProjectile = function (p, ox) {
    var x = this.ctx, k = 1 + Math.sin(p.t * 0.6) * 0.12, px = Math.round(p.x - ox), py = Math.round(FLOOR + p.y);
    function disc(cx, cy, r) { x.beginPath(); x.arc(cx, cy, Math.max(1, r), 0, 7); x.fill(); }
    x.fillStyle = p.color;
    for (var i = p.trail.length - 1; i >= 0; i--) { x.globalAlpha = 0.22 * (1 - i / p.trail.length); disc(Math.round(p.trail[i][0] - ox), Math.round(FLOOR + p.trail[i][1]), p.r * (1 - i * 0.12)); }
    x.globalAlpha = 0.35; disc(px, py, p.r * 1.7 * k); x.globalAlpha = 1; disc(px, py, p.r * k);
    x.fillStyle = "#ffffff"; disc(px, py, p.r * 0.45 * k);
  };
  Game.prototype.spark = function (x, y, color, n) { for (var i = 0; i < n; i++) { var a = Math.random() * 6.283, s = 0.6 + Math.random() * 2.2; this.sparks.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 10 + Math.random() * 8, color: color }); } };
  Game.prototype.updateSparks = function () { this.sparks = this.sparks.filter(function (p) { p.x += p.vx; p.y += p.vy; p.vy += 0.08; return --p.life > 0; }); };

  // ---- drawing
  Game.prototype.draw = function () {
    var x = this.ctx, R = this.R || 1;
    x.setTransform(R, 0, 0, R, 0, 0); x.imageSmoothingEnabled = R > 1; x.imageSmoothingQuality = "high";
    if (!this.f || this.screen === "card" || this.screen === "select" || this.screen === "loading") { this.drawAttract(); return; }
    var p1 = this.f[0], p2 = this.f[1], cam = clamp((p1.x + p2.x) / 2, W / 2, STAGE_W - W / 2), ox = cam - W / 2;
    if (this.stageR !== R) { this.stageImg = paintStage(this.stage, R); this.stageR = R; }
    x.drawImage(this.stageImg, Math.round(ox * 0.85 * R), 0, W * R, H * R, 0, 0, W, H);
    for (var i = 0; i < 2; i++) this.drawShadow(this.f[i], ox);
    var order = p1.state === "attack" ? [1, 0] : [0, 1];
    for (var j = 0; j < 2; j++) this.drawFighter(this.f[order[j]], ox);
    for (var q = 0; q < this.projectiles.length; q++) this.drawProjectile(this.projectiles[q], ox);
    var self = this; this.sparks.forEach(function (p) { x.fillStyle = p.color; x.fillRect(Math.round(p.x - ox), Math.round(FLOOR + p.y), 2, 2); });
    this.drawHud();
    if (this.banner) this.drawBanner();
    if (this.opts.debugBoxes) for (var k = 0; k < 2; k++) { var f = this.f[k], hb = f.hurtbox(), ab = f.hitbox();
      x.strokeStyle = "#3f3"; if (hb) x.strokeRect(hb[0] - ox, FLOOR + hb[1], hb[2] - hb[0], hb[3] - hb[1]);
      x.strokeStyle = "#f33"; if (ab) x.strokeRect(ab[0] - ox, FLOOR + ab[1], ab[2] - ab[0], ab[3] - ab[1]); }
  };
  Game.prototype.drawAttract = function () {
    var x = this.ctx, R = this.R || 1; if (!this.attract) this.attract = paintStage(this.stages[0], R);
    x.drawImage(this.attract, Math.round((Math.sin(this.now / 400) * 0.5 + 0.5) * (STAGE_W - W) * R), 0, W * R, H * R, 0, 0, W, H);
    x.fillStyle = "rgba(10,10,20,0.45)"; x.fillRect(0, 0, W, H);
  };
  Game.prototype.drawShadow = function (f, ox) { var x = this.ctx, s = clamp(1 + f.y / 160, 0.4, 1); x.fillStyle = "rgba(0,0,0,0.35)"; x.beginPath(); x.ellipse(Math.round(f.x - ox), FLOOR + 1, f.body * 1.5 * s, 5 * s, 0, 0, 7); x.fill(); };
  Game.prototype.drawFighter = function (f, ox) {
    var x = this.ctx, R = this.R || 1, fr = f.frame(), an = fr.anchor || f.base.def.anchor, r = fr.rect, k = f.scale;
    var sx = Math.round((f.x - ox) * R) / R, sy = Math.round((FLOOR + f.y) * R) / R;    // whole device pixels
    if (f.invuln > 0 && f.state === "stand" && (this.now >> 2) % 2) x.globalAlpha = 0.6;
    x.save(); x.translate(sx, sy); if (f.facing < 0) x.scale(-1, 1);
    x.drawImage(f.sheet, r[0], r[1], r[2], r[3], -an[0] * k, -an[1] * k, r[2] * k, r[3] * k); x.restore(); x.globalAlpha = 1;
  };
  Game.prototype.drawHud = function () {
    var x = this.ctx, self = this;
    [0, 1].forEach(function (i) {
      var f = self.f[i], w = 150, bx = i === 0 ? 10 : W - 10 - w, by = 10, frac = clamp(f.hp / f.maxHp, 0, 1), shown = clamp(f.shownHp / f.maxHp, 0, 1);
      x.fillStyle = "#111"; x.fillRect(bx - 1, by - 1, w + 2, 9);
      x.fillStyle = "#b3261e"; var sw = Math.round(w * shown); x.fillRect(i === 0 ? bx + w - sw : bx, by, sw, 7);
      x.fillStyle = frac > 0.3 ? "#ffd84a" : "#ff8a3c"; var fw = Math.round(w * frac); x.fillRect(i === 0 ? bx + w - fw : bx, by, fw, 7);
      x.font = "8px monospace"; x.textAlign = i === 0 ? "left" : "right"; x.fillStyle = "#fff"; x.fillText(f.name.toUpperCase(), i === 0 ? bx : bx + w, by + 17);
      for (var k = 0; k < self.roundsToWin; k++) { x.fillStyle = self.wins[i] > k ? "#ffd84a" : "rgba(255,255,255,0.25)"; x.fillRect(i === 0 ? bx + w - 6 - k * 8 : bx + k * 8, by + 11, 5, 5); }
    });
    x.font = "bold 14px monospace"; x.textAlign = "center"; x.fillStyle = "#fff"; x.fillText(String(Math.max(0, this.timer)), W / 2, 22);
  };
  Game.prototype.drawBanner = function () {
    var x = this.ctx, b = this.banner; b.t++;
    x.textAlign = "center"; x.font = "bold 24px monospace"; x.fillStyle = "rgba(0,0,0,0.5)"; x.fillText(b.text.toUpperCase(), W / 2 + 2, 92);
    x.fillStyle = "#ffe066"; x.fillText(b.text.toUpperCase(), W / 2, 90);
    if (b.sub) { x.font = "10px monospace"; x.fillStyle = "#fff"; x.fillText(b.sub, W / 2, 108); }
  };

  Game.prototype.sfx = function (kind, weight) { this.audio.sfx(kind, weight); };

  // ---- loop
  Game.prototype.loop = function () {
    var self = this, last = performance.now(), acc = 0, reported = 0;
    function frame(t) {
      if (self.dead) return;
      requestAnimationFrame(frame);          // first, so one bad frame can't stop the game
      acc += Math.min(100, t - last); last = t;
      try { while (acc >= STEP) { self.step(); acc -= STEP; } self.draw(); }
      catch (e) { acc = 0; if (reported++ < 3) console.error("Versus Fighter:", e); }
    }
    requestAnimationFrame(frame);
  };
  Game.prototype.state = function () {
    function fs(f) { return f ? { name: f.name, hp: f.hp, maxHp: f.maxHp, x: Math.round(f.x), y: Math.round(f.y), state: f.state, anim: f.anim, facing: f.facing } : null; }
    return { version: VERSION, screen: this.screen, paused: this.paused, mode: this.mode, difficulty: this.difficulty, round: this.round, timer: this.timer,
             wins: this.wins.slice(), p1: fs(this.f && this.f[0]), p2: fs(this.f && this.f[1]), roster: this.roster.map(function (f) { return f.name; }),
             projectiles: (this.projectiles || []).map(function (p) { return { side: p.owner.side, x: Math.round(p.x), y: Math.round(p.y) }; }) };
  };

  // ---------------------------------------------------------------- styles + API
  var CSS = ".vf-root{position:relative;display:flex;align-items:center;justify-content:center;background:#0b0b12;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none}" +
    ".vf-canvas{image-rendering:pixelated;image-rendering:crisp-edges;display:block}" +
    ".vf-layer{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}" +
    ".vf-panel{pointer-events:auto;max-width:min(92%,560px);max-height:92%;overflow:auto;background:rgba(12,12,22,.92);border:1px solid rgba(255,255,255,.15);border-radius:14px;padding:18px 20px;color:#eee;font:14px/1.45 -apple-system,system-ui,sans-serif;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.5)}" +
    ".vf-panel h1{margin:0 0 4px;font-size:26px;letter-spacing:.04em}.vf-panel h2{margin:0 0 10px;font-size:20px}.vf-tag{margin:0 0 10px;color:#bbb}" +
    ".vf-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:8px 0}" +
    ".vf-chip{background:#262638;color:#ddd;border:1px solid #3c3c55;border-radius:999px;padding:6px 12px;font:inherit;cursor:pointer}.vf-chip.on{background:#ffd84a;color:#111;border-color:#ffd84a}" +
    ".vf-go{display:block;margin:12px auto 6px;background:#ff5a3c;color:#fff;border:0;border-radius:10px;padding:10px 28px;font:600 16px system-ui,sans-serif;cursor:pointer}" +
    ".vf-controls{margin:8px 0;color:#cfcfe0;font-size:12.5px}.vf-credits{margin-top:10px;color:#888;font-size:11px}" +
    ".vf-grid{display:flex;flex-wrap:wrap;justify-content:center;gap:8px}" +
    ".vf-pick{width:112px;background:#1d1d2c;border:1px solid #34344a;border-radius:10px;padding:6px;color:#eee;cursor:pointer;display:flex;flex-direction:column;align-items:center;font:inherit}" +
    ".vf-pick canvas{width:80px;height:80px;image-rendering:pixelated}.vf-pick small{color:#999;font-size:11px}" +
    ".vf-touch{position:absolute;inset:0;pointer-events:none}" +
    ".vf-pad{position:absolute;left:calc(14px + env(safe-area-inset-left));bottom:calc(14px + env(safe-area-inset-bottom));width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.2);pointer-events:auto;touch-action:none}" +
    ".vf-knob{position:absolute;left:38px;top:38px;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.3)}" +
    ".vf-btns{position:absolute;right:calc(12px + env(safe-area-inset-right));bottom:calc(12px + env(safe-area-inset-bottom));display:grid;grid-template-columns:repeat(2,64px);gap:10px;pointer-events:auto}" +
    ".vf-tb{width:64px;height:64px;border-radius:50%;border:2px solid rgba(255,255,255,.3);background:rgba(255,90,60,.35);color:#fff;font:600 11px system-ui,sans-serif;touch-action:none}";

  function mount(target, game, opts) {
    var root = typeof target === "string" ? document.querySelector(target) : target;
    if (!root) throw new Error("Versus Fighter: mount target not found");
    if (!document.getElementById("vf-style")) { var s = document.createElement("style"); s.id = "vf-style"; s.textContent = CSS; document.head.appendChild(s); }
    if (active) active.dead = true;
    var Mode = (game && game.mode && MODES[game.mode]) || Game;
    active = new Mode(root, game, opts);
    return { state: function () { return active.state(); }, pause: function () { if (active.screen === "fight" && !active.paused) active.togglePause(); } };
  }

  G.VersusFighter = {
    VERSION: VERSION, mount: mount, registerBase: registerBase,
    state: function () { return active ? active.state() : null; },
    _test: { buildMove: buildMove, Controls: Controls, MOTIONS: MOTIONS, overlap: overlap, BASES: BASES, paintStage: paintStage, game: function () { return active; } },
    // The shared core for other modes (vf-brawler.js): the bodies, moves, fighter, input, audio,
    // stage painter and the 1v1 Game, whose overlays, touch, loop and drawing a mode can inherit.
    _core: { VERSION: VERSION, W: W, H: H, FLOOR: FLOOR, STAGE_W: STAGE_W, STEP: STEP, SCALE: SCALE, BODY: BODY,
             BASES: BASES, MODES: MODES, clamp: clamp, overlap: overlap, el: el, rng: rng, hashSeed: hashSeed, hexToRgb: hexToRgb,
             whenBasesReady: whenBasesReady, recolored: recolored, recoloredFrame: recoloredFrame,
             CLASSES: CLASSES, NORMALS: NORMALS, buildMove: buildMove, Controls: Controls, Fighter: Fighter, Audio: Audio,
             paintStage: paintStage, Game: Game }
  };
})(typeof window !== "undefined" ? window : globalThis);
