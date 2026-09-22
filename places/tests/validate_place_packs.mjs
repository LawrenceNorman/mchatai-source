#!/usr/bin/env node
// validate_place_packs.mjs — zero-dep validator for place packs (Phase DS).
//
//   node places/tests/validate_place_packs.mjs              # repo mode: index.json + every packs/*.json
//   node places/tests/validate_place_packs.mjs <pack.json>  # single-file mode (third-party publish path)
//
// Enforces the schema rules in places/README.md: flat camelCase keys, ISO date
// strings (never epoch numbers), omit-rather-than-null, required place fields,
// index ↔ pack consistency, `variantOf` families. Unknown additive SCALAR
// fields are allowed by design — additive fields never bump schemaVersion, so
// this validator never rejects a scalar key it does not know. Nested (object/array) values stay
// forbidden everywhere except `links`: places are flat, and that flatness is
// itself part of the contract. Exit 0 pass / 1 fail. Single-file mode also
// prints a machine-readable {ok, id, placeCount, bytes} JSON line on stdout.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const placesDir = resolve(here, "..");

let errors = 0;
let warnings = 0;
const err = (m) => { errors += 1; console.error(`  ERR  ${m}`); };
const warn = (m) => { warnings += 1; console.error(`  WARN ${m}`); };
const ok = (m) => { console.error(`  ok   ${m}`); };

const CAMEL = /^[a-z][a-zA-Z0-9]*$/;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const MAX_PACK_BYTES = 1_500_000; // keep tier 3 small — warn past this

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const nonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;

// Deep structural rules that apply to EVERY key/value in every document:
// camelCase keys, no null values, no platform Date encodings (objects where a
// scalar belongs are caught by the per-field checks below).
function walk(node, path, where) {
  if (node === null) { err(`${where}: ${path} is null — omit the field instead`); return; }
  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, `${path}[${i}]`, where));
    return;
  }
  if (isObj(node)) {
    for (const [k, v] of Object.entries(node)) {
      if (!CAMEL.test(k)) err(`${where}: key "${path}.${k}" is not flat camelCase`);
      walk(v, `${path}.${k}`, where);
    }
  }
}

function checkIsoDate(obj, key, where) {
  if (!(key in obj)) return;
  const v = obj[key];
  if (typeof v === "number") { err(`${where}: ${key} is a number (epoch?) — use an ISO 8601 string`); return; }
  if (!nonEmptyString(v) || !ISO_DATE.test(v)) err(`${where}: ${key} "${v}" is not an ISO 8601 date string`);
}

function checkRegion(region, where) {
  if (!isObj(region)) { err(`${where}: region is required and must be an object`); return; }
  const { anchorLat, anchorLon, radiusKm } = region;
  if (typeof anchorLat !== "number" || anchorLat < -90 || anchorLat > 90)
    err(`${where}: region.anchorLat must be a number in [-90, 90]`);
  if (typeof anchorLon !== "number" || anchorLon < -180 || anchorLon > 180)
    err(`${where}: region.anchorLon must be a number in [-180, 180]`);
  if (typeof radiusKm !== "number" || radiusKm <= 0 || radiusKm > 2000)
    err(`${where}: region.radiusKm must be a number in (0, 2000]`);
  if ("locality" in region && !nonEmptyString(region.locality))
    err(`${where}: region.locality, when present, must be a non-empty string`);
}

function checkUrl(v, label, where) {
  if (!nonEmptyString(v)) { err(`${where}: ${label} must be a non-empty string`); return; }
  if (v.startsWith("http://")) warn(`${where}: ${label} uses http:// — prefer https`);
  else if (!v.startsWith("https://")) err(`${where}: ${label} "${v.slice(0, 60)}" is not an http(s) URL`);
}

