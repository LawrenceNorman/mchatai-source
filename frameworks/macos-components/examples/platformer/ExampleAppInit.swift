// Example glue — adapt freely. The CANONICAL components are
// `components/arcade/ArcadeCore.swift` + `components/arcade/PlatformerEngine.swift`.
// Keep them byte-for-byte under `Sources/<TargetName>/MChatAIComponents/`.
//
// This example shows the minimum glue for a 2D platformer:
//   - mac-001: setActivationPolicy(.regular) + activate(ignoringOtherApps:)
//   - mac-003: stdout launch confirmation
//   - mac-022: visible on-screen restart button (in ContentView's game-over overlay)
//   - PlatformerEngine composition: arrow keys → ArcadeControls → engine.update,
//     coin collection, score, win / lose phases

import SwiftUI
import AppKit

@main
struct PlatformerExampleApp: App {
    init() {
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
        ArcadeSmokeTests.printLaunchReport()
        print("[PlatformerExample] launched — PlatformerEngine wired into SwiftUI Canvas glue")
    }

    var body: some Scene {
        WindowGroup("Platformer Example") {
            ContentView()
        }
        .windowResizability(.contentSize)
        .commands {
            CommandMenu("Game") {
                Button("New Game") {
                    NotificationCenter.default.post(name: .platformerNewGame, object: nil)
                }
                .keyboardShortcut("n", modifiers: .command)
            }
        }
    }
}

extension Notification.Name {
    static let platformerNewGame = Notification.Name("platformerNewGame")
}
