// BEGIN mChatAI macOS Component: arcade.grid-adventure (components/arcade/GridAdventureEngine.swift)
import Foundation

enum AdventureTile: String, Codable, Sendable {
    case floor
    case wall
    case water
    case road
    case exit
}

struct AdventureActor: Codable, Identifiable, Equatable, Sendable {
    enum Kind: String, Codable, Sendable {
        case hero
        case enemy
        case treasure
        case key
        case vehicle
        case log
        case pellet
        case powerPellet
        case fruit
    }

    var id = UUID()
    var kind: Kind
    var position: PuzzlePoint
    var direction: GridDirection = .right
    var frightenedTicks: Int = 0
}

struct GridAdventureEngine: Codable, Equatable, Sendable {
    private(set) var map: PuzzleGrid<AdventureTile>
    private(set) var actors: [AdventureActor]
    private(set) var score = 0
    private(set) var lives = 3
    private(set) var phase: ArcadePhase = .playing

    init(map: PuzzleGrid<AdventureTile>, actors: [AdventureActor]) {
        self.map = map
        self.actors = actors
    }

    var hero: AdventureActor? {
        actors.first { $0.kind == .hero }
    }

    mutating func moveHero(_ direction: GridDirection) {
        guard phase == .playing,
              let heroIndex = actors.firstIndex(where: { $0.kind == .hero }) else { return }
        let target = actors[heroIndex].position.moved(direction)
        guard map.contains(target), map[target] != .wall else { return }
        actors[heroIndex].position = target
        actors[heroIndex].direction = direction
        resolveHeroTile()
        resolveActorCollisions()
    }

    mutating func stepTraffic() {
        for index in actors.indices where actors[index].kind == .vehicle || actors[index].kind == .enemy || actors[index].kind == .log {
            if actors[index].frightenedTicks > 0 {
                actors[index].frightenedTicks -= 1
            }
            let previous = actors[index].position
            var next = actors[index].position.moved(actors[index].direction)
            if !map.contains(next) || map[next] == .wall {
                actors[index].direction = pickGhostDirection(from: actors[index].position, avoiding: actors[index].direction)
                next = actors[index].position.moved(actors[index].direction)
            }
            if map.contains(next), map[next] != .wall {
                actors[index].position = next
                if actors[index].kind == .log,
                   let heroIndex = actors.firstIndex(where: { $0.kind == .hero && $0.position == previous }) {
                    actors[heroIndex].position = next
                }
            }
        }
        resolveHeroTile()
        resolveActorCollisions()
    }

    private func pickGhostDirection(from point: PuzzlePoint, avoiding back: GridDirection) -> GridDirection {
        let reverse: GridDirection
        switch back {
        case .left: reverse = .right
        case .right: reverse = .left
        case .up: reverse = .down
        case .down: reverse = .up
        }
        let candidates: [GridDirection] = [.left, .right, .up, .down].filter { $0 != reverse }
        let walkable = candidates.filter { dir in
            let p = point.moved(dir)
            return map.contains(p) && map[p] != .wall
        }
        if let pick = walkable.randomElement() { return pick }
        return reverse
    }

    private func ghostPenPoint(for index: Int) -> PuzzlePoint {
        let centerRow = max(0, map.rows / 2)
        let centerCol = max(0, map.columns / 2)
        let candidates: [PuzzlePoint] = [
            PuzzlePoint(row: centerRow, col: centerCol),
            PuzzlePoint(row: centerRow, col: centerCol - 1),
            PuzzlePoint(row: centerRow, col: centerCol + 1),
            PuzzlePoint(row: centerRow - 1, col: centerCol)
        ]
        return candidates.first { map.contains($0) && map[$0] != .wall } ?? PuzzlePoint(row: 0, col: 0)
    }

    static func adventureCastleMap() -> GridAdventureEngine {
        var grid = PuzzleGrid(rows: 7, columns: 9, fill: AdventureTile.floor)
        for point in grid.allPoints() where point.row == 0 || point.row == 6 || point.col == 0 || point.col == 8 {
            grid[point] = .wall
        }
        grid[PuzzlePoint(row: 3, col: 8)] = .exit
        return GridAdventureEngine(
            map: grid,
            actors: [
                AdventureActor(kind: .hero, position: PuzzlePoint(row: 3, col: 1)),
                AdventureActor(kind: .treasure, position: PuzzlePoint(row: 2, col: 5)),
                AdventureActor(kind: .key, position: PuzzlePoint(row: 4, col: 3)),
                AdventureActor(kind: .enemy, position: PuzzlePoint(row: 3, col: 5), direction: .left)
            ]
        )
    }

    static func froggerLaneMap() -> GridAdventureEngine {
        var grid = PuzzleGrid(rows: 8, columns: 9, fill: AdventureTile.floor)
        for col in 0..<9 {
            grid[PuzzlePoint(row: 2, col: col)] = .road
            grid[PuzzlePoint(row: 3, col: col)] = .road
            grid[PuzzlePoint(row: 5, col: col)] = .water
            grid[PuzzlePoint(row: 0, col: col)] = .exit
        }
        return GridAdventureEngine(
            map: grid,
            actors: [
                AdventureActor(kind: .hero, position: PuzzlePoint(row: 7, col: 4), direction: .up),
                AdventureActor(kind: .vehicle, position: PuzzlePoint(row: 2, col: 1), direction: .right),
                AdventureActor(kind: .vehicle, position: PuzzlePoint(row: 3, col: 7), direction: .left),
                AdventureActor(kind: .log, position: PuzzlePoint(row: 5, col: 4), direction: .right),
                AdventureActor(kind: .log, position: PuzzlePoint(row: 5, col: 7), direction: .left)
            ]
        )
    }

