import SwiftUI
import AppKit

struct ContentView: View {
    @State private var engine = GridAdventureEngine.pacmanArcadeMap()
    @State private var ghostsRunning = false
    @State private var status = "Eat pellets and dodge ghosts."

    @State private var ghostColorByID: [UUID: Color] = [:]

    private let timer = Timer.publish(every: 0.32, on: .main, in: .common).autoconnect()
    private let cellSize: CGFloat = 38
    private let cellGap: CGFloat = 1

    var body: some View {
        ZStack(alignment: .topLeading) {
            HStack(spacing: 24) {
                VStack(alignment: .leading, spacing: 18) {
                    header
                    mazeGrid
                    controls
                }

                sidePanel
                    .frame(width: 280)
            }
            .padding(28)

            PacManKeyboardCaptureView(
                onMove: moveHero,
                onReset: reset
            )
            .frame(width: 1, height: 1)
            .opacity(0.01)
            .accessibilityHidden(true)
        }
        .frame(minWidth: 1040, minHeight: 640)
        .background(Color(red: 0.02, green: 0.02, blue: 0.07))
        .onReceive(timer) { _ in
            stepGhosts()
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Pac-Man")
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                Text(status)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(statusColor)
            }

            Spacer()

            statBlock(label: "SCORE", value: "\(engine.score)")
            statBlock(label: "LIVES", value: "\(engine.lives)")
        }
        .frame(width: boardWidth)
        .frame(maxHeight: 44)
    }

    private var mazeGrid: some View {
        let columns = Array(repeating: GridItem(.fixed(cellSize), spacing: cellGap), count: engine.map.columns)
        return LazyVGrid(columns: columns, spacing: cellGap) {
            ForEach(engine.map.allPoints(), id: \.self) { point in
                cell(point)
            }
        }
        .padding(12)
        .fixedSize()
        .background(Color.black)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.blue.opacity(0.8), lineWidth: 2)
        }
    }

    private var controls: some View {
        HStack(spacing: 12) {
            Button(ghostsRunning ? "Pause Ghosts" : "Start Ghosts") {
                ghostsRunning.toggle()
                status = ghostsRunning ? "Ghosts are moving." : "Ghosts paused."
            }
            .disabled(engine.phase != .playing)

            Button("Reset") {
                reset()
            }
            .buttonStyle(.borderedProminent)

            Spacer()

            Text("Arrow keys move - collect all pellets - R reset")
                .font(.callout.weight(.semibold))
                .foregroundStyle(.white.opacity(0.62))
        }
        .frame(width: boardWidth)
    }

    private var sidePanel: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Maze")
                .font(.title2.bold())
                .foregroundStyle(.white)

            VStack(alignment: .leading, spacing: 12) {
                metricRow(label: "Pellets", value: "\(pelletCount)")
                metricRow(label: "Ghosts", value: "\(engine.actors.filter { $0.kind == .enemy }.count)")
                metricRow(label: "Phase", value: phaseLabel)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 8) {
                Text("Rule")
                    .font(.headline)
                    .foregroundStyle(.white)
                Text("Pellets add score. Ghost collisions cost a life and respawn the player. Clear the maze to win.")
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.66))
            }

            Spacer()
        }
        .padding(20)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Color.white.opacity(0.09))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var boardWidth: CGFloat {
        CGFloat(engine.map.columns) * cellSize + CGFloat(engine.map.columns - 1) * cellGap + 24
    }

    private var statusColor: Color {
        switch engine.phase {
        case .won: return .green
        case .lost: return .red
        default: return ghostsRunning ? .yellow : .cyan
        }
    }

    private var pelletCount: Int {
        engine.actors.filter { $0.kind == .pellet }.count
    }

    private var phaseLabel: String {
        switch engine.phase {
        case .ready: return "Ready"
        case .playing: return ghostsRunning ? "Chase" : "Waiting"
        case .won: return "Cleared"
        case .lost: return "Lost"
        }
    }

    private func statBlock(label: String, value: String) -> some View {
        HStack(spacing: 6) {
            Text(label)
                .font(.caption2.weight(.black))
                .foregroundStyle(.white.opacity(0.55))
            Text(value)
                .font(.system(size: 18, weight: .heavy, design: .rounded))
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

    private func cell(_ point: PuzzlePoint) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 6)
                .fill(tileColor(engine.map[point]))
                .overlay {
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(engine.map[point] == .wall ? Color.blue : Color.blue.opacity(0.15), lineWidth: engine.map[point] == .wall ? 2 : 1)
                }

            ForEach(actors(at: point)) { actor in
                actorView(actor)
            }
        }
        .frame(width: cellSize, height: cellSize)
    }

    private func actorView(_ actor: AdventureActor) -> some View {
        Group {
            switch actor.kind {
            case .hero:
                PacMouthShape()
                    .fill(Color.yellow.gradient)
                    .frame(width: cellSize * 0.78, height: cellSize * 0.78)
                    .rotationEffect(rotation(for: actor.direction))
                    .shadow(color: .yellow.opacity(0.35), radius: 6)
            case .enemy:
                let color = actor.frightenedTicks > 0 ? Color.blue.opacity(0.75) : ghostColor(actor)
                GhostShape()
                    .fill(color.gradient)
                    .frame(width: cellSize * 0.74, height: cellSize * 0.74)
                    .shadow(color: color.opacity(0.4), radius: 6)
            case .pellet:
                Circle()
                    .fill(Color.white.opacity(0.92))
                    .frame(width: 5, height: 5)
            case .powerPellet:
                Circle()
                    .fill(Color.white)
                    .frame(width: 14, height: 14)
                    .shadow(color: .white.opacity(0.6), radius: 4)
            case .fruit:
                Image(systemName: "applelogo")
                    .font(.system(size: cellSize * 0.6, weight: .black))
                    .foregroundStyle(Color.red.gradient)
                    .shadow(color: .red.opacity(0.45), radius: 4)
            default:
                Circle()
                    .fill(Color.white)
                    .frame(width: 12, height: 12)
            }
        }
    }

    private func tileColor(_ tile: AdventureTile) -> Color {
        switch tile {
        case .wall: return Color(red: 0.03, green: 0.08, blue: 0.35)
        default: return Color.black
        }
    }

    private func ghostColor(_ actor: AdventureActor) -> Color {
        if let known = ghostColorByID[actor.id] { return known }
        let palette: [Color] = [.red, .pink, .cyan, .orange]
        let assigned = palette[ghostColorByID.count % palette.count]
        DispatchQueue.main.async {
            if ghostColorByID[actor.id] == nil {
                ghostColorByID[actor.id] = assigned
            }
        }
        return assigned
    }

    private func rotation(for direction: GridDirection) -> Angle {
        switch direction {
        case .right: return .degrees(0)
        case .down: return .degrees(90)
        case .left: return .degrees(180)
        case .up: return .degrees(270)
        }
    }

    private func actors(at point: PuzzlePoint) -> [AdventureActor] {
        engine.actors.filter { $0.position == point }
    }

    private func moveHero(_ direction: GridDirection) {
        guard engine.phase == .playing else { return }
        let scoreBefore = engine.score
        let livesBefore = engine.lives
        ghostsRunning = true
        engine.moveHero(direction)

        if engine.phase == .won {
            ghostsRunning = false
            status = "Maze cleared."
        } else if engine.phase == .lost {
            ghostsRunning = false
            status = "No lives left."
        } else if engine.lives < livesBefore {
            status = "Ghost hit. Respawned."
        } else if engine.score > scoreBefore {
            status = "Pellet eaten. Score \(engine.score)."
        } else {
            status = "Keep moving."
        }
        print("[PacManExample] move \(direction.rawValue) score=\(engine.score) lives=\(engine.lives) pellets=\(pelletCount)")
    }

    private func stepGhosts() {
        guard ghostsRunning, engine.phase == .playing else { return }
        let livesBefore = engine.lives
        engine.stepTraffic()
        if engine.phase == .lost {
            ghostsRunning = false
            status = "No lives left."
        } else if engine.lives < livesBefore {
            status = "Ghost collision. Respawned."
        } else {
            status = "Ghosts are moving."
        }
    }

    private func reset() {
        engine = GridAdventureEngine.pacmanArcadeMap()
        ghostColorByID = [:]
        ghostsRunning = false
        status = "Eat pellets and dodge ghosts."
        print("[PacManExample] reset")
    }
}

