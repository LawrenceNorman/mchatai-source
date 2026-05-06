#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const catalogPath = resolve(here, "../_index.json");
const usage = "Usage: node tests/check_component_usage.mjs <artifact-index.html> [expected-recipe-id]";

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

function normalizeInlineSource(text) {
  return text
    .replace(/^\s*import\s+[^;]+;?\s*$/gm, "")
    .replace(/\bexport\s+(?=(class|function|const|let|var)\b)/g, "")
    .replace(/\bexport\s*\{[^}]*\};?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function collectSourceText(rootDir) {
  const sourceExtensions = new Set([".html", ".js", ".mjs"]);
  const chunks = [];

  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith(".")) {
        continue;
      }

      const path = join(dir, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        walk(path);
        continue;
      }

      if (sourceExtensions.has(extname(path))) {
        chunks.push(readText(path));
      }
    }
  }

  walk(rootDir);
  return chunks.join("\n");
}

const artifactPath = process.argv[2] ? resolve(process.argv[2]) : "";
const expectedRecipeID = process.argv[3] || "";

if (!artifactPath || !existsSync(artifactPath)) {
  fail(usage);
}

if (!existsSync(catalogPath)) {
  fail(`Missing web-components catalog at ${catalogPath}`);
}

const html = readText(artifactPath);
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

if (expectedRecipeID && marker.recipe !== expectedRecipeID) {
  fail("Generated artifact used the wrong web-components recipe.", {
    expectedRecipeID,
    actualRecipeID: marker.recipe
  });
}

if (!Array.isArray(marker.components) || marker.components.length === 0) {
  fail("Component marker must list at least one component id.", { marker });
}

const catalog = JSON.parse(readText(catalogPath));
const componentByID = new Map((catalog.components || []).map((component) => [component.id, component]));
const unknownComponents = marker.components.filter((id) => !componentByID.has(id));

if (unknownComponents.length > 0) {
  fail("Component marker references ids not present in _index.json.", { unknownComponents });
}

const sourceText = collectSourceText(dirname(artifactPath));
const missingExports = [];
const missingCanonicalSources = [];
const missingModuleImports = [];
const mode = marker.mode || "unspecified";

for (const componentID of marker.components) {
  const component = componentByID.get(componentID);
  const exports = Array.isArray(component.exports) ? component.exports : [];
  const hasExportUsage = exports.length === 0 || exports.some((name) => sourceText.includes(name));
  const hasPathUsage = component.path && sourceText.includes(component.path);

  if (!hasExportUsage && !hasPathUsage) {
    missingExports.push({
      componentID,
      expectedAnyOf: exports,
      path: component.path
    });
  }

  if (mode === "module-imports" && component.path && !sourceText.includes(component.path)) {
    missingModuleImports.push({
      componentID,
      expectedPath: component.path
    });
  }

  if (mode === "single-file-inline" && component.path) {
    const componentSourcePath = resolve(here, "..", component.path);
    if (!existsSync(componentSourcePath)) {
      missingCanonicalSources.push({ componentID, path: component.path, reason: "catalog source file missing" });
      continue;
    }

    const expected = normalizeInlineSource(readText(componentSourcePath));
    const actual = normalizeInlineSource(sourceText);
    const hasBeginMarker = sourceText.includes(`BEGIN mChatAI Web Component: ${componentID}`);
    const hasCanonicalSource = expected.length > 0 && actual.includes(expected);

    if (!hasBeginMarker || !hasCanonicalSource) {
      missingCanonicalSources.push({
        componentID,
        path: component.path,
        missingBeginMarker: !hasBeginMarker,
        missingCanonicalSource: !hasCanonicalSource
      });
    }
  }
}

if (missingExports.length > 0) {
  fail("Component marker was present, but selected component exports/paths were not found in source.", {
    missingExports
  });
}

if (missingModuleImports.length > 0) {
  fail("Module artifact marker was present, but selected component import paths were not found in source.", {
    mode,
    missingModuleImports
  });
}

if (missingCanonicalSources.length > 0) {
  fail("Inline artifact marker was present, but selected canonical component source bodies were not included.", {
    mode,
    missingCanonicalSources
  });
}

// AI-opponent presence check. Recipes flagged `requiresAIOpponent: true` in
// _index.json must include at least one component declared in their
// `aiOpponentComponents` list, OR the artifact source must contain inline
// opponent logic (a function name like `selectComputerMove`, `cpuTurn`,
// `opponentMove`, etc.). Without this gate, the LLM can ship a 2-player game
// where the human plays both sides — see wisdom rule u-010 / bg-005.
//
// The catalog uses `compositionRecipes` (legacy key), or `recipes` if
// re-indexed. We check both so future renames don't silently disable the gate.
const recipes = Array.isArray(catalog.compositionRecipes)
  ? catalog.compositionRecipes
  : Array.isArray(catalog.recipes)
    ? catalog.recipes
    : [];
const recipeMeta = recipes.find((r) => r && r.id === marker.recipe);

// Phase LF.4 — required-components subset check. Marker must include every
// id from recipe.requiredComponents (when present). Optional components may
// appear or be omitted freely. Pre-LF.4 recipes don't have requiredComponents
// — those skip this check (back-compat); the AI-opponent + restart-button
// gates still cover the load-bearing pieces for those.
if (recipeMeta && Array.isArray(recipeMeta.requiredComponents) && recipeMeta.requiredComponents.length > 0) {
  const markerSet = new Set(marker.components);
  const missingRequired = recipeMeta.requiredComponents.filter((id) => !markerSet.has(id));
  if (missingRequired.length > 0) {
    fail(
      "Marker is missing required components for this recipe. Required components must appear in the marker's components array; optional components may be omitted.",
      {
        recipe: marker.recipe,
        requiredComponents: recipeMeta.requiredComponents,
        optionalComponents: recipeMeta.optionalComponents || [],
        markerComponents: marker.components,
        missingRequired
      }
    );
  }
}

