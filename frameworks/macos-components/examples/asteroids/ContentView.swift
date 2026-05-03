import SwiftUI

struct ContentView: View {
    @State private var engine = AsteroidsEngine()
    @State private var controls = ArcadeControls()
    @State private var isPaused = false
    @State private var hasStarted = false
    @State private var lastTick = Date()
    @AppStorage("asteroids.bestScore") private var bestScore = 0
    @FocusState private var hasKeyboardFocus: Bool

    private let timer = Timer.publish(every: 1.0 / 60.0, on: .main, in: .common).autoconnect()

    var body: some View {
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
        .frame(minWidth: 860, minHeight: 680)
        .background(Color(nsColor: .windowBackgroundColor))
        .focusable()
        .focused($hasKeyboardFocus)
        .onAppear {
            hasKeyboardFocus = true
            print("[AsteroidsExample] ready score=\(engine.score) lives=\(engine.lives) rocks=\(engine.rocks.count)")
        }
        .onReceive(timer) { date in
            stepGame(at: date)
        }
        .onKeyPress(.leftArrow, phases: .down) { _ in
            pulseControl(\.left)
            return .handled
        }
        .onKeyPress(.rightArrow, phases: .down) { _ in
            pulseControl(\.right)
            return .handled
        }
        .onKeyPress(.upArrow, phases: .down) { _ in
            pulseControl(\.up)
            return .handled
        }
        .onKeyPress(.space, phases: .down) { _ in
            fire()
            return .handled
        }
        .onKeyPress(.return, phases: .down) { _ in
            if engine.phase == .lost {
                resetGame()
            } else {
                fire()
            }
            return .handled
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Native Asteroids")
                    .font(.system(size: 32, weight: .black, design: .rounded))
                Text(statusText)
                    .font(.callout.monospacedDigit())
                    .foregroundStyle(.secondary)
            }

            Spacer()

            HStack(spacing: 26) {
                hudMetric("Score", value: "\(engine.score)")
                hudMetric("Best", value: "\(bestScore)")
                hudMetric("Lives", value: String(repeating: "●", count: max(engine.lives, 0)))
            }
        }
    }

    private var controlsBar: some View {
        HStack(spacing: 10) {
            Button(isPaused ? "Resume" : "Pause") {
                isPaused.toggle()
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

            Spacer()

            Text("← / → rotate   ↑ thrust   Space fire")
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
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
        bestScore = max(bestScore, engine.score)
        guard hasStarted, !isPaused else { return }
        engine.update(dt: dt, controls: controls)
        bestScore = max(bestScore, engine.score)
    }

    private func fire() {
        guard !isPaused, engine.phase != .lost else { return }
        hasStarted = true
        engine.fire()
    }

    private func resetGame() {
        engine = AsteroidsEngine()
        controls = ArcadeControls()
        isPaused = false
        hasStarted = false
        lastTick = Date()
        hasKeyboardFocus = true
    }

    private func pulseControl(_ keyPath: WritableKeyPath<ArcadeControls, Bool>) {
        hasStarted = true
        controls[keyPath: keyPath] = true
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

        if engine.phase != .lost {
            drawShip(context: &context, transform: transform)
            drawShield(context: &context, transform: transform)
        } else {
            drawExplosion(context: &context, transform: transform)
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
