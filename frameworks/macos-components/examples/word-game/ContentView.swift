// Example glue — adapt freely. The CANONICAL components are
// `components/word-game/WordGameEngine.swift` + `WordGameLexicon.swift`
// + `WordGameKeyboardHandling.swift` (+ optional smoke tests). Keep all
// of those byte-for-byte under `Sources/<TargetName>/MChatAIComponents/`.
//
// This example demonstrates the canonical Wordle-style composition:
//   - WordGameEngine drives state (rows, currentInput, status)
//   - .wordGameKeyboardHandling intercepts physical keyboard input
//   - On-screen QWERTY keyboard for click-to-input + at-a-glance "which
//     letters are still alive" UX (mac-022 spirit: every game's primary
//     input affordance must be visible on screen, not just hidden behind
//     a physical keyboard the user might not realize is connected)
//   - .focusEffect(.never) suppresses macOS's blue system focus ring that
//     would otherwise wrap the entire game view (the focusable() needed
//     for keyboard input creates that ring by default)

import SwiftUI

struct ContentView: View {
    @State private var engine = WordGameEngine()

    var body: some View {
        VStack(spacing: 18) {
            Text("Word Forge")
                .font(.largeTitle.bold())

            VStack(spacing: 8) {
                ForEach(engine.displayRows) { row in
                    HStack(spacing: 8) {
                        ForEach(row.tiles.indices, id: \.self) { index in
                            let tile = row.tiles[index]
                            Text(tile.letter)
                                .font(.system(size: 28, weight: .bold, design: .rounded))
                                .frame(width: 54, height: 54)
                                .background(tile.feedback.exampleColor)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                    }
                }
            }

            Text(engine.statusMessage)
                .foregroundStyle(.secondary)
                .font(.callout)

            // On-screen QWERTY keyboard — click letters OR see at-a-glance
            // which letters are still in play. The per-letter feedback is
            // computed from engine.rows so it stays in sync as the player
            // submits guesses.
            keyboardView
                .padding(.top, 4)

            HStack(spacing: 10) {
                Button("Delete") { engine.deleteLetter() }
                Button("Enter") {
                    _ = engine.submitGuess()
                }
                .keyboardShortcut(.return, modifiers: [])
                .buttonStyle(.borderedProminent)
                Button("New Game") { engine.reset() }
            }
            .padding(.top, 4)
        }
        .padding(28)
        .frame(minWidth: 540, minHeight: 720)
        .background(Color(.windowBackgroundColor))
        // Keyboard handling is scoped to a 0×0 invisible sentinel inside
        // the ZStack rather than the whole content — that keeps the
        // physical keyboard input working without drawing a system
        // focus ring around the entire game view (the focusable() in
        // .wordGameKeyboardHandling otherwise produces the bright blue
        // outline that's distracting + serves no purpose).
        .overlay(alignment: .topLeading) {
            Color.clear
                .frame(width: 0, height: 0)
                .wordGameKeyboardHandling(
                    onLetter: { engine.inputLetter($0) },
                    onDelete: { engine.deleteLetter() },
                    onSubmit: { _ = engine.submitGuess() }
                )
        }
    }

    // MARK: - On-screen keyboard

    private static let keyboardRows: [[Character]] = [
        ["Q","W","E","R","T","Y","U","I","O","P"],
        ["A","S","D","F","G","H","J","K","L"],
        ["Z","X","C","V","B","N","M"]
    ]

    private var letterFeedback: [Character: WordGameTileFeedback] {
        // Aggregate the best feedback we've seen per letter across all
        // submitted rows. correct > present > absent > empty.
        var result: [Character: WordGameTileFeedback] = [:]
        for row in engine.rows {
            for tile in row.tiles {
                guard let ch = tile.letter.first, !tile.letter.isEmpty else { continue }
                let upper = Character(String(ch).uppercased())
                let existing = result[upper] ?? .empty
                if tile.feedback.priority > existing.priority {
                    result[upper] = tile.feedback
                }
            }
        }
        return result
    }

    @ViewBuilder
    private var keyboardView: some View {
        let feedback = letterFeedback
        VStack(spacing: 6) {
            ForEach(Self.keyboardRows.indices, id: \.self) { rowIdx in
                HStack(spacing: 6) {
                    ForEach(Self.keyboardRows[rowIdx], id: \.self) { letter in
                        Button {
                            engine.inputLetter(letter)
                        } label: {
                            Text(String(letter))
                                .font(.system(size: 16, weight: .semibold, design: .rounded))
                                .frame(width: 36, height: 44)
                                .background(feedback[letter, default: .empty].keyboardColor)
                                .foregroundStyle(feedback[letter, default: .empty].keyboardForeground)
                                .clipShape(RoundedRectangle(cornerRadius: 6))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }
}

private extension WordGameTileFeedback {
    var exampleColor: Color {
        switch self {
        case .correct: return .green.opacity(0.75)
        case .present: return .yellow.opacity(0.75)
        case .absent:  return .secondary.opacity(0.25)
        case .empty:   return .secondary.opacity(0.12)
        }
    }

    /// Slightly more opaque variant for the on-screen keyboard so the
    /// "available letters" UX is high-contrast.
    var keyboardColor: Color {
        switch self {
        case .correct: return .green
        case .present: return .yellow
        case .absent:  return Color(white: 0.28)
        case .empty:   return Color(white: 0.85)
        }
    }

    var keyboardForeground: Color {
        switch self {
        case .correct, .present: return .black
        case .absent:            return .white.opacity(0.6)
        case .empty:             return .black
        }
    }

    /// Priority for "best feedback so far per letter" aggregation.
    var priority: Int {
        switch self {
        case .empty:   return 0
        case .absent:  return 1
        case .present: return 2
        case .correct: return 3
        }
    }
}
