import SwiftUI
import AppKit

struct ContentView: View {
    @State private var engine: GridAdventureEngine = {
        var e = GridAdventureEngine.pacmanArcadeMap()
        // The View runs its own death-animation pause + manual respawn,
        // so the engine should NOT auto-teleport the hero on collision.
        // See engine.deferRespawn docs.
        e.deferRespawn = true
        return e
    }()
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

    /// Alternates per pellet so consecutive pellet-pop SFX ring at
    /// different pitches — produces the iconic "wakka-wakka" alternation
    /// instead of a single repeated tone. Without this, eating a row of
    /// pellets sounds like a stuck robot. Filed 2026-05-05 from user
    /// feedback "when I eat the pill the music is a bit annoying."
    @State private var pelletParity = false

    /// Death-sequence state. The engine collisions are instantaneous —
    /// without a View-level pause, the hero teleports to spawn and the
    /// game keeps ticking, which feels like a glitch. The death sequence
    /// works as: detect lives-decremented → set dyingUntil = now + 1.5s
    /// → freeze ticks until dyingUntil → reset ghosts to pen + clear
    /// state. The Canvas reads `deathProgress` (0→1 across the pause)
    /// to draw a shrinking-and-fading hero.
    @State private var dyingUntil: Date? = nil
    /// Wall-clock when the death sequence started (for animation interp).
    @State private var deathStartedAt: Date = .now
    private let deathPauseSeconds: Double = 1.5

    /// Logic-tick interval bounds — INTRA-level ramp (start → end as the
    /// player spends time on the current level) PLUS an inter-level boost
    /// applied per LevelManager.currentLevel. The total is:
    ///   tickIntervalStart  - levelBoost(currentLevel)  → start of level
    ///   tickIntervalEndL1  - levelBoost(currentLevel)  → end of level
    /// where levelBoost(N) shaves ~0.01s per level (capped at 0.05s) so
    /// L1 caps at 0.18s, L5 caps at ~0.13s, L10+ caps at 0.13s.
    /// Filed 2026-05-05 from user feedback: "by the time I'm reaching
    /// the end of level 1, it is really going too fast for this just to
    /// be a level 1 game (we should be on like level 10 for this type
    /// of frantic speed)."
    /// Tick-interval bounds. v7 (2026-05-05): widened the L1 range to
    /// be MUCH gentler — start ≈ 3.6 tiles/sec, end-of-L1 ≈ 4.5 tiles/sec.
    /// User said v6's L1 ramp "starts off at a great pace, but it needs
    /// to be a bit more gradual about the overall speed."
    private let tickIntervalStart: Double = 0.28
    private let tickIntervalEndL1: Double = 0.22
    /// Seconds of play (on the current level) over which the tick interval
    /// linearly interpolates from start → end. After this, the tick stays
    /// at end (level-capped). Stretched to 90s so the ramp feels
    /// gradual rather than rushed.
    private let levelSpeedRampSeconds: Double = 90.0
    /// Floor — even the highest level can't tick faster than this.
    private let tickIntervalFloor: Double = 0.13
    /// Wall-clock time when the current level started (re-stamped on level
    /// transitions and resets). Drives the ramp.
    @State private var levelStartTime: Date = .now

    /// Render-time-tick driver. Fixed at 60Hz refresh; the engine reads
    /// `currentTickInterval` to decide when to step (variable cadence).
    private let timer = Timer.publish(every: 1.0 / 60.0, on: .main, in: .common).autoconnect()
    /// Wall-clock time of the most-recent ENGINE tick (not render tick).
    /// Set when tick() runs; the `onReceive(timer)` handler checks
    /// `now - lastEngineTick >= currentTickInterval` before stepping.
    @State private var lastEngineTick: Date = .now

