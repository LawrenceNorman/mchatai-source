import SwiftUI

struct ContentView: View {
    @State private var engine = PongEngine()
    @State private var leftDirection = 0.0
    @State private var isPaused = false
    @State private var lastTick = Date()
    @FocusState private var hasKeyboardFocus: Bool

    /// Animation tuning — Pong is mechanics-driven feedback, .standard preset.
    private let intensity: AnimationIntensity = .standard

    /// Sound effects engine. SFX use case: paddle hit, wall bounce, score
    /// chime (different for player vs AI), win/loss chord on game-end.
    @ObservedObject private var sound = SoundEngine.shared

    /// LevelManager — Pong "level" = ball-speed tier. Each rally won by
    /// the player bumps the level (and the engine's ballSpeedMultiplier).
    /// .standard curve, target unused (advancement is rally-driven).
    @StateObject private var levels = LevelManager(
        gameID: "pong",
        baseTarget: 1,
        baseMovesAllowed: 0,
        curve: .standard
    )

    /// Personal-best score tracker. Best = the player's highest leftScore
    /// at end-of-game (so a 7-0 sweep beats a 7-6 win). Surfaced ONLY on
    /// the game-over panel.
    @StateObject private var highScores = HighScoreManager(gameID: "pong")

    @State private var showGameOver = false
    @State private var gameOverAnnounced = false
    @State private var lastObservedLeftScore = 0
    @State private var lastObservedRightScore = 0

    private let timer = Timer.publish(every: 1.0 / 60.0, on: .main, in: .common).autoconnect()

