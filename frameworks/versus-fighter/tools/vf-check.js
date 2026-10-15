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
  if (!Array.isArray(game.fighters) || !game.fighters.length) errors.push("game.fighters needs at least one fighter");
  else if (game.fighters.length > 12) errors.push("at most 12 fighters");
  const used = new Set();
  (game.fighters || []).forEach((f, i) => {
    const who = `fighters[${i}] (${f.name || "unnamed"})`;
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
    if ((f.specials || []).filter((s) => s.projectile).length > 1) warnings.push(`${who}: one projectile special is plenty (only one can be on screen)`);
  });
  const stages = game.stages || (game.stage ? [game.stage] : []);
  if (!stages.length) warnings.push("no stages; a default one is painted");
  stages.forEach((s, i) => {
    if (!s.name) errors.push(`stages[${i}]: name is missing`);
    if (s.theme && !THEMES.includes(s.theme)) errors.push(`stages[${i}]: theme "${s.theme}" — use ${THEMES.join(", ")}`);
    for (const c of [].concat(s.sky || [], s.floor || [], s.accent || [])) if (!HEX.test(c)) errors.push(`stages[${i}]: "${c}" is not a #hex color`);
  });
  if (game.rounds != null && !(game.rounds >= 1 && game.rounds <= 5)) errors.push("rounds (to win) should be 1–5");
  if (game.timer != null && !(game.timer >= 20 && game.timer <= 99)) errors.push("timer should be 20–99 seconds");
  if (game.cpu != null && !["easy", "normal", "hard"].includes(game.cpu)) errors.push('cpu should be "easy", "normal" or "hard"');
  const srcs = [...html.matchAll(/<script[^>]*src=["']([^"']+)["']/gi)].map((x) => x[1]);
  if (!srcs.some((s) => /(^|\/)vf\.js$/.test(s))) errors.push('the page does not load the runtime: <script src="libs/vf.js"></script>');
  for (const b of used) if (!srcs.some((s) => s.endsWith(`vf-base-${b}.js`))) errors.push(`the page does not load base "${b}": <script src="libs/vf-base-${b}.js"></script>`);
  if (!/VersusFighter\.mount\(/.test(html)) errors.push("the page never calls VersusFighter.mount(...)");
  if (/https?:\/\/[^"']*\.(js|png|gif|mp3|ogg)/i.test(html)) errors.push("the page references a remote file; everything must work offline from libs/");
  return { errors, warnings, fighters: (game.fighters || []).length, stages: stages.length };
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error("usage: node vf-check.js <index.html>"); process.exit(2); }
  const r = check(file);
  r.warnings.forEach((w) => console.log("warning: " + w));
  r.errors.forEach((e) => console.log("ERROR: " + e));
  console.log(r.errors.length ? `vf-check: ${r.errors.length} error(s)` : `vf-check: OK (${r.fighters} fighters, ${r.stages} stages)`);
  process.exit(r.errors.length ? 1 : 0);
}
module.exports = { check };
