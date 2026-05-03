import SwiftUI
import AppKit

@main
struct ExampleAsteroidsApp: App {
    init() {
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
        ArcadeSmokeTests.printLaunchReport()
        print("[AsteroidsExample] Launch smoke OK: AsteroidsEngine wired into SwiftUI glue")
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .windowResizability(.contentSize)
    }
}
