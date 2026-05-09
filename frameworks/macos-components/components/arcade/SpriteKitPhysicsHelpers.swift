// BEGIN mChatAI macOS Component: arcade.spritekit-physics-helpers (components/arcade/SpriteKitPhysicsHelpers.swift)
//
// Canonical SpriteKit physics helpers for native macOS SpriteKit games (Joust, Asteroids,
// Lunar Lander, Marble Madness, anything that uses SKPhysicsBody + SKPhysicsContactDelegate).
//
// The patterns below avoid recurring LLM-emitted errors:
//   - mac-017: SKPhysicsBody(ellipseOf:) doesn't exist; use circleOfRadius/rectangleOf/polygonFrom
//   - mac-019: SKPhysicsContactDelegate.didBegin is nonisolated; capture sendable contact data
//              before crossing the @MainActor boundary
//
// Importing into your scene:
//   import SpriteKit
//   class MyGameScene: SKScene, SKPhysicsContactDelegate {
//       override func didMove(to view: SKView) {
//           physicsWorld.contactDelegate = self
//           physicsWorld.gravity = SKPhysicsHelpers.standardGravity
//       }
//       nonisolated func didBegin(_ contact: SKPhysicsContact) {
//           // Capture sendable data BEFORE the actor hop (mac-019).
//           let snapshot = SKPhysicsHelpers.snapshot(of: contact)
//           Task { @MainActor in self.handleContact(snapshot) }
//       }
//       @MainActor func handleContact(_ snap: SKPhysicsContactSnapshot) { /* ... */ }
//   }

import SpriteKit

enum SKPhysicsHelpers {
    /// Standard 2D arcade gravity (Earth-like, 600x500-window-friendly tuning).
    static let standardGravity = CGVector(dx: 0, dy: -9.8)

    /// Lighter gravity for "lunar" / floaty games.
    static let lunarGravity = CGVector(dx: 0, dy: -1.6)

    /// Game-tuned thrust force presets. SKPhysicsBody.applyForce uses Newtons
    /// integrated per simulation step, so `force / mass` = acceleration in pts/s².
    /// These presets assume default mass (0.5) and a 600-700 wide window.
    /// Filed 2026-05-04 after Lunar Lander shipped with mag=22 (too weak combined
    /// with rotation: when the lander tilts the y-component of thrust drops by
    /// cos(zRotation), so straight-line thrust must be much higher than minimum
    /// hover force to leave the user enough authority to recover from spins).
    /// Rule of thumb: thrustForce should provide >= 10× the y-acceleration of
    /// gravity so even a 70°-tilted lander still has 3.4× hover authority.
    static let lunarThrustForce: CGFloat = 80   // 80/0.5 = 160 pts/s² up vs 1.6 gravity = 100× hover force
    static let earthThrustForce: CGFloat = 200  // 200/0.5 = 400 pts/s² up vs 9.8 gravity = 40× hover force

    /// Make a circular body for round entities (knights, ghosts, pellets, marbles).
    /// CORRECT alternative to the hallucinated `SKPhysicsBody(ellipseOf:)` initializer.
    static func makeCircularBody(radius: CGFloat,
                                 mass: CGFloat = 0.5,
                                 friction: CGFloat = 0.16,
                                 restitution: CGFloat = 0.25,
                                 allowsRotation: Bool = false,
                                 categoryBitMask: UInt32 = 0,
                                 collisionBitMask: UInt32 = .max,
                                 contactBitMask: UInt32 = 0) -> SKPhysicsBody {
        let body = SKPhysicsBody(circleOfRadius: radius)
        body.mass = mass
        body.friction = friction
        body.restitution = restitution
        body.allowsRotation = allowsRotation
        body.linearDamping = 0.52
        body.usesPreciseCollisionDetection = true
        body.categoryBitMask = categoryBitMask
        body.collisionBitMask = collisionBitMask
        body.contactTestBitMask = contactBitMask
        return body
    }

    /// Make a rectangular body for boxy entities (bricks, platforms, ships, sprites with rect outlines).
    static func makeRectangularBody(size: CGSize,
                                    mass: CGFloat = 0.5,
                                    friction: CGFloat = 0.16,
                                    restitution: CGFloat = 0.25,
                                    allowsRotation: Bool = false,
                                    categoryBitMask: UInt32 = 0,
                                    collisionBitMask: UInt32 = .max,
                                    contactBitMask: UInt32 = 0) -> SKPhysicsBody {
        let body = SKPhysicsBody(rectangleOf: size)
        body.mass = mass
        body.friction = friction
        body.restitution = restitution
        body.allowsRotation = allowsRotation
        body.linearDamping = 0.52
        body.usesPreciseCollisionDetection = true
        body.categoryBitMask = categoryBitMask
        body.collisionBitMask = collisionBitMask
        body.contactTestBitMask = contactBitMask
        return body
    }

    /// Make an oval-shaped body via polygonFrom: + an ellipse path.
    /// Use ONLY when you specifically need an oval body (rare). Most game characters
    /// look fine with circular or rectangular bodies even if their visual is oval.
    static func makeOvalBody(size: CGSize) -> SKPhysicsBody {
        let path = CGMutablePath()
        path.addEllipse(in: CGRect(x: -size.width / 2,
                                   y: -size.height / 2,
                                   width: size.width,
                                   height: size.height))
        return SKPhysicsBody(polygonFrom: path)
    }

