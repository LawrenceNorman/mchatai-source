// Example glue — adapt freely. The CANONICAL components are
// `components/grid-puzzle/Match3Engine.swift` (depends on GridPuzzleCore).
// Keep them byte-for-byte under `Sources/<TargetName>/MChatAIComponents/`.
//
// 2026-05-04 candy-crush polish round: heavy borrow from the web Candy
// Match reference at frameworks/web-components/examples/candy-match/.
// Extracted patterns:
//   - 6 named candy types (ruby/orange/lemon/mint/blueberry/plum) with
//     gradient fills (NOT abstract A/B/C labels).
//   - Tile shine: a rotated white blob inside each candy gives the 3D
//     candy-jelly look — no art assets required.
//   - Dark-purple radial-gradient background (NOT pure black) — warm,
//     candy-shop palette.
//   - Move counter (start with N moves) for finite-pressure gameplay.
//   - Combo counter that increments per cascade (1x, 2x, 3x...) — way
//     more readable scoring than my old "doubling" rule.
//   - Pulsing hint when the player hasn't swapped in a while (added on
//     macOS — web version doesn't have this but it's table-stakes for
//     a polished tile-swap game).
//   - Possible-move detection + auto-shuffle when no swaps exist.
//   - Drag-direction swap (mouse drag from a candy onto an adjacent cell).
//
// Animation choreography:
//   - Swap: both tiles slide simultaneously (swap-glide), spring snap.
//   - Match: tile scales to 1.3x + fades out over 0.18s, then collapse.
//   - Collapse + refill: tiles slide DOWN (.move(edge: .top) transition)
//     so it actually feels like jewels falling from above.
//   - Cascade flash: 3=sparkle, 4=burst, 5=lightning, escalates per-kind.

import SwiftUI

// MARK: - Candy palette

private struct CandyType {
    let id: Int
    let name: String
    let symbol: String     // engine's abstract symbol id (A..F)
    let topColor: Color    // gradient top
    let bottomColor: Color // gradient bottom

    /// Web Candy Match palette — six gradients borrowed from
    /// frameworks/web-components/examples/candy-match/candy-match.css
    static let all: [CandyType] = [
        CandyType(id: 0, name: "ruby",       symbol: "A", topColor: Color(red: 1.00, green: 0.30, blue: 0.43), bottomColor: Color(red: 0.74, green: 0.09, blue: 0.27)),
        CandyType(id: 1, name: "orange",     symbol: "B", topColor: Color(red: 1.00, green: 0.68, blue: 0.20), bottomColor: Color(red: 0.85, green: 0.37, blue: 0.00)),
        CandyType(id: 2, name: "lemon",      symbol: "C", topColor: Color(red: 0.98, green: 0.80, blue: 0.08), bottomColor: Color(red: 0.73, green: 0.54, blue: 0.00)),
        CandyType(id: 3, name: "mint",       symbol: "D", topColor: Color(red: 0.29, green: 0.87, blue: 0.50), bottomColor: Color(red: 0.08, green: 0.50, blue: 0.24)),
        CandyType(id: 4, name: "blueberry",  symbol: "E", topColor: Color(red: 0.22, green: 0.74, blue: 0.97), bottomColor: Color(red: 0.03, green: 0.35, blue: 0.52)),
        CandyType(id: 5, name: "plum",       symbol: "F", topColor: Color(red: 0.75, green: 0.52, blue: 0.99), bottomColor: Color(red: 0.49, green: 0.13, blue: 0.81))
    ]

    static func forSymbol(_ symbol: String) -> CandyType {
        all.first { $0.symbol == symbol } ?? all[0]
    }
}

// MARK: - ContentView

struct ContentView: View {
    @State private var engine = Match3Engine(rows: 8, columns: 8, seed: 300)
    @State private var seed: UInt64 = 300
    @State private var moves: Int = 24
    @State private var combo: Int = 1
    @State private var totalCleared: Int = 0
    @State private var status = "Drag a candy onto an adjacent candy to swap."

