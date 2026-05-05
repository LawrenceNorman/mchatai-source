import SwiftUI
import AppKit

struct ContentView: View {
    @State private var engine = MinesweeperEngine(rows: 9, columns: 9, mineCount: 10, seed: 7)
    @State private var selected = PuzzlePoint(row: 0, col: 0)
    @State private var flagMode = false
    @State private var elapsedSeconds = 0
    @State private var seed: UInt64 = 7

    /// Animation tuning — Minesweeper is a focus-puzzle game, so .subtle
    /// (calmer audio, smaller flashes — animations are punctuation, not
    /// the show).
    private let intensity: AnimationIntensity = .subtle

    /// Sound effects engine. Tile reveal = soft pop. Flag toggle = ui-toggle.
    /// Mine explosion = arcade-explosion-big. Win chime = victory.
    /// Honors persistent UserDefaults mute toggle (visible button in controls).
    @ObservedObject private var sound = SoundEngine.shared

    /// Per intensity preset: scale all SFX volumes uniformly. Subtle =
    /// 0.35 sfxVolume, low intrusion. Override on init.
    @State private var didConfigureSound = false

    /// Personal-best score tracker. For Minesweeper, "score" = how fast
    /// you cleared the board. Higher score = faster solve = better.
    /// Surfaced ONLY in the game-over panel (per
    /// score-show-personal-best-on-game-over wisdom rule). Does NOT
    /// appear in the in-play HUD.
    @StateObject private var highScores = HighScoreManager(gameID: "minesweeper.beginner")

    /// Tracks state transitions so SFX fire on EVENT, not on render
    /// (per audio-debounce-events-not-renders).
    @State private var lastObservedRevealedCount = 0
    @State private var lastObservedState: MinesweeperState = .ready
    @State private var gameEndAnnounced = false

    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    /// Per-game baseline. A perfect-no-time clear scores `perfectTimeBudget`;
    /// each second cuts the bonus. Score floors at 1 so even a slow win
    /// is non-zero (and a loss commits 0). For 9x9/10-mines, an expert
    /// clear is ~25-40s; budget=180 gives 140-155 score for a good time.
    private let perfectTimeBudget = 180

    var body: some View {
        ZStack(alignment: .topLeading) {
            VStack(alignment: .leading, spacing: 18) {
                header
                mineGrid
                controls
            }
            .padding(28)

            // Game-over overlay with prominent Play Again button (mac-022).
            // Pre-fix: when the game ended, the only restart paths were the
            // small "New Game" button hidden in the controls row OR the
            // "R" keyboard shortcut. Neither was discoverable mid-play —
            // the Match3-cluster feedback applies here too: every game
            // needs a VISIBLE on-screen restart affordance when terminal.
            if engine.state == .won || engine.state == .lost {
                gameOverOverlay
                    .transition(.opacity)
            }

            MinesweeperKeyboardCaptureView(
                onReveal: activateSelected,
                onFlag: toggleSelectedFlag,
                onReset: newGame,
                onMove: moveSelection
            )
            .frame(width: 1, height: 1)
            .opacity(0.01)
            .accessibilityHidden(true)
        }
        .frame(minWidth: 620, minHeight: 760)
        .background(Color(red: 0.08, green: 0.1, blue: 0.12))
        .onAppear {
            if !didConfigureSound {
                // Apply the .subtle preset on first appearance so SFX volume
                // is calibrated to a focus-puzzle game (low intrusion).
                sound.intensity = .subtle
                didConfigureSound = true
            }
            lastObservedState = engine.state
            lastObservedRevealedCount = revealedCount
        }
        .onReceive(timer) { _ in
            if engine.state == .playing {
                elapsedSeconds += 1
            }
        }
        // Fire SFX + commit high-score on STATE TRANSITIONS — not in
        // the render loop. (audio-debounce-events-not-renders)
        .onChange(of: engine.state) { _, newState in
            handleStateTransition(to: newState)
        }
        // Reveal SFX: fires when the revealed-cell count grows. Cascade
        // reveals (clicking a 0-cell that flood-fills) only play once
        // per click since they all happen in a single state mutation.
        .onChange(of: revealedCount) { oldCount, newCount in
            if newCount > oldCount && engine.state == .playing {
                sound.play(.match3Pop, volume: 0.6)
            }
            lastObservedRevealedCount = newCount
        }
    }

