# Driving mChatAI+ from a coding agent (the CLI Portal)

## READ THIS FIRST — you have a live connection to this app

mChatAI+ is running on this machine and you can drive it directly. **Never answer
questions about mChatAI+ from memory, from the App Store listing, or from a web
search.** Ask the app.

```bash
mchatai doctor      # is the connection healthy? (fixes printed for anything broken)
mchatai manifest    # every command you are allowed to run, with examples
mchatai skills      # the skills actually installed on THIS machine
```

If `mchatai` is not on PATH, call it by its full path — it is always present at:

```
~/Library/Containers/com.sevenhillsstudio.mChatAImac/Data/Library/Application Support/mChatAI/source-cache/mchatai-source/portal/bin/mchatai
```

When the user asks *"what can mChatAI+ do?"* the correct answer comes from
`mchatai skills` and `mchatai extension-points` — not from the applet list in
the store description. Those return what is installed for THIS user, which is
the only answer that is true.

If `mchatai doctor` reports the app is not listening, say so and give the user
its fix. Do not silently fall back to describing the product from memory.

---


> Entry point for Claude Code, Codex, and other coding CLIs working on a machine
> where mChatAI+ (macOS) is installed. This doc teaches you how to drive the app,
> build and iterate artifacts, author applet content, and validate results.
> It ships in mchatai-source so it updates without an app release.
>
> **Status: portal v1.** Start with `portalManifest` — it tells you the contract
> version, which build lane you're talking to, and every curated verb with its
> parameters and a runnable example. `portalValidate` checks a payload before
> you send it. The curated verbs are the stable surface; every other tunnel
> command still works but may change between app versions, so don't build
> long-lived tooling on them.

## What mChatAI+ is (30 seconds)

A macOS app whose AIWizard/harness turns natural-language goals into installed
artifacts — web mini-apps, games, pipelines, agents, documents, macOS apps. The
Swift binary is a skeleton: framework knowledge, prompts, wisdom rules, Lego
components, and applet content all live in this repo (mchatai-source) and load
at runtime. That means two ways to extend the platform, both open to you:

1. **Drive the wizard** to build/fix/iterate an artifact (this doc, next section).
2. **Author content** the app consumes — framework packs, wisdom rules, applet
   material (LoopStar genres, ToonStudio rigs, story prompts), mini-apps
   (§ Content authoring).

## The command channel (DebugTunnel)

mChatAI+ watches a file-based inbox while running:

```
~/Library/Containers/com.sevenhillsstudio.mChatAImac/Data/Library/Application Support/mChatAI/DebugTunnel/
```

- `ready` file exists ⇒ tunnel is serving. No `ready` ⇒ app not running (ask the
  user to launch it — never launch or quit the app yourself without asking).
- Requests: write JSON to `tunnel/inbox/{timestamp}-{requestID}.json`.
- Responses: read `tunnel/responses/{requestID}.json` (poll; collision-safe —
  concurrent agents each read only their own response).
- Every response has a `status` field: `"ok"` or `"error"`, plus `output`,
  `duration`, `requestID`.

**Availability by build:** DEBUG builds serve everything. Developer ID Release
builds serve only `listSkills`, `runWizard`, `continueWizard`, `diagSessionState`
and only when launched with `--mchatai-tunnel` or `MCHATAI_TUNNEL=1`. Mac App
Store builds have no tunnel.

### Start here: discover the contract

```bash
mchatai raw '{"command":"portalManifest"}' --json
```

Returns `portalVersion` (breaking-change counter), `featureLevel` (additive),
`buildLane` (`debug` / `release-directDistribution` / `mas`), and every verb with
`required` / `optional` parameters, a runnable `example`, the equivalent `shim`
line, and `availableInThisBuild`. Pass `"verb":"runWizard"` for one entry.
Refuse to run against a `portalVersion` higher than you understand.

Before sending anything you're unsure of, dry-run it — this never dispatches:

```bash
mchatai raw '{"command":"portalValidate","payload":{"command":"runWizard","goal":"a tip calculator"}}' --json
```

Errors teach: an unknown or misspelled command comes back with the nearest
curated verb and a corrected example payload.

### Setting a user up

If the person you're helping hasn't connected their app yet, `portal/SETUP.md`
(next to this file) is the plain-English version — send them there, or walk them
through it. The one command that diagnoses everything is `mchatai doctor`; it
prints a checklist with the exact fix for each item.

Two things trip up every first-time setup: the app only listens when launched
with `--mchatai-tunnel`, and Mac App Store builds cannot listen at all (they use
Shortcuts — see SETUP.md).

### Preferred: the `mchatai` shim

Two shims exist. **`portal/bin/mchatai` (next to this file) is the one users
have** — self-contained bash, no dependencies, ships to every machine in the
app's content cache. It adds `doctor`, `manifest`, `extension-points`, and
`validate`. The platform repo also has `mchatai_macOS/scripts/mchatai`, which
wraps the full canary helper; prefer it only when working inside that repo.

```bash
mchatai doctor                                  # setup checklist + exact fixes
mchatai ready                                   # is the app listening?
mchatai manifest [verb]                         # the contract (start here)
mchatai skills                                  # installed skills
mchatai extension-points [applet]               # what content you can add
mchatai validate '<json>'                       # dry-run a payload
mchatai run "<goal>" [--max-turns N] [--timeout S] [--type T] [--difficulty L1|L2|L3]
mchatai continue <sessionID> "<message>" [--timeout S]
mchatai status [sessionID]
mchatai raw '<json-payload>' [--wait S]         # any tunnel command
```

