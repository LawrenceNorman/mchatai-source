// BEGIN mChatAI macOS Component: boardgame.checkers (components/board-game/CheckersRules.swift)
import Foundation

enum CheckersRules {
    static func startingBoard() -> Board8x8 {
        var board = Board8x8()
        for row in 0..<3 {
            for col in 0..<8 where (row + col).isMultiple(of: 2) == false {
                board[PuzzlePoint(row: row, col: col)] = BoardPiece(side: .black, kind: .checker)
            }
        }
        for row in 5..<8 {
            for col in 0..<8 where (row + col).isMultiple(of: 2) == false {
                board[PuzzlePoint(row: row, col: col)] = BoardPiece(side: .white, kind: .checker)
            }
        }
        return board
    }

    static func legalMoves(from point: PuzzlePoint, on board: Board8x8) -> [BoardMove] {
        guard let piece = board[point],
              piece.kind == .checker || piece.kind == .checkerKing else { return [] }

        let directions = movementDirections(for: piece)
        var captures: [BoardMove] = []
        var slides: [BoardMove] = []

        for direction in directions {
            let adjacent = PuzzlePoint(row: point.row + direction.row, col: point.col + direction.col)
            let landing = PuzzlePoint(row: point.row + direction.row * 2, col: point.col + direction.col * 2)

            if board.contains(adjacent), let target = board[adjacent], target.side != piece.side,
               board.contains(landing), board[landing] == nil {
                captures.append(BoardMove(from: point, to: landing, captured: adjacent, promotion: promotion(for: piece, landing: landing)))
            } else if board.contains(adjacent), board[adjacent] == nil {
                slides.append(BoardMove(from: point, to: adjacent, captured: nil, promotion: promotion(for: piece, landing: adjacent)))
            }
        }

        return captures.isEmpty ? slides : captures
    }

    static func allLegalMoves(for side: BoardSide, on board: Board8x8) -> [BoardMove] {
        let moves = board.pieces(for: side).flatMap { legalMoves(from: $0.point, on: board) }
        let captures = moves.filter { $0.captured != nil }
        return captures.isEmpty ? moves : captures
    }

    static func apply(_ move: BoardMove, to board: inout Board8x8) {
        guard var piece = board[move.from] else { return }
        board[move.from] = nil
        if let captured = move.captured {
            board[captured] = nil
        }
        if let promotion = move.promotion {
            piece.kind = promotion
        }
        board[move.to] = piece
    }

    private static func movementDirections(for piece: BoardPiece) -> [PuzzlePoint] {
        if piece.kind == .checkerKing {
            return [
                PuzzlePoint(row: -1, col: -1),
                PuzzlePoint(row: -1, col: 1),
                PuzzlePoint(row: 1, col: -1),
                PuzzlePoint(row: 1, col: 1)
            ]
        }
        let rowStep = piece.side == .white ? -1 : 1
        return [PuzzlePoint(row: rowStep, col: -1), PuzzlePoint(row: rowStep, col: 1)]
    }

    private static func promotion(for piece: BoardPiece, landing: PuzzlePoint) -> BoardPieceKind? {
        guard piece.kind == .checker else { return nil }
        if piece.side == .white && landing.row == 0 { return .checkerKing }
        if piece.side == .black && landing.row == 7 { return .checkerKing }
        return nil
    }
}
// END mChatAI macOS Component: boardgame.checkers
