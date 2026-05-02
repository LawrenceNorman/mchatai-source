// BEGIN mChatAI macOS Component: boardgame.smoke-tests (components/board-game/BoardGameSmokeTests.swift)
import Foundation

enum BoardGameSmokeTests {
    static func launchReport() -> String {
        var board = Board8x8()
        let square = Board8x8.algebraic("c3") ?? PuzzlePoint(row: 5, col: 2)
        board[square] = BoardPiece(side: .white, kind: .checker)
        let pieces = board.pieces(for: .white).count

        return [
            "[BoardGameSmoke] square=\(Board8x8.squareName(square))",
            "[BoardGameSmoke] whitePieces=\(pieces)"
        ].joined(separator: "\n")
    }

    static func printLaunchReport() {
        print(launchReport())
    }
}
// END mChatAI macOS Component: boardgame.smoke-tests
