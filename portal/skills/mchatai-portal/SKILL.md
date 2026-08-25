---
name: mchatai-portal
description: Drive the mChatAI+ macOS app from the command line — build, fix, and iterate mini-apps/artifacts through the wizard tunnel, inspect session state, hot-reload mchatai-source content, and validate results. Use when asked to build or fix anything inside mChatAI+, iterate an installed mini-app/game, or author applet content (LoopStar packs, ToonStudio assets, wisdom rules, story prompts, web components).
---

# mChatAI Portal

Drive the mChatAI+ app through its file-based command tunnel. Read
`portal/AGENTS.md` in mchatai-source for the full background; this skill is the
operating procedure.

## Preflight

1. Locate the shim: `<platform>/mchatai_macOS/scripts/mchatai` (add to PATH or
   call by path). No platform checkout? Use the raw protocol in AGENTS.md.
2. Check the app is up:
   ```bash
   mchatai ready
   ```
3. Discover the contract — do this before guessing at any command:
   ```bash
   mchatai raw '{"command":"portalManifest"}' --json
   ```
   Gives `portalVersion`, the build lane, and every verb with parameters,
   examples, and whether it's served here. Dry-run anything uncertain with
   `portalValidate` (never dispatches). Unknown commands answer with the nearest
   verb and a corrected example.
   Not ready ⇒ ask the user to launch mChatAI+ (never launch/quit it yourself).
   Full responses land in `/tmp/tunnel-out/<requestID>.json` (`$TUNNEL_OUT_DIR`
   to override). Exit 0 = response received — still check its `status` field
   (`ok`/`error`); exit 1 = not ready/timeout.

## Build something new

```bash
mchatai run "<user's goal, verbatim + essential context>" \
  --max-turns 4 --timeout-seconds 600 --json
```

- Capture `sessionID` from the response. Runs take minutes; poll, don't respawn:
  ```bash
  mchatai status <sessionID> --json
  ```
- Optional flags: `--type <artifactType>`, `--difficulty L1|L2|L3`.
- One run at a time. Never send healing/reset commands while a run is awaited.

## Iterate / fix an existing artifact

```bash
mchatai continue <sessionID> "<the fix or change>" --timeout-seconds 600 --json
```

No sessionID at hand? The artifact's install dir contains `CONTEXT.md` with its
identity — read it. Follow-ups version in place; the app snapshots versions, so
prefer driving the wizard over hand-editing installed files.

## Author applet content (no wizard needed)

1. Discover what an applet accepts:
   ```bash
   mchatai raw '{"command":"portalExtensionPoints","applet":"LoopStar"}' --json
   ```
   Each entry names the paths, an exemplar file to imitate, the reload verb, and
   how to verify. Then copy the exemplar's shape. (Registry lives at
   `portal/extension-points.json`; unlisted surfaces are still fair game.)
2. Reload the app's content caches:
   ```bash
   mchatai raw '{"command":"invalidateMchataisourceCaches"}' --json   # local uncommitted edits
   mchatai raw '{"command":"refreshMchataisourceCache"}' --json       # pull committed + invalidate
   ```
3. Re-test through the applet or a wizard run.

## Validate — never accept "it renders" as proof

- Lego-based web mini-apps:
  ```bash
  node frameworks/web-components/tests/check_component_usage.mjs <installed-index.html> <recipe-id>
  ```
- Render check on an installed artifact (DEBUG builds) — keyed by `miniAppID`:
  ```bash
  mchatai raw '{"command":"diagRenderProbe","miniAppID":"<id>","waitSeconds":6}' --json
  ```
- Report failures with the check's actual output, not a summary judgment.

## Hard rules

- Content (framework strings, prompts, rules, packs) goes in mchatai-source,
  never into app source code.
- User compute stays on the user's machine (mChatAIShell microservices).
- Release-build tunnels serve only `listSkills` / `runWizard` /
  `continueWizard` / `diagSessionState` (launch flag `--mchatai-tunnel`);
  everything else needs a DEBUG build. Mac App Store builds have no tunnel.
- The app is the user's live session: read-only diags are always safe; ask
  before anything disruptive (relaunch, cancel, heal).
