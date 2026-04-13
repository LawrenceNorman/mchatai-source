# frameworks/ — Framework Reference Scaffolds

> Buildable starter projects keyed by **framework name**. When AIWizard detects a framework keyword in a user prompt (e.g., "build me an AudioKit synth"), it pulls the matching scaffold from here and uses it as the starting point for generation.

## Why This Exists

AIWizard generates great code when it has a known-good starting point. Hallucinating AudioKit, Three.js, or Tauri APIs from scratch wastes turns and produces broken builds. These scaffolds give the LLM a working baseline so it can focus on user customization, not framework boilerplate.

## Directory Layout

```
frameworks/
├── _index/
│   ├── keyword-index.json    # framework name + aliases → scaffold path
│   ├── spm-deps.json         # macOS: framework → SPM URL/version/product
│   ├── npm-deps.json         # web/electron/RN: framework → npm pkg/version
│   ├── cargo-deps.json       # tauri/rust: framework → crate/version
│   └── entitlements/         # macOS entitlements templates per framework
│       ├── audiokit.plist
│       ├── vision-camera.plist
│       └── ...
├── macos/                    # Native Swift / SwiftUI / Apple frameworks
│   └── audiokit-midi-synth/  # Each scaffold is a real buildable project
│       ├── CONTEXT.md        # AIWizard system prompt context (required)
│       ├── manifest.json     # Catalog metadata
│       ├── Package.swift     # SPM manifest
│       └── Sources/
├── web/                      # Three.js, Tone.js, D3.js, p5.js, etc.
├── unity/                    # DOTween, Cinemachine, NavMesh, etc.
├── react-native/             # Reanimated, Skia, Vision Camera, etc.
├── python/                   # FastAPI, Pygame, Streamlit, etc.
├── tauri/                    # tauri-plugin-*, rodio, image, etc.
├── electron/                 # node-pty, sharp, better-sqlite3, etc.
└── android/                  # Compose, Room, CameraX, Media3, etc.
```

## Scaffold Requirements

Every framework scaffold MUST include:

1. **`manifest.json`** — id, framework, platform, version, complexity, dependencies, entitlements
2. **`CONTEXT.md`** — what this scaffold demonstrates, key APIs, how AIWizard should extend it
3. **Buildable source** — the scaffold compiles/runs on its own without AIWizard
4. **Dependency declaration** — Package.swift / package.json / Cargo.toml / build.gradle / requirements.txt

## How AIWizard Uses This

1. User prompt arrives at `AIWizard`
2. `MchataisourceCacheService.frameworkKeywords()` returns the keyword index from `_index/keyword-index.json`
3. Wizard scans the prompt for keyword matches
4. On match: load the scaffold's `CONTEXT.md` + key source files + dependency declarations
5. Inject into the system prompt as "starting point — extend this for the user's request"
6. Wizard generates customizations on top of the scaffold (rather than from scratch)
7. mChatAIShell builds the final project via `xcodebuild` / `swift build` / `npm` / `cargo`

## How Wisdom Loops Back

When QAFlywheel runs successfully against a scaffold:
- Captured rules upload to `wisdom/packs/<framework-id>.json`
- New framework variants get PR'd here as new scaffolds
- Quality scores in `manifest.json` update from telemetry

## Catalog Reference

See `mchatai_macOS/docs/FRAMEWORK_REFERENCE_CATALOG.md` for the canonical list of 160 planned framework showcases (20 per platform × 8 platforms). Each entry there maps to a scaffold here as it gets seeded.
