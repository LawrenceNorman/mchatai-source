// BEGIN mChatAI macOS Component: arcade.asteroids (components/arcade/AsteroidsEngine.swift)
import Foundation

struct AsteroidsRock: Codable, Equatable, Identifiable, Sendable {
    enum Size: String, Codable, Sendable {
        case large
        case medium
        case small

        var radius: Double {
            switch self {
            case .large: return 44
            case .medium: return 28
            case .small: return 16
            }
        }

        var next: Size? {
            switch self {
            case .large: return .medium
            case .medium: return .small
            case .small: return nil
            }
        }
    }

    var id = UUID()
    var body: ArcadeBody
    var size: Size

    init(position: ArcadeVector, velocity: ArcadeVector, size: Size) {
        self.size = size
        self.body = ArcadeBody(position: position, velocity: velocity, radius: size.radius)
    }
}

struct AsteroidsShot: Codable, Equatable, Identifiable, Sendable {
    var id = UUID()
    var body: ArcadeBody
    var ttl: Double = 1.1
}

/// Enemy ship variant. Determines size, behavior, threat level. Diversity
/// in enemy types keeps gameplay fresh as waves progress — saucers fill
/// regular waves, hunters add a more aggressive threat at higher waves,
/// and motherships gate boss waves (every 5th wave). Filed 2026-05-04
/// alongside enemy-AI ship to AsteroidsEngine.
enum AsteroidsEnemyKind: String, Codable, Sendable {
    case saucer       // baseline: drifts, fires roughly-aimed shots
    case hunter       // pursues player, faster, more accurate
    case mothership   // boss: large radius, multi-hit, spawns saucers on death

    var radius: Double {
        switch self {
        case .saucer: return 22
        case .hunter: return 18
        case .mothership: return 56
        }
    }

    /// Lives — most enemies die in one hit, mothership takes 5.
    var maxHits: Int {
        switch self {
        case .saucer, .hunter: return 1
        case .mothership: return 5
        }
    }

    /// Score awarded when the player destroys this enemy.
    var pointValue: Int {
        switch self {
        case .saucer: return 250
        case .hunter: return 400
        case .mothership: return 1000
        }
    }

    /// Base seconds between shots. Hunters fire faster.
    var fireInterval: Double {
        switch self {
        case .saucer: return 2.2
        case .hunter: return 1.4
        case .mothership: return 1.8
        }
    }

    /// Aim jitter (radians). Wider = less accurate. Hunters are tighter.
    /// 0 = laser-perfect (don't do this — frustrating); 0.45 ≈ ±25° spread.
    var aimJitter: Double {
        switch self {
        case .saucer: return 0.45
        case .hunter: return 0.18
        case .mothership: return 0.30
        }
    }

    /// Movement speed (px/sec) — hunters chase fast, motherships drift slow.
    var moveSpeed: Double {
        switch self {
        case .saucer: return 80
        case .hunter: return 130
        case .mothership: return 50
        }
    }
}

/// Enemy ship — drifts across the playfield, fires at the player, dies
/// when shot enough times. Re-uses ArcadeBody for position/velocity/wrap
/// math. AI lives in AsteroidsEngine.update() — this struct is plain state.
struct AsteroidsEnemy: Codable, Equatable, Identifiable, Sendable {
    var id = UUID()
    var body: ArcadeBody
    var kind: AsteroidsEnemyKind = .saucer
    /// Hits remaining before the enemy dies. Default = kind.maxHits.
    var hitsRemaining: Int = 1
    /// Seconds until the enemy can fire again. Decrements each tick;
    /// when ≤0 the engine fires a shot at (ship.position + jitter).
    var fireCooldown: Double = 1.5
    /// Seconds until the AI picks a new target waypoint. Without this
    /// the enemy would either path-find directly (too hard) or move
    /// randomly forever (too dumb). Periodic updates = drifting threat.
    var driftCooldown: Double = 0.0
    /// Cached drift target — the AI steers toward this point until the
    /// driftCooldown elapses, then picks a new one. Hunters set this
    /// to ship.position directly each refresh; saucers pick noisy
    /// waypoints around the playfield.
    var driftTarget: ArcadeVector = ArcadeVector(x: 0, y: 0)
}

