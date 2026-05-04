// Example glue — adapt freely. SwiftUI Canvas host that:
//   1. Owns a GridAdventureEngine seeded from adventureCastleMap().
//   2. Reads arrow keys → engine.moveHero(direction).
//   3. Renders the grid map + actors via Canvas.
//   4. Shows VISIBLE Play Again button when phase becomes .lost or .won (mac-022).

import SwiftUI

struct ContentView: View {
    @State private var engine = GridAdventureEngine.adventureCastleMap()
    @FocusState private var hasKeyboardFocus: Bool

    private let cell: CGFloat = 28

    var body: some View {
        VStack(spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Castle Adventure")
                        .font(.system(size: 26, weight: .bold, design: .rounded))
                    Text(statusText)
                        .font(.callout.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text("LIVES \(engine.lives)   SCORE \(engine.score)")
                    .font(.system(size: 18, weight: .bold, design: .monospaced))
            }

            ZStack {
                Canvas { context, size in
                    drawScene(context: &context, size: size)
                }
                .background(Color(red: 0.06, green: 0.07, blue: 0.12))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay {
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(.white.opacity(0.14), lineWidth: 1)
                }
                .frame(
                    width: cell * CGFloat(engine.map.columns),
                    height: cell * CGFloat(engine.map.rows)
                )
                .contentShape(Rectangle())
                .onTapGesture { hasKeyboardFocus = true }

                if engine.phase == .lost || engine.phase == .won {
                    overlayCard
                }
            }

            HStack(spacing: 10) {
                Button("Restart") { resetGame() }
                Spacer()
                Text("Arrow keys — move hero · find the exit")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(20)
        .focusable()
        .focused($hasKeyboardFocus)
        .onAppear { hasKeyboardFocus = true }
        .onReceive(NotificationCenter.default.publisher(for: .arcadeAdventureNewGame)) { _ in resetGame() }
        .onKeyPress(.upArrow, phases: .down)    { _ in engine.moveHero(.up); return .handled }
        .onKeyPress(.downArrow, phases: .down)  { _ in engine.moveHero(.down); return .handled }
        .onKeyPress(.leftArrow, phases: .down)  { _ in engine.moveHero(.left); return .handled }
        .onKeyPress(.rightArrow, phases: .down) { _ in engine.moveHero(.right); return .handled }
        .onKeyPress(.return, phases: .down) { _ in
            if engine.phase != .playing { resetGame() }
            return .handled
        }
    }

    private var statusText: String {
        switch engine.phase {
        case .playing: return "Find the exit"
        case .won:     return "You escaped!"
        case .lost:    return "Defeated"
        case .ready:   return "Ready"
        }
    }

    @ViewBuilder
    private var overlayCard: some View {
        VStack(spacing: 12) {
            Text(engine.phase == .won ? "YOU ESCAPED" : "GAME OVER")
                .font(.system(size: 36, weight: .black, design: .rounded))
                .foregroundStyle(.white)
            Text("Final score: \(engine.score)")
                .font(.title3.monospacedDigit())
                .foregroundStyle(.white.opacity(0.85))
            Button {
                resetGame()
            } label: {
                Text("Play Again")
                    .font(.title3.bold())
                    .padding(.horizontal, 26)
                    .padding(.vertical, 8)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .keyboardShortcut(.return, modifiers: [])
        }
        .padding(24)
        .background(.black.opacity(0.85))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func resetGame() {
        engine = GridAdventureEngine.adventureCastleMap()
    }

    // MARK: - Rendering

    private func drawScene(context: inout GraphicsContext, size: CGSize) {
        for r in 0..<engine.map.rows {
            for c in 0..<engine.map.columns {
                let pt = PuzzlePoint(row: r, col: c)
                let tile = engine.map[pt]
                let rect = CGRect(
                    x: CGFloat(c) * cell,
                    y: CGFloat(r) * cell,
                    width: cell,
                    height: cell
                )
                let color: Color
                switch tile {
                case .wall:  color = Color(red: 0.20, green: 0.18, blue: 0.30)
                case .floor: color = Color(red: 0.10, green: 0.13, blue: 0.20)
                case .water: color = Color(red: 0.10, green: 0.30, blue: 0.55)
                case .road:  color = Color(red: 0.14, green: 0.14, blue: 0.16)
                case .exit:  color = Color(red: 0.20, green: 0.62, blue: 0.30)
                }
                context.fill(Path(rect), with: .color(color))
            }
        }

        // Actors
        for actor in engine.actors {
            let rect = CGRect(
                x: CGFloat(actor.position.col) * cell + 4,
                y: CGFloat(actor.position.row) * cell + 4,
                width: cell - 8,
                height: cell - 8
            )
            let color: Color
            switch actor.kind {
            case .hero:        color = .yellow
            case .enemy:       color = .red
            case .treasure:    color = .orange
            case .key:         color = .mint
            case .vehicle:     color = .gray
            case .log:         color = .brown
            case .pellet, .powerPellet, .fruit:
                                color = .white
            }
            context.fill(Path(roundedRect: rect, cornerRadius: 6), with: .color(color))
        }
    }
}
