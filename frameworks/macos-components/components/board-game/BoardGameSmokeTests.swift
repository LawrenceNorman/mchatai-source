// BEGIN mChatAI macOS Component: boardgame.smoke-tests (components/board-game/BoardGameSmokeTests.swift)
import Foundation

enum BoardGameSmokeTests {
    static func launchReport() -> String {
        let checkers = CheckersRules.startingBoard()
        let checkersMoves = CheckersRules.allLegalMoves(for: .white, on: checkers).count

        let chess = ChessRules.startingBoard()
        let chessMoves = ChessRules.allLegalMoves(for: .white, on: chess).count
        let whiteInCheck = ChessRules.isKingInCheck(.white, on: chess)

        return [
            "[BoardGameSmoke] checkersMoves=\(checkersMoves)",
            "[BoardGameSmoke] chessMoves=\(chessMoves) whiteInCheck=\(whiteInCheck)"
        ].joined(separator: "\n")
    }

    static func printLaunchReport() {
        print(launchReport())
    }
}
// END mChatAI macOS Component: boardgame.smoke-tests
