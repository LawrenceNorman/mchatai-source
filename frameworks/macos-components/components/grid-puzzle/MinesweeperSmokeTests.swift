// BEGIN mChatAI macOS Component: gridpuzzle.minesweeper-smoke-tests (components/grid-puzzle/MinesweeperSmokeTests.swift)
import Foundation

enum MinesweeperSmokeTests {
    static func launchReport() -> String {
        var mines = MinesweeperEngine(rows: 9, columns: 9, mineCount: 10, seed: 7)
        mines.reveal(at: PuzzlePoint(row: 0, col: 0))
        mines.toggleFlag(at: PuzzlePoint(row: 8, col: 8))

        return [
            "[MinesweeperSmoke] state=\(mines.state) revealed=\(mines.revealedSafeCellCount)/\(mines.totalSafeCellCount)",
            "[MinesweeperSmoke] flaggedCorner=\(mines.grid[PuzzlePoint(row: 8, col: 8)].isFlagged)"
        ].joined(separator: "\n")
    }

    static func printLaunchReport() {
        print(launchReport())
    }
}
// END mChatAI macOS Component: gridpuzzle.minesweeper-smoke-tests
