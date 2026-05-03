// BEGIN mChatAI macOS Component: arcade.tower-defense (components/arcade/TowerDefenseEngine.swift)
import Foundation

enum TowerKind: String, Codable, Sendable, CaseIterable {
    case basic       // baseline arrow tower
    case sniper      // long range, slow fire, high damage
    case splash      // short range, area-of-effect, medium damage

    var cost: Int {
        switch self {
        case .basic: return 25
        case .sniper: return 60
        case .splash: return 75
        }
    }
    var range: Double {
        switch self {
        case .basic: return 2.5
        case .sniper: return 5.0
        case .splash: return 1.5
        }
    }
    var damage: Double {
        switch self {
        case .basic: return 24
        case .sniper: return 70
        case .splash: return 18
        }
    }
    var fireInterval: Double {
        switch self {
        case .basic: return 0.7
        case .sniper: return 1.6
        case .splash: return 0.6
        }
    }
    /// Splash radius in grid units (0 means single-target).
    var splashRadius: Double {
        switch self {
        case .splash: return 1.2
        default: return 0
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
}

struct TowerDefenseEngine: Codable, Equatable, Sendable {
    var path: [PuzzlePoint]
    private(set) var enemies: [TowerDefenseEnemy] = []
    private(set) var towers: [TowerDefenseTower] = []
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
        for index in enemies.indices {
            let baseSpeed = 0.45 + Double(wave) * 0.03
            enemies[index].progress += dt * baseSpeed * enemies[index].kind.speedMultiplier
            if enemies[index].progress >= Double(path.count - 1) {
                enemies[index].health = 0
                lives -= 1
            }
        }

        for towerIndex in towers.indices {
            towers[towerIndex].cooldown = max(0, towers[towerIndex].cooldown - dt)
            guard towers[towerIndex].cooldown == 0,
                  let targetIndex = enemies.firstIndex(where: { enemy in
                      enemy.health > 0 && distance(from: towers[towerIndex].position, to: position(of: enemy)) <= towers[towerIndex].range
                  }) else { continue }
            // Hit primary target.
            enemies[targetIndex].health -= towers[towerIndex].damage
            // Splash damage hits any other enemy within splashRadius of the primary target.
            if towers[towerIndex].splashRadius > 0 {
                let center = position(of: enemies[targetIndex])
                for splashIdx in enemies.indices where splashIdx != targetIndex && enemies[splashIdx].health > 0 {
                    if distance(from: center, to: position(of: enemies[splashIdx])) <= towers[towerIndex].splashRadius {
                        enemies[splashIdx].health -= towers[towerIndex].damage * 0.5
                    }
                }
            }
            towers[towerIndex].cooldown = towers[towerIndex].fireInterval
        }

        // Award per-kind bounty for newly-defeated enemies that were not from path completion.
        let bounty = enemies
            .filter { $0.health <= 0 && $0.progress < Double(path.count - 1) }
            .reduce(0) { $0 + $1.kind.bounty }
        credits += bounty
        enemies.removeAll { $0.health <= 0 }
        if lives <= 0 {
            phase = .lost
        } else if enemies.isEmpty {
            phase = .won
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
