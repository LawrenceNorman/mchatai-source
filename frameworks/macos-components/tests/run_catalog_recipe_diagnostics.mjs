#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const casesPath = resolve(here, "catalog_recipe_cases.json");
const tunnelDir = process.env.MCHATAI_DEBUG_TUNNEL ||
  resolve(
    homedir(),
    "Library/Containers/com.sevenhillsstudio.mChatAImac/Data/Library/Application Support/mChatAI/DebugTunnel"
  );
const timeoutMs = Number(process.env.MCHATAI_TUNNEL_TIMEOUT_MS || 60_000);
const pollMs = 250;

function usageFailure(message) {
  console.error(message);
  console.error("Usage: node tests/run_catalog_recipe_diagnostics.mjs");
  console.error("Requires a running DEBUG mChatAI app with DebugTunnel ready.");
  process.exit(2);
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function readJSON(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeTunnelRequest(requestID, payload) {
  const inboxDir = resolve(tunnelDir, "inbox");
  mkdirSync(inboxDir, { recursive: true });
  const safeID = requestID.replace(/[^A-Za-z0-9_.-]/g, "-");
  const filename = `${Date.now()}-${safeID}.json`;
  writeFileSync(resolve(inboxDir, filename), JSON.stringify(payload, null, 2));
}

async function waitForResponse(requestID) {
  const responsePath = resolve(tunnelDir, "responses", `${requestID}.json`);
  const legacyPath = resolve(tunnelDir, "response.json");
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (existsSync(responsePath)) {
      return readJSON(responsePath);
    }

    if (existsSync(legacyPath)) {
      const legacy = readJSON(legacyPath);
      if (legacy.requestID === requestID) {
        return legacy;
      }
    }

    await sleep(pollMs);
  }

  throw new Error(`Timed out waiting for DebugTunnel response ${requestID}`);
}

function assertTunnelReady() {
  if (!existsSync(resolve(tunnelDir, "ready"))) {
    usageFailure(`DebugTunnel ready file not found at ${resolve(tunnelDir, "ready")}`);
  }
}

function checkCaseOutput(testCase, response) {
  const output = response.output || "";
  const expected = testCase.expectedRecipe;
  const loadedMacOSComponents =
    output.includes("macos-components") &&
    !output.includes("macos-components → macos-components  (loader-returned-nil)");
  const selectedExpectedRecipe = output.includes(expected);
  return {
    ok: response.status === "ok" && loadedMacOSComponents && selectedExpectedRecipe,
    loadedMacOSComponents,
    selectedExpectedRecipe,
    output
  };
}

if (!existsSync(casesPath)) {
  usageFailure(`Missing cases file: ${casesPath}`);
}

assertTunnelReady();

const casesFile = readJSON(casesPath);
const cases = casesFile.cases || [];
let failed = 0;

for (const [index, testCase] of cases.entries()) {
  const requestID = `lego-macos-catalog-${testCase.id}-${Date.now()}`;
  writeTunnelRequest(requestID, {
    command: "diagHarnessContext",
    recipe: "aiwizard-macos-app",
    goal: testCase.goal,
    category: "macOSApp",
    recentUserMessages: testCase.recentUserMessages || [],
    dumpLayer: "macos-components",
    dumpChars: 1200,
    requestID
  });

  let response;
  try {
    response = await waitForResponse(requestID);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${index + 1}/${cases.length} ${testCase.id}: ${error.message}`);
    continue;
  }

  const result = checkCaseOutput(testCase, response);
  if (result.ok) {
    console.log(`PASS ${index + 1}/${cases.length} ${testCase.id} → ${testCase.expectedRecipe}`);
    continue;
  }

  failed += 1;
  console.error(`FAIL ${index + 1}/${cases.length} ${testCase.id} expected=${testCase.expectedRecipe}`);
  console.error(`  status=${response.status} loadedMacOSComponents=${result.loadedMacOSComponents} selectedExpectedRecipe=${result.selectedExpectedRecipe}`);
  console.error(result.output.slice(0, 1800));
}

if (failed > 0) {
  console.error(`\n${failed}/${cases.length} macOS catalog recipe diagnostic case(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${cases.length} macOS catalog recipe diagnostic cases passed.`);
