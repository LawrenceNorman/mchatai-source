// Example glue — adapt freely. SwiftUI Canvas host that:
//   1. Owns a PlatformerEngine and per-frame timer.
//   2. Reads keyboard input → ArcadeControls (left/right/jump).
//   3. Renders player + platforms + coins via Canvas (no SpriteKit needed
//      for this simple platformer; if you want SpriteKit physics for a
//      heavier game, see examples/spritekit-physics/ instead).
//   4. Shows a VISIBLE Play Again button when the player falls (mac-022).
//
// Reskin guidance: change tile/sprite art, colors, sound effects, level
// layouts (engine.platforms array), coin positions. Keep the engine
// composition (`engine.update(dt:controls:)`) as-is so the gate sees
// PlatformerEngine being driven from app-specific glue.

import SwiftUI

struct ContentView: View {
    @State private var engine = PlatformerEngine()
    @State private var controls = ArcadeControls()
    @State private var lastTick = Date()
    @State private var isPaused = false
    @FocusState private var hasKeyboardFocus: Bool

    private let timer = Timer.publish(every: 1.0 / 60.0, on: .main, in: .common).autoconnect()
    private let playfieldWidth: Double = 1200
    private let playfieldHeight: Double = 480

    var body: some View {
        VStack(spacing: 16) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Platformer")
                        .font(.system(size: 30, weight: .bold, design: .rounded))
                    Text(statusText)
                        .font(.callout.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text("SCORE \(engine.score)")
                    .font(.system(size: 28, weight: .black, design: .rounded))
                    .monospacedDigit()
            }

            ZStack {
                GeometryReader { proxy in
                    Canvas { context, size in
                        drawScene(context: &context, size: size)
                    }
                    .background(Color(red: 0.04, green: 0.07, blue: 0.13))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay {
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(.white.opacity(0.14), lineWidth: 1)
                    }
                    .contentShape(Rectangle())
                    .onTapGesture { hasKeyboardFocus = true }
                    .accessibilityLabel("Platformer playfield \(Int(proxy.size.width)) by \(Int(proxy.size.height))")
                }
                .frame(height: 360)

                // Game-over overlay — VISIBLE RESTART BUTTON (mac-022)
                if engine.phase == .lost {
                    VStack(spacing: 14) {
                        Text("YOU FELL")
                            .font(.system(size: 40, weight: .black, design: .rounded))
                            .foregroundStyle(.white)
                        Text("Final score: \(engine.score)")
                            .font(.title3.monospacedDigit())
                            .foregroundStyle(.white.opacity(0.85))
                        Button {
                            resetGame()
                        } label: {
                            Text("Play Again")
                                .font(.title3.bold())
                                .padding(.horizontal, 28)
                                .padding(.vertical, 10)
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                        .keyboardShortcut(.return, modifiers: [])
                    }
                    .padding(28)
                    .background(.black.opacity(0.85))
                    .clipShape(RoundedRectangle(cornerRadius: 18))
                }
            }

            HStack(spacing: 10) {
                Button(isPaused ? "Resume" : "Pause") { isPaused.toggle() }
                    .keyboardShortcut(.space, modifiers: [])
                Button("Reset") { resetGame() }
                Spacer()
                Text("← / → move · Space jumps")
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
            print("[PlatformerExample] ready — score=\(engine.score) platforms=\(engine.platforms.count)")
        }
        .onReceive(timer) { date in stepGame(at: date) }
        .onReceive(NotificationCenter.default.publisher(for: .platformerNewGame)) { _ in resetGame() }
        .onKeyPress(.leftArrow, phases: [.down, .up]) { press in
            controls.left = (press.phase == .down)
            return .handled
        }
        .onKeyPress(.rightArrow, phases: [.down, .up]) { press in
            controls.right = (press.phase == .down)
            return .handled
        }
        .onKeyPress(.space, phases: .down) { _ in
            controls.jump = true
            // Single-shot impulse — engine consumes jump on this frame.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                controls.jump = false
            }
            return .handled
        }
    }

    private var statusText: String {
        switch engine.phase {
        case .playing: return "Running"
        case .lost:    return "Fell off the world"
        case .won:     return "Cleared!"
        case .ready:   return "Ready"
        }
    }

    private func stepGame(at date: Date) {
        let dt = min(max(date.timeIntervalSince(lastTick), 1.0 / 120.0), 1.0 / 20.0)
        lastTick = date
        guard !isPaused else { return }
        engine.update(dt: dt, controls: controls)
    }

    private func resetGame() {
        engine = PlatformerEngine()
        controls = ArcadeControls()
        lastTick = Date()
        isPaused = false
    }

    // MARK: - Rendering

    private func drawScene(context: inout GraphicsContext, size: CGSize) {
        let scale = min(size.width / playfieldWidth, size.height / playfieldHeight)
        let originX = (size.width - playfieldWidth * scale) / 2
        let originY = (size.height - playfieldHeight * scale) / 2

        // Sky gradient stripe
        let stripeRect = CGRect(x: originX, y: originY, width: playfieldWidth * scale, height: playfieldHeight * scale)
        context.fill(Path(stripeRect), with: .color(Color(red: 0.06, green: 0.10, blue: 0.18)))

        // Platforms
        for platform in engine.platforms {
            let rect = CGRect(
                x: originX + platform.minX * scale,
                y: originY + platform.minY * scale,
                width: platform.width * scale,
                height: platform.height * scale
            )
            context.fill(Path(roundedRect: rect, cornerRadius: 4), with: .color(Color(red: 0.30, green: 0.62, blue: 0.42)))
        }

        // Player
        let playerRadius = engine.player.body.radius * scale
        let playerRect = CGRect(
            x: originX + engine.player.body.position.x * scale - playerRadius,
            y: originY + engine.player.body.position.y * scale - playerRadius,
            width: playerRadius * 2,
            height: playerRadius * 2
        )
        context.fill(Path(roundedRect: playerRect, cornerRadius: playerRadius * 0.4), with: .color(Color.orange))
    }
}
