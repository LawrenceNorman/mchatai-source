#!/usr/bin/env node
// Check retro-fps levels without a browser.
//
//   node rfps-check.js <index.html | level.txt> [more files...]
//
// Compiles every <script type="text/x-retro-fps-map"> block in an HTML page (or
// a bare level text file) with the same compiler the page uses, and reports
// mistakes by level, row and column. Texture, flat and music names are checked
// against the base art when dist/rfps-names.json is present. Exit status is 1
// when a level would not load, or loads but plays unfairly (DESIGN lines: for
// example monsters that can see the player start and shoot before the player
// has moved). Fix DESIGN lines too; the page plays them, but badly.
"use strict";
const fs = require("fs");
const path = require("path");
const runtime = require(path.join(__dirname, "..", "runtime", "rfps-runtime.js"));

const namesPath = path.join(__dirname, "..", "dist", "rfps-names.json");
let names = null;
if (fs.existsSync(namesPath)) {
  const raw = JSON.parse(fs.readFileSync(namesPath, "utf8"));
  names = {};
  for (const k of ["textures", "flats", "music"]) names[k] = Object.fromEntries((raw[k] || []).map((n) => [n, 1]));
}

function levelsIn(file) {
  const text = fs.readFileSync(file, "utf8");
  if (!/\.html?$/i.test(file)) return [text];
  const re = /<script\b[^>]*type\s*=\s*["']text\/x-retro-fps-map["'][^>]*>([\s\S]*?)<\/script>/gi;
  const out = [];
  let m;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

let failed = false;
for (const file of process.argv.slice(2)) {
  const texts = levelsIn(file);
  if (!texts.length) {
    console.log(`${file}: no <script type="text/x-retro-fps-map"> blocks found`);
    failed = true;
    continue;
  }
  try {
    const { levels, warnings, design } = runtime.compileLevels(texts, { names, fairStart: false });
    for (const lv of levels) {
      const c = lv.compiled;
      console.log(`${file}: ${lv.lumpName} "${lv.meta.name || ""}" ok: ${c.linedefs.length} lines, ` +
        `${c.sectors.length} sectors, ${c.things.length} things`);
    }
    for (const w of warnings) console.log(`${file}: warning: ${w}`);
    for (const d of design) console.log(`${file}: DESIGN ${d}`);
    if (design.length) failed = true;
  } catch (e) {
    console.log(`${file}: ERROR ${e.message}`);
    failed = true;
  }
}
if (process.argv.length < 3) {
  console.log("usage: node rfps-check.js <index.html | level.txt> [...]");
  failed = true;
}
process.exit(failed ? 1 : 0);