    /// Make a static "lava" / "wall" body — heavy, no movement, infinite mass.
    static func makeStaticBody(size: CGSize,
                               categoryBitMask: UInt32 = 0,
                               contactBitMask: UInt32 = 0) -> SKPhysicsBody {
        let body = SKPhysicsBody(rectangleOf: size)
        body.isDynamic = false
        body.affectedByGravity = false
        body.allowsRotation = false
        body.categoryBitMask = categoryBitMask
        body.contactTestBitMask = contactBitMask
        body.collisionBitMask = 0
        return body
    }

    /// Make an edge-loop boundary for the scene's playfield.
    static func makeSceneBoundary(in rect: CGRect) -> SKPhysicsBody {
        SKPhysicsBody(edgeLoopFrom: rect)
    }

    /// Snapshot the contact's sendable data so it can cross the @MainActor boundary safely.
    /// Per mac-019: SKPhysicsContact itself is task-isolated and sending it into a
    /// `Task { @MainActor in }` closure is rejected by Swift 6 strict concurrency.
    /// The snapshot captures the node references (which are sendable references)
    /// and category bitmasks (which are UInt32 = sendable).
    nonisolated static func snapshot(of contact: SKPhysicsContact) -> SKPhysicsContactSnapshot {
        SKPhysicsContactSnapshot(
            nodeA: contact.bodyA.node,
            nodeB: contact.bodyB.node,
            categoryA: contact.bodyA.categoryBitMask,
            categoryB: contact.bodyB.categoryBitMask,
            contactPoint: contact.contactPoint,
            collisionImpulse: contact.collisionImpulse
        )
    }
}

/// Sendable snapshot of an SKPhysicsContact, suitable for capture into a @MainActor closure.
/// Use SKPhysicsHelpers.snapshot(of:) to create one inside your nonisolated didBegin handler.
struct SKPhysicsContactSnapshot: @unchecked Sendable {
    let nodeA: SKNode?
    let nodeB: SKNode?
    let categoryA: UInt32
    let categoryB: UInt32
    let contactPoint: CGPoint
    let collisionImpulse: CGFloat

    /// Convenience: returns (mineNode, theirNode) where mineNode is whichever side
    /// has the supplied category. Useful for "is the player involved here" checks.
    func nodes(matching category: UInt32) -> (mine: SKNode?, theirs: SKNode?)? {
        if categoryA == category { return (nodeA, nodeB) }
        if categoryB == category { return (nodeB, nodeA) }
        return nil
    }
}

/// Standard category bitmask values for typical SpriteKit games.
/// Override or extend in your scene when you need more.
enum SKArcadeCategory {
    static let player1: UInt32  = 0x1 << 0
    static let player2: UInt32  = 0x1 << 1
    static let enemy: UInt32    = 0x1 << 2
    static let projectile: UInt32 = 0x1 << 3
    static let platform: UInt32 = 0x1 << 4
    static let lava: UInt32     = 0x1 << 5
    static let pickup: UInt32   = 0x1 << 6
    static let goal: UInt32     = 0x1 << 7
    static let wall: UInt32     = 0x1 << 8
}

/// Swift-6-safe NotificationCenter observer cleanup for SKScene subclasses.
///
/// Under Swift 6 strict concurrency, you CANNOT call
/// `NotificationCenter.default.removeObserver(token)` from `deinit` when `token`
/// is `NSObjectProtocol?` — the compiler rejects: "cannot access property X with
/// a non-Sendable type (any NSObjectProtocol)? from nonisolated deinit". See
/// wisdom rule mac-026.
///
/// Usage in your SKScene subclass:
///
///     final class GameScene: SKScene {
///         private var restart = RestartObserverToken()
///
///         override func didMove(to view: SKView) {
///             restart.attach(name: .myRestart) { [weak self] in
///                 self?.resetGame()
///             }
///         }
///
///         override func willMove(from view: SKView) {
///             restart.detach()
///             super.willMove(from: view)
///         }
///     }
///
/// The token is `@MainActor`-isolated and safely tearable in `willMove(from:)`,
/// which SpriteKit calls before scene replacement / view tear-down. NEVER put
/// `restart.detach()` inside a `deinit`.
@MainActor
final class RestartObserverToken {
    private var token: NSObjectProtocol?

    /// Register a closure-based observer. Replaces any prior token.
    /// The block is invoked on the main actor — extract any data you need
    /// from `Notification.userInfo` (Sendable) inside the block.
    func attach(name: Notification.Name,
                object: Any? = nil,
                queue: OperationQueue? = .main,
                using block: @escaping @MainActor () -> Void) {
        detach()
        token = NotificationCenter.default.addObserver(
            forName: name,
            object: object,
            queue: queue
        ) { _ in
            // Notification isn't Sendable, so we can't capture it into the
            // MainActor task. Most restart/menu notifications don't carry
            // payload — callers that need userInfo should subscribe via
            // their own observer that handles the data extraction at the
            // notification's own queue boundary.
            Task { @MainActor in block() }
        }
    }

    /// Remove the observer. Idempotent. Call from `willMove(from:)` /
    /// `.onDisappear` — NEVER from `deinit`.
    func detach() {
        if let token {
            NotificationCenter.default.removeObserver(token)
            self.token = nil
        }
    }
}
// END mChatAI macOS Component: arcade.spritekit-physics-helpers
