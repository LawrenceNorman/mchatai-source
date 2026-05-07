// BEGIN mChatAI macOS Component: effects.spawn-drop (components/effects/SpawnDrop.swift)
//
// SpawnDrop — entry & exit micro-animations for tiles in any grid game.
// SwiftUI port of the web Lego of the same name. Two states cover the
// "this tile just appeared" and "this tile is being destroyed" beats. Used
// by match-3 (refill rows), mahjong (deal), solitaire (placement), gem
// roguelikes (orb spawn). Most tile games hand-roll these and get the
// timing wrong; this Lego picks one canonical curve (spring overshoot ≈
// cubic-bezier(0.34, 1.56, 0.64, 1)) so every tile game looks juicy.
//
// Wisdom rules:
//   anim-squash-stretch-falling-landing
//   anim-bulge-shrink-not-flat-fade
//   mac-028 (anim-feedback on every event)
//
// Usage A — entry animation only, when a tile first appears in the view:
//
//   ForEach(tiles) { tile in
//       TileView(tile: tile)
//           .spawnDrop()                    // animates on first appear
//   }
//
// Usage B — explicit exit animation before remove:
//
//   if let tile = visibleTile {
//       TileView(tile: tile)
//           .spawnDrop(popping: tile.popping)  // bulge+rotate+shrink when popping=true
//   }
//
// Usage C — combined with Pop overlay for full clear-feedback chain:
//
//   TileView(tile: tile)
//       .spawnDrop(popping: tile.popping)
//       .popBurst(trigger: tile.clearedAt)
//
import SwiftUI

@available(macOS 26.0, *)
public struct SpawnDropModifier: ViewModifier {
    let popping: Bool
    let popDuration: Double
    let spawnDuration: Double

    @State private var hasAppeared = false
    @State private var spawnScale: CGFloat = 0.2
    @State private var spawnOpacity: Double = 0.0
    @State private var popScale: CGFloat = 1.0
    @State private var popRotation: Double = 0.0
    @State private var popOpacity: Double = 1.0
    @State private var popPhase: Int = 0  // 0 = idle, 1 = bulging, 2 = shrinking

    public func body(content: Content) -> some View {
        content
            .scaleEffect(currentScale)
            .rotationEffect(.degrees(popRotation))
            .opacity(currentOpacity)
            .onAppear {
                guard !hasAppeared else { return }
                hasAppeared = true
                // Spring overshoot — match the cubic-bezier(0.34, 1.56, 0.64, 1).
                // SwiftUI .spring(response: 0.35, dampingFraction: 0.55) is the
                // closest stock translation; tuned to hit ~scale 1.12 at 60% then settle.
                withAnimation(.spring(response: 0.35, dampingFraction: 0.55)) {
                    spawnScale = 1.0
                    spawnOpacity = 1.0
                }
            }
            .onChange(of: popping) { _, isPopping in
                guard isPopping, popPhase == 0 else { return }
                runPop()
            }
    }

    private var currentScale: CGFloat {
        if popPhase > 0 { return popScale }
        return spawnScale
    }
    private var currentOpacity: Double {
        if popPhase > 0 { return popOpacity }
        return spawnOpacity
    }

    private func runPop() {
        popPhase = 1
        // Phase 1 — bulge + rotate (50% of duration)
        withAnimation(.easeIn(duration: popDuration * 0.5)) {
            popScale = 1.35
            popRotation = 8.0
            popOpacity = 0.95
        }
        // Phase 2 — shrink to zero
        DispatchQueue.main.asyncAfter(deadline: .now() + popDuration * 0.5) {
            popPhase = 2
            withAnimation(.easeIn(duration: popDuration * 0.5)) {
                popScale = 0.0
                popOpacity = 0.0
            }
        }
    }
}

@available(macOS 26.0, *)
public extension View {
    /// Apply spawn (entry) + pop (exit) animations. The view animates in
    /// from scale 0.2 with a spring overshoot on first appear. When
    /// `popping` flips to true, the view bulges+rotates then shrinks to 0.
    /// Caller is responsible for removing the view from the hierarchy
    /// after the pop completes.
    func spawnDrop(popping: Bool = false,
                   popDuration: Double = 0.28,
                   spawnDuration: Double = 0.36) -> some View {
        modifier(SpawnDropModifier(popping: popping,
                                   popDuration: popDuration,
                                   spawnDuration: spawnDuration))
    }
}
// END mChatAI macOS Component: effects.spawn-drop
