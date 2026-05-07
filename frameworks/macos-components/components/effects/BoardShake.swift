// BEGIN mChatAI macOS Component: effects.board-shake (components/effects/BoardShake.swift)
//
// BoardShake — the universal "no-go / wrong answer / illegal move" feedback
// shake. SwiftUI port of the web Lego of the same name. Works on any
// container: a match-3 board (invalid swap), a password input (wrong code),
// a chess square (illegal move), a quiz button (wrong answer). Without this
// beat, players can't tell whether the input failed or the game is just slow.
//
// Wisdom rules:
//   mac-028 (anim-feedback on every event)
//
// Usage:
//
//   BoardView()
//       .boardShake(trigger: invalidSwapTrigger)
//
//   // Engine: when an invalid swap is detected, set invalidSwapTrigger = .now
//   // (or bump a counter). Each change drives one shake.
//
//   // Strong intensity (rotation included) for high-stakes failures:
//   .boardShake(trigger: failedTrigger, intensity: .strong)
//
import SwiftUI

@available(macOS 26.0, *)
public enum BoardShakeIntensity: Sendable {
    case subtle, normal, strong

    var amplitude: CGFloat {
        switch self {
        case .subtle: return 2.5
        case .normal: return 4.5
        case .strong: return 8.0
        }
    }
    var rotation: Double {
        switch self {
        case .subtle: return 0
        case .normal: return 0
        case .strong: return 1.0   // degrees
        }
    }
    var duration: Double {
        switch self {
        case .subtle: return 0.25
        case .normal: return 0.36
        case .strong: return 0.52
        }
    }
}

@available(macOS 26.0, *)
public struct BoardShakeModifier<Trigger: Equatable & Sendable>: ViewModifier {
    let trigger: Trigger?
    let intensity: BoardShakeIntensity

    @State private var phase: Int = 0
    @State private var offsetX: CGFloat = 0
    @State private var offsetY: CGFloat = 0
    @State private var rotation: Double = 0

    public func body(content: Content) -> some View {
        content
            .offset(x: offsetX, y: offsetY)
            .rotationEffect(.degrees(rotation))
            .onChange(of: trigger) { _, new in
                guard new != nil else { return }
                phase += 1
                runShake()
            }
    }

    private func runShake() {
        // Five-step shake sequence approximating the web @keyframes curve:
        //   0%   (0,0)         100%  (0,0)
        //   20%  (-A, +A/2)
        //   40%  (+A*1.1, -A/4)
        //   60%  (-A*0.7, +A/2)
        //   80%  (+A*0.7, 0)
        let A = intensity.amplitude
        let R = intensity.rotation
        let d = intensity.duration / 5.0
        let steps: [(CGFloat, CGFloat, Double)] = [
            (-A, A/2, -R),
            (A*1.1, -A/4, R),
            (-A*0.7, A/2, -R),
            (A*0.7, 0, R/2),
            (0, 0, 0),
        ]
        for (i, step) in steps.enumerated() {
            DispatchQueue.main.asyncAfter(deadline: .now() + d * Double(i)) {
                withAnimation(.easeInOut(duration: d)) {
                    offsetX = step.0
                    offsetY = step.1
                    rotation = step.2
                }
            }
        }
    }
}

@available(macOS 26.0, *)
public extension View {
    /// Apply a brief shake animation each time `trigger` changes. Use a
    /// `Date?` or counter Int as the trigger — each new value fires one
    /// shake. nil or unchanged values do nothing.
    func boardShake<T: Equatable & Sendable>(
        trigger: T?,
        intensity: BoardShakeIntensity = .normal
    ) -> some View {
        modifier(BoardShakeModifier(trigger: trigger, intensity: intensity))
    }
}
// END mChatAI macOS Component: effects.board-shake
