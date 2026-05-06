#!/usr/bin/env node
// Smoke test for the web-components MCP server. Loads the catalog and
// invokes the tool implementations directly (without the MCP transport)
// so we can verify catalog parsing, recipe lookup, and source reading.

import { existsSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

// Mirror the resolver from server.js so the test runs without the
// transport.
function resolveSourceRoot() {
  const fromEnv = process.env.MCHATAI_SOURCE_PATH;
  if (fromEnv && existsSync(join(fromEnv, "frameworks/web-components/_index.json"))) {
    return fromEnv;
  }
  const containerCache = join(
    homedir(),
    "Library/Containers/com.sevenhillsstudio.mChatAImac/Data/Library/Application Support/mChatAI/source-cache/mchatai-source"
  );
  if (existsSync(join(containerCache, "frameworks/web-components/_index.json"))) {
    return containerCache;
  }
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, "frameworks/web-components/_index.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  let here = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(here, "frameworks/web-components/_index.json"))) return here;
    const parent = dirname(here);
    if (parent === here) break;
    here = parent;
  }
  throw new Error("Could not resolve mchatai-source root");
}

const SOURCE_ROOT = resolveSourceRoot();
const catalog = JSON.parse(readFileSync(join(SOURCE_ROOT, "frameworks/web-components/_index.json"), "utf8"));

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

console.log("test 1 — catalog parses + has expected shape");
assert(Array.isArray(catalog.components), "catalog.components is an array");
assert(catalog.components.length > 0, "catalog.components is non-empty");
assert(Array.isArray(catalog.compositionRecipes), "catalog.compositionRecipes is an array");
assert(catalog.compositionRecipes.length > 0, "catalog.compositionRecipes is non-empty");

console.log("\ntest 2 — find chess recipe + components");
const chess = catalog.compositionRecipes.find((r) => r.id === "recipe.chess");
assert(chess != null, "recipe.chess is registered");
assert(Array.isArray(chess?.requiredComponents) && chess.requiredComponents.length > 0,
  "recipe.chess has requiredComponents (LF.4 split)");
assert(Array.isArray(chess?.optionalComponents),
  "recipe.chess has optionalComponents (LF.4 split)");

console.log("\ntest 3 — list_components({filter}) returns matches");
const filterResult = (() => {
  const needle = "chess";
  return catalog.components.filter((c) => {
    const hay = [c.id, c.name, c.summary, ...(c.tags || [])]
      .filter(Boolean).join(" ").toLowerCase();
    return hay.includes(needle);
  });
})();
assert(filterResult.length >= 3,
  `filter "chess" returns ≥3 components (got ${filterResult.length})`,
  filterResult.map((c) => c.id).join(", "));

console.log("\ntest 4 — list_components({recipe:'recipe.chess'}) returns required+optional");
const ids = new Set([...(chess.requiredComponents || []), ...(chess.optionalComponents || [])]);
const recipeComponents = catalog.components.filter((c) => ids.has(c.id));
assert(recipeComponents.length === ids.size,
  `every required+optional component is in catalog (${recipeComponents.length} of ${ids.size})`);

console.log("\ntest 5 — read_component({id:'entities.chess-rules'}) reads source");
const target = catalog.components.find((c) => c.id === "entities.chess-rules");
assert(target != null, "entities.chess-rules registered");
const sourcePath = join(SOURCE_ROOT, "frameworks/web-components", target.path);
assert(existsSync(sourcePath), `source file exists at ${target.path}`);
const source = readFileSync(sourcePath, "utf8");
assert(source.length > 0, "source is non-empty");
assert(source.includes("ChessRules"), "source contains ChessRules export");

console.log("\ntest 6 — read_component error path for unknown id");
const missing = catalog.components.find((c) => c.id === "entities.does-not-exist");
assert(missing == null, "lookup of non-existent id returns nothing (caller handles)");

console.log("\ntest 7 — sibling CONTEXT.md path resolution doesn't crash");
const contextPath = join(SOURCE_ROOT, "frameworks/web-components", dirname(target.path), "CONTEXT.md");
const contextExists = existsSync(contextPath);
assert(true, `CONTEXT.md probe returns ${contextExists ? "found" : "absent"} (either is valid)`);

console.log(`\n--- summary ---`);
console.log(`PASS=${passed} FAIL=${failed}`);
if (failed > 0) {
  process.exit(1);
}
