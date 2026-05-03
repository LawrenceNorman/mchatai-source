import SwiftUI
import AppKit

struct ContentView: View {
    @State private var engine = MastermindEngine(secret: [.red, .blue, .green, .yellow], maxGuesses: 10)
    @State private var currentGuess: [MastermindPeg?] = Array(repeating: nil, count: 4)
    @State private var selectedSlot = 0
    @State private var secretIndex = 0
    @State private var status = "Crack the 4-color code."

    private let secretDeck: [[MastermindPeg]] = [
        [.red, .blue, .green, .yellow],
        [.purple, .orange, .red, .green],
        [.yellow, .yellow, .blue, .purple],
        [.orange, .green, .orange, .red]
    ]

    var body: some View {
        ZStack(alignment: .topLeading) {
            HStack(spacing: 24) {
                VStack(alignment: .leading, spacing: 18) {
                    header
                    board
                }

                controlsPanel
                    .frame(width: 280)
            }
            .padding(28)

            MastermindKeyboardCaptureView(
                onNumber: { choosePegByNumber($0) },
                onSubmit: submitGuess,
                onDelete: clearSelectedSlot,
                onMove: moveSelection
            )
            .frame(width: 1, height: 1)
            .opacity(0.01)
            .accessibilityHidden(true)
        }
        .frame(minWidth: 860, minHeight: 650)
        .background(
            LinearGradient(
                colors: [Color(red: 0.08, green: 0.1, blue: 0.14), Color(red: 0.03, green: 0.04, blue: 0.07)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
    }

    private var header: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Native Mastermind")
                    .font(.system(size: 42, weight: .black, design: .rounded))
                    .foregroundStyle(.white)
                Text(status)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(engine.isWon ? .green : .white.opacity(0.72))
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text("TURN")
                    .font(.caption.weight(.black))
                    .foregroundStyle(.white.opacity(0.54))
                Text("\(displayedTurn)/\(engine.maxGuesses)")
                    .font(.system(size: 34, weight: .black, design: .rounded))
                    .foregroundStyle(.white)
                    .monospacedDigit()
            }
        }
        .frame(width: 500)
    }

