import SwiftUI
import AppKit

@main
struct ExampleMatch3App: App {
    init() {
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
        Match3SmokeTests.printLaunchReport()
        print("[Match3Example] Launch smoke OK: Match3Engine wired into SwiftUI glue")
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .windowResizability(.contentSize)
    }
}
