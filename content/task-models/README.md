# Task model catalog

`catalog.json` is the content-owned discovery surface for downloadable on-device specialists. App binaries provide only generic installation and runtime support; model IDs, releases, compatibility, artifact URLs, checksums, licenses and evaluation results live here.

Each release is immutable. Publish artifact bytes first, verify both the archive SHA-256 and unpacked resource-tree SHA-256, pass the physical-device acceptance gate, obtain human review, and only then add or promote a public catalog entry. A selected local model must never silently fall back to cloud inference.

## Entry fields the apps read

Required: `id`, `releaseID`, `version`, `displayName`, `task`, `languages`, `baseModel`, `license.spdx`,
`compatibility.minimumIOS`, and at least one `assets[]` item with `id`, `platform`, `architecture`, `url`,
`archiveSizeBytes`, `installedSizeBytes`, `sha256` (the ZIP), `resourceTreeSHA256` (the unpacked tree),
`contextTokens` and `compression`.

Optional:

- `instructions` — the model's own system prompt template. A tuned model answers best under the prompt it was
  trained with, so that prompt ships here, not in Swift. Placeholders: `{{target}}`, `{{native}}`,
  `{{levelLabel}}`, `{{levelCEFR}}`, `{{maxSentences}}`, `{{personaName}}`. Absent or empty → the app uses the
  TouchLanguage persona prompt (`touchlanguage/prompts/tutor.system.md`).

## Schema v2: listing fields (since 2026-11-07, Phase LC)

`schemaVersion: 2` adds what the mchatai.com/cloud/LocalLLMs page and the subscriber gate need; v1 apps ignore
the new keys. Required per entry: `releaseStatus` (`preview` · `released` · `retired`; retired entries are never
deleted), `access` (`subscriber` · `free`), `summary`, `description`, `category`, `applets`, `license.url`,
`compatibility.testedDevices[]` (`{device, os, firstReplySeconds, replySeconds}`, copied from a passing device
report) and `assets[].runtime` (`coreai` · `mlx`). Optional: `sample`, two to four `{role: learner|model, text}`
lines copied from a device test, never written by hand.

**Hosted assets are addressed by identity**, `mchatai-model://<id>/<releaseID>/<assetID>`. The app asks web-api
for a signed URL with the user's token; web-api decides entitlement. This file never names a bucket or object
path. `http(s)` URLs belong only in the private developer staging catalog.

Check a file before committing or staging it:

```sh
python3 content/task-models/validate_catalog.py content/task-models/catalog.json            # public
python3 content/task-models/validate_catalog.py <staging catalog.json> --private            # developer staging
python3 -m unittest discover -s content/task-models -p 'test_*.py'
```

Entries are generated, not typed: `mchatai_macOS/LocalLLM/build.py listing --package-run … --device-report …
--public` writes a validated entry from the recipe's `catalog` block and the device report. Design:
`mchatai_macOS/docs/LOCAL_LLM_CATALOG_ARCHITECTURE.md`.

## How the app prompts a downloaded model (since 2026-11-07)

The conversation reaches the model as real chat turns (system → earlier learner/tutor lines → the current
learner line), rendered through the model's own chat template by Core AI. It is not pasted into one user
message as a "Learner:/Tutor:" transcript; the first iPad run did that and the model greeted the learner anew
every turn. The app trims the oldest turns to fit the asset's `contextTokens` (the export fixes the context),
so a release with a larger context carries more history.
