#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const usage = "Usage: node check_macos_component_usage.mjs <generated-app-dir-or-json> <expected-recipe-id>";
const inputPath = process.argv[2];
const expectedRecipe = process.argv[3];

if (!inputPath || !expectedRecipe) {
  console.error(usage);
  process.exit(2);
}

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const libraryRoot = path.resolve(scriptDir, "..");
const catalogPath = path.join(libraryRoot, "_index.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

const files = readGeneratedFiles(inputPath);
const markerText = files["mchatai-macos-components-used.json"];
if (!markerText) {
  fail("missing mchatai-macos-components-used.json marker file");
}

let marker;
try {
  marker = JSON.parse(markerText);
} catch (error) {
  fail(`marker file is not valid JSON: ${error.message}`);
}

if (marker.recipe !== expectedRecipe) {
  fail(`expected recipe ${expectedRecipe}, marker declared ${marker.recipe ?? "undefined"}`);
}

if (marker.mode !== "source-copy") {
  fail(`expected marker mode source-copy, got ${marker.mode ?? "undefined"}`);
}

const recipe = catalog.compositionRecipes.find((entry) => entry.id === expectedRecipe);
if (!recipe) {
  fail(`expected recipe ${expectedRecipe} was not found in _index.json`);
}

const componentsByID = new Map(catalog.components.map((component) => [component.id, component]));
const expectedComponentIDs = recipe.starterComponents?.length
  ? recipe.starterComponents
  : recipe.requiredNow ?? [];

const declared = new Set(marker.components ?? []);
const omitted = expectedComponentIDs.filter((id) => !declared.has(id));
if (omitted.length) {
  fail(`marker omitted selected component ids: ${omitted.join(", ")}`);
}

const unknown = [...declared].filter((id) => !componentsByID.has(id));
if (unknown.length) {
  fail(`marker references unknown component ids: ${unknown.join(", ")}`);
}

for (const componentID of expectedComponentIDs) {
  const component = componentsByID.get(componentID);
  const canonicalPath = path.join(libraryRoot, component.path);
  if (!fs.existsSync(canonicalPath)) {
    fail(`canonical source missing for ${componentID}: ${component.path}`);
  }

  const canonical = normalize(fs.readFileSync(canonicalPath, "utf8"));
  const generatedMatches = Object.entries(files).filter(([filePath, body]) => {
    if (!filePath.endsWith(".swift")) return false;
    return normalize(body) === canonical || normalize(body).includes(canonical);
  });

  if (!generatedMatches.length) {
    fail(`generated app did not copy canonical source for ${componentID} (${component.path})`);
  }

  const markerNeedle = `BEGIN mChatAI macOS Component: ${componentID}`;
  if (!generatedMatches.some(([, body]) => body.includes(markerNeedle))) {
    fail(`generated component source for ${componentID} is missing canonical BEGIN marker`);
  }
}

console.log(`macOS component usage OK: ${expectedRecipe} (${expectedComponentIDs.length} components)`);

function readGeneratedFiles(targetPath) {
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    const out = {};
    walk(targetPath, targetPath, out);
    return out;
  }

  const raw = fs.readFileSync(targetPath, "utf8");
  const parsed = parseArtifactJSON(raw);
  if (!parsed.files || typeof parsed.files !== "object") {
    fail("input JSON does not contain a files object");
  }
  return parsed.files;
}

function parseArtifactJSON(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("```macosapp")) {
    const body = trimmed
      .replace(/^```macosapp\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    return JSON.parse(body);
  }
  return JSON.parse(trimmed);
}

function walk(root, current, out) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name);
    const relative = path.relative(root, full).replaceAll(path.sep, "/");
    if (entry.isDirectory()) {
      if ([".build", ".git", "build", "DerivedData"].includes(entry.name)) continue;
      walk(root, full, out);
    } else if (entry.isFile()) {
      out[relative] = fs.readFileSync(full, "utf8");
    }
  }
}

function normalize(value) {
  return value.replace(/\r\n/g, "\n").trim();
}

function fail(message) {
  console.error(`macOS component usage FAIL: ${message}`);
  process.exit(1);
}
