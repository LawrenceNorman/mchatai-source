import SwiftUI
import AppKit

struct ContentView: View {
    @State private var engine = MiniCrosswordSeed.daily()
    @State private var puzzleIndex = MiniCrosswordSeed.dailyIndex().index
    @State private var elapsedSeconds = 0
    @State private var verifyMode = false  // "Check" toggle: highlights wrong letters
    @FocusState private var hasKeyboardFocus: Bool

    private let totalPuzzles = MiniCrosswordSeed.dailyIndex().total

    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        ZStack(alignment: .topLeading) {
            HStack(spacing: 28) {
                VStack(alignment: .leading, spacing: 18) {
                    header
                    crosswordBoard
                    controls
                    letterPad
                }
                .frame(minWidth: 430)

                cluesPanel
                    .frame(width: 340)
            }
            .padding(28)

            KeyboardCaptureView(
                onLetter: { inputLetter($0) },
                onDelete: {
                    engine.delete()
                    print("[CrosswordExample] delete active=\(engine.activeEntry()?.id ?? "none")")
                },
                onMove: { moveSelection($0) }
            )
            .frame(width: 1, height: 1)
            .opacity(0.01)
            .accessibilityHidden(true)
        }
        .frame(minWidth: 840, minHeight: 620)
        .background(Color(nsColor: .windowBackgroundColor))
        .focusable()
        .focused($hasKeyboardFocus)
        .onAppear {
            focusKeyboardInput()
            print("[CrosswordExample] ready entries=\(engine.entries.count) solved=\(engine.isSolved)")
        }
        .onReceive(timer) { _ in
            if !engine.isSolved {
                elapsedSeconds += 1
            }
        }
        .onKeyPress(characters: .letters, phases: .down) { press in
            guard let first = press.characters.uppercased().first else {
                return .ignored
            }
            inputLetter(first)
            return .handled
        }
        .onKeyPress(.delete, phases: .down) { _ in
            engine.delete()
            return .handled
        }
        .onKeyPress(.leftArrow, phases: .down) { _ in
            moveSelection(.left)
            return .handled
        }
        .onKeyPress(.rightArrow, phases: .down) { _ in
            moveSelection(.right)
            return .handled
        }
        .onKeyPress(.upArrow, phases: .down) { _ in
            moveSelection(.up)
            return .handled
        }
        .onKeyPress(.downArrow, phases: .down) { _ in
            moveSelection(.down)
            return .handled
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text("Mini Crossword")
                .font(.system(size: 18, weight: .semibold, design: .rounded))
            // Puzzle counter: "Puzzle 5 of 10" — tells the user there's a
            // bank of curated puzzles + how far through they are.
            Text("Puzzle \(puzzleIndex + 1) of \(totalPuzzles)")
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(Color.secondary.opacity(0.15))
                .clipShape(Capsule())
            Text(statusText)
                .font(.caption.weight(.semibold))
                .foregroundStyle(engine.isSolved ? .green : .secondary)
                .lineLimit(1)
            Spacer()
            // Prev / Next buzzword navigation
            Button(action: { goToPuzzle(puzzleIndex - 1) }) {
                Image(systemName: "chevron.left")
            }
            .buttonStyle(.bordered)
            .help("Previous puzzle")
            Button(action: { goToPuzzle(puzzleIndex + 1) }) {
                Image(systemName: "chevron.right")
            }
            .buttonStyle(.bordered)
            .help("Next puzzle")
            HStack(spacing: 6) {
                Text("TIME")
                    .font(.caption2.weight(.black))
                    .foregroundStyle(.secondary)
                Text(timeText)
                    .font(.system(size: 18, weight: .heavy, design: .rounded))
                    .monospacedDigit()
            }
        }
        .frame(maxHeight: 44)
    }

    private func goToPuzzle(_ rawIndex: Int) {
        let idx = ((rawIndex % totalPuzzles) + totalPuzzles) % totalPuzzles
        puzzleIndex = idx
        engine = MiniCrosswordSeed.puzzle(at: idx)
        elapsedSeconds = 0
        focusKeyboardInput()
    }

    private var crosswordBoard: some View {
        let columns = Array(repeating: GridItem(.fixed(72), spacing: 3), count: engine.grid.columns)
        return LazyVGrid(columns: columns, spacing: 3) {
            ForEach(engine.grid.allPoints(), id: \.self) { point in
                cellView(at: point)
            }
        }
        .fixedSize()
        .padding(8)
        .background(Color.black.opacity(0.92))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay {
            RoundedRectangle(cornerRadius: 10)
                .stroke(.primary.opacity(0.16), lineWidth: 1)
        }
    }

    private var controls: some View {
        HStack(spacing: 10) {
            Button("Across") {
                engine.select(engine.selectedPoint, direction: .across)
                focusKeyboardInput()
            }
            .buttonStyle(.borderedProminent)
            .tint(engine.selectedDirection == .across ? .blue : .gray)

            Button("Down") {
                engine.select(engine.selectedPoint, direction: .down)
                focusKeyboardInput()
            }
            .buttonStyle(.borderedProminent)
            .tint(engine.selectedDirection == .down ? .blue : .gray)

            Button("Delete") {
                engine.delete()
                focusKeyboardInput()
            }

            // Check toggle — when ON, every filled cell shows a soft red
            // tint if wrong or a soft green tint if correct (per-letter,
            // not waiting for the full puzzle to be solved). Per user
            // feedback 2026-05-04: "verification" was missing — solver
            // had no way to know if a guess was right until the whole
            // puzzle was solved.
            Button(verifyMode ? "Hide Check" : "Check") {
                verifyMode.toggle()
                focusKeyboardInput()
            }
            .tint(verifyMode ? .green : .accentColor)

            Button("Reset") {
                resetPuzzle()
            }

            Spacer()

            Text("Type letters · arrows move · Check verifies")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var letterPad: some View {
        let letters = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
        let columns = Array(repeating: GridItem(.fixed(28), spacing: 5), count: 13)
        return LazyVGrid(columns: columns, spacing: 6) {
            ForEach(letters, id: \.self) { character in
                Button(String(character)) {
                    inputLetter(character)
                    focusKeyboardInput()
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .frame(width: 28, height: 28)
            }
        }
        .padding(10)
        .background(Color(nsColor: .controlBackgroundColor))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var cluesPanel: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 4) {
                Text(activeClueTitle)
                    .font(.title2.bold())
                Text(engine.activeEntry()?.clue ?? "Choose a square.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(nsColor: .controlBackgroundColor))
            .clipShape(RoundedRectangle(cornerRadius: 8))

            clueList(title: "Across", direction: .across)
            clueList(title: "Down", direction: .down)

            Spacer()
        }
    }

    private var statusText: String {
        if engine.isSolved {
            return "Solved in \(timeText)."
        }
        guard let entry = engine.activeEntry() else {
            return "Choose a clue or square."
        }
        return "\(entry.id) \(entry.direction.rawValue.capitalized) · \(entry.length) letters"
    }

    private var activeClueTitle: String {
        guard let entry = engine.activeEntry() else { return "No active clue" }
        return "\(entry.number) \(entry.direction == .across ? "Across" : "Down")"
    }

    private var timeText: String {
        let minutes = elapsedSeconds / 60
        let seconds = elapsedSeconds % 60
        return String(format: "%d:%02d", minutes, seconds)
    }

    private func cellView(at point: PuzzlePoint) -> some View {
        let cell = engine.grid[point]
        let isSelected = point == engine.selectedPoint
        let isActive = engine.activeEntry()?.contains(point) == true

        return ZStack(alignment: .topLeading) {
            Rectangle()
                .fill(cellFill(cell: cell, isSelected: isSelected, isActive: isActive))

            if let number = cell.number {
                Text("\(number)")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(isSelected ? .white : .black.opacity(0.55))
                    .padding(5)
            }

            Text(cell.guess ?? "")
                .font(.system(size: 30, weight: .black, design: .rounded))
                .foregroundStyle(cellTextColor(cell: cell, isSelected: isSelected))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        }
        .frame(width: 72, height: 72)
        .contentShape(Rectangle())
        .onTapGesture {
            engine.select(point)
            focusKeyboardInput()
        }
        .accessibilityLabel(accessibilityLabel(for: point, cell: cell))
    }

    private func clueList(title: String, direction: CrosswordDirection) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headline)
            ForEach(engine.entries.filter { $0.direction == direction }) { entry in
                Button {
                    engine.select(entry.start, direction: direction)
                    focusKeyboardInput()
                } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("\(entry.number)")
                            .font(.callout.monospacedDigit().bold())
                            .frame(width: 24, alignment: .trailing)
                        Text(entry.clue)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .lineLimit(2)
                    }
                }
                .buttonStyle(.plain)
                .padding(.vertical, 4)
                .foregroundStyle(entry.id == engine.activeEntry()?.id ? .blue : .primary)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(nsColor: .controlBackgroundColor))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func cellFill(cell: CrosswordCell, isSelected: Bool, isActive: Bool) -> Color {
        if cell.isBlock { return Color(white: 0.18) }      // softer than pure black

        // Verify mode: per-letter feedback when Check is toggled on.
        // Soft green for correct, soft red for wrong. Empty cells stay white.
        if verifyMode, !cell.isBlock, cell.guess != nil {
            if cell.isCorrect { return Color(red: 0.78, green: 0.95, blue: 0.78) }  // pale green
            return Color(red: 0.99, green: 0.82, blue: 0.82)                         // pale red
        }

        if isSelected { return Color(red: 0.85, green: 0.92, blue: 1.0) }  // pale blue (was solid blue — too dark)
        if isActive   { return Color(red: 0.93, green: 0.96, blue: 1.0) }  // very pale blue (highlight the row/col)
        if engine.isSolved { return Color(red: 0.85, green: 0.97, blue: 0.85) }
        return Color(white: 0.99)  // near-white instead of off-white
    }

    private func cellTextColor(cell: CrosswordCell, isSelected: Bool) -> Color {
        // Always-readable dark text on the lightened backgrounds.
        // Correct letters in verify-mode get a slightly bolder dark green.
        if verifyMode, cell.guess != nil, !cell.isBlock {
            return cell.isCorrect ? Color(red: 0.10, green: 0.45, blue: 0.18) : Color(red: 0.55, green: 0.10, blue: 0.10)
        }
        if cell.isCorrect && engine.isSolved { return Color(red: 0.18, green: 0.55, blue: 0.20) }
        return .black
    }

    private func moveSelection(_ direction: GridDirection) {
        var next = engine.selectedPoint.moved(direction)
        while engine.grid.contains(next) {
            if !engine.grid[next].isBlock {
                engine.select(next, direction: engine.selectedDirection)
                return
            }
            next = next.moved(direction)
        }
    }

    private func resetPuzzle() {
        engine = MiniCrosswordSeed.daily()
        elapsedSeconds = 0
        focusKeyboardInput()
    }

    private func focusKeyboardInput() {
        hasKeyboardFocus = true
    }

    private func inputLetter(_ character: Character) {
        engine.input(character)
        let active = engine.activeEntry()?.id ?? "none"
        print("[CrosswordExample] input \(String(character).uppercased()) active=\(active) solved=\(engine.isSolved)")
    }

    private func accessibilityLabel(for point: PuzzlePoint, cell: CrosswordCell) -> String {
        if cell.isBlock { return "Block" }
        let coordinate = "row \(point.row + 1), column \(point.col + 1)"
        let value = cell.guess ?? "empty"
        return "\(coordinate), \(value)"
    }
}

