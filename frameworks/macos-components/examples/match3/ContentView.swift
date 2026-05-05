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
    /// Level / progression manager. Match-3 uses .standard curve (1.4× per
    /// level). currentLevel persists across app launches via UserDefaults.
    /// Drives currentTarget (was hardcoded targetScore=1500), suggested
    /// palette size growth, and the level-up celebration (banner + SFX).
    @StateObject private var levels = LevelManager(
        gameID: "match3",
        baseTarget: 1500,
        baseMovesAllowed: 30,
        curve: .standard
    )
    @State private var combo: Int = 1
    @State private var totalCleared: Int = 0
    @State private var status = "Drag a candy onto an adjacent candy."
    @State private var victoryAnnounced = false

    /// Cumulative score across ALL levels played in THIS session. Carries
    /// from level to level so the player sees their session-long progress
    /// (level score zeroes per-level via engine.score). This is the value
    /// HighScoreManager compares against the persisted personal best.
    @State private var totalScore: Int = 0
    /// Engine's score at the START of the current level. We snapshot here
    /// so totalScore = baseTotalForLevel + (engine.score - 0). Without
    /// this we can't show "you're ahead/behind your previous best" mid-level.
    @State private var baseTotalForLevel: Int = 0
    /// High-score manager — persists per-game best totalScore via UserDefaults.
    /// Surfaced ONLY in the game-over panel (after a run ends), per user
    /// feedback that in-play high-score chrome is distracting.
    @StateObject private var highScores = HighScoreManager(gameID: "match3")
    /// Set true when the player runs out of moves without hitting the
    /// level target. Drives the gameOverPanel overlay.
    @State private var showGameOver = false

    /// Per-tile animation state. Drives squash/stretch + bulge/shrink phases
    /// per the 12 principles of animation (anticipation, squash-stretch,
    /// follow-through). Real Candy Crush match clears go BULGE (1.25x over
    /// 80ms) then SHRINK to 0 + fade (100ms) — that's anticipation +
    /// follow-through, not a flat fade. Tiles that just landed get a brief
    /// squash-y to feel like they have weight.
    @State private var tileAnimationPhase: [UUID: TileAnimationPhase] = [:]
    /// Tiles within blast radius of a 4/5-match jiggle briefly. Secondary
    /// motion (12 principles #6) — neighbor reaction sells the explosion
    /// as a real impact instead of a sticker on top of the board.
    @State private var jigglingTiles: [UUID: CGFloat] = [:]
    /// Per-tile random phase offset so neighbor jiggle reads as INDEPENDENT
    /// wobbles, not a phase-locked board-wide shake. Without this every
    /// jiggling tile moves in unison (sin of the same shared clock) and the
    /// effect feels global/disorienting.
    @State private var jigglePhase: [UUID: Double] = [:]
    /// Per-kind flash overlays (sparkle / burst / lightning) drawn on top
    /// of the board for each resolved match. Active for ~0.4s per event.
    @State private var activeFlashes: [FlashEffect] = []

    /// Per-tile animation state machine. `idle` is the resting state.
    /// Match clears go .bulging -> .shrinking. New refilled tiles enter
    /// in .falling and squash-land via .squashing.
    private enum TileAnimationPhase: Equatable {
        case idle
        case bulging      // pre-clear anticipation: scale up to 1.25, ~80ms
        case shrinking    // follow-through: scale to 0 + fade, ~100ms
        case falling      // mid-fall: stretched vertically (1.0 wide × 1.15 tall)
        case squashing    // just-landed: squashed (1.15 wide × 0.85 tall) for one frame
    }

    private struct FlashEffect: Identifiable, Equatable {
        let id: UUID = UUID()
        let kind: Match3Kind
        let center: CGPoint
        let symbol: String
    }
    @State private var dragOrigin: PuzzlePoint?
    @State private var dragTranslation: CGSize = .zero
    @State private var lastMoveAt = Date()
    @State private var hintPair: (PuzzlePoint, PuzzlePoint)?
    @State private var hintPulse = false

    private let cellSize: CGFloat = 56
    private let gapSize: CGFloat = 6
    /// Legacy target — read from levels.currentTarget instead. Kept here
    /// only as a fallback for any code paths not yet migrated.
    private var targetScore: Int { levels.currentTarget }

    /// Animation tuning — pick a preset based on game pace. Match-3 lives in
    /// the middle (mechanics-driven feedback) so `.standard` is correct.
    /// To adjust feel: switch to `.subtle` (calmer, productivity-flavored)
    /// or `.punchy` (arcade, kid-friendly). Or override individual knobs.
    private let intensity: AnimationIntensity = .standard

    /// Sound effects. .standard preset; muted state persists in UserDefaults.
    /// SFX use case: pop on 3-match, burst on 4-match, bomb on 5-match,
    /// pitch-shifted cascade chord on chain-reactions, victory on target.
    @ObservedObject private var sound = SoundEngine.shared
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
            // Level-up celebration banner — only visible during the ~3s
            // celebration window driven by LevelManager.
            levelUpBanner
            // Game-over panel — only visible after moves run out without
            // hitting the target. Shows the run summary + persisted best.
            gameOverPanel
        }
        .onReceive(hintTimer) { _ in
            updateHint()
        }
        .onAppear {
            // Sync engine palette + moves budget with the persisted level
            // (LevelManager restores currentLevel from UserDefaults).
            // First-launch is L1 with 6 colors / 30 moves; returning players
            // resume their level with its palette size and moves budget.
            let palette = Array(["A","B","C","D","E","F","G","H"].prefix(levels.suggestedPaletteSize))
            engine.symbols = palette
            moves = levels.currentMovesAllowed
            // totalScore restarts at 0 each session — high score persists
            // separately via HighScoreManager. baseTotalForLevel anchors
            // the cumulative total at the current level's floor.
            totalScore = 0
            baseTotalForLevel = 0
            status = "Level \(levels.currentLevel) — target \(levels.currentTarget)"
        }
    }

    /// "Level Up!" celebration banner overlaid on top of the board during
    /// the celebration window. Pulls scale + opacity from
    /// levels.celebrationProgress so the banner inflates and fades.
    @ViewBuilder
    private var levelUpBanner: some View {
        if levels.celebratingLevelUp {
            VStack(spacing: 4) {
                Text("LEVEL \(levels.currentLevel)")
                    .font(.system(size: 56, weight: .black, design: .rounded))
                    .foregroundStyle(LinearGradient(
                        colors: [Color(red: 1.00, green: 0.85, blue: 0.30),
                                 Color(red: 0.95, green: 0.27, blue: 0.55)],
                        startPoint: .leading, endPoint: .trailing
                    ))
                    .shadow(color: Color(red: 1.0, green: 0.85, blue: 0.3).opacity(0.6), radius: 22)
                Text("New target: \(levels.currentTarget)")
                    .font(.system(size: 18, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white.opacity(0.92))
            }
            .scaleEffect(0.7 + levels.celebrationProgress * 0.6)
            .opacity(Double(levels.celebrationProgress))
            .allowsHitTesting(false)
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
                Text("LEVEL \(levels.currentLevel)")
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
                    // Pulse the level pill when celebrating a level-up.
                    // Driven by levels.celebrationProgress (0→1→0 over 3s).
                    .scaleEffect(1.0 + levels.celebrationProgress * 0.20)
                    .shadow(color: Color(red: 1.0, green: 0.85, blue: 0.3).opacity(Double(levels.celebrationProgress)), radius: 18)

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

    /// Game-over panel — only surfaces when the player runs out of moves
    /// without hitting the level target. Shows the run summary (TOTAL across
    /// session) and personal best so the player has a target to chase next
    /// run, plus the "NEW BEST!" flourish if applicable. Hidden during
    /// active play — kept off the always-visible HUD per user feedback that
    /// in-play high-score chrome was distracting.
    @ViewBuilder
    private var gameOverPanel: some View {
        if showGameOver {
            VStack(spacing: 14) {
                Text(highScores.celebratingNewBest ? "NEW BEST!" : "OUT OF MOVES")
                    .font(.system(size: 28, weight: .black, design: .rounded))
                    .kerning(2)
                    .foregroundStyle(highScores.celebratingNewBest
                        ? Color(red: 1.0, green: 0.85, blue: 0.30)
                        : .white)

                VStack(spacing: 4) {
                    Text("Your run")
                        .font(.system(size: 11, weight: .black))
                        .kerning(1.2)
                        .foregroundStyle(.white.opacity(0.55))
                    Text(HighScoreManager.formatNumber(totalScore))
                        .font(.system(size: 44, weight: .black, design: .rounded))
                        .foregroundStyle(.white)
                }

                if highScores.bestScore > 0 {
                    HStack(spacing: 6) {
                        Image(systemName: "trophy.fill")
                            .foregroundStyle(Color(red: 1.0, green: 0.85, blue: 0.30))
                        Text("Best: \(HighScoreManager.formatNumber(highScores.bestScore))")
                            .font(.system(size: 14, weight: .heavy, design: .rounded))
                            .foregroundStyle(.white.opacity(0.85))
                    }
                }

                Button {
                    sound.play(.uiButtonTap)
                    dismissGameOverAndRestart()
                } label: {
                    Text("PLAY AGAIN")
                        .font(.system(size: 14, weight: .heavy))
                        .kerning(1.4)
                        .padding(.horizontal, 28)
                        .padding(.vertical, 12)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color(red: 0.40, green: 0.20, blue: 0.55))
                .padding(.top, 4)
            }
            .padding(28)
            .background(
                RoundedRectangle(cornerRadius: 22)
                    .fill(Color.black.opacity(0.78))
                    .overlay(
                        RoundedRectangle(cornerRadius: 22).stroke(
                            highScores.celebratingNewBest
                                ? Color(red: 1.0, green: 0.85, blue: 0.30).opacity(0.6)
                                : .white.opacity(0.18),
                            lineWidth: 1
                        )
                    )
                    .shadow(
                        color: highScores.celebratingNewBest
                            ? Color(red: 1.0, green: 0.85, blue: 0.30).opacity(0.5)
                            : .black.opacity(0.5),
                        radius: 24
                    )
            )
        }
    }

    private func dismissGameOverAndRestart() {
        showGameOver = false
        // Same logic as the RESTART button — retry current level with a
        // fresh seed, keep currentLevel + carried-forward totalScore.
        seed = UInt64.random(in: 1...100_000)
        let palette = Array(["A","B","C","D","E","F","G","H"].prefix(levels.suggestedPaletteSize))
        var newEngine = Match3Engine(rows: 8, columns: 8, seed: seed)
        newEngine.symbols = palette
        engine = newEngine
        moves = levels.currentMovesAllowed
        combo = 1
        totalCleared = 0
        victoryAnnounced = false
        totalScore = baseTotalForLevel
        status = "Level \(levels.currentLevel) — target \(levels.currentTarget)"
        hintPair = nil
        lastMoveAt = Date()
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

            // Per-kind cascade flash overlays. Each FlashEffect has its
            // own UUID id so transitions add/remove cleanly when SwiftUI
            // diffs the array. 3-match = sparkle, 4-match = burst flash,
            // 5-match = lightning + circle ring.
            ForEach(activeFlashes) { flash in
                flashView(flash)
                    .position(flash.center)
                    .allowsHitTesting(false)
                    .transition(.scale.combined(with: .opacity))
            }
        }
        .frame(width: total + 36, height: total + 36)
        .animation(.spring(response: 0.45, dampingFraction: 0.78), value: engine.grid)
    }

    @ViewBuilder
    private func flashView(_ flash: FlashEffect) -> some View {
        let candy = CandyType.forSymbol(flash.symbol)
        // All flash sizes scale uniformly through intensity.flashScale —
        // tuning one knob rescales sparkle, burst, and lightning together
        // so they stay visually consistent. Intensity also controls
        // opacity (additive accent vs solid graphic) and halo radius.
        let scale = intensity.flashScale
        let alpha = intensity.flashOpacity
        let halo = intensity.flashHaloRadius
        switch flash.kind {
        case .three:
            Image(systemName: "sparkles")
                .font(.system(size: 56 * scale, weight: .black))
                .foregroundStyle(candy.topColor.opacity(alpha))
                .shadow(color: candy.topColor.opacity(alpha * 0.8), radius: halo)
        case .four:
            Image(systemName: "burst.fill")
                .font(.system(size: 92 * scale, weight: .black))
                .foregroundStyle(candy.topColor.opacity(alpha))
                .shadow(color: candy.topColor.opacity(alpha * 0.8), radius: halo * 1.4)
        case .five:
            ZStack {
                Circle()
                    .fill(candy.topColor.opacity(alpha * 0.6))
                    .frame(width: 150 * scale, height: 150 * scale)
                    .shadow(color: candy.topColor.opacity(alpha * 0.7), radius: halo * 2)
                    .blur(radius: 4)
                Image(systemName: "bolt.fill")
                    .font(.system(size: 96 * scale, weight: .black))
                    .foregroundStyle(Color.white.opacity(alpha + 0.15))
            }
        }
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

    /// Average position of a group of matched cells — used to anchor the
    /// flash overlay (sparkle / burst / lightning) at the visual center
    /// of the match.
    private func centerOfGroup(_ points: Set<PuzzlePoint>) -> CGPoint {
        let positions = points.map { positionFor($0) }
        let x = positions.map { $0.x }.reduce(0, +) / CGFloat(max(1, positions.count))
        let y = positions.map { $0.y }.reduce(0, +) / CGFloat(max(1, positions.count))
        return CGPoint(x: x, y: y)
    }

    private func candyTile(tile: Match3Tile, point: PuzzlePoint) -> some View {
        let candy = CandyType.forSymbol(tile.symbol)
        let isDragOrigin = dragOrigin == point
        let isHinted = hintPair.map { $0.0 == point || $0.1 == point } ?? false
        let dragOffset: CGSize = isDragOrigin ? clampedTranslation(dragTranslation) : .zero
        let phase = tileAnimationPhase[tile.id] ?? .idle
        let jiggleAmount = jigglingTiles[tile.id] ?? 0

        // Squash-stretch: scaleX vs scaleY computed per phase. Volume-preserving.
        // Real Candy Crush feel: bulge anticipation before clear, vertical
        // stretch while falling, horizontal squash on landing. (12 principles
        // of animation #1: squash-and-stretch.)
        let (sx, sy) = phaseScales(phase: phase, isDragOrigin: isDragOrigin, isHinted: isHinted && hintPulse)

        // Per-cell shadow intensity flips up briefly when a tile lands —
        // makes the "hit the floor" moment land visually.
        let shadowRadius: CGFloat = phase == .squashing ? 14 : (isHinted && hintPulse ? 18 : 7)

        // Neighbor jiggle disabled — it consistently read as "the whole board
        // is vibrating" no matter how localized we made the radius/amplitude/
        // phase. Real Candy Crush doesn't actually jiggle neighbors on a
        // baseline match; the satisfying feedback comes from the bulge-shrink
        // pop on the matched tiles + the slide-down + the squash-on-landing.
        // Keeping the state vars in case we want to revisit for special
        // matches (bomb/lightning) later, but they currently no-op.
        _ = jiggleAmount
        let jiggleX: CGFloat = 0
        let jiggleRotation: CGFloat = 0

        return candyShape(candy: candy)
            .frame(width: cellSize, height: cellSize)
            .scaleEffect(x: sx, y: sy, anchor: .center)
            .rotationEffect(.degrees(jiggleRotation))
            .opacity(phase == .shrinking ? 0 : 1)
            .shadow(color: candy.bottomColor.opacity(0.55), radius: shadowRadius, x: 0, y: 4)
            .offset(x: dragOffset.width + jiggleX, y: dragOffset.height)
            // Animate transitions per PHASE — NOT one global animation. Each
            // animation has its own duration matching real Candy Crush:
            //   bulging  = 80ms  (anticipation pop)
            //   shrinking = 100ms (follow-through)
            //   squashing = 130ms (landing impact, bouncy spring)
            .animation(animationFor(phase: phase), value: phase)
            .animation(.easeInOut(duration: 0.6), value: hintPulse)
            .animation(.interactiveSpring(response: 0.30, dampingFraction: 0.7), value: dragOffset)
            .animation(.easeInOut(duration: 0.08), value: jiggleAmount)
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

    /// Volume-preserving squash/stretch scales per animation phase.
    /// Returns (scaleX, scaleY). All amounts driven by AnimationIntensity
    /// — switch the `intensity` preset to rescale them all together.
    private func phaseScales(phase: TileAnimationPhase, isDragOrigin: Bool, isHinted: Bool) -> (CGFloat, CGFloat) {
        let bulge = 1.0 + intensity.bulgeAmount
        let squashX = 1.0 + intensity.squashAmount
        let squashY = 1.0 - intensity.squashAmount
        let fallX = 1.0 - intensity.fallStretch
        let fallY = 1.0 + intensity.fallStretch
        switch phase {
        case .bulging:    return (bulge, bulge)               // pre-clear pop
        case .shrinking:  return (0.0, 0.0)                   // collapses to nothing
        case .falling:    return (fallX, fallY)               // vertical stretch (gravity)
        case .squashing:  return (squashX, squashY)           // landing impact squash
        case .idle:
            if isDragOrigin { return (1.10, 1.10) }
            if isHinted     { return (1.07, 1.07) }
            return (1.0, 1.0)
        }
    }

    /// Per-phase animation curves. Different phases NEED different timings —
    /// this is what gives the game its "alive" feel vs everything moving at
    /// the same boring spring. Durations + spring params come from intensity.
    private func animationFor(phase: TileAnimationPhase) -> Animation {
        switch phase {
        case .bulging:    return .easeOut(duration: intensity.bulgeDuration)
        case .shrinking:  return .easeIn(duration: intensity.shrinkDuration)
        case .falling:    return .easeIn(duration: 0.18)               // gravity ease-in
        case .squashing:  return .spring(
                            response: intensity.fallSpringResponse,
                            dampingFraction: intensity.fallSpringDamping
                          )
        case .idle:       return .spring(
                            response: intensity.landSpringResponse,
                            dampingFraction: intensity.landSpringDamping + 0.08  // slightly snappier on idle restore
                          )
        }
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
        // Floor at 0 — without this, rapid-fire swaps before the
        // game-over state catches up could push moves negative. Reject
        // the swap with a soft error if we're already out of moves.
        guard moves > 0 else {
            status = "Out of moves — RESTART to try this level again."
            sound.play(.uiError)
            return
        }

        // Phase 1: try the swap. Wrapped in withAnimation so the two tiles
        // slide into each other's cells via the .position animation key
        // hooked to engine.grid.
        var didSwap = false
        withAnimation(.spring(response: 0.30, dampingFraction: 0.78)) {
            didSwap = engine.swapOnly(origin, target)
        }

        lastMoveAt = Date()
        hintPair = nil

        if !didSwap {
            // Bad swap (non-matching) — DON'T charge a move. Players who
            // mistime a drag shouldn't be punished by the move counter.
            status = "No match — try a different swap."
            sound.play(.uiError)
            return
        }

        // Successful swap — charge exactly one move (floor at 0).
        moves = max(0, moves - 1)

        // SFX: a soft button-tap on every successful swap commit. Confirms
        // the action without overshadowing the match-clear SFX that follows.
        sound.play(.uiButtonTap, volume: 0.5)

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
        var iterations = 0

        while true {
            // STEP A: detect matches WITHOUT clearing yet. We need the tile-IDs
            // about to be cleared so we can drive their bulge → shrink anticipation.
            let groups = engine.findMatchGroups()
            if groups.isEmpty { break }

            iterations += 1
            combo = iterations
            status = combo > 1 ? "Combo x\(combo)!" : "Nice match!"

            // Map: which tile.ids are about to disappear (so we can phase them)
            var doomedTileIDs: [UUID] = []
            for group in groups {
                for p in group {
                    let t = engine.grid[p]
                    if !t.symbol.isEmpty { doomedTileIDs.append(t.id) }
                }
            }

            // Compute synthetic events so we can preview the kind/center
            // (engine doesn't expose them publicly until clearMatches() commits).
            var previewEvents: [Match3MatchEvent] = []
            for group in groups {
                let kind: Match3Kind = group.count >= 5 ? .five : (group.count == 4 ? .four : .three)
                let firstSymbol = engine.grid[group.first!].symbol
                previewEvents.append(Match3MatchEvent(
                    kind: kind, points: group, pointsAwarded: 0,
                    symbol: firstSymbol, cascadeDepth: iterations - 1
                ))
            }

            // STEP B: ANTICIPATION — bulge the doomed tiles (1.25x over 80ms).
            // This is principle #1 (squash-stretch) + principle #4 (anticipation):
            // tiles get bigger before they explode, so the eye knows what's coming.
            withAnimation(.easeOut(duration: 0.08)) {
                for id in doomedTileIDs { tileAnimationPhase[id] = .bulging }
            }
            try? await Task.sleep(nanoseconds: 80_000_000)

            // STEP C: spawn the per-kind flashes + jiggle the neighbors of
            // big matches (secondary motion — surrounding candies REACT to
            // the explosion). Run these in parallel with the shrink so the
            // explosion lands as one event.
            for event in previewEvents {
                let center = self.centerOfGroup(event.points)
                self.activeFlashes.append(FlashEffect(
                    kind: event.kind, center: center, symbol: event.symbol
                ))
                // SFX per match kind. Cascade chord: each follow-on cascade
                // depth bumps pitch +2 semitones for the satisfying ascending
                // arpeggio Candy Crush is famous for.
                let pitchBump = event.cascadeDepth * 2
                switch event.kind {
                case .three:
                    sound.play(.match3Pop, pitchSemitones: pitchBump)
                case .four:
                    sound.play(.match3Burst, pitchSemitones: pitchBump)
                case .five:
                    sound.play(.match3Bomb, pitchSemitones: pitchBump)
                }
                // Neighbor jiggle removed — it read as "whole board vibrates"
                // no matter how tightly we scoped it.
            }
            // Extra cascade chord layer on chain reactions (depth >= 1).
            if (previewEvents.first?.cascadeDepth ?? 0) >= 1 {
                sound.play(.puzzleCascade, pitchSemitones: (previewEvents.first?.cascadeDepth ?? 1) * 2)
            }

            // STEP D: FOLLOW-THROUGH — shrink to 0 + fade (100ms ease-in).
            // Tiles disappear with a satisfying "pop down" not a flat fade.
            withAnimation(.easeIn(duration: 0.10)) {
                for id in doomedTileIDs { tileAnimationPhase[id] = .shrinking }
            }
            try? await Task.sleep(nanoseconds: 110_000_000)

            // STEP E: commit the clear in the engine. Matched tiles now have
            // symbol = "" so they're filtered out of tilesWithPositions.
            withAnimation(.linear(duration: 0.001)) {
                _ = engine.clearMatches()
            }
            for id in doomedTileIDs { tileAnimationPhase.removeValue(forKey: id) }
            totalCleared += doomedTileIDs.count

            // STEP F: COLLAPSE + REFILL. The existing tiles fall DOWN into
            // empty cells; new tiles enter from above. We use the engine's
            // collapseAndRefill which preserves UUIDs for falling tiles
            // (they animate via .position because tile.id is stable) and
            // creates fresh UUIDs for new tiles (they enter via transition).
            //
            // Snapshot pre-collapse positions per tile UUID so STEP G can
            // squash ONLY the tiles that actually moved. Squashing every
            // tile (the bug in v6.0–v6.2) reads as "the whole board is
            // vibrating after every match" — even for matches in just one
            // corner. Tiles that didn't fall must stay completely still.
            var preCollapseRow: [UUID: Int] = [:]
            for entry in self.tilesWithPositions() {
                preCollapseRow[entry.tile.id] = entry.point.row
            }

            // Per-tile fall stagger: since the spring animation is on the
            // grid as a whole, all tiles in the same column fall together.
            // Real Candy Crush staggers by column (cols delay 30ms each)
            // but our spring already gives a satisfying ripple feel, so v6
            // sticks with a single spring + ease-in for landing punch.
            withAnimation(.easeIn(duration: 0.18)) {
                engine.collapseAndRefill()
            }

            // STEP G: SQUASH-LAND — after the fall, briefly squash ONLY the
            // tiles that actually moved (different row than before collapse,
            // OR brand-new tiles that entered from above). Tiles that were
            // already in their final position get NO squash, so an isolated
            // match in one corner doesn't ripple visual noise across the
            // whole board.
            try? await Task.sleep(nanoseconds: 180_000_000)
            let landedTileIDs: [UUID] = self.tilesWithPositions().compactMap { entry in
                let id = entry.tile.id
                if let oldRow = preCollapseRow[id] {
                    return oldRow != entry.point.row ? id : nil  // moved
                } else {
                    return id  // new tile (entered from above)
                }
            }
            withAnimation(.spring(response: 0.18, dampingFraction: 0.45)) {
                for id in landedTileIDs { tileAnimationPhase[id] = .squashing }
            }
            try? await Task.sleep(nanoseconds: 130_000_000)
            withAnimation(.spring(response: 0.20, dampingFraction: 0.7)) {
                for id in landedTileIDs { tileAnimationPhase[id] = .idle }
            }

            // Auto-remove flashes after they've played.
            let flashCount = previewEvents.count
            let flashIDsToRemove = self.activeFlashes.suffix(flashCount).map(\.id)
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 600_000_000)
                withAnimation(.easeIn(duration: 0.20)) {
                    self.activeFlashes.removeAll { flashIDsToRemove.contains($0.id) }
                }
            }
        }

        // Level-up: target hit. CRITICAL — do all state mutation atomically
        // (no async sleeps that interleave with subsequent runCascadeLoop()
        // calls). Previously the state-reset was split across `try await
        // Task.sleep`s, which caused: (a) totalScore reset to 0 if the user
        // swapped during the sleep window because baseTotalForLevel was
        // stale, (b) moves not refreshing because the moves= line ran later,
        // (c) RESTART during the celebration leaving inconsistent state
        // since both paths fought for the same vars.
        // Fix: bump level + reset state SYNCHRONOUSLY in this turn. SFX +
        // banner are independent (banner is driven by levels.celebrationProgress
        // which advances on its own; SFX is a one-shot async play). The
        // gameplay state is consistent the moment level-up fires.
        if !victoryAnnounced && engine.score >= levels.currentTarget {
            victoryAnnounced = true

            // 1. Carry the level's earned score into totalScore + commit
            //    to high-score storage (commit only updates if new best).
            totalScore = baseTotalForLevel + engine.score
            // Note: highScores.commit() is moved to the game-over path
            // only — see wisdom rule score-show-personal-best-on-game-over.
            // During play we just track totalScore; no commit until run ends.

            // 2. Advance the level number — bumps levels.currentLevel,
            //    fires the celebration banner, persists to UserDefaults.
            sound.play(.victory, volume: 1.0)
            levels.advance()
            // Schedule the level-up SFX as a delayed one-shot (does NOT
            // mutate state — purely audio).
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 350_000_000)
                sound.play(.levelUp, pitchSemitones: 2)
            }

            // 3. Atomically swap to the new level's engine + state. Reading
            //    levels.suggestedPaletteSize / currentMovesAllowed here
            //    gives the NEW level's values since levels.advance() ran
            //    above.
            seed = UInt64.random(in: 1...100_000)
            let newPalette = Array(["A","B","C","D","E","F","G","H"]
                .prefix(levels.suggestedPaletteSize))
            var newEngine = Match3Engine(rows: 8, columns: 8, seed: seed)
            newEngine.symbols = newPalette
            withAnimation(.easeInOut(duration: 0.6)) {
                engine = newEngine
                baseTotalForLevel = totalScore   // carry running total forward
                moves = levels.currentMovesAllowed
                combo = 1
                totalCleared = 0
                victoryAnnounced = false
                status = "Level \(levels.currentLevel) — target \(levels.currentTarget)"
            }

            // 4. Bail out of the score-sync line below. engine.score is
            //    now 0 (fresh engine) and totalScore was just set to the
            //    correct carried-forward value — re-running the line
            //    would clobber it back to baseTotalForLevel + 0.
            return
        }

        // Keep totalScore in sync within the current level (only when no
        // level-up fired this turn — see early return above).
        totalScore = baseTotalForLevel + engine.score

        // Game-over check: out of moves AND didn't hit the level target.
        // (If we did hit the target, the level-up branch above already
        // re-seeded the board with fresh moves.)
        if moves == 0 && !victoryAnnounced && !showGameOver {
            // Commit the run total to high-score storage. commit() returns
            // true on a new best and fires the celebrationProgress ramp,
            // which the gameOverPanel reads for the NEW BEST styling.
            highScores.commit(score: totalScore)
            sound.play(.gameOver)
            // Brief delay so the cascade SFX rings out before the panel
            // appears.
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 600_000_000)
                withAnimation(.easeOut(duration: 0.30)) {
                    showGameOver = true
                }
            }
        }

        checkBoardHealth()
    }

    /// Secondary-motion neighbor jiggle. When a 4/5-match clears, the IMMEDIATE
    /// neighbors (radius 1, orthogonal only — not diagonals) briefly shake —
    /// sells the explosion as a real impact without making the whole board
    /// feel like it's vibrating. v6.1 tightened from radius 2/3 → radius 1
    /// after user feedback that the jiggle radiated too far and felt global.
    /// 5-match keeps a slightly larger amplitude but same radius — bigger
    /// matches feel stronger via amplitude, NOT spread.
    private func triggerNeighborJiggle(around matchedPoints: Set<PuzzlePoint>, kind: Match3Kind) {
        // Radius 1, orthogonal only. Diagonals make the cluster feel boxy
        // and also expand the affected count from ~4 to ~8 per matched cell.
        let amount: CGFloat = kind == .five ? 1.6 : 1.1
        var neighborIDs: Set<UUID> = []
        let offsets: [(Int, Int)] = [(-1, 0), (1, 0), (0, -1), (0, 1)]

        for matched in matchedPoints {
            for (dr, dc) in offsets {
                let p = PuzzlePoint(row: matched.row + dr, col: matched.col + dc)
                guard engine.grid.contains(p) else { continue }
                if matchedPoints.contains(p) { continue }
                let t = engine.grid[p]
                if !t.symbol.isEmpty { neighborIDs.insert(t.id) }
            }
        }

        // Seed a per-tile random phase offset so each neighbor wobbles
        // out-of-sync. Without this they all sin() the same shared clock and
        // appear locked in unison — reads as board-shake, not localized impact.
        for id in neighborIDs where jigglePhase[id] == nil {
            jigglePhase[id] = Double.random(in: 0..<(2 * .pi))
        }

        withAnimation(.easeInOut(duration: 0.06)) {
            for id in neighborIDs { jigglingTiles[id] = amount }
        }
        // Decay over 200ms — quick wobble, not a sustained shake.
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 200_000_000)
            withAnimation(.easeOut(duration: 0.14)) {
                for id in neighborIDs {
                    jigglingTiles.removeValue(forKey: id)
                    jigglePhase.removeValue(forKey: id)
                }
            }
        }
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
                // RESTART = retry current level (NOT drop to L1). Per wisdom
                // rule level-replay-not-demote: a player who runs out of
                // moves should keep their level, just retry. Engine.score
                // zeroes via the new Match3Engine init; totalScore drops
                // back to baseTotalForLevel (you lose the in-progress
                // level score, but your cumulative carry-in from prior
                // levels is preserved).
                seed = UInt64.random(in: 1...100_000)
                let palette = Array(["A","B","C","D","E","F","G","H"].prefix(levels.suggestedPaletteSize))
                var newEngine = Match3Engine(rows: 8, columns: 8, seed: seed)
                newEngine.symbols = palette
                engine = newEngine
                moves = levels.currentMovesAllowed
                combo = 1
                totalCleared = 0
                victoryAnnounced = false
                totalScore = baseTotalForLevel
                status = "Level \(levels.currentLevel) — target \(levels.currentTarget)"
                hintPair = nil
                lastMoveAt = Date()
                sound.play(.uiButtonTap)
            } label: {
                Text("RESTART")
                    .font(.system(size: 14, weight: .heavy))
                    .kerning(1.4)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color(red: 0.40, green: 0.20, blue: 0.55))

            // Mute toggle — wisdom rule audio-always-mute-toggle says any
            // game with sound MUST expose a visible mute button. SF Symbol
            // toggles between speaker.wave.2.fill and speaker.slash.fill.
            Button {
                sound.muted.toggle()
                if !sound.muted { sound.play(.uiToggle) }  // confirm un-mute audibly
            } label: {
                Image(systemName: sound.muted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                    .font(.system(size: 16, weight: .bold))
                    .frame(width: 36, height: 36)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color(red: 0.40, green: 0.20, blue: 0.55))
            .help(sound.muted ? "Unmute (M)" : "Mute (M)")
            .keyboardShortcut("m", modifiers: [])

            Spacer()
            Text(status)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.white.opacity(0.78))
            Spacer()

            Button {
                hintPair = findPossibleSwap()
                withAnimation(.easeInOut(duration: 0.5)) { hintPulse.toggle() }
                sound.play(.uiButtonTap, volume: 0.5)
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
