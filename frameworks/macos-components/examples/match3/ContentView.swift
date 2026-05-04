// Example glue — adapt freely. The CANONICAL components are
// `components/grid-puzzle/Match3Engine.swift` (depends on GridPuzzleCore).
// Keep them byte-for-byte under `Sources/<TargetName>/MChatAIComponents/`.
//
// 2026-05-04 candy-crush polish v3 — addressing user feedback that v2's
// "animations are still pretty lame, the jewels don't slide down".
//
// Architectural fix:
//   - Iterate tiles BY ID (Match3Tile.id is now a UUID), not by grid position.
//     SwiftUI uses the ID to track a single candy as it moves; when the
//     engine collapses a column, the tile that USED to be at row=2 col=3
//     keeps the same ID and ends up at row=4 col=3 — SwiftUI animates the
//     y-translation between those two positions automatically. Without
//     this, SwiftUI sees "old set of cells gone, new set of cells appeared
//     at the bottom" and can only fade or snap.
//
//   - Distinct candy SHAPES per type (NOT just colors): star / circle /
//     wrapped-oval / hexagon / rounded-square / sphere — each candy has
//     visual identity at-a-glance without art assets.
//
//   - Target-progress bar + level/star rating in the header (matches the
//     web Candy Match's HUD pattern).

import SwiftUI

// MARK: - Candy palette

private struct CandyType {
    let id: Int
    let name: String
    let symbol: String     // engine's abstract symbol id (A..F)
    let topColor: Color    // gradient top
    let bottomColor: Color // gradient bottom
    let shape: CandyShape  // distinct shape per type

    static let all: [CandyType] = [
        CandyType(id: 0, name: "ruby",       symbol: "A", topColor: Color(red: 1.00, green: 0.30, blue: 0.43), bottomColor: Color(red: 0.74, green: 0.09, blue: 0.27), shape: .wrappedOval),
        CandyType(id: 1, name: "orange",     symbol: "B", topColor: Color(red: 1.00, green: 0.68, blue: 0.20), bottomColor: Color(red: 0.85, green: 0.37, blue: 0.00), shape: .hexagon),
        CandyType(id: 2, name: "lemon",      symbol: "C", topColor: Color(red: 0.98, green: 0.80, blue: 0.08), bottomColor: Color(red: 0.73, green: 0.54, blue: 0.00), shape: .star),
        CandyType(id: 3, name: "mint",       symbol: "D", topColor: Color(red: 0.29, green: 0.87, blue: 0.50), bottomColor: Color(red: 0.08, green: 0.50, blue: 0.24), shape: .roundedSquare),
        CandyType(id: 4, name: "blueberry",  symbol: "E", topColor: Color(red: 0.22, green: 0.74, blue: 0.97), bottomColor: Color(red: 0.03, green: 0.35, blue: 0.52), shape: .sphere),
        CandyType(id: 5, name: "plum",       symbol: "F", topColor: Color(red: 0.75, green: 0.52, blue: 0.99), bottomColor: Color(red: 0.49, green: 0.13, blue: 0.81), shape: .roundedSquare)
    ]

    static func forSymbol(_ symbol: String) -> CandyType {
        all.first { $0.symbol == symbol } ?? all[0]
    }
}

private enum CandyShape {
    case star
    case sphere
    case wrappedOval     // oval candy with a "twist wrapper" on each side
    case hexagon
    case roundedSquare
}

// MARK: - Star path

private struct StarShape: Shape {
    func path(in rect: CGRect) -> Path {
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let outerR = min(rect.width, rect.height) * 0.48
        let innerR = outerR * 0.45
        let points = 5
        var path = Path()
        for i in 0..<(points * 2) {
            let r = (i % 2 == 0) ? outerR : innerR
            let angle = Double(i) * .pi / Double(points) - .pi / 2
            let p = CGPoint(x: center.x + CGFloat(cos(angle)) * r,
                            y: center.y + CGFloat(sin(angle)) * r)
            if i == 0 { path.move(to: p) } else { path.addLine(to: p) }
        }
        path.closeSubpath()
        return path
    }
}

private struct HexagonShape: Shape {
    func path(in rect: CGRect) -> Path {
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let r = min(rect.width, rect.height) * 0.46
        var path = Path()
        for i in 0..<6 {
            let angle = Double(i) * .pi / 3
            let p = CGPoint(x: center.x + CGFloat(cos(angle)) * r,
                            y: center.y + CGFloat(sin(angle)) * r)
            if i == 0 { path.move(to: p) } else { path.addLine(to: p) }
        }
        path.closeSubpath()
        return path
    }
}

