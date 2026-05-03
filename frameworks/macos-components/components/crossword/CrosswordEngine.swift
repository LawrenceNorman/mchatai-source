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
    var solution: String?
    var guess: String?
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
              !upperString.isEmpty else { return }
        grid[selectedPoint].guess = upperString
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
                grid[point].solution = String(character)
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
    /// Picks one of the curated NYT-style mini puzzles based on the day-of-year so
    /// users see a fresh puzzle each day instead of the same letters every session.
    static func daily(referenceDate: Date = Date()) -> CrosswordEngine {
        let bank = [puzzleA, puzzleB, puzzleC]
        let day = Calendar.current.ordinality(of: .day, in: .year, for: referenceDate) ?? 1
        return bank[abs(day - 1) % bank.count]()
    }

    /// Backwards-compatible entry point used by older glue code; routes to `daily()`.
    static func nytStyleFiveByFive() -> CrosswordEngine {
        daily()
    }

    /// Puzzle A — corner-blocked 5x5, every Across and Down a real common word.
    /// Layout (`#` = block):
    ///     # # P E P
    ///     S C A L E
    ///     P O I S E
    ///     I N N E R
    ///     N E T # #
    static func puzzleA() -> CrosswordEngine {
        CrosswordEngine(
            rows: 5,
            columns: 5,
            entries: [
                CrosswordEntry(id: "1A", number: 1, direction: .across, start: PuzzlePoint(row: 0, col: 2), answer: "PEP", clue: "Energy and enthusiasm"),
                CrosswordEntry(id: "4A", number: 4, direction: .across, start: PuzzlePoint(row: 1, col: 0), answer: "SCALE", clue: "Bathroom weighing device"),
                CrosswordEntry(id: "8A", number: 8, direction: .across, start: PuzzlePoint(row: 2, col: 0), answer: "POISE", clue: "Composure under pressure"),
                CrosswordEntry(id: "9A", number: 9, direction: .across, start: PuzzlePoint(row: 3, col: 0), answer: "INNER", clue: "Most interior"),
                CrosswordEntry(id: "10A", number: 10, direction: .across, start: PuzzlePoint(row: 4, col: 0), answer: "NET", clue: "Tennis or fishing essential"),
                CrosswordEntry(id: "2D", number: 2, direction: .down, start: PuzzlePoint(row: 1, col: 0), answer: "SPIN", clue: "Bowler's English"),
                CrosswordEntry(id: "3D", number: 3, direction: .down, start: PuzzlePoint(row: 1, col: 1), answer: "CONE", clue: "Pine or traffic shape"),
                CrosswordEntry(id: "1D", number: 1, direction: .down, start: PuzzlePoint(row: 0, col: 2), answer: "PAINT", clue: "What you load into a roller"),
                CrosswordEntry(id: "5D", number: 5, direction: .down, start: PuzzlePoint(row: 0, col: 3), answer: "ELSE", clue: "Otherwise"),
                CrosswordEntry(id: "6D", number: 6, direction: .down, start: PuzzlePoint(row: 0, col: 4), answer: "PEER", clue: "Equal or contemporary")
            ]
        )
    }

    /// Puzzle B — same shape, alternate words. Trickier vocab than A.
    /// Layout:
    ///     # # R I M
    ///     S P O R E
    ///     L A B O R
    ///     A L O N E
    ///     P E T # #
    static func puzzleB() -> CrosswordEngine {
        CrosswordEngine(
            rows: 5,
            columns: 5,
            entries: [
                CrosswordEntry(id: "1A", number: 1, direction: .across, start: PuzzlePoint(row: 0, col: 2), answer: "RIM", clue: "Wheel's outer edge"),
                CrosswordEntry(id: "4A", number: 4, direction: .across, start: PuzzlePoint(row: 1, col: 0), answer: "SPORE", clue: "Mushroom seed"),
                CrosswordEntry(id: "8A", number: 8, direction: .across, start: PuzzlePoint(row: 2, col: 0), answer: "LABOR", clue: "Hard work"),
                CrosswordEntry(id: "9A", number: 9, direction: .across, start: PuzzlePoint(row: 3, col: 0), answer: "ALONE", clue: "By oneself"),
                CrosswordEntry(id: "10A", number: 10, direction: .across, start: PuzzlePoint(row: 4, col: 0), answer: "PET", clue: "Family dog or cat"),
                CrosswordEntry(id: "2D", number: 2, direction: .down, start: PuzzlePoint(row: 1, col: 0), answer: "SLAP", clue: "Open-handed strike"),
                CrosswordEntry(id: "3D", number: 3, direction: .down, start: PuzzlePoint(row: 1, col: 1), answer: "PALE", clue: "Lacking color"),
                CrosswordEntry(id: "1D", number: 1, direction: .down, start: PuzzlePoint(row: 0, col: 2), answer: "ROBOT", clue: "WALL-E or R2-D2"),
                CrosswordEntry(id: "5D", number: 5, direction: .down, start: PuzzlePoint(row: 0, col: 3), answer: "IRON", clue: "Element with symbol Fe"),
                CrosswordEntry(id: "6D", number: 6, direction: .down, start: PuzzlePoint(row: 0, col: 4), answer: "MERE", clue: "Nothing more than")
            ]
        )
    }

    /// Puzzle C — A's variant with STALE swapped in for SCALE (T vs C in col 1).
    /// Layout:
    ///     # # P E P
    ///     S T A L E
    ///     P O I S E
    ///     I N N E R
    ///     N E T # #
    static func puzzleC() -> CrosswordEngine {
        CrosswordEngine(
            rows: 5,
            columns: 5,
            entries: [
                CrosswordEntry(id: "1A", number: 1, direction: .across, start: PuzzlePoint(row: 0, col: 2), answer: "PEP", clue: "Vim and vigor"),
                CrosswordEntry(id: "4A", number: 4, direction: .across, start: PuzzlePoint(row: 1, col: 0), answer: "STALE", clue: "Past freshness"),
                CrosswordEntry(id: "8A", number: 8, direction: .across, start: PuzzlePoint(row: 2, col: 0), answer: "POISE", clue: "Calm self-assurance"),
                CrosswordEntry(id: "9A", number: 9, direction: .across, start: PuzzlePoint(row: 3, col: 0), answer: "INNER", clue: "Innermost"),
                CrosswordEntry(id: "10A", number: 10, direction: .across, start: PuzzlePoint(row: 4, col: 0), answer: "NET", clue: "Goalie's backstop"),
                CrosswordEntry(id: "2D", number: 2, direction: .down, start: PuzzlePoint(row: 1, col: 0), answer: "SPIN", clue: "Quick rotation"),
                CrosswordEntry(id: "3D", number: 3, direction: .down, start: PuzzlePoint(row: 1, col: 1), answer: "TONE", clue: "Audio quality"),
                CrosswordEntry(id: "1D", number: 1, direction: .down, start: PuzzlePoint(row: 0, col: 2), answer: "PAINT", clue: "House-color verb"),
                CrosswordEntry(id: "5D", number: 5, direction: .down, start: PuzzlePoint(row: 0, col: 3), answer: "ELSE", clue: "If not, what?"),
                CrosswordEntry(id: "6D", number: 6, direction: .down, start: PuzzlePoint(row: 0, col: 4), answer: "PEER", clue: "Look closely")
            ]
        )
    }
}
// END mChatAI macOS Component: crossword.engine
