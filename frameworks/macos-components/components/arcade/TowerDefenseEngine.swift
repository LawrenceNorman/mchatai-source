// BEGIN mChatAI macOS Component: arcade.tower-defense (components/arcade/TowerDefenseEngine.swift)
import Foundation

/// Cross-platform tower kinds, mirroring web `entities/TurretVariants.js`.
/// Stats are tuned for the macOS grid (range in grid cells, not pixels).
enum TowerKind: String, Codable, Sendable, CaseIterable {
    /// Single-target gun. Fast fire, low damage, cheap. Renders as a tracer.
    case basic
    /// Heavy cannon. Slow fire, high damage, splash on impact. Renders as a shell + impact ring.
    case cannon
    /// Frost tower. Single-target, slows the enemy it hits for ~1.5s. Renders as a frost pulse.
    case frost
    /// Continuous laser. Long range, low per-tick damage, draws a glowing beam to the current target.
    case beam

    // MARK: Deprecated aliases (kept for source compatibility with pre-2026-05-03 callers).
    /// Deprecated: use `.beam` (long-range continuous fire). Sniper was a placeholder name; the
    /// cross-platform Lego catalog uses `beam` to match `entities/TurretVariants.js`.
    @available(*, deprecated, renamed: "beam")
    static let sniper: TowerKind = .beam
    /// Deprecated: use `.cannon` (splash-damage heavy round). Splash was descriptive of the
    /// effect; cross-platform parity uses `cannon`.
    @available(*, deprecated, renamed: "cannon")
    static let splash: TowerKind = .cannon

    var cost: Int {
        switch self {
        case .basic:  return 25
        case .cannon: return 75
        case .frost:  return 65
        case .beam:   return 95
        }
    }
    var range: Double {
        switch self {
        case .basic:  return 2.5
        case .cannon: return 1.8
        case .frost:  return 2.2
        case .beam:   return 5.0
        }
    }
    var damage: Double {
        switch self {
        case .basic:  return 24
        case .cannon: return 36
        case .frost:  return 6   // primary purpose is the slow effect, not damage
        case .beam:   return 14  // per-tick; beam fires every fireInterval
        }
    }
    var fireInterval: Double {
        switch self {
        case .basic:  return 0.7
        case .cannon: return 1.4
        case .frost:  return 0.9
        case .beam:   return 0.18 // very fast → looks continuous
        }
    }
    /// Splash radius in grid units (0 means single-target).
    var splashRadius: Double {
        switch self {
        case .cannon: return 1.2
        default: return 0
        }
    }
    /// Seconds the hit enemy stays slowed (0 = no slow effect).
    var slowSeconds: Double {
        switch self {
        case .frost: return 1.6
        default: return 0
        }
    }
    /// Multiplier applied to enemy speed while slowed (1 = no slow).
    var slowFactor: Double {
        switch self {
        case .frost: return 0.45
        default: return 1
        }
    }
    /// Visual class of projectile this kind emits when firing.
    var projectileKind: ArcadeProjectileKind {
        switch self {
        case .basic:  return .tracer
        case .cannon: return .cannonShell
        case .frost:  return .frostPulse
        case .beam:   return .beam
        }
    }
}

enum EnemyKind: String, Codable, Sendable, CaseIterable {
    case normal      // baseline grunt
    case fast        // low health, moves quickly
    case heavy       // high health, slow

    var baseHealth: Double {
        switch self {
        case .normal: return 80
        case .fast: return 40
        case .heavy: return 200
        }
    }
    var speedMultiplier: Double {
        switch self {
        case .normal: return 1.0
        case .fast: return 1.6
        case .heavy: return 0.55
        }
    }
    var bounty: Int {
        switch self {
        case .normal: return 5
        case .fast: return 7
        case .heavy: return 12
        }
    }
}

struct TowerDefenseEnemy: Codable, Identifiable, Equatable, Sendable {
    var id = UUID()
    var pathIndex = 0
    var progress: Double = 0
    var health: Double = 100
    var kind: EnemyKind = .normal
    /// Seconds remaining of frost-slow effect. Engine ticks down each `update`.
    var slowedSeconds: Double = 0
    /// Multiplier applied to speed while `slowedSeconds > 0`. 1.0 means no slow.
    var slowFactor: Double = 1.0
}

struct TowerDefenseTower: Codable, Identifiable, Equatable, Sendable {
    var id = UUID()
    var position: PuzzlePoint
    var range: Double = 2.5
    var damage: Double = 24
    var cooldown: Double = 0
    var kind: TowerKind = .basic
    var fireInterval: Double = 0.7
    var splashRadius: Double = 0
    /// ID of the enemy this tower most-recently fired at. Used by the renderer
    /// so beam towers can draw a continuous line to the live enemy position.
    var lastTargetID: UUID? = nil
}

