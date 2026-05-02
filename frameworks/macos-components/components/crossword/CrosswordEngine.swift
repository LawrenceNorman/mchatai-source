// BEGIN mChatAI macOS Component: crossword.engine (components/crossword/CrosswordEngine.swift)
import Foundation

enum CrosswordDirection: String, Codable, CaseIterable, Sendable {
    case across
    case down
}

struct CrosswordEntry: Codable, Identifiable, Equatable, Sendable {
    let id: String
    let number: Int
    let direction: CrosswordDirection
    let start: PuzzlePoint
    let answer: String
    let clue: String

    var length: Int { answer.count }

    func contains(_ point: PuzzlePoint) -> Bool {
        switch direction {
        case .across:
            return point.row == start.row && point.col >= start.col && point.col < start.col + length
        case .down:
            return point.col == start.col && point.row >= start.row && point.row < start.row + length
        }
    }

    func points() -> [PuzzlePoint] {
        (0..<length).map { offset in
            switch direction {
            case .across: return PuzzlePoint(row: start.row, col: start.col + offset)
            case .down: return PuzzlePoint(row: start.row + offset, col: start.col)
            }
        }
    }
}

struct CrosswordCell: Codable, Equatable, Sendable {
    var solution: Character?
    var guess: Character?
    var number: Int?

    var isBlock: Bool { solution == nil }
    var isCorrect: Bool { solution != nil && guess == solution }
}

struct CrosswordEngine: Codable, Equatable, Sendable {
    private(set) var grid: PuzzleGrid<CrosswordCell>
    let entries: [CrosswordEntry]
    private(set) var selectedPoint: PuzzlePoint
    private(set) var selectedDirection: CrosswordDirection = .across

    init(rows: Int, columns: Int, entries: [CrosswordEntry]) {
        self.grid = PuzzleGrid(rows: rows, columns: columns, fill: CrosswordCell(solution: nil, guess: nil, number: nil))
        self.entries = entries
        self.selectedPoint = entries.first?.start ?? PuzzlePoint(row: 0, col: 0)
        buildSolution()
    }

    var isSolved: Bool {
        grid.allPoints().allSatisfy { point in
            let cell = grid[point]
            return cell.isBlock || cell.isCorrect
        }
    }

    mutating func select(_ point: PuzzlePoint, direction: CrosswordDirection? = nil) {
        guard grid.contains(point), !grid[point].isBlock else { return }
        selectedPoint = point
        if let direction {
            selectedDirection = direction
        } else {
            selectedDirection = selectedDirection == .across ? .down : .across
        }
    }

    mutating func input(_ character: Character) {
        guard grid.contains(selectedPoint), !grid[selectedPoint].isBlock else { return }
        let upperString = String(String(character).uppercased().prefix(1))
        guard upperString.unicodeScalars.allSatisfy({ CharacterSet.letters.contains($0) }),
              let upper = upperString.first else { return }
        grid[selectedPoint].guess = upper
        advanceSelection()
    }

    mutating func delete() {
        guard grid.contains(selectedPoint), !grid[selectedPoint].isBlock else { return }
        grid[selectedPoint].guess = nil
    }

    func activeEntry() -> CrosswordEntry? {
        entries.first { $0.direction == selectedDirection && $0.contains(selectedPoint) }
            ?? entries.first { $0.contains(selectedPoint) }
    }

    func entries(at point: PuzzlePoint) -> [CrosswordEntry] {
        entries.filter { $0.contains(point) }
    }

    private mutating func buildSolution() {
        for entry in entries {
            for (offset, character) in entry.answer.uppercased().enumerated() {
                let point: PuzzlePoint
                switch entry.direction {
                case .across:
                    point = PuzzlePoint(row: entry.start.row, col: entry.start.col + offset)
                case .down:
                    point = PuzzlePoint(row: entry.start.row + offset, col: entry.start.col)
                }
                guard grid.contains(point) else { continue }
                grid[point].solution = character
            }
            if grid.contains(entry.start) {
                grid[entry.start].number = entry.number
            }
        }
    }

    private mutating func advanceSelection() {
        guard let entry = activeEntry(),
              let currentIndex = entry.points().firstIndex(of: selectedPoint)
        else { return }
        let nextIndex = currentIndex + 1
        if nextIndex < entry.length {
            selectedPoint = entry.points()[nextIndex]
        }
    }
}

enum MiniCrosswordSeed {
    static func nytStyleFiveByFive() -> CrosswordEngine {
        CrosswordEngine(
            rows: 5,
            columns: 5,
            entries: [
                CrosswordEntry(id: "1A", number: 1, direction: .across, start: PuzzlePoint(row: 0, col: 0), answer: "APPLE", clue: "Fruit in a laptop logo"),
                CrosswordEntry(id: "6A", number: 6, direction: .across, start: PuzzlePoint(row: 1, col: 0), answer: "ROAST", clue: "Coffee preparation"),
                CrosswordEntry(id: "7A", number: 7, direction: .across, start: PuzzlePoint(row: 2, col: 0), answer: "CADET", clue: "Academy student"),
                CrosswordEntry(id: "8A", number: 8, direction: .across, start: PuzzlePoint(row: 3, col: 0), answer: "EAGER", clue: "Very keen"),
                CrosswordEntry(id: "9A", number: 9, direction: .across, start: PuzzlePoint(row: 4, col: 0), answer: "STEEL", clue: "Strong alloy"),
                CrosswordEntry(id: "1D", number: 1, direction: .down, start: PuzzlePoint(row: 0, col: 0), answer: "ARCES", clue: "Grid spine letters"),
                CrosswordEntry(id: "2D", number: 2, direction: .down, start: PuzzlePoint(row: 0, col: 1), answer: "POAAT", clue: "Practice fill"),
                CrosswordEntry(id: "3D", number: 3, direction: .down, start: PuzzlePoint(row: 0, col: 2), answer: "PADGE", clue: "Practice fill"),
                CrosswordEntry(id: "4D", number: 4, direction: .down, start: PuzzlePoint(row: 0, col: 3), answer: "LSEEE", clue: "Practice fill"),
                CrosswordEntry(id: "5D", number: 5, direction: .down, start: PuzzlePoint(row: 0, col: 4), answer: "ETTRL", clue: "Practice fill")
            ]
        )
    }
}
// END mChatAI macOS Component: crossword.engine
