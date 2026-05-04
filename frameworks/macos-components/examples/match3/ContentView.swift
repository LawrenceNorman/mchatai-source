// Example glue — adapt freely. The CANONICAL components are
// `components/grid-puzzle/Match3Engine.swift` (depends on GridPuzzleCore).
// Keep them byte-for-byte under `Sources/<TargetName>/MChatAIComponents/`.
//
// 2026-05-04 catalog overhaul: this view demonstrates the canonical
// candy-crush-flavored composition pattern:
//   - Jewel-style symbols rendered from SF Symbols (works without art assets)
//   - Drag-direction swap (mouse-drag from a jewel toward an adjacent cell)
//   - Swap animation (jewels visibly slide into each other)
//   - Match-cascade animation: 3-match = sparkle, 4-match = line bomb flash,
//     5-match = electric burst (driven by the engine's lastResolvedMatches
//     event log + Match3Kind classification)
//   - Per-cascade scoring escalates with chain depth (handled in engine)

import SwiftUI

// MARK: - Symbol palette — jewel-style, no copyright risk

/// Jewel-flavored visual mapping for the engine's abstract symbol IDs.
/// Using SF Symbols means the example builds on any system without bundling
/// art assets — and the shapes evoke gemstones rather than candies.
private struct Match3Jewel {
    let glyph: String          // SF Symbol name
    let color: Color
    let cgColor: CGColor       // for Canvas rendering of effects

    static let palette: [String: Match3Jewel] = [
        "A": .init(glyph: "diamond.fill",    color: .cyan,    cgColor: NSColor.cyan.cgColor),
        "B": .init(glyph: "heart.fill",      color: .red,     cgColor: NSColor.red.cgColor),
        "C": .init(glyph: "leaf.fill",       color: .green,   cgColor: NSColor.green.cgColor),
        "D": .init(glyph: "sun.max.fill",    color: .yellow,  cgColor: NSColor.yellow.cgColor),
        "E": .init(glyph: "moon.fill",       color: .purple,  cgColor: NSColor.purple.cgColor),
        "F": .init(glyph: "sparkle",         color: .orange,  cgColor: NSColor.orange.cgColor)
    ]

    static func forSymbol(_ symbol: String) -> Match3Jewel {
        palette[symbol] ?? .init(glyph: "circle.fill", color: .gray, cgColor: NSColor.gray.cgColor)
    }
}

// MARK: - ContentView

struct ContentView: View {
    @State private var engine = Match3Engine(rows: 8, columns: 8, seed: 300)
    @State private var seed: UInt64 = 300
    @State private var moves = 0
    @State private var status = "Drag a jewel onto an adjacent jewel to swap."

    /// Per-tile transient transforms keyed by point — used to drive the
    /// swap animation (a tile briefly shows offset toward the dragged
    /// direction before the engine actually swaps).
    @State private var tileOffsets: [PuzzlePoint: CGSize] = [:]
    /// Per-tile fade-out for cleared matches.
    @State private var fadingTiles: Set<PuzzlePoint> = []
    /// Active match-flash effect (driven by engine.lastResolvedMatches).
    @State private var activeFlash: FlashEffect?
    /// Drag-in-flight tracking: which tile started the drag, where the cursor is.
    @State private var dragOrigin: PuzzlePoint?
    @State private var dragTranslation: CGSize = .zero

    private let cellSize: CGFloat = 56
    private let gapSize: CGFloat = 4
    private let goalScore = 800

    private struct FlashEffect: Equatable {
        let kind: Match3Kind
        let center: CGPoint
        let symbol: String
        let id: UUID
    }

