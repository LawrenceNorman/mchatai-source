// Example glue — adapt freely. The CANONICAL component is
// `components/music/PianoEngine.swift`. Keep it byte-for-byte under
// `Sources/<TargetName>/MChatAIComponents/`.
//
// Minimal piano-keyboard glue:
//   - mac-001: setActivationPolicy(.regular) + activate(ignoringOtherApps:)
//   - mac-003: stdout launch confirmation via PianoSmokeTests.launchReport()
//   - PianoEngine composition: white + black keys → noteOn / noteOff
//   - System NSSound beep on note-on; real synth glue is the user's job to
//     wire (AVAudioEngine, AudioKit, AudioUnit, etc.) — keep PianoEngine as
//     the source of truth for note metadata + active-note state.

import SwiftUI
import AppKit

@main
struct PianoExampleApp: App {
    init() {
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
        print(PianoSmokeTests.launchReport())
        print("[PianoExample] launched — PianoEngine wired into SwiftUI keyboard glue")
    }

    var body: some Scene {
        WindowGroup("Piano") {
            ContentView()
        }
        .windowResizability(.contentSize)
        .commands {
            CommandMenu("Piano") {
                Button("Reset Keys") {
                    NotificationCenter.default.post(name: .pianoReset, object: nil)
                }
                .keyboardShortcut("r", modifiers: .command)
            }
        }
    }
}

extension Notification.Name {
    static let pianoReset = Notification.Name("pianoReset")
}
