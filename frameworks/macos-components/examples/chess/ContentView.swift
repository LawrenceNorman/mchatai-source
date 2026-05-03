import SwiftUI

struct ContentView: View {
    @State private var game = ChessGameState.newGame()
    @State private var blackThinking = false

    var body: some View {
        HStack(spacing: 20) {
            boardView
            sidePanel
        }
        .padding(22)
        .frame(minWidth: 920, minHeight: 680)
        .background(Color(red: 0.08, green: 0.09, blue: 0.12))
        .foregroundStyle(.white)
        .onAppear {
            print("[ChessExample] ready legalMoves=\(ChessRules.allLegalMoves(for: game.turn, on: game.board).count)")
        }
        .onChange(of: game.turn.rawValue) { _, _ in
            scheduleBlackMoveIfNeeded()
        }
    }

    private func scheduleBlackMoveIfNeeded() {
        guard game.turn == .black, !game.gameOver, !blackThinking else { return }
        blackThinking = true
        game.status = "Black CPU is thinking."
        Task {
            try? await Task.sleep(nanoseconds: 450_000_000)
            await MainActor.run {
                guard game.turn == .black, !game.gameOver else {
                    blackThinking = false
                    return
                }
                game.playComputerMove()
                blackThinking = false
            }
        }
    }

    private var boardView: some View {
        VStack(spacing: 0) {
            ForEach(0..<8, id: \.self) { row in
                HStack(spacing: 0) {
                    ForEach(0..<8, id: \.self) { col in
                        let point = PuzzlePoint(row: row, col: col)
                        boardSquare(point)
                    }
                }
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .frame(minWidth: 580, maxWidth: 640)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color.white.opacity(0.20), lineWidth: 2)
        }
        .shadow(color: .black.opacity(0.45), radius: 16, y: 8)
    }

    private func boardSquare(_ point: PuzzlePoint) -> some View {
        let isLight = (point.row + point.col).isMultiple(of: 2)
        let isSelected = game.selected == point
        let move = game.legalMovesForSelection.first { $0.to == point }
        let isLegalDestination = move != nil
        let isKingInCheck = game.isCheckedKing(point)

        return Button {
            guard game.turn == .white, !blackThinking else { return }
            game.tap(point)
        } label: {
            ZStack {
                Rectangle()
                    .fill(squareColor(isLight: isLight, selected: isSelected, legal: isLegalDestination, checked: isKingInCheck))

                if isLegalDestination {
                    Circle()
                        .fill((move?.captured == nil ? Color.white : Color.red).opacity(0.72))
                        .frame(width: move?.captured == nil ? 16 : 26, height: move?.captured == nil ? 16 : 26)
                }

                if let piece = game.board[point] {
                    Text(piece.symbol)
                        .font(.system(size: 46, weight: .black, design: .rounded))
                        .minimumScaleFactor(0.72)
                        .foregroundStyle(piece.side == .white ? Color.white : Color.black.opacity(0.92))
                        .shadow(color: piece.side == .white ? .black.opacity(0.55) : .white.opacity(0.22), radius: 2, y: 1)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                }

                if isSelected {
                    Rectangle()
                        .stroke(.yellow, lineWidth: 4)
                }

                VStack {
                    HStack {
                        Text(Board8x8.squareName(point))
                            .font(.system(size: 10, weight: .semibold, design: .rounded))
                            .foregroundStyle((isLight ? Color.black : Color.white).opacity(0.36))
                        Spacer()
                    }
                    Spacer()
                }
                .padding(5)
            }
            .aspectRatio(1, contentMode: .fit)
        }
        .buttonStyle(.plain)
    }

    private func squareColor(isLight: Bool, selected: Bool, legal: Bool, checked: Bool) -> Color {
        if checked { return Color(red: 0.58, green: 0.12, blue: 0.16) }
        if selected { return Color(red: 0.60, green: 0.48, blue: 0.12) }
        if legal { return Color(red: 0.20, green: 0.46, blue: 0.28) }
        return isLight ? Color(red: 0.78, green: 0.68, blue: 0.52) : Color(red: 0.30, green: 0.42, blue: 0.30)
    }

