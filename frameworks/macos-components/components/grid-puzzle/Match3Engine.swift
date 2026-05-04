// BEGIN mChatAI macOS Component: gridpuzzle.match3 (components/grid-puzzle/Match3Engine.swift)
import Foundation

struct Match3Tile: Codable, Equatable, Sendable {
    var symbol: String
}

/// Match-kind classification — drives both scoring and the visual cascade
/// effect the UI should play (sparkle for 3, line-clear flash for 4, board-
/// shake / electrical for 5+). Filed 2026-05-04 after user feedback that
/// every match was treated identically; bigger matches must look + feel
/// bigger to make the game compelling.
enum Match3Kind: String, Codable, Sendable {
    case three   // baseline 3-in-a-row
    case four    // 4-in-a-row — typically a line-clear bomb in candy-style games
    case five    // 5-in-a-row — typically a board-shake / lightning effect
}

/// One resolved match group. Lets the View iterate matches per cascade pass
/// and play the appropriate animation. `points` describes points awarded
/// for THIS group (already factored with multiplier).
struct Match3MatchEvent: Codable, Equatable, Sendable {
    let kind: Match3Kind
    let points: Set<PuzzlePoint>
    let pointsAwarded: Int
    let symbol: String
    let cascadeDepth: Int  // 0 = direct user swap, 1+ = follow-on cascade
}

struct Match3Engine: Codable, Equatable, Sendable {
    private(set) var grid: PuzzleGrid<Match3Tile>
    private(set) var score = 0
    /// Resolved matches from the most recent swap, ordered earliest→latest.
    /// The UI should animate them in order for the satisfying chain-reaction
    /// feel of candy-crush style games.
    private(set) var lastResolvedMatches: [Match3MatchEvent] = []
    var symbols = ["A", "B", "C", "D", "E", "F"]
    private var seed: UInt64

    init(rows: Int = 8, columns: Int = 8, seed: UInt64 = 300) {
        self.seed = seed
        self.grid = PuzzleGrid(rows: rows, columns: columns, fill: Match3Tile(symbol: "A"))
        refillAll()
        _ = resolveCascades()
        // Resolved cascades from the initial board fill don't count for
        // the user — clear the event log so the UI's "what just happened"
        // panel stays empty until the player makes a swap.
        lastResolvedMatches = []
    }

    /// Attempts to swap two ADJACENT cells. Returns true if the swap
    /// produced any matches (kept), false if it didn't (rolled back).
    /// On success, lastResolvedMatches contains the per-match events.
    mutating func swap(_ a: PuzzlePoint, _ b: PuzzlePoint) -> Bool {
        guard grid.contains(a), grid.contains(b), areAdjacent(a, b) else { return false }
        let first = grid[a]
        grid[a] = grid[b]
        grid[b] = first

        let matches = findMatchGroups()
        if matches.isEmpty {
            let rollback = grid[a]
            grid[a] = grid[b]
            grid[b] = rollback
            return false
        }

        lastResolvedMatches = []
        _ = resolveCascades()
        return true
    }

    /// Resolves all match cascades, recording events per pass.
    /// Returns the total number of cells removed (legacy callers).
    @discardableResult
    mutating func resolveCascades() -> Int {
        var removed = 0
        var depth = 0
        while true {
            let groups = findMatchGroups()
            guard !groups.isEmpty else { break }
            for group in groups {
                let kind = matchKind(for: group.count)
                let pts = pointsForGroup(count: group.count, cascadeDepth: depth)
                score += pts
                removed += group.count
                lastResolvedMatches.append(Match3MatchEvent(
                    kind: kind,
                    points: group,
                    pointsAwarded: pts,
                    symbol: grid[group.first!].symbol,
                    cascadeDepth: depth
                ))
                for point in group { grid[point].symbol = "" }
            }
            collapseColumns()
            refillEmpty()
            depth += 1
        }
        return removed
    }