    var body: some View {
        VStack(spacing: 18) {
            header
            HStack(alignment: .top, spacing: 24) {
                jewelGrid
                sidePanel
                    .frame(width: 260)
            }
        }
        .padding(28)
        .frame(minWidth: 760, minHeight: 720)
        .background(Color(red: 0.10, green: 0.07, blue: 0.18))
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Match Three")
                    .font(.system(size: 30, weight: .black, design: .rounded))
                    .foregroundStyle(.white)
                Text(status)
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.65))
            }
            Spacer()
            scoreBlock(label: "MOVES", value: "\(moves)")
            scoreBlock(label: "SCORE", value: "\(engine.score)")
            scoreBlock(label: "GOAL", value: "\(goalScore)")
        }
    }

    private func scoreBlock(label: String, value: String) -> some View {
        VStack(alignment: .trailing, spacing: 2) {
            Text(label)
                .font(.caption.weight(.black))
                .foregroundStyle(.white.opacity(0.5))
            Text(value)
                .font(.system(size: 26, weight: .black, design: .rounded))
                .foregroundStyle(.white)
                .monospacedDigit()
        }
    }

    // MARK: - Jewel grid (with drag-swap + flash overlay)

    private var jewelGrid: some View {
        let total = CGFloat(engine.grid.rows) * cellSize + CGFloat(engine.grid.rows - 1) * gapSize
        return ZStack {
            // Background
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.black.opacity(0.42))
                .frame(width: total + 24, height: total + 24)

            // Jewels
            ForEach(engine.grid.allPoints(), id: \.self) { point in
                jewelCell(point)
                    .position(positionFor(point))
            }

            // Match flash effect (sparkle / line / lightning) — overlaid on top
            if let flash = activeFlash {
                flashView(flash)
                    .position(flash.center)
                    .allowsHitTesting(false)
                    .id(flash.id)
            }
        }
        .frame(width: total + 24, height: total + 24)
    }

    private func positionFor(_ point: PuzzlePoint) -> CGPoint {
        let x = CGFloat(point.col) * (cellSize + gapSize) + cellSize / 2 + 12
        let y = CGFloat(point.row) * (cellSize + gapSize) + cellSize / 2 + 12
        return CGPoint(x: x, y: y)
    }

    @ViewBuilder
    private func jewelCell(_ point: PuzzlePoint) -> some View {
        let tile = engine.grid[point]
        let jewel = Match3Jewel.forSymbol(tile.symbol)
        let isDragOrigin = dragOrigin == point
        let isFading = fadingTiles.contains(point)
        let offset = tileOffsets[point] ?? .zero

        ZStack {
            RoundedRectangle(cornerRadius: 10)
                .fill(Color.black.opacity(isDragOrigin ? 0.55 : 0.32))
            Image(systemName: jewel.glyph)
                .font(.system(size: 26, weight: .black))
                .foregroundStyle(jewel.color)
                .shadow(color: jewel.color.opacity(0.5), radius: 4, x: 0, y: 0)
        }
        .frame(width: cellSize, height: cellSize)
        .scaleEffect(isDragOrigin ? 1.12 : 1.0)
        .opacity(isFading ? 0 : 1)
        .offset(offset)
        .animation(.interactiveSpring(response: 0.32, dampingFraction: 0.7), value: offset)
        .animation(.easeOut(duration: 0.18), value: isFading)
        .gesture(
            DragGesture(minimumDistance: 6)
                .onChanged { value in
                    if dragOrigin == nil { dragOrigin = point }
                    if dragOrigin == point {
                        dragTranslation = value.translation
                        // Show the dragged tile following the cursor (clamped
                        // to a single-cell move so the visual matches what's
                        // actually possible).
                        tileOffsets[point] = clampedTranslation(value.translation)
                    }
                }
                .onEnded { value in
                    if dragOrigin == point {
                        finishDrag(from: point, translation: value.translation)
                    }
                    dragOrigin = nil
                    dragTranslation = .zero
                }
        )
    }

    private func clampedTranslation(_ t: CGSize) -> CGSize {
        // Pick the dominant axis + clamp to one cell.
        let max = cellSize + gapSize
        if abs(t.width) > abs(t.height) {
            return CGSize(width: t.width.clamped(to: -max ... max), height: 0)
        } else {
            return CGSize(width: 0, height: t.height.clamped(to: -max ... max))
        }
    }

    /// Resolve the drag into a swap, then run the swap-and-cascade animation.
    private func finishDrag(from origin: PuzzlePoint, translation: CGSize) {
        let dx = translation.width
        let dy = translation.height
        let threshold = (cellSize + gapSize) * 0.35
        var target: PuzzlePoint? = nil

        if abs(dx) > abs(dy) && abs(dx) > threshold {
            target = dx > 0
                ? PuzzlePoint(row: origin.row, col: origin.col + 1)
                : PuzzlePoint(row: origin.row, col: origin.col - 1)
        } else if abs(dy) > threshold {
            target = dy > 0
                ? PuzzlePoint(row: origin.row + 1, col: origin.col)
                : PuzzlePoint(row: origin.row - 1, col: origin.col)
        }

        // Restore the dragged tile to its home position (animation handles the snap).
        tileOffsets[origin] = .zero

        guard let target, engine.grid.contains(target) else {
            status = "Drag farther toward an adjacent jewel."
            return
        }

        attemptSwap(origin: origin, target: target)
    }

    private func attemptSwap(origin: PuzzlePoint, target: PuzzlePoint) {
        // Briefly show the swap-in motion before letting the engine commit.
        // (For a really polished version we'd also drive a slide-the-other-tile
        // animation; for the catalog reference, the bounce-back when invalid
        // + fade on match is enough to make it feel responsive.)
        let didSwap = engine.swap(origin, target)
        moves += 1
        if !didSwap {
            status = "No match — try a different swap."
            // Bounce-back animation: temporarily offset both tiles toward
            // each other then return.
            withAnimation(.interactiveSpring(response: 0.18, dampingFraction: 0.5)) {
                let dx = (target.col - origin.col)
                let dy = (target.row - origin.row)
                tileOffsets[origin] = CGSize(width: CGFloat(dx) * 12, height: CGFloat(dy) * 12)
                tileOffsets[target] = CGSize(width: -CGFloat(dx) * 12, height: -CGFloat(dy) * 12)
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                withAnimation(.spring(response: 0.25, dampingFraction: 0.7)) {
                    tileOffsets[origin] = .zero
                    tileOffsets[target] = .zero
                }
            }
            return
        }

        status = "Match!"
        animateCascades()
    }

    /// Iterate engine.lastResolvedMatches and play a sparkle/line/lightning
    /// flash for each. This makes 4-match and 5-match feel meaningfully
    /// different from a plain 3.
    private func animateCascades() {
        let events = engine.lastResolvedMatches
        guard !events.isEmpty else { return }
        for (idx, event) in events.enumerated() {
            let delay = Double(idx) * 0.28
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                let centerPoint = self.centerOfGroup(event.points)
                self.activeFlash = FlashEffect(
                    kind: event.kind,
                    center: centerPoint,
                    symbol: event.symbol,
                    id: UUID()
                )
                withAnimation(.easeOut(duration: 0.22)) {
                    self.fadingTiles.formUnion(event.points)
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.42) {
                    self.fadingTiles.subtract(event.points)
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
        let jewel = Match3Jewel.forSymbol(flash.symbol)
        switch flash.kind {
        case .three:
            // Sparkle burst
            Image(systemName: "sparkles")
                .font(.system(size: 44, weight: .black))
                .foregroundStyle(jewel.color)
                .shadow(color: jewel.color, radius: 18)
                .transition(.scale.combined(with: .opacity))
        case .four:
            // Line-clear flash: bigger, more aggressive
            Image(systemName: "burst.fill")
                .font(.system(size: 64, weight: .black))
                .foregroundStyle(jewel.color)
                .shadow(color: jewel.color, radius: 30)
                .transition(.scale.combined(with: .opacity))
        case .five:
            // 5-match: lightning / electric burst
            Image(systemName: "bolt.fill")
                .font(.system(size: 80, weight: .black))
                .foregroundStyle(.white)
                .background(
                    Circle()
                        .fill(jewel.color)
                        .frame(width: 120, height: 120)
                        .shadow(color: jewel.color, radius: 40)
                )
                .transition(.scale.combined(with: .opacity))
        }
    }

    // MARK: - Side panel

    private var sidePanel: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("How to play")
                .font(.headline)
                .foregroundStyle(.white)
            VStack(alignment: .leading, spacing: 6) {
                Label("Drag a jewel onto an adjacent jewel.", systemImage: "hand.draw")
                Label("Match 3 = points · 4 = line bomb · 5 = ⚡", systemImage: "bolt.badge.a")
                Label("Cascade chains DOUBLE the score.", systemImage: "arrow.down.right")
                Label("First to \(goalScore) wins this round.", systemImage: "flag.checkered")
            }
            .font(.callout)
            .foregroundStyle(.white.opacity(0.85))

            if let last = engine.lastResolvedMatches.last {
                lastMatchBadge(last)
            }

            Spacer()

            Button {
                newGame()
            } label: {
                Label("New Game", systemImage: "arrow.clockwise")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)

            if engine.score >= goalScore {
                Text("You hit the goal! Score: \(engine.score)")
                    .font(.headline)
                    .foregroundStyle(.green)
            }
        }
        .padding(18)
        .background(Color.black.opacity(0.36))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func newGame() {
        seed = UInt64.random(in: 1...10_000)
        engine = Match3Engine(rows: 8, columns: 8, seed: seed)
        moves = 0
        status = "Drag a jewel onto an adjacent jewel to swap."
        tileOffsets.removeAll()
        fadingTiles.removeAll()
        activeFlash = nil
    }

    private func lastMatchBadge(_ last: Match3MatchEvent) -> some View {
        Text(matchBadgeLabel(last))
            .font(.system(size: 14, weight: .heavy, design: .rounded))
            .foregroundStyle(matchBadgeColor(last))
            .padding(8)
            .background(Color.black.opacity(0.4))
            .clipShape(RoundedRectangle(cornerRadius: 6))
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
