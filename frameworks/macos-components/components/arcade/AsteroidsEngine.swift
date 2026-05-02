// BEGIN mChatAI macOS Component: arcade.asteroids (components/arcade/AsteroidsEngine.swift)
import Foundation

struct AsteroidsRock: Codable, Equatable, Identifiable, Sendable {
    enum Size: String, Codable, Sendable {
        case large
        case medium
        case small

        var radius: Double {
            switch self {
            case .large: return 44
            case .medium: return 28
            case .small: return 16
            }
        }

        var next: Size? {
            switch self {
            case .large: return .medium
            case .medium: return .small
            case .small: return nil
            }
        }
    }

    var id = UUID()
    var body: ArcadeBody
    var size: Size

    init(position: ArcadeVector, velocity: ArcadeVector, size: Size) {
        self.size = size
        self.body = ArcadeBody(position: position, velocity: velocity, radius: size.radius)
    }
}

struct AsteroidsShot: Codable, Equatable, Identifiable, Sendable {
    var id = UUID()
    var body: ArcadeBody
    var ttl: Double = 1.1
}

struct AsteroidsEngine: Codable, Equatable, Sendable {
    var playfield = ArcadePlayfield()
    private(set) var ship = ArcadeBody(position: ArcadeVector(x: 450, y: 310), radius: 18)
    private(set) var rocks: [AsteroidsRock] = []
    private(set) var shots: [AsteroidsShot] = []
    private(set) var score = 0
    private(set) var lives = 3
    private(set) var phase: ArcadePhase = .ready

    init() {
        resetWave()
    }

    mutating func setShip(position: ArcadeVector) {
        ship.position = position
    }

    mutating func update(dt: Double, controls: ArcadeControls) {
        if phase == .ready { phase = .playing }
        guard phase == .playing else { return }

        if controls.left { ship.angle -= 4.5 * dt }
        if controls.right { ship.angle += 4.5 * dt }
        if controls.up {
            let thrust = ArcadeVector(x: cos(ship.angle), y: sin(ship.angle)).scaled(by: 260 * dt)
            ship.velocity = ship.velocity + thrust
        }
        ship.velocity = ship.velocity.scaled(by: 0.992)
        ship.integrate(dt: dt)
        ship.wrap(in: playfield)

        for index in rocks.indices {
            rocks[index].body.integrate(dt: dt)
            rocks[index].body.wrap(in: playfield)
        }

        for index in shots.indices {
            shots[index].ttl -= dt
            shots[index].body.integrate(dt: dt)
            shots[index].body.wrap(in: playfield)
        }
        shots.removeAll { $0.ttl <= 0 }

        resolveShotHits()
        resolveShipHits()
        if rocks.isEmpty {
            score += 500
            resetWave()
        }
    }

    mutating func fire() {
        guard shots.count < 5 else { return }
        let direction = ArcadeVector(x: cos(ship.angle), y: sin(ship.angle))
        let start = ship.position + direction.scaled(by: ship.radius + 6)
        let body = ArcadeBody(position: start, velocity: ship.velocity + direction.scaled(by: 460), radius: 4, angle: ship.angle)
        shots.append(AsteroidsShot(body: body))
    }

    mutating func resetWave() {
        phase = .playing
        rocks = [
            AsteroidsRock(position: ArcadeVector(x: 120, y: 110), velocity: ArcadeVector(x: 42, y: 34), size: .large),
            AsteroidsRock(position: ArcadeVector(x: 760, y: 180), velocity: ArcadeVector(x: -30, y: 48), size: .large),
            AsteroidsRock(position: ArcadeVector(x: 620, y: 500), velocity: ArcadeVector(x: -50, y: -28), size: .medium)
        ]
        shots.removeAll()
    }

    private mutating func resolveShotHits() {
        var newRocks: [AsteroidsRock] = []
        for shot in shots {
            guard let rockIndex = rocks.firstIndex(where: { shot.body.intersects($0.body) }) else {
                newRocks.append(contentsOf: [])
                continue
            }
            let rock = rocks.remove(at: rockIndex)
            score += rock.size == .large ? 50 : rock.size == .medium ? 100 : 200
            if let nextSize = rock.size.next {
                newRocks.append(AsteroidsRock(position: rock.body.position, velocity: ArcadeVector(x: rock.body.velocity.y, y: -rock.body.velocity.x), size: nextSize))
                newRocks.append(AsteroidsRock(position: rock.body.position, velocity: ArcadeVector(x: -rock.body.velocity.y, y: rock.body.velocity.x), size: nextSize))
            }
        }
        rocks.append(contentsOf: newRocks)
        shots.removeAll { shot in
            !rocks.allSatisfy { !shot.body.intersects($0.body) }
        }
    }

    private mutating func resolveShipHits() {
        guard rocks.contains(where: { ship.intersects($0.body) }) else { return }
        lives -= 1
        ship = ArcadeBody(position: playfield.center, radius: 18)
        if lives <= 0 {
            phase = .lost
        }
    }
}
// END mChatAI macOS Component: arcade.asteroids
