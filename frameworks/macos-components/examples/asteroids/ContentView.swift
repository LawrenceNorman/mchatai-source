import SwiftUI

struct ContentView: View {
    @State private var engine = AsteroidsEngine()
    @State private var controls = ArcadeControls()
    @State private var isPaused = false
    @State private var hasStarted = false
    @State private var lastTick = Date()
    @FocusState private var hasKeyboardFocus: Bool

    /// Animation tuning — Asteroids is arcade-action, so .punchy preset.
    /// Drives the game-over flash + ship-destruction shake intensity.
    private let intensity: AnimationIntensity = .punchy

    /// Sound effects engine. SFX use case: laser on fire, explosion on
    /// rock destroy, big explosion + game-over chord on ship destroyed,
    /// level-up chord on wave clear, victory on personal best.
    @ObservedObject private var sound = SoundEngine.shared

    /// Wave-based level manager. .accelerating curve — gentle ramp early
    /// (L1-5), steep climb thereafter, matching arcade-shooter pacing.
    /// gameID 'asteroids' so personal best doesn't collide with other games.
    @StateObject private var levels = LevelManager(
        gameID: "asteroids",
        baseTarget: 1,                    // unused for wave-clear-driven advancement
        baseMovesAllowed: 0,              // not move-based
        curve: .accelerating
    )

    /// Personal-best score tracker. Surfaces ONLY on game-over panel —
    /// per wisdom rule score-show-personal-best-on-game-over, in-play
    /// chrome distracts.
    @StateObject private var highScores = HighScoreManager(gameID: "asteroids")

    /// Set true when ship is destroyed and lives = 0. Drives the
    /// game-over panel overlay.
    @State private var showGameOver = false

    /// Last-observed score, used to detect score deltas → SFX trigger.
    @State private var lastObservedScore = 0
    /// Last-observed lives, used to detect ship-destroyed → SFX trigger.
    @State private var lastObservedLives = 3
    /// Last-observed rocks count — kept for backward-compat but the
    /// wave-clear detector now reads engine.wave directly (the engine
    /// auto-increments it in update() when rocks deplete).
    @State private var lastObservedRocksCount = 0
    /// Last-observed wave number — used to detect engine.wave bumps so
    /// the View can fire its level-up SFX + banner exactly once per
    /// real wave clear, no false positives from rock splits.
    @State private var lastObservedWave = 1
    /// Last-observed enemy count + enemy shot count. Used to detect
    /// enemy-killed and enemy-fired events for SFX.
    @State private var lastObservedEnemyCount = 0
    @State private var lastObservedEnemyShotCount = 0
    /// Whether we've already emitted the BOSS WAVE toast for the current
    /// wave (we suppress re-firing each tick during the wave).
    @State private var lastBossToastForWave = 0
    /// Tracks whether we've already announced game-over for THIS run, so
    /// we don't replay the chord every frame after lives hit 0.
    @State private var gameOverAnnounced = false

    private let timer = Timer.publish(every: 1.0 / 60.0, on: .main, in: .common).autoconnect()

