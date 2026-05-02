// BEGIN mChatAI macOS Component: arcade.smoke-tests (components/arcade/ArcadeSmokeTests.swift)
import Foundation

enum ArcadeSmokeTests {
    static func launchReport() -> String {
        var asteroids = AsteroidsEngine()
        asteroids.fire()
        asteroids.update(dt: 1.0 / 30.0, controls: ArcadeControls(up: true))

        var pong = PongEngine()
        pong.update(dt: 1.0 / 30.0, leftDirection: 1)

        var adventure = GridAdventureEngine.adventureCastleMap()
        adventure.moveHero(.right)

        var towerDefense = TowerDefenseEngine()
        _ = towerDefense.placeTower(at: PuzzlePoint(row: 3, col: 3))
        towerDefense.startWave(count: 2)
        towerDefense.update(dt: 0.5)

        return [
            "[ArcadeSmoke] asteroids rocks=\(asteroids.rocks.count) shots=\(asteroids.shots.count)",
            "[ArcadeSmoke] pong score=\(pong.leftScore)-\(pong.rightScore)",
            "[ArcadeSmoke] adventure score=\(adventure.score) lives=\(adventure.lives)",
            "[ArcadeSmoke] tower wave=\(towerDefense.wave) enemies=\(towerDefense.enemies.count)"
        ].joined(separator: "\n")
    }

    static func printLaunchReport() {
        print(launchReport())
    }
}
// END mChatAI macOS Component: arcade.smoke-tests
