import SwiftUI
import AppKit

@main
struct ExampleMinesweeperApp: App {
    init() {
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
        MinesweeperSmokeTests.printLaunchReport()
        print("[MinesweeperExample] Launch smoke OK: MinesweeperEngine wired into SwiftUI glue")
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .windowResizability(.contentSize)
    }
}
