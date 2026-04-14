---
artifact:
  type: framework-scaffold
  id: framework.macos.audiokit-midi-synth
  name: AudioKit MIDI Synth Keyboard
  version: 1.0.0
  created_by: AIWizard team
  created_at: 2026-04-13
  updated_at: 2026-04-13

purpose:
  summary: Buildable AudioKit synth scaffold — on-screen keyboard, oscillator selector, ADSR envelope.
  problem_solved: AIWizard hallucinates AudioKit APIs from scratch; this scaffold gives it a known-good starting point for any macOS audio/music app request.
  intended_users: AIWizard (consumed via mchatai-source cache); developers extending into sequencers, drum machines, DAW-lite apps.

architecture:
  language: swift
  frameworks: [AudioKit, AudioKitUI, SwiftUI]
  platform: macos
  has_ui: true
  requires_auth: false

dependencies:
  external_apis: []
  internal_services: []
  storage: none

development:
  main_file: Sources/AudioKitMIDISynth/AudioKitMIDISynthApp.swift
  config_file: Package.swift
  entitlements: frameworks/_index/entitlements/audiokit.plist
  build_command: swift build
  run_command: swift run AudioKitMIDISynth
---

# AudioKit MIDI Synth — Framework Scaffold

This is the **starter** for any macOS app the user describes that involves audio synthesis, MIDI, or music. AIWizard loads this scaffold's source files into the system prompt as a known-working baseline, then customizes on top of it.

## What's in the box

- **`AudioKitMIDISynthApp.swift`** — SwiftUI `@main` app entrypoint
- **`SynthConductor.swift`** — `ObservableObject` wrapping `AudioEngine`, `DynamicOscillator`, `AmplitudeEnvelope`. Owns audio lifecycle. This is the pattern AudioKit apps follow — keep this shape when extending.
- **`ContentView.swift`** — Simple SwiftUI piano keyboard wired to the conductor + waveform picker + ADSR sliders
- **`Package.swift`** — SPM manifest with AudioKit + AudioKitUI + SoundpipeAudioKit (all 3 required — see Type-to-Package Mapping below)

## Type-to-Package Mapping (CRITICAL — do NOT drop dependencies)

This scaffold's Package.swift has **3 `.package(...)` entries and 3 `.product(...)` entries**. ALL THREE are required because different types live in different packages. If you drop any package, you'll get `cannot find type X in scope` errors for the types below. Rule of thumb: the name "AudioKit" covers ONE package; the other two have their own type sets.

| Type (Swift symbol) | Lives in package | Typical use |
|---|---|---|
| `AudioEngine` | AudioKit | Root signal graph |
| `Mixer`, `Settings` | AudioKit | Multi-track mixing, audio session config |
| `MIDINoteNumber`, `MIDIVelocity` | AudioKit | MIDI event types |
| `AmplitudeEnvelope` | AudioKit | ADSR envelope on any node |
| `Table` | AudioKit | Wavetable source for oscillators |
| `DynamicOscillator`, `Oscillator` | SoundpipeAudioKit | Polyphonic sine/square/saw/triangle oscillators |
| `OscillatorBank`, `FMOscillator`, `FMOscillatorBank` | SoundpipeAudioKit | Polyphonic oscillator banks, FM synthesis |
| `Reverb`, `CostelloReverb`, `ChowningReverb` | SoundpipeAudioKit | Reverb effects |
| `Delay`, `VariableDelay`, `Chorus`, `Flanger`, `Phaser` | SoundpipeAudioKit | Delay/modulation effects |
| `Distortion`, `BitCrusher`, `Clipper` | SoundpipeAudioKit | Distortion effects |
| `PluckedString`, `VocalTract`, `WhiteNoise`, `PinkNoise` | SoundpipeAudioKit | Physical modeling / noise generators |
| `FFTView`, `NodeOutputView` | AudioKitUI | Real-time spectrum / waveform visualization |

If your generated app uses ANY Soundpipe-level DSP type (oscillator bank, reverb, delay, distortion, FM, physical modeling), you MUST include `SoundpipeAudioKit` in dependencies AND `import SoundpipeAudioKit` in the Swift file. Same for AudioKitUI if you use visualization views.

