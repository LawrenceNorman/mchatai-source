// Example glue — adapt freely. The CANONICAL component is
// `components/arcade/SpriteKitPhysicsHelpers.swift`. Keep that file
// byte-for-byte verbatim under `Sources/<TargetName>/MChatAIComponents/`.
//
// This example shows the minimum glue for a SpriteKit physics game:
//   - mac-001: setActivationPolicy(.regular) + activate(ignoringOtherApps:)
//   - mac-002: explicit .frame on root view + .windowResizability(.contentSize)
//   - mac-003: stdout launch confirmation
//   - mac-022: visible on-screen restart button (in ContentView's game-over overlay)
//   - SpriteKitPhysicsHelpers composition: gravity preset, makeStaticBody,
//     makeRectangularBody, snapshot(of:), SKArcadeCategory bitmasks

import SwiftUI
import AppKit

@main
struct SpriteKitPhysicsExampleApp: App {
    @StateObject private var game = GameModel()

    init() {
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
        print("[SpriteKitPhysicsExample] launched — window should be visible")
    }

    var body: some Scene {
        WindowGroup("SpriteKit Physics Example") {
            ContentView()
                .environmentObject(game)
                .frame(minWidth: 600, idealWidth: 700, minHeight: 500, idealHeight: 500)
        }
        .windowResizability(.contentSize)
        .commands {
            CommandMenu("Game") {
                Button("New Game") { game.requestRestart() }
                    .keyboardShortcut("n", modifiers: .command)
            }
        }
    }
}
