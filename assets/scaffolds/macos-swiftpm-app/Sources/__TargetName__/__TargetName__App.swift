// <TargetName>App.swift — macOS SwiftPM app entry point.
//
// Generator: rename this file + its enclosing directory to match the chosen
// PascalCase target name. e.g. for "Zombie Tower Defense":
//   Sources/__TargetName__/__TargetName__App.swift → Sources/ZombieTowerDefense/ZombieTowerDefenseApp.swift
//
// The three patterns below are LOAD-BEARING — do not delete:
//   1. setActivationPolicy(.regular)        — gives the app a Dock tile
//   2. activate(ignoringOtherApps: true)    — brings the window forward
//   3. promoteWindowWhenReady()             — fires after the runloop has the
//                                             window object so we can promote
//                                             it to .floating and back, which
//                                             forces the WindowServer to draw
//                                             it. Without this, freshly built
//                                             SwiftUI macOS apps frequently
//                                             ship a window that exists in
//                                             memory but never appears on
//                                             screen — mac-001 in the
//                                             macos-app wisdom pack covers
//                                             this in detail.

import SwiftUI
import AppKit

@main
struct <TargetName>App: App {
    init() {
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
        print("[<TargetName>] launched — window should be visible")
        promoteWindowWhenReady()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .windowResizability(.contentSize)
    }

    /// Workaround for the "built fine but no window visible" failure mode.
    /// SwiftUI on macOS sometimes creates the NSWindow before the AppKit
    /// runloop is in a state where it will draw it — particularly for apps
    /// launched from `swift run` or directly from the .build/ output. We
    /// poll briefly for the first window, then flip its level twice
    /// (.floating → .normal) to force a redraw + bring it to the front.
    /// Bails out cleanly if no window appears within ~3s so we never block.
    private func promoteWindowWhenReady() {
        var attempts = 0
        let maxAttempts = 30  // 30 × 100ms = 3 seconds
        Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { timer in
            attempts += 1
            if let window = NSApplication.shared.windows.first {
                window.level = .floating
                window.makeKeyAndOrderFront(nil)
                NSApplication.shared.activate(ignoringOtherApps: true)
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                    window.level = .normal
                }
                timer.invalidate()
            } else if attempts >= maxAttempts {
                timer.invalidate()
            }
        }
    }
}
