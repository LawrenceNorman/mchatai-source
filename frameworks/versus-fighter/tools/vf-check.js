#!/usr/bin/env node
// vf-check.js — validate a Versus Fighter game page. Exit 1 on any error (like rfps-check).
//
//   node tools/vf-check.js path/to/index.html
//
// The game lives in <script type="application/json" id="vf-game">…</script> and the page loads
// libs/vf.js plus libs/vf-base-<base>.js for every base its fighters use.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const NORMALS = ["LP", "HP", "LK", "HK", "cLP", "cHP", "cLK", "cHK", "jLP", "jHP", "jLK", "jHK"];
const INPUT = /^(QCF|QCB|DP|HCF|HCB)\+(P|K|LP|HP|LK|HK)$/;
const THEMES = ["city", "harbor", "temple", "forest", "mountains", "dojo", "desert", "rooftop", "space"];
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
// Names that belong to existing fighting games. Mechanics are free; names, characters and move
// names are not (feedback_no_trademark_clones_user_facing).
const TAKEN = ["street fighter", "mortal kombat", "tekken", "king of fighters", "guilty gear", "smash bros", "soulcalibur",
  "ryu", "ken masters", "chun-li", "chun li", "guile", "blanka", "zangief", "dhalsim", "sagat", "vega", "balrog", "bison",
  "akuma", "cammy", "sub-zero", "sub zero", "scorpion", "raiden", "liu kang", "sonya", "kitana", "kazuya", "heihachi",
  "terry bogard", "mai shiranui", "kyo kusanagi", "iori", "sol badguy", "hadouken", "hadoken", "shoryuken", "tatsumaki",
  "sonic boom", "spinning bird kick", "fatality", "brutality", "flawless victory", "get over here", "power wave"];

function loadBases() {
  const bases = {};
  const dir = path.join(ROOT, "sprites");
  for (const b of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const atlas = path.join(dir, b, "atlas.json");
    if (fs.existsSync(atlas)) bases[b] = JSON.parse(fs.readFileSync(atlas, "utf8"));
  }
  return bases;
}