    var body: some View {
        ZStack {
            VStack(spacing: 16) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Arcade Pong")
                            .font(.system(size: 30, weight: .bold, design: .rounded))
                        Text(statusText)
                            .font(.callout.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Text("\(engine.leftScore)  :  \(engine.rightScore)")
                        .font(.system(size: 38, weight: .black, design: .rounded))
                        .monospacedDigit()
                }

                GeometryReader { proxy in
                    Canvas { context, size in
                        drawPong(context: &context, size: size)
                    }
                    .background(Color.black)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay {
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(.white.opacity(0.14), lineWidth: 1)
                    }
                    .contentShape(Rectangle())
                    .onTapGesture { hasKeyboardFocus = true }
                    .accessibilityLabel("Pong playfield \(Int(proxy.size.width)) by \(Int(proxy.size.height))")
                }
                .frame(height: 420)

                HStack(spacing: 10) {
                    Button(isPaused ? "Resume" : "Pause") {
                        isPaused.toggle()
                        sound.play(.uiButtonTap, volume: 0.5)
                    }

                    Button("Reset") {
                        resetGame()
                    }
                    .keyboardShortcut(.return, modifiers: [])

                    // Mute toggle — required by audio-always-mute-toggle wisdom rule.
                    Button {
                        sound.muted.toggle()
                        if !sound.muted { sound.play(.uiToggle, volume: 0.4) }
                    } label: {
                        Image(systemName: sound.muted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                    }
                    .help(sound.muted ? "Unmute" : "Mute")

                    Spacer()

                    Text("Up / Down arrows move · Speed ×\(String(format: "%.2f", engine.ballSpeedMultiplier))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(24)

            // Speed-up toast — small corner notification when the ball
            // speeds up. Toned-down style (NOT a Match3-sized banner)
            // since rally-wins happen frequently in Pong.
            speedUpToast
            // Game-over panel — fires when one side hits winningScore.
            gameOverPanel
        }
        .frame(minWidth: 760, minHeight: 560)
        .focusable()
        .focused($hasKeyboardFocus)
        .onAppear {
            hasKeyboardFocus = true
            lastObservedLeftScore = engine.leftScore
            lastObservedRightScore = engine.rightScore
        }
        .onReceive(timer) { date in
            stepGame(at: date)
        }
        // Press-and-hold paddle controls. The previous 0.09s auto-release
        // pulse pattern required tapping repeatedly to track the ball.
        .onKeyPress(.upArrow, phases: [.down, .repeat]) { _ in
            leftDirection = -1
            return .handled
        }
        .onKeyPress(.upArrow, phases: .up) { _ in
            if leftDirection == -1 { leftDirection = 0 }
            return .handled
        }
        .onKeyPress(.downArrow, phases: [.down, .repeat]) { _ in
            leftDirection = 1
            return .handled
        }
        .onKeyPress(.downArrow, phases: .up) { _ in
            if leftDirection == 1 { leftDirection = 0 }
            return .handled
        }
        .onKeyPress(.space, phases: .down) { _ in
            isPaused.toggle()
            return .handled
        }
        .onKeyPress(.return, phases: .down) { _ in
            if showGameOver {
                dismissGameOverAndRestart()
            } else {
                resetGame()
            }
            return .handled
        }
        .onKeyPress("m", phases: .down) { _ in
            sound.muted.toggle()
            return .handled
        }
    }

    @ViewBuilder
    private var speedUpToast: some View {
        if levels.celebratingLevelUp {
            VStack {
                HStack {
                    Spacer()
                    Text("FASTER")
                        .font(.system(size: 14, weight: .black, design: .rounded))
                        .kerning(1.4)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(
                            Capsule().fill(Color(red: 0.95, green: 0.45, blue: 0.20).opacity(0.85))
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

    @ViewBuilder
    private var gameOverPanel: some View {
        if showGameOver {
            let playerWon = engine.leftScore > engine.rightScore
            VStack(spacing: 14) {
                Text(highScores.celebratingNewBest && playerWon ? "NEW BEST!" : (playerWon ? "VICTORY" : "DEFEAT"))
                    .font(.system(size: 28, weight: .black, design: .rounded))
                    .kerning(2)
                    .foregroundStyle(highScores.celebratingNewBest && playerWon
                        ? Color(red: 1.0, green: 0.85, blue: 0.30)
                        : (playerWon ? .green : .red))

                VStack(spacing: 4) {
                    Text("Final score")
                        .font(.system(size: 11, weight: .black))
                        .kerning(1.2)
                        .foregroundStyle(.white.opacity(0.55))
                    Text("\(engine.leftScore)  :  \(engine.rightScore)")
                        .font(.system(size: 44, weight: .black, design: .rounded))
                        .foregroundStyle(.white)
                }

                if highScores.bestScore > 0 {
                    HStack(spacing: 6) {
                        Image(systemName: "trophy.fill")
                            .foregroundStyle(Color(red: 1.0, green: 0.85, blue: 0.30))
                        Text("Best: \(highScores.bestScore) points")
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
                            highScores.celebratingNewBest && playerWon
                                ? Color(red: 1.0, green: 0.85, blue: 0.30).opacity(0.6)
                                : .white.opacity(0.18),
                            lineWidth: 1
                        )
                    )
                    .shadow(
                        color: highScores.celebratingNewBest && playerWon
                            ? Color(red: 1.0, green: 0.85, blue: 0.30).opacity(0.5)
                            : .black.opacity(0.5),
                        radius: 24
                    )
            )
        }
    }

    private var statusText: String {
        if engine.phase == .won {
            return engine.leftScore > engine.rightScore ? "Player wins" : "AI wins"
        }
        return isPaused ? "Paused" : "First to \(engine.winningScore) · Level \(levels.currentLevel)"
    }

    private func stepGame(at date: Date) {
        let dt = min(max(date.timeIntervalSince(lastTick), 1.0 / 120.0), 1.0 / 20.0)
        lastTick = date
        guard !isPaused, !showGameOver else { return }
        engine.update(dt: dt, leftDirection: leftDirection)

        // SFX hooks via engine event consumption.
        if let event = engine.consumeLastEvent() {
            switch event {
            case .paddleHit:
                sound.play(.match3Pop, volume: 0.5)  // crisp tick
            case .wallBounce:
                sound.play(.match3Pop, volume: 0.3, pitchSemitones: -3)  // lower tick
            case .leftScored:
                sound.play(.victory, volume: 0.6)
                // Player scored → level up + bump ball speed for next rally.
                levels.advance()
                engine.ballSpeedMultiplier = min(2.0, 1.0 + Double(levels.currentLevel - 1) * 0.08)
            case .rightScored:
                sound.play(.uiError, volume: 0.5)  // softer "miss" tone
            }
        }

        // Game-over → commit score + show panel exactly once.
        if engine.phase == .won && !gameOverAnnounced {
            gameOverAnnounced = true
            // Best = player's leftScore at end (max possible = winningScore).
            // A 7-point win beats any 6-or-less; ties broken by speed
            // multiplier (we just commit leftScore for now — clean and clear).
            highScores.commit(score: engine.leftScore)
            sound.play(engine.leftScore > engine.rightScore ? .victory : .gameOver, volume: 0.9)
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 600_000_000)
                withAnimation(.easeOut(duration: 0.30)) {
                    showGameOver = true
                }
            }
        }
    }

    private func resetGame() {
        engine = PongEngine()
        leftDirection = 0
        lastTick = Date()
        isPaused = false
        showGameOver = false
        gameOverAnnounced = false
        lastObservedLeftScore = 0
        lastObservedRightScore = 0
        levels.reset()  // explicit user reset
        sound.play(.uiButtonTap, volume: 0.5)
    }

    private func dismissGameOverAndRestart() {
        showGameOver = false
        gameOverAnnounced = false
        engine = PongEngine()
        leftDirection = 0
        lastTick = Date()
        isPaused = false
        lastObservedLeftScore = 0
        lastObservedRightScore = 0
        // levels NOT reset — per level-replay-not-demote, dying shouldn't
        // drop progression. Pong is a bit unusual since "level" = ball
        // speed, but the carry-forward principle still applies — players
        // who reached fast-ball difficulty should keep that on next game.
        // (Reset button still calls levels.reset() for an explicit fresh start.)
    }

    private func drawPong(context: inout GraphicsContext, size: CGSize) {
        let scale = min(size.width / CGFloat(engine.playfield.width), size.height / CGFloat(engine.playfield.height))
        let originX = (size.width - CGFloat(engine.playfield.width) * scale) / 2
        let originY = (size.height - CGFloat(engine.playfield.height) * scale) / 2

        let playfield = CGRect(
            x: originX,
            y: originY,
            width: CGFloat(engine.playfield.width) * scale,
            height: CGFloat(engine.playfield.height) * scale
        )
        context.fill(Path(playfield), with: .color(.black))

        var centerLine = Path()
        centerLine.move(to: CGPoint(x: playfield.midX, y: playfield.minY + 18))
        centerLine.addLine(to: CGPoint(x: playfield.midX, y: playfield.maxY - 18))
        context.stroke(centerLine, with: .color(.white.opacity(0.28)), style: StrokeStyle(lineWidth: 2, dash: [10, 12]))

        drawPaddle(engine.leftPaddle, context: &context, scale: scale, originX: originX, originY: originY)
        drawPaddle(engine.rightPaddle, context: &context, scale: scale, originX: originX, originY: originY)

        let ballRadius = CGFloat(engine.ball.radius) * scale
        let ballRect = CGRect(
            x: originX + CGFloat(engine.ball.position.x) * scale - ballRadius,
            y: originY + CGFloat(engine.ball.position.y) * scale - ballRadius,
            width: ballRadius * 2,
            height: ballRadius * 2
        )
        context.fill(Path(ellipseIn: ballRect), with: .color(.white))
    }

    private func drawPaddle(_ paddle: ArcadeBody, context: inout GraphicsContext, scale: CGFloat, originX: CGFloat, originY: CGFloat) {
        let paddleRect = CGRect(
            x: originX + CGFloat(paddle.position.x) * scale - 7 * scale,
            y: originY + CGFloat(paddle.position.y - 42) * scale,
            width: 14 * scale,
            height: 84 * scale
        )
        context.fill(Path(roundedRect: paddleRect, cornerRadius: 5 * scale), with: .color(.white))
    }
}
