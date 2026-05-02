import SwiftUI
import AppKit

@main
struct ExampleBlackjackApp: App {
    init() {
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
        CardGameSmokeTests.printLaunchReport()
        var smoke = BlackjackEngine()
        smoke.deal(bet: 25)
        smoke.stand()
        print("[BlackjackExample] Launch smoke OK: bankroll=\(smoke.bankroll) status=\(smoke.status)")
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .windowResizability(.contentSize)
    }
}
