// BEGIN mChatAI macOS Component: arcade.pong (components/arcade/PongEngine.swift)
import Foundation

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

    mutating func update(dt: Double, leftDirection: Double, rightDirection: Double? = nil) {
        guard phase == .playing else { return }
        leftPaddle = movedPaddle(leftPaddle, direction: leftDirection, dt: dt, playfieldHeight: playfield.height)
        let aiDirection = rightDirection ?? (ball.position.y > rightPaddle.position.y ? 1 : -1)
        rightPaddle = movedPaddle(rightPaddle, direction: aiDirection, dt: dt, playfieldHeight: playfield.height)

        ball.integrate(dt: dt)
        if ball.position.y < ball.radius || ball.position.y > playfield.height - ball.radius {
            ball.velocity.y *= -1
        }
        bounceIfNeeded(paddle: leftPaddle, direction: 1)
        bounceIfNeeded(paddle: rightPaddle, direction: -1)

        if ball.position.x < 0 {
            rightScore += 1
            resetBall(direction: -1)
        } else if ball.position.x > playfield.width {
            leftScore += 1
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
        // AABB-vs-circle: the paddle is logically a rectangle, so use the
        // rect-aware intersects helper. Circle-vs-circle (`ball.intersects(paddle)`)
        // would treat the paddle's tall radius as a wide bounding circle, causing
        // the ball to bounce in empty space ~30px in front of the paddle's actual
        // edge. Filed 2026-05-04 after user feedback on shipped Native Pong.
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
    }
}
// END mChatAI macOS Component: arcade.pong
