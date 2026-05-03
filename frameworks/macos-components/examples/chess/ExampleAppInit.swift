import SwiftUI
import AppKit

@main
struct ExampleChessApp: App {
    init() {
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
        BoardGameSmokeTests.printLaunchReport()

        let board = ChessRules.startingBoard()
        let moves = ChessRules.allLegalMoves(for: .white, on: board)
        print("[ChessExample] Launch smoke OK: whiteMoves=\(moves.count) whitePieces=\(board.pieces(for: .white).count)")
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .windowResizability(.contentSize)
    }
}
