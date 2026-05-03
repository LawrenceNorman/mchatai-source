import SwiftUI
import AppKit

struct ContentView: View {
    @State private var engine = MinesweeperEngine(rows: 9, columns: 9, mineCount: 10, seed: 7)
    @State private var selected = PuzzlePoint(row: 0, col: 0)
    @State private var flagMode = false
    @State private var elapsedSeconds = 0
    @State private var seed: UInt64 = 7

    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        ZStack(alignment: .topLeading) {
            VStack(alignment: .leading, spacing: 18) {
                header
                mineGrid
                controls
            }
            .padding(28)

            MinesweeperKeyboardCaptureView(
                onReveal: activateSelected,
                onFlag: toggleSelectedFlag,
                onReset: newGame,
                onMove: moveSelection
            )
            .frame(width: 1, height: 1)
            .opacity(0.01)
            .accessibilityHidden(true)
        }
        .frame(minWidth: 620, minHeight: 760)
        .background(Color(red: 0.08, green: 0.1, blue: 0.12))
        .onReceive(timer) { _ in
            if engine.state == .playing {
                elapsedSeconds += 1
            }
        }
    }

    private var header: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Native Minesweeper")
                    .font(.system(size: 38, weight: .black, design: .rounded))
                    .foregroundStyle(.white)
                Text(statusText)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(statusColor)
            }

            Spacer()

            statBlock(label: "TIME", value: timeText)
            statBlock(label: "MINES", value: "\(minesRemaining)")
        }
        .frame(width: 564)
    }

    private var mineGrid: some View {
        let columns = Array(repeating: GridItem(.fixed(56), spacing: 4), count: engine.grid.columns)
        return LazyVGrid(columns: columns, spacing: 4) {
            ForEach(engine.grid.allPoints(), id: \.self) { point in
                cellView(point)
            }
        }
        .padding(10)
        .fixedSize()
        .background(Color.black.opacity(0.36))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay {
            RoundedRectangle(cornerRadius: 10)
                .stroke(.white.opacity(0.12), lineWidth: 1)
        }
    }

    private var controls: some View {
        HStack(spacing: 12) {
            Toggle("Flag", isOn: $flagMode)
                .toggleStyle(.button)
                .tint(.orange)

            Button("Reveal") {
                reveal(selected)
            }
            .buttonStyle(.borderedProminent)

            Button("New Game") {
                newGame()
            }

            Spacer()

            Text("Arrows move · Space reveal · F flag · R reset")
                .font(.callout.weight(.semibold))
                .foregroundStyle(.white.opacity(0.58))
        }
        .frame(width: 564)
    }

    private var statusText: String {
        switch engine.state {
        case .ready: return flagMode ? "Flag mode. Mark suspicious tiles." : "Choose a safe tile."
        case .playing: return flagMode ? "Flag mode active." : "Sweep carefully."
        case .won: return "Board cleared."
        case .lost: return "Mine triggered."
        }
    }

    private var statusColor: Color {
        switch engine.state {
        case .won: return .green
        case .lost: return .red
        default: return .white.opacity(0.72)
        }
    }

    private var timeText: String {
        String(format: "%02d:%02d", elapsedSeconds / 60, elapsedSeconds % 60)
    }

    private var minesRemaining: Int {
        engine.mineCount - engine.grid.cells.filter(\.isFlagged).count
    }

    private func statBlock(label: String, value: String) -> some View {
        VStack(alignment: .trailing, spacing: 2) {
            Text(label)
                .font(.caption.weight(.black))
                .foregroundStyle(.white.opacity(0.52))
            Text(value)
                .font(.system(size: 30, weight: .black, design: .rounded))
                .foregroundStyle(.white)
                .monospacedDigit()
        }
    }

    private func cellView(_ point: PuzzlePoint) -> some View {
        let cell = engine.grid[point]
        let isSelected = point == selected

        return Button {
            if flagMode {
                flag(point)
            } else {
                reveal(point)
            }
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: 6)
                    .fill(cellFill(cell))
                    .overlay {
                        RoundedRectangle(cornerRadius: 6)
                            .stroke(isSelected ? .yellow : .black.opacity(0.2), lineWidth: isSelected ? 3 : 1)
                    }

                cellContent(cell)
            }
            .frame(width: 56, height: 56)
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button(cell.isFlagged ? "Remove Flag" : "Flag") {
                flag(point)
            }
        }
        .accessibilityLabel(accessibilityLabel(for: point, cell: cell))
    }

    @ViewBuilder
    private func cellContent(_ cell: MinesweeperCell) -> some View {
        if cell.isFlagged && !cell.isRevealed {
            Image(systemName: "flag.fill")
                .font(.title2.bold())
                .foregroundStyle(.orange)
        } else if cell.isRevealed && cell.hasMine {
            Image(systemName: "burst.fill")
                .font(.title2.bold())
                .foregroundStyle(.red)
        } else if cell.isRevealed && cell.adjacentMines > 0 {
            Text("\(cell.adjacentMines)")
                .font(.system(size: 24, weight: .black, design: .rounded))
                .foregroundStyle(numberColor(cell.adjacentMines))
        }
    }

    private func cellFill(_ cell: MinesweeperCell) -> Color {
        if cell.isRevealed && cell.hasMine { return Color.red.opacity(0.28) }
        if cell.isRevealed { return Color.white.opacity(0.88) }
        return Color(red: 0.18, green: 0.24, blue: 0.3)
    }

    private func numberColor(_ count: Int) -> Color {
        switch count {
        case 1: return .blue
        case 2: return .green
        case 3: return .red
        case 4: return .purple
        default: return .orange
        }
    }

    private func reveal(_ point: PuzzlePoint) {
        selected = point
        engine.reveal(at: point)
        print("[MinesweeperExample] reveal row=\(point.row) col=\(point.col) state=\(engine.state)")
    }

    private func flag(_ point: PuzzlePoint) {
        selected = point
        engine.toggleFlag(at: point)
        print("[MinesweeperExample] flag row=\(point.row) col=\(point.col) remaining=\(minesRemaining)")
    }

    private func activateSelected() {
        if flagMode {
            flag(selected)
        } else {
            reveal(selected)
        }
    }

    private func toggleSelectedFlag() {
        flag(selected)
    }

    private func moveSelection(_ direction: GridDirection) {
        let next = selected.moved(direction)
        guard engine.grid.contains(next) else { return }
        selected = next
    }

    private func newGame() {
        seed += 1
        engine = MinesweeperEngine(rows: 9, columns: 9, mineCount: 10, seed: seed)
        selected = PuzzlePoint(row: 0, col: 0)
        elapsedSeconds = 0
        flagMode = false
        print("[MinesweeperExample] new game seed=\(seed)")
    }

    private func accessibilityLabel(for point: PuzzlePoint, cell: MinesweeperCell) -> String {
        let coordinate = "row \(point.row + 1), column \(point.col + 1)"
        if cell.isFlagged { return "\(coordinate), flagged" }
        if !cell.isRevealed { return "\(coordinate), hidden" }
        if cell.hasMine { return "\(coordinate), mine" }
        return "\(coordinate), \(cell.adjacentMines) adjacent mines"
    }
}

