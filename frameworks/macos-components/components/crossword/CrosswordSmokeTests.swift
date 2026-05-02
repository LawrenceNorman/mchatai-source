// BEGIN mChatAI macOS Component: crossword.smoke-tests (components/crossword/CrosswordSmokeTests.swift)
import Foundation

enum CrosswordSmokeTests {
    static func launchReport() -> String {
        var crossword = MiniCrosswordSeed.nytStyleFiveByFive()
        for character in "APPLE" {
            crossword.input(character)
        }
        let active = crossword.activeEntry()?.id ?? "none"
        return "[CrosswordSmoke] active=\(active) solved=\(crossword.isSolved)"
    }

    static func printLaunchReport() {
        print(launchReport())
    }
}
// END mChatAI macOS Component: crossword.smoke-tests
