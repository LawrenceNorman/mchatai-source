// BEGIN mChatAI macOS Component: arcade.platformer (components/arcade/PlatformerEngine.swift)
import Foundation

struct PlatformerPlayer: Codable, Equatable, Sendable {
    var body = ArcadeBody(position: ArcadeVector(x: 80, y: 220), radius: 18)
    var isGrounded = false
    var facingRight = true
}

struct PlatformRect: Codable, Equatable, Sendable {
    var minX: Double
    var minY: Double
    var width: Double
    var height: Double

    var maxX: Double { minX + width }
    var maxY: Double { minY + height }

    func containsHorizontal(_ x: Double) -> Bool {
        x >= minX && x <= maxX
    }
}

struct PlatformerEngine: Codable, Equatable, Sendable {
    private(set) var player = PlatformerPlayer()
    var platforms: [PlatformRect] = [
        PlatformRect(minX: 0, minY: 320, width: 1200, height: 32),
        PlatformRect(minX: 220, minY: 245, width: 140, height: 18),
        PlatformRect(minX: 440, minY: 190, width: 130, height: 18)
    ]
    private(set) var coins = Set<PuzzlePoint>()
    private(set) var score = 0
    private(set) var phase: ArcadePhase = .playing

    mutating func update(dt: Double, controls: ArcadeControls) {
        guard phase == .playing else { return }
        let acceleration = 620.0
        if controls.left {
            player.body.velocity.x -= acceleration * dt
            player.facingRight = false
        }
        if controls.right {
            player.body.velocity.x += acceleration * dt
            player.facingRight = true
        }
        if controls.jump && player.isGrounded {
            player.body.velocity.y = -430
            player.isGrounded = false
        }

        player.body.velocity.y += 980 * dt
        player.body.velocity.x *= 0.88
        player.body.integrate(dt: dt)
        resolvePlatforms()

        if player.body.position.y > 720 {
            phase = .lost
        }
    }

    mutating func collectCoin(at point: PuzzlePoint) {
        if coins.remove(point) != nil {
            score += 10
        }
    }

    private mutating func resolvePlatforms() {
        player.isGrounded = false
        for platform in platforms {
            let feetY = player.body.position.y + player.body.radius
            guard player.body.velocity.y >= 0,
                  platform.containsHorizontal(player.body.position.x),
                  feetY >= platform.minY,
                  feetY <= platform.minY + 24 else { continue }
            player.body.position.y = platform.minY - player.body.radius
            player.body.velocity.y = 0
            player.isGrounded = true
        }
    }
}
// END mChatAI macOS Component: arcade.platformer