private struct MinesweeperKeyboardCaptureView: NSViewRepresentable {
    var onReveal: () -> Void
    var onFlag: () -> Void
    var onReset: () -> Void
    var onMove: (GridDirection) -> Void

    func makeNSView(context: Context) -> KeyCatcherView {
        let view = KeyCatcherView()
        view.onReveal = onReveal
        view.onFlag = onFlag
        view.onReset = onReset
        view.onMove = onMove
        DispatchQueue.main.async {
            view.window?.makeFirstResponder(view)
        }
        return view
    }

    func updateNSView(_ nsView: KeyCatcherView, context: Context) {
        nsView.onReveal = onReveal
        nsView.onFlag = onFlag
        nsView.onReset = onReset
        nsView.onMove = onMove
        DispatchQueue.main.async {
            nsView.window?.makeFirstResponder(nsView)
        }
    }

    final class KeyCatcherView: NSView {
        var onReveal: (() -> Void)?
        var onFlag: (() -> Void)?
        var onReset: (() -> Void)?
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
            case 49:
                onReveal?()
            case 3:
                onFlag?()
            case 15:
                onReset?()
            case 123:
                onMove?(.left)
            case 124:
                onMove?(.right)
            case 125:
                onMove?(.down)
            case 126:
                onMove?(.up)
            default:
                return
            }
        }
    }
}