private struct PacMouthShape: Shape {
    func path(in rect: CGRect) -> Path {
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let radius = min(rect.width, rect.height) / 2
        var path = Path()
        path.move(to: center)
        path.addArc(center: center, radius: radius, startAngle: .degrees(32), endAngle: .degrees(328), clockwise: false)
        path.closeSubpath()
        return path
    }
}

private struct GhostShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let radius = rect.width / 2
        path.addArc(center: CGPoint(x: rect.midX, y: rect.minY + radius), radius: radius, startAngle: .degrees(180), endAngle: .degrees(0), clockwise: false)
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.midX + rect.width * 0.18, y: rect.maxY - rect.height * 0.16))
        path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.midX - rect.width * 0.18, y: rect.maxY - rect.height * 0.16))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}

private struct PacManKeyboardCaptureView: NSViewRepresentable {
    var onMove: (GridDirection) -> Void
    var onReset: () -> Void

    func makeNSView(context: Context) -> PacManKeyCatcherView {
        let view = PacManKeyCatcherView()
        view.onMove = onMove
        view.onReset = onReset
        DispatchQueue.main.async {
            view.window?.makeFirstResponder(view)
        }
        return view
    }

    func updateNSView(_ nsView: PacManKeyCatcherView, context: Context) {
        nsView.onMove = onMove
        nsView.onReset = onReset
        DispatchQueue.main.async {
            nsView.window?.makeFirstResponder(nsView)
        }
    }
}

private final class PacManKeyCatcherView: NSView {
    var onMove: ((GridDirection) -> Void)?
    var onReset: (() -> Void)?

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
        default:
            if event.charactersIgnoringModifiers?.lowercased() == "r" {
                onReset?()
            }
        }
    }
}
