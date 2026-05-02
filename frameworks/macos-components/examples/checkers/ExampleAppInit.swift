import SwiftUI
import AppKit

@main
struct ExampleCheckersApp: App {
    init() {
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
        BoardGameSmokeTests.printLaunchReport()

        let board = CheckersRules.startingBoard()
        let moves = CheckersRules.allLegalMoves(for: .white, on: board)
        print("[CheckersExample] Launch smoke OK: whiteMoves=\(moves.count) whitePieces=\(board.pieces(for: .white).count)")
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .windowResizability(.contentSize)
    }
}
