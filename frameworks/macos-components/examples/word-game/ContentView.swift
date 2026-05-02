import SwiftUI

struct ContentView: View {
    @State private var engine = WordGameEngine(answer: "APPLE")

    var body: some View {
        VStack(spacing: 24) {
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

            HStack {
                Button("Delete") { engine.deleteLetter() }
                Button("Enter") { engine.submitGuess() }
                    .keyboardShortcut(.return, modifiers: [])
                Button("New Game") { engine.reset() }
            }
        }
        .padding(40)
        .frame(minWidth: 760, minHeight: 620)
        .wordGameKeyboardHandling(
            onLetter: { engine.inputLetter($0) },
            onDelete: { engine.deleteLetter() },
            onSubmit: { engine.submitGuess() }
        )
    }
}

private extension WordGameTileFeedback {
    var exampleColor: Color {
        switch self {
        case .correct: return .green.opacity(0.75)
        case .present: return .yellow.opacity(0.75)
        case .absent: return .secondary.opacity(0.25)
        case .empty: return .secondary.opacity(0.12)
        }
    }
}