    private var board: some View {
        VStack(spacing: 10) {
            ForEach((0..<engine.maxGuesses).reversed(), id: \.self) { index in
                historyRow(index: index)
            }

            Divider()
                .overlay(.white.opacity(0.2))
                .padding(.vertical, 8)

            HStack(spacing: 14) {
                Text("Guess")
                    .font(.headline)
                    .foregroundStyle(.white.opacity(0.75))
                    .frame(width: 58, alignment: .leading)

                ForEach(0..<engine.codeLength, id: \.self) { index in
                    guessSlot(index)
                }

                Button("Submit") {
                    submitGuess()
                }
                .keyboardShortcut(.return, modifiers: [])
                .buttonStyle(.borderedProminent)
                .disabled(!canSubmit || engine.isComplete)
            }
        }
        .padding(18)
        .frame(width: 500)
        .background(Color.white.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay {
            RoundedRectangle(cornerRadius: 10)
                .stroke(.white.opacity(0.14), lineWidth: 1)
        }
    }

    private var controlsPanel: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Palette")
                    .font(.title2.bold())
                    .foregroundStyle(.white)
                Text("Keys 1-6 choose colors. Return submits. Delete clears.")
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.62))
            }

            LazyVGrid(columns: Array(repeating: GridItem(.fixed(72), spacing: 12), count: 2), spacing: 12) {
                ForEach(Array(MastermindPeg.allCases.enumerated()), id: \.element) { index, peg in
                    Button {
                        setPeg(peg)
                    } label: {
                        VStack(spacing: 8) {
                            pegCircle(peg, size: 34)
                            Text("\(index + 1)")
                                .font(.caption.bold())
                        }
                        .frame(width: 68, height: 64)
                    }
                    .buttonStyle(.bordered)
                }
            }

            VStack(alignment: .leading, spacing: 10) {
                Text("Feedback")
                    .font(.headline)
                    .foregroundStyle(.white)
                Label("Black peg: exact color and slot", systemImage: "circle.fill")
                Label("White peg: right color, wrong slot", systemImage: "circle")
            }
            .font(.callout.weight(.semibold))
            .foregroundStyle(.white.opacity(0.7))

            Spacer()

            if engine.isComplete {
                revealSecret
            }

            HStack {
                Button("Clear") {
                    clearSelectedSlot()
                }
                Button("New Code") {
                    newGame()
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(20)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Color.white.opacity(0.09))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var revealSecret: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(engine.isWon ? "Code cracked" : "Secret code")
                .font(.headline)
                .foregroundStyle(.white)
            HStack(spacing: 8) {
                ForEach(Array(engine.secret.enumerated()), id: \.offset) { _, peg in
                    pegCircle(peg, size: 28)
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.black.opacity(0.28))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var canSubmit: Bool {
        currentGuess.allSatisfy { $0 != nil }
    }

    private var displayedTurn: Int {
        engine.isComplete ? max(engine.guesses.count, 1) : min(engine.guesses.count + 1, engine.maxGuesses)
    }

    private func historyRow(index: Int) -> some View {
        let guess = engine.guesses.indices.contains(index) ? engine.guesses[index] : nil
        let isCurrent = index == engine.guesses.count && !engine.isComplete

        return HStack(spacing: 14) {
            Text("\(index + 1)")
                .font(.callout.monospacedDigit().bold())
                .foregroundStyle(isCurrent ? .yellow : .white.opacity(0.44))
                .frame(width: 58, alignment: .leading)

            ForEach(0..<engine.codeLength, id: \.self) { slot in
                if let peg = guess?.pegs[slot] {
                    pegCircle(peg, size: 34)
                } else {
                    emptyPeg(size: 34)
                }
            }

            feedbackPegs(guess?.feedback)
        }
        .padding(.vertical, 2)
    }

    private func guessSlot(_ index: Int) -> some View {
        Button {
            selectedSlot = index
        } label: {
            ZStack {
                if let peg = currentGuess[index] {
                    pegCircle(peg, size: 40)
                } else {
                    emptyPeg(size: 40)
                }
            }
            .frame(width: 48, height: 48)
            .overlay {
                Circle()
                    .stroke(index == selectedSlot ? .yellow : .clear, lineWidth: 3)
            }
        }
        .buttonStyle(.plain)
    }

    private func feedbackPegs(_ feedback: MastermindFeedback?) -> some View {
        let exact = feedback?.exact ?? 0
        let colorOnly = feedback?.colorOnly ?? 0

        return LazyVGrid(columns: Array(repeating: GridItem(.fixed(12), spacing: 4), count: 2), spacing: 4) {
            ForEach(0..<4, id: \.self) { index in
                Circle()
                    .fill(feedbackColor(index: index, exact: exact, colorOnly: colorOnly))
                    .frame(width: 12, height: 12)
                    .overlay {
                        Circle()
                            .stroke(feedbackStrokeColor(index: index, exact: exact, colorOnly: colorOnly), lineWidth: index < exact ? 2 : 1)
                    }
            }
        }
        .frame(width: 38, height: 32)
        .padding(.leading, 6)
    }

    private func feedbackColor(index: Int, exact: Int, colorOnly: Int) -> Color {
        if index < exact { return Color(red: 0.01, green: 0.01, blue: 0.015) }
        if index < exact + colorOnly { return .white }
        return .white.opacity(0.14)
    }

    private func feedbackStrokeColor(index: Int, exact: Int, colorOnly: Int) -> Color {
        if index < exact { return .yellow.opacity(0.95) }
        if index < exact + colorOnly { return .white.opacity(0.72) }
        return .white.opacity(0.12)
    }

    private func pegCircle(_ peg: MastermindPeg, size: CGFloat) -> some View {
        Circle()
            .fill(peg.color)
            .frame(width: size, height: size)
            .shadow(color: peg.color.opacity(0.5), radius: 5, x: 0, y: 2)
            .overlay {
                Circle().stroke(.white.opacity(0.45), lineWidth: 1)
            }
            .accessibilityLabel(peg.rawValue)
    }

    private func emptyPeg(size: CGFloat) -> some View {
        Circle()
            .fill(Color.white.opacity(0.08))
            .frame(width: size, height: size)
            .overlay {
                Circle().stroke(.white.opacity(0.2), lineWidth: 1)
            }
    }

    private func setPeg(_ peg: MastermindPeg) {
        guard !engine.isComplete else { return }
        currentGuess[selectedSlot] = peg
        print("[MastermindExample] slot \(selectedSlot + 1)=\(peg.rawValue)")
        if selectedSlot < engine.codeLength - 1 {
            selectedSlot += 1
        }
    }

    private func submitGuess() {
        guard !engine.isComplete else { return }
        guard canSubmit else {
            status = "Fill all four slots before submitting."
            return
        }
        let pegs = currentGuess.compactMap { $0 }
        let feedback = engine.submit(pegs)
        if engine.isWon {
            status = "Solved in \(engine.guesses.count) turn\(engine.guesses.count == 1 ? "" : "s")."
        } else if engine.isComplete {
            status = "Code locked. Try a new code."
        } else {
            status = "\(feedback.exact) exact, \(feedback.colorOnly) color-only."
        }
        print("[MastermindExample] submit exact=\(feedback.exact) colorOnly=\(feedback.colorOnly) guesses=\(engine.guesses.count)")
        currentGuess = Array(repeating: nil, count: engine.codeLength)
        selectedSlot = 0
    }

    private func clearSelectedSlot() {
        currentGuess[selectedSlot] = nil
        print("[MastermindExample] clear slot \(selectedSlot + 1)")
    }

    private func moveSelection(_ delta: Int) {
        selectedSlot = min(max(selectedSlot + delta, 0), engine.codeLength - 1)
    }

    private func choosePegByNumber(_ number: Int) {
        guard number >= 1, number <= MastermindPeg.allCases.count else { return }
        setPeg(MastermindPeg.allCases[number - 1])
    }

    private func newGame() {
        secretIndex = (secretIndex + 1) % secretDeck.count
        engine.reset(secret: secretDeck[secretIndex])
        currentGuess = Array(repeating: nil, count: engine.codeLength)
        selectedSlot = 0
        status = "New code ready."
        print("[MastermindExample] new code index=\(secretIndex)")
    }
}

private extension MastermindPeg {
    var color: Color {
        switch self {
        case .red: return Color(red: 0.96, green: 0.18, blue: 0.22)
        case .blue: return Color(red: 0.1, green: 0.5, blue: 0.95)
        case .green: return Color(red: 0.14, green: 0.76, blue: 0.34)
        case .yellow: return Color(red: 1.0, green: 0.79, blue: 0.12)
        case .purple: return Color(red: 0.62, green: 0.32, blue: 0.92)
        case .orange: return Color(red: 1.0, green: 0.46, blue: 0.12)
        }
    }
}

private struct MastermindKeyboardCaptureView: NSViewRepresentable {
    var onNumber: (Int) -> Void
    var onSubmit: () -> Void
    var onDelete: () -> Void
    var onMove: (Int) -> Void

    func makeNSView(context: Context) -> KeyCatcherView {
        let view = KeyCatcherView()
        view.onNumber = onNumber
        view.onSubmit = onSubmit
        view.onDelete = onDelete
        view.onMove = onMove
        DispatchQueue.main.async {
            view.window?.makeFirstResponder(view)
        }
        return view
    }

    func updateNSView(_ nsView: KeyCatcherView, context: Context) {
        nsView.onNumber = onNumber
        nsView.onSubmit = onSubmit
        nsView.onDelete = onDelete
        nsView.onMove = onMove
        DispatchQueue.main.async {
            nsView.window?.makeFirstResponder(nsView)
        }
    }

    final class KeyCatcherView: NSView {
        var onNumber: ((Int) -> Void)?
        var onSubmit: (() -> Void)?
        var onDelete: (() -> Void)?
        var onMove: ((Int) -> Void)?

        override var acceptsFirstResponder: Bool { true }

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            DispatchQueue.main.async {
                self.window?.makeFirstResponder(self)
            }
        }

        override func keyDown(with event: NSEvent) {
            switch event.keyCode {
            case 36:
                onSubmit?()
            case 51:
                onDelete?()
            case 123:
                onMove?(-1)
            case 124:
                onMove?(1)
            default:
                guard let characters = event.charactersIgnoringModifiers else { return }
                for character in characters {
                    if let number = Int(String(character)) {
                        onNumber?(number)
                    }
                }
            }
        }
    }
}
