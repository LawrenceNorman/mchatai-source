// BEGIN mChatAI macOS Component: gridpuzzle.match3 (components/grid-puzzle/Match3Engine.swift)
import Foundation

struct Match3Tile: Codable, Equatable, Sendable {
    var symbol: String
}

struct Match3Engine: Codable, Equatable, Sendable {
    private(set) var grid: PuzzleGrid<Match3Tile>
    private(set) var score = 0
    var symbols = ["A", "B", "C", "D", "E", "F"]
    private var seed: UInt64

    init(rows: Int = 8, columns: Int = 8, seed: UInt64 = 300) {
        self.seed = seed
        self.grid = PuzzleGrid(rows: rows, columns: columns, fill: Match3Tile(symbol: "A"))
        refillAll()
        _ = resolveCascades()
    }

    mutating func swap(_ a: PuzzlePoint, _ b: PuzzlePoint) -> Bool {
        guard grid.contains(a), grid.contains(b), areAdjacent(a, b) else { return false }
        let first = grid[a]
        grid[a] = grid[b]
        grid[b] = first

        let matches = findMatches()
        if matches.isEmpty {
            let rollback = grid[a]
            grid[a] = grid[b]
            grid[b] = rollback
            return false
        }

        score += resolveCascades() * 10
        return true
    }

    mutating func resolveCascades() -> Int {
        var removed = 0
        while true {
            let matches = findMatches()
            guard !matches.isEmpty else { break }
            removed += matches.count
            for point in matches {
                grid[point].symbol = ""
            }
            collapseColumns()
            refillEmpty()
        }
        return removed
    }

    func findMatches() -> Set<PuzzlePoint> {
        var matches = Set<PuzzlePoint>()

        for row in 0..<grid.rows {
            var run: [PuzzlePoint] = []
            var previous = ""
            for col in 0..<grid.columns {
                let point = PuzzlePoint(row: row, col: col)
                let symbol = grid[point].symbol
                if symbol == previous && !symbol.isEmpty {
                    run.append(point)
                } else {
                    if run.count >= 3 { matches.formUnion(run) }
                    run = [point]
                    previous = symbol
                }
            }
            if run.count >= 3 { matches.formUnion(run) }
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
                    if run.count >= 3 { matches.formUnion(run) }
                    run = [point]
                    previous = symbol
                }
            }
            if run.count >= 3 { matches.formUnion(run) }
        }

        return matches
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
