#!/usr/bin/env node
// Smoke test for the mchatai-fundamentals MCP server. Bypasses the MCP
// transport and exercises the tool implementations directly so we can
// verify category discovery, manifest parsing, and surface mapping.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const REPO_SENTINEL = "frameworks/web-components/_index.json";
const CONTENT_DIR_NAME = "content";

function resolveSourceRoot() {
  const fromEnv = process.env.MCHATAI_SOURCE_PATH;
  if (fromEnv && existsSync(join(fromEnv, REPO_SENTINEL))) return fromEnv;
  const containerCache = join(
    homedir(),
    "Library/Containers/com.sevenhillsstudio.mChatAImac/Data/Library/Application Support/mChatAI/source-cache/mchatai-source"
  );
  if (existsSync(join(containerCache, REPO_SENTINEL))) return containerCache;
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, REPO_SENTINEL))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  let here = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(here, REPO_SENTINEL))) return here;
    const parent = dirname(here);
    if (parent === here) break;
    here = parent;
  }
  throw new Error("Could not resolve mchatai-source root");
}

const SOURCE_ROOT = resolveSourceRoot();
const CONTENT_ROOT = join(SOURCE_ROOT, CONTENT_DIR_NAME);

function listCategories() {
  if (!existsSync(CONTENT_ROOT)) return [];
  return readdirSync(CONTENT_ROOT)
    .filter((name) => {
      const subdir = join(CONTENT_ROOT, name);
      try {
        return statSync(subdir).isDirectory() && existsSync(join(subdir, "manifest.json"));
      } catch {
        return false;
      }
    })
    .sort();
}

function loadManifest(category) {
  const path = join(CONTENT_ROOT, category, "manifest.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function mapSurfaces(raw, id) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== "string") continue;
    switch (k) {
      case "mcp_tool":         out.mcp = v; break;
      case "prompt_token":     out.promptToken = `{{${v}:${id}}}`; break;
      case "skill_namespace":  out.skill = `builtin.${v}.*`; break;
      case "runtime_global":   out.runtime = v; break;
      case "native_swift":     out.nativeSwift = v; break;
      case "wisdom_resource":  out.wisdomResource = v; break;
      default:                 out[k] = v;
    }
  }
  return out;
}

let passed = 0;
let failed = 0;

function assert(cond, label, detail) {
  if (cond) {
    passed++;
    console.log(`  PASS — ${label}`);
  } else {
    failed++;
    console.log(`  FAIL — ${label}${detail ? `: ${detail}` : ""}`);
  }
}

console.log("test 1 — repo root resolves");
assert(existsSync(SOURCE_ROOT), `SOURCE_ROOT exists: ${SOURCE_ROOT}`);
assert(existsSync(CONTENT_ROOT), `content dir exists: ${CONTENT_ROOT}`);

console.log("\ntest 2 — at least one category registered");
const categories = listCategories();
assert(categories.length > 0, `≥1 category (got ${categories.length}: ${categories.join(", ")})`);
assert(categories.includes("dictionaries"), "dictionaries category present");

console.log("\ntest 3 — dictionaries manifest parses");
const dictManifest = loadManifest("dictionaries");
assert(dictManifest != null, "manifest loads");
assert(dictManifest?.schema_version === "1", `schema_version is 1 (got ${dictManifest?.schema_version})`);
assert(Array.isArray(dictManifest?.fundamentals), "fundamentals array present");
assert((dictManifest?.fundamentals?.length ?? 0) >= 2,
  `≥2 dictionary fundamentals (got ${dictManifest?.fundamentals?.length ?? 0})`);

console.log("\ntest 4 — known IDs present");
const ids = (dictManifest?.fundamentals ?? []).map((f) => f.id);
assert(ids.includes("english-5letter"), "english-5letter registered");
assert(ids.includes("english-5letter-answers"), "english-5letter-answers registered");

console.log("\ntest 5 — surface mapping produces autoload vocabulary");
const sample = dictManifest.fundamentals.find((f) => f.id === "english-5letter");
const mapped = mapSurfaces(sample.surfaces, sample.id);
// Current manifest declares native_swift + wisdom_resource — verify those map.
assert(mapped.nativeSwift != null, "native_swift → nativeSwift");
assert(mapped.wisdomResource != null, "wisdom_resource → wisdomResource");