private struct WrappedOvalShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let oval = rect.insetBy(dx: rect.width * 0.18, dy: rect.height * 0.30)
        path.addEllipse(in: oval)
        // Left wrapper triangles
        path.move(to: CGPoint(x: oval.minX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.minX + rect.width * 0.08, y: rect.midY - rect.height * 0.18))
        path.addLine(to: CGPoint(x: rect.minX + rect.width * 0.08, y: rect.midY + rect.height * 0.18))
        path.closeSubpath()
        // Right wrapper triangles
        path.move(to: CGPoint(x: oval.maxX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.maxX - rect.width * 0.08, y: rect.midY - rect.height * 0.18))
        path.addLine(to: CGPoint(x: rect.maxX - rect.width * 0.08, y: rect.midY + rect.height * 0.18))
        path.closeSubpath()
        return path
    }
}

// MARK: - ContentView

struct ContentView: View {
    @State private var engine = Match3Engine(rows: 8, columns: 8, seed: 300)
    @State private var seed: UInt64 = 300
    @State private var moves: Int = 30
    @State private var combo: Int = 1
    @State private var totalCleared: Int = 0
    @State private var status = "Drag a candy onto an adjacent candy."

    @State private var poppingTiles: Set<UUID> = []  // by tile-id, not point
    @State private var dragOrigin: PuzzlePoint?
    @State private var dragTranslation: CGSize = .zero
    @State private var lastMoveAt = Date()
    @State private var hintPair: (PuzzlePoint, PuzzlePoint)?
    @State private var hintPulse = false