    private var sidePanel: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 5) {
                Text("Native Chess")
                    .font(.system(size: 32, weight: .black, design: .rounded))
                Text(game.status)
                    .font(.headline)
                    .foregroundStyle(.white.opacity(0.72))
                    .fixedSize(horizontal: false, vertical: true)
            }

            scoreCard
            capturedCard

            Button("Reset") {
                game = .newGame()
                blackThinking = false
            }
            .keyboardShortcut("r", modifiers: [])
            .buttonStyle(.borderedProminent)

            VStack(alignment: .leading, spacing: 8) {
                Text("Rules")
                    .font(.headline)
                Text("You play White. Click a piece, then a highlighted square; Black replies automatically. Legal moves are filtered to protect each king. Pawns promote to queens.")
                    .font(.callout)
                    .foregroundStyle(.white.opacity(0.66))
                    .fixedSize(horizontal: false, vertical: true)
            }

            logView

            Spacer()
        }
        .padding(18)
        .frame(width: 300)
        .background(Color(red: 0.14, green: 0.16, blue: 0.21))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var scoreCard: some View {
        VStack(spacing: 10) {
            HStack {
                Label("Turn", systemImage: "arrow.triangle.2.circlepath")
                Spacer()
                Text(game.turn == .white ? "White" : "Black CPU")
                    .fontWeight(.black)
            }
            HStack {
                Label("White", systemImage: "circle.fill")
                Spacer()
                Text("\(game.whiteCount)")
                    .monospacedDigit()
                    .fontWeight(.black)
            }
            HStack {
                Label("Black", systemImage: "circle")
                Spacer()
                Text("\(game.blackCount)")
                    .monospacedDigit()
                    .fontWeight(.black)
            }
            HStack {
                Label("Legal", systemImage: "target")
                Spacer()
                Text("\(ChessRules.allLegalMoves(for: game.turn, on: game.board).count)")
                    .monospacedDigit()
                    .fontWeight(.black)
            }
        }
        .font(.callout)
        .padding(12)
        .background(.black.opacity(0.24))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var capturedCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Captured")
                .font(.headline)
            HStack {
                Text("White")
                    .foregroundStyle(.white.opacity(0.62))
                Spacer()
                Text(game.capturedByBlack.map { $0.piece.symbol }.joined(separator: " "))
                    .font(.title3)
            }
            HStack {
                Text("Black")
                    .foregroundStyle(.white.opacity(0.62))
                Spacer()
                Text(game.capturedByWhite.map { $0.piece.symbol }.joined(separator: " "))
                    .font(.title3)
            }
        }
        .padding(12)
        .background(.black.opacity(0.24))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var logView: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Log")
                .font(.headline)
            ScrollView {
                VStack(alignment: .leading, spacing: 5) {
                    ForEach(Array(game.log.suffix(12).enumerated()), id: \.offset) { _, entry in
                        Text(entry)
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.78))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(10)
            }
            .frame(minHeight: 180)
            .background(Color(red: 0.08, green: 0.09, blue: 0.12))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }
}

private struct ChessGameState {
    var board: Board8x8
    var turn: BoardSide
    var selected: PuzzlePoint?
    var status: String
    var log: [String]
    var capturedByWhite: [(point: PuzzlePoint, piece: BoardPiece)]
    var capturedByBlack: [(point: PuzzlePoint, piece: BoardPiece)]
    var gameOver = false

    static func newGame() -> ChessGameState {
        ChessGameState(
            board: ChessRules.startingBoard(),
            turn: .white,
            selected: nil,
            status: "White to move.",
            log: ["New game. White moves first."],
            capturedByWhite: [],
            capturedByBlack: []
        )
    }

    var legalMovesForSelection: [BoardMove] {
        guard let selected else { return [] }
        return ChessRules.legalMoves(from: selected, on: board)
    }

    var whiteCount: Int { board.pieces(for: .white).count }
    var blackCount: Int { board.pieces(for: .black).count }

    mutating func tap(_ point: PuzzlePoint) {
        guard !gameOver, turn == .white else { return }

        if selected != nil {
            if let move = legalMovesForSelection.first(where: { $0.to == point }) {
                play(move)
                return
            }
            self.selected = nil
        }

        guard let piece = board[point], piece.side == turn else {
            status = "\(turn.displayName) to move. Pick one of your pieces."
            return
        }

        let moves = ChessRules.legalMoves(from: point, on: board)
        guard !moves.isEmpty else {
            status = "\(piece.label) on \(Board8x8.squareName(point)) has no legal moves."
            return
        }

        selected = point
        status = "\(piece.label) from \(Board8x8.squareName(point)): \(moves.count) legal move\(moves.count == 1 ? "" : "s")."
    }

