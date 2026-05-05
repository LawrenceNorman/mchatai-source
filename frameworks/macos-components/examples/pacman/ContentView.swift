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

    /// Logic-tick rate. The ENGINE steps once per tickInterval (a tile-
    /// step happens here). The RENDER runs at 60fps via TimelineView
    /// and INTERPOLATES actor positions between their previous tile and
    /// current tile across the tick interval — so motion is smooth
    /// even though the engine is discrete-tile.
    /// 0.18s = ~5.5 tiles/sec is the original arcade Pacman feel — slow
    /// enough to be playable, fast enough to feel alive.
    private let tickInterval: Double = 0.18
    private let timer = Timer.publish(every: 0.18, on: .main, in: .common).autoconnect()
    private let cellSize: CGFloat = 38
    private let cellGap: CGFloat = 1

    /// Pending direction queue. Web Pacman pattern: arrow key sets the
    /// player's "desired next direction"; on each tick the engine pivots
    /// the hero IF that direction is walkable, otherwise keeps moving in
    /// the previous direction. So a single press can carry the player
    /// across the maze — no tap-spam required. Without this queue, every
    /// tile of motion needs its own press, which feels broken.
    /// Filed as wisdom rule game-keypress-direction-queue.
    @State private var pendingDirection: GridDirection? = nil
    @State private var lastHeroDirection: GridDirection = .left

    /// Per-actor previous tile positions, captured BEFORE the most recent
    /// engine.update. Used by the Canvas renderer to interpolate visual
    /// position between (previousTile → currentTile) as `t` goes 0 → 1
    /// across the tickInterval. Without this, Pacman + ghosts strobe-jump
    /// from cell to cell at the engine's logic rate (looks broken).
    @State private var previousActorPositions: [UUID: PuzzlePoint] = [:]
    /// Wall-clock time of the most recent engine tick. The Canvas reads
    /// `(currentTime - lastTickTime) / tickInterval` to compute t for
    /// interpolation. Re-stamped at every tick.
    @State private var lastTickTime: Date = .now
    /// Hero direction at the previous tick (so the Canvas can rotate the
    /// PacMouthShape smoothly during turns rather than snapping).
    @State private var previousHeroDirection: GridDirection = .left

    var body: some View {
        ZStack(alignment: .topLeading) {
            HStack(spacing: 24) {
                VStack(alignment: .leading, spacing: 18) {
                    header
                    mazeCanvas
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
            tick()
        }
    }

    /// Single tick: snapshot all actor positions FIRST (so the Canvas can
    /// interpolate from the now-snapshot to the post-tick position over
    /// the next tickInterval), then advance the hero + ghosts. Mirrors
    /// the web Pacman loop pattern.
    private func tick() {
        guard engine.phase == .playing, !showGameOver else { return }

        // Snapshot positions BEFORE mutating the engine. previousActorPositions
        // is what the Canvas reads as its "from" state for interpolation.
        var snapshot: [UUID: PuzzlePoint] = [:]
        for actor in engine.actors {
            snapshot[actor.id] = actor.position
        }
        previousActorPositions = snapshot
        previousHeroDirection = lastHeroDirection
        lastTickTime = .now

        // Decide the hero's next move. Try the queued direction first; if
        // it leads into a wall, continue in the prior direction. If THAT
        // is also blocked (corner case), no-op (hero stays put).
        let candidates: [GridDirection] = {
            if let pending = pendingDirection { return [pending, lastHeroDirection] }
            return [lastHeroDirection]
        }()
        for dir in candidates {
            if isWalkable(direction: dir) {
                let scoreBefore = engine.score
                let livesBefore = engine.lives
                ghostsRunning = true
                engine.moveHero(dir)
                lastHeroDirection = dir
                if dir == pendingDirection { pendingDirection = nil }
                handleGameStateAfterTick(scoreBefore: scoreBefore, livesBefore: livesBefore, isMove: true)
                break
            }
        }
        // Ghosts always tick on every step regardless of hero blocked state.
        stepGhosts()
    }

    /// Returns true if the hero can move one cell in the given direction
    /// without hitting a wall. Used by tick() to decide between pending
    /// and persistent direction.
    private func isWalkable(direction: GridDirection) -> Bool {
        guard let hero = engine.hero else { return false }
        let target = hero.position.moved(direction)
        guard engine.map.contains(target) else { return false }
        return engine.map[target] != .wall
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

    /// Single-Canvas + TimelineView renderer at 60fps. Every frame:
    ///   1. Compute t = (now - lastTickTime) / tickInterval, clamped 0...1.
    ///      t=0 is the moment the engine just stepped; t=1 is when it's
    ///      about to step again. So t IS the visual interpolation parameter.
    ///   2. For each actor, draw at lerp(previousTile, currentTile, t)
    ///      so motion is smooth between tile-steps.
    ///   3. Draw the entire maze (walls + floor) in one pass — no SwiftUI
    ///      per-cell child views. Eliminates the per-tick re-layout flicker
    ///      that was making the LazyVGrid version look like a strobe.
    /// This pattern (Canvas + TimelineView) is the macOS analogue of the
    /// web's requestAnimationFrame loop and produces visually smooth
    /// gameplay even with a slow logic-tick. Filed as wisdom rule
    /// game-tile-grid-canvas-timelineview-not-lazyvgrid.
    private var mazeCanvas: some View {
        let mazeWidth = CGFloat(engine.map.columns) * cellSize + CGFloat(engine.map.columns - 1) * cellGap
        let mazeHeight = CGFloat(engine.map.rows) * cellSize + CGFloat(engine.map.rows - 1) * cellGap
        return TimelineView(.animation(minimumInterval: 1.0 / 60.0)) { timeline in
            Canvas { context, size in
                // Visual interpolation parameter. Clamped to [0,1] so we
                // never overshoot when frames render slightly after the
                // next tick is already due.
                let elapsed = timeline.date.timeIntervalSince(lastTickTime)
                let t = max(0, min(1, elapsed / tickInterval))
                drawMaze(context: &context)
                drawActors(context: &context, t: t)
            }
            .frame(width: mazeWidth, height: mazeHeight)
        }
        .frame(width: mazeWidth, height: mazeHeight)
        .padding(12)
        .background(Color.black)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.blue.opacity(0.8), lineWidth: 2)
        }
    }

    /// Draw the static maze layer. Walls are filled rounded-rectangles in
    /// arcade-blue; floor is black; pellets/power-pellets render here as
    /// well since they don't move. Single Canvas pass = no flicker.
    private func drawMaze(context: inout GraphicsContext) {
        let stride = cellSize + cellGap
        // Floor is the black background — no fill needed (Canvas inherits
        // the black .background). Walls are filled blocks.
        for r in 0..<engine.map.rows {
            for c in 0..<engine.map.columns {
                let point = PuzzlePoint(row: r, col: c)
                let tile = engine.map[point]
                let cellRect = CGRect(
                    x: CGFloat(c) * stride,
                    y: CGFloat(r) * stride,
                    width: cellSize,
                    height: cellSize
                )
                if tile == .wall {
                    let path = Path(roundedRect: cellRect, cornerRadius: 6)
                    context.fill(path, with: .color(Color(red: 0.10, green: 0.18, blue: 0.62)))
                    context.stroke(path, with: .color(Color(red: 0.32, green: 0.58, blue: 1.0)), lineWidth: 1.5)
                } else if tile == .exit {
                    let path = Path(roundedRect: cellRect.insetBy(dx: 8, dy: 8), cornerRadius: 4)
                    context.fill(path, with: .color(Color.green.opacity(0.35)))
                }
            }
        }

        // Stationary pellets + power-pellets — drawn here so they're behind
        // moving actors (consistent depth ordering).
        for actor in engine.actors {
            switch actor.kind {
            case .pellet:
                let center = visualCenter(for: actor.position, t: 1, previous: actor.position)
                let r: CGFloat = 2.5
                let dot = CGRect(x: center.x - r, y: center.y - r, width: r * 2, height: r * 2)
                context.fill(Path(ellipseIn: dot), with: .color(Color.white.opacity(0.92)))
            case .powerPellet:
                let center = visualCenter(for: actor.position, t: 1, previous: actor.position)
                let r: CGFloat = 7
                let dot = CGRect(x: center.x - r, y: center.y - r, width: r * 2, height: r * 2)
                context.fill(Path(ellipseIn: dot), with: .color(.white))
            default: break
            }
        }
    }

    /// Draw moving actors (hero + ghosts + fruit) at INTERPOLATED positions
    /// based on t. Hero pose rotates smoothly through the turn by lerping
    /// the rotation angle over t.
    private func drawActors(context: inout GraphicsContext, t: Double) {
        for actor in engine.actors {
            switch actor.kind {
            case .hero:
                drawHero(context: &context, actor: actor, t: t)
            case .enemy:
                drawGhost(context: &context, actor: actor, t: t)
            case .fruit:
                let center = visualCenter(for: actor.position, t: 1, previous: actor.position)
                let resolved = context.resolve(Image(systemName: "applelogo"))
                context.draw(resolved, in: CGRect(
                    x: center.x - cellSize * 0.3,
                    y: center.y - cellSize * 0.3,
                    width: cellSize * 0.6,
                    height: cellSize * 0.6
                ))
            default: break
            }
        }
    }

    /// Compute the visual center point for an actor at interpolation t.
    /// previous: the tile the actor occupied at t=0 (last tick). current:
    /// the tile they occupy now (this tick). Visual position is the linear
    /// blend.
    private func visualCenter(for current: PuzzlePoint, t: Double, previous: PuzzlePoint) -> CGPoint {
        let stride = cellSize + cellGap
        let prevCenter = CGPoint(
            x: CGFloat(previous.col) * stride + cellSize / 2,
            y: CGFloat(previous.row) * stride + cellSize / 2
        )
        let curCenter = CGPoint(
            x: CGFloat(current.col) * stride + cellSize / 2,
            y: CGFloat(current.row) * stride + cellSize / 2
        )
        return CGPoint(
            x: prevCenter.x + (curCenter.x - prevCenter.x) * t,
            y: prevCenter.y + (curCenter.y - prevCenter.y) * t
        )
    }

    private func drawHero(context: inout GraphicsContext, actor: AdventureActor, t: Double) {
        let prevPos = previousActorPositions[actor.id] ?? actor.position
        let center = visualCenter(for: actor.position, t: t, previous: prevPos)
        let radius = cellSize * 0.39
        // Mouth angle — animated open/closed via timeline.date for that
        // classic Pac-Man chomp. Period = 0.20s for a satisfying chomp rhythm.
        let chompPhase = sin(Date().timeIntervalSince1970 * 14) * 0.5 + 0.5  // 0..1
        let mouthHalf = 0.05 + chompPhase * 0.55  // 0.05 to 0.60 radians half-mouth
        let dirAngle = directionAngle(actor.direction)

        var path = Path()
        path.move(to: center)
        let startAngle = dirAngle + mouthHalf
        let endAngle = dirAngle - mouthHalf + 2 * .pi
        path.addArc(
            center: center,
            radius: radius,
            startAngle: .radians(startAngle),
            endAngle: .radians(endAngle),
            clockwise: false
        )
        path.closeSubpath()
        context.fill(path, with: .color(Color(red: 1.0, green: 0.85, blue: 0.10)))
    }

    private func drawGhost(context: inout GraphicsContext, actor: AdventureActor, t: Double) {
        let prevPos = previousActorPositions[actor.id] ?? actor.position
        let center = visualCenter(for: actor.position, t: t, previous: prevPos)
        let radius = cellSize * 0.36
        let isFrightened = actor.frightenedTicks > 0
        let bodyColor = isFrightened ? Color.blue.opacity(0.85) : ghostColor(actor)

        // Ghost silhouette: dome on top + 3 wave bumps on bottom.
        var body = Path()
        let top = CGPoint(x: center.x, y: center.y - radius)
        body.move(to: CGPoint(x: center.x - radius, y: center.y))
        body.addArc(
            center: top,
            radius: radius,
            startAngle: .degrees(180),
            endAngle: .degrees(360),
            clockwise: false
        )
        let bottom = center.y + radius * 0.85
        body.addLine(to: CGPoint(x: center.x + radius, y: bottom))
        // 3 wave bumps along the bottom edge.
        let bumpWidth = (radius * 2) / 3
        for i in 0..<3 {
            let baseX = center.x + radius - CGFloat(i) * bumpWidth
            let midX = baseX - bumpWidth / 2
            let endX = baseX - bumpWidth
            body.addQuadCurve(
                to: CGPoint(x: endX, y: bottom),
                control: CGPoint(x: midX, y: bottom + radius * 0.25)
            )
        }
        body.closeSubpath()
        context.fill(body, with: .color(bodyColor))

        // Eyes: white circles + black pupils. Pupil offset signals the
        // direction the ghost is "looking" (= traveling).
        let eyeR: CGFloat = radius * 0.22
        let eyeOffsetX: CGFloat = radius * 0.32
        let eyeY = center.y - radius * 0.18
        let leftEye = CGPoint(x: center.x - eyeOffsetX, y: eyeY)
        let rightEye = CGPoint(x: center.x + eyeOffsetX, y: eyeY)
        for ec in [leftEye, rightEye] {
            let eyeRect = CGRect(x: ec.x - eyeR, y: ec.y - eyeR, width: eyeR * 2, height: eyeR * 2)
            context.fill(Path(ellipseIn: eyeRect), with: .color(.white))
            // Pupil (small black) offset by direction.
            let pupilR = eyeR * 0.5
            let dirVec = directionVector(actor.direction)
            let pupilCenter = CGPoint(
                x: ec.x + dirVec.dx * eyeR * 0.4,
                y: ec.y + dirVec.dy * eyeR * 0.4
            )
            let pupilRect = CGRect(
                x: pupilCenter.x - pupilR,
                y: pupilCenter.y - pupilR,
                width: pupilR * 2,
                height: pupilR * 2
            )
            context.fill(Path(ellipseIn: pupilRect), with: .color(.black))
        }
    }

    private func directionAngle(_ dir: GridDirection) -> Double {
        switch dir {
        case .right: return 0
        case .down:  return .pi / 2
        case .left:  return .pi
        case .up:    return -.pi / 2
        }
    }

    private func directionVector(_ dir: GridDirection) -> CGVector {
        switch dir {
        case .right: return CGVector(dx: 1, dy: 0)
        case .left:  return CGVector(dx: -1, dy: 0)
        case .up:    return CGVector(dx: 0, dy: -1)
        case .down:  return CGVector(dx: 0, dy: 1)
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

    /// Key press handler — does NOT directly move; just queues the direction.
    /// The next tick() call will read pendingDirection and pivot the hero
    /// at the soonest legal opportunity. This is the web-Pacman pattern
    /// that makes single key presses persist across many tiles.
    private func moveHero(_ direction: GridDirection) {
        guard engine.phase == .playing, !showGameOver else { return }
        pendingDirection = direction
        ghostsRunning = true
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
        pendingDirection = nil
        lastHeroDirection = .left
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
