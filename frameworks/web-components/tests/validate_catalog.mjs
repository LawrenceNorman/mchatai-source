#!/usr/bin/env node
// validate_catalog.mjs — static + signature-sufficiency checks for _index.json.
//
// Tier 1 (static): schema, ASCII purity, on-disk path existence, export-name
// uniqueness, summary length, tag/goodFits floors. Cheap; runs on every PR.
//
// Tier 2 (signature sufficiency): for each fixture case, every expected
// component MUST share at least one token between prompt and (summary + tags
// + goodFits). Failure means the signature is undertelling — a stage-1 LLM
// picker that sees only the index can't find this component from surface
// text. Fixture lives in catalog_signature_gold_picks.json.
//
// Exit codes: 0 = clean (warnings allowed), 1 = errors present.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const catalogPath = resolve(here, "../_index.json");
const goldPath = resolve(here, "catalog_signature_gold_picks.json");

function readJSON(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function isASCII(s) {
  return typeof s !== "string" ? true : !/[^\x00-\x7F]/.test(s);
}

function tokens(s) {
  return String(s || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const issues = [];
function err(tier, id, message) {
  issues.push({ tier, severity: "error", id, message });
}
function warn(tier, id, message) {
  issues.push({ tier, severity: "warn", id, message });
}

if (!existsSync(catalogPath)) {
  console.error(JSON.stringify({ ok: false, message: `Missing catalog at ${catalogPath}` }, null, 2));
  process.exit(1);
}

const catalog = readJSON(catalogPath);
const components = Array.isArray(catalog.components) ? catalog.components : [];

if (components.length === 0) {
  console.error(JSON.stringify({ ok: false, message: "Catalog has no components" }, null, 2));
  process.exit(1);
}

// -------------------------------------------------------------------------
// Tier 1 — static checks
// -------------------------------------------------------------------------

const REQUIRED_FIELDS = ["id", "name", "summary", "tags", "goodFits", "exports", "path", "category"];
const SUMMARY_MIN = 40;
const SUMMARY_MAX = 320;
const MIN_TAGS = 3;
const MIN_GOODFITS = 1;

const idsSeen = new Set();
const pathsSeen = new Set();
const exportToComponent = new Map();

for (const c of components) {
  const cid = c?.id || "<missing-id>";

  for (const f of REQUIRED_FIELDS) {
    const v = c?.[f];
    const missing = v === undefined || v === null || (Array.isArray(v) && v.length === 0);
    if (missing) err("schema", cid, `missing required field: ${f}`);
  }

  if (typeof c?.id === "string") {
    if (idsSeen.has(c.id)) err("schema", cid, "duplicate component id");
    idsSeen.add(c.id);
    if (!isASCII(c.id)) err("schema", cid, "non-ASCII in id");
  }

  if (typeof c?.name === "string" && !isASCII(c.name)) {
    err("schema", cid, "non-ASCII in name");
  }

  if (typeof c?.summary === "string") {
    const len = c.summary.length;
    if (len < SUMMARY_MIN) warn("schema", cid, `summary too short (${len} < ${SUMMARY_MIN})`);
    if (len > SUMMARY_MAX) warn("schema", cid, `summary too long (${len} > ${SUMMARY_MAX})`);
    if (!isASCII(c.summary)) err("schema", cid, "non-ASCII in summary (Swift decoder gotcha)");
  }

  if (Array.isArray(c?.tags)) {
    if (c.tags.length < MIN_TAGS) warn("schema", cid, `tag count ${c.tags.length} < ${MIN_TAGS}`);
    for (const t of c.tags) {
      if (typeof t !== "string") err("schema", cid, `non-string tag: ${JSON.stringify(t)}`);
      else if (!isASCII(t)) err("schema", cid, `non-ASCII in tag: ${t}`);
    }
  }

  if (Array.isArray(c?.goodFits)) {
    if (c.goodFits.length < MIN_GOODFITS) warn("schema", cid, `goodFits count ${c.goodFits.length} < ${MIN_GOODFITS}`);
    for (const g of c.goodFits) {
      if (typeof g !== "string") err("schema", cid, `non-string goodFits entry: ${JSON.stringify(g)}`);
      else if (!isASCII(g)) err("schema", cid, `non-ASCII in goodFits: ${g}`);
    }
  }

  if (typeof c?.path === "string") {
    if (pathsSeen.has(c.path)) err("schema", cid, `duplicate path ${c.path}`);
    pathsSeen.add(c.path);
    const fullPath = resolve(here, "..", c.path);
    if (!existsSync(fullPath)) err("schema", cid, `path-on-disk missing: ${c.path}`);
  }

  if (Array.isArray(c?.exports)) {
    for (const exp of c.exports) {
      if (typeof exp !== "string" || !exp) continue;
      if (exportToComponent.has(exp)) {
        const prev = exportToComponent.get(exp);
        warn("schema", cid, `exported name "${exp}" also exported by ${prev}`);
      } else {
        exportToComponent.set(exp, cid);
      }
    }
  }
}

// -------------------------------------------------------------------------
// Tier 1b — recipes + assemblies (added after step-3 audit found Swift was
// silently dropping recipes with non-ASCII characters in assemblyNotes,
// keywords, etc., the same way it dropped component summaries).
// -------------------------------------------------------------------------

function scanNonASCII(value, path, ownerID, ownerKind) {
  if (typeof value === "string") {
    if (!isASCII(value)) {
      const offending = [...value].filter(ch => ch.charCodeAt(0) > 127).slice(0, 5);
      err(ownerKind, ownerID, `non-ASCII at ${path}: ${offending.join("")}`);
    }
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => scanNonASCII(v, `${path}[${i}]`, ownerID, ownerKind));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) scanNonASCII(v, `${path}.${k}`, ownerID, ownerKind);
  }
}

const componentIDs = new Set(components.map(c => c.id).filter(Boolean));
const componentPaths = new Set(components.map(c => c.path).filter(Boolean));
const recipes = Array.isArray(catalog.compositionRecipes) ? catalog.compositionRecipes : [];
const recipeIDs = new Set(recipes.map(r => r?.id).filter(Boolean));
const assemblies = Array.isArray(catalog.goldenAssemblies) ? catalog.goldenAssemblies : [];

const RECIPE_REQUIRED = ["id", "name", "keywords", "starterComponents"];
const RECIPE_COMP_REFS = ["starterComponents", "requiredComponents", "optionalComponents", "aiOpponentComponents", "requiredNow"];

for (const r of recipes) {
  const rid = r?.id || "<missing-id>";
  for (const f of RECIPE_REQUIRED) {
    const v = r?.[f];
    const missing = v === undefined || v === null || (Array.isArray(v) && v.length === 0);
    if (missing) err("recipe", rid, `missing required field: ${f}`);
  }
  if (typeof r?.id === "string" && !r.id.startsWith("recipe.")) {
    err("recipe", rid, `id must start with "recipe." (got ${r.id})`);
  }
  if (Array.isArray(r?.keywords) && r.keywords.length < 3) {
    warn("recipe", rid, `keyword count ${r.keywords.length} < 3`);
  }
  // ASCII scan over the WHOLE recipe value — catches non-ASCII in
  // assemblyNotes, keywords, name, cloneTarget, etc. that would drop the
  // recipe at Swift decode time.
  scanNonASCII(r, "$", rid, "recipe");
  // Cross-ref: every referenced component id must exist in components[].
  for (const refField of RECIPE_COMP_REFS) {
    const refs = r?.[refField];
    if (!Array.isArray(refs)) continue;
    for (const cid of refs) {
      if (typeof cid !== "string") continue;
      if (!componentIDs.has(cid)) err("recipe", rid, `${refField} references unknown component: ${cid}`);
    }
  }
  // requiredComponents should be subset of starterComponents (sanity — a
  // required component the LLM should use must also be on the starter list
  // so the wizard actually receives its source).
  if (Array.isArray(r?.requiredComponents) && Array.isArray(r?.starterComponents)) {
    const starters = new Set(r.starterComponents);
    for (const req of r.requiredComponents) {
      if (typeof req === "string" && !starters.has(req)) {
        warn("recipe", rid, `requiredComponents has ${req} but starterComponents does not`);
      }
    }
  }
}

const ASSEMBLY_REQUIRED = ["id", "name", "summary", "recipeID", "files"];
for (const a of assemblies) {
  const aid = a?.id || "<missing-id>";
  for (const f of ASSEMBLY_REQUIRED) {
    const v = a?.[f];
    const missing = v === undefined || v === null || (Array.isArray(v) && v.length === 0);
    if (missing) err("assembly", aid, `missing required field: ${f}`);
  }
  if (typeof a?.id === "string" && !a.id.startsWith("assembly.")) {
    err("assembly", aid, `id must start with "assembly." (got ${a.id})`);
  }
  if (typeof a?.recipeID === "string" && !recipeIDs.has(a.recipeID)) {
    err("assembly", aid, `recipeID references unknown recipe: ${a.recipeID}`);
  }
  scanNonASCII(a, "$", aid, "assembly");
  if (Array.isArray(a?.files)) {
    for (const file of a.files) {
      if (typeof file !== "string") continue;
      const full = resolve(here, "..", file);
      if (!existsSync(full)) err("assembly", aid, `file missing on disk: ${file}`);
    }
  }
}

// Phase WL.gate (2026-05-19) — assemblies whose source code references a
// canonical token API MUST have their parent recipe list the providing
// component in requiredComponents. Otherwise the wizard's marker omits the
// component, the inliner skips its source, and the artifact renders as a
// black canvas (ReferenceError: getSwatchByID is not defined). Caught
// 25 recipes during C5 invader / C6 crossword screenshot review.
const TOKEN_API_RULES = [
  {
    needles: ["getSwatchByID", "applySwatchVariables"],
    requires: "resources.swatches",
    reason: "calls Swatches API"
  }
];
const recipeByID = new Map(recipes.map(r => [r.id, r]));
for (const a of assemblies) {
  const aid = a?.id || "<missing-id>";
  const rid = typeof a?.recipeID === "string" ? a.recipeID : null;
  const r = rid ? recipeByID.get(rid) : null;
  if (!r) continue;
  const reqs = new Set(Array.isArray(r.requiredComponents) ? r.requiredComponents : []);
  const files = Array.isArray(a?.files) ? a.files : [];
  for (const fpath of files) {
    if (typeof fpath !== "string") continue;
    const full = resolve(here, "..", fpath);
    if (!existsSync(full)) continue;
    let text;
    try { text = readFileSync(full, "utf8"); } catch { continue; }
    for (const rule of TOKEN_API_RULES) {
      if (!rule.needles.some(n => text.includes(n))) continue;
      if (!reqs.has(rule.requires)) {
        err("recipe", rid, `assembly ${aid} ${rule.reason} but recipe.requiredComponents is missing ${rule.requires}`);
      }
    }
  }
}

// Library entryPoints should match real component paths.
const entryPoints = Array.isArray(catalog?.library?.entryPoints) ? catalog.library.entryPoints : [];
for (const ep of entryPoints) {
  if (typeof ep !== "string") continue;
  if (!componentPaths.has(ep)) {
    warn("library", "entryPoints", `entryPoint "${ep}" does not match any component path`);
  }
}

// -------------------------------------------------------------------------
// Tier 2 — signature sufficiency vs. gold-pick fixture
// -------------------------------------------------------------------------

if (existsSync(goldPath)) {
  const gold = readJSON(goldPath);
  const cases = Array.isArray(gold.cases) ? gold.cases : [];
  const ignore = new Set((gold.tokenRules?.ignoreTokens || []).map(s => s.toLowerCase()));
  const byID = new Map(components.map(c => [c.id, c]));
  // Universal components are always-included for a given category (e.g. every
  // game uses ui.mini-header). The validator only verifies their EXISTENCE in
  // the catalog and skips the prompt-overlap check, since a stage-1 picker
  // gets them from category rules rather than text retrieval.
  const universal = new Set();
  const universalMap = gold.universalComponents || {};
  for (const [category, ids] of Object.entries(universalMap)) {
    if (category.startsWith("_")) continue;
    if (!Array.isArray(ids)) continue;
    for (const id of ids) {
      universal.add(id);
      if (!byID.has(id)) err("gold", "universal", `universal component not in catalog: ${id} (category=${category})`);
    }
  }

  function signatureTokens(c) {
    const bag = new Set();
    for (const t of c?.tags || []) for (const tok of tokens(t)) bag.add(tok);
    for (const g of c?.goodFits || []) for (const tok of tokens(g)) bag.add(tok);
    for (const tok of tokens(c?.summary || "")) bag.add(tok);
    for (const tok of tokens(c?.name || "")) bag.add(tok);
    return bag;
  }

  for (const cs of cases) {
    const promptToks = tokens(cs.prompt).filter(t => !ignore.has(t));
    if (promptToks.length === 0) {
      warn("gold", cs.id, "case has zero meaningful tokens after ignore-list");
      continue;
    }
    for (const expectedID of cs.expectedComponents || []) {
      const c = byID.get(expectedID);
      if (!c) {
        err("gold", cs.id, `expected component not in catalog: ${expectedID}`);
        continue;
      }
      if (universal.has(expectedID)) continue;
      const sig = signatureTokens(c);
      const overlap = promptToks.filter(t => sig.has(t));
      if (overlap.length === 0) {
        err("gold", cs.id, `signature for ${expectedID} has zero overlap with prompt - under-tagged`);
      }
    }
  }
}

const errors = issues.filter(i => i.severity === "error");
const warnings = issues.filter(i => i.severity === "warn");

console.log(JSON.stringify({
  ok: errors.length === 0,
  catalogVersion: catalog.$schema_version || null,
  componentCount: components.length,
  errors: errors.length,
  warnings: warnings.length,
  issues
}, null, 2));

process.exit(errors.length > 0 ? 1 : 0);
