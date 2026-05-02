#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const casesPath = resolve(here, "catalog_generation_cases.json");
const checkerPath = resolve(here, "check_component_usage.mjs");
const tunnelDir = process.env.MCHATAI_DEBUG_TUNNEL ||
  resolve(
    homedir(),
    "Library/Containers/com.sevenhillsstudio.mChatAImac/Data/Library/Application Support/mChatAI/DebugTunnel"
  );
const appSupportDir = process.env.MCHATAI_APP_SUPPORT ||
  resolve(
    homedir(),
    "Library/Containers/com.sevenhillsstudio.mChatAImac/Data/Library/Application Support/mChatAI"
  );
const pollMs = 500;

function usage() {
  return [
    "Usage: node tests/run_catalog_generation_canaries.mjs [--smoke] [--all] [--case <id>]",
    "",
    "Examples:",
    "  node tests/run_catalog_generation_canaries.mjs --smoke",
    "  node tests/run_catalog_generation_canaries.mjs --case word-quest",
    "  node tests/run_catalog_generation_canaries.mjs --all"
  ].join("\n");
}

function fail(message, details = {}) {
  console.error(JSON.stringify({ ok: false, message, ...details }, null, 2));
  process.exit(1);
}

function readJSON(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function selectedCases(allCases) {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    process.exit(0);
  }

  if (args.includes("--all")) {
    return allCases;
  }

  const caseIndex = args.indexOf("--case");
  if (caseIndex >= 0) {
    const id = args[caseIndex + 1];
    if (!id) {
      fail("Missing value after --case.", { usage: usage() });
    }
    const match = allCases.find((testCase) => testCase.id === id);
    if (!match) {
      fail(`Unknown case: ${id}`, { availableCases: allCases.map((testCase) => testCase.id) });
    }
    return [match];
  }

  return allCases.filter((testCase) => testCase.smoke);
}

function assertTunnelReady() {
  if (!existsSync(resolve(tunnelDir, "ready"))) {
    fail(`DebugTunnel ready file not found at ${resolve(tunnelDir, "ready")}`);
  }
}

function writeTunnelRequest(requestID, payload) {
  const inboxDir = resolve(tunnelDir, "inbox");
  mkdirSync(inboxDir, { recursive: true });
  const safeID = requestID.replace(/[^A-Za-z0-9_.-]/g, "-");
  writeFileSync(resolve(inboxDir, `${Date.now()}-${safeID}.json`), JSON.stringify(payload, null, 2));
}

async function waitForResponse(requestID, timeoutSeconds) {
  const responsePath = resolve(tunnelDir, "responses", `${requestID}.json`);
  const legacyPath = resolve(tunnelDir, "response.json");
  const started = Date.now();
  const timeoutMs = timeoutSeconds * 1000;

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

function miniAppIDFromResponse(response) {
  return response.miniAppID ||
    response.artifactID ||
    (response.artifactIDs && response.artifactIDs.miniApp) ||
    "";
}

function checkArtifact(miniAppID, expectedRecipe) {
  const indexPath = resolve(appSupportDir, "MiniApps/installed", miniAppID, "index.html");
  if (!existsSync(indexPath)) {
    fail("Generated mini-app index.html not found.", { miniAppID, indexPath });
  }

  const result = spawnSync(process.execPath, [checkerPath, indexPath, expectedRecipe], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    fail("Generated mini-app failed Web Components usage check.", {
      miniAppID,
      indexPath,
      checkerStdout: result.stdout.trim(),
      checkerStderr: result.stderr.trim()
    });
  }

  return {
    indexPath,
    usage: JSON.parse(result.stdout)
  };
}

if (!existsSync(casesPath)) {
  fail(`Missing cases file: ${casesPath}`);
}

assertTunnelReady();

const casesFile = readJSON(casesPath);
const cases = selectedCases(casesFile.cases || []);
let failed = 0;

for (const testCase of cases) {
  const requestID = `lego-gen-${testCase.id}-${Date.now()}`;
  const timeoutSeconds = Number(testCase.timeoutSeconds || 900);
  console.log(`RUN ${testCase.id} → ${testCase.expectedRecipe}`);

  writeTunnelRequest(requestID, {
    command: "runWizard",
    goal: testCase.goal,
    artifactType: testCase.artifactType || "miniApp",
    difficulty: testCase.difficulty || "L1",
    maxTurns: Number(testCase.maxTurns || 8),
    timeoutSeconds,
    requestID
  });

  let response;
  try {
    response = await waitForResponse(requestID, timeoutSeconds);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${testCase.id}: ${error.message}`);
    continue;
  }

  const miniAppID = miniAppIDFromResponse(response);
  if (response.status !== "ok" || !miniAppID) {
    failed += 1;
    console.error(`FAIL ${testCase.id}: generation did not return an installed mini-app.`);
    console.error(JSON.stringify({
      status: response.status,
      phase: response.phase,
      output: response.output,
      failureReason: response.failureReason,
      miniAppID
    }, null, 2));
    continue;
  }

  try {
    const artifact = checkArtifact(miniAppID, testCase.expectedRecipe);
    console.log(`PASS ${testCase.id} → ${miniAppID}`);
    console.log(JSON.stringify({
      indexPath: artifact.indexPath,
      recipe: artifact.usage.recipe,
      mode: artifact.usage.mode,
      components: artifact.usage.components
    }, null, 2));
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${testCase.id}: ${error.message}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed}/${cases.length} generation canary case(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${cases.length} generation canary case(s) passed.`);
