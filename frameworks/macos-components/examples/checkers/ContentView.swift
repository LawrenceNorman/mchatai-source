import SwiftUI

struct ContentView: View {
    @State private var game = CheckersGameState.newGame()

    var body: some View {
        HStack(spacing: 20) {
            boardView
            sidePanel
        }
        .padding(22)
        .frame(minWidth: 880, minHeight: 660)
        .background(Color(red: 0.08, green: 0.09, blue: 0.11))
        .foregroundStyle(.white)
        .onAppear {
            print("[CheckersExample] ready legalMoves=\(CheckersRules.allLegalMoves(for: game.turn, on: game.board).count)")
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
        .frame(minWidth: 560, maxWidth: 620)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color.white.opacity(0.20), lineWidth: 2)
        }
        .shadow(color: .black.opacity(0.45), radius: 16, y: 8)
    }

    private func boardSquare(_ point: PuzzlePoint) -> some View {
        let isDark = !(point.row + point.col).isMultiple(of: 2)
        let isSelected = game.selected == point
        let move = game.legalMovesForSelection.first { $0.to == point }
        let isLegalDestination = move != nil

        return Button {
            game.tap(point)
        } label: {
            ZStack {
                Rectangle()
                    .fill(squareColor(isDark: isDark, selected: isSelected, legal: isLegalDestination))

                if isLegalDestination {
                    Circle()
                        .fill((move?.captured == nil ? Color.white : Color.red).opacity(0.65))
                        .frame(width: 18, height: 18)
                }

                if let piece = game.board[point] {
                    checkerPiece(piece)
                        .padding(9)
                }

                if isSelected {
                    Rectangle()
                        .stroke(.yellow, lineWidth: 4)
                }
            }
            .aspectRatio(1, contentMode: .fit)
        }
        .buttonStyle(.plain)
        .disabled(!isDark && game.board[point] == nil)
    }

    private func checkerPiece(_ piece: BoardPiece) -> some View {
        ZStack {
            Circle()
                .fill(piece.side == .white ? Color(red: 0.93, green: 0.91, blue: 0.84) : Color(red: 0.14, green: 0.14, blue: 0.16))
                .shadow(color: .black.opacity(0.45), radius: 5, y: 3)
            Circle()
                .stroke(piece.side == .white ? Color.black.opacity(0.18) : Color.white.opacity(0.18), lineWidth: 3)
                .padding(6)
            if piece.kind == .checkerKing {
                Text("K")
                    .font(.title.weight(.black))
                    .foregroundStyle(piece.side == .white ? .black.opacity(0.75) : .white.opacity(0.82))
            }
        }
    }

    private func squareColor(isDark: Bool, selected: Bool, legal: Bool) -> Color {
        if selected { return Color(red: 0.56, green: 0.43, blue: 0.12) }
        if legal { return Color(red: 0.26, green: 0.46, blue: 0.22) }
        return isDark ? Color(red: 0.31, green: 0.18, blue: 0.10) : Color(red: 0.82, green: 0.70, blue: 0.52)
    }

    private var sidePanel: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 5) {
                Text("Native Checkers")
                    .font(.system(size: 32, weight: .black, design: .rounded))
                Text(game.status)
                    .font(.headline)
                    .foregroundStyle(.white.opacity(0.70))
            }

            scoreCard

            Toggle("Mandatory jumps", isOn: Binding(
                get: { game.capturePolicy == .mandatory },
                set: { game.setCapturePolicy($0 ? .mandatory : .optional) }
            ))
            .toggleStyle(.switch)

            Button("Reset") {
                game = .newGame(capturePolicy: game.capturePolicy)
            }
            .keyboardShortcut("r", modifiers: [])
            .buttonStyle(.borderedProminent)

            VStack(alignment: .leading, spacing: 8) {
                Text("Rules")
                    .font(.headline)
                Text("White moves first. Pieces king on the far row. Red targets are jumps. Optional jumps allow normal moves when another piece can jump; once a jump starts, available double jumps must continue.")
                    .font(.callout)
                    .foregroundStyle(.white.opacity(0.66))
                    .fixedSize(horizontal: false, vertical: true)
            }

            logView

            Spacer()
        }
        .padding(18)
        .frame(width: 280)
        .background(Color(red: 0.14, green: 0.16, blue: 0.20))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var scoreCard: some View {
        VStack(spacing: 10) {
            HStack {
                Label("Turn", systemImage: "arrow.triangle.2.circlepath")
                Spacer()
                Text(game.turn == .white ? "White" : "Black")
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
                Text("\(game.availableMoves.count)")
                    .monospacedDigit()
                    .fontWeight(.black)
            }
            HStack {
                Label("Jump", systemImage: "arrow.up.right.circle")
                Spacer()
                Text(CheckersRules.hasCapture(for: game.turn, on: game.board) ? "Available" : "None")
                    .monospacedDigit()
                    .fontWeight(.black)
            }
        }
        .font(.callout)
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
            .background(Color(red: 0.08, green: 0.09, blue: 0.11))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }
}

