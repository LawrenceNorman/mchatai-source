import SwiftUI
import AppKit

struct ContentView: View {
    @State private var engine = Match3Engine(rows: 8, columns: 8, seed: 300)
    @State private var selected = PuzzlePoint(row: 0, col: 0)
    @State private var armedTile: PuzzlePoint?
    @State private var hintPair: (PuzzlePoint, PuzzlePoint)?
    @State private var status = "Swap adjacent candies to clear matches."
    @State private var moves = 0
    @State private var lastClearCount = 0
    @State private var seed: UInt64 = 300

    private let goalScore = 800

    var body: some View {
        ZStack(alignment: .topLeading) {
            HStack(spacing: 24) {
                VStack(alignment: .leading, spacing: 18) {
                    header
                    candyGrid
                }

                controlPanel
                    .frame(width: 290)
            }
            .padding(28)

            Match3KeyboardCaptureView(
                onChoose: chooseSelected,
                onHint: showHint,
                onPlayHint: playHint,
                onReset: newGame,
                onMove: moveSelection
            )
            .frame(width: 1, height: 1)
            .opacity(0.01)
            .accessibilityHidden(true)
        }
        .frame(minWidth: 940, minHeight: 700)
        .background(
            LinearGradient(
                colors: [
                    Color(red: 0.08, green: 0.09, blue: 0.14),
                    Color(red: 0.05, green: 0.02, blue: 0.09)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
    }

    private var header: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Native Candy Match")
                    .font(.system(size: 42, weight: .black, design: .rounded))
                    .foregroundStyle(.white)
                Text(status)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(statusColor)
            }

            Spacer()

            statBlock(label: "SCORE", value: "\(engine.score)")
            statBlock(label: "MOVES", value: "\(moves)")
        }
        .frame(width: 576)
    }

