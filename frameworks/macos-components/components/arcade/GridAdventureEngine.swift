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

    /// Ghost AI personality for Pac-Man-style chasers. Each personality
    /// produces a different direction-picking strategy when the ghost is
    /// at an intersection. Diversity is what makes Pacman's classic
    /// 4-ghost dynamic feel alive — homogeneous random ghosts feel like
    /// a swarm; differentiated personalities create distinct threats.
    /// Filed 2026-05-04 with the Pacman v2 polish pass.
    enum Personality: String, Codable, Sendable {
        /// Default — random walkable direction (legacy behavior).
        case random
        /// Direct chaser — picks the direction that minimizes Manhattan
        /// distance to the hero. Original Pacman's "Blinky."
        case chaser
        /// Ambusher — targets a tile 4 squares ahead of the hero in the
        /// hero's current direction. Original Pacman's "Pinky."
        case ambusher
        /// Patrol — chases when far from the hero, scatters when close
        /// (>5 tiles = chase, ≤5 = random). Original Pacman's "Clyde."
        case patrol
        /// Boss — chaser, but takes multiple hits and moves slower.
        case boss
    }

    var id = UUID()
    var kind: Kind
    var position: PuzzlePoint
    var direction: GridDirection = .right
    var frightenedTicks: Int = 0
    /// AI personality (only meaningful for `.enemy` kind). Default `.random`
    /// preserves legacy behavior for callers that don't set personality.
    var personality: Personality = .random
    /// Hits remaining for boss enemies. Regular enemies = 1; boss = 3-5.
    /// Decremented on hero collision when frightened (or by power-pellet
    /// pursuit, depending on map rules).
    var hitsRemaining: Int = 1
}

struct GridAdventureEngine: Codable, Equatable, Sendable {
    private(set) var map: PuzzleGrid<AdventureTile>
    private(set) var actors: [AdventureActor]
    private(set) var score = 0
    private(set) var lives = 3
    private(set) var phase: ArcadePhase = .playing
    /// Anchor point the hero respawns to after losing a life. If nil,
    /// `respawnHero()` falls back to a heuristic. Factory methods
    /// (pacmanArcadeMap / froggerLaneMap / etc.) set this so the hero
    /// returns to its starting tile, NOT to a "bottom-middle" guess
    /// that may land in a wall on layouts where the bottom row is solid.
    /// Filed 2026-05-05 after Pacman v4 hyperspace-respawn bug:
    /// preferred = (rows-1, columns/2) was a wall in the arcade maze
    /// layout, so respawn fell through to allPoints().first { .floor }
    /// which is the top-left interior — Pac teleported there on every
    /// ghost collision.
    private(set) var heroSpawn: PuzzlePoint?

    /// When true (default), `loseLife()` immediately respawns the hero
    /// at heroSpawn. When false, the engine just decrements lives and
    /// LEAVES THE HERO ON THE COLLISION TILE — the View is responsible
    /// for displaying a death animation and then calling
    /// `respawnHeroToStart()` once the pause completes. Filed 2026-05-05
    /// from user feedback that the death animation looked like Pac was
    /// "nearby but not in contact" with the ghost — root cause was that
    /// the engine teleported him away mid-tick, so the View's freeze-at-
    /// previous-position drew him 1 tile away from the actual contact.
    public var deferRespawn: Bool = false

    init(map: PuzzleGrid<AdventureTile>, actors: [AdventureActor], heroSpawn: PuzzlePoint? = nil) {
        self.map = map
        self.actors = actors
        self.heroSpawn = heroSpawn ?? actors.first(where: { $0.kind == .hero })?.position
    }

    var hero: AdventureActor? {
        actors.first { $0.kind == .hero }
    }

