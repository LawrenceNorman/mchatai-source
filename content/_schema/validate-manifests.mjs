#!/usr/bin/env node
// Zero-dep manifest validator for mChatAI fundamentals.
// Walks every `content/<category>/manifest.json`, checks the structural
// invariants from manifest.schema.json + a few invariants too rich to
// express in JSON Schema (file existence on disk, id uniqueness, etc.).
//
// Usage:   node content/_schema/validate-manifests.mjs
// Exit 0 on success, 1 on any validation failure.
//
// Spec: docs/MCHATAI_FUNDAMENTALS.md §12 (resolution shipped 2026-05-14).
// Intentionally dep-free — every PR contributor can run it without
// `npm install`. Replace with ajv if the validation surface grows
// substantially.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_ROOT = resolve(HERE, "..");

const SEMVER = /^\d+\.\d+\.\d+$/;
const KEBAB  = /^[a-z0-9][a-z0-9-]*$/;
const KNOWN_SURFACE_KEYS = new Set([
  "mcp_tool", "prompt_token", "skill_namespace",
  "runtime_global", "native_swift", "wisdom_resource"
]);

let errors = 0;
let warnings = 0;

function err(loc, msg)  { errors++;   console.error(`ERROR   ${loc}: ${msg}`); }
function warn(loc, msg) { warnings++; console.error(`WARN    ${loc}: ${msg}`); }
function ok(loc, msg)   { console.log(`OK      ${loc}: ${msg}`); }

function validateEntry(category, entry, idx, contentDir) {
  const loc = `${category}/[${idx}] ${entry?.id ?? "(no id)"}`;

  if (!entry || typeof entry !== "object")           return err(loc, "entry is not an object");
  if (typeof entry.id !== "string")                  err(loc, "missing 'id'");
  else if (!KEBAB.test(entry.id))                    err(loc, `'id' must be kebab-case (got '${entry.id}')`);
  if (typeof entry.version !== "string")             err(loc, "missing 'version'");
  else if (!SEMVER.test(entry.version))              err(loc, `'version' must be semver (got '${entry.version}')`);
  if (typeof entry.summary !== "string" || entry.summary.length < 8)
                                                     err(loc, "'summary' must be a string ≥8 chars");
  if (!Array.isArray(entry.files) || entry.files.length < 1)
                                                     err(loc, "'files' must be a non-empty array");

  // File existence
  for (const file of entry.files || []) {
    const path = join(contentDir, file);
    if (!existsSync(path)) {
      err(loc, `declared file does not exist on disk: ${file}`);
    } else {
      const stat = statSync(path);
      if (typeof entry.size_bytes === "number" && Math.abs(stat.size - entry.size_bytes) > stat.size * 0.05) {
        warn(loc, `declared size_bytes (${entry.size_bytes}) drifts >5% from actual (${stat.size}) for ${file}`);
      }
    }
  }

  // Bundled-fallback sanity (catches the discrepancy slice D+ surfaced).
  // We can't see the Xcode bundle from here; just warn if a large file
  // claims it's bundled (>1MB rule of thumb is too big for the app binary).
  if (entry.fallback_bundled === true && typeof entry.size_bytes === "number" && entry.size_bytes > 1_000_000) {
    warn(loc, `fallback_bundled=true but size_bytes=${entry.size_bytes} (>1MB) — probably should be false. Add fallback_bundled_note explaining.`);
  }

  // Surfaces
  if (entry.surfaces && typeof entry.surfaces === "object") {
    for (const k of Object.keys(entry.surfaces)) {
      if (!KNOWN_SURFACE_KEYS.has(k)) {
        warn(loc, `unknown surface key '${k}' (passes through, but consider standardizing)`);
      }
    }
  }
}

function validateManifest(category) {
  const contentDir = join(CONTENT_ROOT, category);
  const manifestPath = join(contentDir, "manifest.json");
  if (!existsSync(manifestPath)) return;

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    return err(`${category}/manifest.json`, `parse failed: ${e.message}`);
  }

  if (manifest.schema_version !== "1") err(`${category}/manifest.json`, `unsupported schema_version '${manifest.schema_version}'`);
  if (manifest.category !== category)  err(`${category}/manifest.json`, `manifest.category '${manifest.category}' must equal dir name '${category}'`);
  if (!Array.isArray(manifest.fundamentals) || manifest.fundamentals.length < 1)
                                       err(`${category}/manifest.json`, "fundamentals must be a non-empty array");

  // Id uniqueness within category
  const seen = new Set();
  for (let i = 0; i < (manifest.fundamentals || []).length; i++) {
    const entry = manifest.fundamentals[i];
    if (entry?.id) {
      if (seen.has(entry.id)) err(`${category}/[${i}] ${entry.id}`, "duplicate id within category");
      seen.add(entry.id);
    }
    validateEntry(category, entry, i, contentDir);
  }
  ok(`${category}/manifest.json`, `${manifest.fundamentals.length} fundamental(s) validated`);
}

// Discover every category
const categories = readdirSync(CONTENT_ROOT)
  .filter((name) => !name.startsWith("_"))
  .filter((name) => {
    try { return statSync(join(CONTENT_ROOT, name)).isDirectory(); }
    catch { return false; }
  })
  .filter((name) => existsSync(join(CONTENT_ROOT, name, "manifest.json")))
  .sort();

if (categories.length === 0) {
  console.error("No categories found under", CONTENT_ROOT);
  process.exit(1);
}

console.log(`Validating ${categories.length} category manifest(s): ${categories.join(", ")}`);
console.log("");
for (const c of categories) validateManifest(c);
console.log("");
console.log(`${errors === 0 ? "PASS" : "FAIL"} — errors=${errors} warnings=${warnings}`);
process.exit(errors > 0 ? 1 : 0);
