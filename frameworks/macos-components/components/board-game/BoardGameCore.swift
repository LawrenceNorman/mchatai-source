// BEGIN mChatAI macOS Component: boardgame.core (components/board-game/BoardGameCore.swift)
import Foundation

enum BoardSide: String, Codable, Sendable {
    case white
    case black

    var opponent: BoardSide { self == .white ? .black : .white }
}

enum BoardPieceKind: String, Codable, Sendable {
    case checker
    case checkerKing
    case pawn
    case rook
    case knight
    case bishop
    case queen
    case king
}

struct BoardPiece: Codable, Equatable, Sendable {
    var side: BoardSide
    var kind: BoardPieceKind

    var isKing: Bool {
        kind == .king || kind == .checkerKing
    }
}

struct BoardMove: Codable, Equatable, Sendable {
    let from: PuzzlePoint
    let to: PuzzlePoint
    var captured: PuzzlePoint?
    var promotion: BoardPieceKind?
}

struct Board8x8: Codable, Equatable, Sendable {
    private(set) var grid = PuzzleGrid<BoardPiece?>(rows: 8, columns: 8, fill: nil)

    subscript(_ point: PuzzlePoint) -> BoardPiece? {
        get {
            guard grid.contains(point) else { return nil }
            return grid[point]
        }
        set {
            guard grid.contains(point) else { return }
            grid[point] = newValue
        }
    }

    func contains(_ point: PuzzlePoint) -> Bool {
        grid.contains(point)
    }

    func pieces(for side: BoardSide? = nil) -> [(point: PuzzlePoint, piece: BoardPiece)] {
        grid.allPoints().compactMap { point in
            guard let piece = self[point] else { return nil }
            if let side, piece.side != side { return nil }
            return (point, piece)
        }
    }

    static func algebraic(_ square: String) -> PuzzlePoint? {
        guard square.count == 2,
              let file = square.first?.lowercased().unicodeScalars.first,
              let rankChar = square.last,
              let rank = Int(String(rankChar)) else { return nil }
        let col = Int(file.value) - Int(UnicodeScalar("a").value)
        let row = 8 - rank
        let point = PuzzlePoint(row: row, col: col)
        return (0..<8).contains(row) && (0..<8).contains(col) ? point : nil
    }

    static func squareName(_ point: PuzzlePoint) -> String {
        let file = Character(UnicodeScalar(Int(UnicodeScalar("a").value) + point.col)!)
        return "\(file)\(8 - point.row)"
    }
}
// END mChatAI macOS Component: boardgame.core
