// BEGIN mChatAI macOS Component: gridpuzzle.minesweeper (components/grid-puzzle/MinesweeperEngine.swift)
import Foundation

enum MinesweeperState: String, Codable, Sendable {
    case ready
    case playing
    case won
    case lost
}

struct MinesweeperCell: Codable, Equatable, Sendable {
    var hasMine = false
    var isRevealed = false
    var isFlagged = false
    var adjacentMines = 0
}

struct MinesweeperEngine: Codable, Equatable, Sendable {
    private(set) var grid: PuzzleGrid<MinesweeperCell>
    private(set) var state: MinesweeperState = .ready
    let mineCount: Int

    init(rows: Int = 9, columns: Int = 9, mineCount: Int = 10, seed: UInt64 = 99) {
        self.grid = PuzzleGrid(rows: rows, columns: columns, fill: MinesweeperCell())
        self.mineCount = min(mineCount, max(1, rows * columns - 1))
        seedMines(seed: seed, avoiding: nil)
    }

    var revealedSafeCellCount: Int {
        grid.cells.filter { !$0.hasMine && $0.isRevealed }.count
    }

    var totalSafeCellCount: Int {
        grid.rows * grid.columns - mineCount
    }

    mutating func toggleFlag(at point: PuzzlePoint) {
        guard grid.contains(point), state != .won, state != .lost else { return }
        guard !grid[point].isRevealed else { return }
        grid[point].isFlagged.toggle()
    }

    mutating func reveal(at point: PuzzlePoint) {
        guard grid.contains(point), state != .won, state != .lost else { return }
        if state == .ready { state = .playing }
        guard !grid[point].isFlagged, !grid[point].isRevealed else { return }

        if grid[point].hasMine {
            grid[point].isRevealed = true
            revealAllMines()
            state = .lost
            return
        }

        floodReveal(from: point)
        if revealedSafeCellCount == totalSafeCellCount {
            state = .won
        }
    }

    private mutating func seedMines(seed: UInt64, avoiding: PuzzlePoint?) {
        var rng = SeededRandomNumberGenerator(seed: seed)
        var candidates = grid.allPoints()
        if let avoiding {
            candidates.removeAll { $0 == avoiding }
        }
        candidates.shuffle(using: &rng)

        for point in candidates.prefix(mineCount) {
            grid[point].hasMine = true
        }

        for point in grid.allPoints() {
            grid[point].adjacentMines = grid.neighbors(of: point, diagonals: true)
                .filter { grid[$0].hasMine }
                .count
        }
    }

    private mutating func floodReveal(from start: PuzzlePoint) {
        var queue = [start]
        var seen: Set<PuzzlePoint> = []

        while let point = queue.first {
            queue.removeFirst()
            guard grid.contains(point), !seen.contains(point) else { continue }
            seen.insert(point)

            guard !grid[point].hasMine, !grid[point].isFlagged else { continue }
            grid[point].isRevealed = true

            if grid[point].adjacentMines == 0 {
                queue.append(contentsOf: grid.neighbors(of: point, diagonals: true))
            }
        }
    }

    private mutating func revealAllMines() {
        for point in grid.allPoints() where grid[point].hasMine {
            grid[point].isRevealed = true
        }
    }
}
// END mChatAI macOS Component: gridpuzzle.minesweeper
