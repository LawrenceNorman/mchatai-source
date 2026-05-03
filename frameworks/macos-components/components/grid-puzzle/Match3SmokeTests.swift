// BEGIN mChatAI macOS Component: gridpuzzle.match3-smoke-tests (components/grid-puzzle/Match3SmokeTests.swift)
import Foundation

enum Match3SmokeTests {
    static func launchReport() -> String {
        var engine = Match3Engine(rows: 6, columns: 6, seed: 300)
        let matchesAfterSetup = engine.findMatches().count
        let move = firstPlayableSwap(in: engine)
        let moved = move.map { engine.swap($0.0, $0.1) } ?? false

        return [
            "[Match3Smoke] rows=\(engine.grid.rows) columns=\(engine.grid.columns)",
            "[Match3Smoke] setupMatches=\(matchesAfterSetup)",
            "[Match3Smoke] playableSwap=\(move != nil) moved=\(moved) score=\(engine.score)"
        ].joined(separator: "\n")
    }

    static func printLaunchReport() {
        print(launchReport())
    }

    private static func firstPlayableSwap(in engine: Match3Engine) -> (PuzzlePoint, PuzzlePoint)? {
        for point in engine.grid.allPoints() {
            for direction in [GridDirection.right, .down] {
                let neighbor = point.moved(direction)
                guard engine.grid.contains(neighbor) else { continue }
                var probe = engine
                if probe.swap(point, neighbor) {
                    return (point, neighbor)
                }
            }
        }
        return nil
    }
}
// END mChatAI macOS Component: gridpuzzle.match3-smoke-tests