    /// Currently-effective tick interval, combining:
    ///   - intra-level ramp: as time on level increases, tick speeds up
    ///     from tickIntervalStart toward tickIntervalEndL1
    ///   - inter-level boost: each level number shaves ~0.01s further
    ///     until clamped at tickIntervalFloor (0.13s)
    /// So L1 ramps 0.26 → 0.18 over 60s. L5 ramps ~0.22 → 0.14. L10+ caps
    /// at 0.13. Computed every render frame.
    private var currentTickInterval: Double {
        let elapsed = Date().timeIntervalSince(levelStartTime)
        let t = max(0, min(1, elapsed / levelSpeedRampSeconds))
        let intraLevel = tickIntervalStart + (tickIntervalEndL1 - tickIntervalStart) * t
        let interLevelBoost = min(0.05, Double(max(0, levels.currentLevel - 1)) * 0.01)
        return max(tickIntervalFloor, intraLevel - interLevelBoost)
    }
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
            // If a death sequence is active, all engine ticks are paused
            // until dyingUntil elapses. The render layer keeps animating
            // (so the death-shrink animation continues to draw).
            if let until = dyingUntil {
                if Date() >= until {
                    finishDeathSequence()
                }
                return
            }
            // Render-tick fires at 60Hz. Only step the ENGINE if enough
            // wall-clock time has elapsed since the last engine tick to
            // satisfy the (level-progressive) currentTickInterval.
            if Date().timeIntervalSince(lastEngineTick) >= currentTickInterval {
                tick()
            }
        }
    }

    /// Death-progress 0→1 across deathPauseSeconds. Used by the Canvas to
    /// draw a shrinking-and-fading Pac during the pause, plus an expanding
    /// orange burst behind him for one moment of arcade flair. 0 = just
    /// died, 1 = ready to respawn.
    private var deathProgress: Double {
        guard dyingUntil != nil else { return 0 }
        let elapsed = Date().timeIntervalSince(deathStartedAt)
        return max(0, min(1, elapsed / deathPauseSeconds))
    }

    /// Begin the death sequence. Called from handleGameStateAfterTick when
    /// engine.lives drops. Plays death SFX, freezes ticks, and (after the
    /// pause) calls finishDeathSequence which respawns ghosts to the pen.
    private func startDeathSequence() {
        let now = Date()
        deathStartedAt = now
        dyingUntil = now.addingTimeInterval(deathPauseSeconds)
        // Death SFX — the iconic descending tone substitute. Layered
        // explosion + lower-pitch game-over chord.
        sound.play(.arcadeExplosionBig, volume: 0.7)
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 350_000_000)
            sound.play(.gameOver, volume: 0.55, pitchSemitones: 4)
        }
    }

    /// Resume normal play after the death pause. Reset ghosts to their
    /// pen positions, manually respawn the hero (since deferRespawn is
    /// true the engine left him on the collision tile during the pause),
    /// clear the pending direction queue, and restart the engine-tick
    /// clock so the player gets a clean tile-step.
    private func finishDeathSequence() {
        dyingUntil = nil
        engine.respawnHeroToStart()         // teleport hero to spawn now
        engine.respawnGhostsToPen()
        pendingDirection = nil
        lastHeroDirection = .left
        let now = Date()
        lastEngineTick = now
        lastTickTime = now
        // Snapshot positions so the renderer doesn't lerp from the
        // pre-death position to spawn (would look like a flying snap-back).
        var snap: [UUID: PuzzlePoint] = [:]
        for actor in engine.actors { snap[actor.id] = actor.position }
        previousActorPositions = snap
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
        let now = Date()
        lastTickTime = now
        lastEngineTick = now

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
                // next tick is already due. Uses currentTickInterval so
                // the visual easing stays in sync as the level speeds up.
                let elapsed = timeline.date.timeIntervalSince(lastTickTime)
                let t = max(0, min(1, elapsed / currentTickInterval))
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
                drawFruit(context: &context, actor: actor)
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
        // During the death sequence, FREEZE at actor.position (the
        // collision tile — engine.deferRespawn=true means the hero stays
        // there until finishDeathSequence). Otherwise, lerp from prev → curr.
        let center = (dyingUntil != nil)
            ? visualCenter(for: actor.position, t: 1, previous: actor.position)
            : visualCenter(for: actor.position, t: t, previous: prevPos)
        let baseRadius = cellSize * 0.39

        // Death animation: Pac shrinks, his mouth opens wide (>180°),
        // and an expanding orange burst fades out behind him.
        if dyingUntil != nil {
            let dp = deathProgress  // 0 → 1 across deathPauseSeconds
            // Burst — a fading orange ring expanding outward.
            let burstR = baseRadius * (1.0 + dp * 1.6)
            let burstAlpha = max(0, 0.65 - dp * 0.65)
            if burstAlpha > 0 {
                let burstRect = CGRect(
                    x: center.x - burstR,
                    y: center.y - burstR,
                    width: burstR * 2,
                    height: burstR * 2
                )
                context.stroke(
                    Path(ellipseIn: burstRect),
                    with: .color(Color(red: 1.0, green: 0.55, blue: 0.10).opacity(burstAlpha)),
                    lineWidth: 3
                )
            }
            // Pac shrinks AND his mouth opens wide (clamps to a thin
            // crescent then disappears).
            let scale = max(0, 1.0 - dp)
            let radius = baseRadius * scale
            // Mouth opens from 0.55 to ~3.0 radians half-angle as we die.
            let mouthHalf = 0.55 + dp * 2.4
            let dirAngle = directionAngle(actor.direction)
            var path = Path()
            path.move(to: center)
            let startAngle = dirAngle + mouthHalf
            let endAngle = dirAngle - mouthHalf + 2 * .pi
            if startAngle < endAngle && radius > 0.5 {
                path.addArc(
                    center: center,
                    radius: radius,
                    startAngle: .radians(startAngle),
                    endAngle: .radians(endAngle),
                    clockwise: false
                )
                path.closeSubpath()
                context.fill(path, with: .color(Color(red: 1.0, green: 0.85, blue: 0.10).opacity(scale)))
            }
            return
        }

        let radius = baseRadius
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
        // During death sequence, ghosts FREEZE on their pre-death tiles
        // (they don't keep marching over the dying Pac). After the pause
        // finishes, finishDeathSequence() resets them to the pen.
        let center = (dyingUntil != nil)
            ? visualCenter(for: prevPos, t: 1, previous: prevPos)
            : visualCenter(for: actor.position, t: t, previous: prevPos)
        // Ghost geometry — fit cleanly inside one cell. ghostSize is the
        // FULL height (and width); previously the bottom-bumps extended
        // BELOW the dome's circle, making total height larger than a tile,
        // which made ghosts look too tall and overlap walls. Now the
        // body fits inside a `ghostSize × ghostSize` square centered on
        // the cell.
        let ghostSize = cellSize * 0.72
        let halfW = ghostSize / 2
        let domeRadius = halfW                        // top dome = full half-width
        let topY = center.y - halfW                   // top of dome
        let baseY = center.y + halfW * 0.55           // where bumps START curving
        let bottomY = center.y + halfW                // furthest the bumps drop to

        let isFrightened = actor.frightenedTicks > 0
        let bodyColor = isFrightened ? Color.blue.opacity(0.85) : ghostColor(actor)

        // Silhouette: dome on top, 3 wave bumps along the bottom. Total
        // bounding box = ghostSize × ghostSize.
        var body = Path()
        body.move(to: CGPoint(x: center.x - halfW, y: center.y))
        body.addArc(
            center: CGPoint(x: center.x, y: center.y),
            radius: domeRadius,
            startAngle: .degrees(180),
            endAngle: .degrees(360),
            clockwise: false
        )
        body.addLine(to: CGPoint(x: center.x + halfW, y: baseY))
        // 3 wave bumps along the bottom — alternate between baseY (peaks)
        // and bottomY (valleys) for the iconic ghost-skirt silhouette.
        let bumpWidth = ghostSize / 3
        for i in 0..<3 {
            let baseX = center.x + halfW - CGFloat(i) * bumpWidth
            let midX = baseX - bumpWidth / 2
            let endX = baseX - bumpWidth
            // Quad-curve dipping down to bottomY at midpoint, returning to baseY.
            body.addQuadCurve(
                to: CGPoint(x: endX, y: baseY),
                control: CGPoint(x: midX, y: bottomY)
            )
        }
        body.addLine(to: CGPoint(x: center.x - halfW, y: center.y))
        body.closeSubpath()
        context.fill(body, with: .color(bodyColor))

        // Eyes: white circles + black pupils. Pupil offset signals the
        // ghost's travel direction. Sized relative to ghostSize so they
        // scale with the ghost.
        let eyeR = ghostSize * 0.11
        let eyeOffsetX = ghostSize * 0.18
        let eyeY = center.y - ghostSize * 0.08
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

    /// Draw the bonus fruit as a classic Pac-Man cherry: two red circles
    /// joined by a green stem. Replaces the SF Symbol applelogo, which
    /// rendered in dark-on-dark tint on the blue maze background — user
    /// reported it was invisible. This vector cherry stays bright red
    /// with a clear contrast against the floor.
    private func drawFruit(context: inout GraphicsContext, actor: AdventureActor) {
        let center = visualCenter(for: actor.position, t: 1, previous: actor.position)
        let cherryR = cellSize * 0.18
        // Two cherry bodies, side by side.
        let leftCenter = CGPoint(x: center.x - cherryR * 0.7, y: center.y + cherryR * 0.55)
        let rightCenter = CGPoint(x: center.x + cherryR * 0.7, y: center.y + cherryR * 0.55)
        for c in [leftCenter, rightCenter] {
            let rect = CGRect(x: c.x - cherryR, y: c.y - cherryR, width: cherryR * 2, height: cherryR * 2)
            // Body fill + a glossy highlight.
            context.fill(Path(ellipseIn: rect), with: .color(Color(red: 0.95, green: 0.20, blue: 0.20)))
            let highlightR = cherryR * 0.35
            let hRect = CGRect(
                x: c.x - cherryR * 0.55,
                y: c.y - cherryR * 0.55,
                width: highlightR * 2,
                height: highlightR * 2
            )
            context.fill(Path(ellipseIn: hRect), with: .color(Color.white.opacity(0.55)))
        }
        // Stems — two diagonal green lines meeting at a point above.
        let stemTop = CGPoint(x: center.x, y: center.y - cherryR * 1.0)
        var stems = Path()
        stems.move(to: leftCenter); stems.addLine(to: stemTop)
        stems.move(to: rightCenter); stems.addLine(to: stemTop)
        context.stroke(stems, with: .color(Color(red: 0.30, green: 0.70, blue: 0.25)), lineWidth: 2.5)
        // Tiny leaf on the stem
        var leaf = Path()
        leaf.move(to: stemTop)
        leaf.addQuadCurve(
            to: CGPoint(x: center.x + cherryR * 0.6, y: center.y - cherryR * 1.4),
            control: CGPoint(x: center.x + cherryR * 0.5, y: center.y - cherryR * 1.0)
        )
        leaf.addQuadCurve(
            to: stemTop,
            control: CGPoint(x: center.x + cherryR * 0.2, y: center.y - cherryR * 1.5)
        )
        leaf.closeSubpath()
        context.fill(leaf, with: .color(Color(red: 0.30, green: 0.70, blue: 0.25)))
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
                // Pellet munch — quiet + alternating pitch (Pacman's
                // classic "wakka-wakka" feel comes from alternating two
                // notes, not a single repeated tone). pelletParity flips
                // every tick so consecutive pellets ring at different
                // pitches. Volume kept very low (0.18) so the constant
                // pellet stream isn't fatiguing — user feedback v4 said
                // "when I eat the pill the music is a bit annoying."
                sound.play(.match3Pop, volume: 0.18, pitchSemitones: pelletParity ? 0 : -3)
                pelletParity.toggle()
            }
        }

        // Hero died this tick (lives went down). If they have lives
        // remaining, run the death-sequence pause + animation; if not,
        // fall through to the .lost branch below for the game-over panel.
        if engine.lives < livesBefore && engine.phase != .lost {
            startDeathSequence()
            status = "Caught! Respawning..."
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
        // (lives-decrement status is set by startDeathSequence above.)
        if engine.lives >= livesBefore && scoreDelta > 0 {
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
        var fresh = GridAdventureEngine.pacmanArcadeMap()
        fresh.deferRespawn = true
        engine = fresh
        ghostColorByID = [:]
        ghostsRunning = false
        showGameOver = false
        gameOverAnnounced = false
        pendingDirection = nil
        lastHeroDirection = .left
        levelStartTime = .now      // restart the level-speed ramp
        lastEngineTick = .now
        lastTickTime = .now
        status = "Eat pellets and dodge ghosts."
        levels.reset()  // explicit reset → drop to L1
        sound.play(.uiButtonTap, volume: 0.5)
    }

    /// Restart for next level (after maze clear). Bumps engine to a fresh
    /// maze AND inherits the level-driven boss-ghost upgrade if applicable.
    /// At L5/L10 boss levels, swap one ghost's personality to .boss + bump
    /// hitsRemaining so the player feels the difficulty step.
    private func dismissAndRestartForNextRun() {
        var fresh = GridAdventureEngine.pacmanArcadeMap()
        fresh.deferRespawn = true
        engine = fresh
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
        // Restart the level-speed ramp on every transition.
        levelStartTime = .now
        lastEngineTick = .now
        lastTickTime = .now
        pendingDirection = nil
        lastHeroDirection = .left
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
