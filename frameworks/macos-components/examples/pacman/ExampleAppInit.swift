import SwiftUI
import AppKit

@main
struct ExamplePacManApp: App {
    init() {
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
        ArcadeSmokeTests.printLaunchReport()
        let engine = GridAdventureEngine.mazePelletMap()
        let pellets = engine.actors.filter { $0.kind == .pellet }.count
        print("[PacManExample] Launch smoke OK: rows=\(engine.map.rows) columns=\(engine.map.columns) pellets=\(pellets)")
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .windowResizability(.contentSize)
    }
}