    /// Per-tile transient transforms keyed by point — used to drive the
    /// swap animation (a tile briefly shows offset toward the dragged
    /// direction before the engine actually swaps).
    @State private var tileOffsets: [PuzzlePoint: CGSize] = [:]
    /// Per-tile fade + scale-up for cleared matches (the "pop" before
    /// they disappear). Drives a brief 1.3× scale + opacity 0 transition.
    @State private var poppingTiles: Set<PuzzlePoint> = []
    /// Active match-flash effect (sparkle / burst / lightning), drawn
    /// over the cleared cells before they're refilled.
    @State private var activeFlash: FlashEffect?
    /// Drag-in-flight tracking: which tile started the drag.
    @State private var dragOrigin: PuzzlePoint?
    /// Track time since last move for hint pulsing.
    @State private var lastMoveAt = Date()
    /// The hint pair (if computed) — pulses to draw the player's eye.
    @State private var hintPair: (PuzzlePoint, PuzzlePoint)?
    @State private var hintPulse = false

    private let cellSize: CGFloat = 60
    private let gapSize: CGFloat = 6
    private let hintTimer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    private let hintIdleSeconds: TimeInterval = 5

    private struct FlashEffect: Equatable {
        let kind: Match3Kind
        let center: CGPoint
        let symbol: String
        let id: UUID
    }

