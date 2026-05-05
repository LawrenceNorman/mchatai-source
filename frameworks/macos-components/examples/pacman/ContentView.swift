import SwiftUI
import AppKit

struct ContentView: View {
    @State private var engine = GridAdventureEngine.pacmanArcadeMap()
    @State private var ghostsRunning = false
    @State private var status = "Eat pellets and dodge ghosts."

    @State private var ghostColorByID: [UUID: Color] = [:]

    /// Animation tuning — Pacman is mechanics-driven, .standard preset.
    private let intensity: AnimationIntensity = .standard

    /// SFX engine. Pellet = soft tick, power pellet = "power up" chord,
    /// fruit = victory ping, ghost eaten = burst, hero death = explosion,
    /// maze clear = victory + level-up.
    @ObservedObject private var sound = SoundEngine.shared

    /// LevelManager — tracks current level (= maze clear count). Each
    /// level the game gets harder via boss ghost insertion at L5/L10.
    @StateObject private var levels = LevelManager(
        gameID: "pacman",
        baseTarget: 1,
        baseMovesAllowed: 0,
        curve: .standard
    )

    /// Personal-best tracker — surfaces only on game-over panel.
    @StateObject private var highScores = HighScoreManager(gameID: "pacman")

    @State private var lastObservedLives = 3
    @State private var lastObservedScore = 0
    @State private var showGameOver = false
    @State private var gameOverAnnounced = false

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