struct AsteroidsEngine: Codable, Equatable, Sendable {
    var playfield = ArcadePlayfield()
    private(set) var ship = ArcadeBody(position: ArcadeVector(x: 450, y: 310), radius: 18)
    private(set) var rocks: [AsteroidsRock] = []
    private(set) var shots: [AsteroidsShot] = []
    /// Enemy ships currently on the playfield. Spawned by enemy-spawn
    /// timer at wave-dependent intervals. Each tick the engine runs AI
    /// (drift target updates, fire if cooldown elapsed).
    private(set) var enemies: [AsteroidsEnemy] = []
    /// Shots fired BY enemies, separate from `shots` (player). Renderer
    /// draws these in red. Player ship collision-checks against these.
    private(set) var enemyShots: [AsteroidsShot] = []
    private(set) var score = 0
    private(set) var lives = 3
    private(set) var phase: ArcadePhase = .ready
    private(set) var respawnShield: Double = 1.6
    /// Current wave number, 1-indexed. Auto-increments when the engine
    /// detects all rocks have been cleared (and the boss, on boss waves)
    /// and resetWave() fires for the next wave. Drives spawn count +
    /// speed + enemy roster via resetWave(wave:).
    private(set) var wave: Int = 1
    /// True when the current wave is a boss wave (every 5th: 5, 10, 15, ...).
    /// Boss waves block wave advance until the mothership is dead even
    /// though regular rocks may still be present (they often spawn from
    /// the boss's death).
    var isBossWave: Bool { wave > 0 && wave % 5 == 0 }
    /// Seconds until next enemy spawns. Set by resetWave() based on wave
    /// number; non-boss waves spawn after a delay so the player has time
    /// to thin rocks before juggling enemies. Boss waves spawn the
    /// mothership immediately. ≤0 = ready to spawn.
    private(set) var nextEnemySpawnTimer: Double = 0
    /// Internal deterministic RNG seed — used for AI jitter so the
    /// engine stays Codable + Equatable + Sendable without needing a
    /// SystemRandomNumberGenerator (which would break value semantics).
    private var rngSeed: UInt64 = 9173

    init() {
        resetWave()
    }

    mutating func setShip(position: ArcadeVector) {
        ship.position = position
    }

    mutating func update(dt: Double, controls: ArcadeControls) {
        if phase == .ready { phase = .playing }
        guard phase == .playing else { return }

        if controls.left { ship.angle -= 4.5 * dt }
        if controls.right { ship.angle += 4.5 * dt }
        if controls.up {
            let thrust = ArcadeVector(x: cos(ship.angle), y: sin(ship.angle)).scaled(by: 260 * dt)
            ship.velocity = ship.velocity + thrust
        }
        respawnShield = max(0, respawnShield - dt)
        ship.velocity = ship.velocity.scaled(by: 0.992)
        ship.integrate(dt: dt)
        ship.wrap(in: playfield)

        for index in rocks.indices {
            rocks[index].body.integrate(dt: dt)
            rocks[index].body.wrap(in: playfield)
        }

        for index in shots.indices {
            shots[index].ttl -= dt
            shots[index].body.integrate(dt: dt)
            shots[index].body.wrap(in: playfield)
        }
        shots.removeAll { $0.ttl <= 0 }

        // ---- Enemy spawn / AI / shots ----
        nextEnemySpawnTimer = max(0, nextEnemySpawnTimer - dt)
        spawnEnemiesIfReady()
        updateEnemies(dt: dt)
        for index in enemyShots.indices {
            enemyShots[index].ttl -= dt
            enemyShots[index].body.integrate(dt: dt)
            enemyShots[index].body.wrap(in: playfield)
        }
        enemyShots.removeAll { $0.ttl <= 0 }

        resolveShotHits()
        resolvePlayerShotsVsEnemies()
        resolveShipHits()
        resolveEnemyShotsVsShip()

        // Wave advancement: regular waves clear when rocks AND enemies
        // are both gone. Boss waves additionally require the mothership
        // dead — the boss spawns 2 saucers when killed, so checking
        // "no mothership AND no enemies" reduces to "enemies.isEmpty".
        let bossPresent = enemies.contains { $0.kind == .mothership }
        if rocks.isEmpty && !bossPresent && enemies.isEmpty {
            score += 500
            wave += 1
            resetWave(wave: wave)
        }
    }

