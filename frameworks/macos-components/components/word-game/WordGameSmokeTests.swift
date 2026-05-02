// BEGIN mChatAI macOS Component: wordgame.smoke-tests (components/word-game/WordGameSmokeTests.swift)
import Foundation

enum WordGameSmokeTests {
    static func launchReport(answer: String = "APPLE") -> String {
        let engine = WordGameEngine(answer: answer)

        for letter in "BRAIN" {
            engine.inputLetter(letter)
        }
        let first = engine.submitGuess()
        let firstRows = engine.submittedGuessCount

        engine.reset(answer: answer)
        for letter in answer {
            engine.inputLetter(letter)
        }
        let win = engine.submitGuess()

        return [
            "[WordGameSmoke] started answerLength=\(answer.count)",
            "[WordGameSmoke] wrongGuess=\(first) submittedRows=\(firstRows)",
            "[WordGameSmoke] winPath=\(win) state=\(engine.state)"
        ].joined(separator: "\n")
    }

    static func printLaunchReport(answer: String = "APPLE") {
        print(launchReport(answer: answer))
    }
}
// END mChatAI macOS Component: wordgame.smoke-tests