            // Game-over panel — only visible when game ends. High-score
            // surfaces here per score-show-personal-best-on-game-over.
            gameOverPanel
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
        guard engine.phase == .playing, !showGameOver else { return }
        let scoreBefore = engine.score
        let livesBefore = engine.lives
        ghostsRunning = true
        engine.moveHero(direction)
        handleGameStateAfterTick(scoreBefore: scoreBefore, livesBefore: livesBefore, isMove: true)
    }

    private func stepGhosts() {
        guard ghostsRunning, engine.phase == .playing, !showGameOver else { return }
        let livesBefore = engine.lives
        let scoreBefore = engine.score
        engine.stepTraffic()
        handleGameStateAfterTick(scoreBefore: scoreBefore, livesBefore: livesBefore, isMove: false)
    }

    /// Centralized post-tick handler — runs after every moveHero or
    /// stepGhosts so SFX, status text, level-up, and game-over fire
    /// from one place. (audio-debounce-events-not-renders: keyed off
    /// state deltas, not render frames.)
    private func handleGameStateAfterTick(scoreBefore: Int, livesBefore: Int, isMove: Bool) {
        let scoreDelta = engine.score - scoreBefore

        // Score-driven SFX. The engine awards different points per pickup
        // kind, so the score delta tells us what was eaten:
        //   pellet      = 10 pts → soft pop
        //   power pellet = 50 pts → power-up SFX
        //   fruit       = 100 pts → victory ping
        //   ghost eaten (frightened) = ~200 pts → burst
        if scoreDelta > 0 {
            if scoreDelta >= 200 {
                sound.play(.match3Burst, volume: 0.7)
            } else if scoreDelta >= 100 {
                sound.play(.victory, volume: 0.5, pitchSemitones: 4)
            } else if scoreDelta >= 50 {
                sound.play(.arcadePowerUp, volume: 0.5)
            } else if scoreDelta >= 10 {
                sound.play(.match3Pop, volume: 0.35)
            }
        }

        // Hero died this tick (lives went down).
        if engine.lives < livesBefore {
            sound.play(.arcadeExplosionBig, volume: 0.7)
        }

        // Win condition — maze cleared.
        if engine.phase == .won && !gameOverAnnounced {
            gameOverAnnounced = true
            ghostsRunning = false
            status = "Maze cleared!"
            sound.play(.victory, volume: 0.9)
            highScores.commit(score: engine.score)
            // Advance level for the NEXT play-through; on Play Again
            // the maze regenerates and inherits the new level state
            // (boss ghost on L5/L10 — see resetForNextLevel()).
            levels.advance()
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 600_000_000)
                sound.play(.levelUp, pitchSemitones: 2)
                withAnimation(.easeOut(duration: 0.30)) {
                    showGameOver = true
                }
            }
            return
        }

        // Loss — out of lives.
        if engine.phase == .lost && !gameOverAnnounced {
            gameOverAnnounced = true
            ghostsRunning = false
            status = "Game over."
            highScores.commit(score: engine.score)
            sound.play(.gameOver)
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 600_000_000)
                withAnimation(.easeOut(duration: 0.30)) {
                    showGameOver = true
                }
            }
            return
        }

        // Status text (only updated for tick-relevant cases).
        if engine.lives < livesBefore {
            status = "Ghost collision. Respawned."
        } else if scoreDelta > 0 {
            status = "Score \(engine.score) · pellets left \(pelletCount)"
        }
    }

    @ViewBuilder
    private var gameOverPanel: some View {
        if showGameOver {
            ZStack {
                Color.black.opacity(0.7)
                VStack(spacing: 14) {
                    let won = engine.phase == .won
                    Text(highScores.celebratingNewBest ? "NEW BEST!" : (won ? "MAZE CLEARED" : "GAME OVER"))
                        .font(.system(size: 32, weight: .black, design: .rounded))
                        .kerning(2)
                        .foregroundStyle(highScores.celebratingNewBest
                            ? Color(red: 1.0, green: 0.85, blue: 0.30)
                            : (won ? .yellow : .red))

                    VStack(spacing: 4) {
                        Text("Your run")
                            .font(.system(size: 11, weight: .black))
                            .kerning(1.2)
                            .foregroundStyle(.white.opacity(0.55))
                        Text(HighScoreManager.formatNumber(engine.score))
                            .font(.system(size: 44, weight: .black, design: .rounded))
                            .foregroundStyle(.white)
                        Text("Level \(levels.currentLevel) reached")
                            .font(.system(size: 13, weight: .heavy, design: .rounded))
                            .foregroundStyle(.white.opacity(0.7))
                    }

                    if highScores.bestScore > 0 {
                        HStack(spacing: 6) {
                            Image(systemName: "trophy.fill")
                                .foregroundStyle(Color(red: 1.0, green: 0.85, blue: 0.30))
                            Text("Best: \(HighScoreManager.formatNumber(highScores.bestScore))")
                                .font(.system(size: 14, weight: .heavy, design: .rounded))
                                .foregroundStyle(.white.opacity(0.85))
                        }
                    }

                    Button {
                        sound.play(.uiButtonTap)
                        dismissAndRestartForNextRun()
                    } label: {
                        Text(won ? "NEXT LEVEL" : "PLAY AGAIN")
                            .font(.system(size: 14, weight: .heavy))
                            .kerning(1.4)
                            .padding(.horizontal, 28)
                            .padding(.vertical, 12)
                    }
                    .buttonStyle(.borderedProminent)
                    .padding(.top, 4)
                }
                .padding(28)
                .background(
                    RoundedRectangle(cornerRadius: 22)
                        .fill(Color.black.opacity(0.85))
                        .overlay(
                            RoundedRectangle(cornerRadius: 22).stroke(
                                highScores.celebratingNewBest
                                    ? Color(red: 1.0, green: 0.85, blue: 0.30).opacity(0.6)
                                    : .white.opacity(0.18),
                                lineWidth: 1
                            )
                        )
                )
            }
        }
    }

    private func reset() {
        engine = GridAdventureEngine.pacmanArcadeMap()
        ghostColorByID = [:]
        ghostsRunning = false
        showGameOver = false
        gameOverAnnounced = false
        status = "Eat pellets and dodge ghosts."
        levels.reset()  // explicit reset → drop to L1
        sound.play(.uiButtonTap, volume: 0.5)
    }

    /// Restart for next level (after maze clear). Bumps engine to a fresh
    /// maze AND inherits the level-driven boss-ghost upgrade if applicable.
    /// At L5/L10 boss levels, swap one ghost's personality to .boss + bump
    /// hitsRemaining so the player feels the difficulty step.
    private func dismissAndRestartForNextRun() {
        engine = GridAdventureEngine.pacmanArcadeMap()
        // Boss ghost injection: at boss levels, find one ghost and convert
        // it to boss kind. The visual + AI difference signals 'this level
        // is harder.' Done via a method on the engine that the View calls
        // explicitly so engine state stays Codable + deterministic.
        if levels.isBossLevel {
            engine.upgradeGhostToBoss()
        }
        ghostColorByID = [:]
        ghostsRunning = false
        showGameOver = false
        gameOverAnnounced = false
        if engine.phase == .lost {
            // After full game-over: also drop level back to 1
            levels.reset()
        }
        status = levels.isBossLevel
            ? "Boss ghost on the loose!"
            : "Level \(levels.currentLevel) — eat all pellets."
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