    /// Spawn one or more enemies if the wave's spawn timer has elapsed.
    /// Spawn schedule per wave:
    ///   wave 1, 2:    no enemies (let player learn rock movement)
    ///   wave 3+:      saucers, count grows by wave/3, after a delay
    ///   wave 6+:      add 1 hunter to the mix
    ///   wave 5,10,15: BOSS wave — 1 mothership spawned immediately
    private mutating func spawnEnemiesIfReady() {
        guard nextEnemySpawnTimer <= 0 else { return }
        guard wave >= 3 else { return }

        if isBossWave {
            // Boss waves: 1 mothership at center-top. Spawn timer prevents
            // re-spawning every frame.
            if !enemies.contains(where: { $0.kind == .mothership }) {
                spawnEnemy(.mothership, at: ArcadeVector(x: playfield.center.x, y: 80))
            }
            nextEnemySpawnTimer = 9999  // suppress further spawn this wave
            return
        }

        // Non-boss: count saucers and hunters already alive.
        let saucerCap = max(1, (wave - 2) / 2)  // wave 3-4 = 1, wave 5+ = 1, wave 7-8 = 2 ...
        let hunterCap = wave >= 6 ? 1 : 0
        let alivesSaucers = enemies.filter { $0.kind == .saucer }.count
        let aliveHunters = enemies.filter { $0.kind == .hunter }.count

        if alivesSaucers < saucerCap {
            spawnEnemy(.saucer, at: edgeSpawnPoint())
        } else if aliveHunters < hunterCap {
            spawnEnemy(.hunter, at: edgeSpawnPoint())
        }
        nextEnemySpawnTimer = 6.5  // re-check every ~6s for top-up spawns
    }

    private mutating func spawnEnemy(_ kind: AsteroidsEnemyKind, at position: ArcadeVector) {
        let body = ArcadeBody(
            position: position,
            velocity: ArcadeVector(x: 0, y: 0),
            radius: kind.radius
        )
        let target = randomDriftTarget()
        enemies.append(AsteroidsEnemy(
            body: body,
            kind: kind,
            hitsRemaining: kind.maxHits,
            fireCooldown: 1.0 + Double.random(in: 0..<0.8),
            driftCooldown: 1.5,
            driftTarget: target
        ))
    }

    /// Pick a random off-screen edge point for enemies to enter from so
    /// they don't pop in next to the player.
    private mutating func edgeSpawnPoint() -> ArcadeVector {
        let edge = nextRandomInt() % 4
        let w = playfield.width, h = playfield.height
        switch edge {
        case 0: return ArcadeVector(x: -40, y: Double(nextRandomInt() % Int(h)))
        case 1: return ArcadeVector(x: w + 40, y: Double(nextRandomInt() % Int(h)))
        case 2: return ArcadeVector(x: Double(nextRandomInt() % Int(w)), y: -40)
        default: return ArcadeVector(x: Double(nextRandomInt() % Int(w)), y: h + 40)
        }
    }

    private mutating func randomDriftTarget() -> ArcadeVector {
        let w = playfield.width, h = playfield.height
        let x = Double(nextRandomInt() % Int(w))
        let y = Double(nextRandomInt() % Int(h))
        return ArcadeVector(x: x, y: y)
    }

    /// Per-tick AI for all enemies: refresh drift targets when their
    /// cooldown elapses, steer toward the target, and fire shots when
    /// fire cooldowns elapse. Hunter AI tracks the player directly;
    /// saucer/mothership AI uses random waypoints (less aggressive feel).
    private mutating func updateEnemies(dt: Double) {
        for index in enemies.indices {
            // Drift target refresh
            enemies[index].driftCooldown -= dt
            if enemies[index].driftCooldown <= 0 {
                if enemies[index].kind == .hunter {
                    // Hunters lock on to the player's CURRENT position +
                    // small random offset (otherwise they orbit too
                    // tightly when player is stationary).
                    let jitterX = Double(nextRandomInt() % 200) - 100
                    let jitterY = Double(nextRandomInt() % 200) - 100
                    enemies[index].driftTarget = ArcadeVector(
                        x: ship.position.x + jitterX,
                        y: ship.position.y + jitterY
                    )
                } else {
                    enemies[index].driftTarget = randomDriftTarget()
                }
                enemies[index].driftCooldown = enemies[index].kind == .hunter ? 1.0 : 2.5
            }

            // Steer toward drift target
            let dx = enemies[index].driftTarget.x - enemies[index].body.position.x
            let dy = enemies[index].driftTarget.y - enemies[index].body.position.y
            let dist = max(1e-6, (dx * dx + dy * dy).squareRoot())
            let speed = enemies[index].kind.moveSpeed
            enemies[index].body.velocity = ArcadeVector(
                x: dx / dist * speed,
                y: dy / dist * speed
            )
            enemies[index].body.integrate(dt: dt)
            enemies[index].body.wrap(in: playfield)

            // Fire?
            enemies[index].fireCooldown -= dt
            if enemies[index].fireCooldown <= 0 {
                fireEnemyShot(from: index)
                enemies[index].fireCooldown = enemies[index].kind.fireInterval +
                    Double.random(in: 0..<0.4)
            }
        }
    }

