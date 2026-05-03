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
    }

    var id = UUID()
    var kind: Kind
    var position: PuzzlePoint
    var direction: GridDirection = .right
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
            let previous = actors[index].position
            var next = actors[index].position.moved(actors[index].direction)
            if !map.contains(next) || map[next] == .wall {
                actors[index].direction = actors[index].direction == .left ? .right : .left
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
        var grid = PuzzleGrid(rows: 7, columns: 9, fill: AdventureTile.floor)
        for point in grid.allPoints() where point.row == 0 || point.row == 6 || point.col == 0 || point.col == 8 {
            grid[point] = .wall
        }
        let heroStart = PuzzlePoint(row: 3, col: 4)
        let enemyStarts: Set<PuzzlePoint> = [
            PuzzlePoint(row: 1, col: 1),
            PuzzlePoint(row: 5, col: 7)
        ]
        let pellets = grid.allPoints().filter { grid[$0] == .floor && $0 != heroStart && !enemyStarts.contains($0) }
            .map { AdventureActor(kind: .pellet, position: $0) }
        return GridAdventureEngine(
            map: grid,
            actors: [
                AdventureActor(kind: .hero, position: heroStart),
                AdventureActor(kind: .enemy, position: PuzzlePoint(row: 1, col: 1), direction: .right),
                AdventureActor(kind: .enemy, position: PuzzlePoint(row: 5, col: 7), direction: .left)
            ] + pellets
        )
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
            case .key:
                score += 100
                removeIDs.insert(actor.id)
            case .pellet:
                score += 10
                removeIDs.insert(actor.id)
            case .enemy, .vehicle:
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
