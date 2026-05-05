// BEGIN mChatAI macOS Component: arcade.smoke-tests (components/arcade/ArcadeSmokeTests.swift)
import Foundation

enum ArcadeSmokeTests {
    static func launchReport() -> String {
        let playfield = ArcadePlayfield(width: 900, height: 560)
        var body = ArcadeBody(position: playfield.center, velocity: ArcadeVector(x: 120, y: -80), radius: 12)
        body.integrate(dt: 1.0 / 30.0)
        body.wrap(in: playfield)
        let controls = ArcadeControls(up: true, fire: true)
        return [
            "[ArcadeSmoke] core body=(\(Int(body.position.x)),\(Int(body.position.y))) radius=\(Int(body.radius))",
            "[ArcadeSmoke] playfield=\(Int(playfield.width))x\(Int(playfield.height)) phase=\(ArcadePhase.playing.rawValue)",
            "[ArcadeSmoke] controls up=\(controls.up) fire=\(controls.fire)"
        ].joined(separator: "\n")
    }

    static func printLaunchReport() {
        let output = launchReport() + "\n"
        if let data = output.data(using: .utf8) {
            FileHandle.standardOutput.write(data)
        } else {
            print(launchReport())
        }
    }

    /// Print connectivity report directly to stdout (using FileHandle so
    /// it's not buffered behind SwiftUI's logging subsystem). Calls
    /// verifyPacmanLayoutsConnected and writes each line.
    @available(macOS 12.0, *)
    static func printPacmanConnectivityReport() {
        let lines = verifyPacmanLayoutsConnected()
        for line in lines {
            let s = line + "\n"
            if let data = s.data(using: .utf8) {
                FileHandle.standardOutput.write(data)
            }
        }
    }

    /// Verify that every Pacman maze layout (L1–L5) has all floor cells
    /// reachable from the hero spawn via BFS. Catches "unbroken inner
    /// ring" / "stranded fruit" / "isolated quadrant" bugs at build
    /// time. Filed 2026-05-05 after L3 v10 shipped with unbroken
    /// concentric rings — fruit + 53 cells were unreachable, user
    /// caught it on the first play. See wisdom rule
    /// game-tile-grid-bfs-connectivity-test.
    @available(macOS 12.0, *)
    static func verifyPacmanLayoutsConnected() -> [String] {
        let levels = (1...5).map { GridAdventureEngine.pacmanMapForLevel($0) }
        var results: [String] = []
        for (idx, engine) in levels.enumerated() {
            let levelNum = idx + 1
            // Collect all floor cells (anything that isn't .wall).
            var floor: Set<PuzzlePoint> = []
            for r in 0..<engine.map.rows {
                for c in 0..<engine.map.columns {
                    let p = PuzzlePoint(row: r, col: c)
                    if engine.map[p] != .wall { floor.insert(p) }
                }
            }
            guard let hero = engine.actors.first(where: { $0.kind == .hero })?.position else {
                results.append("[ArcadeSmoke] L\(levelNum) FAIL: no hero spawn")
                continue
            }
            // BFS from hero
            var visited: Set<PuzzlePoint> = [hero]
            var stack = [hero]
            while let p = stack.popLast() {
                for delta in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
                    let np = PuzzlePoint(row: p.row + delta.0, col: p.col + delta.1)
                    if floor.contains(np) && !visited.contains(np) {
                        visited.insert(np)
                        stack.append(np)
                    }
                }
            }
            let unreachable = floor.subtracting(visited).count
            let actorIssues: [String] = engine.actors.compactMap { actor -> String? in
                guard actor.kind == .fruit || actor.kind == .enemy || actor.kind == .powerPellet else { return nil }
                if !visited.contains(actor.position) {
                    return "\(actor.kind.rawValue)@(\(actor.position.row),\(actor.position.col))"
                }
                return nil
            }
            if unreachable == 0 && actorIssues.isEmpty {
                results.append("[ArcadeSmoke] L\(levelNum) OK: \(floor.count) floor cells all reachable")
            } else {
                results.append("[ArcadeSmoke] L\(levelNum) FAIL: \(unreachable) unreachable, isolated actors=\(actorIssues)")
            }
        }
        return results
    }
}
// END mChatAI macOS Component: arcade.smoke-tests