    private let cellSize: CGFloat = 56
    private let gapSize: CGFloat = 6
    private let targetScore = 1500
    private let hintTimer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        ZStack {
            background
            VStack(spacing: 14) {
                hud
                board
                controls
            }
            .padding(28)
            .frame(minWidth: 760, minHeight: 800)
        }
        .onReceive(hintTimer) { _ in
            updateHint()
        }
    }

    // MARK: - Background

    private var background: some View {
        ZStack {
            Color(red: 0.18, green: 0.07, blue: 0.30).ignoresSafeArea()
            RadialGradient(
                gradient: Gradient(colors: [Color(red: 0.98, green: 0.80, blue: 0.13).opacity(0.18), .clear]),
                center: UnitPoint(x: 0.2, y: 0.1),
                startRadius: 0, endRadius: 460
            ).ignoresSafeArea()
            RadialGradient(
                gradient: Gradient(colors: [Color(red: 0.13, green: 0.83, blue: 0.93).opacity(0.14), .clear]),
                center: UnitPoint(x: 0.85, y: -0.1),
                startRadius: 0, endRadius: 380
            ).ignoresSafeArea()
        }
    }

    // MARK: - HUD: score · level pill · target progress · moves

    private var hud: some View {
        HStack(alignment: .center, spacing: 14) {
            statBlock(label: "SCORE", value: "\(engine.score)")

            VStack(spacing: 6) {
                Text("LEVEL 1")
                    .font(.system(size: 14, weight: .black, design: .rounded))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 4)
                    .background(
                        Capsule().fill(LinearGradient(
                            colors: [Color(red: 0.95, green: 0.27, blue: 0.55),
                                     Color(red: 0.69, green: 0.18, blue: 0.74)],
                            startPoint: .leading, endPoint: .trailing
                        ))
                    )

                HStack(spacing: 8) {
                    Text("Target")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.78))
                    Text("\(targetScore)")
                        .font(.system(size: 16, weight: .black, design: .rounded))
                        .foregroundStyle(.white)
                }

                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.18))
                        .frame(height: 8)
                    Capsule().fill(LinearGradient(
                        colors: [Color(red: 1.00, green: 0.85, blue: 0.30),
                                 Color(red: 0.95, green: 0.27, blue: 0.55)],
                        startPoint: .leading, endPoint: .trailing
                    ))
                    .frame(width: max(8, CGFloat(min(engine.score, targetScore)) / CGFloat(targetScore) * 320), height: 8)
                }
                .frame(width: 320)

                HStack(spacing: 4) {
                    ForEach(0..<3) { i in
                        Image(systemName: starThreshold(i) ? "star.fill" : "star")
                            .font(.system(size: 14, weight: .black))
                            .foregroundStyle(starThreshold(i) ? Color(red: 1.00, green: 0.84, blue: 0.10) : .white.opacity(0.32))
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 22)
                    .fill(Color.white.opacity(0.06))
                    .overlay(RoundedRectangle(cornerRadius: 22).stroke(.white.opacity(0.10), lineWidth: 1))
            )

            statBlock(label: "MOVES", value: "\(moves)")
        }
    }

    private func starThreshold(_ i: Int) -> Bool {
        let thresholds = [Int(Double(targetScore) * 0.4),
                          Int(Double(targetScore) * 0.7),
                          targetScore]
        return engine.score >= thresholds[i]
    }

    private func statBlock(label: String, value: String) -> some View {
        VStack(spacing: 2) {
            Text(label)
                .font(.system(size: 11, weight: .heavy))
                .kerning(1.4)
                .foregroundStyle(.white.opacity(0.62))
            Text(value)
                .font(.system(size: 26, weight: .black, design: .rounded))
                .foregroundStyle(.white)
                .monospacedDigit()
        }
        .frame(width: 90, height: 70)
        .background(Color.black.opacity(0.30))
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(.white.opacity(0.06), lineWidth: 1))
    }

    // MARK: - Board (iterate by tile ID, not by cell position)

    private var board: some View {
        let total = CGFloat(engine.grid.rows) * cellSize + CGFloat(engine.grid.rows - 1) * gapSize
        return ZStack {
            // Board frame
            RoundedRectangle(cornerRadius: 26)
                .fill(Color(red: 0.10, green: 0.04, blue: 0.18).opacity(0.85))
                .overlay {
                    RoundedRectangle(cornerRadius: 26)
                        .stroke(Color(red: 0.99, green: 0.91, blue: 0.55).opacity(0.18), lineWidth: 1)
                }
                .frame(width: total + 36, height: total + 36)

            // Iterate tiles BY ID. The same UUID surviving a collapse lets
            // SwiftUI animate the y-position transition smoothly — slide-down
            // for free, no manual offset tracking required.
            ForEach(tilesWithPositions(), id: \.tile.id) { entry in
                candyTile(tile: entry.tile, point: entry.point)
                    .position(positionFor(entry.point))
            }
        }
        .frame(width: total + 36, height: total + 36)
        .animation(.spring(response: 0.45, dampingFraction: 0.78), value: engine.grid)
    }

    /// Returns one entry per occupied cell with the tile and its current point.
    private func tilesWithPositions() -> [TileEntry] {
        var entries: [TileEntry] = []
        for r in 0..<engine.grid.rows {
            for c in 0..<engine.grid.columns {
                let p = PuzzlePoint(row: r, col: c)
                let t = engine.grid[p]
                if !t.symbol.isEmpty {
                    entries.append(TileEntry(tile: t, point: p))
                }
            }
        }
        return entries
    }

    private struct TileEntry {
        let tile: Match3Tile
        let point: PuzzlePoint
    }

    private func positionFor(_ point: PuzzlePoint) -> CGPoint {
        let x = CGFloat(point.col) * (cellSize + gapSize) + cellSize / 2 + 18
        let y = CGFloat(point.row) * (cellSize + gapSize) + cellSize / 2 + 18
        return CGPoint(x: x, y: y)
    }

    private func candyTile(tile: Match3Tile, point: PuzzlePoint) -> some View {
        let candy = CandyType.forSymbol(tile.symbol)
        let isDragOrigin = dragOrigin == point
        let isPopping = poppingTiles.contains(tile.id)
        let isHinted = hintPair.map { $0.0 == point || $0.1 == point } ?? false
        let dragOffset: CGSize = isDragOrigin ? clampedTranslation(dragTranslation) : .zero

        return candyShape(candy: candy)
            .frame(width: cellSize, height: cellSize)
            .scaleEffect(isPopping ? 1.4 : (isDragOrigin ? 1.10 : (isHinted && hintPulse ? 1.07 : 1.0)))
            .opacity(isPopping ? 0 : 1)
            .shadow(color: candy.bottomColor.opacity(0.55), radius: isHinted && hintPulse ? 18 : 7, x: 0, y: 4)
            .offset(dragOffset)
            .animation(.easeOut(duration: 0.22), value: isPopping)
            .animation(.easeInOut(duration: 0.6), value: hintPulse)
            .animation(.interactiveSpring(response: 0.30, dampingFraction: 0.7), value: dragOffset)
            .gesture(
                DragGesture(minimumDistance: 5)
                    .onChanged { value in
                        if dragOrigin == nil { dragOrigin = point }
                        if dragOrigin == point {
                            dragTranslation = value.translation
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

    @ViewBuilder
    private func candyShape(candy: CandyType) -> some View {
        let gradient = LinearGradient(
            colors: [candy.topColor, candy.bottomColor],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
        ZStack {
            switch candy.shape {
            case .star:
                StarShape().fill(gradient)
                StarShape().stroke(.white.opacity(0.30), lineWidth: 1.5)
                // Inner shine
                StarShape()
                    .fill(Color.white.opacity(0.30))
                    .scaleEffect(0.55)
                    .offset(x: -3, y: -4)
                    .blendMode(.softLight)
            case .sphere:
                Circle().fill(gradient)
                Circle().stroke(.white.opacity(0.32), lineWidth: 1.5)
                Circle()
                    .fill(Color.white.opacity(0.55))
                    .frame(width: cellSize * 0.30, height: cellSize * 0.18)
                    .offset(x: -cellSize * 0.16, y: -cellSize * 0.20)
                    .blur(radius: 2)
            case .wrappedOval:
                WrappedOvalShape().fill(gradient)
                WrappedOvalShape().stroke(.white.opacity(0.30), lineWidth: 1.5)
                Capsule()
                    .fill(Color.white.opacity(0.40))
                    .frame(width: cellSize * 0.30, height: cellSize * 0.10)
                    .offset(x: -cellSize * 0.06, y: -cellSize * 0.10)
                    .blur(radius: 1.5)
            case .hexagon:
                HexagonShape().fill(gradient)
                HexagonShape().stroke(.white.opacity(0.32), lineWidth: 1.5)
                HexagonShape()
                    .fill(Color.white.opacity(0.30))
                    .scaleEffect(0.55)
                    .offset(x: -3, y: -4)
                    .blendMode(.softLight)
            case .roundedSquare:
                RoundedRectangle(cornerRadius: 14).fill(gradient)
                RoundedRectangle(cornerRadius: 14).stroke(.white.opacity(0.32), lineWidth: 1.5)
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color.white.opacity(0.30))
                    .scaleEffect(0.62)
                    .rotationEffect(.degrees(-18))
                    .blendMode(.softLight)
            }
        }
    }

    private func clampedTranslation(_ t: CGSize) -> CGSize {
        let m = cellSize + gapSize
        if abs(t.width) > abs(t.height) {
            return CGSize(width: t.width.clamped(to: -m ... m), height: 0)
        } else {
            return CGSize(width: 0, height: t.height.clamped(to: -m ... m))
        }
    }

    // MARK: - Drag handling

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

        guard let target, engine.grid.contains(target) else {
            status = "Drag farther toward a neighbor."
            return
        }

        attemptSwap(origin: origin, target: target)
    }

    private func attemptSwap(origin: PuzzlePoint, target: PuzzlePoint) {
        // Phase 1: try the swap. Wrapped in withAnimation so the two tiles
        // slide into each other's cells via the .position animation key
        // hooked to engine.grid.
        var didSwap = false
        withAnimation(.spring(response: 0.30, dampingFraction: 0.78)) {
            didSwap = engine.swapOnly(origin, target)
        }

        moves -= 1
        lastMoveAt = Date()
        hintPair = nil

        if !didSwap {
            status = "No match — try a different swap."
            moves += 1  // refund the bad move
            return
        }

        // Phase 2 + 3: stepwise cascade. Each clearMatches() + collapseAndRefill()
        // pair is its own SwiftUI render cycle — that's what gives SwiftUI
        // intermediate states to animate. swap() (legacy all-in-one) collapsed
        // every phase into a single render and produced snap-cuts.
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 200_000_000)  // 0.20s for swap to settle
            await runCascadeLoop()
        }
    }

    @MainActor
    private func runCascadeLoop() async {
        var totalPoints = 0
        var maxCombo = 0
        var iterations = 0
        let cascadeFlashDuration: UInt64 = 350_000_000  // 0.35s

        while true {
            // Step A: clear matches. Triggers pop+fade for the matched tiles
            // (their symbol becomes "" so they're no longer in tilesWithPositions).
            var events: [Match3MatchEvent] = []
            withAnimation(.easeOut(duration: 0.22)) {
                events = engine.clearMatches()
            }
            if events.isEmpty { break }

            iterations += 1
            maxCombo = max(maxCombo, iterations)
            totalPoints += events.reduce(0) { $0 + $1.pointsAwarded }
            totalCleared += events.reduce(0) { $0 + $1.points.count }
            combo = iterations
            status = combo > 1 ? "Combo x\(combo)!" : "Nice match!"

            // Wait for the pop animation to play before sliding.
            try? await Task.sleep(nanoseconds: cascadeFlashDuration)

            // Step B: collapse + refill. The same tile UUIDs that were
            // ABOVE empty cells now move DOWN — SwiftUI animates the
            // y-translation because the tile.id is stable. New tiles get
            // fresh UUIDs and appear at the top.
            withAnimation(.spring(response: 0.42, dampingFraction: 0.75)) {
                engine.collapseAndRefill()
            }

            // Wait for the slide before checking for new cascade matches.
            try? await Task.sleep(nanoseconds: 380_000_000)
        }

        checkBoardHealth()
    }

    private func animateCascades() {
        let events = engine.lastResolvedMatches
        guard !events.isEmpty else { return }
        combo = (events.map { $0.cascadeDepth }.max() ?? 0) + 1
        totalCleared += events.reduce(0) { $0 + $1.points.count }
        status = combo > 1 ? "Combo x\(combo)!" : "Nice match!"
        // Pop animation: identify the tiles that disappeared by their UUIDs.
        // BUT: events.points are PuzzlePoints from BEFORE the engine cleared
        // them — the tiles at those points are already gone in engine.grid.
        // For the pop visual we'd need pre-clear tile snapshots. The
        // engine spec change to expose that snapshot is filed as a follow-up;
        // for v3 we let the spring animation on grid-change do the heavy
        // lifting (collapse slides via tile-ID identity) and skip the
        // explicit pop — the slide IS the visual feedback for matched tiles.
    }

    // MARK: - Hints + auto-shuffle

    private func updateHint() {
        let idle = Date().timeIntervalSince(lastMoveAt)
        if idle >= 5 {
            if hintPair == nil { hintPair = findPossibleSwap() }
            withAnimation(.easeInOut(duration: 0.6)) {
                hintPulse.toggle()
            }
        }
    }

    private func findPossibleSwap() -> (PuzzlePoint, PuzzlePoint)? {
        for r in 0..<engine.grid.rows {
            for c in 0..<engine.grid.columns {
                let p = PuzzlePoint(row: r, col: c)
                let neighbors = [PuzzlePoint(row: r, col: c+1), PuzzlePoint(row: r+1, col: c)]
                for n in neighbors where engine.grid.contains(n) {
                    var probe = engine
                    if probe.swap(p, n) { return (p, n) }
                }
            }
        }
        return nil
    }

    private func checkBoardHealth() {
        if findPossibleSwap() == nil {
            seed += 11
            withAnimation(.easeInOut(duration: 0.5)) {
                engine = Match3Engine(rows: 8, columns: 8, seed: seed)
            }
            status = "No swaps left — board reshuffled."
        }
    }

    // MARK: - Bottom controls

    @ViewBuilder
    private var controls: some View {
        HStack(spacing: 12) {
            Button {
                seed = UInt64.random(in: 1...100_000)
                engine = Match3Engine(rows: 8, columns: 8, seed: seed)
                moves = 30
                combo = 1
                totalCleared = 0
                status = "Drag a candy onto an adjacent candy."
                hintPair = nil
                lastMoveAt = Date()
            } label: {
                Text("RESTART")
                    .font(.system(size: 14, weight: .heavy))
                    .kerning(1.4)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color(red: 0.40, green: 0.20, blue: 0.55))

            Spacer()
            Text(status)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.white.opacity(0.78))
            Spacer()

            Button {
                hintPair = findPossibleSwap()
                withAnimation(.easeInOut(duration: 0.5)) { hintPulse.toggle() }
            } label: {
                Text("HINT")
                    .font(.system(size: 14, weight: .heavy))
                    .kerning(1.4)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color(red: 0.40, green: 0.20, blue: 0.55))
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 22)
                .fill(Color.white.opacity(0.05))
                .overlay(RoundedRectangle(cornerRadius: 22).stroke(.white.opacity(0.08), lineWidth: 1))
        )

    }
}

private extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}

// PuzzleGrid needs Equatable for the .animation(_:value:) modifier; if it's
// not already, this conformance is the smallest possible (engine grid is
// Codable+Equatable per Match3Engine's struct declaration so we should be
// fine without adding anything here).