    /// Per-match scoring. Bigger matches award disproportionately more
    /// points because they're harder to set up; deeper cascades award a
    /// chain-bonus multiplier.
    private func pointsForGroup(count: Int, cascadeDepth: Int) -> Int {
        let base: Int
        switch count {
        case 3:        base = 30      // 3-in-a-row: baseline
        case 4:        base = 80      // line-clear: ~2.7x baseline
        case 5:        base = 200     // 5-in-a-row super: ~6.7x baseline
        default:       base = 200 + (count - 5) * 50  // 6+ keeps growing
        }
        // Cascade bonus: each follow-on chain doubles the base. Direct
        // swap (depth 0) is 1×, first cascade (depth 1) is 2×, etc.
        let cascadeMultiplier = 1 << min(cascadeDepth, 5)
        return base * cascadeMultiplier
    }

    private func matchKind(for count: Int) -> Match3Kind {
        switch count {
        case 4: return .four
        case 5: return .five
        default: return count >= 5 ? .five : .three
        }
    }

    /// Returns each contiguous match-run as its own Set, instead of
    /// flattening them all into one Set the way the legacy findMatches()
    /// did. This lets the View animate each run independently and assign
    /// kind=.four / .five for line-clear / board-shake effects.
    func findMatchGroups() -> [Set<PuzzlePoint>] {
        var groups: [Set<PuzzlePoint>] = []

        for row in 0..<grid.rows {
            var run: [PuzzlePoint] = []
            var previous = ""
            for col in 0..<grid.columns {
                let point = PuzzlePoint(row: row, col: col)
                let symbol = grid[point].symbol
                if symbol == previous && !symbol.isEmpty {
                    run.append(point)
                } else {
                    if run.count >= 3 { groups.append(Set(run)) }
                    run = [point]
                    previous = symbol
                }
            }
            if run.count >= 3 { groups.append(Set(run)) }
        }

        for col in 0..<grid.columns {
            var run: [PuzzlePoint] = []
            var previous = ""
            for row in 0..<grid.rows {
                let point = PuzzlePoint(row: row, col: col)
                let symbol = grid[point].symbol
                if symbol == previous && !symbol.isEmpty {
                    run.append(point)
                } else {
                    if run.count >= 3 { groups.append(Set(run)) }
                    run = [point]
                    previous = symbol
                }
            }
            if run.count >= 3 { groups.append(Set(run)) }
        }

        return groups
    }

    /// Legacy: flattened Set of all matched points.
    /// Kept for back-compat with callers who don't care about per-group
    /// classification. New callers should use `findMatchGroups()`.
    func findMatches() -> Set<PuzzlePoint> {
        var all = Set<PuzzlePoint>()
        for group in findMatchGroups() { all.formUnion(group) }
        return all
    }

    private func areAdjacent(_ a: PuzzlePoint, _ b: PuzzlePoint) -> Bool {
        abs(a.row - b.row) + abs(a.col - b.col) == 1
    }

    private mutating func collapseColumns() {
        for col in 0..<grid.columns {
            var stack: [Match3Tile] = []
            for row in stride(from: grid.rows - 1, through: 0, by: -1) {
                let tile = grid[PuzzlePoint(row: row, col: col)]
                if !tile.symbol.isEmpty { stack.append(tile) }
            }
            for row in stride(from: grid.rows - 1, through: 0, by: -1) {
                let point = PuzzlePoint(row: row, col: col)
                grid[point] = stack.isEmpty ? Match3Tile(symbol: "") : stack.removeFirst()
            }
        }
    }

    private mutating func refillAll() {
        for point in grid.allPoints() {
            grid[point] = Match3Tile(symbol: nextSymbol())
        }
    }

    private mutating func refillEmpty() {
        for point in grid.allPoints() where grid[point].symbol.isEmpty {
            grid[point] = Match3Tile(symbol: nextSymbol())
        }
    }

    private mutating func nextSymbol() -> String {
        var rng = SeededRandomNumberGenerator(seed: seed)
        seed = rng.next()
        return symbols[Int(seed % UInt64(symbols.count))]
    }
}
// END mChatAI macOS Component: gridpuzzle.match3
