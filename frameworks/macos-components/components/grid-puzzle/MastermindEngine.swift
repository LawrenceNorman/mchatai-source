// BEGIN mChatAI macOS Component: gridpuzzle.mastermind (components/grid-puzzle/MastermindEngine.swift)
import Foundation

enum MastermindPeg: String, Codable, CaseIterable, Sendable {
    case red
    case blue
    case green
    case yellow
    case purple
    case orange
}

struct MastermindFeedback: Codable, Equatable, Sendable {
    let exact: Int
    let colorOnly: Int
}

struct MastermindGuess: Codable, Identifiable, Equatable, Sendable {
    let id: UUID
    let pegs: [MastermindPeg]
    let feedback: MastermindFeedback

    init(pegs: [MastermindPeg], feedback: MastermindFeedback, id: UUID = UUID()) {
        self.id = id
        self.pegs = pegs
        self.feedback = feedback
    }
}

struct MastermindEngine: Codable, Equatable, Sendable {
    private(set) var secret: [MastermindPeg]
    private(set) var guesses: [MastermindGuess] = []
    var maxGuesses: Int = 10
    var codeLength: Int { secret.count }

    var isWon: Bool {
        guesses.last?.feedback.exact == secret.count
    }

    var isComplete: Bool {
        isWon || guesses.count >= maxGuesses
    }

    init(secret: [MastermindPeg] = [.red, .blue, .green, .yellow], maxGuesses: Int = 10) {
        self.secret = secret
        self.maxGuesses = maxGuesses
    }

    mutating func submit(_ pegs: [MastermindPeg]) -> MastermindFeedback {
        guard pegs.count == secret.count, !isComplete else {
            return MastermindFeedback(exact: 0, colorOnly: 0)
        }
        let feedback = Self.evaluate(secret: secret, guess: pegs)
        guesses.append(MastermindGuess(pegs: pegs, feedback: feedback))
        return feedback
    }

    mutating func reset(secret: [MastermindPeg]) {
        self.secret = secret
        guesses.removeAll()
    }

    static func evaluate(secret: [MastermindPeg], guess: [MastermindPeg]) -> MastermindFeedback {
        var exact = 0
        var secretRemainder: [MastermindPeg] = []
        var guessRemainder: [MastermindPeg] = []

        for index in 0..<min(secret.count, guess.count) {
            if secret[index] == guess[index] {
                exact += 1
            } else {
                secretRemainder.append(secret[index])
                guessRemainder.append(guess[index])
            }
        }

        var colorOnly = 0
        for peg in guessRemainder {
            if let match = secretRemainder.firstIndex(of: peg) {
                colorOnly += 1
                secretRemainder.remove(at: match)
            }
        }

        return MastermindFeedback(exact: exact, colorOnly: colorOnly)
    }
}
// END mChatAI macOS Component: gridpuzzle.mastermind
