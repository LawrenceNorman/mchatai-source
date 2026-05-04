// Example glue — adapt freely. Game-state observable that bridges the
// SwiftUI overlay (ContentView) and the SpriteKit scene (GameScene).
//
// The phase enum models the game lifecycle so the overlay can show the
// right UI: HUD during .playing, the restart button during .gameOver
// (mac-022 — visible on-screen restart button is mandatory).

import SwiftUI
import SpriteKit

enum GamePhase: Equatable {
    case playing
    case gameOver(score: Int, reason: String)
}

@MainActor
final class GameModel: ObservableObject {
    @Published var phase: GamePhase = .playing
    @Published var score: Int = 0
    @Published var lives: Int = 3
    @Published var fuel: CGFloat = 1000

    weak var scene: GameScene?

    /// Called by the SwiftUI restart button OR the Cmd+N menu shortcut.
    /// Resets all game state and tells the scene to rebuild.
    func requestRestart() {
        phase = .playing
        score = 0
        lives = 3
        fuel = 1000
        scene?.startNewGame()
    }

    /// Called by the SpriteKit scene when the player loses their last life.
    func reportGameOver(reason: String) {
        phase = .gameOver(score: score, reason: reason)
    }
}
