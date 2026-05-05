// BEGIN mChatAI macOS Component: effects.animation-intensity (components/effects/AnimationIntensity.swift)
import Foundation
import CoreGraphics

/// Game-flavor animation tuning struct. Composes the multipliers / amounts
/// / durations a game uses for: tile pop (bulge before clear), tile clear
/// (shrink after clear), tile fall (collapse spring), tile land (squash on
/// landing), and per-event overlay flashes (sparkle / burst / lightning).
///
/// Why this exists: every reference app in macos-components uses the same
/// underlying animation primitives (squash-stretch, bulge-shrink, spring
/// collapse, transparent overlay flashes). Without a shared knob struct,
/// tuning means hunting through the View for magic numbers — or copying
/// values from one game and forgetting to scale them for another. With a
/// shared struct, a generator picks `.subtle` / `.standard` / `.punchy`
/// based on game pace and every effect scales together.
///
/// Pace mapping (informational, not enforced):
///   - puzzle / word / utility   → .subtle  (animations are punctuation, not the show)
///   - match-3 / minesweeper     → .standard (animations sell mechanics, modest flair)
///   - arcade / shoot-em-up      → .punchy   (animations ARE the feedback loop)
///   - kids / casual             → .punchy
public struct AnimationIntensity: Equatable, Sendable {
    // MARK: - Squash / stretch (volume-preserving deformation)
    //
    // bulgeAmount: how much a doomed tile inflates before clearing (0.25 = 1.25×).
    // squashAmount: how flat a landed tile gets (0.18 = sx 1.18, sy 0.86).
    // fallStretch: how stretched a falling tile is mid-fall (0.12 = sx 0.92, sy 1.12).
    public var bulgeAmount: CGFloat = 0.25
    public var squashAmount: CGFloat = 0.18
    public var fallStretch: CGFloat = 0.12

    // MARK: - Animation timings (seconds)
    //
    // bulgeDuration: anticipation pop before clear.
    // shrinkDuration: follow-through fade after clear.
    // squashDuration: how long the landing-squash holds.
    public var bulgeDuration: Double = 0.080
    public var shrinkDuration: Double = 0.110
    public var squashDuration: Double = 0.130

    // MARK: - Collapse + landing spring
    public var fallSpringResponse: Double = 0.18
    public var fallSpringDamping: Double = 0.45
    public var landSpringResponse: Double = 0.20
    public var landSpringDamping: Double = 0.70

    // MARK: - Flash overlays
    //
    // flashScale: multiplier on overlay glyph size. Real Candy Crush flashes
    // are surprisingly modest — too big and they feel sticker-pasted, too
    // small and they don't read. 0.6 is the validated "tasteful" default.
    // flashOpacity: alpha for overlay glyphs/halos. 1.0 = opaque, 0.5 = half
    // transparent. Real production overlays land closer to 0.5–0.7 — they're
    // additive accents, not solid graphics.
    // flashHaloRadius: shadow radius around the glyph (the soft glow).
    public var flashScale: CGFloat = 0.6
    public var flashOpacity: CGFloat = 0.55
    public var flashHaloRadius: CGFloat = 18

    // MARK: - Optional secondary motion (rarely a win — see wisdom rule)
    //
    // enableNeighborJiggle: shake the IMMEDIATE neighbors of a 4/5-match.
    // Filed 2026-05-04: this defaults FALSE because radius/amplitude/phase
    // tuning rarely produces a localized feel — the bulge-shrink + slide +
    // landing-squash already sell the impact. Only flip true if you've
    // tested it doesn't read as "the whole board is vibrating."
    public var enableNeighborJiggle: Bool = false
    public var neighborJiggleAmount: CGFloat = 1.1
    public var neighborJiggleRadius: Int = 1

    public init() {}

    // MARK: - Presets

    /// Subtle: animations as light punctuation. For productivity-flavored
    /// puzzle apps where the animation should not steal focus from the
    /// puzzle itself (crossword, word ladder, sudoku, file utilities).
    public static let subtle = AnimationIntensity(
        bulgeAmount: 0.12, squashAmount: 0.08, fallStretch: 0.06,
        bulgeDuration: 0.06, shrinkDuration: 0.08, squashDuration: 0.10,
        fallSpringResponse: 0.22, fallSpringDamping: 0.85,
        landSpringResponse: 0.22, landSpringDamping: 0.85,
        flashScale: 0.4, flashOpacity: 0.35, flashHaloRadius: 10,
        enableNeighborJiggle: false
    )

    /// Standard: validated default. Reads as "polished" without overwhelming.
    /// Match-3, minesweeper, breakout, plinko, lights-out, threes-style,
    /// solitaire-flair, etc.
    public static let standard = AnimationIntensity()

    /// Punchy: arcade-action games. Animations land hard and reward the
    /// player. Asteroids, pacman, plants-vs-zombies, joust, snake-with-pickup-pop,
    /// space invaders, frogger, kids/casual game feel.
    public static let punchy = AnimationIntensity(
        bulgeAmount: 0.40, squashAmount: 0.30, fallStretch: 0.18,
        bulgeDuration: 0.10, shrinkDuration: 0.14, squashDuration: 0.18,
        fallSpringResponse: 0.16, fallSpringDamping: 0.40,
        landSpringResponse: 0.18, landSpringDamping: 0.55,
        flashScale: 0.85, flashOpacity: 0.75, flashHaloRadius: 28,
        enableNeighborJiggle: false
    )

    // MARK: - Memberwise init for presets
    public init(
        bulgeAmount: CGFloat,
        squashAmount: CGFloat,
        fallStretch: CGFloat,
        bulgeDuration: Double,
        shrinkDuration: Double,
        squashDuration: Double,
        fallSpringResponse: Double,
        fallSpringDamping: Double,
        landSpringResponse: Double,
        landSpringDamping: Double,
        flashScale: CGFloat,
        flashOpacity: CGFloat,
        flashHaloRadius: CGFloat,
        enableNeighborJiggle: Bool
    ) {
        self.bulgeAmount = bulgeAmount
        self.squashAmount = squashAmount
        self.fallStretch = fallStretch
        self.bulgeDuration = bulgeDuration
        self.shrinkDuration = shrinkDuration
        self.squashDuration = squashDuration
        self.fallSpringResponse = fallSpringResponse
        self.fallSpringDamping = fallSpringDamping
        self.landSpringResponse = landSpringResponse
        self.landSpringDamping = landSpringDamping
        self.flashScale = flashScale
        self.flashOpacity = flashOpacity
        self.flashHaloRadius = flashHaloRadius
        self.enableNeighborJiggle = enableNeighborJiggle
    }
}
// END mChatAI macOS Component: effects.animation-intensity