    static func mazePelletMap() -> GridAdventureEngine {
        // Retained for backward compatibility; defers to the iconic pac-man shape.
        return pacmanArcadeMap()
    }

    static func pacmanArcadeMap() -> GridAdventureEngine {
        // 17 cols x 13 rows arcade-style maze. '#' wall, '.' floor.
        // Designed so every floor cell is reachable: outer ring corridor, two
        // vertical mid-passages keep middle band connected to top/bottom rows.
        // Center has a 3-wide ghost pen with one opening up + one opening down.
        let layout: [String] = [
            "#################",
            "#...............#",
            "#.##.###.###.##.#",
            "#.##.###.###.##.#",
            "#...............#",
            "#.##.#.###.#.##.#",
            "#....#..#..#....#",
            "#.##.#.###.#.##.#",
            "#...............#",
            "#.##.###.###.##.#",
            "#.##.###.###.##.#",
            "#...............#",
            "#################"
        ]
        let rows = layout.count
        let columns = layout[0].count
        var grid = PuzzleGrid(rows: rows, columns: columns, fill: AdventureTile.floor)
        for r in 0..<rows {
            let chars = Array(layout[r])
            for c in 0..<columns where chars[c] == "#" {
                grid[PuzzlePoint(row: r, col: c)] = .wall
            }
        }
        let heroStart = PuzzlePoint(row: 11, col: 8)
        let ghostStarts = [
            PuzzlePoint(row: 1, col: 1),
            PuzzlePoint(row: 1, col: columns - 2),
            PuzzlePoint(row: rows - 2, col: 1),
            PuzzlePoint(row: rows - 2, col: columns - 2)
        ]
        let powerPelletPoints: Set<PuzzlePoint> = [
            PuzzlePoint(row: 1, col: 2),
            PuzzlePoint(row: 1, col: columns - 3),
            PuzzlePoint(row: rows - 2, col: 2),
            PuzzlePoint(row: rows - 2, col: columns - 3)
        ]
        let fruitPoint = PuzzlePoint(row: 4, col: 8)
        let occupied: Set<PuzzlePoint> = Set(ghostStarts).union([heroStart, fruitPoint])

        var actors: [AdventureActor] = [
            AdventureActor(kind: .hero, position: heroStart, direction: .left)
        ]
        let ghostDirections: [GridDirection] = [.right, .left, .right, .left]
        for (i, point) in ghostStarts.enumerated() where grid[point] != .wall {
            actors.append(AdventureActor(kind: .enemy, position: point, direction: ghostDirections[i % ghostDirections.count]))
        }
        actors.append(AdventureActor(kind: .fruit, position: fruitPoint))
        for point in powerPelletPoints where grid[point] != .wall {
            actors.append(AdventureActor(kind: .powerPellet, position: point))
        }

        for point in grid.allPoints() where grid[point] != .wall && !occupied.contains(point) && !powerPelletPoints.contains(point) {
            actors.append(AdventureActor(kind: .pellet, position: point))
        }

        return GridAdventureEngine(map: grid, actors: actors)
    }

    private mutating func resolveHeroTile() {
        guard let heroIndex = actors.firstIndex(where: { $0.kind == .hero }) else { return }
        let heroPoint = actors[heroIndex].position
        if map[heroPoint] == .exit {
            phase = .won
            score += 500
        }
        if map[heroPoint] == .water,
           !actors.contains(where: { $0.kind == .log && $0.position == heroPoint }) {
            loseLife()
        }
    }

    private mutating func resolveActorCollisions() {
        guard let heroIndex = actors.firstIndex(where: { $0.kind == .hero }) else { return }
        let heroPoint = actors[heroIndex].position
        var removeIDs: Set<UUID> = []

        for actor in actors where actor.id != actors[heroIndex].id && actor.position == heroPoint {
            switch actor.kind {
            case .treasure:
                score += 250
                removeIDs.insert(actor.id)
            case .powerPellet:
                score += 50
                removeIDs.insert(actor.id)
                for index in actors.indices where actors[index].kind == .enemy {
                    actors[index].frightenedTicks = 16
                }
            case .fruit:
                score += 200
                removeIDs.insert(actor.id)
            case .key:
                score += 100
                removeIDs.insert(actor.id)
            case .pellet:
                score += 10
                removeIDs.insert(actor.id)
            case .enemy:
                if actor.frightenedTicks > 0 {
                    score += 200
                    if let idx = actors.firstIndex(where: { $0.id == actor.id }) {
                        actors[idx].frightenedTicks = 0
                        actors[idx].position = ghostPenPoint(for: idx)
                    }
                } else {
                    loseLife()
                }
            case .vehicle:
                loseLife()
            case .log:
                break
            case .hero:
                break
            }
        }

        actors.removeAll { removeIDs.contains($0.id) }
        if phase == .playing, !actors.contains(where: { $0.kind == .pellet }) {
            phase = .won
            score += 500
        }
    }

    private mutating func loseLife() {
        lives -= 1
        if lives <= 0 {
            phase = .lost
        } else {
            respawnHero()
        }
    }

    private mutating func respawnHero() {
        guard let heroIndex = actors.firstIndex(where: { $0.kind == .hero }) else { return }
        let preferred = PuzzlePoint(row: max(0, map.rows - 1), col: map.columns / 2)
        if map.contains(preferred), map[preferred] != .wall {
            actors[heroIndex].position = preferred
            return
        }

        if let fallback = map.allPoints().first(where: { map[$0] == .floor }) {
            actors[heroIndex].position = fallback
        }
    }
}
// END mChatAI macOS Component: arcade.grid-adventure
