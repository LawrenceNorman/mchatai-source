// BEGIN mChatAI macOS Component: effects.level-manager (components/effects/LevelManager.swift)
import Foundation
import SwiftUI

/// Game-flavor level / progression manager. Encapsulates the math and state
/// for "advance to the next level when target hit" — a pattern reinvented
/// (badly) in nearly every progression-flavored game.
///
/// Why this exists: every match-3 / arcade / puzzle game needs:
///   - Current level number
///   - Target for THIS level (score / time / count / etc.)
///   - Resource budget for THIS level (moves remaining / lives / time limit)
///   - Difficulty bumps as levels rise (palette grows, spawn rate up, etc.)
///   - Persistence across app launches
///   - Level-up moment (banner, SFX, intensity bump)
///
/// Without a shared component, every game gets ~3 of those right and skips
/// the others. LevelManager provides the curve, the state, the persistence,
/// and a hook for the level-up celebration.
///
/// Quick start (in a SwiftUI View):
///   ```
///   @StateObject private var levels = LevelManager(
///       gameID: "match3",
///       baseTarget: 1500,
///       baseMovesAllowed: 30
///   )
///   // ...in body...
///   Text("Level \(levels.currentLevel)")
///   Text("\(score) / \(levels.currentTarget)")
///   // ...when score crosses target...
///   if score >= levels.currentTarget && !levels.celebratingLevelUp {
///       levels.advance()  // animates banner, plays SFX, bumps difficulty
///   }
///   ```
///
/// Difficulty curves (LevelCurve enum):
///   - .casual       → target 1.5× per level (fast ramp, easy completion)
///   - .standard     → target 1.4× per level (validated default)
///   - .hardcore     → target 1.3× per level (slow ramp, longer engagement)
///   - .accelerating → target 1.3× early, climbs to 1.6× by L20+
///   - .custom(closure) → fully custom progression
@available(macOS 12.0, *)
@MainActor
public final class LevelManager: ObservableObject {
    /// Stable identifier for this game. Used as the UserDefaults key prefix
    /// so multiple games on the same machine don't clobber each other's
    /// progression state. e.g. "match3", "asteroids", "minesweeper".
    public let gameID: String

    /// L1 target score / count / etc. The curve scales from this base.
    public let baseTarget: Int

    /// L1 resource budget (moves, lives, time-limit-in-seconds). The curve
    /// optionally tightens this as levels rise (default: stays constant).
    public let baseMovesAllowed: Int

    /// Difficulty curve. See LevelCurve enum for presets.
    public let curve: LevelCurve

    /// Optional hard cap on levels. Defaults to 99 — beyond that, the curve
    /// keeps growing but most games cap visible level number to keep the
    /// HUD readable.
    public let maxLevel: Int

    /// Current level number (1-indexed).
    @Published public private(set) var currentLevel: Int

    /// Brief celebration window after `advance()` — the View should react
    /// to this for the level-up banner / sound / 3s intensity bump.
    @Published public private(set) var celebratingLevelUp: Bool = false

    /// Animation knob used by the View during the celebration window.
    /// 0.0 idle → 1.0 peak (~middle of the celebration). Driven internally
    /// by `advance()`. View binds animations / scales to this.
    @Published public private(set) var celebrationProgress: CGFloat = 0

    public init(
        gameID: String,
        baseTarget: Int,
        baseMovesAllowed: Int = 30,
        curve: LevelCurve = .standard,
        maxLevel: Int = 99
    ) {
        self.gameID = gameID
        self.baseTarget = baseTarget
        self.baseMovesAllowed = baseMovesAllowed
        self.curve = curve
        self.maxLevel = maxLevel
        // Restore last level from UserDefaults — players resume where they
        // left off across app launches. New install starts at L1.
        let savedLevel = UserDefaults.standard.integer(forKey: Self.levelKey(gameID))
        self.currentLevel = max(1, min(maxLevel, savedLevel == 0 ? 1 : savedLevel))
    }

    // MARK: - Targets and budgets per level

    /// Target score / count for the CURRENT level.
    public var currentTarget: Int {
        target(forLevel: currentLevel)
    }

    /// Resource budget for the CURRENT level.
    public var currentMovesAllowed: Int {
        movesAllowed(forLevel: currentLevel)
    }

    /// Progress toward the current target, 0.0–1.0.
    public func progressFraction(currentScore: Int) -> Double {
        guard currentTarget > 0 else { return 0 }
        return min(1.0, max(0, Double(currentScore) / Double(currentTarget)))
    }

    /// Target for any level (lookup helper for UI hints — "next level needs
    /// X" before user actually advances).
    public func target(forLevel level: Int) -> Int {
        let l = max(1, min(maxLevel, level))
        return Int(Double(baseTarget) * curve.targetMultiplier(level: l).rounded() + 0.5)
    }

    /// Moves budget for any level. Default curves keep this constant; only
    /// .accelerating tightens it.
    public func movesAllowed(forLevel level: Int) -> Int {
        let l = max(1, min(maxLevel, level))
        return max(10, Int(Double(baseMovesAllowed) * curve.movesMultiplier(level: l)))
    }