console.log("\ntest 6 — list_fundamentals catalog shape");
const fundamentals = [];
for (const category of categories) {
  const mf = loadManifest(category);
  for (const entry of mf?.fundamentals ?? []) {
    const item = {
      id: entry.id,
      category,
      summary: entry.summary || "",
      version: entry.version || "0.0.0"
    };
    if (typeof entry.size_bytes === "number") {
      item.size_kb = Math.round(entry.size_bytes / 1024);
    }
    const surfaces = mapSurfaces(entry.surfaces, entry.id);
    if (Object.keys(surfaces).length > 0) item.surfaces = surfaces;
    fundamentals.push(item);
  }
}
assert(fundamentals.length >= 2, `catalog has ≥2 entries (got ${fundamentals.length})`);
assert(fundamentals.every((f) => f.id && f.category && f.summary),
  "every entry has id + category + summary");

console.log("\ntest 7 — category filter narrows results");
const filtered = fundamentals.filter((f) => f.category === "dictionaries");
assert(filtered.length >= 2 && filtered.every((f) => f.category === "dictionaries"),
  `dictionaries filter returns ≥2 entries all in 'dictionaries' (filtered=${filtered.length}, total=${fundamentals.length})`);
// When more than one category ships (Slice D added color-palettes) the
// filter should be a strict subset.
if (categories.length > 1) {
  assert(filtered.length < fundamentals.length,
    `with ${categories.length} categories the filter is a strict subset (filtered=${filtered.length} < total=${fundamentals.length})`);
}

console.log("\ntest 8 — unknown category resolves cleanly");
const unknown = categories.includes("never-existed-category");
assert(unknown === false, "unknown category not listed");

console.log("\ntest 9 — read_dictionary returns JS const text (Slice B)");
function readDictionary(id) {
  const mf = loadManifest("dictionaries");
  const entry = mf?.fundamentals?.find((f) => f.id === id);
  if (!entry) return { error: `Unknown dictionary: ${id}` };
  const file = entry.files?.[0] || `${id}.js`;
  const path = join(CONTENT_ROOT, "dictionaries", file);
  if (!existsSync(path)) return { error: `Missing: ${file}` };
  const content = readFileSync(path, "utf8");
  return {
    id,
    category: "dictionaries",
    version: entry.version,
    format: entry.format || "js-const",
    file,
    sizeBytes: content.length,
    content
  };
}

const r1 = readDictionary("english-5letter");
assert(r1.error == null, "no error for valid id");
assert(r1.id === "english-5letter", "id round-trips");
assert(r1.category === "dictionaries", "category set");
assert(r1.version === "1.0.0", `version is 1.0.0 (got ${r1.version})`);
assert(typeof r1.content === "string" && r1.content.length > 1000,
  `content non-trivial (got ${r1.content?.length} chars)`);
assert(r1.content.includes("const") && r1.content.includes("WORDLE_DICTIONARY"),
  "content is a JS const declaration for WORDLE_DICTIONARY");
assert(r1.content.includes('"start"'),
  "expected word 'start' present in dictionary text");

console.log("\ntest 10 — read_dictionary({id:'english-5letter-answers'}) works");
const r2 = readDictionary("english-5letter-answers");
assert(r2.error == null, "answers dict reads cleanly");
assert(r2.content.includes("WORDLE_ANSWERS"), "answers content declares WORDLE_ANSWERS");
assert(r2.sizeBytes < r1.sizeBytes, "answers dict is smaller than full dict");

console.log("\ntest 11 — read_dictionary error path for unknown id");
const r3 = readDictionary("french-fries");
assert(r3.error != null, `unknown id returns error (got: ${JSON.stringify(r3).slice(0,80)})`);

console.log("\ntest 12 — manifest declares MCP surface (Slice B)");
const sample2 = dictManifest.fundamentals.find((f) => f.id === "english-5letter");
assert(sample2.surfaces?.mcp_tool === "read_dictionary",
  "english-5letter manifest declares mcp_tool: read_dictionary");
assert(sample2.surfaces?.runtime_global === "window.mchatai.dictionary",
  "english-5letter manifest declares runtime_global");

console.log(`\n--- summary ---`);
console.log(`PASS=${passed} FAIL=${failed}`);
if (failed > 0) {
  process.exit(1);
}
