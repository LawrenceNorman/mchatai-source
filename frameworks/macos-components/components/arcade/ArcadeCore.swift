// BEGIN mChatAI macOS Component: arcade.core (components/arcade/ArcadeCore.swift)
import Foundation

struct ArcadeVector: Codable, Equatable, Sendable {
    var x: Double
    var y: Double

    static let zero = ArcadeVector(x: 0, y: 0)

    var length: Double {
        (x * x + y * y).squareRoot()
    }

    func normalized() -> ArcadeVector {
        let length = max(length, 0.0001)
        return ArcadeVector(x: x / length, y: y / length)
    }

    func scaled(by value: Double) -> ArcadeVector {
        ArcadeVector(x: x * value, y: y * value)
    }

    static func + (lhs: ArcadeVector, rhs: ArcadeVector) -> ArcadeVector {
        ArcadeVector(x: lhs.x + rhs.x, y: lhs.y + rhs.y)
    }

    static func - (lhs: ArcadeVector, rhs: ArcadeVector) -> ArcadeVector {
        ArcadeVector(x: lhs.x - rhs.x, y: lhs.y - rhs.y)
    }
}

struct ArcadeBody: Codable, Equatable, Identifiable, Sendable {
    var id = UUID()
    var position: ArcadeVector
    var velocity: ArcadeVector = .zero
    var radius: Double = 12
    var angle: Double = 0
    var isAlive = true

    mutating func integrate(dt: Double) {
        position = position + velocity.scaled(by: dt)
    }

    mutating func wrap(in playfield: ArcadePlayfield) {
        if position.x < 0 { position.x += playfield.width }
        if position.x > playfield.width { position.x -= playfield.width }
        if position.y < 0 { position.y += playfield.height }
        if position.y > playfield.height { position.y -= playfield.height }
    }

    func intersects(_ other: ArcadeBody) -> Bool {
        (position - other.position).length <= radius + other.radius
    }
}

struct ArcadePlayfield: Codable, Equatable, Sendable {
    var width: Double = 900
    var height: Double = 620

    var center: ArcadeVector {
        ArcadeVector(x: width / 2, y: height / 2)
    }
}

struct ArcadeControls: Codable, Equatable, Sendable {
    var left = false
    var right = false
    var up = false
    var down = false
    var fire = false
    var jump = false
}

enum ArcadePhase: String, Codable, Sendable {
    case ready
    case playing
    case won
    case lost
}
// END mChatAI macOS Component: arcade.core
