// BEGIN mChatAI macOS Component: wordgame.engine (components/word-game/WordGameEngine.swift)
import Foundation
import Observation

@Observable
final class WordGameEngine {
    let wordLength: Int
    let maxGuesses: Int

    private let answers: [String]
    private let validGuesses: Set<String>
    private var answer: String

    private(set) var rows: [WordGameRow]
    var currentInput: String = ""
    var state: WordGameState = .playing
    var statusMessage: String = "Type a five-letter word."

    init(
        answers: [String] = WordGameLexicon.answers,
        validGuesses: [String] = WordGameLexicon.validGuesses,
        answer overrideAnswer: String? = nil,
        wordLength: Int = 5,
        maxGuesses: Int = 6
    ) {
        self.wordLength = wordLength
        self.maxGuesses = maxGuesses
        self.answers = Self.normalizedWords(answers, length: wordLength)
        self.validGuesses = Set(Self.normalizedWords(validGuesses + answers, length: wordLength))

        let candidate = overrideAnswer ?? self.answers.randomElement() ?? "APPLE"
        self.answer = Self.normalized(candidate, length: wordLength) ?? "APPLE"
        self.rows = (0..<maxGuesses).map { _ in WordGameRow.empty(length: wordLength) }
    }

    var displayRows: [WordGameRow] {
        guard state == .playing, let rowIndex = activeRowIndex else { return rows }
        var rendered = rows
        let letters = Array(currentInput)
        rendered[rowIndex] = WordGameRow(
            tiles: (0..<wordLength).map { index in
                let letter = index < letters.count ? String(letters[index]) : ""
                return WordGameTile(letter: letter, feedback: .empty)
            }
        )
        return rendered
    }

    var submittedGuessCount: Int {
        rows.filter { $0.tiles.contains { $0.feedback != .empty } }.count
    }

    var remainingGuesses: Int {
        max(0, maxGuesses - submittedGuessCount)
    }

    var revealAnswer: String {
        answer
    }

    var activeRowIndex: Int? {
        rows.firstIndex { row in
            row.tiles.allSatisfy { $0.feedback == .empty && $0.letter.isEmpty }
        }
    }

    func inputLetter(_ character: Character) {
        guard state == .playing else { return }
        guard currentInput.count < wordLength else { return }

        let upper = String(character).uppercased()
        guard upper.range(of: "^[A-Z]$", options: .regularExpression) != nil else { return }
        currentInput.append(upper)
        statusMessage = currentInput.count == wordLength ? "Press Enter to submit." : "Keep typing."
    }

    func deleteLetter() {
        guard state == .playing else { return }
        guard !currentInput.isEmpty else { return }
        currentInput.removeLast()
        statusMessage = currentInput.isEmpty ? "Type a five-letter word." : "Keep typing."
    }

    @discardableResult
    func submitGuess() -> WordGameSubmitResult {
        guard state == .playing else { return .notPlaying }
        guard currentInput.count == wordLength else {
            statusMessage = "Need \(wordLength) letters."
            return .tooShort
        }

        let guess = currentInput.uppercased()
        guard isValidGuess(guess) else {
            statusMessage = "Not in the list. Try another word."
            return .invalidWord
        }

        guard let rowIndex = activeRowIndex else {
            state = .lost(answer: answer)
            statusMessage = "Out of guesses. The word was \(answer)."
            return .lost(answer: answer)
        }

        let feedback = score(guess: guess, answer: answer)
        rows[rowIndex] = WordGameRow(
            tiles: zip(Array(guess), feedback).map { letter, feedback in
                WordGameTile(letter: String(letter), feedback: feedback)
            }
        )
        currentInput = ""

        if guess == answer {
            state = .won
            statusMessage = "You solved it in \(submittedGuessCount)!"
            return .won
        }

        if remainingGuesses == 0 {
            state = .lost(answer: answer)
            statusMessage = "Out of guesses. The word was \(answer)."
            return .lost(answer: answer)
        }

        statusMessage = "\(remainingGuesses) guess\(remainingGuesses == 1 ? "" : "es") left."
        return .accepted
    }

    func reset(answer overrideAnswer: String? = nil) {
        let candidate = overrideAnswer ?? answers.randomElement() ?? answer
        answer = Self.normalized(candidate, length: wordLength) ?? answer
        rows = (0..<maxGuesses).map { _ in WordGameRow.empty(length: wordLength) }
        currentInput = ""
        state = .playing
        statusMessage = "Type a five-letter word."
    }

    private func isValidGuess(_ guess: String) -> Bool {
        validGuesses.contains(guess) || Self.normalized(guess, length: wordLength) != nil
    }

    private func score(guess: String, answer: String) -> [WordGameTileFeedback] {
        let guessLetters = Array(guess)
        let answerLetters = Array(answer)
        var feedback = Array(repeating: WordGameTileFeedback.absent, count: wordLength)
        var remaining: [Character: Int] = [:]

        for index in 0..<wordLength {
            if guessLetters[index] == answerLetters[index] {
                feedback[index] = .correct
            } else {
                remaining[answerLetters[index], default: 0] += 1
            }
        }

        for index in 0..<wordLength where feedback[index] != .correct {
            let letter = guessLetters[index]
            if let count = remaining[letter], count > 0 {
                feedback[index] = .present
                remaining[letter] = count - 1
            }
        }

        return feedback
    }

    private static func normalizedWords(_ words: [String], length: Int) -> [String] {
        words.compactMap { normalized($0, length: length) }
    }

    private static func normalized(_ word: String, length: Int) -> String? {
        let upper = word.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard upper.count == length else { return nil }
        guard upper.range(of: "^[A-Z]{\(length)}$", options: .regularExpression) != nil else { return nil }
        return upper
    }
}

struct WordGameRow: Identifiable, Hashable {
    let id = UUID()
    var tiles: [WordGameTile]

    static func empty(length: Int) -> WordGameRow {
        WordGameRow(
            tiles: (0..<length).map { _ in
                WordGameTile(letter: "", feedback: .empty)
            }
        )
    }
}

struct WordGameTile: Hashable {
    var letter: String
    var feedback: WordGameTileFeedback
}

enum WordGameTileFeedback: String, Codable, Hashable {
    case empty
    case correct
    case present
    case absent
}

enum WordGameState: Equatable {
    case playing
    case won
    case lost(answer: String)
}

enum WordGameSubmitResult: Equatable {
    case accepted
    case won
    case lost(answer: String)
    case invalidWord
    case tooShort
    case notPlaying
}
// END mChatAI macOS Component: wordgame.engine
