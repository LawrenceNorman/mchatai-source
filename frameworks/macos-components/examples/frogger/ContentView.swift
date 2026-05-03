import SwiftUI
import AppKit

struct ContentView: View {
    @State private var engine = GridAdventureEngine.froggerLaneMap()
    @State private var trafficRunning = false
    @State private var status = "Use arrow keys to cross."

    private let timer = Timer.publish(every: 0.55, on: .main, in: .common).autoconnect()
    private let cellSize: CGFloat = 64
    private let cellGap: CGFloat = 4

    var body: some View {
        ZStack(alignment: .topLeading) {
            HStack(spacing: 24) {
                VStack(alignment: .leading, spacing: 18) {
                    header
                    froggerGrid
                    controls
                }

                sidePanel
                    .frame(width: 280)
            }
            .padding(28)

            FroggerKeyboardCaptureView(
                onMove: moveHero,
                onReset: reset
            )
            .frame(width: 1, height: 1)
            .opacity(0.01)
            .accessibilityHidden(true)
        }
        .frame(minWidth: 980, minHeight: 700)
        .background(
            LinearGradient(
                colors: [
                    Color(red: 0.03, green: 0.08, blue: 0.05),
                    Color(red: 0.04, green: 0.1, blue: 0.16)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .onReceive(timer) { _ in
            stepTraffic()
        }
    }

    private var header: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Native Frogger")
                    .font(.system(size: 40, weight: .black, design: .rounded))
                    .foregroundStyle(.white)
                Text(status)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(statusColor)
            }

            Spacer()

            statBlock(label: "SCORE", value: "\(engine.score)")
            statBlock(label: "LIVES", value: "\(engine.lives)")
        }
        .frame(width: boardWidth)
    }

