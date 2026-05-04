// Example glue — adapt freely. The CANONICAL components are
// `components/arcade/ArcadeCore.swift` + `components/arcade/GridAdventureEngine.swift`
// (which depends on `components/grid-puzzle/GridPuzzleCore.swift` for PuzzlePoint /
// PuzzleGrid / GridDirection). Keep all three byte-for-byte under
// `Sources/<TargetName>/MChatAIComponents/`.
//
// This example shows the minimum glue for an Atari Adventure-style game:
//   - mac-001: setActivationPolicy(.regular) + activate(ignoringOtherApps:)
//   - mac-022: visible on-screen restart button (in ContentView's game-over overlay)
//   - GridAdventureEngine.adventureCastleMap() seed
//   - Arrow keys → moveHero(.up/.down/.left/.right)
//   - Win when hero reaches the .exit tile, lose when lives hit 0

import SwiftUI
import AppKit

@main
struct ArcadeAdventureExampleApp: App {
    init() {
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
        ArcadeSmokeTests.printLaunchReport()
        let engine = GridAdventureEngine.adventureCastleMap()
        let treasure = engine.actors.filter { $0.kind == .treasure }.count
        print("[ArcadeAdventureExample] launched — rows=\(engine.map.rows) columns=\(engine.map.columns) treasure=\(treasure)")
    }

    var body: some Scene {
        WindowGroup("Castle Adventure") {
            ContentView()
        }
        .windowResizability(.contentSize)
        .commands {
            CommandMenu("Game") {
                Button("New Game") {
                    NotificationCenter.default.post(name: .arcadeAdventureNewGame, object: nil)
                }
                .keyboardShortcut("n", modifiers: .command)
            }
        }
    }
}

extension Notification.Name {
    static let arcadeAdventureNewGame = Notification.Name("arcadeAdventureNewGame")
}
