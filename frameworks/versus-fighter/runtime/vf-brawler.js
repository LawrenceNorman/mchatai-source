/* Versus Fighter — brawler mode: a side-scrolling beat-'em-up on the same bodies and moves.
 *
 * A game file with "mode": "brawler" mounts this instead of the 1v1 game. The player walks a
 * long street in depth lanes (up and down move into and out of the screen), waves of enemies
 * come in from both sides and the camera holds until they are down, each stage ends with a
 * boss, and lives and score carry across stages. Bodies, recolors, moves, hit and hurt boxes,
 * input, audio, the stage painter, overlays and touch come from the core (VersusFighter._core).
 */
(function (G) {
  "use strict";
  var VF = G.VersusFighter; if (!VF || !VF._core) return;
  var C = VF._core, W = C.W, H = C.H, clamp = C.clamp, el = C.el, BASES = C.BASES, Game = C.Game, Fighter = C.Fighter;

  var TOP = 138, DEPTH = 66;            // the street: feet at y = TOP (far side) .. TOP + DEPTH (near side)
  var DEPTH_HIT = 0.14;                 // how far apart in depth two fighters can be and still connect
  var LEVELS = { easy: { react: 34, attackers: 1, aggro: 0.45, dmg: 0.6 },
                 normal: { react: 24, attackers: 2, aggro: 0.6, dmg: 0.85 },
                 hard: { react: 14, attackers: 3, aggro: 0.75, dmg: 1.1 } };
  function zToY(z) { return TOP + z * DEPTH; }
  function shade(hex, f) { var c = C.hexToRgb(hex) || [40, 40, 50]; return "rgb(" + c.map(function (v) { return Math.min(255, Math.round(v * f)); }).join(",") + ")"; }
  function alive(f) { return f.state !== "ko"; }

  function Brawler(root, game, opts) {
    this.root = root; this.data = game; this.opts = opts || {};
    this.audio = new C.Audio(); this.screen = "loading"; this.mode = "solo"; this.difficulty = game.cpu || "normal";
    this.now = 0; this.banner = null; this.freeze = 0; this.sparks = []; this.projectiles = [];
    this.ctl = [new C.Controls(), new C.Controls()]; this.keys = {}; this.taps = {}; this.paused = false;
    this.roster = (game.players || game.fighters || []).slice(0, 6);
    if (!this.roster.length) throw new Error("Versus Fighter brawler: the game file has no players");
    this.enemyTypes = game.enemies || {};
    this.stages = (game.stages || []).filter(function (s) { return s && (s.waves || s.boss); });
    if (!this.stages.length) throw new Error("Versus Fighter brawler: the game file has no stages with waves");
    this.picks = [0, 0];
    this.build();
    var self = this, bases = {};
    this.roster.forEach(function (f) { bases[f.base || "ava"] = 1; });
    for (var k in this.enemyTypes) bases[this.enemyTypes[k].base || "ava"] = 1;
    C.whenBasesReady(Object.keys(bases), function () { self.showCard(); self.loop(); });
  }
  Brawler.prototype = Object.create(Game.prototype);
  Brawler.prototype.constructor = Brawler;

  // ---------------------------------------------------------------- overlays
  Brawler.prototype.controlsText = function () {
    return ["Move: arrows or W A S D (up and down walk into and out of the street)",
            "Punch: J (press again for a combo) · Kick: U · Heavy: K and I · Jump: Space (punch or kick in the air)",
            "Special: L hits everyone around you and costs a little health"];
  };
  Brawler.prototype.showCard = function () {
    this.screen = "card"; var self = this, d = this.data, p = this.panel("vf-card");
    p.appendChild(el("h1", "", d.title || "Brawl"));
    if (d.tagline) p.appendChild(el("p", "vf-tag", d.tagline));
    var dif = el("div", "vf-row");
    ["easy", "normal", "hard"].forEach(function (v) { var b = el("button", "vf-chip" + (self.difficulty === v ? " on" : ""), v[0].toUpperCase() + v.slice(1)); b.onclick = function () { self.difficulty = v; self.showCard(); }; dif.appendChild(b); });
    p.appendChild(dif);
    var ctl = el("div", "vf-controls"); (this.touch ? ["Touch: the pad walks the street, the buttons punch, kick, jump and use the special"] : this.controlsText()).forEach(function (t) { ctl.appendChild(el("div", "", t)); });
    p.appendChild(ctl);
    p.appendChild(this.toggles());
    var go = el("button", "vf-go", "Start"); go.onclick = function () { self.audio.unlock(); self.audio.startMusic(); self.afterCard(); }; p.appendChild(go);
    p.appendChild(this.credits());
    setTimeout(function () { try { go.focus(); } catch (e) {} }, 0);
  };
  Brawler.prototype.credits = function () {
    var seen = {}, lines = ["Engine: mChatAI Versus Fighter " + C.VERSION + " (brawler)"], bases = this.roster.map(function (f) { return f.base || "ava"; });
    for (var k in this.enemyTypes) bases.push(this.enemyTypes[k].base || "ava");
    bases.forEach(function (n) { var b = BASES[n]; if (b && !seen[n]) { seen[n] = 1; lines.push("Art: " + (b.def.credit || n)); } });
    var c = el("div", "vf-credits"); lines.forEach(function (t) { c.appendChild(el("div", "", t)); }); return c;
  };
  Brawler.prototype.afterCard = function () { if (this.roster.length > 1) this.showSelect(0); else this.startMatch(); };
  Brawler.prototype.showResult = function (cleared) {
    this.screen = "result"; var self = this, p = this.panel("vf-result");
    p.appendChild(el("h2", "", cleared ? "The streets are clear" : "Game over"));
    p.appendChild(el("p", "vf-tag", "Score " + this.score));
    var again = el("button", "vf-go", cleared ? "Play again" : "Continue from this stage");
    again.onclick = function () { if (cleared) self.startMatch(); else { self.lives = self.lives0; self.score = 0; self.startStage(self.stageIndex); } };
    p.appendChild(again);
    var menu = el("button", "vf-chip", "Main menu"); menu.onclick = function () { self.showCard(); }; p.appendChild(menu);
  };

  // ---------------------------------------------------------------- touch
  Brawler.prototype.buildTouch = function () {
    Game.prototype.buildTouch.call(this);
    var self = this, btns = this.touchEl.querySelector(".vf-btns"); btns.innerHTML = "";
    [["LP", "Punch"], ["LK", "Kick"], ["JUMP", "Jump"], ["SP", "Special"]].forEach(function (b) {
      var e = el("button", "vf-tb", b[1]); e.addEventListener("pointerdown", function (ev) { self.touchEdge[b[0]] = 1; ev.preventDefault(); }); btns.appendChild(e); });
  };

  // ---------------------------------------------------------------- setup
  Brawler.prototype.makeFighter = function (def, team) {
    var f = new Fighter(def, BASES[def.base || "ava"], team, this);
    f.specials.forEach(function (m) { m.projectile = null; });   // projectiles are a 1v1 thing; here specials strike
    f.team = team; f.z = 0.5; f.vz = 0; f.hitSet = []; f.koT = 0;
    return f;
  };
  Brawler.prototype.startMatch = function () {
    this.layer.innerHTML = ""; this.lives0 = clamp(this.data.lives || 3, 1, 9); this.lives = this.lives0; this.score = 0;
    this.level = LEVELS[this.difficulty] || LEVELS.normal;
    this.startStage(0);
  };
  Brawler.prototype.startStage = function (i) {
    this.layer.innerHTML = ""; this.stageIndex = i; this.stage = this.stages[i];
    var def = this.roster[this.picks[0]];
    this.player = this.makeFighter(def, 0); this.player.isPlayer = true;
    this.player.x = 70; this.player.z = 0.55; this.player.facing = 1;
    this.length = clamp(this.stage.length || 1800, W + 200, 8000);
    this.stageImg = C.paintStage(this.stage, this.R); this.stageR = this.R;
    // Waves in order along the street, then the boss near its end.
    var waves = (this.stage.waves || []).map(function (w) { return { at: w.at || 0, enemies: (w.enemies || []).slice(0, 8) }; })
      .sort(function (a, b) { return a.at - b.at; });
    if (this.stage.boss) waves.push({ at: this.length - W * 0.8, enemies: [this.stage.boss.type || this.stage.boss], boss: this.stage.boss });
    this.waves = waves; this.waveIndex = 0; this.waveActive = false; this.lock = null; this.goT = 0;
    this.enemies = []; this.camX = 0; this.focus = null; this.sparks = []; this.clearT = 0; this.deadT = 0;
    this.screen = "intro"; this.introT = 0;
    this.banner = { text: "Stage " + (i + 1), sub: this.stage.name || null, t: 0 }; this.audio.sfx("bell");
  };
  Brawler.prototype.spawnWave = function (w) {
    var self = this, level = this.level;
    w.enemies.forEach(function (typeID, k) {
      var t = self.enemyTypes[typeID] || { name: typeID };
      var def = {}; for (var a in t) def[a] = t[a];
      if (w.boss && typeof w.boss === "object" && w.boss.name) def.name = w.boss.name;
      var e = self.makeFighter(def, 1);
      var right = k % 2 === 0; e.x = right ? self.camX + W + 24 + k * 10 : self.camX - 24 - k * 10;
      e.z = 0.12 + ((k * 0.37 + 0.2) % 0.78); e.facing = right ? -1 : 1;
      e.ai = { speed: clamp(t.speed || 1, 0.4, 1.6), aggression: clamp(t.aggression == null ? 0.6 : t.aggression, 0.05, 1) * (level.aggro / 0.6),
               react: Math.round(level.react / clamp(t.speed || 1, 0.5, 1.5)), reach: e.body + 14,
               attacks: (t.attacks && t.attacks.length ? t.attacks : ["LP", "LK"]).filter(function (b) { return e.moves[b]; }) };
      if (!e.ai.attacks.length) e.ai.attacks = ["LP"];
      e.points = t.points || (w.boss ? 1000 : 100); e.isBoss = !!w.boss; e.cool = 20 + k * 9; e.zOff = (k % 3 - 1) * 0.18;
      self.enemies.push(e);
    });
    if (w.boss) this.banner = { text: "Boss", sub: this.enemies[this.enemies.length - 1].name, t: 0 };
  };

  // ---------------------------------------------------------------- input
  var MAP = { left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"], up: ["KeyW", "ArrowUp"], down: ["KeyS", "ArrowDown"],
              LP: ["KeyJ", "KeyZ"], HP: ["KeyK", "KeyX"], LK: ["KeyU", "KeyC"], HK: ["KeyI", "KeyV"], JUMP: ["Space"], SP: ["KeyL", "KeyB"] };
  var PRESS = ["LP", "HP", "LK", "HK", "JUMP", "SP"];
  Brawler.prototype.sample = function () {
    var keys = this.keys, taps = this.taps, ctl = this.ctl[0], held = {}, down = {};
    var pad = ((navigator.getGamepads ? navigator.getGamepads() : []) || [])[0];
    ["left", "right", "up", "down"].forEach(function (k) { held[k] = MAP[k].some(function (c) { return keys[c]; }) ? 1 : 0; });
    PRESS.forEach(function (b) { down[b] = MAP[b].some(function (c) { return keys[c]; }); });
    if (pad) { var ax = pad.axes || [], bt = pad.buttons || [], on = function (i) { return !!(bt[i] && bt[i].pressed); };
      held.left |= (ax[0] < -0.5 || on(14)) ? 1 : 0; held.right |= (ax[0] > 0.5 || on(15)) ? 1 : 0;
      held.up |= (ax[1] < -0.5 || on(12)) ? 1 : 0; held.down |= (ax[1] > 0.5 || on(13)) ? 1 : 0;
      down.JUMP = down.JUMP || on(0); down.LK = down.LK || on(1); down.LP = down.LP || on(2); down.SP = down.SP || on(3); }
    ctl.held = held; ctl.edge = {};
    PRESS.forEach(function (b) { if ((down[b] && !ctl.down[b]) || MAP[b].some(function (c) { return taps[c]; })) ctl.edge[b] = 1; ctl.down[b] = down[b]; });
    if (this.touchHeld) { for (var k in this.touchHeld) held[k] |= this.touchHeld[k]; for (var e in this.touchEdge) ctl.edge[e] = 1; this.touchEdge = {}; }
    this.taps = {};
  };

  // ---------------------------------------------------------------- simulation
  Brawler.prototype.step = function () {
    this.now++;
    if (this.screen !== "intro" && this.screen !== "fight" && this.screen !== "clear") return;
    if (this.paused) return;
    this.sample();
    if (this.screen === "intro" && ++this.introT > 70) { this.screen = "fight"; this.banner = null; }
    if (this.freeze > 0) { this.freeze--; this.updateSparks(); return; }
    var p = this.player, self = this;
    if (this.screen === "fight") this.controlPlayer(p);
    var attackers = this.enemies.filter(function (e) { return alive(e) && e.state !== "knockdown" && e.state !== "getup"; })
      .sort(function (a, b) { return Math.abs(a.x - p.x) - Math.abs(b.x - p.x); }).slice(0, this.level.attackers);
    this.enemies.forEach(function (e) { if (self.screen === "fight") self.thinkEnemy(e, p, attackers); });
    [p].concat(this.enemies).forEach(function (f) { self.physics(f); f.tickAnim(); if (f.invuln > 0) f.invuln--; f.shownHp += (f.hp - f.shownHp) * 0.08; });
    this.separate();
    this.collide();
    this.enemies = this.enemies.filter(function (e) { return !(e.state === "ko" && e.koT > 75); });
    this.updateWaves(); this.updateCamera(); this.updateSparks();
    if (this.goT > 0) this.goT--;
    if (p.state === "ko" && ++this.deadT > 90) this.loseLife();
    if (this.screen === "clear" && ++this.clearT > 150) {
      if (this.stageIndex + 1 < this.stages.length) this.startStage(this.stageIndex + 1); else this.showResult(true);
    }
  };
  Brawler.prototype.controlPlayer = function (p) {
    var c = this.ctl[0], h = c.held, b = c.edge, now = this.now;
    if (p.state === "air" && !p.airAttackUsed && (b.LP || b.HP || b.LK || b.HK)) {
      var am = p.moves[(b.LK || b.HK) ? "jHK" : "jHP"];
      if (am) { p.airAttackUsed = true; var vx = p.vx, vz = p.vz; attack(p, am, now); p.vx = vx; p.vz = vz; }
      return;
    }
    if (!p.canAct()) return;
    var mx = (h.right ? 1 : 0) - (h.left ? 1 : 0), mz = (h.down ? 1 : 0) - (h.up ? 1 : 0);
    if (mx) p.facing = mx;
    else { var near = this.nearestEnemy(p); if (near && Math.abs(near.x - p.x) < 90) p.facing = near.x >= p.x ? 1 : -1; }
    if (b.SP && p.specials.length) {
      attack(p, p.specials[0], now, true); p.hp = Math.max(1, p.hp - 4); p.invuln = Math.max(p.invuln, 14); return;
    }
    if (b.JUMP) { p.state = "jumpsquat"; p.squat = 3; p.jumpVX = mx * 2.2 * p.walkSpeed; p.jumpVZ = mz * 0.01; p.airAttackUsed = false; p.setAnim("jump_start", true); return; }
    if (b.LP) {   // a three-hit chain: jab, jab, then a straight that knocks down
      p.chain = now - (p.lastJab || -99) < 24 ? (p.chain || 0) + 1 : 0; p.lastJab = now;
      var m = p.moves.LP;
      if (p.chain >= 2) { var s = p.moves.HP, f = {}; for (var k in s) f[k] = s[k]; f.knockdown = true; f.damage = s.damage + 2; m = f; p.chain = -1; }
      attack(p, m, now); return;
    }
    var key = b.HP ? "HP" : b.LK ? "LK" : b.HK ? "HK" : null;
    if (key && p.moves[key]) { attack(p, p.moves[key], now); return; }
    p.vx = mx * 1.7 * p.walkSpeed; p.vz = mz * 0.012 * p.walkSpeed;
    p.setAnim(mx || mz ? (mx && mx !== p.facing ? "walk_back" : "walk_fwd") : "idle");
  };
  // Start a move from a standstill (a walk's speed must not carry into a punch); a dash move sets its own.
  function attack(f, m, now, clearsAll) { f.vx = 0; f.vz = 0; f.startMove(m, now); f.hitSet = []; f.clearsAll = !!clearsAll; }
  function standHeight(f) { return (f.base.def.stance[1] || -44) * f.scale; }   // negative: the top of the head
  Brawler.prototype.nearestEnemy = function (p) {
    var best = null, bd = 1e9;
    this.enemies.forEach(function (e) { if (!alive(e)) return; var d = Math.abs(e.x - p.x) + Math.abs(e.z - p.z) * 120; if (d < bd) { bd = d; best = e; } });
    return best;
  };
  Brawler.prototype.thinkEnemy = function (e, p, attackers) {
    if (!e.canAct()) return;
    var on = attackers.indexOf(e) >= 0, side = e.x < p.x ? -1 : 1;
    var slotX = p.x + side * (on ? e.ai.reach + p.body : e.ai.reach + p.body + 64);
    var slotZ = clamp(p.z + (on ? 0 : e.zOff), 0, 1);
    var dx = slotX - e.x, dz = slotZ - e.z, mx = Math.abs(dx) > 5 ? (dx > 0 ? 1 : -1) : 0, mz = Math.abs(dz) > 0.035 ? (dz > 0 ? 1 : -1) : 0;
    if (p.state === "ko") { mx = 0; mz = 0; }
    e.facing = p.x >= e.x ? 1 : -1;
    e.vx = mx * 1.25 * e.ai.speed * e.walkSpeed; e.vz = mz * 0.009 * e.ai.speed;
    e.setAnim(mx || mz ? (mx && mx !== e.facing ? "walk_back" : "walk_fwd") : "idle");
    if (--e.cool > 0 || !on || mx || Math.abs(p.z - e.z) > DEPTH_HIT * 0.8) return;
    e.cool = e.ai.react + Math.floor(Math.random() * e.ai.react);
    if (p.state === "knockdown" || p.state === "getup" || p.state === "ko") return;
    if (Math.random() < e.ai.aggression) {
      var k = e.ai.attacks[Math.floor(Math.random() * e.ai.attacks.length)];
      attack(e, e.moves[k], this.now);
    }
  };
  Brawler.prototype.physics = function (f) {
    if (f.state === "jumpsquat") { if (--f.squat <= 0) { f.state = "air"; f.vy = -7.4 * f.jumpPower; f.vx = f.jumpVX || 0; f.vz = f.jumpVZ || 0; f.setAnim("jump_air", true); } return; }
    if (f.state === "attack") { f.updateAttack(); if (f.move && f.move.dash && f.mt > f.move.activeTo) f.vx *= 0.8; }
    if (f.state === "hitstun") { if (--f.stun <= 0) { f.state = "stand"; f.combo = 0; f.setAnim("idle", true); } f.vx *= 0.82; }
    if (f.state === "knockdown") {
      if (f.y === 0) f.vx *= 0.85;
      if (--f.stun <= 0 && f.y === 0) { if (f.hp <= 0) { f.state = "ko"; f.koT = 0; f.setAnim("ko"); } else { f.state = "getup"; f.stun = 24; f.setAnim("getup", true); } }
    } else if (f.state === "getup") { if (--f.stun <= 0) { f.state = "stand"; f.invuln = 30; f.combo = 0; f.setAnim("idle", true); } }
    if (f.state === "ko") f.koT++;
    if (f.y < 0 || f.vy < 0) {
      f.vy += 0.4; f.y += f.vy;
      if (f.y >= 0) { f.y = 0; f.vy = 0; this.audio.sfx("land");
        if (f.state === "air" || (f.state === "attack" && f.move && f.move.overhead)) { f.state = "stand"; f.move = null; f.setAnim("idle", true); } }
    }
    f.x += f.vx; f.z = clamp(f.z + (f.vz || 0), 0, 1);
    if (f.state === "stand") { f.vx = 0; f.vz = 0; }
    else if (f.state !== "air" && f.state !== "hitstun" && f.state !== "knockdown" && f.state !== "attack") { f.vx = 0; f.vz = 0; }
    if (f.state === "attack" && !(f.move && f.move.dash)) f.vz = 0;
    if (f.isPlayer) f.x = clamp(f.x, this.camX + 16, Math.min(this.length - 16, this.camX + W - 16));
    else f.x = clamp(f.x, this.camX - 70, this.camX + W + 70);
  };
  // Fighters on the same depth band don't walk through each other; the player gives way less.
  Brawler.prototype.separate = function () {
    var all = [this.player].concat(this.enemies).filter(function (f) { return alive(f) && f.state !== "knockdown" && f.y === 0; });
    for (var i = 0; i < all.length; i++) for (var j = i + 1; j < all.length; j++) {
      var a = all[i], b = all[j], need = (a.body + b.body) * 0.8, dx = b.x - a.x;
      if (Math.abs(a.z - b.z) > 0.08 || Math.abs(dx) >= need) continue;
      var push = (need - Math.abs(dx)) * (dx >= 0 ? 1 : -1);
      var wa = a.isPlayer ? 0.25 : b.isPlayer ? 0.75 : 0.5;
      a.x -= push * wa; b.x += push * (1 - wa);
    }
  };
  Brawler.prototype.hitboxOf = function (f) {
    if (f.state !== "attack" || !f.move || f.mt < f.move.activeFrom || f.mt >= f.move.activeTo) return null;
    var b = f.box(f.frame().hit) || f.box([0, -30, 22, -14]);
    if (f.clearsAll && b) { var r = f.body * 2.6; b = [f.x - r, b[1], f.x + r, b[3]]; }   // the special hits all around
    return b;
  };
  Brawler.prototype.collide = function () {
    var self = this, p = this.player, all = [p].concat(this.enemies);
    all.forEach(function (a) {
      var hb = self.hitboxOf(a); if (!hb) return;
      all.forEach(function (t) {
        if (t === a || t.team === a.team || !alive(t) || a.hitSet.indexOf(t) >= 0) return;
        if (Math.abs(a.z - t.z) > DEPTH_HIT) return;
        if (C.overlap(hb, t.hurtbox())) self.hit(a, t);
      });
    });
  };
  Brawler.prototype.hit = function (a, t) {
    var m = a.move; a.hitSet.push(t);
    var dir = a.x <= t.x ? 1 : -1, scale = [1, 0.85, 0.72, 0.62, 0.55][Math.min(t.combo || 0, 4)];
    var dmg = Math.max(1, Math.round((m.damage || 6) * scale * (a.isPlayer ? 1 : this.level.dmg)));
    t.hp = Math.max(0, t.hp - dmg); t.combo = (t.combo || 0) + 1; t.move = null;
    this.freeze = Math.max(this.freeze, m.hitstop || 4);
    this.burst(t.x, zToY(t.z) + t.y + standHeight(t) * 0.6, m.cls === "light" ? "#ffe9a8" : "#ff8a5c", m.cls === "light" ? 8 : 14);
    this.audio.sfx("hit", m.cls);
    if (a.isPlayer) { this.focus = t; this.score += dmg * 10; if (t.hp <= 0) this.score += t.points || 100; }
    if (m.knockdown || t.hp <= 0 || t.y < 0 || t.combo >= 4) {
      t.state = "knockdown"; t.stun = 46; t.vx = dir * 3.2; t.vy = t.y < 0 ? -3.6 : -4.4; if (t.y === 0) t.y = -1; t.combo = 0;
      t.setAnim(t.hp <= 0 ? "ko" : "knockdown", true);
    } else {
      t.state = "hitstun"; t.stun = m.hitstun || 14; t.vx = dir * (m.push || 2.2) * 1.2; t.vy = 0;
      t.setAnim("hit_high", true);
    }
  };
  Brawler.prototype.burst = function (x, y, color, n) {
    for (var i = 0; i < n; i++) { var a = Math.random() * 6.283, s = 0.6 + Math.random() * 2.2; this.sparks.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 10 + Math.random() * 8, color: color }); }
  };
  Brawler.prototype.updateWaves = function () {
    var p = this.player;
    if (this.waveActive) {
      if (this.enemies.some(alive)) return;
      var wasBoss = this.waves[this.waveIndex - 1] && this.waves[this.waveIndex - 1].boss;
      this.waveActive = false; this.lock = null;
      if (wasBoss || this.waveIndex >= this.waves.length && p.x > this.length - W) { this.stageClear(); return; }
      this.goT = 160; this.audio.sfx("bell");
      return;
    }
    var next = this.waves[this.waveIndex];
    if (next && p.x >= next.at) { this.waveIndex++; this.waveActive = true; this.lock = this.camX; this.spawnWave(next); }
    else if (!next && this.screen === "fight" && p.x >= this.length - 40) this.stageClear();
  };
  Brawler.prototype.stageClear = function () {
    if (this.screen !== "fight") return;
    this.screen = "clear"; this.clearT = 0; this.player.state = "win"; this.player.setAnim("win", true);
    this.banner = { text: "Stage clear", sub: "Score " + this.score, t: 0 }; this.audio.sfx("ko");
  };
  Brawler.prototype.loseLife = function () {
    this.deadT = 0; this.lives--;
    if (this.lives <= 0) { this.lives = 0; this.screen = "result"; this.showResult(false); return; }
    var p = this.player; p.hp = p.maxHp; p.shownHp = p.maxHp; p.state = "air"; p.y = -60; p.vy = 0; p.vx = 0; p.invuln = 150; p.combo = 0;
    p.setAnim("jump_air", true); this.banner = { text: "Ready", sub: this.lives + (this.lives === 1 ? " life left" : " lives left"), t: 0 };
    var self = this; setTimeout(function () { if (self.banner && self.banner.text === "Ready") self.banner = null; }, 1500);
  };
  Brawler.prototype.updateCamera = function () {
    var target = clamp(this.player.x - W * 0.42, 0, this.length - W);
    if (this.lock != null) target = Math.min(target, this.lock);
    this.camX = Math.max(this.camX, this.camX + (target - this.camX) * 0.14);   // the street never scrolls back
  };
  Brawler.prototype.updateSparks = function () { this.sparks = this.sparks.filter(function (s) { s.x += s.vx; s.y += s.vy; s.vy += 0.08; return --s.life > 0; }); };

  // ---------------------------------------------------------------- drawing
  Brawler.prototype.draw = function () {
    var x = this.ctx, R = this.R || 1;
    x.setTransform(R, 0, 0, R, 0, 0); x.imageSmoothingEnabled = R > 1; x.imageSmoothingQuality = "high";
    if (!this.player || this.screen === "card" || this.screen === "select" || this.screen === "loading") { this.drawAttract(); return; }
    var ox = this.camX, self = this;
    if (this.stageR !== R) { this.stageImg = C.paintStage(this.stage, R); this.stageR = R; }
    var sw = C.STAGE_W, off = (ox * 0.5) % sw;
    for (var tx = -off; tx < W; tx += sw) x.drawImage(this.stageImg, 0, 0, sw * R, H * R, Math.round(tx * R) / R, -40, sw, H);
    this.drawStreet(ox);
    var all = [this.player].concat(this.enemies).sort(function (a, b) { return a.z - b.z; });
    all.forEach(function (f) { self.drawShadowZ(f, ox); });
    all.forEach(function (f) { if (f.state === "ko" && f.koT > 40 && (self.now >> 2) % 2) return; self.drawFighterZ(f, ox); });
    this.sparks.forEach(function (s) { x.fillStyle = s.color; x.fillRect(Math.round(s.x - ox), Math.round(s.y), 2, 2); });
    this.drawHud();
    if (this.banner) this.drawBanner();
    if (this.goT > 0 && (this.now >> 4) % 2) {
      x.font = "bold 16px monospace"; x.textAlign = "right"; x.fillStyle = "rgba(0,0,0,0.5)"; x.fillText("GO →", W - 10, 72); x.fillStyle = "#ffe066"; x.fillText("GO →", W - 12, 70);
    }
    if (this.opts.debugBoxes) all.forEach(function (f) { var hb = f.hurtbox(), ab = self.hitboxOf(f), y0 = zToY(f.z);
      x.strokeStyle = "#3f3"; if (hb) x.strokeRect(hb[0] - ox, y0 + hb[1], hb[2] - hb[0], hb[3] - hb[1]);
      x.strokeStyle = "#f33"; if (ab) x.strokeRect(ab[0] - ox, y0 + ab[1], ab[2] - ab[0], ab[3] - ab[1]); });
  };
  Brawler.prototype.drawStreet = function (ox) {
    var x = this.ctx, st = this.stage, floor = st.floor || "#2c2633", top = TOP - 20;
    var g = x.createLinearGradient(0, top, 0, H); g.addColorStop(0, shade(floor, 0.8)); g.addColorStop(1, shade(floor, 1.15));
    x.fillStyle = g; x.fillRect(0, top, W, H - top);
    x.fillStyle = shade(floor, 1.6); x.fillRect(0, top, W, 3);
    x.strokeStyle = "rgba(255,255,255,0.07)"; x.lineWidth = 1;
    for (var wx = Math.floor(ox / 56) * 56 - 56; wx < ox + W + 112; wx += 56) { var sx = wx - ox; x.beginPath(); x.moveTo(sx, top + 3); x.lineTo(sx - 30, H); x.stroke(); }
    for (var i = 1; i < 4; i++) { var y = top + 3 + i * (H - top - 3) / 4; x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke(); }
  };
  Brawler.prototype.drawShadowZ = function (f, ox) {
    var x = this.ctx, s = clamp(1 + f.y / 160, 0.4, 1); x.fillStyle = "rgba(0,0,0,0.35)";
    x.beginPath(); x.ellipse(Math.round(f.x - ox), zToY(f.z) + 1, f.body * 1.5 * s, 4.5 * s, 0, 0, 7); x.fill();
  };
  Brawler.prototype.drawFighterZ = function (f, ox) {
    var x = this.ctx, R = this.R || 1, fr = f.frame(), an = fr.anchor || f.base.def.anchor, r = fr.rect, k = f.scale;
    var sx = Math.round((f.x - ox) * R) / R, sy = Math.round((zToY(f.z) + f.y) * R) / R;
    if (f.invuln > 0 && (this.now >> 2) % 2) x.globalAlpha = 0.6;
    x.save(); x.translate(sx, sy); if (f.facing < 0) x.scale(-1, 1);
    x.drawImage(f.sheet, r[0], r[1], r[2], r[3], -an[0] * k, -an[1] * k, r[2] * k, r[3] * k); x.restore(); x.globalAlpha = 1;
  };
  Brawler.prototype.drawHud = function () {
    var x = this.ctx, p = this.player;
    function bar(bx, by, w, f, color) {
      var frac = clamp(f.hp / f.maxHp, 0, 1), shown = clamp(f.shownHp / f.maxHp, 0, 1);
      x.fillStyle = "#111"; x.fillRect(bx - 1, by - 1, w + 2, 8);
      x.fillStyle = "#b3261e"; x.fillRect(bx, by, Math.round(w * shown), 6);
      x.fillStyle = color || (frac > 0.3 ? "#ffd84a" : "#ff8a3c"); x.fillRect(bx, by, Math.round(w * frac), 6);
    }
    // Translucent panels keep the HUD readable over a stage's moon or skyline.
    x.fillStyle = "rgba(8,8,18,0.5)"; x.fillRect(4, 4, 134, 36); x.fillRect(W - 140, 4, 136, this.focus ? 40 : 18);
    bar(10, 10, 120, p);
    x.font = "8px monospace"; x.textAlign = "left"; x.fillStyle = "#fff"; x.fillText(p.name.toUpperCase(), 10, 26);
    for (var i = 0; i < this.lives; i++) { x.fillStyle = "#ffd84a"; x.fillRect(10 + i * 8, 30, 5, 5); }
    x.textAlign = "right"; x.font = "bold 10px monospace"; x.fillStyle = "#fff";
    x.fillText("SCORE " + String(this.score).padStart(6, "0"), W - 10, 17);
    var t = this.focus && this.enemies.indexOf(this.focus) >= 0 ? this.focus : null;
    if (t) { bar(W - 130, 24, 120, t, t.isBoss ? "#ff5a3c" : "#7fd0ff"); x.font = "8px monospace"; x.fillStyle = "#fff"; x.fillText(t.name.toUpperCase(), W - 10, 40); }
  };

  // ---------------------------------------------------------------- state (tests, the page)
  Brawler.prototype.state = function () {
    function fs(f) { return f ? { name: f.name, hp: f.hp, maxHp: f.maxHp, x: Math.round(f.x), z: Math.round(f.z * 100) / 100, y: Math.round(f.y), state: f.state, anim: f.anim, facing: f.facing } : null; }
    return { version: C.VERSION, mode: "brawler", screen: this.screen, paused: this.paused, difficulty: this.difficulty,
             stage: this.stageIndex, stageName: this.stage ? this.stage.name : null, length: this.length, camX: Math.round(this.camX || 0),
             locked: this.lock != null, wave: this.waveIndex, waves: this.waves ? this.waves.length : 0, lives: this.lives, score: this.score,
             p1: fs(this.player), enemies: (this.enemies || []).map(fs), roster: this.roster.map(function (f) { return f.name; }) };
  };

  C.MODES.brawler = Brawler;
})(typeof window !== "undefined" ? window : globalThis);