**Version pinning**: the scaffold's `from:` strings are the ONLY versions known to resolve. Do NOT bump to `5.10.0` / `5.12.0` / `^6.0.0` — those versions don't exist in the registry. Copy byte-for-byte.

**Platform target**: `platforms: [.macOS(.v14)]`. Do NOT change to `.v12`, `.v14`, `.v15`, or `.v16` — the scaffold's code uses macOS 13-compatible APIs only. Upgrading to `.v15`/`.v16` triggers Swift 6 strict concurrency which breaks `@Published` + `didSet` combos, the `static let shared = ...` singleton pattern, and the `oscillator.start()`-in-init pattern used throughout. Stick with `.v14`.

**Swift tools version**: `// swift-tools-version:5.9` at the top of Package.swift. Do NOT bump to `6.0`. Tools version 6.0 activates strict concurrency checking which flags every `@Published` property with a `didSet` observer, every `ObservableObject` class with stored AudioKit nodes, and every `static let shared = Foo()` singleton. The scaffold compiles cleanly at 5.9 — keep it there.

**Filenames**: Keep the scaffold's filenames (`SynthConductor.swift`, `ContentView.swift`, `AudioKitMIDISynthApp.swift`). Do NOT rename them to `AudioEngineManager.swift` / `SynthEngine.swift` / etc. Extend by ADDING new files for new features (e.g., `SequencerGridView.swift`), not by renaming existing ones. The auto-fix loop re-injects the scaffold's original files; if your output uses different filenames, the next auto-fix cycle fights itself.

## Key APIs already wired

```swift
import AudioKit
import AudioKitUI
import SoundpipeAudioKit

let engine = AudioEngine()
let oscillator = DynamicOscillator(waveform: Table(.sine))
let envelope = AmplitudeEnvelope(oscillator,
    attackDuration: 0.05, decayDuration: 0.1,
    sustainLevel: 0.7, releaseDuration: 0.4)
engine.output = envelope
try engine.start()

// Note on:
oscillator.frequency = pitch.midiNoteToFrequency()
oscillator.amplitude = Float(velocity) / 127.0
envelope.openGate()

// Note off:
envelope.closeGate()
```

## How AIWizard should extend this

When the user request goes beyond a basic synth, **add to** this scaffold rather than rewriting:

| User request includes | Add this on top |
|---|---|
| "MIDI controller", "external keyboard" | `MIDIKit` package + `MIDIManager` listener wired to `noteOn`/`noteOff` |
| "reverb", "delay", "effects" | `SoundpipeAudioKit` `Reverb`/`Delay` nodes chained between oscillator and engine output |
| "sequencer", "piano roll", "spreadsheet" | `AppleSequencer` from `AudioKitEX` + grid SwiftUI view; see `AUDIOKIT_MUSIC_APP_ARCHITECTURE.md` V4 |
| "chords", "scales", "music theory" | `Tonic` package — `Chord`, `Scale`, `Note` types |
| "multi-track", "mixer", "DAW" | `Mixer` node per track, `DryWetMixer` for sends; see V5/V6 of the architecture doc |
| "drums", "beat maker" | Replace `DynamicOscillator` with `Sampler` loading drum samples |

## Critical gotchas (already handled in scaffold; don't break)

1. **`AudioEngine.start()` must be called from the main thread** — wrapped in `MainActor` in conductor
2. **`@available(macOS 12.0, *)`** on all AudioKit types — use 26.0 only for app-level types
3. **Microphone entitlement required** even if not recording — AudioKit initializes audio I/O; entitlements file is `frameworks/_index/entitlements/audiokit.plist`
4. **`KeyboardView` needs explicit frame height** (~120pt) or it collapses
5. **MIDI note 60 = C4** — don't shift octaves silently
6. **Oscillator must be wired BEFORE `engine.start()`** — can't reconnect graph while running
7. **`DynamicOscillator.amplitude`** is 0.0–1.0; MIDI velocity is 0–127 — map explicitly, don't pass raw

## Build verification

```bash
cd frameworks/macos/audiokit-midi-synth
swift build
swift run AudioKitMIDISynth
```

Should open a window with a keyboard, waveform picker, and ADSR sliders. Click keys to hear notes.

## Wisdom pack

Captured rules from this scaffold and its derivatives live at `wisdom/packs/audiokit-music.json`. QAFlywheel runs against this scaffold extend that pack.