    /// Fire a shot from the given enemy toward the player, with kind-specific
    /// aim jitter (so enemies aren't laser-perfect — that's frustrating).
    /// See wisdom rule game-bot-ai-jitter-not-laser-accurate.
    private mutating func fireEnemyShot(from enemyIndex: Int) {
        let enemy = enemies[enemyIndex]
        let dx = ship.position.x - enemy.body.position.x
        let dy = ship.position.y - enemy.body.position.y
        var aimAngle = atan2(dy, dx)
        // Add aim jitter — wider for casual saucers, narrower for hunters.
        let jitterRange = enemy.kind.aimJitter
        let jitter = (Double(nextRandomInt() % 1000) / 1000.0 - 0.5) * 2.0 * jitterRange
        aimAngle += jitter

        let dir = ArcadeVector(x: cos(aimAngle), y: sin(aimAngle))
        let start = enemy.body.position + dir.scaled(by: enemy.body.radius + 6)
        let body = ArcadeBody(
            position: start,
            velocity: dir.scaled(by: 320),
            radius: 4,
            angle: aimAngle
        )
        enemyShots.append(AsteroidsShot(body: body, ttl: 2.5))
    }

    /// Resolve player shots hitting enemies. Mothership soaks 5 hits;
    /// saucers/hunters die in 1. Mothership death spawns 2 saucers (the
    /// "boss splits into minions" pattern).
    private mutating func resolvePlayerShotsVsEnemies() {
        var consumedShotIDs: Set<UUID> = []
        for shot in shots {
            for enemyIndex in enemies.indices {
                guard shot.body.intersects(enemies[enemyIndex].body) else { continue }
                consumedShotIDs.insert(shot.id)
                enemies[enemyIndex].hitsRemaining -= 1
                break
            }
        }
        shots.removeAll { consumedShotIDs.contains($0.id) }

        // Process kills (separate pass so we don't index-shift mid-loop).
        var newEnemies: [AsteroidsEnemy] = []
        for enemy in enemies {
            if enemy.hitsRemaining > 0 {
                newEnemies.append(enemy)
            } else {
                score += enemy.kind.pointValue
                if enemy.kind == .mothership {
                    // Boss death: spawn 2 saucers near the boss position.
                    for offset in [-60.0, 60.0] {
                        let pos = ArcadeVector(
                            x: enemy.body.position.x + offset,
                            y: enemy.body.position.y
                        )
                        let target = randomDriftTarget()
                        newEnemies.append(AsteroidsEnemy(
                            body: ArcadeBody(position: pos, velocity: ArcadeVector(x: 0, y: 0), radius: AsteroidsEnemyKind.saucer.radius),
                            kind: .saucer,
                            hitsRemaining: 1,
                            fireCooldown: 1.5,
                            driftCooldown: 1.5,
                            driftTarget: target
                        ))
                    }
                }
            }
        }
        enemies = newEnemies
    }

    /// Resolve enemy shots hitting the player ship. Identical to rock
    /// collision: lose a life, respawn at center, brief invuln.
    private mutating func resolveEnemyShotsVsShip() {
        guard respawnShield <= 0 else { return }
        var consumedIDs: Set<UUID> = []
        var hit = false
        for shot in enemyShots {
            if ship.intersects(shot.body) {
                consumedIDs.insert(shot.id)
                hit = true
                break
            }
        }
        if hit {
            lives -= 1
            ship = ArcadeBody(position: playfield.center, radius: 18)
            respawnShield = 1.6
            if lives <= 0 { phase = .lost }
        }
        enemyShots.removeAll { consumedIDs.contains($0.id) }
    }

    /// Simple LCG for deterministic AI jitter without breaking Sendable
    /// + Equatable. Good-enough randomness for enemy targeting.
    private mutating func nextRandomInt() -> Int {
        rngSeed = rngSeed &* 6364136223846793005 &+ 1442695040888963407
        return Int(truncatingIfNeeded: rngSeed >> 33) & 0x7fffffff
    }

    mutating func fire() {
        guard shots.count < 5 else { return }
        let direction = ArcadeVector(x: cos(ship.angle), y: sin(ship.angle))
        let start = ship.position + direction.scaled(by: ship.radius + 6)
        let body = ArcadeBody(position: start, velocity: ship.velocity + direction.scaled(by: 460), radius: 4, angle: ship.angle)
        shots.append(AsteroidsShot(body: body))
    }

