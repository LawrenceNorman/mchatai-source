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

console.log(
  JSON.stringify(
    {
      ok: true,
      recipe: marker.recipe,
      mode: marker.mode || "unspecified",
      componentCount: marker.components.length,
      components: marker.components
    },
    null,
    2
  )
);