function validatePack(filePath) {
  let raw;
  try { raw = readFileSync(filePath); } catch (e) { err(`cannot read ${filePath}: ${e.message}`); return null; }
  let pack;
  try { pack = JSON.parse(raw.toString("utf8")); } catch (e) { err(`${basename(filePath)}: invalid JSON — ${e.message}`); return null; }
  const where = basename(filePath);
  if (!isObj(pack)) { err(`${where}: top level must be an object`); return null; }

  walk(pack, "$", where);

  if (pack.schemaVersion !== 1) err(`${where}: schemaVersion must be the number 1 (got ${JSON.stringify(pack.schemaVersion)})`);
  if (!nonEmptyString(pack.id) || !KEBAB.test(pack.id)) err(`${where}: id must be kebab-case (got ${JSON.stringify(pack.id)})`);
  if (!nonEmptyString(pack.name)) err(`${where}: name is required`);
  checkIsoDate(pack, "generatedAt", where);
  checkIsoDate(pack, "updatedAt", where);
  checkRegion(pack.region, where);

  if (!Array.isArray(pack.places) || pack.places.length === 0) {
    err(`${where}: places must be a non-empty array`);
    return { pack, bytes: raw.length };
  }

  const seen = new Set();
  pack.places.forEach((p, i) => {
    const pw = `${where} places[${i}]`;
    if (!isObj(p)) { err(`${pw}: must be an object`); return; }
    if (!nonEmptyString(p.id)) err(`${pw}: id is required`);
    else if (seen.has(p.id)) err(`${pw}: duplicate place id "${p.id}"`);
    else seen.add(p.id);
    if (!nonEmptyString(p.name)) err(`${pw}: name is required`);
    if (typeof p.lat !== "number" || p.lat < -90 || p.lat > 90) err(`${pw}: lat must be a number in [-90, 90]`);
    if (typeof p.lon !== "number" || p.lon < -180 || p.lon > 180) err(`${pw}: lon must be a number in [-180, 180]`);
    for (const key of ["text", "address", "neighborhood", "category"]) {
      if (key in p && !nonEmptyString(p[key])) err(`${pw}: ${key}, when present, must be a non-empty string`);
    }
    if ("imageUrl" in p) checkUrl(p.imageUrl, "imageUrl", pw);
    if ("links" in p) {
      if (!Array.isArray(p.links) || p.links.length === 0) err(`${pw}: links, when present, must be a non-empty array`);
      else p.links.forEach((l, j) => {
        if (!isObj(l)) { err(`${pw}: links[${j}] must be {title, url}`); return; }
        if (!nonEmptyString(l.title)) err(`${pw}: links[${j}].title is required`);
        checkUrl(l.url, `links[${j}].url`, pw);
      });
    }
    // Flat check: known nested structure is links only; any other object-valued
    // field breaks the flat contract (additive SCALAR fields are fine).
    for (const [k, v] of Object.entries(p)) {
      if (k === "links") continue;
      if (isObj(v) || Array.isArray(v)) err(`${pw}: field "${k}" is nested — places are flat (only links may nest)`);
    }
  });

  if (raw.length > MAX_PACK_BYTES) warn(`${where}: ${raw.length} bytes — tier-3 packs should stay small (see README)`);
  ok(`${where}: ${pack.places.length} places, ${raw.length} bytes`);
  return { pack, bytes: raw.length };
}

// `variantOf` groups a richer pack with its base so clients show ONE row per
// family (see README "Families"). Runs after the per-entry loop so an entry may
// name a base listed after it. A dangling or chained reference is an error:
// clients would either orphan the variant or have to guess which base wins.
// Region/placeCount drift is only a warning — the bytes of API-served
// (account / premium) variants are not in this repo, so the place-id-set rule
// cannot be checked here.
function checkVariantFamilies(entries) {
  const byId = new Map();
  for (const e of entries) if (isObj(e) && nonEmptyString(e.id)) byId.set(e.id, e);
  for (const entry of entries) {
    if (!isObj(entry) || !("variantOf" in entry)) continue;
    const ew = `index.json pack "${entry.id ?? "?"}"`;
    const baseId = entry.variantOf;
    if (!nonEmptyString(baseId) || !KEBAB.test(baseId)) { err(`${ew}: variantOf must be a kebab-case pack id (got ${JSON.stringify(baseId)})`); continue; }
    if (baseId === entry.id) { err(`${ew}: variantOf names itself`); continue; }
    const base = byId.get(baseId);
    if (!base) { err(`${ew}: variantOf "${baseId}" is not a pack in index.json`); continue; }
    if ("variantOf" in base) { err(`${ew}: variantOf "${baseId}" is itself a variant — families are one level deep (no chains)`); continue; }
    const r = isObj(entry.region) ? entry.region : {};
    const br = isObj(base.region) ? base.region : {};
    if (r.anchorLat !== br.anchorLat || r.anchorLon !== br.anchorLon)
      warn(`${ew}: region anchor (${r.anchorLat}, ${r.anchorLon}) differs from its base "${baseId}" (${br.anchorLat}, ${br.anchorLon}) — a variant covers the same places`);
    if (entry.placeCount !== base.placeCount)
      warn(`${ew}: placeCount ${entry.placeCount} differs from its base "${baseId}" (${base.placeCount}) — a variant must carry the same place-id set`);
    ok(`${ew}: variant of "${baseId}"`);
  }
}