    /// Reset to a fresh wave of asteroids. `wave` (1-indexed) controls
    /// difficulty: large-rock count grows by 1 every 2 waves (cap 8),
    /// medium starters added from wave 3 (cap 3), velocity scales 1.0×→2.0×
    /// by wave 10 then caps. Default wave=1 preserves the original "3 rocks"
    /// behavior for legacy callers / smoke tests.
    mutating func resetWave(wave: Int = 1) {
        phase = .playing
        let level = max(1, min(20, wave))
        // Rock count: 2 large at wave 1, +1 per 2 waves, capped at 8.
        let largeCount = min(8, 2 + (level - 1) / 2)
        // Bonus medium starters from wave 3 onward.
        let mediumCount = level >= 3 ? min(3, 1 + (level - 3) / 4) : 0
        // Velocity multiplier: 1.0× at wave 1, 2.0× by wave 10, capped.
        let speedMul = min(2.0, 1.0 + Double(level - 1) * 0.11)

        var spawned: [AsteroidsRock] = []
        // Distribute large rocks around the perimeter at evenly spaced
        // angles so they spawn away from ship-center.
        for i in 0..<largeCount {
            let angle = Double(i) / Double(max(1, largeCount)) * .pi * 2
            let pos = ArcadeVector(
                x: playfield.center.x + cos(angle) * 320,
                y: playfield.center.y + sin(angle) * 220
            )
            let vx = sin(angle) * 38 * speedMul + Double(i % 2 == 0 ? 6 : -10)
            let vy = -cos(angle) * 38 * speedMul + Double(i % 2 == 0 ? -8 : 12)
            spawned.append(AsteroidsRock(
                position: pos,
                velocity: ArcadeVector(x: vx, y: vy),
                size: .large
            ))
        }
        for i in 0..<mediumCount {
            let angle = Double(i) / Double(max(1, mediumCount)) * .pi * 2 + .pi / 4
            let pos = ArcadeVector(
                x: playfield.center.x + cos(angle) * 180,
                y: playfield.center.y + sin(angle) * 140
            )
            spawned.append(AsteroidsRock(
                position: pos,
                velocity: ArcadeVector(x: cos(angle) * 60 * speedMul, y: sin(angle) * 60 * speedMul),
                size: .medium
            ))
        }
        rocks = spawned
        shots.removeAll()

        // Enemy roster: cleared on every wave; the spawn timer sets when
        // the next enemy appears. Boss waves (every 5th) spawn the
        // mothership immediately on entry; non-boss waves give the player
        // a few seconds of "rocks-only" time before enemies join.
        enemies.removeAll()
        enemyShots.removeAll()
        if isBossWave {
            // Boss arrives instantly — the player should see the mothership
            // descend at wave start so the threat is unmistakable.
            nextEnemySpawnTimer = 0.5
        } else if level >= 3 {
            nextEnemySpawnTimer = 8.0  // wave 3+: enemy joins after 8s
        } else {
            nextEnemySpawnTimer = 9999  // wave 1-2: no enemies at all
        }
    }

    private mutating func resolveShotHits() {
        var newRocks: [AsteroidsRock] = []
        for shot in shots {
            guard let rockIndex = rocks.firstIndex(where: { shot.body.intersects($0.body) }) else {
                newRocks.append(contentsOf: [])
                continue
            }
            let rock = rocks.remove(at: rockIndex)
            score += rock.size == .large ? 50 : rock.size == .medium ? 100 : 200
            if let nextSize = rock.size.next {
                newRocks.append(AsteroidsRock(position: rock.body.position, velocity: ArcadeVector(x: rock.body.velocity.y, y: -rock.body.velocity.x), size: nextSize))
                newRocks.append(AsteroidsRock(position: rock.body.position, velocity: ArcadeVector(x: -rock.body.velocity.y, y: rock.body.velocity.x), size: nextSize))
            }
        }
        rocks.append(contentsOf: newRocks)
        shots.removeAll { shot in
            !rocks.allSatisfy { !shot.body.intersects($0.body) }
        }
    }

    private mutating func resolveShipHits() {
        guard respawnShield <= 0 else { return }
        guard rocks.contains(where: { ship.intersects($0.body) }) else { return }
        lives -= 1
        ship = ArcadeBody(position: playfield.center, radius: 18)
        respawnShield = 1.6
        if lives <= 0 {
            phase = .lost
        }
    }
}
// END mChatAI macOS Component: arcade.asteroids
