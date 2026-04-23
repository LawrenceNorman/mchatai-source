// DesignTokenWatcher.swift — Phase DX.2f live token binding
//
// Drop this file into any generated macOS SwiftUI app that wants to respond
// to mChatAI+'s Design panel sliders in real time. No edits needed — the
// generator includes this file verbatim and the app picks up live token
// updates through a file-watcher on /tmp.
//
// How it works:
//   1. mChatAI+ writes a JSON snapshot to /tmp/mchatai-design-tokens/{appID}.json
//      whenever a Design-panel slider moves. The `{appID}` must match the
//      app's bundle identifier.
//   2. This file sets up a DispatchSource file-watcher on that path so the
//      app observes changes without polling.
//   3. On every write, the snapshot is decoded and pushed into a TokenBag
//      ObservableObject that SwiftUI views read via @Environment(\.designTokens).
//
// No dependencies beyond Foundation + SwiftUI. Works in sandboxed apps
// because /tmp is readable across App Sandbox containers without
// entitlements (it's world-readable by OS default).

import Foundation
import SwiftUI

// MARK: - Token model — must match the macOSApp tunable manifest ids.

public struct DesignTokens: Codable, Equatable {
    /// HSL hue (0–360) used to derive the app's accent colour. Maps to
    /// `tint-hue` in mchatai-source/wizard/tunable-schemas/macosapp.json.
    public var accentHue: Double = 210
    /// "compact" or "comfortable". Maps to `density`.
    public var density: String = "comfortable"
    /// "none", "sidebar", or "tab-bar". Maps to `sidebar-style`.
    /// Runtime changes to this value should be handled gracefully — a full
    /// re-layout is expected when the user drags between styles.
    public var sidebarStyle: String = "none"

    public init(accentHue: Double = 210, density: String = "comfortable", sidebarStyle: String = "none") {
        self.accentHue = accentHue
        self.density = density
        self.sidebarStyle = sidebarStyle
    }

    /// Convenience accessor for an SwiftUI `Color` derived from `accentHue`.
    public var accentColor: Color {
        Color(hue: accentHue / 360.0, saturation: 0.7, brightness: 0.85)
    }

    /// Convenience density-aware spacing (`tokens.spacing.medium`).
    public var spacing: Spacing {
        Spacing(
            small: density == "compact" ? 4 : 8,
            medium: density == "compact" ? 8 : 16,
            large: density == "compact" ? 16 : 24
        )
    }

    public struct Spacing: Equatable {
        public let small: CGFloat
        public let medium: CGFloat
        public let large: CGFloat
    }
}

// MARK: - Environment surface — views read via @Environment(\.designTokens).

private struct DesignTokensKey: EnvironmentKey {
    static let defaultValue = DesignTokens()
}

public extension EnvironmentValues {
    var designTokens: DesignTokens {
        get { self[DesignTokensKey.self] }
        set { self[DesignTokensKey.self] = newValue }
    }
}

// MARK: - Token bag — inject at WindowGroup root.

/// Observable container the file-watcher writes into. Views that read
/// `@Environment(\.designTokens)` will re-evaluate whenever the bag
/// publishes a change because the environment value is re-injected from
/// this `@Published` property on each View layout pass.
@MainActor
public final class TokenBag: ObservableObject {
    public static let shared = TokenBag()
    @Published public private(set) var tokens = DesignTokens()

    private var dispatchSource: DispatchSourceFileSystemObject?
    private var fileDescriptor: Int32 = -1
    private let queue = DispatchQueue(label: "com.mchatai.designtoken.watcher", qos: .utility)

    private init() {}

    /// Call once from your @main App's init — supply the app's bundle
    /// identifier so the watcher knows which snapshot to follow.
    public func start(appID: String) {
        stop()
        let snapshotURL = Self.snapshotURL(for: appID)
        // Seed from disk if the panel has already been dragged before launch.
        loadSnapshot(from: snapshotURL)

        // Watch the parent dir and react to the snapshot file appearing /
        // being replaced. Watching the file directly loses the source
        // when editors atomically swap it (DispatchSource is bound to the
        // original inode).
        let parentURL = snapshotURL.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: parentURL, withIntermediateDirectories: true)

        let fd = open(parentURL.path, O_EVTONLY)
        guard fd >= 0 else {
            print("[DesignTokenWatcher] could not open parent dir for watch: \(parentURL.path)")
            return
        }
        fileDescriptor = fd

        let src = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fd,
            eventMask: [.write, .rename, .attrib, .extend],
            queue: queue
        )
        src.setEventHandler { [weak self] in
            guard let self else { return }
            Task { @MainActor in
                self.loadSnapshot(from: snapshotURL)
            }
        }
        src.setCancelHandler { [weak self] in
            guard let self else { return }
            if self.fileDescriptor >= 0 {
                close(self.fileDescriptor)
                self.fileDescriptor = -1
            }
        }
        src.resume()
        dispatchSource = src
    }

    public func stop() {
        dispatchSource?.cancel()
        dispatchSource = nil
    }

    private func loadSnapshot(from url: URL) {
        guard let data = try? Data(contentsOf: url) else { return }
        guard let decoded = try? JSONDecoder().decode(DesignTokenSnapshot.self, from: data) else { return }
        let newTokens = decoded.toTokens()
        if newTokens != tokens {
            tokens = newTokens
        }
    }

    /// /tmp/mchatai-design-tokens/{appID}.json
    private static func snapshotURL(for appID: String) -> URL {
        URL(fileURLWithPath: "/tmp")
            .appendingPathComponent("mchatai-design-tokens")
            .appendingPathComponent("\(appID).json")
    }
}

// MARK: - Snapshot format written by mChatAI+.

/// Matches the JSON written by mChatAI+ Harness/DesignTokenSnapshotWriter.swift.
/// Values are strings to match the app-side `DesignBindingsStore` contract
/// (which stores all tunable values as strings regardless of kind).
private struct DesignTokenSnapshot: Codable {
    let tintHue: String?
    let density: String?
    let sidebarStyle: String?

    enum CodingKeys: String, CodingKey {
        case tintHue = "tint-hue"
        case density
        case sidebarStyle = "sidebar-style"
    }

    func toTokens() -> DesignTokens {
        var t = DesignTokens()
        if let h = tintHue, let d = Double(h) { t.accentHue = d }
        if let d = density { t.density = d }
        if let s = sidebarStyle { t.sidebarStyle = s }
        return t
    }
}

// MARK: - View modifier — one-line wiring for the @main App.

public extension View {
    /// Attach at the top of your WindowGroup to bind DesignTokens to the
    /// live file-watcher. The appID should be your bundle identifier so
    /// mChatAI+ writes the snapshot to the right file.
    ///
    /// Usage:
    ///   WindowGroup {
    ///       RootView().liveDesignTokens(appID: Bundle.main.bundleIdentifier ?? "app")
    ///   }
    func liveDesignTokens(appID: String) -> some View {
        modifier(LiveDesignTokensModifier(appID: appID))
    }
}

private struct LiveDesignTokensModifier: ViewModifier {
    let appID: String
    @StateObject private var bag = TokenBag.shared

    func body(content: Content) -> some View {
        content
            .environment(\.designTokens, bag.tokens)
            .task { TokenBag.shared.start(appID: appID) }
    }
}