    // MARK: - Difficulty knobs (read by the View to tune palette / spawn rate / animation intensity)

    /// Suggested palette size for tile-based games at the current level.
    /// Base = 5 colors at L1, grows by +1 every 5 levels, capped at 8.
    /// (Match-3 with 8 colors is already very hard — beyond 8 plays poorly.)
    public var suggestedPaletteSize: Int {
        min(8, 5 + (currentLevel - 1) / 5)
    }

    /// Suggested AnimationIntensity preset name at the current level.
    /// L1–L4 = "subtle", L5–L9 = "standard", L10+ = "punchy".
    /// View should map this string to its actual AnimationIntensity preset.
    public var suggestedAnimationIntensity: String {
        switch currentLevel {
        case ..<5:  return "subtle"
        case ..<10: return "standard"
        default:    return "punchy"
        }
    }

    /// Suggested spawn-rate multiplier for arcade games — enemies arrive
    /// faster as levels rise. Capped at 3.0× at L20+.
    public var suggestedSpawnRateMultiplier: Double {
        min(3.0, 1.0 + Double(currentLevel - 1) * 0.10)
    }

    // MARK: - Advance / reset

    /// Call when the player has met the current target. Bumps level,
    /// persists, fires the celebration window.
    public func advance() {
        guard currentLevel < maxLevel else {
            // Already at cap — celebrate "max level" but don't bump.
            triggerCelebration()
            return
        }
        currentLevel += 1
        UserDefaults.standard.set(currentLevel, forKey: Self.levelKey(gameID))
        triggerCelebration()
    }

    /// Restart from L1. Clears persistence too. Use sparingly — most games
    /// preserve progression across "restart this level" actions.
    public func reset() {
        currentLevel = 1
        UserDefaults.standard.set(1, forKey: Self.levelKey(gameID))
    }

    /// Replay current level (e.g. after running out of moves). Does NOT
    /// decrement the level — players keep their progress, just retry.
    public func replayCurrentLevel() {
        // Intentionally a no-op on persistence; consumers reset their
        // score/moves locally and call this to signal "stayed at the
        // same level." Useful as a doc-anchor for the rule "never auto-
        // demote on failure."
    }

    // MARK: - Celebration window

    private func triggerCelebration() {
        celebratingLevelUp = true
        celebrationProgress = 0
        // 3-second arc: 0 → 1 over the first 0.5s, plateau 0.5s, 1 → 0
        // over the last 2s (matches the recommended banner-flourish timing).
        Task { @MainActor in
            await ramp(to: 1.0, duration: 0.5)
            try? await Task.sleep(nanoseconds: 500_000_000)
            await ramp(to: 0.0, duration: 2.0)
            celebratingLevelUp = false
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

    private static func levelKey(_ gameID: String) -> String {
        "LevelManager.\(gameID).currentLevel"
    }
}

// MARK: - LevelCurve

/// Difficulty progression curves. Choose by game pace.
@available(macOS 12.0, *)
public enum LevelCurve: Sendable {
    /// Casual / kid-friendly: target × 1.5 per level. Fast ramp, players
    /// reach high levels quickly. Good for short play sessions.
    case casual

    /// Validated default. Target × 1.4 per level. Balanced ramp.
    case standard

    /// Hardcore / endurance: target × 1.3 per level. Slow ramp, levels
    /// stay reachable for a long time. Good for "infinite" puzzle games.
    case hardcore

    /// Starts gentle (× 1.3 early), accelerates (× 1.6 by L20+). For games
    /// that want easy onboarding then a real challenge.
    case accelerating

    /// Fully custom. Caller provides target multiplier closure.
    /// `targetMultiplier(level)` is the multiplier ON baseTarget for that level.
    /// L1 should return 1.0; subsequent levels should grow.
    case custom(targetMultiplier: @Sendable (Int) -> Double, movesMultiplier: @Sendable (Int) -> Double)

    public func targetMultiplier(level: Int) -> Double {
        switch self {
        case .casual:        return pow(1.5, Double(level - 1))
        case .standard:      return pow(1.4, Double(level - 1))
        case .hardcore:      return pow(1.3, Double(level - 1))
        case .accelerating:
            // Smooth interpolation: ramp from 1.3× → 1.6× as level → 20+
            let t = min(1.0, Double(level - 1) / 19.0)
            let multiplier = 1.3 + (1.6 - 1.3) * t
            return pow(multiplier, Double(level - 1))
        case .custom(let target, _):
            return target(level)
        }
    }

    public func movesMultiplier(level: Int) -> Double {
        switch self {
        case .casual, .standard, .hardcore:
            // Default: moves stay constant per level — score target rises,
            // budget doesn't tighten. Players should feel the difficulty
            // through the target, not through reduced budget.
            return 1.0
        case .accelerating:
            // Tighten budget by 2% per level, capped at 50% (level 25+).
            return max(0.5, 1.0 - 0.02 * Double(level - 1))
        case .custom(_, let moves):
            return moves(level)
        }
    }
}

// END mChatAI macOS Component: effects.level-manager