    private var froggerGrid: some View {
        let columns = Array(repeating: GridItem(.fixed(cellSize), spacing: cellGap), count: engine.map.columns)
        return LazyVGrid(columns: columns, spacing: cellGap) {
            ForEach(engine.map.allPoints(), id: \.self) { point in
                tileView(point)
            }
        }
        .padding(12)
        .fixedSize()
        .background(Color.black.opacity(0.32))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .stroke(.white.opacity(0.15), lineWidth: 1)
        }
    }

    private var controls: some View {
        HStack(spacing: 12) {
            Button(trafficRunning ? "Pause Traffic" : "Start Traffic") {
                trafficRunning.toggle()
                status = trafficRunning ? "Traffic is moving." : "Traffic paused."
            }
            .disabled(engine.phase != .playing)

            Button("Reset") {
                reset()
            }
            .buttonStyle(.borderedProminent)

            Spacer()

            Text("Arrow keys move - reach the top row - R reset")
                .font(.callout.weight(.semibold))
                .foregroundStyle(.white.opacity(0.62))
        }
        .frame(width: boardWidth)
    }

    private var sidePanel: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Crossing")
                .font(.title2.bold())
                .foregroundStyle(.white)

            VStack(alignment: .leading, spacing: 12) {
                legendRow(color: .green, label: "Safe grass")
                legendRow(color: .gray, label: "Road traffic")
                legendRow(color: .blue, label: "Water needs a log")
                legendRow(color: .yellow, label: "Goal row")
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 8) {
                Text("Actors")
                    .font(.headline)
                    .foregroundStyle(.white)
                metricRow(label: "Vehicles", value: "\(engine.actors.filter { $0.kind == .vehicle }.count)")
                metricRow(label: "Logs", value: "\(engine.actors.filter { $0.kind == .log }.count)")
                metricRow(label: "Phase", value: phaseLabel)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Rule")
                    .font(.headline)
                    .foregroundStyle(.white)
                Text("Road traffic costs a life. Water is safe only when the hero lands on a moving log.")
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

    private var boardWidth: CGFloat {
        CGFloat(engine.map.columns) * cellSize + CGFloat(engine.map.columns - 1) * cellGap + 24
    }

    private var statusColor: Color {
        switch engine.phase {
        case .won: return .green
        case .lost: return .red
        default: return trafficRunning ? .yellow : .cyan
        }
    }

    private var phaseLabel: String {
        switch engine.phase {
        case .ready: return "Ready"
        case .playing: return trafficRunning ? "Moving" : "Waiting"
        case .won: return "Home"
        case .lost: return "Lost"
        }
    }

    private func statBlock(label: String, value: String) -> some View {
        VStack(alignment: .trailing, spacing: 2) {
            Text(label)
                .font(.caption.weight(.black))
                .foregroundStyle(.white.opacity(0.52))
            Text(value)
                .font(.system(size: 32, weight: .black, design: .rounded))
                .foregroundStyle(.white)
                .monospacedDigit()
        }
    }

    private func legendRow(color: Color, label: String) -> some View {
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 5)
                .fill(color.opacity(0.75))
                .frame(width: 28, height: 18)
            Text(label)
                .font(.headline)
                .foregroundStyle(.white.opacity(0.82))
        }
    }

    private func metricRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .foregroundStyle(.white.opacity(0.66))
            Spacer()
            Text(value)
                .foregroundStyle(.white)
                .monospacedDigit()
        }
        .font(.headline)
    }

    private func tileView(_ point: PuzzlePoint) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8)
                .fill(tileColor(engine.map[point]))
                .overlay {
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(.white.opacity(0.08), lineWidth: 1)
                }

            ForEach(actors(at: point)) { actor in
                actorView(actor)
            }
        }
        .frame(width: cellSize, height: cellSize)
        .accessibilityLabel("Row \(point.row + 1), column \(point.col + 1)")
    }

    private func actorView(_ actor: AdventureActor) -> some View {
        Group {
            switch actor.kind {
            case .hero:
                ZStack {
                    Circle()
                        .fill(Color.green.gradient)
                    Image(systemName: "figure.walk.circle.fill")
                        .font(.title2.bold())
                        .foregroundStyle(.white)
                }
                .frame(width: 42, height: 42)
            case .vehicle:
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color.red.gradient)
                    .frame(width: 52, height: 30)
            case .log:
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color(red: 0.55, green: 0.32, blue: 0.13).gradient)
                    .frame(width: 58, height: 26)
            default:
                Circle()
                    .fill(.white)
                    .frame(width: 18, height: 18)
            }
        }
        .shadow(color: .black.opacity(0.25), radius: 4, x: 0, y: 2)
    }

    private func tileColor(_ tile: AdventureTile) -> Color {
        switch tile {
        case .floor: return Color(red: 0.1, green: 0.36, blue: 0.18)
        case .wall: return Color(red: 0.1, green: 0.1, blue: 0.12)
        case .road: return Color(red: 0.22, green: 0.23, blue: 0.25)
        case .water: return Color(red: 0.08, green: 0.23, blue: 0.56)
        case .exit: return Color(red: 0.46, green: 0.36, blue: 0.05)
        }
    }

    private func actors(at point: PuzzlePoint) -> [AdventureActor] {
        engine.actors.filter { $0.position == point }
    }

    private func moveHero(_ direction: GridDirection) {
        guard engine.phase == .playing else { return }
        let livesBefore = engine.lives
        trafficRunning = true
        engine.moveHero(direction)

        if engine.phase == .won {
            trafficRunning = false
            status = "Home safe. Score \(engine.score)."
        } else if engine.phase == .lost {
            trafficRunning = false
            status = "No lives left."
        } else if engine.lives < livesBefore {
            status = "Hit hazard. Respawned with \(engine.lives) lives."
        } else if heroOnLog {
            status = "Riding a moving log."
        } else {
            status = "Keep crossing."
        }
        print("[FroggerExample] move \(direction.rawValue) score=\(engine.score) lives=\(engine.lives) phase=\(engine.phase.rawValue)")
    }

    private var heroOnLog: Bool {
        guard let hero = engine.hero else { return false }
        return engine.actors.contains { $0.kind == .log && $0.position == hero.position }
    }

    private func stepTraffic() {
        guard trafficRunning, engine.phase == .playing else { return }
        let livesBefore = engine.lives
        engine.stepTraffic()
        if engine.phase == .lost {
            trafficRunning = false
            status = "No lives left."
        } else if engine.lives < livesBefore {
            status = "Hazard collision. Respawned."
        } else if heroOnLog {
            status = "Log carried you sideways."
        } else {
            status = "Traffic is moving."
        }
    }

    private func reset() {
        engine = GridAdventureEngine.froggerLaneMap()
        trafficRunning = false
        status = "Use arrow keys to cross."
        print("[FroggerExample] reset")
    }
}

private struct FroggerKeyboardCaptureView: NSViewRepresentable {
    var onMove: (GridDirection) -> Void
    var onReset: () -> Void

    func makeNSView(context: Context) -> FroggerKeyCatcherView {
        let view = FroggerKeyCatcherView()
        view.onMove = onMove
        view.onReset = onReset
        DispatchQueue.main.async {
            view.window?.makeFirstResponder(view)
        }
        return view
    }

    func updateNSView(_ nsView: FroggerKeyCatcherView, context: Context) {
        nsView.onMove = onMove
        nsView.onReset = onReset
        DispatchQueue.main.async {
            nsView.window?.makeFirstResponder(nsView)
        }
    }
}

private final class FroggerKeyCatcherView: NSView {
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
