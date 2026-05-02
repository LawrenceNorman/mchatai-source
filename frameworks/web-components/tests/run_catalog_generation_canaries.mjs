#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { homedir, tmpdir } from "node:os";
import net from "node:net";

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
const wizardSessionsPath = resolve(appSupportDir, "wizard_sessions.json");
const pollMs = 500;
const useLegacyTunnel = process.env.MCHATAI_TUNNEL_LEGACY === "1";
const useSocketTunnel = process.env.MCHATAI_TUNNEL_SOCKET === "1";
const socketHost = process.env.MCHATAI_TUNNEL_HOST || "127.0.0.1";
const socketPort = Number(process.env.MCHATAI_TUNNEL_PORT || 17877);

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
  if (useSocketTunnel) {
    return;
  }
  if (!existsSync(resolve(tunnelDir, "ready"))) {
    fail(`DebugTunnel ready file not found at ${resolve(tunnelDir, "ready")}`);
  }
}

function writeTunnelRequest(requestID, payload) {
  if (useLegacyTunnel) {
    writeFileSync(resolve(tunnelDir, "request.json"), JSON.stringify(payload, null, 2));
    return;
  }
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
    if (!useLegacyTunnel && existsSync(responsePath)) {
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

function sendSocketRequest(payload, timeoutSeconds) {
  return new Promise((resolveResponse, rejectResponse) => {
    const client = net.createConnection({ host: socketHost, port: socketPort });
    const chunks = [];
    const timer = setTimeout(() => {
      client.destroy();
      rejectResponse(new Error(`Timed out waiting for DebugTunnel socket response ${payload.requestID}`));
    }, timeoutSeconds * 1000);

    client.on("connect", () => {
      client.write(JSON.stringify(payload));
    });
    client.on("data", (chunk) => chunks.push(chunk));
    client.on("error", (error) => {
      clearTimeout(timer);
      rejectResponse(error);
    });
    client.on("end", () => {
      clearTimeout(timer);
      try {
        resolveResponse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        rejectResponse(error);
      }
    });
  });
}

function miniAppIDFromResponse(response) {
  return response.miniAppID ||
    response.artifactID ||
    (response.artifactIDs && response.artifactIDs.miniApp) ||
    "";
}

function loadWizardSession(sessionID) {
  if (useSocketTunnel) {
    return null;
  }
  if (!sessionID || !existsSync(wizardSessionsPath)) {
    return null;
  }

  const raw = readJSON(wizardSessionsPath);
  const sessions = Array.isArray(raw) ? raw : (raw.sessions || []);
  return sessions.find((session) => session.id === sessionID) || null;
}

function sessionFailureSignals(session) {
  if (!session) {
    return [];
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
    if (lower.includes("no clickable buttons")) {
      failures.push("auto-play found no clickable buttons");
    }
    if (lower.includes("completeness: fail") || lower.includes("correctness: fail") || lower.includes("ui quality: fail")) {
      failures.push("evaluator reported FAIL");
    }
    if (lower.includes("rubric_score: 0/14")) {
      failures.push("frontend taste score was 0/14");
    }
  }

  return Array.from(new Set(failures));
}

async function checkArtifact(miniAppID, expectedRecipe) {
  let indexPath = resolve(appSupportDir, "MiniApps/installed", miniAppID, "index.html");

  if (useSocketTunnel) {
    const safeID = miniAppID.replace(/[^A-Za-z0-9_.-]/g, "-");
    const requestID = `lego-read-${safeID}-${Date.now()}`;
    const response = await sendSocketRequest({
      command: "readInstalledMiniAppHTML",
      miniAppID,
      requestID
    }, 60);

    if (response.status !== "ok" || typeof response.html !== "string") {
      fail("Unable to read generated mini-app HTML through DebugTunnel.", {
        miniAppID,
        status: response.status,
        error: response.error,
        output: response.output
      });
    }

    const tempDir = resolve(tmpdir(), "mchatai-lego-canary", safeID);
    mkdirSync(tempDir, { recursive: true });
    indexPath = resolve(tempDir, "index.html");
    writeFileSync(indexPath, response.html);
  } else if (!existsSync(indexPath)) {
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

  const payload = {
    command: "runWizard",
    goal: testCase.goal,
    artifactType: testCase.artifactType || "miniApp",
    difficulty: testCase.difficulty || "L1",
    maxTurns: Number(testCase.maxTurns || 8),
    timeoutSeconds,
    requestID
  };

  let response;
  try {
    if (useSocketTunnel) {
      response = await sendSocketRequest(payload, timeoutSeconds);
    } else {
      writeTunnelRequest(requestID, payload);
      response = await waitForResponse(requestID, timeoutSeconds);
    }
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

  const consoleErrors = Number(response.consoleErrors || 0);
  const session = loadWizardSession(response.sessionID);
  const sessionFailures = sessionFailureSignals(session);
  if (consoleErrors > 0 || sessionFailures.length > 0) {
    failed += 1;
    console.error(`FAIL ${testCase.id}: generated mini-app did not pass runtime/evaluator quality gates.`);
    console.error(JSON.stringify({
      requestID,
      sessionID: response.sessionID,
      miniAppID,
      consoleErrors,
      sessionPhase: session?.phase,
      sessionFailures,
      output: response.output,
      logLines: response.logLines
    }, null, 2));
    continue;
  }

  try {
    const artifact = await checkArtifact(miniAppID, testCase.expectedRecipe);
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
