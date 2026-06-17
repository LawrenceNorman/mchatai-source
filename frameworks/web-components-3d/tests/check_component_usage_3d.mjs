#!/usr/bin/env node
// check_component_usage_3d.mjs — the 3D sibling of
// web-components/tests/check_component_usage.mjs. Validates an installed
// three.js artifact against the web-components-3d catalog.
//
// Shared with the 2D validator:
//   - mchatai-web-components-used marker present + valid JSON
//   - marker.recipe matches the expected recipe (when given)
//   - marker.components are all real catalog ids
//   - each selected component's exports/path appear in source
//   - recipe.requiredComponents are a subset of marker.components
//   - addons[] (if any) are real, flagged isAddon, and bring their deps
//   - no internal jargon in user-visible DOM text
//
// 3D-SPECIFIC gates (the reason this file exists):
//   - tjs-001/002: a LOCAL importmap is present, maps "three" + "three/addons/"
//     to ./resources/three/..., and contains NO remote (https://) three URL
//   - tjs-003/CDN-ban: no remote three.js URL anywhere in source
//   - claimed-imports-present-and-on-disk: every three/addons/<path> the source
//     imports must exist under resources/three/addons/ in the catalog
//   - vendored-core-on-disk: resources/three/three.module.min.js exists in the
//     catalog (the importmap target)
//   - tjs-007: the render loop increments window.__threeFrameCount
//   - Wave 4 GLB tier: any glb-embedded model used must have a CREDITS.md entry
//
// Usage: node tests/check_component_usage_3d.mjs <artifact-index.html> [expected-recipe-id]

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const catalogPath = resolve(here, "../_index.json");
const catalogRoot = resolve(here, ".."); // web-components-3d/
const usage =
  "Usage: node tests/check_component_usage_3d.mjs <artifact-index.html> [expected-recipe-id]";

function fail(message, details = {}) {
  console.error(JSON.stringify({ ok: false, message, ...details }, null, 2));
  process.exit(1);
}

function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    fail(`Unable to read ${path}`, { error: error.message });
  }
}

function collectSourceText(rootDir) {
  const sourceExtensions = new Set([".html", ".js", ".mjs"]);
  const chunks = [];
  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith(".")) continue;
      const path = join(dir, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        walk(path);
        continue;
      }
      if (sourceExtensions.has(extname(path))) chunks.push(readText(path));
    }
  }
  walk(rootDir);
  return chunks.join("\n");
}

const artifactPath = process.argv[2] ? resolve(process.argv[2]) : "";
const expectedRecipeID = process.argv[3] || "";

if (!artifactPath || !existsSync(artifactPath)) fail(usage);
if (!existsSync(catalogPath)) fail(`Missing web-components-3d catalog at ${catalogPath}`);

const html = readText(artifactPath);
const artifactDir = dirname(artifactPath);
const sourceText = collectSourceText(artifactDir);
const catalog = JSON.parse(readText(catalogPath));

