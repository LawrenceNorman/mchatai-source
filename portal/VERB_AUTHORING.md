# Writing an applet verb

Read this before adding a verb to any applet. These are not style preferences —
each rule below exists because someone shipped the opposite and it broke.
Multiple agents now build verbs in parallel; without shared conventions each one
rediscovers the same three failures.

Roadmap and per-applet plan: `mchatai_macOS/docs/APPLET_VERB_SCOPING.md`.
Working examples: `applet.place` (`DebugTestTunnel.handleAppletVerb`),
`diagLoopStar` `setBPM`/`setGenre`/`listGenres`, and the aiVidGen verb set.

---

## 1. Paths: the app is sandboxed and this WILL bite you

mChatAI+ can `stat` a file in `/tmp` but **cannot read it**. `fileExists`
returns true and the read returns nil, which surfaces downstream as a baffling
"no content found" error that names the wrong problem.

**Every verb that accepts a path must:**

1. **Prefer inline content.** Offer `args.text` (or `args.data`) and document it
   as the primary form. An agent that just generated something already has the
   bytes; making it write a file first adds a failure mode for nothing.
2. **Check `isReadableFile`, never `fileExists`.** Existence is not access.
3. **Fail with the fix, not the symptom.** Say the app is sandboxed, and hand
   back a writable drop directory the caller can use:
   > `this app cannot read: /tmp/x.wav. It is sandboxed, so files outside its
   > container are off limits. Pass the content as args.text, or copy the file to
   > <dropDir> first.`

Decide this once per verb family, not per verb.

## 2. If you name a drop directory, guard source == destination

Telling a caller "put the file in `<sounds>/`" means the source often **is** the
destination. An import that removes the destination before copying will delete
the user's file.

```swift
let src = URL(fileURLWithPath: path).standardizedFileURL
let dst = destinationDir.appendingPathComponent(src.lastPathComponent).standardizedFileURL
guard src != dst else { return dst }   // already in place: nothing to do
if FileManager.default.fileExists(atPath: dst.path) {
    try? FileManager.default.removeItem(at: dst)
}
try FileManager.default.copyItem(at: src, to: dst)
```

This is real: it shipped, and the file deleted itself. Advice and implementation
have to agree.

## 3. Act on the store the OPEN WINDOW reads — or refuse

The only conductor reachable from the tunnel is often a **headless diagnostic
host** (`LoopStarDiagHost`, `isDiagnostic = true`), not the applet window the
user is looking at. A verb that mutates the diagnostic instance "succeeds" while
the user's screen never changes.

**Rules:**

- If a live instance exists, act on it.
- If only a headless host exists, either **refuse** with the commands needed to
  get into a usable state, or proceed and put the limitation in `warnings` —
  never silently pretend.
- Never write to a shadow copy of a store the UI does not read.

The scoping doc calls this invariant **R4**, and §9.2 lists the applets where it
applies.

## 4. Every write returns something openable

Invariant **R1**. A write that returns bare `ok` leaves the user unable to find
what was made. Return:

```json
{ "entity": { "id": "…", "applet": "AIWrite",
              "open": "com.sevenhillsstudio.mchatai://product/<id>?applet=AIWrite" },
  "path": "…" }
```

The `com.sevenhillsstudio.mchatai://product/<id>?applet=<Applet>` scheme is
handled in `mChatAI_macOSAppApp.onOpenURL` and opens the applet. Terminals make
it clickable.

## 5. A lookup miss returns candidates, not an error

Invariant **R2**. `setGenre` with an unknown name returns the 24 valid genres, so
the agent's next call succeeds. Without this, agents burn retry loops guessing.
Apply to every id, name, or enum a verb accepts.

## 6. Never report success for work that did not happen

The dominant bug class in this codebase — seven instances found in one day:

- TTS wrote a full-size WAV whose header said zero audio bytes → unplayable
- `SaveArtifactSkill` skipped the audio branch silently when a key was absent
- `PodcastIngestHandler` returned an entity without persisting; the router still
  reported `.routed(PodcastCreator)`
- `AudioStudioIngestHandler` **still does this today**
- Artifact routing ran in a detached `Task` whose result only reached `print`

**Therefore:** verify the artifact, not the operation. Assert the file exists and
is non-zero. For audio, assert a non-zero duration (`afinfo`) — size alone is
exactly what the WAV bug faked. If a verb was asked to produce something and did
not, **throw**.

## 7. Register the verb where agents look

A verb nobody can discover does not exist. Three places, all content except the
first:

| Where | What | Rebuild? |
|---|---|---|
| Dispatch (`DebugTestTunnel`) | the `case` | yes |
| `portal/portal-verbs.json` | contract verbs (`portalManifest`) | no |
| `portal/applet-capabilities.json` | applet verbs, `callable` or `planned` (`portalApplets`) | no |

`PortalContractDriftTests` fails the build if a catalog entry has no dispatch
case. Mark honestly: `planned` means the Swift capability exists but no verb
reaches it — an agent should tell the user it is unavailable rather than trying.

## 8. Add a drift test

`mChatAITests/PortalContractDriftTests.swift`, in the pre-push Ring 1 gate,
0.07s for the suite. Source-scan assertions, no running app. Lock the thing that
would silently regress: the verb's dispatch case, its persistence call, its
sandbox-safe input path.

---

## Checklist

- [ ] Inline content accepted and documented as primary
- [ ] `isReadableFile`, and the error names the sandbox + a drop dir
- [ ] source == destination guarded
- [ ] Acts on the live store, or refuses / warns
- [ ] Returns `entity` with an `open` deep link
- [ ] Unknown ids return candidates
- [ ] Verifies the artifact; throws when asked to produce and did not
- [ ] Listed in `applet-capabilities.json` (or `portal-verbs.json`)
- [ ] Drift test added to `PortalContractDriftTests`
