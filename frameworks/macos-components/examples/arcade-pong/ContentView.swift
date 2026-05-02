import SwiftUI

struct ContentView: View {
    @State private var engine = PongEngine()
    @State private var leftDirection = 0.0
    @State private var isPaused = false
    @State private var lastTick = Date()
    @FocusState private var hasKeyboardFocus: Bool

    private let timer = Timer.publish(every: 1.0 / 60.0, on: .main, in: .common).autoconnect()

    var body: some View {
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
                }
                .keyboardShortcut(.space, modifiers: [])

                Button("Reset") {
                    resetGame()
                }
                .keyboardShortcut(.return, modifiers: [])

                Spacer()

                Text("Up / Down arrows move")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(24)
        .frame(minWidth: 760, minHeight: 560)
        .focusable()
        .focused($hasKeyboardFocus)
        .onAppear {
            hasKeyboardFocus = true
            print("[PongExample] ready leftScore=\(engine.leftScore) rightScore=\(engine.rightScore)")
        }
        .onReceive(timer) { date in
            stepGame(at: date)
        }
        .onKeyPress(.upArrow, phases: .down) { _ in
            pulseLeftDirection(-1)
            return .handled
        }
        .onKeyPress(.downArrow, phases: .down) { _ in
            pulseLeftDirection(1)
            return .handled
        }
        .onKeyPress(.space, phases: .down) { _ in
            isPaused.toggle()
            return .handled
        }
        .onKeyPress(.return, phases: .down) { _ in
            resetGame()
            return .handled
        }
    }

    private var statusText: String {
        if engine.phase == .won {
            return engine.leftScore > engine.rightScore ? "Player wins" : "AI wins"
        }
        return isPaused ? "Paused" : "First to \(engine.winningScore)"
    }

    private func stepGame(at date: Date) {
        let dt = min(max(date.timeIntervalSince(lastTick), 1.0 / 120.0), 1.0 / 20.0)
        lastTick = date
        guard !isPaused else { return }
        engine.update(dt: dt, leftDirection: leftDirection)
    }

    private func resetGame() {
        engine = PongEngine()
        leftDirection = 0
        lastTick = Date()
        isPaused = false
    }

    private func pulseLeftDirection(_ direction: Double) {
        leftDirection = direction
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.09) {
            if leftDirection == direction {
                leftDirection = 0
            }
        }
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
