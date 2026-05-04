// Example glue — adapt freely. Demonstrates the canonical wiring of
// SpriteKitPhysicsHelpers in a SpriteKit scene:
//
//   - physicsWorld.gravity = SKPhysicsHelpers.lunarGravity
//   - physicsWorld.contactDelegate = self  (composes SKPhysicsContactDelegate)
//   - lander body via SKPhysicsHelpers.makeRectangularBody (mac-017)
//   - ground/lava via SKPhysicsHelpers.makeStaticBody
//   - thrust via body.applyForce with magnitude SKPhysicsHelpers.lunarThrustForce (= 80)
//     (NOT a small guess like 22 — that bug bit shipped Lunar Lander 2026-05-04)
//   - nonisolated didBegin captures SKPhysicsHelpers.snapshot(of: contact)
//     before bouncing into Task { @MainActor in ... } (mac-019)
//   - SKArcadeCategory.player1 / .platform / .lava bitmasks
//
// This is a minimal Lunar-Lander-flavored reference. Real games can
// add fuel mechanics, terrain regen, rotation control, score multipliers,
// landing-pad detection, etc. on top — but the skeleton here is enough
// to ship via the deterministic golden-assembly path.

import SpriteKit

final class GameScene: SKScene, SKPhysicsContactDelegate {
    weak var model: GameModel?

    private var lander: SKShapeNode?
    private var thrusting = false
    private var lastUpdate: TimeInterval = 0

    override func didMove(to view: SKView) {
        backgroundColor = SKColor(red: 0.04, green: 0.06, blue: 0.12, alpha: 1.0)
        physicsWorld.gravity = SKPhysicsHelpers.lunarGravity
        physicsWorld.contactDelegate = self
        physicsBody = SKPhysicsHelpers.makeSceneBoundary(in: frame)
        startNewGame()
    }

    func startNewGame() {
        removeAllChildren()
        addGround()
        addLandingPad()
        addLander()
        thrusting = false
        lastUpdate = 0
    }

    private func addGround() {
        let groundHeight: CGFloat = 40
        let ground = SKShapeNode(rect: CGRect(x: 0, y: 0, width: size.width, height: groundHeight))
        ground.fillColor = SKColor(red: 0.15, green: 0.13, blue: 0.18, alpha: 1.0)
        ground.strokeColor = .clear
        ground.position = .zero
        ground.physicsBody = SKPhysicsHelpers.makeStaticBody(
            size: CGSize(width: size.width, height: groundHeight),
            categoryBitMask: SKArcadeCategory.lava,
            contactBitMask: SKArcadeCategory.player1
        )
        ground.physicsBody?.node?.position = CGPoint(x: size.width / 2, y: groundHeight / 2)
        addChild(ground)
    }

    private func addLandingPad() {
        let padWidth: CGFloat = 110
        let padHeight: CGFloat = 8
        let pad = SKShapeNode(rect: CGRect(x: -padWidth / 2, y: -padHeight / 2, width: padWidth, height: padHeight))
        pad.fillColor = SKColor.green
        pad.strokeColor = .clear
        pad.position = CGPoint(x: size.width * 0.7, y: 60)
        pad.physicsBody = SKPhysicsHelpers.makeStaticBody(
            size: CGSize(width: padWidth, height: padHeight),
            categoryBitMask: SKArcadeCategory.goal,
            contactBitMask: SKArcadeCategory.player1
        )
        addChild(pad)
    }

    private func addLander() {
        let body = SKShapeNode(rect: CGRect(x: -10, y: -14, width: 20, height: 28))
        body.fillColor = SKColor.white
        body.strokeColor = SKColor.cyan
        body.lineWidth = 2
        body.position = CGPoint(x: size.width * 0.2, y: size.height - 60)
        body.physicsBody = SKPhysicsHelpers.makeRectangularBody(
            size: CGSize(width: 20, height: 28),
            mass: 0.5,
            allowsRotation: true,
            categoryBitMask: SKArcadeCategory.player1,
            collisionBitMask: SKArcadeCategory.lava | SKArcadeCategory.goal | SKArcadeCategory.platform | SKArcadeCategory.wall,
            contactBitMask: SKArcadeCategory.lava | SKArcadeCategory.goal
        )
        body.physicsBody?.velocity = CGVector(dx: 12, dy: 0)
        addChild(body)
        lander = body
    }

    // MARK: - Input

    override func keyDown(with event: NSEvent) {
        switch event.keyCode {
        case 126: thrusting = true                    // up arrow
        case 123: rotateLander(by: 0.18)              // left arrow
        case 124: rotateLander(by: -0.18)             // right arrow
        default:  break
        }
    }

    override func keyUp(with event: NSEvent) {
        if event.keyCode == 126 { thrusting = false }
    }

    private func rotateLander(by delta: CGFloat) {
        guard let lander else { return }
        lander.zRotation += delta
    }

    // MARK: - Per-frame thrust

    override func update(_ currentTime: TimeInterval) {
        guard let lander, let body = lander.physicsBody, let model else { return }
        let dt = lastUpdate == 0 ? 0 : currentTime - lastUpdate
        lastUpdate = currentTime

        if thrusting && model.fuel > 0 {
            // mac-017 + recipe.spritekit-physics: use the lunarThrustForce
            // preset, NOT a guessed magnitude. At 80 / mass 0.5 = 160 pts/s²
            // upward, which beats lunar gravity (1.6 pts/s²) by 100×, leaving
            // generous margin even when the lander is heavily tilted.
            let mag = SKPhysicsHelpers.lunarThrustForce
            let fx = -sin(lander.zRotation) * mag
            let fy =  cos(lander.zRotation) * mag
            body.applyForce(CGVector(dx: fx, dy: fy))
            model.fuel = max(0, model.fuel - 5 * CGFloat(dt))
        }
    }

    // MARK: - Contact handling (mac-019 — snapshot before @MainActor hop)

    nonisolated func didBegin(_ contact: SKPhysicsContact) {
        // Capture the sendable bits BEFORE crossing the actor boundary.
        // SKPhysicsContact itself is task-isolated and Swift 6 strict
        // concurrency rejects sending it into the @MainActor closure.
        let snap = SKPhysicsHelpers.snapshot(of: contact)
        Task { @MainActor in
            self.handleContact(snap)
        }
    }

    @MainActor
    private func handleContact(_ snap: SKPhysicsContactSnapshot) {
        guard let model else { return }

        // Lander touched the goal pad — score + restart.
        if snap.nodes(matching: SKArcadeCategory.goal) != nil {
            model.score += 100
            // Brief pause then redeploy lander; not full game-over.
            run(.sequence([.wait(forDuration: 0.6), .run { [weak self] in self?.respawnLander() }]))
            return
        }

        // Lander touched the lava (ground) — lose a life.
        if snap.nodes(matching: SKArcadeCategory.lava) != nil {
            model.lives -= 1
            if model.lives <= 0 {
                model.reportGameOver(reason: "Crashed on the surface")
            } else {
                run(.sequence([.wait(forDuration: 0.6), .run { [weak self] in self?.respawnLander() }]))
            }
        }
    }

    private func respawnLander() {
        lander?.removeFromParent()
        lander = nil
        addLander()
    }
}