struct TowerDefenseEngine: Codable, Equatable, Sendable {
    var path: [PuzzlePoint]
    private(set) var enemies: [TowerDefenseEnemy] = []
    private(set) var towers: [TowerDefenseTower] = []
    /// Active visual shots emitted by towers this frame and previous frames.
    /// Renderers should draw + fade these; the engine ticks them on each update
    /// and removes expired travel-class projectiles automatically.
    private(set) var projectiles: [ArcadeProjectile] = []
    private(set) var wave = 0
    private(set) var lives = 10
    private(set) var credits = 100
    private(set) var phase: ArcadePhase = .ready

    init(path: [PuzzlePoint] = [
        PuzzlePoint(row: 4, col: 0),
        PuzzlePoint(row: 4, col: 3),
        PuzzlePoint(row: 2, col: 3),
        PuzzlePoint(row: 2, col: 7)
    ]) {
        self.path = path
    }

    mutating func startWave(count: Int = 6) {
        startWave(composition: defaultComposition(for: wave + 1, count: count))
    }

    /// Start a wave with an explicit composition: array of (kind, count) tuples.
    mutating func startWave(composition: [(EnemyKind, Int)]) {
        wave += 1
        phase = .playing
        var index = 0
        var built: [TowerDefenseEnemy] = []
        for (kind, count) in composition {
            for _ in 0..<count {
                built.append(TowerDefenseEnemy(
                    progress: Double(index) * -0.45,
                    health: kind.baseHealth + Double(wave * 20),
                    kind: kind
                ))
                index += 1
            }
        }
        enemies = built
    }

    /// Default wave composition: early waves are mostly normals; mid waves mix in fast; later waves add heavies.
    private func defaultComposition(for nextWave: Int, count: Int) -> [(EnemyKind, Int)] {
        switch nextWave {
        case 1: return [(.normal, count)]
        case 2: return [(.normal, max(0, count - 2)), (.fast, 2)]
        case 3: return [(.normal, max(0, count - 3)), (.fast, 2), (.heavy, 1)]
        default:
            let heavies = min(3, 1 + (nextWave - 3) / 2)
            let fasts = min(4, 2 + (nextWave - 3) / 3)
            let normals = max(0, count - heavies - fasts)
            return [(.normal, normals), (.fast, fasts), (.heavy, heavies)]
        }
    }

    mutating func placeTower(at point: PuzzlePoint) -> Bool {
        return placeTower(at: point, kind: .basic)
    }

    /// Place a tower of a chosen kind at the given grid point. Returns true if placed.
    @discardableResult
    mutating func placeTower(at point: PuzzlePoint, kind: TowerKind) -> Bool {
        guard credits >= kind.cost, !towers.contains(where: { $0.position == point }) else { return false }
        credits -= kind.cost
        towers.append(TowerDefenseTower(
            position: point,
            range: kind.range,
            damage: kind.damage,
            kind: kind,
            fireInterval: kind.fireInterval,
            splashRadius: kind.splashRadius
        ))
        return true
    }