private struct CheckersGameState {
    var board: Board8x8
    var turn: BoardSide
    var selected: PuzzlePoint?
    var status: String
    var log: [String]
    var capturePolicy: CheckersCapturePolicy
    var mustContinueFrom: PuzzlePoint?
    var gameOver = false

    static func newGame(capturePolicy: CheckersCapturePolicy = .optional) -> CheckersGameState {
        CheckersGameState(
            board: CheckersRules.startingBoard(),
            turn: .white,
            selected: nil,
            status: "White to move. Jumps are optional.",
            log: ["New game. White moves first.", "Optional jumps: slides remain legal when a jump exists."],
            capturePolicy: capturePolicy,
            mustContinueFrom: nil
        )
    }

    var availableMoves: [BoardMove] {
        if let mustContinueFrom {
            return CheckersRules.captureMoves(from: mustContinueFrom, on: board)
        }
        return CheckersRules.allLegalMoves(for: turn, on: board, capturePolicy: capturePolicy)
    }

    var legalMovesForSelection: [BoardMove] {
        guard let selected else { return [] }
        return availableMoves.filter { $0.from == selected }
    }

    var whiteCount: Int { board.pieces(for: .white).count }
    var blackCount: Int { board.pieces(for: .black).count }

    mutating func tap(_ point: PuzzlePoint) {
        guard !gameOver else { return }

        if let move = legalMovesForSelection.first(where: { $0.to == point }) {
            let turnCompleted = apply(move, actor: "White")
            if turnCompleted && !gameOver {
                runComputerTurn()
            }
            return
        }

        if let mustContinueFrom {
            selected = mustContinueFrom
            status = "\(turnName) must continue the jump from \(Board8x8.squareName(mustContinueFrom))."
            return
        }

        guard let piece = board[point], piece.side == turn else {
            selected = nil
            status = "\(turnName) to move."
            return
        }

        let moves = availableMoves.filter { $0.from == point }
        if moves.isEmpty {
            selected = nil
            status = "That piece has no legal move."
        } else {
            selected = point
            let captureText = moves.contains { $0.captured != nil } ? " Jump available." : jumpHint
            status = "\(turnName) selected \(Board8x8.squareName(point)).\(captureText)"
        }
    }

    private mutating func runComputerTurn() {
        guard turn == .black, !gameOver else { return }
        repeat {
            let moves = availableMoves
            guard let move = moves.max(by: { movePriority($0) < movePriority($1) }) else {
                finish(winner: .white)
                return
            }
            _ = apply(move, actor: "Black")
        } while turn == .black && !gameOver
    }

    @discardableResult
    private mutating func apply(_ move: BoardMove, actor: String) -> Bool {
        CheckersRules.apply(move, to: &board)
        selected = nil

        let capture = move.captured == nil ? "" : " capturing \(Board8x8.squareName(move.captured!))"
        let promotion = move.promotion == nil ? "" : " and kinging"
        appendLog("\(actor): \(Board8x8.squareName(move.from)) to \(Board8x8.squareName(move.to))\(capture)\(promotion).")

        if move.captured != nil, move.promotion == nil {
            let continuations = CheckersRules.captureMoves(from: move.to, on: board)
            if !continuations.isEmpty {
                selected = move.to
                mustContinueFrom = move.to
                status = "\(turnName) must continue the jump from \(Board8x8.squareName(move.to))."
                appendLog("\(actor): continue jumping from \(Board8x8.squareName(move.to)).")
                return false
            }
        }

        turn = turn.opponent
        mustContinueFrom = nil
        if board.pieces(for: turn).isEmpty || availableMoves.isEmpty {
            finish(winner: turn.opponent)
        } else {
            status = "\(turnName) to move.\(jumpHint)"
        }
        return true
    }

    mutating func setCapturePolicy(_ policy: CheckersCapturePolicy) {
        capturePolicy = policy
        selected = nil
        mustContinueFrom = nil
        status = "\(turnName) to move.\(jumpHint)"
        appendLog(policy == .mandatory ? "Rule changed: jumps are mandatory." : "Rule changed: jumps are optional.")
    }

    private mutating func finish(winner: BoardSide) {
        gameOver = true
        selected = nil
        status = "\(winner == .white ? "White" : "Black") wins."
        appendLog(status)
    }

    private func movePriority(_ move: BoardMove) -> Int {
        var score = 0
        if move.captured != nil { score += 100 }
        if move.promotion != nil { score += 50 }
        score += move.to.row
        return score
    }

    private var turnName: String {
        turn == .white ? "White" : "Black"
    }

    private var jumpHint: String {
        guard CheckersRules.hasCapture(for: turn, on: board) else { return "" }
        return capturePolicy == .mandatory ? " Jump required." : " Jump available; slides are allowed."
    }

    private mutating func appendLog(_ message: String) {
        log.append(message)
        if log.count > 30 {
            log.removeFirst(log.count - 30)
        }
    }
}