    private var candyGrid: some View {
        let columns = Array(repeating: GridItem(.fixed(66), spacing: 6), count: engine.grid.columns)
        return LazyVGrid(columns: columns, spacing: 6) {
            ForEach(engine.grid.allPoints(), id: \.self) { point in
                tileButton(point)
            }
        }
        .padding(12)
        .fixedSize()
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.black.opacity(0.36))
        )
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .stroke(.white.opacity(0.16), lineWidth: 1)
        }
    }

    private var controlPanel: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Goal")
                    .font(.title2.bold())
                    .foregroundStyle(.white)
                ProgressView(value: Double(min(engine.score, goalScore)), total: Double(goalScore))
                    .tint(.pink)
                Text("\(max(goalScore - engine.score, 0)) points remaining")
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.62))
            }

            VStack(alignment: .leading, spacing: 10) {
                Text("Last Clear")
                    .font(.headline)
                    .foregroundStyle(.white)
                Text(lastClearCount == 0 ? "No cascade yet" : "\(lastClearCount) candies cleared")
                    .font(.system(size: 24, weight: .black, design: .rounded))
                    .foregroundStyle(.white)
                    .monospacedDigit()
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 10) {
                Text("Candy Set")
                    .font(.headline)
                    .foregroundStyle(.white)

                LazyVGrid(columns: Array(repeating: GridItem(.fixed(58), spacing: 10), count: 3), spacing: 10) {
                    ForEach(engine.symbols, id: \.self) { symbol in
                        candyPreview(symbol: symbol)
                    }
                }
            }

            HStack {
                Button("Hint") {
                    showHint()
                }
                Button("Swap Hint") {
                    playHint()
                }
                .buttonStyle(.borderedProminent)
            }

            Button("New Game") {
                newGame()
            }

            Spacer()

            Text("Arrows move - Return selects/swaps - H hint - R reset")
                .font(.callout.weight(.semibold))
                .foregroundStyle(.white.opacity(0.58))
        }
        .padding(20)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Color.white.opacity(0.09))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var statusColor: Color {
        if engine.score >= goalScore { return .green }
        if lastClearCount > 0 { return .pink }
        return .white.opacity(0.74)
    }

    private func statBlock(label: String, value: String) -> some View {
        VStack(alignment: .trailing, spacing: 2) {
            Text(label)
                .font(.caption.weight(.black))
                .foregroundStyle(.white.opacity(0.54))
            Text(value)
                .font(.system(size: 34, weight: .black, design: .rounded))
                .foregroundStyle(.white)
                .monospacedDigit()
        }
    }

    private func tileButton(_ point: PuzzlePoint) -> some View {
        let tile = engine.grid[point]
        let style = tileStyle(tile.symbol)
        let isSelected = point == selected
        let isArmed = point == armedTile
        let isHinted = pointInHint(point)

        return Button {
            choose(point)
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: 14)
                    .fill(style.color.gradient)
                    .overlay {
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(borderColor(selected: isSelected, armed: isArmed, hinted: isHinted), lineWidth: borderWidth(selected: isSelected, armed: isArmed, hinted: isHinted))
                    }
                    .shadow(color: style.color.opacity(0.34), radius: 9, x: 0, y: 5)

                Image(systemName: style.systemImage)
                    .font(.system(size: 31, weight: .black))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.22), radius: 2, x: 0, y: 2)
            }
            .frame(width: 66, height: 66)
            .scaleEffect(isArmed ? 1.05 : 1.0)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Candy \(tile.symbol), row \(point.row + 1), column \(point.col + 1)")
    }

    private func candyPreview(symbol: String) -> some View {
        let style = tileStyle(symbol)

        return ZStack {
            RoundedRectangle(cornerRadius: 12)
                .fill(style.color.gradient)
            Image(systemName: style.systemImage)
                .font(.title2.bold())
                .foregroundStyle(.white)
        }
        .frame(width: 54, height: 48)
    }

    private func borderColor(selected: Bool, armed: Bool, hinted: Bool) -> Color {
        if armed { return .white }
        if hinted { return .yellow }
        if selected { return .cyan }
        return .white.opacity(0.16)
    }

    private func borderWidth(selected: Bool, armed: Bool, hinted: Bool) -> CGFloat {
        if armed || hinted || selected { return 4 }
        return 1
    }

    private func tileStyle(_ symbol: String) -> (color: Color, systemImage: String) {
        switch symbol {
        case "A": return (Color(red: 0.96, green: 0.18, blue: 0.34), "heart.fill")
        case "B": return (Color(red: 0.15, green: 0.49, blue: 0.96), "drop.fill")
        case "C": return (Color(red: 0.13, green: 0.77, blue: 0.38), "leaf.fill")
        case "D": return (Color(red: 0.98, green: 0.69, blue: 0.12), "star.fill")
        case "E": return (Color(red: 0.68, green: 0.33, blue: 0.95), "diamond.fill")
        default: return (Color(red: 0.98, green: 0.42, blue: 0.15), "hexagon.fill")
        }
    }

    private func chooseSelected() {
        if hintPair != nil && armedTile != nil {
            playHint()
            return
        }
        choose(selected)
    }

    private func choose(_ point: PuzzlePoint) {
        selected = point

        guard let armed = armedTile else {
            armedTile = point
            status = "Choose an adjacent candy to swap."
            return
        }

        if armed == point {
            armedTile = nil
            status = "Selection cleared."
            return
        }

        guard areAdjacent(armed, point) else {
            armedTile = point
            status = "Choose an adjacent candy to swap."
            return
        }

        commitSwap(armed, point)
    }

    private func commitSwap(_ first: PuzzlePoint, _ second: PuzzlePoint) {
        let previousScore = engine.score
        let moved = engine.swap(first, second)
        armedTile = nil
        hintPair = nil
        selected = second

        guard moved else {
            lastClearCount = 0
            status = "No match. Swap rolled back."
            print("[Match3Example] rejected swap from \(first.row),\(first.col) to \(second.row),\(second.col)")
            return
        }

        moves += 1
        lastClearCount = max((engine.score - previousScore) / 10, 0)
        status = engine.score >= goalScore ? "Goal reached." : "Cascade cleared \(lastClearCount) candies."
        print("[Match3Example] swap from \(first.row),\(first.col) to \(second.row),\(second.col) score=\(engine.score) cleared=\(lastClearCount)")
    }

    private func showHint() {
        guard let pair = firstPlayableSwap() else {
            hintPair = nil
            armedTile = nil
            status = "No legal swap found. Start a fresh board."
            return
        }

        hintPair = pair
        selected = pair.0
        armedTile = pair.0
        status = "Hint ready. Return swaps the highlighted candies."
        print("[Match3Example] hint from \(pair.0.row),\(pair.0.col) to \(pair.1.row),\(pair.1.col)")
    }

    private func playHint() {
        if hintPair == nil {
            showHint()
        }

        guard let pair = hintPair else { return }
        commitSwap(pair.0, pair.1)
    }

    private func moveSelection(_ direction: GridDirection) {
        let next = selected.moved(direction)
        guard engine.grid.contains(next) else { return }
        selected = next
    }

    private func newGame() {
        seed += 1
        engine = Match3Engine(rows: 8, columns: 8, seed: seed)
        selected = PuzzlePoint(row: 0, col: 0)
        armedTile = nil
        hintPair = nil
        moves = 0
        lastClearCount = 0
        status = "New board. Swap adjacent candies to clear matches."
        print("[Match3Example] new game seed=\(seed)")
    }

    private func firstPlayableSwap() -> (PuzzlePoint, PuzzlePoint)? {
        for point in engine.grid.allPoints() {
            for direction in [GridDirection.right, .down] {
                let neighbor = point.moved(direction)
                guard engine.grid.contains(neighbor) else { continue }
                var probe = engine
                if probe.swap(point, neighbor) {
                    return (point, neighbor)
                }
            }
        }
        return nil
    }

    private func pointInHint(_ point: PuzzlePoint) -> Bool {
        guard let hintPair else { return false }
        return point == hintPair.0 || point == hintPair.1
    }

    private func areAdjacent(_ a: PuzzlePoint, _ b: PuzzlePoint) -> Bool {
        abs(a.row - b.row) + abs(a.col - b.col) == 1
    }
}

