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
    private(set) var respawnShield: Double = 1.6
    /// Current wave number, 1-indexed. Auto-increments when the engine
    /// detects all rocks have been cleared and resetWave() fires for the
    /// next wave. Drives spawn count + speed via resetWave(wave:).
    private(set) var wave: Int = 1

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
        respawnShield = max(0, respawnShield - dt)
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
            wave += 1
            resetWave(wave: wave)
        }
    }

    mutating func fire() {
        guard shots.count < 5 else { return }
        let direction = ArcadeVector(x: cos(ship.angle), y: sin(ship.angle))
        let start = ship.position + direction.scaled(by: ship.radius + 6)
        let body = ArcadeBody(position: start, velocity: ship.velocity + direction.scaled(by: 460), radius: 4, angle: ship.angle)
        shots.append(AsteroidsShot(body: body))
    }

    /// Reset to a fresh wave of asteroids. `wave` (1-indexed) controls
    /// difficulty: large-rock count grows by 1 every 2 waves (cap 8),
    /// medium starters added from wave 3 (cap 3), velocity scales 1.0×→2.0×
    /// by wave 10 then caps. Default wave=1 preserves the original "3 rocks"
    /// behavior for legacy callers / smoke tests.
    mutating func resetWave(wave: Int = 1) {
        phase = .playing
        let level = max(1, min(20, wave))
        // Rock count: 2 large at wave 1, +1 per 2 waves, capped at 8.
        let largeCount = min(8, 2 + (level - 1) / 2)
        // Bonus medium starters from wave 3 onward.
        let mediumCount = level >= 3 ? min(3, 1 + (level - 3) / 4) : 0
        // Velocity multiplier: 1.0× at wave 1, 2.0× by wave 10, capped.
        let speedMul = min(2.0, 1.0 + Double(level - 1) * 0.11)

        var spawned: [AsteroidsRock] = []
        // Distribute large rocks around the perimeter at evenly spaced
        // angles so they spawn away from ship-center.
        for i in 0..<largeCount {
            let angle = Double(i) / Double(max(1, largeCount)) * .pi * 2
            let pos = ArcadeVector(
                x: playfield.center.x + cos(angle) * 320,
                y: playfield.center.y + sin(angle) * 220
            )
            let vx = sin(angle) * 38 * speedMul + Double(i % 2 == 0 ? 6 : -10)
            let vy = -cos(angle) * 38 * speedMul + Double(i % 2 == 0 ? -8 : 12)
            spawned.append(AsteroidsRock(
                position: pos,
                velocity: ArcadeVector(x: vx, y: vy),
                size: .large
            ))
        }
        for i in 0..<mediumCount {
            let angle = Double(i) / Double(max(1, mediumCount)) * .pi * 2 + .pi / 4
            let pos = ArcadeVector(
                x: playfield.center.x + cos(angle) * 180,
                y: playfield.center.y + sin(angle) * 140
            )
            spawned.append(AsteroidsRock(
                position: pos,
                velocity: ArcadeVector(x: cos(angle) * 60 * speedMul, y: sin(angle) * 60 * speedMul),
                size: .medium
            ))
        }
        rocks = spawned
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
        guard respawnShield <= 0 else { return }
        guard rocks.contains(where: { ship.intersects($0.body) }) else { return }
        lives -= 1
        ship = ArcadeBody(position: playfield.center, radius: 18)
        respawnShield = 1.6
        if lives <= 0 {
            phase = .lost
        }
    }
}
// END mChatAI macOS Component: arcade.asteroids
