import SwiftUI
import AppKit

enum TowerDefenseBoard {
    static let rows = 8
    static let columns = 8
    static let defaultPath = [
        PuzzlePoint(row: 4, col: 0),
        PuzzlePoint(row: 4, col: 1),
        PuzzlePoint(row: 4, col: 2),
        PuzzlePoint(row: 4, col: 3),
        PuzzlePoint(row: 3, col: 3),
        PuzzlePoint(row: 2, col: 3),
        PuzzlePoint(row: 2, col: 4),
        PuzzlePoint(row: 2, col: 5),
        PuzzlePoint(row: 2, col: 6),
        PuzzlePoint(row: 2, col: 7)
    ]
}

struct ContentView: View {
    @State private var engine = TowerDefenseEngine(path: TowerDefenseBoard.defaultPath)
    @State private var selected = PuzzlePoint(row: 3, col: 1)
    @State private var status = "Place towers, then start the wave."

    private let timer = Timer.publish(every: 0.12, on: .main, in: .common).autoconnect()
    private let cellSize: CGFloat = 62
    private let cellGap: CGFloat = 5
    private let boardPadding: CGFloat = 12

    var body: some View {
        ZStack(alignment: .topLeading) {
            HStack(spacing: 24) {
                VStack(alignment: .leading, spacing: 18) {
                    header
                    battlefield
                    controls
                }

                sidePanel
                    .frame(width: 300)
            }
            .padding(28)

            TowerDefenseKeyboardCaptureView(
                onPlaceTower: placeSelectedTower,
                onStartWave: startWave,
                onReset: newGame,
                onMove: moveSelection
            )
            .frame(width: 1, height: 1)
            .opacity(0.01)
            .accessibilityHidden(true)
        }
        .frame(minWidth: 940, minHeight: 710)
        .background(
            LinearGradient(
                colors: [
                    Color(red: 0.07, green: 0.11, blue: 0.16),
                    Color(red: 0.02, green: 0.06, blue: 0.05)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .onReceive(timer) { _ in
            tick()
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Native Tower Defense")
                .font(.system(size: 36, weight: .black, design: .rounded))
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.78)

            HStack(alignment: .bottom) {
                Text(status)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(statusColor)
                    .lineLimit(2)
                    .frame(maxWidth: 260, alignment: .leading)

                Spacer()

                statBlock(label: "WAVE", value: "\(engine.wave)")
                statBlock(label: "LIVES", value: "\(engine.lives)")
                statBlock(label: "CREDITS", value: "$\(engine.credits)")
            }
        }
        .frame(width: boardWidth, alignment: .leading)
    }

    private var battlefield: some View {
        ZStack(alignment: .topLeading) {
            boardGrid

            pathLine

            ForEach(engine.enemies) { enemy in
                enemyView(enemy)
                    .position(enemyCenter(enemy))
            }
        }
        .padding(boardPadding)
        .frame(width: boardWidth, height: boardHeight)
        .background(Color.black.opacity(0.32))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .stroke(.white.opacity(0.16), lineWidth: 1)
        }
    }

    private var boardGrid: some View {
        let columns = Array(repeating: GridItem(.fixed(cellSize), spacing: cellGap), count: TowerDefenseBoard.columns)
        return LazyVGrid(columns: columns, spacing: cellGap) {
            ForEach(allPoints, id: \.self) { point in
                cellButton(point)
            }
        }
        .fixedSize()
    }

    private var pathLine: some View {
        Canvas { context, _ in
            guard let first = TowerDefenseBoard.defaultPath.first else { return }
            var path = Path()
            path.move(to: cellCenter(first))
            for point in TowerDefenseBoard.defaultPath.dropFirst() {
                path.addLine(to: cellCenter(point))
            }
            context.stroke(path, with: .color(.yellow.opacity(0.42)), style: StrokeStyle(lineWidth: 10, lineCap: .round, lineJoin: .round))
        }
        .allowsHitTesting(false)
    }

    private var controls: some View {
        HStack(spacing: 12) {
            Button("Place Tower") {
                placeSelectedTower()
            }
            .buttonStyle(.borderedProminent)
            .disabled(!canPlaceTower(at: selected))

            Button(engine.phase == .playing ? "Wave Running" : "Start Wave") {
                startWave()
            }
            .disabled(engine.phase == .playing || engine.phase == .lost)

            Button("Reset") {
                newGame()
            }

            Spacer()

            Text("Arrows move - Return place - Space wave - R reset")
                .font(.callout.weight(.semibold))
                .foregroundStyle(.white.opacity(0.58))
        }
        .frame(width: boardWidth)
    }

    private var sidePanel: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Command")
                    .font(.title2.bold())
                    .foregroundStyle(.white)
                Text(phaseLabel)
                    .font(.system(size: 30, weight: .black, design: .rounded))
                    .foregroundStyle(statusColor)
            }

