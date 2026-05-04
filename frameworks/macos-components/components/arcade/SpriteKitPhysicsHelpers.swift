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
// END mChatAI macOS Component: arcade.spritekit-physics-helpers