function check(file) {
  const errors = [], warnings = [];
  const html = fs.readFileSync(file, "utf8");
  const m = html.match(/<script[^>]*id=["']vf-game["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return { errors: ['no <script type="application/json" id="vf-game"> block'], warnings };
  let game;
  try { game = JSON.parse(m[1]); } catch (e) { return { errors: ["vf-game is not valid JSON: " + e.message], warnings }; }
  const bases = loadBases();
  const taken = (s) => { const t = String(s || "").toLowerCase(); return TAKEN.find((n) => new RegExp("(^|[^a-z])" + n.replace(/[-\s]/g, "[-\\s]?") + "([^a-z]|$)").test(t)); };
  const named = (what, s) => { const hit = taken(s); if (hit) errors.push(`${what} "${s}" uses "${hit}", a name from an existing game; invent an original one`); };

  if (!game.title) errors.push("game.title is missing");
  named("title", game.title);
  const brawler = game.mode === "brawler";
  if (game.mode != null && !brawler) errors.push('mode is "brawler" (a side-scrolling beat-\'em-up) or omitted (1v1 versus)');
  const people = brawler ? (game.players || []) : (game.fighters || []);
  const listName = brawler ? "players" : "fighters";
  if (!Array.isArray(people) || !people.length) errors.push(`game.${listName} needs at least one fighter`);
  else if (people.length > (brawler ? 6 : 12)) errors.push(`at most ${brawler ? 6 : 12} ${listName}`);
  const used = new Set();
  people.forEach((f, i) => {
    const who = `${listName}[${i}] (${f.name || "unnamed"})`;
    if (!f.name) errors.push(`${who}: name is missing`);
    named(who + " name", f.name);
    const base = f.base || "ava";
    used.add(base);
    const atlas = bases[base];
    if (!atlas) { errors.push(`${who}: no art base "${base}" (have: ${Object.keys(bases).join(", ")})`); return; }
    const groups = Object.keys(atlas.palette || {});
    for (const [k, v] of Object.entries(f.colors || {})) {
      if (!HEX.test(v)) errors.push(`${who}: colors.${k} "${v}" is not a #hex color`);
      if (!groups.includes(k)) warnings.push(`${who}: colors.${k} recolors nothing on base ${base} (use ${groups.join(", ") || "no colors"})`);
    }
    if (f.health != null && !(f.health >= 50 && f.health <= 200)) errors.push(`${who}: health should be 50–200`);
    for (const [k, v] of Object.entries(f.moves || {})) {
      if (!NORMALS.includes(k)) errors.push(`${who}: moves.${k} is not a normal (use ${NORMALS.join(", ")})`);
      if (v.anim && !atlas.anims[v.anim]) errors.push(`${who}: moves.${k}.anim "${v.anim}" is not an animation of ${base}`);
      if (v.damage != null && !(v.damage >= 1 && v.damage <= 30)) errors.push(`${who}: moves.${k}.damage should be 1–30`);
    }
    (f.specials || []).forEach((s, j) => {
      const sw = `${who} specials[${j}] (${s.name || "unnamed"})`;
      if (!s.name) errors.push(`${sw}: name is missing`);
      named(sw + " name", s.name);
      const a = atlas.anims[s.anim];
      if (!a) errors.push(`${sw}: anim "${s.anim}" is not an animation of ${base}`);
      else if (!a.attack) errors.push(`${sw}: anim "${s.anim}" is not an attack (it has no hit frames)`);
      if (!INPUT.test(String(s.input || "").toUpperCase())) errors.push(`${sw}: input "${s.input}" — use QCF, QCB, DP, HCF or HCB, then +P/+K (e.g. "DP+P")`);
      if (s.damage != null && !(s.damage >= 1 && s.damage <= 40)) errors.push(`${sw}: damage should be 1–40`);
      if (s.low && s.overhead) errors.push(`${sw}: a move can be low or overhead, not both`);
      if (s.projectile != null && typeof s.projectile !== "boolean") {
        const pj = s.projectile;
        if (typeof pj !== "object" || Array.isArray(pj)) errors.push(`${sw}: projectile is true or { "speed", "size", "color" }`);
        else {
          if (pj.speed != null && !(pj.speed >= 1.5 && pj.speed <= 6)) errors.push(`${sw}: projectile.speed should be 1.5–6`);
          if (pj.size != null && !(pj.size >= 3 && pj.size <= 14)) errors.push(`${sw}: projectile.size should be 3–14`);
          if (pj.color != null && !HEX.test(pj.color)) errors.push(`${sw}: projectile.color "${pj.color}" is not a #hex color`);
        }
      }
      if (s.projectile && s.dash) warnings.push(`${sw}: a projectile special with dash runs after its own projectile`);
    });
    if ((f.specials || []).length > 6) warnings.push(`${who}: more than 6 specials is hard to learn`);
    if (brawler && !(f.specials || []).length) warnings.push(`${who}: no specials, so the special button does nothing (the first special is the one it uses)`);
    if ((f.specials || []).filter((s) => s.projectile).length > 1) warnings.push(`${who}: one projectile special is plenty (only one can be on screen)`);
  });
  // Brawler: enemy crews, and stages that are streets with waves and a boss.
  const crews = brawler ? (game.enemies || {}) : {};
  if (brawler) {
    if (typeof crews !== "object" || Array.isArray(crews) || !Object.keys(crews).length) errors.push('game.enemies is an object of enemy types, e.g. { "punk": { "name": …, "base": "ava", … } }');
    for (const [id, t] of Object.entries(crews)) {
      const who = `enemies.${id} (${t.name || "unnamed"})`;
      if (!t.name) errors.push(`${who}: name is missing`);
      named(who + " name", t.name);
      const base = t.base || "ava"; used.add(base);
      const atlas = bases[base];
      if (!atlas) { errors.push(`${who}: no art base "${base}" (have: ${Object.keys(bases).join(", ")})`); continue; }
      const groups = Object.keys(atlas.palette || {});
      for (const [k, v] of Object.entries(t.colors || {})) {
        if (!HEX.test(v)) errors.push(`${who}: colors.${k} "${v}" is not a #hex color`);
        if (!groups.includes(k)) warnings.push(`${who}: colors.${k} recolors nothing on base ${base} (use ${groups.join(", ")})`);
      }
      if (t.health != null && !(t.health >= 10 && t.health <= 400)) errors.push(`${who}: health should be 10–400`);
      if (t.speed != null && !(t.speed >= 0.4 && t.speed <= 1.6)) errors.push(`${who}: speed should be 0.4–1.6`);
      if (t.aggression != null && !(t.aggression >= 0 && t.aggression <= 1)) errors.push(`${who}: aggression should be 0–1`);
      for (const a of t.attacks || []) if (!["LP", "HP", "LK", "HK"].includes(a)) errors.push(`${who}: attacks lists normals: LP, HP, LK, HK (not "${a}")`);
    }
    if (game.lives != null && !(game.lives >= 1 && game.lives <= 9)) errors.push("lives should be 1–9");
  }
  const stages = game.stages || (game.stage ? [game.stage] : []);
  if (!stages.length) (brawler ? errors : warnings).push(brawler ? "a brawler needs stages with waves" : "no stages; a default one is painted");
  if (brawler) stages.forEach((st, i) => {
    const where = `stages[${i}] (${st.name || "unnamed"})`;
    const length = st.length || 1800;
    if (!(length >= 800 && length <= 8000)) errors.push(`${where}: length should be 800–8000`);
    if (!(st.waves || []).length && !st.boss) errors.push(`${where}: needs waves (and usually a boss)`);
    (st.waves || []).forEach((w, j) => {
      if (!(w.at >= 0 && w.at <= length - 384)) errors.push(`${where} waves[${j}]: "at" should be 0–${length - 384} (where along the street it starts)`);
      if (!(w.enemies || []).length || w.enemies.length > 8) errors.push(`${where} waves[${j}]: 1–8 enemies`);
      for (const e of w.enemies || []) if (!crews[e]) errors.push(`${where} waves[${j}]: no enemy type "${e}" in game.enemies`);
    });
    if (st.boss) {
      const type = typeof st.boss === "string" ? st.boss : st.boss.type;
      if (!crews[type]) errors.push(`${where}: boss type "${type}" is not in game.enemies`);
      if (st.boss.name) named(`${where} boss name`, st.boss.name);
    }
  });
  stages.forEach((s, i) => {
    if (!s.name) errors.push(`stages[${i}]: name is missing`);
    if (s.theme && !THEMES.includes(s.theme)) errors.push(`stages[${i}]: theme "${s.theme}" — use ${THEMES.join(", ")}`);
    for (const c of [].concat(s.sky || [], s.floor || [], s.accent || [])) if (!HEX.test(c)) errors.push(`stages[${i}]: "${c}" is not a #hex color`);
  });
  if (game.rounds != null && !(game.rounds >= 1 && game.rounds <= 5)) errors.push("rounds (to win) should be 1–5");
  if (game.timer != null && !(game.timer >= 20 && game.timer <= 99)) errors.push("timer should be 20–99 seconds");
  if (game.cpu != null && !["easy", "normal", "hard"].includes(game.cpu)) errors.push('cpu should be "easy", "normal" or "hard"');
  if (game.look != null && !["sharp", "pixel"].includes(game.look)) errors.push('look should be "pixel" (or omitted for the sharp default)');
  const srcs = [...html.matchAll(/<script[^>]*src=["']([^"']+)["']/gi)].map((x) => x[1]);
  if (!srcs.some((s) => /(^|\/)vf\.js$/.test(s))) errors.push('the page does not load the runtime: <script src="libs/vf.js"></script>');
  for (const b of used) if (!srcs.some((s) => s.endsWith(`vf-base-${b}.js`))) errors.push(`the page does not load base "${b}": <script src="libs/vf-base-${b}.js"></script>`);
  if (!/VersusFighter\.mount\(/.test(html)) errors.push("the page never calls VersusFighter.mount(...)");
  if (/https?:\/\/[^"']*\.(js|png|gif|mp3|ogg)/i.test(html)) errors.push("the page references a remote file; everything must work offline from libs/");
  return { errors, warnings, fighters: people.length, stages: stages.length, mode: brawler ? "brawler" : "versus" };
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error("usage: node vf-check.js <index.html>"); process.exit(2); }
  const r = check(file);
  r.warnings.forEach((w) => console.log("warning: " + w));
  r.errors.forEach((e) => console.log("ERROR: " + e));
  console.log(r.errors.length ? `vf-check: ${r.errors.length} error(s)` : `vf-check: OK (${r.mode}: ${r.fighters} ${r.mode === "brawler" ? "players" : "fighters"}, ${r.stages} stages)`);
  process.exit(r.errors.length ? 1 : 0);
}
module.exports = { check };
