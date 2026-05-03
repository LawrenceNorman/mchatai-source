import SwiftUI
import AppKit

@main
struct ExampleMastermindApp: App {
    init() {
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
        MastermindSmokeTests.printLaunchReport()
        print("[MastermindExample] Launch smoke OK: MastermindEngine wired into SwiftUI glue")
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .windowResizability(.contentSize)
    }
}