    private var revealedCount: Int {
        engine.grid.cells.filter(\.isRevealed).count
    }

    /// Score for a cleared board: higher is better. Faster wins beat slower.
    /// Loss commits 0 (still tracked as `lastScore` so "you played" counts,
    /// but never beats a real win).
    private var winScore: Int {
        max(1, perfectTimeBudget - elapsedSeconds)
    }

    /// One-shot SFX + high-score handling on game-state changes. Called
    /// from .onChange(of: engine.state) so it fires exactly once per
    /// transition (not on render).
    private func handleStateTransition(to newState: MinesweeperState) {
        guard newState != lastObservedState else { return }
        lastObservedState = newState
        switch newState {
        case .won:
            guard !gameEndAnnounced else { return }
            gameEndAnnounced = true
            // Commit only on WIN — losses score 0 and aren't worth tracking.
            highScores.commit(score: winScore)
            sound.play(.victory)
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 350_000_000)
                sound.play(.levelUp, pitchSemitones: 2)
            }
        case .lost:
            guard !gameEndAnnounced else { return }
            gameEndAnnounced = true
            sound.play(.arcadeExplosionBig, volume: 0.8)
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 600_000_000)
                sound.play(.gameOver)
            }
        default: break
        }
    }

    @ViewBuilder
    private var gameOverOverlay: some View {
        ZStack {
            Color.black.opacity(0.7)
            VStack(spacing: 14) {
                // "NEW BEST!" banner takes priority over BOARD CLEARED
                // when a personal best was just set (gold styling). Loss
                // → "BOOM" red. Win → "BOARD CLEARED" green.
                if engine.state == .won && highScores.celebratingNewBest {
                    Text("NEW BEST!")
                        .font(.system(size: 44, weight: .black, design: .rounded))
                        .foregroundStyle(Color(red: 1.0, green: 0.85, blue: 0.30))
                } else {
                    Text(engine.state == .won ? "BOARD CLEARED" : "BOOM")
                        .font(.system(size: 44, weight: .black, design: .rounded))
                        .foregroundStyle(engine.state == .won ? .green : .red)
                }
                Text(engine.state == .won
                    ? "Cleared in \(timeText)"
                    : "Mine triggered. Better luck next sweep.")
                    .font(.title3)
                    .foregroundStyle(.white.opacity(0.9))

                // High-score row — surfaced ONLY on win (per
                // score-show-personal-best-on-game-over). Losses don't
                // commit a score, so showing the best on a loss is just
                // demoralizing chrome.
                if engine.state == .won && highScores.bestScore > 0 {
                    HStack(spacing: 6) {
                        Image(systemName: "trophy.fill")
                            .foregroundStyle(Color(red: 1.0, green: 0.85, blue: 0.30))
                        Text("Best: \(HighScoreManager.formatNumber(highScores.bestScore))")
                            .font(.system(size: 14, weight: .heavy, design: .rounded))
                            .foregroundStyle(.white.opacity(0.85))
                    }
                }

                Button {
                    newGame()
                } label: {
                    Text("Play Again")
                        .font(.title3.bold())
                        .padding(.horizontal, 28)
                        .padding(.vertical, 8)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .keyboardShortcut(.return, modifiers: [])
                Text("Press Return to restart")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.5))
            }
            .padding(36)
            .background(Color.black.opacity(0.85))
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .shadow(
                color: highScores.celebratingNewBest && engine.state == .won
                    ? Color(red: 1.0, green: 0.85, blue: 0.30).opacity(0.5)
                    : .black.opacity(0.5),
                radius: 24
            )
        }
    }

    private var header: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Minesweeper")
                    .font(.system(size: 38, weight: .black, design: .rounded))
                    .foregroundStyle(.white)
                Text(statusText)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(statusColor)
            }

            Spacer()

            statBlock(label: "TIME", value: timeText)
            statBlock(label: "MINES", value: "\(minesRemaining)")
        }
        .frame(width: 564)
    }

    private var mineGrid: some View {
        let columns = Array(repeating: GridItem(.fixed(56), spacing: 4), count: engine.grid.columns)
        return LazyVGrid(columns: columns, spacing: 4) {
            ForEach(engine.grid.allPoints(), id: \.self) { point in
                cellView(point)
            }
        }
        .padding(10)
        .fixedSize()
        .background(Color.black.opacity(0.36))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay {
            RoundedRectangle(cornerRadius: 10)
                .stroke(.white.opacity(0.12), lineWidth: 1)
        }
    }

    private var controls: some View {
        HStack(spacing: 12) {
            Toggle("Flag", isOn: $flagMode)
                .toggleStyle(.button)
                .tint(.orange)

            Button("Reveal") {
                reveal(selected)
            }
            .buttonStyle(.borderedProminent)

            Button("New Game") {
                newGame()
            }

            // Mute toggle — required by audio-always-mute-toggle wisdom rule.
            Button {
                sound.muted.toggle()
                if !sound.muted { sound.play(.uiToggle, volume: 0.4) }
            } label: {
                Image(systemName: sound.muted ? "speaker.slash.fill" : "speaker.wave.2.fill")
            }
            .help(sound.muted ? "Unmute" : "Mute")

            Spacer()

            Text("Arrows move · Space reveal · F flag · R reset")
                .font(.callout.weight(.semibold))
                .foregroundStyle(.white.opacity(0.58))
        }
        .frame(width: 564)
    }

    private var statusText: String {
        switch engine.state {
        case .ready: return flagMode ? "Flag mode. Mark suspicious tiles." : "Choose a safe tile."
        case .playing: return flagMode ? "Flag mode active." : "Sweep carefully."
        case .won: return "Board cleared."
        case .lost: return "Mine triggered."
        }
    }

    private var statusColor: Color {
        switch engine.state {
        case .won: return .green
        case .lost: return .red
        default: return .white.opacity(0.72)
        }
    }

    private var timeText: String {
        String(format: "%02d:%02d", elapsedSeconds / 60, elapsedSeconds % 60)
    }

    private var minesRemaining: Int {
        engine.mineCount - engine.grid.cells.filter(\.isFlagged).count
    }

    private func statBlock(label: String, value: String) -> some View {
        VStack(alignment: .trailing, spacing: 2) {
            Text(label)
                .font(.caption.weight(.black))
                .foregroundStyle(.white.opacity(0.52))
            Text(value)
                .font(.system(size: 30, weight: .black, design: .rounded))
                .foregroundStyle(.white)
                .monospacedDigit()
        }
    }

    private func cellView(_ point: PuzzlePoint) -> some View {
        let cell = engine.grid[point]
        let isSelected = point == selected

        return Button {
            if flagMode {
                flag(point)
            } else {
                reveal(point)
            }
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: 6)
                    .fill(cellFill(cell))
                    .overlay {
                        RoundedRectangle(cornerRadius: 6)
                            .stroke(isSelected ? .yellow : .black.opacity(0.2), lineWidth: isSelected ? 3 : 1)
                    }

                cellContent(cell)
            }
            .frame(width: 56, height: 56)
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button(cell.isFlagged ? "Remove Flag" : "Flag") {
                flag(point)
            }
        }
        .accessibilityLabel(accessibilityLabel(for: point, cell: cell))
    }

    @ViewBuilder
    private func cellContent(_ cell: MinesweeperCell) -> some View {
        if cell.isFlagged && !cell.isRevealed {
            Image(systemName: "flag.fill")
                .font(.title2.bold())
                .foregroundStyle(.orange)
        } else if cell.isRevealed && cell.hasMine {
            Image(systemName: "burst.fill")
                .font(.title2.bold())
                .foregroundStyle(.red)
        } else if cell.isRevealed && cell.adjacentMines > 0 {
            Text("\(cell.adjacentMines)")
                .font(.system(size: 24, weight: .black, design: .rounded))
                .foregroundStyle(numberColor(cell.adjacentMines))
        }
    }

    private func cellFill(_ cell: MinesweeperCell) -> Color {
        if cell.isRevealed && cell.hasMine { return Color.red.opacity(0.28) }
        if cell.isRevealed { return Color.white.opacity(0.88) }
        return Color(red: 0.18, green: 0.24, blue: 0.3)
    }

    private func numberColor(_ count: Int) -> Color {
        switch count {
        case 1: return .blue
        case 2: return .green
        case 3: return .red
        case 4: return .purple
        default: return .orange
        }
    }

    private func reveal(_ point: PuzzlePoint) {
        selected = point
        engine.reveal(at: point)
        print("[MinesweeperExample] reveal row=\(point.row) col=\(point.col) state=\(engine.state)")
    }

    private func flag(_ point: PuzzlePoint) {
        selected = point
        engine.toggleFlag(at: point)
        sound.play(.uiToggle, volume: 0.5)
        print("[MinesweeperExample] flag row=\(point.row) col=\(point.col) remaining=\(minesRemaining)")
    }

    private func activateSelected() {
        if flagMode {
            flag(selected)
        } else {
            reveal(selected)
        }
    }

    private func toggleSelectedFlag() {
        flag(selected)
    }

    private func moveSelection(_ direction: GridDirection) {
        let next = selected.moved(direction)
        guard engine.grid.contains(next) else { return }
        selected = next
    }

    private func newGame() {
        seed += 1
        engine = MinesweeperEngine(rows: 9, columns: 9, mineCount: 10, seed: seed)
        selected = PuzzlePoint(row: 0, col: 0)
        elapsedSeconds = 0
        flagMode = false
        gameEndAnnounced = false
        lastObservedState = engine.state
        lastObservedRevealedCount = 0
        sound.play(.uiButtonTap, volume: 0.5)
        print("[MinesweeperExample] new game seed=\(seed)")
    }

    private func accessibilityLabel(for point: PuzzlePoint, cell: MinesweeperCell) -> String {
        let coordinate = "row \(point.row + 1), column \(point.col + 1)"
        if cell.isFlagged { return "\(coordinate), flagged" }
        if !cell.isRevealed { return "\(coordinate), hidden" }
        if cell.hasMine { return "\(coordinate), mine" }
        return "\(coordinate), \(cell.adjacentMines) adjacent mines"
    }
}