            VStack(alignment: .leading, spacing: 12) {
                metricRow(label: "Towers", value: "\(engine.towers.count)")
                metricRow(label: "Enemies", value: "\(engine.enemies.count)")
                metricRow(label: "Path", value: "\(engine.path.count) nodes")
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 8) {
                Text("Selected Tile")
                    .font(.headline)
                    .foregroundStyle(.white)
                Text("Row \(selected.row + 1), Col \(selected.col + 1)")
                    .font(.title3.bold())
                    .foregroundStyle(.white.opacity(0.84))
                Text(selectedHint)
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.62))
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Towers")
                    .font(.headline)
                    .foregroundStyle(.white)
                Text("Each tower costs $25, targets enemies in range, and earns credits for defeated enemies.")
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.62))
            }

            Spacer()
        }
        .padding(20)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Color.white.opacity(0.09))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var statusColor: Color {
        switch engine.phase {
        case .ready: return .cyan
        case .playing: return .yellow
        case .won: return .green
        case .lost: return .red
        }
    }

    private var phaseLabel: String {
        switch engine.phase {
        case .ready: return "Ready"
        case .playing: return "Wave \(engine.wave)"
        case .won: return "Wave Cleared"
        case .lost: return "Base Breached"
        }
    }

    private var selectedHint: String {
        if isPath(selected) { return "Path tiles cannot hold towers." }
        if engine.towers.contains(where: { $0.position == selected }) { return "Tower already placed here." }
        if engine.credits < 25 { return "Need $25 to place a tower." }
        return "Ready for a tower."
    }

    private var boardWidth: CGFloat {
        boardPadding * 2 + CGFloat(TowerDefenseBoard.columns) * cellSize + CGFloat(TowerDefenseBoard.columns - 1) * cellGap
    }

    private var boardHeight: CGFloat {
        boardPadding * 2 + CGFloat(TowerDefenseBoard.rows) * cellSize + CGFloat(TowerDefenseBoard.rows - 1) * cellGap
    }

    private var allPoints: [PuzzlePoint] {
        (0..<TowerDefenseBoard.rows).flatMap { row in
            (0..<TowerDefenseBoard.columns).map { col in PuzzlePoint(row: row, col: col) }
        }
    }

    private func statBlock(label: String, value: String) -> some View {
        VStack(alignment: .trailing, spacing: 2) {
            Text(label)
                .font(.caption.weight(.black))
                .foregroundStyle(.white.opacity(0.52))
            Text(value)
                .font(.system(size: 28, weight: .black, design: .rounded))
                .foregroundStyle(.white)
                .monospacedDigit()
        }
    }

    private func metricRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .foregroundStyle(.white.opacity(0.68))
            Spacer()
            Text(value)
                .foregroundStyle(.white)
                .monospacedDigit()
        }
        .font(.headline)
    }

    private func cellButton(_ point: PuzzlePoint) -> some View {
        let hasTower = engine.towers.contains(where: { $0.position == point })
        let pathTile = isPath(point)
        let isSelected = point == selected

        return Button {
            selected = point
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(cellFill(pathTile: pathTile))
                    .overlay {
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(isSelected ? .cyan : .white.opacity(0.1), lineWidth: isSelected ? 4 : 1)
                    }

                if hasTower {
                    Image(systemName: "scope")
                        .font(.system(size: 24, weight: .black))
                        .foregroundStyle(.white)
                } else if pathTile {
                    Circle()
                        .fill(.yellow.opacity(0.22))
                        .frame(width: 16, height: 16)
                }
            }
            .frame(width: cellSize, height: cellSize)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Row \(point.row + 1), column \(point.col + 1)")
    }

    private func enemyView(_ enemy: TowerDefenseEnemy) -> some View {
        ZStack {
            Circle()
                .fill(Color.red.gradient)
                .frame(width: 30, height: 30)
                .shadow(color: .red.opacity(0.4), radius: 8)
            Text("\(max(Int(enemy.health.rounded()), 0))")
                .font(.caption2.weight(.black))
                .foregroundStyle(.white)
                .monospacedDigit()
        }
    }

    private func cellFill(pathTile: Bool) -> Color {
        pathTile ? Color(red: 0.45, green: 0.33, blue: 0.16) : Color(red: 0.12, green: 0.32, blue: 0.22)
    }

    private func isPath(_ point: PuzzlePoint) -> Bool {
        TowerDefenseBoard.defaultPath.contains(point)
    }

    private func canPlaceTower(at point: PuzzlePoint) -> Bool {
        !isPath(point) && engine.credits >= 25 && !engine.towers.contains(where: { $0.position == point })
    }

    private func placeSelectedTower() {
        guard canPlaceTower(at: selected) else {
            status = selectedHint
            return
        }

        if engine.placeTower(at: selected) {
            status = "Tower placed at row \(selected.row + 1), col \(selected.col + 1)."
            print("[TowerDefenseExample] tower row=\(selected.row) col=\(selected.col) credits=\(engine.credits)")
        }
    }

    private func startWave() {
        guard engine.phase != .playing, engine.phase != .lost else { return }
        engine.startWave(count: 7 + engine.wave)
        status = "Wave \(engine.wave) incoming."
        print("[TowerDefenseExample] start wave=\(engine.wave) enemies=\(engine.enemies.count)")
    }

    private func tick() {
        guard engine.phase == .playing else { return }
        engine.update(dt: 0.12)
        switch engine.phase {
        case .won:
            status = "Wave \(engine.wave) cleared. Place upgrades or start another."
            print("[TowerDefenseExample] wave cleared credits=\(engine.credits) lives=\(engine.lives)")
        case .lost:
            status = "Base breached. Reset to try again."
            print("[TowerDefenseExample] lost wave=\(engine.wave)")
        default:
            status = "Wave \(engine.wave): \(engine.enemies.count) enemies on path."
        }
    }

    private func moveSelection(_ direction: GridDirection) {
        let next = selected.moved(direction)
        guard next.row >= 0, next.row < TowerDefenseBoard.rows, next.col >= 0, next.col < TowerDefenseBoard.columns else { return }
        selected = next
    }

    private func newGame() {
        engine = TowerDefenseEngine(path: TowerDefenseBoard.defaultPath)
        selected = PuzzlePoint(row: 3, col: 1)
        status = "Place towers, then start the wave."
        print("[TowerDefenseExample] new game")
    }

    private func cellCenter(_ point: PuzzlePoint) -> CGPoint {
        CGPoint(
            x: CGFloat(point.col) * (cellSize + cellGap) + cellSize / 2,
            y: CGFloat(point.row) * (cellSize + cellGap) + cellSize / 2
        )
    }

    private func enemyCenter(_ enemy: TowerDefenseEnemy) -> CGPoint {
        let progress = max(enemy.progress, 0)
        let lowerIndex = max(0, min(engine.path.count - 1, Int(progress.rounded(.down))))
        let upperIndex = min(engine.path.count - 1, lowerIndex + 1)
        let local = min(max(progress - Double(lowerIndex), 0), 1)
        let start = cellCenter(engine.path[lowerIndex])
        let end = cellCenter(engine.path[upperIndex])

        return CGPoint(
            x: boardPadding + start.x + (end.x - start.x) * local,
            y: boardPadding + start.y + (end.y - start.y) * local
        )
    }
}