    var body: some View {
        ZStack {
            background
            VStack(spacing: 16) {
                header
                HStack(alignment: .top, spacing: 24) {
                    candyBoard
                    sidePanel
                        .frame(width: 230)
                }
                Text(status)
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(Color(red: 1.0, green: 0.97, blue: 0.91).opacity(0.85))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Color.white.opacity(0.10))
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .frame(maxWidth: 680)
            }
            .padding(28)
        }
        .frame(minWidth: 820, minHeight: 760)
        .onReceive(hintTimer) { _ in
            updateHint()
        }
    }

    // MARK: - Background (radial-gradient candy shop, NOT pure black)

    private var background: some View {
        ZStack {
            // Base purple
            Color(red: 0.12, green: 0.06, blue: 0.15).ignoresSafeArea()
            // Warm yellow corner glow (top-left)
            RadialGradient(
                gradient: Gradient(colors: [Color(red: 0.98, green: 0.80, blue: 0.13).opacity(0.22), .clear]),
                center: UnitPoint(x: 0.2, y: 0.1),
                startRadius: 0, endRadius: 360
            )
            // Cool cyan corner glow (top-right)
            RadialGradient(
                gradient: Gradient(colors: [Color(red: 0.13, green: 0.83, blue: 0.93).opacity(0.18), .clear]),
                center: UnitPoint(x: 0.8, y: 0.0),
                startRadius: 0, endRadius: 320
            )
        }
        .ignoresSafeArea()
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Match Three")
                    .font(.system(size: 28, weight: .black, design: .rounded))
                    .foregroundStyle(Color(red: 1.0, green: 0.98, blue: 0.92))
                Text(comboBlurb)
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(Color.orange.opacity(combo > 1 ? 1.0 : 0.5))
            }
            Spacer()
            statBlock(label: "MOVES", value: "\(moves)", isWarning: moves <= 5 && moves > 0)
            statBlock(label: "COMBO", value: "x\(combo)", isWarning: false)
            statBlock(label: "SCORE", value: "\(engine.score)", isWarning: false)
            statBlock(label: "CLEARED", value: "\(totalCleared)", isWarning: false)
        }
    }

    private var comboBlurb: String {
        if engine.lastResolvedMatches.isEmpty { return "Drag a candy" }
        if combo > 1 { return "Combo x\(combo)! +\(engine.lastResolvedMatches.last?.pointsAwarded ?? 0)" }
        return "Nice match!"
    }

    private func statBlock(label: String, value: String, isWarning: Bool) -> some View {
        VStack(alignment: .center, spacing: 2) {
            Text(label)
                .font(.system(size: 11, weight: .heavy))
                .kerning(1.4)
                .foregroundStyle(Color(red: 1.0, green: 0.97, blue: 0.91).opacity(0.6))
            Text(value)
                .font(.system(size: 24, weight: .black, design: .rounded))
                .foregroundStyle(isWarning ? .red : Color(red: 1.0, green: 0.98, blue: 0.92))
                .monospacedDigit()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(minWidth: 76)
        .background(Color.white.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Candy board

    private var candyBoard: some View {
        let total = CGFloat(engine.grid.rows) * cellSize + CGFloat(engine.grid.rows - 1) * gapSize
        return ZStack {
            // Board frame with stroke + gradient backing
            RoundedRectangle(cornerRadius: 24)
                .fill(Color(red: 0.06, green: 0.02, blue: 0.10).opacity(0.80))
                .overlay {
                    RoundedRectangle(cornerRadius: 24)
                        .stroke(Color(red: 0.99, green: 0.91, blue: 0.55).opacity(0.22), lineWidth: 1)
                }
                .frame(width: total + 32, height: total + 32)

            // Tiles
            ForEach(engine.grid.allPoints(), id: \.self) { point in
                candyTile(point)
                    .position(positionFor(point))
                    // Sliding-from-top transition for new candies
                    .transition(.asymmetric(
                        insertion: .move(edge: .top).combined(with: .opacity),
                        removal: .opacity
                    ))
            }

            // Match flash effect (sparkle / burst / lightning)
            if let flash = activeFlash {
                flashView(flash)
                    .position(flash.center)
                    .allowsHitTesting(false)
                    .id(flash.id)
            }
        }
        .frame(width: total + 32, height: total + 32)
    }

    private func positionFor(_ point: PuzzlePoint) -> CGPoint {
        let x = CGFloat(point.col) * (cellSize + gapSize) + cellSize / 2 + 16
        let y = CGFloat(point.row) * (cellSize + gapSize) + cellSize / 2 + 16
        return CGPoint(x: x, y: y)
    }

    @ViewBuilder
    private func candyTile(_ point: PuzzlePoint) -> some View {
        let tile = engine.grid[point]
        if tile.symbol.isEmpty {
            Color.clear.frame(width: cellSize, height: cellSize)
        } else {
            let candy = CandyType.forSymbol(tile.symbol)
            let isDragOrigin = dragOrigin == point
            let isPopping = poppingTiles.contains(point)
            let offset = tileOffsets[point] ?? .zero
            let isHinted = hintPair.map { $0.0 == point || $0.1 == point } ?? false
            candyTileBody(point: point, candy: candy, isDragOrigin: isDragOrigin, isPopping: isPopping, offset: offset, isHinted: isHinted)
        }
    }

    private func candyTileBody(point: PuzzlePoint, candy: CandyType, isDragOrigin: Bool, isPopping: Bool, offset: CGSize, isHinted: Bool) -> some View {
        ZStack {
            // Candy gradient body
            RoundedRectangle(cornerRadius: 18)
                .fill(LinearGradient(
                    colors: [candy.topColor, candy.bottomColor],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                ))

            // Inner shine — the rotated white blob from the web reference
            // gives candies their 3D / jelly look.
            RoundedRectangle(cornerRadius: 18)
                .fill(Color.white.opacity(0.22))
                .scaleEffect(0.62)
                .rotationEffect(.degrees(-18))
                .blur(radius: 0.5)

            // Border
            RoundedRectangle(cornerRadius: 18)
                .stroke(Color.white.opacity(0.28), lineWidth: 1.5)
        }
        .frame(width: cellSize, height: cellSize)
        .scaleEffect(isPopping ? 1.3 : (isDragOrigin ? 1.10 : (isHinted && hintPulse ? 1.06 : 1.0)))
        .opacity(isPopping ? 0 : 1)
        .shadow(color: candy.bottomColor.opacity(0.5), radius: isHinted && hintPulse ? 16 : 6, x: 0, y: 4)
        .offset(offset)
        .animation(.interactiveSpring(response: 0.32, dampingFraction: 0.7), value: offset)
        .animation(.easeOut(duration: 0.2), value: isPopping)
        .animation(.easeInOut(duration: 0.6), value: hintPulse)
        .gesture(
            DragGesture(minimumDistance: 5)
                .onChanged { value in
                    if dragOrigin == nil { dragOrigin = point }
                    if dragOrigin == point {
                        tileOffsets[point] = clampedTranslation(value.translation)
                    }
                }
                .onEnded { value in
                    if dragOrigin == point {
                        finishDrag(from: point, translation: value.translation)
                    }
                    dragOrigin = nil
                }
        )
    }

    private func clampedTranslation(_ t: CGSize) -> CGSize {
        let m = cellSize + gapSize
        if abs(t.width) > abs(t.height) {
            return CGSize(width: t.width.clamped(to: -m ... m), height: 0)
        } else {
            return CGSize(width: 0, height: t.height.clamped(to: -m ... m))
        }
    }

    private func finishDrag(from origin: PuzzlePoint, translation: CGSize) {
        let dx = translation.width
        let dy = translation.height
        let threshold = (cellSize + gapSize) * 0.35
        var target: PuzzlePoint? = nil

        if abs(dx) > abs(dy) && abs(dx) > threshold {
            target = PuzzlePoint(row: origin.row, col: origin.col + (dx > 0 ? 1 : -1))
        } else if abs(dy) > threshold {
            target = PuzzlePoint(row: origin.row + (dy > 0 ? 1 : -1), col: origin.col)
        }

        // Snap dragged tile back home (animation handles the bounce-back if no swap).
        withAnimation(.spring(response: 0.25, dampingFraction: 0.7)) {
            tileOffsets[origin] = .zero
        }

        guard let target, engine.grid.contains(target) else {
            status = "Drag farther toward an adjacent candy."
            return
        }

        attemptSwap(origin: origin, target: target)
    }

    private func attemptSwap(origin: PuzzlePoint, target: PuzzlePoint) {
        // Visual swap-glide: animate both tiles toward each other for 0.18s,
        // then commit to the engine + reset offsets.
        let dx = CGFloat(target.col - origin.col) * (cellSize + gapSize)
        let dy = CGFloat(target.row - origin.row) * (cellSize + gapSize)

        withAnimation(.easeInOut(duration: 0.18)) {
            tileOffsets[origin] = CGSize(width: dx, height: dy)
            tileOffsets[target] = CGSize(width: -dx, height: -dy)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.20) {
            let didSwap = engine.swap(origin, target)
            tileOffsets[origin] = .zero
            tileOffsets[target] = .zero
            lastMoveAt = Date()
            hintPair = nil

            if !didSwap {
                status = "No match — try a different swap."
                // Bounce-back: brief offset toward each other then snap home.
                withAnimation(.interactiveSpring(response: 0.18, dampingFraction: 0.5)) {
                    tileOffsets[origin] = CGSize(width: dx * 0.18, height: dy * 0.18)
                    tileOffsets[target] = CGSize(width: -dx * 0.18, height: -dy * 0.18)
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
                    withAnimation(.spring(response: 0.25, dampingFraction: 0.7)) {
                        tileOffsets[origin] = .zero
                        tileOffsets[target] = .zero
                    }
                }
                return
            }

            moves -= 1
            animateCascades()
            checkBoardHealth()
        }
    }

    private func animateCascades() {
        let events = engine.lastResolvedMatches
        guard !events.isEmpty else { return }
        // Combo = number of cascade waves the user triggered with this swap.
        // Web reference uses combo += 1 per cascade pass.
        combo = (events.map { $0.cascadeDepth }.max() ?? 0) + 1
        totalCleared += events.reduce(0) { $0 + $1.points.count }
        status = combo > 1 ? "Combo x\(combo)! +\(events.last?.pointsAwarded ?? 0)" : "Match!"

        for (idx, event) in events.enumerated() {
            let delay = Double(idx) * 0.24
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                let centerPoint = self.centerOfGroup(event.points)
                self.activeFlash = FlashEffect(
                    kind: event.kind,
                    center: centerPoint,
                    symbol: event.symbol,
                    id: UUID()
                )
                withAnimation(.easeOut(duration: 0.20)) {
                    self.poppingTiles.formUnion(event.points)
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.40) {
                    self.poppingTiles.subtract(event.points)
                    self.activeFlash = nil
                }
            }
        }
    }

    private func centerOfGroup(_ points: Set<PuzzlePoint>) -> CGPoint {
        let positions = points.map { positionFor($0) }
        let x = positions.map { $0.x }.reduce(0, +) / CGFloat(max(1, positions.count))
        let y = positions.map { $0.y }.reduce(0, +) / CGFloat(max(1, positions.count))
        return CGPoint(x: x, y: y)
    }

    @ViewBuilder
    private func flashView(_ flash: FlashEffect) -> some View {
        let candy = CandyType.forSymbol(flash.symbol)
        switch flash.kind {
        case .three:
            Image(systemName: "sparkles")
                .font(.system(size: 50, weight: .black))
                .foregroundStyle(candy.topColor)
                .shadow(color: candy.topColor, radius: 22)
                .transition(.scale.combined(with: .opacity))
        case .four:
            Image(systemName: "burst.fill")
                .font(.system(size: 70, weight: .black))
                .foregroundStyle(candy.topColor)
                .shadow(color: candy.topColor, radius: 36)
                .transition(.scale.combined(with: .opacity))
        case .five:
            ZStack {
                Circle()
                    .fill(candy.topColor)
                    .frame(width: 130, height: 130)
                    .shadow(color: candy.topColor, radius: 50)
                Image(systemName: "bolt.fill")
                    .font(.system(size: 84, weight: .black))
                    .foregroundStyle(.white)
            }
            .transition(.scale.combined(with: .opacity))
        }
    }

    // MARK: - Hints + board-health (no-possible-moves auto-shuffle)

    private func updateHint() {
        guard !poppingTiles.isEmpty == false else { return }  // skip while animating
        let idle = Date().timeIntervalSince(lastMoveAt)
        if idle >= hintIdleSeconds {
            if hintPair == nil {
                hintPair = findPossibleSwap()
            }
            withAnimation(.easeInOut(duration: 0.6)) {
                hintPulse.toggle()
            }
        } else if hintPair != nil {
            hintPair = nil
        }
    }

    /// Walks the board looking for any swap that produces a match.
    /// Used both for hints and for the "shuffle when stuck" check.
    private func findPossibleSwap() -> (PuzzlePoint, PuzzlePoint)? {
        for r in 0..<engine.grid.rows {
            for c in 0..<engine.grid.columns {
                let p = PuzzlePoint(row: r, col: c)
                let neighbors = [PuzzlePoint(row: r, col: c+1), PuzzlePoint(row: r+1, col: c)]
                for n in neighbors where engine.grid.contains(n) {
                    var probe = engine
                    if probe.swap(p, n) {
                        return (p, n)
                    }
                }
            }
        }
        return nil
    }

    private func checkBoardHealth() {
        if findPossibleSwap() == nil {
            // Re-roll the board with a new seed
            seed += 11
            let newEngine = Match3Engine(rows: 8, columns: 8, seed: seed)
            withAnimation(.easeInOut(duration: 0.5)) {
                engine = newEngine
            }
            status = "No swaps left — board reshuffled."
        }
    }

    // MARK: - Side panel

    private var sidePanel: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("How to play")
                .font(.headline)
                .foregroundStyle(.white)
            VStack(alignment: .leading, spacing: 6) {
                Label("Drag a candy onto an adjacent candy.", systemImage: "hand.draw")
                Label("3 = +30 · 4 = +80 · 5 = +200 ⚡", systemImage: "bolt.badge.a")
                Label("Cascades multiply your combo.", systemImage: "arrow.down.right")
                Label("Hints pulse after \(Int(hintIdleSeconds))s idle.", systemImage: "lightbulb")
            }
            .font(.callout)
            .foregroundStyle(.white.opacity(0.85))

            if let last = engine.lastResolvedMatches.last {
                lastMatchBadge(last)
            }

            Spacer()

            VStack(spacing: 8) {
                Button {
                    seed += 1
                    engine = Match3Engine(rows: 8, columns: 8, seed: seed)
                    status = "Board shuffled. Find a new swap."
                    hintPair = nil
                } label: {
                    Label("Shuffle", systemImage: "shuffle")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)

                Button {
                    newGame()
                } label: {
                    Label("New Game", systemImage: "arrow.clockwise")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            }

            if moves <= 0 {
                Text("Game over · \(engine.score)")
                    .font(.headline)
                    .foregroundStyle(.yellow)
            }
        }
        .padding(18)
        .background(Color.white.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func newGame() {
        seed = UInt64.random(in: 1...100_000)
        engine = Match3Engine(rows: 8, columns: 8, seed: seed)
        moves = 24
        combo = 1
        totalCleared = 0
        status = "Drag a candy onto an adjacent candy to swap."
        tileOffsets.removeAll()
        poppingTiles.removeAll()
        activeFlash = nil
        hintPair = nil
        lastMoveAt = Date()
    }

    private func lastMatchBadge(_ last: Match3MatchEvent) -> some View {
        Text(matchBadgeLabel(last))
            .font(.system(size: 13, weight: .heavy, design: .rounded))
            .foregroundStyle(matchBadgeColor(last))
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Color.black.opacity(0.4))
            .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func matchBadgeLabel(_ last: Match3MatchEvent) -> String {
        switch last.kind {
        case .three: return "3-match (+\(last.pointsAwarded))"
        case .four:  return "4-MATCH BOMB (+\(last.pointsAwarded))"
        case .five:  return "⚡ 5-MATCH (+\(last.pointsAwarded))"
        }
    }

    private func matchBadgeColor(_ last: Match3MatchEvent) -> Color {
        switch last.kind {
        case .three: return .white
        case .four:  return .orange
        case .five:  return .yellow
        }
    }
}

private extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}