    /// Respawn all enemy actors back to the ghost pen (4-corner candidate
    /// region around map center). Called by the View AFTER a death-pause
    /// elapses so ghosts re-emerge from the pen, giving the player a
    /// fresh chance instead of being immediately re-killed by ghosts that
    /// happened to be on the spawn tile. Filed 2026-05-05 from user
    /// feedback: "When I die there is no break or reset, it just hyperspaces
    /// me back to the beginning... the monsters re-emerge from the the
    /// box and I have a fresh chance to chew some pellets."
    mutating func respawnGhostsToPen() {
        let centerRow = max(0, map.rows / 2)
        let centerCol = max(0, map.columns / 2)
        // 4 candidate pen tiles around the map center, picked greedily
        // (skip wall tiles). Mirrors the layout used at maze construction.
        let penCandidates: [PuzzlePoint] = [
            PuzzlePoint(row: centerRow, col: centerCol),
            PuzzlePoint(row: centerRow, col: centerCol - 1),
            PuzzlePoint(row: centerRow, col: centerCol + 1),
            PuzzlePoint(row: centerRow - 1, col: centerCol),
            PuzzlePoint(row: centerRow + 1, col: centerCol),
        ]
        let walkablePen = penCandidates.filter { map.contains($0) && map[$0] != .wall }
        guard !walkablePen.isEmpty else { return }
        var penIndex = 0
        for actorIndex in actors.indices where actors[actorIndex].kind == .enemy {
            actors[actorIndex].position = walkablePen[penIndex % walkablePen.count]
            actors[actorIndex].direction = .right
            actors[actorIndex].frightenedTicks = 0
            penIndex += 1
        }
    }

