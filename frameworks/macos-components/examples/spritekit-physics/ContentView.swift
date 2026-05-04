// Example glue — adapt freely. SwiftUI host that:
//   1. Embeds the SKView via SpriteView (SwiftUI's SpriteKit bridge).
//   2. Renders an HUD on top of the scene with score / lives / fuel.
//   3. Renders a game-over overlay with a VISIBLE restart button (mac-022).
//
// The SpriteKit scene is constructed once in onAppear so the SKView keeps
// its physics state across SwiftUI re-renders.

import SwiftUI
import SpriteKit

struct ContentView: View {
    @EnvironmentObject var game: GameModel
    @State private var scene: GameScene = {
        let s = GameScene(size: CGSize(width: 700, height: 500))
        s.scaleMode = .resizeFill
        return s
    }()

    var body: some View {
        ZStack {
            SpriteView(scene: scene, options: [.shouldCullNonVisibleNodes])
                .ignoresSafeArea()
                .onAppear {
                    scene.model = game
                    game.scene = scene
                }

            // HUD — top-left
            VStack {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("SCORE \(game.score)").font(.system(.title3, design: .monospaced).bold())
                        Text("LIVES \(game.lives)   FUEL \(Int(game.fuel))")
                            .font(.system(.caption, design: .monospaced))
                            .foregroundStyle(.secondary)
                    }
                    .padding(12)
                    .background(.black.opacity(0.55))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .foregroundStyle(.white)
                    Spacer()
                }
                Spacer()
            }
            .padding(16)
            .allowsHitTesting(false)

            // Game-over overlay — VISIBLE RESTART BUTTON (mac-022)
            if case .gameOver(let finalScore, let reason) = game.phase {
                VStack(spacing: 16) {
                    Text("GAME OVER")
                        .font(.system(size: 48, weight: .black, design: .rounded))
                        .foregroundStyle(.white)
                    Text(reason)
                        .font(.headline)
                        .foregroundStyle(.white.opacity(0.85))
                    Text("Final score: \(finalScore)")
                        .font(.title2.monospacedDigit())
                        .foregroundStyle(.white)
                    Button {
                        game.requestRestart()
                    } label: {
                        Text("Play Again")
                            .font(.title3.bold())
                            .padding(.horizontal, 28)
                            .padding(.vertical, 10)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .keyboardShortcut(.return, modifiers: [])
                    .tint(.accentColor)
                    .padding(.top, 8)
                    Text("Press Return to restart")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.5))
                }
                .padding(36)
                .background(.black.opacity(0.85))
                .clipShape(RoundedRectangle(cornerRadius: 18))
                .shadow(radius: 12)
            }
        }
        .frame(minWidth: 600, minHeight: 500)
    }
}