private struct KeyboardCaptureView: NSViewRepresentable {
    var onLetter: (Character) -> Void
    var onDelete: () -> Void
    var onMove: (GridDirection) -> Void

    func makeNSView(context: Context) -> KeyCatcherView {
        let view = KeyCatcherView()
        view.onLetter = onLetter
        view.onDelete = onDelete
        view.onMove = onMove
        DispatchQueue.main.async {
            view.window?.makeFirstResponder(view)
        }
        return view
    }

    func updateNSView(_ nsView: KeyCatcherView, context: Context) {
        nsView.onLetter = onLetter
        nsView.onDelete = onDelete
        nsView.onMove = onMove
        DispatchQueue.main.async {
            nsView.window?.makeFirstResponder(nsView)
        }
    }

    final class KeyCatcherView: NSView {
        var onLetter: ((Character) -> Void)?
        var onDelete: (() -> Void)?
        var onMove: ((GridDirection) -> Void)?

        override var acceptsFirstResponder: Bool { true }

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            DispatchQueue.main.async {
                self.window?.makeFirstResponder(self)
            }
        }

        override func keyDown(with event: NSEvent) {
            switch event.keyCode {
            case 51:
                onDelete?()
            case 123:
                onMove?(.left)
            case 124:
                onMove?(.right)
            case 125:
                onMove?(.down)
            case 126:
                onMove?(.up)
            default:
                guard let characters = event.charactersIgnoringModifiers?.uppercased() else { return }
                for character in characters where String(character).rangeOfCharacter(from: .letters) != nil {
                    onLetter?(character)
                }
            }
        }
    }
}
