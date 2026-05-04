// BEGIN mChatAI macOS Component: arcade.projectile (components/arcade/ArcadeProjectile.swift)
import Foundation

/// Visual classes of in-flight shot. Mirrors `entities/Projectile.js` plus the
/// turret-variant draw modes from `entities/TurretVariants.js` on the web side.
enum ArcadeProjectileKind: String, Codable, Sendable, CaseIterable {
    /// Small fast tracer fired by Basic-style turrets. Single-target.
    case tracer
    /// Slower heavy round fired by Cannon-style turrets. Splash on impact.
    case cannonShell
    /// Continuous laser line drawn each frame from turret to its current target.
    case beam
    /// Pale-blue pulse used by Frost turrets to slow what it hits.
    case frostPulse
}

/// One in-flight (or beam-active) shot. The engine appends instances to its
/// `projectiles` buffer when a turret fires; the renderer reads them per frame.
///
/// Beam-class projectiles have `lifetime <= 0` and `live == true` for as long as
/// the parent turret keeps a target — they represent an "active link" rather
/// than a moving entity. The renderer should draw them as a line from
/// `originPoint` to the current position of the target enemy.
///
/// Travel-class projectiles (tracer / cannonShell / frostPulse) use `t` to
/// interpolate from `originPoint` to `targetPoint` over `lifetime` seconds; the
/// engine ticks `t` toward 1 and removes the projectile when `t >= 1`.
struct ArcadeProjectile: Identifiable, Codable, Equatable, Sendable {
    var id = UUID()
    var kind: ArcadeProjectileKind
    var originPoint: PuzzlePoint
    var targetPoint: PuzzlePoint
    /// Optional — if set, the renderer should follow the live position of this enemy
    /// instead of the static `targetPoint`. Beams especially want this.
    var followsEnemyID: UUID? = nil
    /// 0…1 normalized travel progress for moving projectiles.
    var t: Double = 0
    /// Total seconds to travel origin → target. Beams use 0.
    var lifetime: Double = 0.18
    /// When the engine spawned this shot. The renderer can fade by `now - spawnedAt`.
    var spawnedAt: Date = Date()
    /// True for as long as the renderer should draw it. The engine flips this off
    /// when t hits 1 (travel) or when a beam's parent turret loses its target.
    var live: Bool = true

    init(kind: ArcadeProjectileKind,
                originPoint: PuzzlePoint,
                targetPoint: PuzzlePoint,
                followsEnemyID: UUID? = nil,
                lifetime: Double = 0.18) {
        self.kind = kind
        self.originPoint = originPoint
        self.targetPoint = targetPoint
        self.followsEnemyID = followsEnemyID
        self.lifetime = lifetime
    }
}
// END mChatAI macOS Component: arcade.projectile
