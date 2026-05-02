// BEGIN mChatAI macOS Component: gridpuzzle.smoke-tests (components/grid-puzzle/GridPuzzleSmokeTests.swift)
import Foundation

enum GridPuzzleSmokeTests {
    static func launchReport() -> String {
        var mastermind = MastermindEngine(secret: [.red, .blue, .green, .yellow])
        let mastermindFeedback = mastermind.submit([.red, .green, .blue, .yellow])

        var mines = MinesweeperEngine(rows: 5, columns: 5, mineCount: 3, seed: 7)
        mines.reveal(at: PuzzlePoint(row: 0, col: 0))

        var match3 = Match3Engine(rows: 5, columns: 5, seed: 12)
        let matchesBefore = match3.findMatches().count

        return [
            "[GridPuzzleSmoke] mastermind exact=\(mastermindFeedback.exact) colorOnly=\(mastermindFeedback.colorOnly)",
            "[GridPuzzleSmoke] mines state=\(mines.state) revealed=\(mines.revealedSafeCellCount)",
            "[GridPuzzleSmoke] match3 matches=\(matchesBefore) score=\(match3.score)"
        ].joined(separator: "\n")
    }

    static func printLaunchReport() {
        print(launchReport())
    }
}
// END mChatAI macOS Component: gridpuzzle.smoke-tests
