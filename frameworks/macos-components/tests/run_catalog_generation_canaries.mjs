#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { homedir, tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const casesPath = resolve(here, "catalog_generation_cases.json");
const checkerPath = resolve(here, "check_macos_component_usage.mjs");
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
const wizardSessionsPath = resolve(appSupportDir, "wizard_sessions.json");
const pollMs = 500;

function usage() {
  return [
    "Usage: node tests/run_catalog_generation_canaries.mjs [--smoke] [--all] [--case <id>]",
    "",
    "Examples:",
    "  node tests/run_catalog_generation_canaries.mjs --smoke",
    "  node tests/run_catalog_generation_canaries.mjs --case wordle-clone",
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

async function tunnelCommand(command, payload = {}, timeoutSeconds = 180) {
  const requestID = `${command}-${Date.now()}`;
  writeTunnelRequest(requestID, { command, requestID, ...payload });
  return waitForResponse(requestID, timeoutSeconds);
}

function loadWizardSession(sessionID) {
  if (!sessionID || !existsSync(wizardSessionsPath)) {
    return null;
  }

  const raw = readJSON(wizardSessionsPath);
  const sessions = Array.isArray(raw) ? raw : (raw.sessions || []);
  return sessions.find((session) => session.id === sessionID) || null;
}

function macOSAppFromSession(session) {
  const messages = Array.isArray(session?.messages) ? session.messages : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].generatedMacOSApp) {
      return messages[i].generatedMacOSApp;
    }
  }
  return null;
}

function writeArtifactJSON(app, testCase) {
  const outPath = resolve(tmpdir(), `mchatai-macos-${testCase.id}-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify({ files: app.files || {} }, null, 2));
  return outPath;
}

function checkArtifact(app, expectedRecipe, testCase) {
  const artifactPath = writeArtifactJSON(app, testCase);
  const result = spawnSync(process.execPath, [checkerPath, artifactPath, expectedRecipe], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    return {
      ok: false,
      artifactPath,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim()
    };
  }

  return {
    ok: true,
    artifactPath,
    stdout: result.stdout.trim()
  };
}

function sessionFailureSignals(session) {
  if (!session) {
    return ["session not found in wizard_sessions.json"];
  }

  const failures = [];
  if (session.phase === "failed") {
    failures.push("session phase is failed");
  }
  if (session.lastFailureReason) {
    failures.push(`lastFailureReason: ${session.lastFailureReason}`);
  }

  const messages = Array.isArray(session.messages) ? session.messages : [];
  for (const message of messages) {
    const content = String(message.content || "");
    const lower = content.toLowerCase();
    if (lower.includes("lego component gate rejected")) {
      failures.push("Lego gate rejected artifact");
    }
    if (lower.includes("build failed") || lower.includes("compile failed")) {
      failures.push("playground build failed");
    }
    if (
      lower.includes("runtime issues") ||
      lower.includes("runtime failure") ||
      lower.includes("smoke-test failed") ||
      lower.includes("smoke test failed") ||
      lower.includes("app crashed")
    ) {
      failures.push("playground runtime feedback present");
    }
  }

  return Array.from(new Set(failures));
}

function interestingPlaygroundSummary(response) {
  if (!response || response.status === "error") {
    return response ? { status: response.status, error: response.error, output: response.output } : null;
  }
  const compact = {};
  for (const key of ["status", "phase", "bundlePath", "appPath", "screenshotPath", "path", "output", "log"]) {
    if (response[key] != null) {
      compact[key] = typeof response[key] === "string" ? response[key].slice(0, 2000) : response[key];
    }
  }
  return compact;
}

if (!existsSync(casesPath)) {
  fail(`Missing cases file: ${casesPath}`);
}

assertTunnelReady();

const casesFile = readJSON(casesPath);
const cases = selectedCases(casesFile.cases || []);
let failed = 0;

for (const testCase of cases) {
  const requestID = `lego-macos-gen-${testCase.id}-${Date.now()}`;
  const timeoutSeconds = Number(testCase.timeoutSeconds || 1200);
  console.log(`RUN ${testCase.id} -> ${testCase.expectedRecipe}`);

  writeTunnelRequest(requestID, {
    command: "runWizard",
    goal: testCase.goal,
    artifactType: testCase.artifactType || "macOSApp",
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

  const session = loadWizardSession(response.sessionID);
  const app = macOSAppFromSession(session);
  const playgroundID = session?.generatedMacOSAppSessionID;
  const artifactID = response.artifactIDs?.macOSApp || response.artifactID || response.miniAppID || app?.id || "";
  const sessionFailures = sessionFailureSignals(session);

  let statusResponse = null;
  let logResponse = null;
  let screenshotResponse = null;
  if (playgroundID) {
    statusResponse = await tunnelCommand("playgroundStatus", { sessionID: playgroundID }, 180).catch((error) => ({ status: "error", error: error.message }));
    logResponse = await tunnelCommand("playgroundLog", { sessionID: playgroundID }, 180).catch((error) => ({ status: "error", error: error.message }));
    screenshotResponse = await tunnelCommand("playgroundScreenshot", { sessionID: playgroundID }, 180).catch((error) => ({ status: "error", error: error.message }));
  }

  if (response.status !== "ok" || !app || !artifactID) {
    failed += 1;
    console.error(`FAIL ${testCase.id}: generation did not return an accepted macOS app.`);
    console.error(JSON.stringify({
      requestID,
      responseStatus: response.status,
      phase: response.phase,
      sessionID: response.sessionID,
      playgroundID,
      artifactID,
      output: response.output,
      failureCategory: response.failureCategory,
      sessionFailures,
      status: interestingPlaygroundSummary(statusResponse),
      log: interestingPlaygroundSummary(logResponse)
    }, null, 2));
    continue;
  }

  const checker = checkArtifact(app, testCase.expectedRecipe, testCase);
  if (!checker.ok) {
    failed += 1;
    console.error(`FAIL ${testCase.id}: generated app failed macOS component usage check.`);
    console.error(JSON.stringify({
      requestID,
      sessionID: response.sessionID,
      playgroundID,
      artifactID,
      artifactPath: checker.artifactPath,
      checkerStdout: checker.stdout,
      checkerStderr: checker.stderr,
      sessionFailures,
      status: interestingPlaygroundSummary(statusResponse),
      log: interestingPlaygroundSummary(logResponse)
    }, null, 2));
    continue;
  }

  if (sessionFailures.length > 0) {
    failed += 1;
    console.error(`FAIL ${testCase.id}: generated app passed component provenance but session has quality/build failure signals.`);
    console.error(JSON.stringify({
      requestID,
      sessionID: response.sessionID,
      playgroundID,
      artifactID,
      artifactPath: checker.artifactPath,
      sessionPhase: session?.phase,
      sessionFailures,
      status: interestingPlaygroundSummary(statusResponse),
      log: interestingPlaygroundSummary(logResponse),
      screenshot: interestingPlaygroundSummary(screenshotResponse)
    }, null, 2));
    continue;
  }

  console.log(`PASS ${testCase.id} -> ${artifactID}`);
  console.log(JSON.stringify({
    sessionID: response.sessionID,
    playgroundID,
    artifactPath: checker.artifactPath,
    checker: checker.stdout,
    status: interestingPlaygroundSummary(statusResponse),
    screenshot: interestingPlaygroundSummary(screenshotResponse)
  }, null, 2));
}

if (failed > 0) {
  console.error(`\n${failed}/${cases.length} macOS generation canary case(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${cases.length} macOS generation canary case(s) passed.`);
