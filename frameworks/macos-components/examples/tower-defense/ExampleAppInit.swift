import SwiftUI
import AppKit

@main
struct ExampleTowerDefenseApp: App {
    init() {
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
        ArcadeSmokeTests.printLaunchReport()
        let engine = TowerDefenseEngine(path: TowerDefenseBoard.defaultPath)
        print("[TowerDefenseExample] Launch smoke OK: path=\(engine.path.count) lives=\(engine.lives) credits=\(engine.credits)")
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .windowResizability(.contentSize)
    }
}