    var body: some View {
        ZStack {
            VStack(spacing: 16) {
                header

                GeometryReader { proxy in
                    Canvas { context, size in
                        drawAsteroids(context: &context, size: size)
                    }
                    .background(Color.black)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay {
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(.white.opacity(0.16), lineWidth: 1)
                    }
                    .contentShape(Rectangle())
                    .onTapGesture { hasKeyboardFocus = true }
                    .accessibilityLabel("Asteroids playfield \(Int(proxy.size.width)) by \(Int(proxy.size.height))")
                }
                .frame(height: 520)

                controlsBar
            }
            .padding(24)

            // Wave-up celebration banner — only visible during the ~3s
            // celebration window driven by LevelManager.
            waveUpBanner
            // Game-over panel — only visible after ship destroyed and lives=0.
            gameOverPanel
        }
        .frame(minWidth: 860, minHeight: 680)
        .background(Color(nsColor: .windowBackgroundColor))
        .focusable()
        .focused($hasKeyboardFocus)
        .onAppear {
            hasKeyboardFocus = true
            lastObservedScore = engine.score
            lastObservedLives = engine.lives
            lastObservedRocksCount = engine.rocks.count
            lastObservedWave = engine.wave
        }
        .onReceive(timer) { date in
            stepGame(at: date)
        }
        // Press-and-hold model: arrow keys keep the control flag TRUE for
        // as long as the key is physically held, FALSE when released.
        // The previous `.onKeyPress(phases: .down)` + 0.11s auto-release
        // pulse pattern required tapping repeatedly to turn — user
        // reported "I have to hit the button multiple times. Holding
        // the button down should allow the ship to turn."
        .onKeyPress(.leftArrow, phases: [.down, .repeat]) { _ in
            hasStarted = true
            controls.left = true
            return .handled
        }
        .onKeyPress(.leftArrow, phases: .up) { _ in
            controls.left = false
            return .handled
        }
        .onKeyPress(.rightArrow, phases: [.down, .repeat]) { _ in
            hasStarted = true
            controls.right = true
            return .handled
        }
        .onKeyPress(.rightArrow, phases: .up) { _ in
            controls.right = false
            return .handled
        }
        .onKeyPress(.upArrow, phases: [.down, .repeat]) { _ in
            hasStarted = true
            if !controls.up { sound.play(.arcadeThruster, volume: 0.3) }
            controls.up = true
            return .handled
        }
        .onKeyPress(.upArrow, phases: .up) { _ in
            controls.up = false
            return .handled
        }
        .onKeyPress(.space, phases: .down) { _ in
            fire()
            return .handled
        }
        .onKeyPress(.return, phases: .down) { _ in
            if showGameOver {
                dismissGameOverAndRestart()
            } else if engine.phase == .lost {
                resetGame()
            } else {
                fire()
            }
            return .handled
        }
        .onKeyPress("m", phases: .down) { _ in
            sound.muted.toggle()
            return .handled
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Asteroids")
                    .font(.system(size: 32, weight: .black, design: .rounded))
                Text(statusText)
                    .font(.callout.monospacedDigit())
                    .foregroundStyle(.secondary)
            }

            Spacer()

            HStack(spacing: 26) {
                hudMetric("Score", value: HighScoreManager.formatNumber(engine.score))
                hudMetric("Wave", value: "\(engine.wave)")
                hudMetric("Lives", value: String(repeating: "●", count: max(engine.lives, 0)))
            }
        }
    }

    private var controlsBar: some View {
        HStack(spacing: 10) {
            Button(isPaused ? "Resume" : "Pause") {
                isPaused.toggle()
                sound.play(.uiButtonTap, volume: 0.5)
            }
            .keyboardShortcut(.space, modifiers: [.command])

            Button("Fire") {
                fire()
            }
            .buttonStyle(.borderedProminent)
            .keyboardShortcut(.space, modifiers: [])
            .disabled(engine.phase == .lost)

            Button("Reset") {
                resetGame()
            }
            .keyboardShortcut(.return, modifiers: [.command])

            // Mute toggle — required by audio-always-mute-toggle wisdom rule.
            Button {
                sound.muted.toggle()
                if !sound.muted { sound.play(.uiToggle) }
            } label: {
                Image(systemName: sound.muted ? "speaker.slash.fill" : "speaker.wave.2.fill")
            }
            .help(sound.muted ? "Unmute (M)" : "Mute (M)")

            Spacer()

            Text("← / → rotate   ↑ thrust   Space fire")
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
        }
    }

    /// Wave-up toast — small corner notification on wave entry. Boss
    /// waves get a distinct red "BOSS WAVE" toast so the player knows
    /// what's coming. Toned-down style (NOT a centered Match3-style banner)
    /// since waves change every ~30s.
    @ViewBuilder
    private var waveUpBanner: some View {
        if levels.celebratingLevelUp {
            let isBoss = engine.isBossWave
            VStack {
                HStack {
                    Spacer()
                    Text(isBoss ? "BOSS WAVE" : "WAVE \(engine.wave)")
                        .font(.system(size: isBoss ? 16 : 14, weight: .black, design: .rounded))
                        .kerning(isBoss ? 2.0 : 1.4)
                        .foregroundStyle(.white)
                        .padding(.horizontal, isBoss ? 18 : 14)
                        .padding(.vertical, 6)
                        .background(
                            Capsule()
                                .fill((isBoss
                                    ? Color(red: 0.95, green: 0.20, blue: 0.45)
                                    : Color(red: 0.18, green: 0.55, blue: 0.95)).opacity(0.85))
                        )
                        .padding(.top, 36)
                        .padding(.trailing, 36)
                }
                Spacer()
            }
            .opacity(Double(levels.celebrationProgress))
            .allowsHitTesting(false)
        }
    }

    /// Game-over panel — fires when lives hit 0. Shows run summary +
    /// personal best. Hidden during play (per score-show-personal-best-on-game-over).
    @ViewBuilder
    private var gameOverPanel: some View {
        if showGameOver {
            VStack(spacing: 14) {
                Text(highScores.celebratingNewBest ? "NEW BEST!" : "GAME OVER")
                    .font(.system(size: 28, weight: .black, design: .rounded))
                    .kerning(2)
                    .foregroundStyle(highScores.celebratingNewBest
                        ? Color(red: 1.0, green: 0.85, blue: 0.30)
                        : .white)

                VStack(spacing: 4) {
                    Text("Your run")
                        .font(.system(size: 11, weight: .black))
                        .kerning(1.2)
                        .foregroundStyle(.white.opacity(0.55))
                    Text(HighScoreManager.formatNumber(engine.score))
                        .font(.system(size: 44, weight: .black, design: .rounded))
                        .foregroundStyle(.white)
                    Text("Wave \(levels.currentLevel) reached")
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
                    dismissGameOverAndRestart()
                } label: {
                    Text("PLAY AGAIN")
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
                    .shadow(
                        color: highScores.celebratingNewBest
                            ? Color(red: 1.0, green: 0.85, blue: 0.30).opacity(0.5)
                            : .black.opacity(0.5),
                        radius: 24
                    )
            )
        }
    }

    private var statusText: String {
        if engine.phase == .lost {
            return "Ship destroyed. Press Return or Reset."
        }
        if !hasStarted {
            return "Ready. Press Space to fire or ↑ to thrust."
        }
        if isPaused {
            return "Paused"
        }
        return "\(engine.rocks.count) rocks · \(engine.shots.count) shots active"
    }

    private func hudMetric(_ title: String, value: String) -> some View {
        VStack(alignment: .trailing, spacing: 2) {
            Text(title.uppercased())
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)
            Text(value.isEmpty ? "0" : value)
                .font(.system(size: 28, weight: .black, design: .rounded))
                .monospacedDigit()
        }
    }

    private func stepGame(at date: Date) {
        let dt = min(max(date.timeIntervalSince(lastTick), 1.0 / 120.0), 1.0 / 20.0)
        lastTick = date
        guard hasStarted, !isPaused, !showGameOver else { return }

        let preLives = engine.lives
        let preRocksCount = engine.rocks.count
        let preEnemyCount = engine.enemies.count
        let preEnemyShotCount = engine.enemyShots.count
        engine.update(dt: dt, controls: controls)

        // SFX hooks — observe state deltas and fire SFX.
        let postScore = engine.score
        let postLives = engine.lives
        let postRocksCount = engine.rocks.count
        let postEnemyCount = engine.enemies.count
        let postEnemyShotCount = engine.enemyShots.count

        // Enemy fired a shot — count of enemy shots increased. Lower-pitched
        // laser SFX so the player can audibly distinguish enemy fire from
        // their own. (audio-debounce-events-not-renders: this is a count
        // delta, not a render-loop trigger.)
        if postEnemyShotCount > preEnemyShotCount {
            sound.play(.arcadeLaser, volume: 0.4, pitchSemitones: -4)
        }

        // Enemy destroyed — count went down (and not because they all left
        // the playfield, since enemies wrap rather than despawn). Big-
        // explosion SFX, like a rock split.
        if postEnemyCount < preEnemyCount {
            sound.play(.arcadeExplosionBig, volume: 0.7)
        }

        // Boss wave entry toast — fire when wave # changed AND new wave
        // is a boss wave. Distinct red toast so the player knows what's
        // coming.
        if engine.isBossWave && lastBossToastForWave != engine.wave {
            lastBossToastForWave = engine.wave
            sound.play(.arcadePowerUp, volume: 0.7)
        }
        lastObservedEnemyCount = postEnemyCount
        lastObservedEnemyShotCount = postEnemyShotCount

        // Rock destroyed → explosion SFX (debounced). The score delta isn't
        // a perfect signal since wave-clear bonuses also bump score, but
        // rocks-count drop is clean.
        if postRocksCount < preRocksCount {
            sound.play(.arcadeExplosion, volume: 0.7)
        }

        // Wave cleared detection: read engine.wave directly. The engine
        // auto-increments it in update() exactly when all rocks have been
        // cleared (and immediately spawns the next wave with growing
        // difficulty via resetWave(wave:)). Earlier heuristics ("rocks
        // count grew" / "score delta == 500") false-fired on every
        // rock-split. Engine-state-driven detection is unambiguous.
        if engine.wave > lastObservedWave {
            lastObservedWave = engine.wave
            advanceWave()
        }
        lastObservedRocksCount = postRocksCount

        // Ship destroyed (life lost). Big explosion SFX. If lives now 0,
        // fire game-over chord + show panel.
        if postLives < preLives {
            sound.play(.arcadeExplosionBig, volume: 0.9)
            if postLives == 0 && !gameOverAnnounced {
                gameOverAnnounced = true
                highScores.commit(score: engine.score)
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 600_000_000)
                    sound.play(.gameOver)
                    withAnimation(.easeOut(duration: 0.30)) {
                        showGameOver = true
                    }
                }
            }
        }

        lastObservedScore = postScore
        lastObservedLives = postLives
    }

    /// Detect-and-handle wave-clear. The AsteroidsEngine doesn't expose
    /// a wave-cleared event, so the View infers it from "rocks went from
    /// >0 to spawn-count between ticks." We bump the LevelManager so the
    /// wave HUD increments and the celebration banner fires.
    private func advanceWave() {
        sound.play(.victory, volume: 0.7)
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 250_000_000)
            sound.play(.levelUp, pitchSemitones: 2)
        }
        levels.advance()
    }

    private func fire() {
        guard !isPaused, engine.phase != .lost, !showGameOver else { return }
        hasStarted = true
        engine.fire()
        sound.play(.arcadeLaser, volume: 0.5)
    }

    private func resetGame() {
        engine = AsteroidsEngine()
        controls = ArcadeControls()
        isPaused = false
        hasStarted = false
        lastTick = Date()
        hasKeyboardFocus = true
        showGameOver = false
        gameOverAnnounced = false
        lastObservedScore = 0
        lastObservedLives = 3
        lastObservedRocksCount = engine.rocks.count
        lastObservedWave = engine.wave
        levels.reset()  // explicit user reset → drop back to L1
    }

    private func dismissGameOverAndRestart() {
        showGameOver = false
        gameOverAnnounced = false
        engine = AsteroidsEngine()
        controls = ArcadeControls()
        isPaused = false
        hasStarted = false
        lastTick = Date()
        hasKeyboardFocus = true
        lastObservedScore = 0
        lastObservedLives = 3
        lastObservedRocksCount = engine.rocks.count
        lastObservedWave = engine.wave
        // Note: NOT calling levels.reset() — per level-replay-not-demote
        // wisdom rule, dying shouldn't drop your wave count. Only the
        // explicit Reset button calls levels.reset().
    }

    private func pulseControl(_ keyPath: WritableKeyPath<ArcadeControls, Bool>) {
        hasStarted = true
        controls[keyPath: keyPath] = true
        if keyPath == \ArcadeControls.up {
            sound.play(.arcadeThruster, volume: 0.3)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.11) {
            controls[keyPath: keyPath] = false
        }
    }

    private func drawAsteroids(context: inout GraphicsContext, size: CGSize) {
        let transform = playfieldTransform(for: size)
        let fieldRect = CGRect(
            x: transform.originX,
            y: transform.originY,
            width: CGFloat(engine.playfield.width) * transform.scale,
            height: CGFloat(engine.playfield.height) * transform.scale
        )

        context.fill(Path(fieldRect), with: .color(.black))
        drawStarfield(context: &context, fieldRect: fieldRect)

        for rock in engine.rocks {
            drawRock(rock, context: &context, transform: transform)
        }

        for shot in engine.shots {
            let point = transform.point(shot.body.position)
            let radius = max(CGFloat(shot.body.radius) * transform.scale, 2.5)
            let rect = CGRect(x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2)
            context.fill(Path(ellipseIn: rect), with: .color(.cyan))
        }

        // Enemy shots — drawn in red so the player can instantly distinguish
        // their own cyan shots from incoming threats.
        for shot in engine.enemyShots {
            let point = transform.point(shot.body.position)
            let radius = max(CGFloat(shot.body.radius) * transform.scale, 2.5)
            let rect = CGRect(x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2)
            context.fill(Path(ellipseIn: rect), with: .color(.red))
        }

        // Enemy ships — different shape per kind so the player can read
        // threat-level at a glance. Saucer = oval/disc, Hunter = triangle
        // pointed at the player, Mothership = large hex.
        for enemy in engine.enemies {
            drawEnemy(enemy, context: &context, transform: transform)
        }

        if engine.phase != .lost {
            drawShip(context: &context, transform: transform)
            drawShield(context: &context, transform: transform)
        } else {
            drawExplosion(context: &context, transform: transform)
        }
    }

    private func drawEnemy(_ enemy: AsteroidsEnemy, context: inout GraphicsContext, transform: PlayfieldTransform) {
        let center = transform.point(enemy.body.position)
        let radius = CGFloat(enemy.body.radius) * transform.scale

        switch enemy.kind {
        case .saucer:
            // Classic UFO: wide oval body with a smaller dome on top.
            let bodyRect = CGRect(x: center.x - radius, y: center.y - radius * 0.4,
                                  width: radius * 2, height: radius * 0.8)
            context.fill(Path(ellipseIn: bodyRect), with: .color(Color(red: 0.55, green: 0.85, blue: 1.0).opacity(0.85)))
            context.stroke(Path(ellipseIn: bodyRect), with: .color(.cyan), lineWidth: max(1.5, 2 * transform.scale))
            let domeRect = CGRect(x: center.x - radius * 0.55, y: center.y - radius * 0.85,
                                  width: radius * 1.1, height: radius * 0.7)
            context.fill(Path(ellipseIn: domeRect), with: .color(Color.cyan.opacity(0.55)))
        case .hunter:
            // Aggressive arrowhead pointed toward the player.
            let dx = ship.position.x - enemy.body.position.x
            let dy = ship.position.y - enemy.body.position.y
            let aim = atan2(dy, dx)
            let nose = point(from: center, angle: aim, distance: radius * 1.1)
            let left = point(from: center, angle: aim + 2.55, distance: radius * 0.9)
            let right = point(from: center, angle: aim - 2.55, distance: radius * 0.9)
            var path = Path()
            path.move(to: nose); path.addLine(to: left); path.addLine(to: right); path.closeSubpath()
            context.fill(path, with: .color(Color(red: 1.0, green: 0.45, blue: 0.45).opacity(0.85)))
            context.stroke(path, with: .color(.red), lineWidth: max(1.5, 2 * transform.scale))
        case .mothership:
            // Large six-sided disc with a glowing core. Multi-hit boss —
            // the visual emphasis communicates "this one takes effort."
            var hex = Path()
            for i in 0..<6 {
                let angle = Double(i) / 6.0 * .pi * 2
                let p = point(from: center, angle: angle, distance: radius)
                if i == 0 { hex.move(to: p) } else { hex.addLine(to: p) }
            }
            hex.closeSubpath()
            context.fill(hex, with: .color(Color(red: 0.85, green: 0.30, blue: 0.55).opacity(0.85)))
            context.stroke(hex, with: .color(Color(red: 1.0, green: 0.55, blue: 0.85)), lineWidth: max(2, 3 * transform.scale))
            // Health-pip indicator: a small bar above the boss showing
            // remaining hits as filled segments.
            let pips = enemy.kind.maxHits
            let alive = enemy.hitsRemaining
            let pipWidth = (radius * 1.6) / CGFloat(pips)
            for i in 0..<pips {
                let pipX = center.x - radius * 0.8 + CGFloat(i) * pipWidth + 2
                let pipRect = CGRect(x: pipX, y: center.y - radius - 14,
                                     width: pipWidth - 4, height: 5)
                let filled = i < alive
                context.fill(Path(roundedRect: pipRect, cornerRadius: 2),
                             with: .color(filled ? .yellow : .white.opacity(0.18)))
            }
        }
    }

    private func playfieldTransform(for size: CGSize) -> PlayfieldTransform {
        let scale = min(size.width / CGFloat(engine.playfield.width), size.height / CGFloat(engine.playfield.height))
        return PlayfieldTransform(
            scale: scale,
            originX: (size.width - CGFloat(engine.playfield.width) * scale) / 2,
            originY: (size.height - CGFloat(engine.playfield.height) * scale) / 2
        )
    }

    private func drawStarfield(context: inout GraphicsContext, fieldRect: CGRect) {
        let stars = [
            CGPoint(x: 0.08, y: 0.18), CGPoint(x: 0.18, y: 0.76), CGPoint(x: 0.26, y: 0.33),
            CGPoint(x: 0.37, y: 0.62), CGPoint(x: 0.48, y: 0.22), CGPoint(x: 0.57, y: 0.82),
            CGPoint(x: 0.69, y: 0.42), CGPoint(x: 0.78, y: 0.16), CGPoint(x: 0.91, y: 0.71)
        ]
        for star in stars {
            let point = CGPoint(
                x: fieldRect.minX + fieldRect.width * star.x,
                y: fieldRect.minY + fieldRect.height * star.y
            )
            context.fill(Path(ellipseIn: CGRect(x: point.x - 1.2, y: point.y - 1.2, width: 2.4, height: 2.4)), with: .color(.white.opacity(0.52)))
        }
    }

    private func drawShip(context: inout GraphicsContext, transform: PlayfieldTransform) {
        let center = transform.point(engine.ship.position)
        let angle = engine.ship.angle
        let nose = point(from: center, angle: angle, distance: 24 * transform.scale)
        let left = point(from: center, angle: angle + 2.55, distance: 18 * transform.scale)
        let right = point(from: center, angle: angle - 2.55, distance: 18 * transform.scale)

        var path = Path()
        path.move(to: nose)
        path.addLine(to: left)
        path.addLine(to: center)
        path.addLine(to: right)
        path.closeSubpath()

        context.stroke(path, with: .color(.white), lineWidth: max(2, 2.6 * transform.scale))

        if controls.up {
            var flame = Path()
            let tail = point(from: center, angle: angle + .pi, distance: 24 * transform.scale)
            flame.move(to: left)
            flame.addLine(to: tail)
            flame.addLine(to: right)
            context.stroke(flame, with: .color(.orange), lineWidth: max(1.5, 2 * transform.scale))
        }
    }

    private func drawShield(context: inout GraphicsContext, transform: PlayfieldTransform) {
        guard engine.respawnShield > 0 else { return }
        let center = transform.point(engine.ship.position)
        let radius = CGFloat(engine.ship.radius + 12) * transform.scale
        let rect = CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2)
        context.stroke(Path(ellipseIn: rect), with: .color(.cyan.opacity(0.7)), lineWidth: max(1.5, 2.0 * transform.scale))
    }

    private func drawRock(_ rock: AsteroidsRock, context: inout GraphicsContext, transform: PlayfieldTransform) {
        let center = transform.point(rock.body.position)
        let radius = CGFloat(rock.body.radius) * transform.scale
        let multipliers: [CGFloat] = [1.0, 0.78, 1.12, 0.86, 1.05, 0.74, 1.16, 0.92, 1.0]

        var path = Path()
        for index in multipliers.indices {
            let angle = (Double(index) / Double(multipliers.count)) * Double.pi * 2 + rock.body.angle
            let point = point(from: center, angle: angle, distance: radius * multipliers[index])
            if index == 0 {
                path.move(to: point)
            } else {
                path.addLine(to: point)
            }
        }
        path.closeSubpath()
        context.stroke(path, with: .color(.white.opacity(0.86)), lineWidth: max(1.5, 2.2 * transform.scale))
    }

    private func drawExplosion(context: inout GraphicsContext, transform: PlayfieldTransform) {
        let center = transform.point(engine.ship.position)
        for index in 0..<12 {
            let angle = (Double(index) / 12.0) * Double.pi * 2
            var path = Path()
            path.move(to: point(from: center, angle: angle, distance: 8 * transform.scale))
            path.addLine(to: point(from: center, angle: angle, distance: 34 * transform.scale))
            context.stroke(path, with: .color(.orange.opacity(0.8)), lineWidth: max(1.5, 2 * transform.scale))
        }
    }

    private func point(from origin: CGPoint, angle: Double, distance: CGFloat) -> CGPoint {
        CGPoint(
            x: origin.x + CGFloat(cos(angle)) * distance,
            y: origin.y + CGFloat(sin(angle)) * distance
        )
    }
}

private struct PlayfieldTransform {
    var scale: CGFloat
    var originX: CGFloat
    var originY: CGFloat

    func point(_ vector: ArcadeVector) -> CGPoint {
        CGPoint(x: originX + CGFloat(vector.x) * scale, y: originY + CGFloat(vector.y) * scale)
    }
}
