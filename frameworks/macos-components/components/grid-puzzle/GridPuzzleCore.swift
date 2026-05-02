// BEGIN mChatAI macOS Component: gridpuzzle.core (components/grid-puzzle/GridPuzzleCore.swift)
import Foundation

struct PuzzlePoint: Codable, Hashable, Sendable {
    var row: Int
    var col: Int

    init(row: Int, col: Int) {
        self.row = row
        self.col = col
    }

    func moved(_ direction: GridDirection, distance: Int = 1) -> PuzzlePoint {
        PuzzlePoint(row: row + direction.delta.row * distance, col: col + direction.delta.col * distance)
    }
}

enum GridDirection: String, Codable, CaseIterable, Sendable {
    case up
    case down
    case left
    case right

    var delta: PuzzlePoint {
        switch self {
        case .up: return PuzzlePoint(row: -1, col: 0)
        case .down: return PuzzlePoint(row: 1, col: 0)
        case .left: return PuzzlePoint(row: 0, col: -1)
        case .right: return PuzzlePoint(row: 0, col: 1)
        }
    }
}

struct PuzzleGrid<Cell: Codable & Equatable & Sendable>: Codable, Equatable, Sendable {
    let rows: Int
    let columns: Int
    private(set) var cells: [Cell]

    init(rows: Int, columns: Int, fill: Cell) {
        precondition(rows > 0 && columns > 0, "PuzzleGrid requires positive dimensions")
        self.rows = rows
        self.columns = columns
        self.cells = Array(repeating: fill, count: rows * columns)
    }

    func contains(_ point: PuzzlePoint) -> Bool {
        point.row >= 0 && point.row < rows && point.col >= 0 && point.col < columns
    }

    func index(for point: PuzzlePoint) -> Int {
        point.row * columns + point.col
    }

    subscript(_ point: PuzzlePoint) -> Cell {
        get { cells[index(for: point)] }
        set { cells[index(for: point)] = newValue }
    }

    mutating func set(_ value: Cell, at point: PuzzlePoint) {
        guard contains(point) else { return }
        self[point] = value
    }

    func value(at point: PuzzlePoint) -> Cell? {
        guard contains(point) else { return nil }
        return self[point]
    }

    func neighbors(of point: PuzzlePoint, diagonals: Bool = false) -> [PuzzlePoint] {
        var offsets = GridDirection.allCases.map(\.delta)
        if diagonals {
            offsets.append(contentsOf: [
                PuzzlePoint(row: -1, col: -1),
                PuzzlePoint(row: -1, col: 1),
                PuzzlePoint(row: 1, col: -1),
                PuzzlePoint(row: 1, col: 1)
            ])
        }

        return offsets
            .map { PuzzlePoint(row: point.row + $0.row, col: point.col + $0.col) }
            .filter(contains)
    }

    func allPoints() -> [PuzzlePoint] {
        (0..<rows).flatMap { row in
            (0..<columns).map { col in PuzzlePoint(row: row, col: col) }
        }
    }
}

struct SeededRandomNumberGenerator: RandomNumberGenerator, Sendable {
    private var state: UInt64

    init(seed: UInt64) {
        self.state = seed == 0 ? 0xC0FFEE : seed
    }

    mutating func next() -> UInt64 {
        state = state &* 6364136223846793005 &+ 1442695040888963407
        return state
    }
}
// END mChatAI macOS Component: gridpuzzle.core