private struct MinesweeperKeyboardCaptureView: NSViewRepresentable {
    var onReveal: () -> Void
    var onFlag: () -> Void
    var onReset: () -> Void
    var onMove: (GridDirection) -> Void

    func makeNSView(context: Context) -> KeyCatcherView {
        let view = KeyCatcherView()
        view.onReveal = onReveal
        view.onFlag = onFlag
        view.onReset = onReset
        view.onMove = onMove
        DispatchQueue.main.async {
            view.window?.makeFirstResponder(view)
        }
        return view
    }

    func updateNSView(_ nsView: KeyCatcherView, context: Context) {
        nsView.onReveal = onReveal
        nsView.onFlag = onFlag
        nsView.onReset = onReset
        nsView.onMove = onMove
        DispatchQueue.main.async {
            nsView.window?.makeFirstResponder(nsView)
        }
    }

    final class KeyCatcherView: NSView {
        var onReveal: (() -> Void)?
        var onFlag: (() -> Void)?
        var onReset: (() -> Void)?
        var onMove: ((GridDirection) -> Void)?

        override var acceptsFirstResponder: Bool { true }

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            DispatchQueue.main.async {
                self.window?.makeFirstResponder(self)
            }
        }

        override func keyDown(with event: NSEvent) {
            switch event.keyCode {
            case 49:
                onReveal?()
            case 3:
                onFlag?()
            case 15:
                onReset?()
            case 123:
                onMove?(.left)
            case 124:
                onMove?(.right)
            case 125:
                onMove?(.down)
            case 126:
                onMove?(.up)
            default:
                return
            }
        }
    }
}