function validateRepo() {
  const indexPath = join(placesDir, "index.json");
  if (!existsSync(indexPath)) { err(`missing ${indexPath}`); return; }
  let index;
  try { index = JSON.parse(readFileSync(indexPath, "utf8")); } catch (e) { err(`index.json: invalid JSON — ${e.message}`); return; }
  if (!isObj(index)) { err("index.json: top level must be an object"); return; }

  walk(index, "$", "index.json");
  if (index.schemaVersion !== 1) err(`index.json: schemaVersion must be the number 1`);
  checkIsoDate(index, "updatedAt", "index.json");
  if (!Array.isArray(index.packs)) { err("index.json: packs must be an array"); return; }

  const listedFiles = new Set();
  const seenIds = new Set();
  for (const entry of index.packs) {
    const ew = `index.json pack "${entry?.id ?? "?"}"`;
    if (!isObj(entry)) { err("index.json: pack entry must be an object"); continue; }
    if (!nonEmptyString(entry.id) || !KEBAB.test(entry.id)) err(`${ew}: id must be kebab-case`);
    else if (seenIds.has(entry.id)) err(`${ew}: duplicate pack id`);
    else seenIds.add(entry.id);
    if (!nonEmptyString(entry.name)) err(`${ew}: name is required`);

    // Phase SL.5 — an entry names its bytes in exactly one of three ways.
    // Keep these as strict as the clients: a looser rule here validates green
    // and is permanently unloadable on every device.
    const access = String(entry.access ?? "public").toLowerCase();
    if (!["public", "account", "premium"].includes(access)) {
      err(`${ew}: access must be "public", "account" or "premium" (got ${JSON.stringify(entry.access)})`);
      continue;
    }

    if (access === "account" || access === "premium") {
      // Bytes come from GET /v1/places/packs/<id>/url, which is the only place
      // access is decided: "account" = any signed-in user, "premium" = a paid
      // plan or a grant. Either way an entry that also published a fetchable
      // location would hand the bytes to anyone, signed in or not, unmetered.
      if (entry.file || entry.url) {
        err(`${ew}: ${access} entries must NOT carry file or url — the bytes are served by the API`);
      }
      if (!Number.isInteger(entry.sizeBytes) || entry.sizeBytes <= 0) {
        err(`${ew}: ${access} entries need sizeBytes (the bandwidth meter bills against it)`);
      }
    } else if (nonEmptyString(entry.url)) {
      // Off-repo public pack. Host list mirrors allowedPackHosts on iOS and
      // ALLOWED_PACK_HOSTS on Android — adding one means shipping all three.
      let u = null;
      try { u = new URL(entry.url); } catch { /* falls through to the error */ }
      const HOSTS = ["raw.githubusercontent.com", "storage.googleapis.com", "api.mchatai.com", "mchatai.com"];
      if (!u || u.protocol !== "https:" || !HOSTS.includes(u.hostname.toLowerCase())) {
        err(`${ew}: url must be https and on an allow-listed host (got ${JSON.stringify(entry.url)})`);
        continue;
      }
      if (nonEmptyString(entry.file) && !/^packs\/[a-z0-9-]+\.json$/.test(entry.file)) {
        err(`${ew}: file, when present alongside url, must still be packs/<kebab-id>.json`);
      } else if (nonEmptyString(entry.file)) {
        listedFiles.add(entry.file);   // dual-published for pre-SL.5 clients
      }
    } else {
      // Exactly packs/<kebab>.json — clients reject anything else (prefix check
      // + ".." refusal on iOS/Android).
      if (!nonEmptyString(entry.file) || !/^packs\/[a-z0-9-]+\.json$/.test(entry.file)) {
        err(`${ew}: needs file as packs/<kebab-id>.json, or url, or access "account"/"premium" (got file=${JSON.stringify(entry.file)})`);
        continue;
      }
      listedFiles.add(entry.file);
    }
    checkRegion(entry.region, ew);
    checkIsoDate(entry, "updatedAt", ew);

    // The checks below open the pack file and compare it against the entry.
    // Only in-repo packs have one — off-repo (`url`) and API-served (account /
    // premium) packs are verified where they are published, not here. Skip
    // rather than crash.
    if (!nonEmptyString(entry.file)) continue;

    const packPath = join(placesDir, entry.file);
    if (!existsSync(packPath)) { err(`${ew}: ${entry.file} does not exist`); continue; }
    const result = validatePack(packPath);
    if (!result) continue;
    if (result.pack.id !== entry.id) err(`${ew}: pack file declares id "${result.pack.id}"`);
    if (entry.placeCount !== result.pack.places?.length)
      err(`${ew}: placeCount ${entry.placeCount} ≠ actual ${result.pack.places?.length}`);
    if (typeof entry.sizeBytes !== "number") err(`${ew}: sizeBytes is required`);
    else {
      const drift = Math.abs(entry.sizeBytes - result.bytes) / result.bytes;
      if (drift > 0.05) warn(`${ew}: sizeBytes ${entry.sizeBytes} drifts ${(drift * 100).toFixed(1)}% from actual ${result.bytes}`);
    }
  }

  checkVariantFamilies(index.packs);

  const packsDir = join(placesDir, "packs");
  if (existsSync(packsDir)) {
    for (const f of readdirSync(packsDir)) {
      if (!f.endsWith(".json")) continue;
      if (!listedFiles.has(`packs/${f}`)) err(`packs/${f} exists but is not listed in index.json — clients will never see it`);
    }
  }
  ok(`index.json: ${index.packs.length} pack(s) listed`);
}

const arg = process.argv[2];
if (arg) {
  const result = validatePack(resolve(arg));
  // Exactly ONE machine-readable line on stdout, honest about errors.
  console.log(JSON.stringify(
    result && errors === 0
      ? { ok: true, id: result.pack.id, placeCount: result.pack.places.length, bytes: result.bytes }
      : { ok: false, errors, warnings }
  ));
} else {
  validateRepo();
}

console.error(`${errors > 0 ? "FAIL" : "PASS"} — errors=${errors} warnings=${warnings}`);
process.exit(errors > 0 ? 1 : 0);