private struct TowerDefenseKeyboardCaptureView: NSViewRepresentable {
    var onPlaceTower: () -> Void
    var onStartWave: () -> Void
    var onReset: () -> Void
    var onMove: (GridDirection) -> Void

    func makeNSView(context: Context) -> TowerDefenseKeyCatcherView {
        let view = TowerDefenseKeyCatcherView()
        view.onPlaceTower = onPlaceTower
        view.onStartWave = onStartWave
        view.onReset = onReset
        view.onMove = onMove
        DispatchQueue.main.async {
            view.window?.makeFirstResponder(view)
        }
        return view
    }

    func updateNSView(_ nsView: TowerDefenseKeyCatcherView, context: Context) {
        nsView.onPlaceTower = onPlaceTower
        nsView.onStartWave = onStartWave
        nsView.onReset = onReset
        nsView.onMove = onMove
        DispatchQueue.main.async {
            nsView.window?.makeFirstResponder(nsView)
        }
    }
}

private final class TowerDefenseKeyCatcherView: NSView {
    var onPlaceTower: (() -> Void)?
    var onStartWave: (() -> Void)?
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
        case 36:
            onPlaceTower?()
        case 49:
            onStartWave?()
        default:
            if event.charactersIgnoringModifiers?.lowercased() == "r" {
                onReset?()
            }
        }
    }
}
