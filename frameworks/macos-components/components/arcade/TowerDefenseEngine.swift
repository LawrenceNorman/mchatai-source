// BEGIN mChatAI macOS Component: arcade.tower-defense (components/arcade/TowerDefenseEngine.swift)
import Foundation

struct TowerDefenseEnemy: Codable, Identifiable, Equatable, Sendable {
    var id = UUID()
    var pathIndex = 0
    var progress: Double = 0
    var health: Double = 100
}

struct TowerDefenseTower: Codable, Identifiable, Equatable, Sendable {
    var id = UUID()
    var position: PuzzlePoint
    var range: Double = 2.5
    var damage: Double = 24
    var cooldown: Double = 0
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
        wave += 1
        phase = .playing
        enemies = (0..<count).map { index in
            TowerDefenseEnemy(progress: Double(index) * -0.45, health: 80 + Double(wave * 20))
        }
    }

    mutating func placeTower(at point: PuzzlePoint) -> Bool {
        guard credits >= 25, !towers.contains(where: { $0.position == point }) else { return false }
        credits -= 25
        towers.append(TowerDefenseTower(position: point))
        return true
    }

    mutating func update(dt: Double) {
        guard phase == .playing else { return }
        for index in enemies.indices {
            enemies[index].progress += dt * (0.45 + Double(wave) * 0.03)
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
            enemies[targetIndex].health -= towers[towerIndex].damage
            towers[towerIndex].cooldown = 0.7
        }

        let defeated = enemies.filter { $0.health <= 0 && $0.progress < Double(path.count - 1) }.count
        credits += defeated * 5
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
// END mChatAI macOS Component: arcade.tower-defense
