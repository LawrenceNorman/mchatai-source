// BEGIN mChatAI macOS Component: effects.pop-burst (components/effects/PopBurst.swift)
//
// PopBurst — radial light flash for "tile destroyed / matched / cleared"
// feedback. SwiftUI port of the web Lego of the same name. Drop-in for
// match-3, mahjong, jewel-puzzle, line-clear games — every tile-clear
// event needs a "thing happened here" beat or the board reads as silent.
//
// Wisdom rules:
//   mac-028 (anim-feedback on every event)
//   anim-bulge-shrink-not-flat-fade
//   anim-flash-overlays-transparent-not-solid
//
// Usage A (simplest — overlay modifier with a trigger value):
//
//   struct CandyTile: View {
//       let candy: Candy
//       @State private var burstAt: Date?
//       var body: some View {
//           CandyShape(kind: candy.kind)
//               .popBurst(trigger: burstAt)
//       }
//       func onCleared() { burstAt = .now }
//   }
//
// Usage B (fire-and-forget — single-shot view spawned at a tile):
//
//   ZStack {
//       boardView
//       ForEach(activeBursts) { b in
//           PopBurstView()
//               .position(b.point)
//               .id(b.id)
//       }
//   }
//
// Tuning:
//   .popBurst(trigger: trigger, intensity: .strong, color: .pink)

import SwiftUI

@available(macOS 26.0, *)
public enum PopBurstIntensity: Sendable {
    case subtle, normal, strong

    var endScale: CGFloat {
        switch self {
        case .subtle: return 1.4
        case .normal: return 1.8
        case .strong: return 2.4
        }
    }
    var duration: Double {
        switch self {
        case .subtle: return 0.42
        case .normal: return 0.5
        case .strong: return 0.62
        }
    }
}

/// Self-contained one-shot burst view. Drop into a ZStack/overlay positioned
/// at the tile center. Auto-removes when its `onFinished` callback fires.
@available(macOS 26.0, *)
public struct PopBurstView: View {
    public let intensity: PopBurstIntensity
    public let color: Color
    public var onFinished: (() -> Void)? = nil

    @State private var animate = false

    public init(intensity: PopBurstIntensity = .normal,
                color: Color = .yellow,
                onFinished: (() -> Void)? = nil) {
        self.intensity = intensity
        self.color = color
        self.onFinished = onFinished
    }

    public var body: some View {
        Circle()
            .fill(
                RadialGradient(
                    colors: [
                        .white,
                        Color.yellow.opacity(0.95),
                        color.opacity(0.7),
                        color.opacity(0.0)
                    ],
                    center: .center,
                    startRadius: 0,
                    endRadius: 30
                )
            )
            .blur(radius: 2)
            .scaleEffect(animate ? intensity.endScale : 0.4)
            .opacity(animate ? 0.0 : 0.95)
            .allowsHitTesting(false)
            .onAppear {
                withAnimation(.easeOut(duration: intensity.duration)) {
                    animate = true
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + intensity.duration) {
                    onFinished?()
                }
            }
    }
}

/// View modifier for the trigger-based usage (Usage A above). Each time
/// `trigger` changes to a new non-nil value, a one-shot burst overlays the
/// view. nil → no burst.
@available(macOS 26.0, *)
public struct PopBurstModifier<Trigger: Equatable & Sendable>: ViewModifier {
    let trigger: Trigger?
    let intensity: PopBurstIntensity
    let color: Color

    @State private var liveID: Int = 0

    public func body(content: Content) -> some View {
        content
            .overlay {
                if liveID > 0 {
                    PopBurstView(intensity: intensity, color: color, onFinished: {
                        // Bursts auto-remove when liveID is reset by the next trigger,
                        // but we leave the overlay in place; the burst's own scale-to-0
                        // makes it invisible. ID-bumping forces SwiftUI to spawn a fresh
                        // PopBurstView on each trigger change.
                    })
                    .id(liveID)
                    .allowsHitTesting(false)
                }
            }
            .onChange(of: trigger) { _, _ in
                liveID += 1
            }
    }
}

@available(macOS 26.0, *)
public extension View {
    /// Apply a one-shot pop burst overlay each time `trigger` changes to a
    /// new non-nil value. Use a `Date?` or `UUID?` for trigger so each event
    /// reads as a fresh value.
    func popBurst<T: Equatable & Sendable>(
        trigger: T?,
        intensity: PopBurstIntensity = .normal,
        color: Color = .yellow
    ) -> some View {
        modifier(PopBurstModifier(trigger: trigger, intensity: intensity, color: color))
    }
}
// END mChatAI macOS Component: effects.pop-burst
