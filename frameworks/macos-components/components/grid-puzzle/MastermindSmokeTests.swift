// BEGIN mChatAI macOS Component: gridpuzzle.mastermind-smoke-tests (components/grid-puzzle/MastermindSmokeTests.swift)
import Foundation

enum MastermindSmokeTests {
    static func launchReport() -> String {
        var mastermind = MastermindEngine(secret: [.red, .blue, .green, .yellow], maxGuesses: 10)
        let feedback = mastermind.submit([.red, .green, .blue, .yellow])
        let duplicateSafe = MastermindEngine.evaluate(secret: [.red, .red, .blue, .blue], guess: [.red, .blue, .red, .green])

        return [
            "[MastermindSmoke] exact=\(feedback.exact) colorOnly=\(feedback.colorOnly) guesses=\(mastermind.guesses.count)",
            "[MastermindSmoke] duplicateSafe exact=\(duplicateSafe.exact) colorOnly=\(duplicateSafe.colorOnly)"
        ].joined(separator: "\n")
    }

    static func printLaunchReport() {
        print(launchReport())
    }
}
// END mChatAI macOS Component: gridpuzzle.mastermind-smoke-tests
