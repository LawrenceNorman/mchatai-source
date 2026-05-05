import SwiftUI
import AppKit

@main
struct ExamplePacManApp: App {
    init() {
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
        ArcadeSmokeTests.printLaunchReport()
        // Verify all 5 Pacman maze layouts are fully connected (BFS from
        // hero spawn must reach every non-wall cell). Catches unbroken
        // ring / stranded fruit / isolated quadrant bugs at startup.
        if #available(macOS 12.0, *) {
            ArcadeSmokeTests.printPacmanConnectivityReport()
        }
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
