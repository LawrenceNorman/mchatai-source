import SwiftUI
import AppKit

@main
struct ExampleCrosswordApp: App {
    init() {
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
        CrosswordSmokeTests.printLaunchReport()
        print("[CrosswordExample] Launch smoke OK: CrosswordEngine wired into SwiftUI glue")
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .windowResizability(.contentSize)
    }
}