if (recipeMeta && recipeMeta.requiresAIOpponent === true) {
  const expected = Array.isArray(recipeMeta.aiOpponentComponents) && recipeMeta.aiOpponentComponents.length > 0
    ? recipeMeta.aiOpponentComponents
    : ["entities.simple-opponent"];
  const hasComponent = expected.some((id) => marker.components.includes(id));
  const inlineMarkers = [
    /\bselectComputerMove\s*\(/,
    /\bopponentMove\s*\(/,
    /\bcpuTurn\s*\(/,
    /\bcpuPlayTurn\s*\(/,
    /\baiMove\s*\(/,
    /\bplayAITurn\s*\(/,
    /\bcomputerMove\s*\(/,
    // Inline AI classes — match any `class FooAI` definition or `new FooAI(`
    // construction. Catches example-local AI implementations not in the catalog.
    /\bclass\s+\w*AI\b/,
    /\bnew\s+\w+AI\s*\(/
  ];
  const hasInline = inlineMarkers.some((re) => re.test(sourceText));
  if (!hasComponent && !hasInline) {
    fail(
      "Recipe requires an AI opponent but neither a recognized AI component nor an inline opponent function was found. The user cannot be left to play both sides. See wisdom rule u-010 / bg-005.",
      {
        recipe: marker.recipe,
        expectedAnyOf: expected,
        markerComponents: marker.components,
        inlineFunctionPatterns: inlineMarkers.map((re) => re.source)
      }
    );
  }
}

// Restart-button presence check. Opt-in per recipe: only enforced when a
// recipe explicitly sets `requiresRestartButton: true`. As recipes are wired
// to mount `ui.restart-overlay` (or carry inline restart UI), flip the flag
// to enable the check. See wisdom rule u-029 + bg-restart-button.
if (recipeMeta && recipeMeta.requiresRestartButton === true) {
  const hasComponent = marker.components.includes("ui.restart-overlay");
  const inlineRestartPatterns = [
    /\bRestartOverlay\b/,
    /\bonRestart\b/,
    /textContent\s*=\s*["'`](?:Play Again|Restart|New Game|Try Again)/i,
    /innerHTML\s*=[^;]*(?:Play Again|Restart|New Game|Try Again)/i,
    /<button[^>]*>(?:\s|<[^>]+>)*(?:Play Again|Restart|New Game|Try Again)/i,
    /\bplayAgain\b/,
    /\brestartGame\b/,
    /\bresetGame\b/,
    /\bnewGame\s*\(/
  ];
  const hasInline = inlineRestartPatterns.some((re) => re.test(sourceText));
  if (!hasComponent && !hasInline) {
    fail(
      "Recipe with a terminal phase requires a visible restart affordance, but neither ui.restart-overlay nor an inline restart button was found. See wisdom rules u-029 / bg-restart-button / ag-restart-button.",
      {
        recipe: marker.recipe,
        markerComponents: marker.components,
        inlinePatterns: inlineRestartPatterns.map((re) => re.source)
      }
    );
  }
}

// Leaderboard-submit info check. Recipes flagged `requiresLeaderboardSubmit: true`
// SHOULD wire `window.mChatAI.leaderboard.submit(...)` somewhere — but this is
// info-level only (warn, don't fail) since some game variants may legitimately
// skip it. See wisdom rules bg-006 / ag-010 / u-018.
const leaderboardWarnings = [];
if (recipeMeta && recipeMeta.requiresLeaderboardSubmit === true) {
  const wiresLeaderboard =
    /window\s*\.\s*mChatAI\s*\.\s*leaderboard|mChatAI\?\.\s*leaderboard|Leaderboard\s*\.\s*submitFinal|submitAndShowRank/.test(
      sourceText
    );
  if (!wiresLeaderboard) {
    leaderboardWarnings.push(
      "Recipe is flagged requiresLeaderboardSubmit but no leaderboard.submit() call was found. Recommend importing ui/Leaderboard or calling window.mChatAI?.leaderboard?.submit on game-over."
    );
  }
}

// Genre-invariants info check. Recipes flagged `requiresGenreInvariants: <id>`
// (e.g. "ag-pacman-invariants") report which wisdom checklist applies. We don't
// parse the rule body; we just surface the hint so QA agents can manually verify.
const genreInvariantNote = recipeMeta?.requiresGenreInvariants || null;

// User-visible jargon scan. Architecture terms must not leak into DOM text.
// We strip <script>, <style>, and tag attributes, then case-insensitive search the remaining text.
const BANNED_USER_VISIBLE_PHRASES = [
  "lego block",
  "lego blocks",
  "assembled from lego",
  "assembled from blocks",
  "web component",
  "web-component",
  "mini-app",
  "mini app",
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
const jargonHits = BANNED_USER_VISIBLE_PHRASES.filter((phrase) => visibleText.includes(phrase));

if (jargonHits.length > 0) {
  fail(
    "User-visible content contains banned internal architecture jargon. Internal terms must stay in code/comments, not DOM text. See wisdom rule u-026.",
    { jargonHits }
  );
}

console.log(
  JSON.stringify(
    {
      ok: true,
      recipe: marker.recipe,
      mode: marker.mode || "unspecified",
      componentCount: marker.components.length,
      components: marker.components,
      jargonScan: "clean",
      restartCheck: recipeMeta?.requiresRestartButton === true ? "passed" : "skipped",
      leaderboardWarnings,
      genreInvariantNote
    },
    null,
    2
  )
);