    /// Convert one of the existing ghosts to a boss. Called by the View
    /// at boss levels (typically every 5th level via LevelManager.isBossLevel).
    /// Picks the first .enemy actor and swaps its personality to .boss with
    /// 3 hits remaining. The View should render boss enemies with a
    /// distinct color/size + health-pip indicator.
    mutating func upgradeGhostToBoss() {
        guard let idx = actors.firstIndex(where: { $0.kind == .enemy }) else { return }
        actors[idx].personality = .boss
        actors[idx].hitsRemaining = 3
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
        // Snapshot hero state for personality-aware enemy AI. Computed
        // once per tick instead of per-enemy.
        let heroSnapshot = actors.first(where: { $0.kind == .hero })

        for index in actors.indices where actors[index].kind == .vehicle || actors[index].kind == .enemy || actors[index].kind == .log {
            if actors[index].frightenedTicks > 0 {
                actors[index].frightenedTicks -= 1
            }
            let previous = actors[index].position
            // Enemies pick direction at every step (so they react to the
            // hero), vehicles/logs only re-pick at walls.
            if actors[index].kind == .enemy {
                actors[index].direction = pickEnemyDirection(
                    for: actors[index],
                    hero: heroSnapshot
                )
            }
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

    /// Personality-aware enemy direction picker. Picks the next direction
    /// at the actor's current position based on its personality. All
    /// personalities respect walls / out-of-bounds — they pick from
    /// walkable candidates only, with personality-specific ordering.
    /// Frightened enemies always reverse-flee (random walkable away
    /// from hero). See AdventureActor.Personality enum docs.
    private func pickEnemyDirection(for actor: AdventureActor, hero: AdventureActor?) -> GridDirection {
        // Frightened enemies always flee the hero (Pacman power-pellet rule).
        // Implementation: pick the direction that MAXIMIZES Manhattan
        // distance to the hero (rather than tile-targeting logic).
        let isFrightened = actor.frightenedTicks > 0
        let walkable = walkableDirections(from: actor.position, avoiding: opposite(of: actor.direction))
        guard !walkable.isEmpty else { return actor.direction }

        guard let hero = hero else {
            // No hero on map — fall back to random walkable.
            return walkable.randomElement() ?? actor.direction
        }

        if isFrightened {
            // Maximize distance from hero
            return walkable.max(by: { manhattan(actor.position.moved($0), hero.position) <
                                      manhattan(actor.position.moved($1), hero.position) })
                ?? actor.direction
        }

        switch actor.personality {
        case .random:
            return walkable.randomElement() ?? actor.direction

        case .chaser, .boss:
            // Minimize Manhattan distance to hero.
            return walkable.min(by: { manhattan(actor.position.moved($0), hero.position) <
                                       manhattan(actor.position.moved($1), hero.position) })
                ?? actor.direction

        case .ambusher:
            // Target 4 tiles ahead of hero in hero's current direction.
            let target = projectedTarget(from: hero.position, direction: hero.direction, distance: 4)
            return walkable.min(by: { manhattan(actor.position.moved($0), target) <
                                       manhattan(actor.position.moved($1), target) })
                ?? actor.direction

        case .patrol:
            // Chase if far (>5), random if close.
            let distance = manhattan(actor.position, hero.position)
            if distance > 5 {
                return walkable.min(by: { manhattan(actor.position.moved($0), hero.position) <
                                           manhattan(actor.position.moved($1), hero.position) })
                    ?? actor.direction
            } else {
                return walkable.randomElement() ?? actor.direction
            }
        }
    }

    private func walkableDirections(from point: PuzzlePoint, avoiding back: GridDirection) -> [GridDirection] {
        let candidates: [GridDirection] = [.left, .right, .up, .down].filter { $0 != back }
        return candidates.filter { dir in
            let p = point.moved(dir)
            return map.contains(p) && map[p] != .wall
        }
    }

    private func opposite(of direction: GridDirection) -> GridDirection {
        switch direction {
        case .left: return .right
        case .right: return .left
        case .up: return .down
        case .down: return .up
        }
    }

    private func manhattan(_ a: PuzzlePoint, _ b: PuzzlePoint) -> Int {
        abs(a.row - b.row) + abs(a.col - b.col)
    }

    private func projectedTarget(from origin: PuzzlePoint, direction: GridDirection, distance: Int) -> PuzzlePoint {
        switch direction {
        case .left:  return PuzzlePoint(row: origin.row, col: origin.col - distance)
        case .right: return PuzzlePoint(row: origin.row, col: origin.col + distance)
        case .up:    return PuzzlePoint(row: origin.row - distance, col: origin.col)
        case .down:  return PuzzlePoint(row: origin.row + distance, col: origin.col)
        }
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
        // Each of the 4 starting ghosts gets a different personality so
        // the player faces meaningfully different threats. Mirrors the
        // canonical Pacman pattern (Blinky/Pinky/Inky/Clyde).
        let personalities: [AdventureActor.Personality] = [
            .chaser,    // Blinky — direct chase
            .ambusher,  // Pinky — projects 4 ahead of hero
            .patrol,    // Clyde — chases far / random near
            .random     // Sue — pure random for visual variety
        ]
        for (i, point) in ghostStarts.enumerated() where grid[point] != .wall {
            actors.append(AdventureActor(
                kind: .enemy,
                position: point,
                direction: ghostDirections[i % ghostDirections.count],
                personality: personalities[i % personalities.count]
            ))
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
        } else if !deferRespawn {
            respawnHero()
        }
        // If deferRespawn is true, the View runs a death animation while
        // the hero stays on the collision tile, then calls
        // respawnHeroToStart() to teleport him to spawn after the pause.
    }

    /// Public entry point for the View-controlled respawn flow. Mirrors
    /// the private respawnHero() but is callable externally so death-
    /// animation code can trigger respawn at the right moment.
    public mutating func respawnHeroToStart() {
        respawnHero()
    }

    private mutating func respawnHero() {
        guard let heroIndex = actors.firstIndex(where: { $0.kind == .hero }) else { return }
        // Prefer the explicit heroSpawn anchor set by the factory (e.g.
        // pacmanArcadeMap stamps row 11, col 8). The previous "bottom-
        // middle heuristic" assumed all factories had a floor cell at
        // (rows-1, columns/2), which is FALSE for the arcade Pacman
        // layout (bottom row is all walls). When the heuristic missed,
        // respawn fell through to allPoints().first { .floor } which is
        // top-left interior — produced the "hyperspace teleport" bug.
        if let anchor = heroSpawn, map.contains(anchor), map[anchor] != .wall {
            actors[heroIndex].position = anchor
            return
        }
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