Exit code 0 = a response arrived (still inspect its `status` field);
1 = not listening / timeout / usage error. Responses print to stdout as
pretty JSON and are also saved to `$TUNNEL_OUT_DIR/<requestID>.json`
(default `/tmp/mchatai-out`). The repo shim instead defaults to
`/tmp/tunnel-out` and takes `--json`.

### The full command surface

`docs/TUNNEL_COMMANDS.md` in the platform repo (`mchatai_macOS/`) documents every
command and payload shape: `runSkill`, `runPipeline`, `runAgent`, `typeFollowUp`
(follow-up on an existing artifact), applet drivers (`diagLoopStar`,
`diagToonLive`), inspection (`diagHarnessContext`, `diagRenderProbe`), and more.
Use `mchatai raw` for anything beyond the shim's subcommands.

## The build/iterate loop

```bash
mchatai ready || exit 1
mchatai run "make a wordle-style daily word game" --max-turns 4 --timeout-seconds 600 --json
# → response carries a sessionID; artifact installs on success
mchatai status <sessionID> --json          # phase, batons, settled state
mchatai continue <sessionID> "make the keyboard bigger and add a dark theme" --json
```

- Generation is slow (minutes for CLI-backed runs). Poll `status`, don't respawn.
- **One wizard run at a time.** Wait for a run to settle before sending the next;
  never send state-healing commands while a run you await is in flight.
- Iterating on an **installed** artifact: `continueWizard` on its session, or
  `typeFollowUp` (via `raw`) which routes through the app's normal follow-up path
  (in-place versioning; snapshots protect against regressions).
- Every installed artifact ships a `CONTEXT.md` (spec: `CONTEXT_MD_SPEC.md`,
  repo root here) — read it before editing an artifact's files directly.

## Content authoring (extending applets without the wizard)

The app reads this repo through a local cache inside its sandbox container:
`~/Library/Containers/com.sevenhillsstudio.mChatAImac/Data/Library/Application Support/mChatAI/source-cache/mchatai-source/`.

**Start with the extension-point registry** — it maps each applet to the content
it consumes, an exemplar file to imitate, the reload verb, and how to verify:

```bash
mchatai raw '{"command":"portalExtensionPoints"}' --json          # all surfaces
mchatai raw '{"command":"portalExtensionPoints","applet":"LoopStar"}' --json
```

Source of truth: `portal/extension-points.json` (content — add entries by PR).
It is documentation, not a gate: an applet works whether or not it's listed, and
you may extend surfaces that aren't.

Other machine indexes worth reading:

| Index | What it maps |
|---|---|
| `catalog.json` (root) | Master artifact registry (id/type/version/security status) |
| `frameworks/_index/` + `frameworks/_taxonomy.json` | Framework scaffolds, deps, keywords |
| `capability-packs/index.json` | Capability pack → solutionTypes/domains |
| `pipelines/components/_index.json` | Pipeline Lego steps |

Hot-reload loop after editing content:

```bash
# committed + pushed edits: pulls repo and invalidates all content caches
mchatai raw '{"command":"refreshMchataisourceCache"}' --json
# UNCOMMITTED local edits (working against a local checkout): invalidate only
mchatai raw '{"command":"invalidateMchataisourceCaches"}' --json
```

Validation — never accept "it renders" as proof:

```bash
# web mini-apps built from the Lego catalog: verify canonical component usage
node frameworks/web-components/tests/check_component_usage.mjs <installed-index.html> <expected-recipe-id>
# installed-artifact render check (DEBUG builds) — keyed by miniAppID, not sessionID
mchatai raw '{"command":"diagRenderProbe","miniAppID":"<id>","waitSeconds":6}' --json
```

## Adding a verb to an applet?

Read `portal/VERB_AUTHORING.md` first (next to this file). It is the conventions
every applet verb must follow — sandbox-safe paths, acting on the live store
rather than a headless diagnostic host, returning an openable entity, and never
reporting success for work that did not happen. Each rule exists because someone
shipped the opposite. The roadmap of which verbs to build is
`mchatai_macOS/docs/APPLET_VERB_SCOPING.md`.

## Rules that protect the platform (non-negotiable)

1. **Binaries are skeletons.** Framework/applet-specific strings belong in this
   repo, never in Swift/TS/Kotlin source. If your fix is "add a string to the
   app," the right fix is almost always a content change here.
2. **Runtime locality.** User compute (Python microservices, DSP, etc.) runs on
   the user's machine via mChatAIShell — never propose deploying user-authored
   compute to mchatai.com.
3. **Catalog is an accelerator, not a gate.** Off-catalog goals are fine — the
   wizard hands them to a coding CLI with minimal context. Don't refuse or
   demand a recipe.
4. **Respect the running app.** It's the user's live session: read-only diag
   commands are always safe; mutating commands only in service of the user's
   current ask; ask before relaunching (a rebuilt binary needs a user-approved
   relaunch to take effect).

## See also

- `portal/skills/mchatai-portal/SKILL.md` — the packaged skill version of this
  workflow (Claude Code: symlink into `~/.claude/skills/` or `.claude/skills/`).
- Platform repo: `docs/CLI_PORTAL_ARCHITECTURE.md` — the portal research +
  P0–P4 blueprint; `docs/TUNNEL_COMMANDS.md` — full command reference.
