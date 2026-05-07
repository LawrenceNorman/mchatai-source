// BEGIN mChatAI macOS Component: effects.hint-pulse (components/effects/HintPulse.swift)
//
// HintPulse — idle-aware hint glow for tile games (match-3, sudoku, mahjong,
// solitaire, any swap/select-puzzle). After idleSeconds of player
// inactivity, surface a hint by toggling a glow on a small set of cells.
// Cancel on next interaction. Manual `now()` triggers an immediate hint
// that auto-fades after holdSeconds.
//
// SwiftUI port of the web Lego of the same name. Where the web version
// toggles a `.hint` CSS class on cells looked up via selectorFor, the
// SwiftUI version exposes an @Observable controller that the View binds
// `.hintPulse(active:)` to per-cell.
//
// Wisdom rules:
//   game-idle-hint-pulse-macos
//   mac-028 (anim-feedback on every event)
//
// Why a Lego: every tile puzzle reinvents this and gets 1-3 of the corner
// cases wrong (forgetting to cancel on tap, leaking timers across
// game-over, flashing on every render). One audited helper avoids that.
//
// Usage:
//
//   final class GameVM: ObservableObject {
//       @Published var board: Board
//       let hints = HintPulseController(idleSeconds: 6, holdSeconds: 2.4) { vm in
//           vm.findAnyValidSwap()    // returns [BoardCoord] | []
//       }
//       func handleMove() {
//           // ... apply move ...
//           hints.schedule(self)     // restart idle countdown
//       }
//       func tappedHintButton() {
//           hints.now(self)
//       }
//       func findAnyValidSwap() -> [BoardCoord] { ... }
//   }
//
//   struct CellView: View {
//       @ObservedObject var vm: GameVM
//       let coord: BoardCoord
//       var body: some View {
//           CandyShape(...)
//               .hintPulse(active: vm.hints.isHinting(coord))
//       }
//   }
//
import SwiftUI
import Combine

@available(macOS 26.0, *)
@MainActor
public final class HintPulseController<Owner: AnyObject, Coord: Hashable & Sendable>: ObservableObject {
    /// Cells currently being highlighted as a hint. Bind View glow to
    /// `cells.contains(coord)` via the `.hintPulse(active:)` modifier.
    @Published public private(set) var cells: Set<Coord> = []

    public let idleSeconds: TimeInterval
    public let holdSeconds: TimeInterval
    private let findHint: (Owner) -> [Coord]

    private var idleTask: Task<Void, Never>?
    private var holdTask: Task<Void, Never>?

    public init(idleSeconds: TimeInterval = 6.0,
                holdSeconds: TimeInterval = 2.4,
                findHint: @escaping (Owner) -> [Coord]) {
        self.idleSeconds = idleSeconds
        self.holdSeconds = holdSeconds
        self.findHint = findHint
    }

    /// Restart the idle countdown. Call this after a successful move.
    public func schedule(_ owner: Owner) {
        cancel()
        idleTask = Task { [weak self, weak owner] in
            try? await Task.sleep(nanoseconds: UInt64((self?.idleSeconds ?? 6.0) * 1_000_000_000))
            guard !Task.isCancelled, let self, let owner else { return }
            self.showFound(owner: owner, autoFade: false)
        }
    }

    /// Cancel any pending idle hint and clear any visible glow.
    public func cancel() {
        idleTask?.cancel(); idleTask = nil
        holdTask?.cancel(); holdTask = nil
        cells = []
    }

    /// Show a hint immediately. Auto-fades after holdSeconds.
    public func now(_ owner: Owner, hold: TimeInterval? = nil) {
        cancel()
        showFound(owner: owner, autoFade: true, holdOverride: hold)
    }

    /// Convenience for `View.hintPulse(active:)`.
    public func isHinting(_ coord: Coord) -> Bool {
        cells.contains(coord)
    }

    /// Tear down all timers + glow; safe to call multiple times. Call from
    /// .onDisappear or when the game ends.
    public func dispose() {
        cancel()
    }

    private func showFound(owner: Owner, autoFade: Bool, holdOverride: TimeInterval? = nil) {
        let found = findHint(owner)
        guard !found.isEmpty else { return }
        cells = Set(found)
        if autoFade {
            let hold = holdOverride ?? holdSeconds
            holdTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: UInt64(hold * 1_000_000_000))
                guard !Task.isCancelled else { return }
                await MainActor.run { self?.cancel() }
            }
        }
    }
}

@available(macOS 26.0, *)
public struct HintPulseModifier: ViewModifier {
    let active: Bool

    @State private var pulse = false

    public func body(content: Content) -> some View {
        content
            .scaleEffect(active && pulse ? 1.12 : 1.0)
            .shadow(color: active ? .yellow.opacity(0.85) : .clear,
                    radius: active && pulse ? 16 : 0)
            .shadow(color: active ? .white.opacity(0.85) : .clear,
                    radius: active && pulse ? 10 : 0)
            .animation(active
                ? .easeInOut(duration: 1.1).repeatForever(autoreverses: true)
                : .default,
                value: pulse && active)
            .onChange(of: active) { _, on in
                pulse = on
            }
            .onAppear { if active { pulse = true } }
    }
}

@available(macOS 26.0, *)
public extension View {
    /// Apply an idle-hint pulse glow when `active == true`. Bind from
    /// `HintPulseController.isHinting(coord)` per cell.
    func hintPulse(active: Bool) -> some View {
        modifier(HintPulseModifier(active: active))
    }
}
// END mChatAI macOS Component: effects.hint-pulse