// ----- marker -----------------------------------------------------------
const markerMatch = html.match(
  /<script\b(?=[^>]*\bid=["']mchatai-web-components-used["'])[^>]*>([\s\S]*?)<\/script>/i
);
if (!markerMatch) {
  fail("Missing mchatai-web-components-used marker. Artifact is likely a fallback monolith.");
}
let marker;
try {
  marker = JSON.parse(markerMatch[1].trim());
} catch (error) {
  fail("Invalid mchatai-web-components-used JSON marker.", { error: error.message });
}

const recipes = Array.isArray(catalog.compositionRecipes)
  ? catalog.compositionRecipes
  : Array.isArray(catalog.recipes)
    ? catalog.recipes
    : [];
const catalogRecipeIDs = new Set(recipes.map((r) => r && r.id).filter(Boolean));
const recipeByID = new Map(recipes.filter((r) => r && r.id).map((r) => [r.id, r]));

function normalizeRecipeID(id) {
  return typeof id === "string" ? id.replace(/^recipe\./, "") : id;
}
function resolveExpectedRecipeID(input) {
  if (typeof input !== "string" || !input) return input;
  if (input.startsWith("recipe.") && catalogRecipeIDs.has(input)) return input;
  const asRecipe = `recipe.${input.replace(/^recipe\./, "")}`;
  if (catalogRecipeIDs.has(asRecipe)) return asRecipe;
  return input;
}

if (expectedRecipeID) {
  const resolved = resolveExpectedRecipeID(expectedRecipeID);
  if (normalizeRecipeID(marker.recipe) !== normalizeRecipeID(resolved)) {
    fail("Generated 3D artifact used the wrong recipe.", {
      expectedRecipeID,
      resolvedRecipeID: resolved !== expectedRecipeID ? resolved : undefined,
      actualRecipeID: marker.recipe
    });
  }
}

if (!Array.isArray(marker.components) || marker.components.length === 0) {
  fail("Component marker must list at least one component id.", { marker });
}

const componentByID = new Map((catalog.components || []).map((c) => [c.id, c]));
const unknownComponents = marker.components.filter((id) => !componentByID.has(id));
if (unknownComponents.length > 0) {
  fail("Component marker references ids not present in _index.json.", { unknownComponents });
}

// ----- exports / paths present ------------------------------------------
const missingExports = [];
for (const componentID of marker.components) {
  const component = componentByID.get(componentID);
  const exports = Array.isArray(component.exports) ? component.exports : [];
  const hasExportUsage = exports.length === 0 || exports.some((name) => sourceText.includes(name));
  const hasPathUsage = component.path && sourceText.includes(component.path);
  if (!hasExportUsage && !hasPathUsage) {
    missingExports.push({ componentID, expectedAnyOf: exports, path: component.path });
  }
}
if (missingExports.length > 0) {
  fail("Component marker was present, but selected component exports/paths were not found in source.", {
    missingExports
  });
}

// ----- required-components subset ---------------------------------------
const recipeMeta = recipeByID.get(marker.recipe);
if (recipeMeta && Array.isArray(recipeMeta.requiredComponents) && recipeMeta.requiredComponents.length > 0) {
  const markerSet = new Set(marker.components);
  const missingRequired = recipeMeta.requiredComponents.filter((id) => !markerSet.has(id));
  if (missingRequired.length > 0) {
    fail("Marker is missing required components for this recipe.", {
      recipe: marker.recipe,
      requiredComponents: recipeMeta.requiredComponents,
      optionalComponents: recipeMeta.optionalComponents || [],
      markerComponents: marker.components,
      missingRequired
    });
  }
}

// ----- 3D GATE 1: local importmap, no remote three (tjs-001/002/003) -----
const importmapMatch = html.match(
  /<script\b[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i
);
// Only enforce the importmap when the artifact actually uses bare "three"
// module specifiers. The dependency-free lowpoly-canvas3d path imports nothing.
const usesBareThree = /from\s+["']three["']|from\s+["']three\/addons\//.test(sourceText);
if (usesBareThree) {
  if (!importmapMatch) {
    fail("Artifact imports bare 'three' but has no <script type=importmap>. tjs-001/002.");
  }
  let importmap;
  try {
    importmap = JSON.parse(importmapMatch[1].trim());
  } catch (error) {
    fail("Invalid importmap JSON.", { error: error.message });
  }
  const imports = (importmap && importmap.imports) || {};
  const threeTarget = imports["three"];
  const addonsTarget = imports["three/addons/"];
  if (!threeTarget || /^https?:|^\/\//.test(threeTarget)) {
    fail("importmap 'three' must map to a LOCAL ./resources/three path, not a remote URL. tjs-001.", {
      threeTarget
    });
  }
  if (!addonsTarget || /^https?:|^\/\//.test(addonsTarget)) {
    fail("importmap 'three/addons/' must map to a LOCAL ./resources/three/addons/ path. tjs-001.", {
      addonsTarget
    });
  }
  // The importmap must appear before the first module <script> (tjs-002).
  const importmapIdx = html.search(/<script\b[^>]*type=["']importmap["']/i);
  const firstModuleIdx = html.search(/<script\b[^>]*type=["']module["']/i);
  if (firstModuleIdx !== -1 && importmapIdx > firstModuleIdx) {
    fail("importmap must appear in <head> BEFORE the first module <script>. tjs-002.");
  }
}

// No remote three.js URL anywhere (the CDN ban — matches the Swift B-catch).
const remoteThree = sourceText.match(
  /https?:\/\/[^"'\s]*three[^"'\s]*\.js|https?:\/\/(?:unpkg|cdn\.jsdelivr|cdnjs)[^"'\s]*three/i
);
if (remoteThree) {
  fail("Remote three.js URL found — artifact will break offline under file://. tjs-001/003.", {
    offendingUrl: remoteThree[0]
  });
}

// ----- 3D GATE 2: claimed addon imports exist on disk in the catalog ----
const addonImportRe = /from\s+["']three\/addons\/([^"']+)["']/g;
const claimedAddons = new Set();
let am;
while ((am = addonImportRe.exec(sourceText))) claimedAddons.add(am[1]);
const missingAddonsOnDisk = [];
for (const rel of claimedAddons) {
  const onDisk = resolve(catalogRoot, "resources/three/addons", rel);
  if (!existsSync(onDisk)) missingAddonsOnDisk.push(rel);
}
if (missingAddonsOnDisk.length > 0) {
  fail("Artifact imports three/addons/<path> that are not vendored on disk. Will 404 under file://.", {
    missingAddonsOnDisk,
    lookedUnder: resolve(catalogRoot, "resources/three/addons")
  });
}

// ----- 3D GATE 3: vendored core on disk (the importmap target) ----------
if (usesBareThree) {
  const coreCandidates = [
    resolve(catalogRoot, "resources/three/three.module.min.js"),
    resolve(catalogRoot, "resources/three/three.module.js"),
    resolve(catalogRoot, "resources/three/three.min.js")
  ];
  if (!coreCandidates.some((p) => existsSync(p))) {
    fail("Vendored three.js core not found in catalog resources/three/.", { coreCandidates });
  }
}

// ----- 3D GATE 4: render loop increments __threeFrameCount (tjs-007) -----
// Advisory unless the artifact is a three-scene game. The lowpoly-canvas3d
// (no WebGL) path is exempt.
const isWebGLScene = usesBareThree || /WebGLRenderer/.test(sourceText);
const frameCounterPresent = /__threeFrameCount/.test(sourceText);
if (isWebGLScene && !frameCounterPresent) {
  fail("WebGL artifact does not increment window.__threeFrameCount in its render loop. tjs-007 (the render-gate liveness probe relies on this).");
}

// ----- 3D GATE 5: GLB hero tier needs CREDITS (Wave 4) ------------------
// If the marker declares models[] that resolve to glb-embedded tier in the
// models-manifest, each must have a CREDITS.md entry. No-op pre-Wave-4.
const creditsWarnings = [];
const manifestPath = resolve(catalogRoot, "models/models-manifest.json");
const creditsPath = resolve(catalogRoot, "models/CREDITS.md");
if (Array.isArray(marker.models) && marker.models.length > 0 && existsSync(manifestPath)) {
  let manifest;
  try {
    manifest = JSON.parse(readText(manifestPath));
  } catch {
    manifest = null;
  }
  const modelByID = new Map(
    (manifest && Array.isArray(manifest.models) ? manifest.models : [])
      .filter((m) => m && m.id)
      .map((m) => [m.id, m])
  );
  const credits = existsSync(creditsPath) ? readText(creditsPath) : "";
  for (const modelID of marker.models) {
    const m = modelByID.get(modelID);
    if (m && m.tier === "glb-embedded") {
      const src = (m.license && m.license.source) || m.displayName || modelID;
      if (!credits.includes(src) && !credits.includes(modelID)) {
        creditsWarnings.push({ modelID, source: src, reason: "no CREDITS.md entry" });
      }
    }
  }
  if (creditsWarnings.length > 0) {
    fail("glb-embedded model(s) used without a CREDITS.md attribution entry.", { creditsWarnings });
  }
}

// ----- jargon scan (shared with 2D) -------------------------------------
const BANNED_USER_VISIBLE_PHRASES = [
  "lego block",
  "lego blocks",
  "web component",
  "web-component",
  "golden assembly",
  "harness scaffold"
];
function extractUserVisibleText(htmlSource) {
  return htmlSource
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const visibleText = extractUserVisibleText(html).toLowerCase();
const jargonHits = BANNED_USER_VISIBLE_PHRASES.filter((p) => visibleText.includes(p));
if (jargonHits.length > 0) {
  fail("User-visible content contains banned internal architecture jargon.", { jargonHits });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      recipe: marker.recipe,
      mode: marker.mode || "unspecified",
      componentCount: marker.components.length,
      components: marker.components,
      models: Array.isArray(marker.models) ? marker.models : [],
      importmapCheck: usesBareThree ? "local-verified" : "n/a (no bare three imports)",
      vendoredAddons: [...claimedAddons],
      frameCounter: isWebGLScene ? (frameCounterPresent ? "present" : "missing") : "n/a",
      jargonScan: "clean"
    },
    null,
    2
  )
);