private struct Match3KeyboardCaptureView: NSViewRepresentable {
    var onChoose: () -> Void
    var onHint: () -> Void
    var onPlayHint: () -> Void
    var onReset: () -> Void
    var onMove: (GridDirection) -> Void

    func makeNSView(context: Context) -> Match3KeyCatcherView {
        let view = Match3KeyCatcherView()
        view.onChoose = onChoose
        view.onHint = onHint
        view.onPlayHint = onPlayHint
        view.onReset = onReset
        view.onMove = onMove
        DispatchQueue.main.async {
            view.window?.makeFirstResponder(view)
        }
        return view
    }

    func updateNSView(_ nsView: Match3KeyCatcherView, context: Context) {
        nsView.onChoose = onChoose
        nsView.onHint = onHint
        nsView.onPlayHint = onPlayHint
        nsView.onReset = onReset
        nsView.onMove = onMove
        DispatchQueue.main.async {
            nsView.window?.makeFirstResponder(nsView)
        }
    }
}

private final class Match3KeyCatcherView: NSView {
    var onChoose: (() -> Void)?
    var onHint: (() -> Void)?
    var onPlayHint: (() -> Void)?
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
        case 123:
            onMove?(.left)
        case 124:
            onMove?(.right)
        case 125:
            onMove?(.down)
        case 126:
            onMove?(.up)
        case 36, 49:
            onChoose?()
        default:
            handleCharacter(event.charactersIgnoringModifiers?.lowercased())
        }
    }

    private func handleCharacter(_ value: String?) {
        switch value {
        case "h":
            onHint?()
        case "p":
            onPlayHint?()
        case "r", "n":
            onReset?()
        default:
            break
        }
    }
}
