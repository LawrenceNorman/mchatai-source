import SwiftUI
import AppKit

@main
struct ExamplePongApp: App {
    init() {
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
        ArcadeSmokeTests.printLaunchReport()
        print("[PongExample] Launch smoke OK: PongEngine wired into SwiftUI glue")
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .windowResizability(.contentSize)
    }
}
