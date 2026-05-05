// BEGIN mChatAI macOS Component: arcade.pong (components/arcade/PongEngine.swift)
import Foundation

/// Discrete events the View can observe each tick — for SFX hooks.
/// Cleared after the View reads `lastEvent`. Without this, the View has
/// to reverse-engineer collisions by diffing velocity, which is brittle.
enum PongEvent: String, Codable, Sendable {
    case paddleHit
    case wallBounce
    case leftScored      // player scored — bigger SFX
    case rightScored     // AI scored — quieter "miss" SFX
}

struct PongEngine: Codable, Equatable, Sendable {
    var playfield = ArcadePlayfield(width: 900, height: 560)
    /// Paddle is rendered as a tall thin rectangle (paddleHalfWidth × paddleHalfHeight).
    /// Collision uses AABB-vs-circle (see bounceIfNeeded) so the ball only bounces when
    /// it actually overlaps the paddle's rectangle, not its circumscribed circle.
    static let paddleHalfWidth: Double = 6     // 12px wide paddle
    static let paddleHalfHeight: Double = 34   // 68px tall paddle
    private(set) var leftPaddle = ArcadeBody(position: ArcadeVector(x: 32, y: 280), radius: paddleHalfHeight)
    private(set) var rightPaddle = ArcadeBody(position: ArcadeVector(x: 868, y: 280), radius: paddleHalfHeight)
    private(set) var ball = ArcadeBody(position: ArcadeVector(x: 450, y: 280), velocity: ArcadeVector(x: 320, y: 140), radius: 10)
    private(set) var leftScore = 0
    private(set) var rightScore = 0
    var winningScore = 7
    private(set) var phase: ArcadePhase = .playing
    /// Ball-speed multiplier — applied each tick. The View bumps this on
    /// rally wins so the ball accelerates as the game progresses (1.0×
    /// at start → up to 2.0× by end). Default 1.0 preserves legacy behavior.
    var ballSpeedMultiplier: Double = 1.0
    /// Last paddle/wall hit signal for SFX. Cleared each tick by the
    /// View after observation. Set by bounceIfNeeded + the wall-bounce
    /// branch in update() — gives a clean event-driven signal so the
    /// View doesn't have to reverse-engineer collisions from velocity.
    private(set) var lastEvent: PongEvent?

    /// Read + clear the last observed event. Returns nil if nothing
    /// happened on the most recent tick. Single-shot consumer pattern
    /// so SFX fire exactly once per event.
    mutating func consumeLastEvent() -> PongEvent? {
        let event = lastEvent
        lastEvent = nil
        return event
    }

    mutating func update(dt: Double, leftDirection: Double, rightDirection: Double? = nil) {
        guard phase == .playing else { return }
        leftPaddle = movedPaddle(leftPaddle, direction: leftDirection, dt: dt, playfieldHeight: playfield.height)
        let aiDirection = rightDirection ?? (ball.position.y > rightPaddle.position.y ? 1 : -1)
        rightPaddle = movedPaddle(rightPaddle, direction: aiDirection, dt: dt, playfieldHeight: playfield.height)

        // Apply speed multiplier WITHOUT mutating velocity itself (which
        // is integrated each frame) — scale the dt instead. Equivalent
        // result, no compounding drift.
        ball.integrate(dt: dt * ballSpeedMultiplier)
        if ball.position.y < ball.radius || ball.position.y > playfield.height - ball.radius {
            ball.velocity.y *= -1
            lastEvent = .wallBounce
        }
        bounceIfNeeded(paddle: leftPaddle, direction: 1)
        bounceIfNeeded(paddle: rightPaddle, direction: -1)

        if ball.position.x < 0 {
            rightScore += 1
            lastEvent = .rightScored
            resetBall(direction: -1)
        } else if ball.position.x > playfield.width {
            leftScore += 1
            lastEvent = .leftScored
            resetBall(direction: 1)
        }

        if leftScore >= winningScore || rightScore >= winningScore {
            phase = .won
        }
    }

    mutating func resetBall(direction: Double) {
        ball.position = playfield.center
        ball.velocity = ArcadeVector(x: 320 * direction, y: 120)
    }

    private func movedPaddle(_ paddle: ArcadeBody, direction: Double, dt: Double, playfieldHeight: Double) -> ArcadeBody {
        var paddle = paddle
        paddle.position.y += max(-1, min(1, direction)) * 380 * dt
        paddle.position.y = max(42, min(playfieldHeight - 42, paddle.position.y))
        return paddle
    }

    private mutating func bounceIfNeeded(paddle: ArcadeBody, direction: Double) {
        let isMovingTowardPaddle = direction > 0 ? ball.velocity.x < 0 : ball.velocity.x > 0
        guard ball.intersects(rectCenter: paddle.position,
                              halfWidth: Self.paddleHalfWidth,
                              halfHeight: Self.paddleHalfHeight),
              isMovingTowardPaddle else { return }
        if direction > 0 {
            ball.position.x = paddle.position.x + Self.paddleHalfWidth + ball.radius
        } else {
            ball.position.x = paddle.position.x - Self.paddleHalfWidth - ball.radius
        }
        ball.velocity.x = abs(ball.velocity.x) * direction
        ball.velocity.y += (ball.position.y - paddle.position.y) * 5
        lastEvent = .paddleHit
    }
}
// END mChatAI macOS Component: arcade.pong
