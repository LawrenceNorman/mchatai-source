import SwiftUI
import AppKit

@main
struct ExampleFroggerApp: App {
    init() {
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
        ArcadeSmokeTests.printLaunchReport()
        let engine = GridAdventureEngine.froggerLaneMap()
        print("[FroggerExample] Launch smoke OK: rows=\(engine.map.rows) columns=\(engine.map.columns) actors=\(engine.actors.count)")
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .windowResizability(.contentSize)
    }
}
