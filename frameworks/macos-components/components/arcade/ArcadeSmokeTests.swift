// BEGIN mChatAI macOS Component: arcade.smoke-tests (components/arcade/ArcadeSmokeTests.swift)
import Foundation

/// Self-contained smoke-test surface for any arcade game (pong, breakout,
/// asteroids, pacman, joust, marble-madness). Validates that the canonical
/// arcade.core types instantiate cleanly. The Pacman-specific maze
/// connectivity test is now in `arcade.smoke-tests-pacman` so this stays
/// usable for non-grid recipes (recipe.arcade-pong, recipe.spritekit-physics)
/// without dragging in the gridpuzzle.core dependency.
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
}
// END mChatAI macOS Component: arcade.smoke-tests
