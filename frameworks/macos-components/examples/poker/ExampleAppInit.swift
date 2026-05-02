import SwiftUI
import AppKit

@main
struct ExamplePokerApp: App {
    init() {
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
        CardGameSmokeTests.printLaunchReport()

        let royalDraw = [
            PlayingCard(suit: .hearts, rank: .ten),
            PlayingCard(suit: .hearts, rank: .jack),
            PlayingCard(suit: .hearts, rank: .queen),
            PlayingCard(suit: .hearts, rank: .king),
            PlayingCard(suit: .hearts, rank: .ace)
        ]
        let evaluation = PokerHandEvaluator.evaluate(royalDraw)
        print("[PokerExample] Launch smoke OK: rank=\(evaluation.rank) kickers=\(evaluation.kickers)")
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .windowResizability(.contentSize)
    }
}
