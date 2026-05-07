// BEGIN mChatAI macOS Component: effects.score-rise (components/effects/ScoreRise.swift)
//
// ScoreRise — the floating "+50" / "+100" / "★ COMBO" popup that rises
// above a tile as points are awarded. SwiftUI port of the web Lego of the
// same name. Universal positive feedback for any score event in any genre:
// tile games, breakout, shoot-em-ups, idle/clicker, even quiz games.
//
// Wisdom rules:
//   mac-028 (anim-feedback on every event)
//   score-format-with-thousands-separators (when score >= 1000)
//
// Usage A (per-tile inline, modifier-driven):
//
//   ScorePill(score: gameState.score)
//       .scoreRise(trigger: gameState.lastScoreDelta)
//
//   // In the engine: when score awards, set lastScoreDelta = "+50"
//   // (or any text). Each unique change spawns one rise.
//
// Usage B (board-level, multiple concurrent rises at different points):
//
//   ZStack {
//       boardView
//       ForEach(activeRises) { r in
//           ScoreRiseView(text: r.text, color: r.color)
//               .position(r.point)
//               .id(r.id)
//       }
//   }
//   // Drive activeRises from a [ScoreRiseEvent] array on your engine.
//
// Color tuning examples:
//   .scoreRise(trigger: ..., color: .pink)       // standard
//   .scoreRise(trigger: ..., color: .yellow)     // milestone
//   .scoreRise(trigger: ..., color: .cyan)       // combo
//
import SwiftUI

@available(macOS 26.0, *)
public struct ScoreRiseView: View {
    public let text: String
    public let color: Color
    public let fontSize: CGFloat
    public var onFinished: (() -> Void)? = nil

    @State private var animate = false

    public init(text: String,
                color: Color = .white,
                fontSize: CGFloat = 16,
                onFinished: (() -> Void)? = nil) {
        self.text = text
        self.color = color
        self.fontSize = fontSize
        self.onFinished = onFinished
    }

    public var body: some View {
        Text(text)
            .font(.system(size: fontSize, weight: .heavy, design: .rounded))
            .foregroundStyle(color)
            .shadow(color: .pink.opacity(0.85), radius: 8, x: 0, y: 0)
            .shadow(color: .black.opacity(0.85), radius: 0, x: 0, y: 1)
            .scaleEffect(animate ? 1.0 : 0.6)
            .offset(y: animate ? -42 : 0)
            .opacity(animate ? 0.0 : 1.0)
            .allowsHitTesting(false)
            .onAppear {
                // Phase 1: pop in (~20% of timeline)
                withAnimation(.easeOut(duration: 0.18)) {
                    animate = true
                }
                // Phase 2: rise + fade is implicit because all three modifiers
                // share the same trigger; the easeOut(0.18) also drives the
                // y-offset and opacity continuation here.
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.95) {
                    onFinished?()
                }
            }
    }
}

@available(macOS 26.0, *)
public struct ScoreRiseModifier<Trigger: Equatable & Sendable>: ViewModifier {
    let trigger: Trigger?
    let color: Color
    let fontSize: CGFloat
    let textProvider: (Trigger) -> String

    @State private var liveID: Int = 0
    @State private var liveText: String = ""

    public func body(content: Content) -> some View {
        content
            .overlay(alignment: .center) {
                if liveID > 0 {
                    ScoreRiseView(text: liveText, color: color, fontSize: fontSize)
                        .id(liveID)
                        .allowsHitTesting(false)
                }
            }
            .onChange(of: trigger) { _, new in
                guard let new else { return }
                liveText = textProvider(new)
                liveID += 1
            }
    }
}

@available(macOS 26.0, *)
public extension View {
    /// Apply a rising score popup overlay each time `trigger` changes to a
    /// new non-nil value. The trigger value itself becomes the popup text
    /// when it's a String; otherwise pass a `textProvider` to map it.
    func scoreRise(
        trigger: String?,
        color: Color = .white,
        fontSize: CGFloat = 16
    ) -> some View {
        modifier(ScoreRiseModifier(trigger: trigger, color: color, fontSize: fontSize, textProvider: { $0 }))
    }

    /// Generic variant: any Equatable trigger + a textProvider that turns
    /// it into the displayed string (e.g. an Int delta becoming "+50").
    func scoreRise<T: Equatable & Sendable>(
        trigger: T?,
        color: Color = .white,
        fontSize: CGFloat = 16,
        textProvider: @escaping (T) -> String
    ) -> some View {
        modifier(ScoreRiseModifier(trigger: trigger, color: color, fontSize: fontSize, textProvider: textProvider))
    }
}
// END mChatAI macOS Component: effects.score-rise