    mutating func playComputerMove() {
        guard !gameOver, turn == .black else { return }
        let legal = ChessRules.allLegalMoves(for: .black, on: board)
        guard let move = bestComputerMove(from: legal) else {
            refreshStatus()
            return
        }
        play(move, prefix: "CPU")
    }

    private func bestComputerMove(from moves: [BoardMove]) -> BoardMove? {
        moves.enumerated().max { lhs, rhs in
            let lhsScore = computerScore(lhs.element) - lhs.offset
            let rhsScore = computerScore(rhs.element) - rhs.offset
            return lhsScore < rhsScore
        }?.element
    }

    private func computerScore(_ move: BoardMove) -> Int {
        var score = 0
        if let capturedPoint = move.captured, let captured = board[capturedPoint] {
            score += 1_000 + captured.materialValue
        }
        if move.promotion == .queen {
            score += 900
        }
        var next = board
        ChessRules.apply(move, to: &next)
        if ChessRules.isKingInCheck(.white, on: next) {
            score += 120
        }
        score += max(0, 6 - abs(move.to.row - 3) - abs(move.to.col - 3)) * 8
        if let moving = board[move.from], moving.kind == .pawn {
            score += move.to.row * 3
        }
        return score
    }

    mutating private func play(_ move: BoardMove, prefix: String? = nil) {
        guard let piece = board[move.from] else { return }
        let captured = move.captured.flatMap { point in board[point].map { (point: point, piece: $0) } }
        ChessRules.apply(move, to: &board)
        selected = nil

        if let captured {
            if turn == .white {
                capturedByWhite.append(captured)
            } else {
                capturedByBlack.append(captured)
            }
        }

        let notation = "\(piece.shortName) \(Board8x8.squareName(move.from))-\(Board8x8.squareName(move.to))"
        let actor = prefix.map { "\($0) " } ?? ""
        if let captured {
            log.append("\(actor)\(notation) captures \(captured.piece.shortName)")
        } else {
            log.append("\(actor)\(notation)")
        }

        turn = turn.opponent
        refreshStatus()
    }

    mutating private func refreshStatus() {
        let legal = ChessRules.allLegalMoves(for: turn, on: board)
        let inCheck = ChessRules.isKingInCheck(turn, on: board)
        if legal.isEmpty {
            gameOver = true
            status = inCheck ? "Checkmate. \(turn.opponent.displayName) wins." : "Stalemate."
            log.append(status)
        } else if inCheck {
            status = "\(turn.displayName) is in check."
            log.append(status)
        } else {
            status = "\(turn.displayName) to move."
        }
    }

    func isCheckedKing(_ point: PuzzlePoint) -> Bool {
        guard let piece = board[point], piece.kind == .king else { return false }
        return ChessRules.isKingInCheck(piece.side, on: board)
    }
}

private extension BoardSide {
    var displayName: String {
        self == .white ? "White" : "Black"
    }
}

private extension BoardPiece {
    var symbol: String {
        switch (side, kind) {
        case (.white, .king): return "♔"
        case (.white, .queen): return "♕"
        case (.white, .rook): return "♖"
        case (.white, .bishop): return "♗"
        case (.white, .knight): return "♘"
        case (.white, .pawn): return "♙"
        case (.black, .king): return "♚"
        case (.black, .queen): return "♛"
        case (.black, .rook): return "♜"
        case (.black, .bishop): return "♝"
        case (.black, .knight): return "♞"
        case (.black, .pawn): return "♟"
        case (_, .checker): return "●"
        case (_, .checkerKing): return "K"
        }
    }

    var shortName: String {
        switch kind {
        case .king: return "K"
        case .queen: return "Q"
        case .rook: return "R"
        case .bishop: return "B"
        case .knight: return "N"
        case .pawn: return "P"
        case .checker: return "C"
        case .checkerKing: return "CK"
        }
    }

    var label: String {
        "\(side.displayName) \(shortName)"
    }

    var materialValue: Int {
        switch kind {
        case .king: return 10_000
        case .queen: return 900
        case .rook: return 500
        case .bishop, .knight: return 300
        case .pawn: return 100
        case .checker, .checkerKing: return 0
        }
    }
}
