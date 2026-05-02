// BEGIN mChatAI macOS Component: arcade.pong (components/arcade/PongEngine.swift)
import Foundation

struct PongEngine: Codable, Equatable, Sendable {
    var playfield = ArcadePlayfield(width: 900, height: 560)
    private(set) var leftPaddle = ArcadeBody(position: ArcadeVector(x: 32, y: 280), radius: 34)
    private(set) var rightPaddle = ArcadeBody(position: ArcadeVector(x: 868, y: 280), radius: 34)
    private(set) var ball = ArcadeBody(position: ArcadeVector(x: 450, y: 280), velocity: ArcadeVector(x: 320, y: 140), radius: 10)
    private(set) var leftScore = 0
    private(set) var rightScore = 0
    var winningScore = 7
    private(set) var phase: ArcadePhase = .playing

    mutating func update(dt: Double, leftDirection: Double, rightDirection: Double? = nil) {
        guard phase == .playing else { return }
        movePaddle(&leftPaddle, direction: leftDirection, dt: dt)
        let aiDirection = rightDirection ?? (ball.position.y > rightPaddle.position.y ? 1 : -1)
        movePaddle(&rightPaddle, direction: aiDirection, dt: dt)

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

    private mutating func movePaddle(_ paddle: inout ArcadeBody, direction: Double, dt: Double) {
        paddle.position.y += max(-1, min(1, direction)) * 380 * dt
        paddle.position.y = max(42, min(playfield.height - 42, paddle.position.y))
    }

    private mutating func bounceIfNeeded(paddle: ArcadeBody, direction: Double) {
        guard ball.intersects(paddle), ball.velocity.x.sign == direction.sign else { return }
        ball.velocity.x = abs(ball.velocity.x) * direction
        ball.velocity.y += (ball.position.y - paddle.position.y) * 5
    }
}
// END mChatAI macOS Component: arcade.pong
