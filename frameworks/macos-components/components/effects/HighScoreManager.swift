// BEGIN mChatAI macOS Component: effects.high-score-manager (components/effects/HighScoreManager.swift)
import Foundation
import SwiftUI

/// Game-flavor high-score / personal-best tracker. Persists per-game best
/// score via UserDefaults under "HighScoreManager.<gameID>.bestScore".
/// Pairs naturally with LevelManager: LevelManager tracks structural
/// progression (current level), HighScoreManager tracks score achievement
/// (personal best across all sessions).
///
/// Why this exists: every game with a score has the same loop —
///   1. Load persisted best from UserDefaults on launch
///   2. Compare current score to best after each scoring event
///   3. If current > best, fire a "new high score!" celebration
///   4. Save the new best on game-over / level-up / quit
///
/// Without a shared component every game reinvents this and gets some
/// piece wrong (forgets to save, no celebration, no "ahead of best by N"
/// HUD, no per-game-mode separation, etc.).
///
/// Quick start (in a SwiftUI View):
///   ```
///   @StateObject private var highScores = HighScoreManager(gameID: "match3")
///   // ...HUD...
///   Text("BEST: \(highScores.bestScore)")
///   if highScores.isAheadOfBest(currentScore: totalScore) {
///       Text("+\(totalScore - highScores.bestScore) ahead!")
///   }
///   // ...on level-up or game-over...
///   highScores.commit(score: totalScore)  // persists if it's a new best
///   ```
///
/// Multi-mode games (e.g. easy/hard variants) should use a compound gameID
/// like "match3.easy" / "match3.hard" so their bests don't overwrite each
/// other.
@available(macOS 12.0, *)
@MainActor
public final class HighScoreManager: ObservableObject {
    /// Stable identifier for this game / mode. Used as the UserDefaults
    /// key prefix. Multi-mode: "match3.easy", "match3.hard", etc.
    public let gameID: String

    /// Personal best — highest committed score ever, loaded from
    /// UserDefaults on init, persisted on commit().
    @Published public private(set) var bestScore: Int

    /// Most-recently-committed score. NOT necessarily the best — useful
    /// for "your last game: 12,300" UX.
    @Published public private(set) var lastScore: Int

    /// True for the brief celebration window after commit() detected a
    /// new high score. Drives the HUD's "NEW BEST!" flourish.
    @Published public private(set) var celebratingNewBest: Bool = false

    /// Animation knob for the celebration window: 0 → 1 over 0.4s,
    /// plateau 0.6s, 1 → 0 over 1.5s. View binds banner / pill scales
    /// and opacity to this.
    @Published public private(set) var celebrationProgress: CGFloat = 0

    public init(gameID: String) {
        self.gameID = gameID
        self.bestScore = UserDefaults.standard.integer(forKey: Self.bestKey(gameID))
        self.lastScore = UserDefaults.standard.integer(forKey: Self.lastKey(gameID))
    }

    // MARK: - Read helpers (used by View HUD)

    /// True if currentScore is strictly greater than the persisted best.
    /// Useful for live "you're ahead of your best!" HUD indicator before
    /// the score is committed.
    public func isAheadOfBest(currentScore: Int) -> Bool {
        currentScore > bestScore
    }

    /// Distance from current to best. Negative = behind, positive = ahead.
    /// e.g. (currentScore=10000, bestScore=8000) → 2000.
    public func deltaToBest(currentScore: Int) -> Int {
        currentScore - bestScore
    }

    /// Friendly description: "BEST: 12,450" or "BEST: — (none yet)".
    /// Returns nil for the empty-best case if the caller wants to render
    /// differently.
    public var bestScoreDisplay: String {
        bestScore > 0 ? Self.formatNumber(bestScore) : "—"
    }

    // MARK: - Commit + reset

    /// Commit a score (e.g. on game-over, level-up, or app-quit). Updates
    /// `lastScore` always; updates `bestScore` + fires celebration ONLY
    /// if score > current best. Returns true if it was a new best.
    @discardableResult
    public func commit(score: Int) -> Bool {
        lastScore = score
        UserDefaults.standard.set(score, forKey: Self.lastKey(gameID))

        guard score > bestScore else { return false }
        bestScore = score
        UserDefaults.standard.set(score, forKey: Self.bestKey(gameID))
        triggerCelebration()
        return true
    }

    /// Reset persisted best (e.g. user-initiated "Clear High Score" in
    /// settings). Use sparingly — most users want to keep their best forever.
    public func reset() {
        bestScore = 0
        lastScore = 0
        UserDefaults.standard.removeObject(forKey: Self.bestKey(gameID))
        UserDefaults.standard.removeObject(forKey: Self.lastKey(gameID))
    }

    // MARK: - Internal

    private func triggerCelebration() {
        celebratingNewBest = true
        celebrationProgress = 0
        Task { @MainActor in
            await ramp(to: 1.0, duration: 0.4)
            try? await Task.sleep(nanoseconds: 600_000_000)
            await ramp(to: 0.0, duration: 1.5)
            celebratingNewBest = false
        }
    }

    private func ramp(to target: CGFloat, duration: Double) async {
        let start = celebrationProgress
        let frames = max(1, Int(duration * 30))
        for f in 0..<frames {
            let t = CGFloat(f + 1) / CGFloat(frames)
            celebrationProgress = start + (target - start) * t
            try? await Task.sleep(nanoseconds: UInt64(1_000_000_000.0 / 30.0))
        }
        celebrationProgress = target
    }

    // MARK: - UserDefaults keys

    private static func bestKey(_ gameID: String) -> String {
        "HighScoreManager.\(gameID).bestScore"
    }
    private static func lastKey(_ gameID: String) -> String {
        "HighScoreManager.\(gameID).lastScore"
    }

    // MARK: - Number formatting helper

    /// Formatted as "12,450" / "1,234,567" with thousands separators.
    /// Used by `bestScoreDisplay`; exposed publicly so HUDs can format
    /// non-best scores the same way.
    public static func formatNumber(_ n: Int) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        return f.string(from: NSNumber(value: n)) ?? "\(n)"
    }
}
// END mChatAI macOS Component: effects.high-score-manager