    mutating func update(dt: Double) {
        guard phase == .playing else { return }

        // Step 1: enemies advance, accounting for any active frost-slow.
        for index in enemies.indices {
            // Decay slow timer; once expired, clear slow factor.
            if enemies[index].slowedSeconds > 0 {
                enemies[index].slowedSeconds = max(0, enemies[index].slowedSeconds - dt)
                if enemies[index].slowedSeconds == 0 { enemies[index].slowFactor = 1.0 }
            }
            let baseSpeed = 0.45 + Double(wave) * 0.03
            let effSlow = enemies[index].slowedSeconds > 0 ? enemies[index].slowFactor : 1.0
            enemies[index].progress += dt * baseSpeed * enemies[index].kind.speedMultiplier * effSlow
            if enemies[index].progress >= Double(path.count - 1) {
                enemies[index].health = 0
                lives -= 1
            }
        }

        // Step 2: each tower picks a target if it has one in range. On fire, we damage the
        // target, optionally apply slow / splash, emit a projectile, and reset cooldown.
        var newProjectiles: [ArcadeProjectile] = []
        for towerIndex in towers.indices {
            towers[towerIndex].cooldown = max(0, towers[towerIndex].cooldown - dt)

            // Pick a target (closest live enemy in range). We do this every tick so beam
            // towers can update their visual link even between fires.
            let targetIndex = enemies.firstIndex(where: { enemy in
                enemy.health > 0 && distance(from: towers[towerIndex].position, to: position(of: enemy)) <= towers[towerIndex].range
            })
            if let ti = targetIndex {
                towers[towerIndex].lastTargetID = enemies[ti].id
            } else {
                towers[towerIndex].lastTargetID = nil
            }

            guard towers[towerIndex].cooldown == 0, let ti = targetIndex else { continue }
            let tower = towers[towerIndex]

            // Hit primary target.
            enemies[ti].health -= tower.damage

            // Frost effect: tag enemy with slow.
            if tower.kind.slowSeconds > 0 {
                enemies[ti].slowedSeconds = max(enemies[ti].slowedSeconds, tower.kind.slowSeconds)
                enemies[ti].slowFactor = min(enemies[ti].slowFactor, tower.kind.slowFactor)
            }

            // Splash effect: damage neighbors of the primary target's tile.
            if tower.splashRadius > 0 {
                let center = position(of: enemies[ti])
                for splashIdx in enemies.indices where splashIdx != ti && enemies[splashIdx].health > 0 {
                    if distance(from: center, to: position(of: enemies[splashIdx])) <= tower.splashRadius {
                        enemies[splashIdx].health -= tower.damage * 0.5
                    }
                }
            }

            // Emit a projectile for the renderer.
            let lifetime: Double
            switch tower.kind {
            case .basic:  lifetime = 0.16
            case .cannon: lifetime = 0.32
            case .frost:  lifetime = 0.22
            case .beam:   lifetime = 0.0     // beam is drawn for the duration of the cooldown
            }
            newProjectiles.append(ArcadeProjectile(
                kind: tower.kind.projectileKind,
                originPoint: tower.position,
                targetPoint: position(of: enemies[ti]),
                followsEnemyID: enemies[ti].id,
                lifetime: lifetime
            ))

            towers[towerIndex].cooldown = tower.fireInterval
        }

        // Step 3: tick existing travel-class projectiles. Beams expire after one update tick
        // unless the parent tower is still firing at the same target — we approximate this by
        // letting beams persist as long as the tower's lastTargetID matches.
        for pIndex in projectiles.indices {
            if projectiles[pIndex].kind == .beam {
                // Mark beam dead if its source tower no longer has that target locked.
                let stillLocked = towers.contains { tower in
                    tower.position == projectiles[pIndex].originPoint &&
                    tower.lastTargetID == projectiles[pIndex].followsEnemyID
                }
                if !stillLocked { projectiles[pIndex].live = false }
            } else if projectiles[pIndex].lifetime > 0 {
                projectiles[pIndex].t += dt / projectiles[pIndex].lifetime
                if projectiles[pIndex].t >= 1.0 {
                    projectiles[pIndex].t = 1.0
                    projectiles[pIndex].live = false
                }
            }
        }
        projectiles.removeAll { !$0.live }
        projectiles.append(contentsOf: newProjectiles)

        // Step 4: bounty + cleanup + win/loss.
        let bounty = enemies
            .filter { $0.health <= 0 && $0.progress < Double(path.count - 1) }
            .reduce(0) { $0 + $1.kind.bounty }
        credits += bounty
        enemies.removeAll { $0.health <= 0 }
        // Remove projectiles whose target enemy is gone (prevents stale beams).
        projectiles.removeAll { proj in
            if let id = proj.followsEnemyID, !enemies.contains(where: { $0.id == id }) { return true }
            return false
        }

        if lives <= 0 {
            phase = .lost
        } else if enemies.isEmpty {
            phase = .won
            projectiles.removeAll()
        }
    }

    func position(of enemy: TowerDefenseEnemy) -> PuzzlePoint {
        let index = max(0, min(path.count - 1, Int(enemy.progress.rounded(.down))))
        return path[index]
    }

    private func distance(from a: PuzzlePoint, to b: PuzzlePoint) -> Double {
        let row = Double(a.row - b.row)
        let col = Double(a.col - b.col)
        return (row * row + col * col).squareRoot()
    }
}

/// Library of named tower-defense paths so generated apps can rotate maps instead of
/// always shipping the same hard-coded L-shape.
enum TowerDefensePreset {
    /// Simple S-shape — left to right with one bend. Good for the first map a player sees.
    static let serpentine: [PuzzlePoint] = [
        PuzzlePoint(row: 5, col: 0),
        PuzzlePoint(row: 5, col: 4),
        PuzzlePoint(row: 2, col: 4),
        PuzzlePoint(row: 2, col: 9),
        PuzzlePoint(row: 7, col: 9),
        PuzzlePoint(row: 7, col: 13)
    ]
    /// Spiraling path that gives towers in the middle multiple shooting opportunities.
    static let spiral: [PuzzlePoint] = [
        PuzzlePoint(row: 0, col: 0),
        PuzzlePoint(row: 0, col: 11),
        PuzzlePoint(row: 6, col: 11),
        PuzzlePoint(row: 6, col: 3),
        PuzzlePoint(row: 3, col: 3),
        PuzzlePoint(row: 3, col: 8)
    ]
    /// Fork-and-merge layout entering from two sides.
    static let bottleneck: [PuzzlePoint] = [
        PuzzlePoint(row: 0, col: 6),
        PuzzlePoint(row: 4, col: 6),
        PuzzlePoint(row: 4, col: 12),
        PuzzlePoint(row: 8, col: 12),
        PuzzlePoint(row: 8, col: 0)
    ]

    /// Picks one preset based on day-of-year so the same goal yields different maps over time.
    static func daily(referenceDate: Date = Date()) -> [PuzzlePoint] {
        let bank = [serpentine, spiral, bottleneck]
        let day = Calendar.current.ordinality(of: .day, in: .year, for: referenceDate) ?? 1
        return bank[abs(day - 1) % bank.count]
    }
}
// END mChatAI macOS Component: arcade.tower-defense
