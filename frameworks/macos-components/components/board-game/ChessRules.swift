// BEGIN mChatAI macOS Component: boardgame.chess (components/board-game/ChessRules.swift)
import Foundation

enum ChessRules {
    static func startingBoard() -> Board8x8 {
        var board = Board8x8()
        let backRank: [BoardPieceKind] = [.rook, .knight, .bishop, .queen, .king, .bishop, .knight, .rook]
        for col in 0..<8 {
            board[PuzzlePoint(row: 0, col: col)] = BoardPiece(side: .black, kind: backRank[col])
            board[PuzzlePoint(row: 1, col: col)] = BoardPiece(side: .black, kind: .pawn)
            board[PuzzlePoint(row: 6, col: col)] = BoardPiece(side: .white, kind: .pawn)
            board[PuzzlePoint(row: 7, col: col)] = BoardPiece(side: .white, kind: backRank[col])
        }
        return board
    }

    static func legalMoves(from point: PuzzlePoint, on board: Board8x8, filterCheck: Bool = true) -> [BoardMove] {
        guard let piece = board[point] else { return [] }
        let pseudoMoves: [BoardMove]

        switch piece.kind {
        case .pawn:
            pseudoMoves = pawnMoves(from: point, piece: piece, board: board)
        case .rook:
            pseudoMoves = rayMoves(from: point, piece: piece, board: board, directions: orthogonalDirections)
        case .bishop:
            pseudoMoves = rayMoves(from: point, piece: piece, board: board, directions: diagonalDirections)
        case .queen:
            pseudoMoves = rayMoves(from: point, piece: piece, board: board, directions: orthogonalDirections + diagonalDirections)
        case .king:
            pseudoMoves = stepMoves(from: point, piece: piece, board: board, directions: orthogonalDirections + diagonalDirections)
        case .knight:
            pseudoMoves = stepMoves(from: point, piece: piece, board: board, directions: knightDirections)
        case .checker, .checkerKing:
            pseudoMoves = []
        }

        guard filterCheck else { return pseudoMoves }
        return pseudoMoves.filter { move in
            var next = board
            apply(move, to: &next)
            return !isKingInCheck(piece.side, on: next)
        }
    }

    static func allLegalMoves(for side: BoardSide, on board: Board8x8) -> [BoardMove] {
        board.pieces(for: side).flatMap { legalMoves(from: $0.point, on: board) }
    }

    static func apply(_ move: BoardMove, to board: inout Board8x8) {
        guard var piece = board[move.from] else { return }
        board[move.from] = nil
        if let promotion = move.promotion {
            piece.kind = promotion
        }
        board[move.to] = piece
    }

    static func isKingInCheck(_ side: BoardSide, on board: Board8x8) -> Bool {
        guard let king = board.pieces(for: side).first(where: { $0.piece.kind == .king })?.point else {
            return false
        }
        for enemy in board.pieces(for: side.opponent) {
            if legalMoves(from: enemy.point, on: board, filterCheck: false).contains(where: { $0.to == king }) {
                return true
            }
        }
        return false
    }

    static func isCheckmate(_ side: BoardSide, on board: Board8x8) -> Bool {
        isKingInCheck(side, on: board) && allLegalMoves(for: side, on: board).isEmpty
    }

    private static let orthogonalDirections = [
        PuzzlePoint(row: -1, col: 0), PuzzlePoint(row: 1, col: 0),
        PuzzlePoint(row: 0, col: -1), PuzzlePoint(row: 0, col: 1)
    ]

    private static let diagonalDirections = [
        PuzzlePoint(row: -1, col: -1), PuzzlePoint(row: -1, col: 1),
        PuzzlePoint(row: 1, col: -1), PuzzlePoint(row: 1, col: 1)
    ]

    private static let knightDirections = [
        PuzzlePoint(row: -2, col: -1), PuzzlePoint(row: -2, col: 1),
        PuzzlePoint(row: -1, col: -2), PuzzlePoint(row: -1, col: 2),
        PuzzlePoint(row: 1, col: -2), PuzzlePoint(row: 1, col: 2),
        PuzzlePoint(row: 2, col: -1), PuzzlePoint(row: 2, col: 1)
    ]

    private static func pawnMoves(from point: PuzzlePoint, piece: BoardPiece, board: Board8x8) -> [BoardMove] {
        let step = piece.side == .white ? -1 : 1
        let startRow = piece.side == .white ? 6 : 1
        let promotionRow = piece.side == .white ? 0 : 7
        var moves: [BoardMove] = []

        let one = PuzzlePoint(row: point.row + step, col: point.col)
        if board.contains(one), board[one] == nil {
            moves.append(BoardMove(from: point, to: one, promotion: one.row == promotionRow ? .queen : nil))
            let two = PuzzlePoint(row: point.row + step * 2, col: point.col)
            if point.row == startRow, board.contains(two), board[two] == nil {
                moves.append(BoardMove(from: point, to: two))
            }
        }

        for colDelta in [-1, 1] {
            let target = PuzzlePoint(row: point.row + step, col: point.col + colDelta)
            if board.contains(target), let occupant = board[target], occupant.side != piece.side {
                moves.append(BoardMove(from: point, to: target, captured: target, promotion: target.row == promotionRow ? .queen : nil))
            }
        }

        return moves
    }

    private static func stepMoves(from point: PuzzlePoint, piece: BoardPiece, board: Board8x8, directions: [PuzzlePoint]) -> [BoardMove] {
        directions.compactMap { direction in
            let target = PuzzlePoint(row: point.row + direction.row, col: point.col + direction.col)
            guard board.contains(target) else { return nil }
            if let occupant = board[target], occupant.side == piece.side { return nil }
            return BoardMove(from: point, to: target, captured: board[target] == nil ? nil : target)
        }
    }

    private static func rayMoves(from point: PuzzlePoint, piece: BoardPiece, board: Board8x8, directions: [PuzzlePoint]) -> [BoardMove] {
        var moves: [BoardMove] = []
        for direction in directions {
            var target = PuzzlePoint(row: point.row + direction.row, col: point.col + direction.col)
            while board.contains(target) {
                if let occupant = board[target] {
                    if occupant.side != piece.side {
                        moves.append(BoardMove(from: point, to: target, captured: target))
                    }
                    break
                }
                moves.append(BoardMove(from: point, to: target))
                target = PuzzlePoint(row: target.row + direction.row, col: target.col + direction.col)
            }
        }
        return moves
    }
}
// END mChatAI macOS Component: boardgame.chess
