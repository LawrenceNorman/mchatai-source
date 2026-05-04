import SwiftUI
import AppKit

enum TowerDefenseBoard {
    static let rows = 8
    static let columns = 12
    static let defaultPath = [
        PuzzlePoint(row: 4, col: 0),
        PuzzlePoint(row: 4, col: 1),
        PuzzlePoint(row: 4, col: 2),
        PuzzlePoint(row: 4, col: 3),
        PuzzlePoint(row: 3, col: 3),
        PuzzlePoint(row: 2, col: 3),
        PuzzlePoint(row: 2, col: 4),
        PuzzlePoint(row: 2, col: 5),
        PuzzlePoint(row: 2, col: 6),
        PuzzlePoint(row: 2, col: 7),
        PuzzlePoint(row: 3, col: 7),
        PuzzlePoint(row: 4, col: 7),
        PuzzlePoint(row: 5, col: 7),
        PuzzlePoint(row: 5, col: 8),
        PuzzlePoint(row: 5, col: 9),
        PuzzlePoint(row: 5, col: 10),
        PuzzlePoint(row: 5, col: 11)
    ]
    static var basePoint: PuzzlePoint { defaultPath.last ?? PuzzlePoint(row: 5, col: 11) }
    static var spawnPoint: PuzzlePoint { defaultPath.first ?? PuzzlePoint(row: 4, col: 0) }
}

struct ContentView: View {
    @State private var engine = TowerDefenseEngine(path: TowerDefenseBoard.defaultPath)
    @State private var selected: PuzzlePoint? = nil
    @State private var pickedKind: TowerKind = .basic
    @State private var status = "Pick a tower, then click a green tile to build."
    @State private var ghostColorByID: [UUID: Color] = [:]

    private let timer = Timer.publish(every: 0.12, on: .main, in: .common).autoconnect()
    private let cellSize: CGFloat = 56
    private let cellGap: CGFloat = 4
    private let boardPadding: CGFloat = 12

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            towerShop
            battlefield
            controls
            statusStrip
        }
        .padding(20)
        .frame(minWidth: boardWidth + 40, minHeight: 740)
        .background(
            LinearGradient(
                colors: [
                    Color(red: 0.06, green: 0.10, blue: 0.16),
                    Color(red: 0.02, green: 0.05, blue: 0.04)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .overlay(alignment: .topLeading) {
            TowerDefenseKeyboardCaptureView(
                onPlaceTower: placeSelectedTower,
                onStartWave: startWave,
                onReset: newGame,
                onMove: moveSelection,
                onPickBasic: { pickedKind = .basic },
                onPickCannon: { pickedKind = .cannon },
                onPickFrost: { pickedKind = .frost },
                onPickBeam: { pickedKind = .beam }
            )
            .frame(width: 1, height: 1)
            .opacity(0.01)
            .accessibilityHidden(true)
        }
        .onReceive(timer) { _ in tick() }
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 16) {
            Text("Tower Defense")
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .foregroundStyle(.white)

            Text(phaseLabel)
                .font(.callout.weight(.heavy))
                .foregroundStyle(statusColor)
                .padding(.horizontal, 8).padding(.vertical, 2)
                .background(statusColor.opacity(0.16))
                .clipShape(Capsule())

            Spacer()

            statBlock(label: "WAVE", value: "\(engine.wave)/10", tint: .cyan)
            statBlock(label: "LIVES", value: "\(engine.lives)", tint: .red)
            statBlock(label: "GOLD", value: "$\(engine.credits)", tint: .yellow)
        }
        .frame(maxHeight: 44)
    }

    // MARK: - Tower shop

    private var towerShop: some View {
        HStack(spacing: 8) {
            ForEach([TowerKind.basic, TowerKind.cannon, TowerKind.frost, TowerKind.beam], id: \.rawValue) { kind in
                shopButton(kind: kind)
            }
            Spacer()
            startWaveButton
            Button("Reset") { newGame() }
                .buttonStyle(.bordered)
                .controlSize(.regular)
                .keyboardShortcut("r", modifiers: [])
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func shopButton(kind: TowerKind) -> some View {
        let isSelected = pickedKind == kind
        let canAfford = engine.credits >= kind.cost
        return Button {
            pickedKind = kind
        } label: {
            HStack(spacing: 8) {
                ZStack {
                    Circle().fill(towerTint(kind).gradient)
                        .frame(width: 28, height: 28)
                    Image(systemName: towerSymbol(kind))
                        .font(.system(size: 14, weight: .black))
                        .foregroundStyle(.white)
                }
                VStack(alignment: .leading, spacing: 0) {
                    Text(towerLabel(kind))
                        .font(.callout.weight(.bold))
                        .foregroundStyle(.white)
                    Text("$\(kind.cost) · \(towerHint(kind))")
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.65))
                }
            }
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(isSelected ? Color.white.opacity(0.18) : Color.white.opacity(0.06))
            )
            .overlay {
                RoundedRectangle(cornerRadius: 8)
                    .stroke(isSelected ? towerTint(kind) : .white.opacity(0.12), lineWidth: isSelected ? 2 : 1)
            }
            .opacity(canAfford ? 1.0 : 0.45)
        }
        .buttonStyle(.plain)
        .help("\(towerLabel(kind)) — \(towerHint(kind)). Costs $\(kind.cost).")
    }

    private var startWaveButton: some View {
        let label: String
        let disabled: Bool
        switch engine.phase {
        case .playing:
            label = "Wave Running…"
            disabled = true
        case .lost:
            label = "Game Over"
            disabled = true
        case .ready, .won:
            label = engine.wave == 0 ? "Start Wave 1" : "Start Wave \(engine.wave + 1)"
            disabled = false
        }
        return Button(label) { startWave() }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .tint(.green)
            .disabled(disabled)
            .keyboardShortcut(.space, modifiers: [])
    }

    // MARK: - Battlefield

    private var battlefield: some View {
        ZStack(alignment: .topLeading) {
            boardGrid
            pathLine
            baseMarker
            projectilesLayer
            ForEach(engine.enemies) { enemy in
                enemyView(enemy)
                    .position(enemyCenter(enemy))
            }
        }
        .padding(boardPadding)
        .frame(width: boardWidth, height: boardHeight)
        .background(Color.black.opacity(0.32))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .stroke(.white.opacity(0.16), lineWidth: 1)
        }
    }

    /// Draws every active ArcadeProjectile. Tracers + cannon shells + frost pulses are
    /// short travel-class shots animated along `t`; beam projectiles draw a continuous
    /// glowing line from their origin to the live position of the followed enemy.
    private var projectilesLayer: some View {
        Canvas { ctx, _ in
            for proj in engine.projectiles {
                // Resolve current target point: prefer the live enemy if we have a follow ID,
                // otherwise use the static targetPoint snapshot.
                let endCell: PuzzlePoint
                if let id = proj.followsEnemyID, let enemy = engine.enemies.first(where: { $0.id == id }) {
                    let p = enemyCenterRaw(enemy)
                    let endCol = (p.x - cellSize / 2) / (cellSize + cellGap)
                    let endRow = (p.y - cellSize / 2) / (cellSize + cellGap)
                    endCell = PuzzlePoint(row: Int(endRow.rounded()), col: Int(endCol.rounded()))
                } else {
                    endCell = proj.targetPoint
                }
                let originPx = cellCenter(proj.originPoint)
                let endPx: CGPoint = {
                    if let id = proj.followsEnemyID, let enemy = engine.enemies.first(where: { $0.id == id }) {
                        return enemyCenterRaw(enemy)
                    }
                    return cellCenter(endCell)
                }()

                switch proj.kind {
                case .tracer:
                    drawTracer(ctx: &ctx, origin: originPx, end: endPx, t: proj.t)

                case .cannonShell:
                    drawCannonShell(ctx: &ctx, origin: originPx, end: endPx, t: proj.t)
                    if proj.t >= 0.85 {
                        drawSplashRing(ctx: &ctx, center: endPx, t: proj.t)
                    }

                case .frostPulse:
                    drawFrostPulse(ctx: &ctx, origin: originPx, end: endPx, t: proj.t)

                case .beam:
                    drawBeam(ctx: &ctx, origin: originPx, end: endPx)
                }
            }
        }
        .allowsHitTesting(false)
    }

    private func drawTracer(ctx: inout GraphicsContext, origin: CGPoint, end: CGPoint, t: Double) {
        let p = CGPoint(x: origin.x + (end.x - origin.x) * t, y: origin.y + (end.y - origin.y) * t)
        // Glowing yellow tracer with a short tail.
        let tailLen: CGFloat = 14
        let dx = end.x - origin.x
        let dy = end.y - origin.y
        let len = max(0.001, sqrt(dx*dx + dy*dy))
        let ux = dx / len
        let uy = dy / len
        let tail = CGPoint(x: p.x - ux * tailLen, y: p.y - uy * tailLen)
        var path = Path()
        path.move(to: tail)
        path.addLine(to: p)
        ctx.stroke(path, with: .color(Color(red: 1.0, green: 0.9, blue: 0.4)), style: StrokeStyle(lineWidth: 3, lineCap: .round))
        ctx.fill(Path(ellipseIn: CGRect(x: p.x - 3, y: p.y - 3, width: 6, height: 6)),
                 with: .color(Color.yellow))
    }

    private func drawCannonShell(ctx: inout GraphicsContext, origin: CGPoint, end: CGPoint, t: Double) {
        // Bigger projectile, brown/grey, slight arc.
        let mid = CGPoint(x: (origin.x + end.x)/2, y: (origin.y + end.y)/2 - 14)
        let lerp1 = CGPoint(x: origin.x + (mid.x - origin.x) * t, y: origin.y + (mid.y - origin.y) * t)
        let lerp2 = CGPoint(x: mid.x + (end.x - mid.x) * t, y: mid.y + (end.y - mid.y) * t)
        let p = CGPoint(x: lerp1.x + (lerp2.x - lerp1.x) * t, y: lerp1.y + (lerp2.y - lerp1.y) * t)
        ctx.fill(Path(ellipseIn: CGRect(x: p.x - 5, y: p.y - 5, width: 10, height: 10)),
                 with: .color(Color(red: 0.45, green: 0.30, blue: 0.18)))
        ctx.stroke(Path(ellipseIn: CGRect(x: p.x - 5, y: p.y - 5, width: 10, height: 10)),
                 with: .color(Color(red: 0.95, green: 0.85, blue: 0.4)), lineWidth: 1.5)
    }

    private func drawSplashRing(ctx: inout GraphicsContext, center: CGPoint, t: Double) {
        // Expanding orange ring during the last 15% of the shell's travel.
        let progress = (t - 0.85) / 0.15  // 0..1
        let radius: CGFloat = 6 + 30 * CGFloat(progress)
        let alpha = 1.0 - progress
        var ring = Path()
        ring.addEllipse(in: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
        ctx.stroke(ring, with: .color(Color.orange.opacity(alpha)), lineWidth: 3)
    }

    private func drawFrostPulse(ctx: inout GraphicsContext, origin: CGPoint, end: CGPoint, t: Double) {
        let p = CGPoint(x: origin.x + (end.x - origin.x) * t, y: origin.y + (end.y - origin.y) * t)
        // Pale-blue diamond with a soft glow trail.
        let r: CGFloat = 8
        var diamond = Path()
        diamond.move(to: CGPoint(x: p.x, y: p.y - r))
        diamond.addLine(to: CGPoint(x: p.x + r, y: p.y))
        diamond.addLine(to: CGPoint(x: p.x, y: p.y + r))
        diamond.addLine(to: CGPoint(x: p.x - r, y: p.y))
        diamond.closeSubpath()
        ctx.fill(diamond, with: .color(Color(red: 0.65, green: 0.92, blue: 1.0).opacity(0.85)))
        ctx.stroke(diamond, with: .color(Color.white.opacity(0.85)), lineWidth: 1.5)
    }

    private func drawBeam(ctx: inout GraphicsContext, origin: CGPoint, end: CGPoint) {
        // Purple core line + magenta outer glow. Mirrors web BeamTurret.draw.
        var line = Path()
        line.move(to: origin)
        line.addLine(to: end)
        ctx.stroke(line, with: .color(Color(red: 0.78, green: 0.50, blue: 0.95).opacity(0.45)), lineWidth: 7)
        ctx.stroke(line, with: .color(Color(red: 1.0, green: 0.85, blue: 1.0)), lineWidth: 2)
    }

    /// Live pixel position of an enemy (no boardPadding offset). The pad-corrected
    /// version is `enemyCenter(_:)`; the renderer Canvas inside `battlefield` already
    /// has the padding applied via `.padding(boardPadding)`, so it needs the raw value.
    private func enemyCenterRaw(_ enemy: TowerDefenseEnemy) -> CGPoint {
        let progress = max(enemy.progress, 0)
        let lowerIndex = max(0, min(engine.path.count - 1, Int(progress.rounded(.down))))
        let upperIndex = min(engine.path.count - 1, lowerIndex + 1)
        let local = min(max(progress - Double(lowerIndex), 0), 1)
        let start = cellCenter(engine.path[lowerIndex])
        let end = cellCenter(engine.path[upperIndex])
        return CGPoint(
            x: start.x + (end.x - start.x) * local,
            y: start.y + (end.y - start.y) * local
        )
    }

    private var boardGrid: some View {
        let columns = Array(repeating: GridItem(.fixed(cellSize), spacing: cellGap), count: TowerDefenseBoard.columns)
        return LazyVGrid(columns: columns, spacing: cellGap) {
            ForEach(allPoints, id: \.self) { point in
                cellButton(point)
            }
        }
        .fixedSize()
    }

    private var pathLine: some View {
        Canvas { context, _ in
            guard let first = TowerDefenseBoard.defaultPath.first else { return }
            var path = Path()
            path.move(to: cellCenter(first))
            for point in TowerDefenseBoard.defaultPath.dropFirst() {
                path.addLine(to: cellCenter(point))
            }
            context.stroke(path, with: .color(Color(red: 0.85, green: 0.7, blue: 0.4).opacity(0.55)), style: StrokeStyle(lineWidth: 14, lineCap: .round, lineJoin: .round))
            context.stroke(path, with: .color(Color(red: 0.95, green: 0.85, blue: 0.55).opacity(0.30)), style: StrokeStyle(lineWidth: 6, lineCap: .round, lineJoin: .round, dash: [3, 5]))
        }
        .allowsHitTesting(false)
    }

    private var baseMarker: some View {
        let center = cellCenter(TowerDefenseBoard.basePoint)
        return ZStack {
            RoundedRectangle(cornerRadius: 8)
                .fill(LinearGradient(colors: [.blue, .purple], startPoint: .top, endPoint: .bottom).opacity(0.85))
                .frame(width: cellSize - 6, height: cellSize - 6)
                .shadow(color: .blue.opacity(0.55), radius: 8)
            Image(systemName: "shield.lefthalf.filled")
                .font(.system(size: cellSize * 0.55, weight: .black))
                .foregroundStyle(.white)
        }
        .position(x: boardPadding + center.x, y: boardPadding + center.y)
        .allowsHitTesting(false)
        .accessibilityLabel("Your base")
    }

    // MARK: - Cells

    private func cellButton(_ point: PuzzlePoint) -> some View {
        let placedTower = engine.towers.first(where: { $0.position == point })
        let pathTile = isPath(point)
        let isBase = (point == TowerDefenseBoard.basePoint)
        let isSpawn = (point == TowerDefenseBoard.spawnPoint)
        let isSelected = (selected == point)
        let canBuild = canPlaceTower(at: point)

        return Button {
            selected = point
            if canBuild { placeSelectedTower() }
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: 7)
                    .fill(cellFill(pathTile: pathTile, canBuild: canBuild))
                    .overlay {
                        RoundedRectangle(cornerRadius: 7)
                            .stroke(isSelected ? .cyan : .white.opacity(0.06), lineWidth: isSelected ? 3 : 1)
                    }

                if let tower = placedTower {
                    towerSprite(tower)
                } else if isBase {
                    EmptyView()
                } else if isSpawn {
                    Image(systemName: "arrow.right.circle.fill")
                        .font(.system(size: cellSize * 0.42, weight: .black))
                        .foregroundStyle(.orange.opacity(0.85))
                } else if pathTile {
                    Circle()
                        .fill(.yellow.opacity(0.18))
                        .frame(width: 8, height: 8)
                } else if canBuild {
                    Image(systemName: "plus")
                        .font(.system(size: 12, weight: .black))
                        .foregroundStyle(towerTint(pickedKind).opacity(0.45))
                }
            }
            .frame(width: cellSize, height: cellSize)
        }
        .buttonStyle(.plain)
        .help(cellHelp(point: point, placedTower: placedTower, pathTile: pathTile))
        .accessibilityLabel(cellAccessibility(point: point, placedTower: placedTower, pathTile: pathTile))
    }

    private func towerSprite(_ tower: TowerDefenseTower) -> some View {
        ZStack {
            Circle()
                .fill(towerTint(tower.kind).gradient)
                .frame(width: cellSize - 14, height: cellSize - 14)
                .shadow(color: towerTint(tower.kind).opacity(0.5), radius: 4)
            Image(systemName: towerSymbol(tower.kind))
                .font(.system(size: cellSize * 0.36, weight: .black))
                .foregroundStyle(.white)
        }
    }

    // MARK: - Enemies

    private func enemyView(_ enemy: TowerDefenseEnemy) -> some View {
        let tint: Color = {
            switch enemy.kind {
            case .normal: return .red
            case .fast:   return .yellow
            case .heavy:  return .purple
            }
        }()
        let size: CGFloat = {
            switch enemy.kind {
            case .normal: return 28
            case .fast:   return 22
            case .heavy:  return 36
            }
        }()
        let symbol: String = {
            switch enemy.kind {
            case .normal: return "circle.fill"
            case .fast:   return "triangle.fill"
            case .heavy:  return "square.fill"
            }
        }()
        let baseHealth = max(1.0, enemy.kind.baseHealth + Double(engine.wave * 20))
        let frac = min(1.0, max(0.0, enemy.health / baseHealth))

        return VStack(spacing: 2) {
            // HP bar
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(Color.black.opacity(0.6))
                    .frame(width: size, height: 4)
                RoundedRectangle(cornerRadius: 2)
                    .fill(frac > 0.45 ? Color.green : Color.orange)
                    .frame(width: size * CGFloat(frac), height: 4)
            }
            // Body
            ZStack {
                Image(systemName: symbol)
                    .font(.system(size: size, weight: .black))
                    .foregroundStyle(tint.gradient)
                    .shadow(color: tint.opacity(0.5), radius: 4)
            }
        }
        .accessibilityLabel("\(enemy.kind.rawValue) enemy, \(Int(enemy.health.rounded())) hp")
    }

    // MARK: - Controls (keyboard hint + selected tile help)

    private var controls: some View {
        HStack {
            Image(systemName: "keyboard")
                .foregroundStyle(.white.opacity(0.45))
            Text("Click tile to build · 1/2/3/4 picks Basic/Cannon/Frost/Beam · Space starts wave · R resets")
                .font(.callout.weight(.semibold))
                .foregroundStyle(.white.opacity(0.62))
            Spacer()
        }
    }

    private var statusStrip: some View {
        HStack {
            Image(systemName: statusIcon)
                .foregroundStyle(statusColor)
            Text(status)
                .font(.callout.weight(.semibold))
                .foregroundStyle(.white.opacity(0.85))
                .lineLimit(2)
            Spacer()
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(Color.white.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    // MARK: - Helpers

    private var statusIcon: String {
        switch engine.phase {
        case .ready:   return "play.circle.fill"
        case .playing: return "wave.3.right.circle.fill"
        case .won:     return "checkmark.seal.fill"
        case .lost:    return "exclamationmark.triangle.fill"
        }
    }

    private var statusColor: Color {
        switch engine.phase {
        case .ready: return .cyan
        case .playing: return .yellow
        case .won: return .green
        case .lost: return .red
        }
    }

    private var phaseLabel: String {
        switch engine.phase {
        case .ready: return engine.wave == 0 ? "READY" : "BETWEEN WAVES"
        case .playing: return "WAVE \(engine.wave)"
        case .won: return "WAVE CLEARED"
        case .lost: return "BASE BREACHED"
        }
    }

    private var boardWidth: CGFloat {
        boardPadding * 2 + CGFloat(TowerDefenseBoard.columns) * cellSize + CGFloat(TowerDefenseBoard.columns - 1) * cellGap
    }

    private var boardHeight: CGFloat {
        boardPadding * 2 + CGFloat(TowerDefenseBoard.rows) * cellSize + CGFloat(TowerDefenseBoard.rows - 1) * cellGap
    }

    private var allPoints: [PuzzlePoint] {
        (0..<TowerDefenseBoard.rows).flatMap { row in
            (0..<TowerDefenseBoard.columns).map { col in PuzzlePoint(row: row, col: col) }
        }
    }

    private func statBlock(label: String, value: String, tint: Color) -> some View {
        HStack(spacing: 6) {
            Text(label)
                .font(.caption2.weight(.black))
                .foregroundStyle(.white.opacity(0.55))
            Text(value)
                .font(.system(size: 18, weight: .heavy, design: .rounded))
                .foregroundStyle(tint)
                .monospacedDigit()
        }
    }

    // Tower kind visual mapping. Mirrors the four web turret variants:
    //   Basic  — yellow/silver single barrel, fast/cheap (Image: gun barrel pointing right)
    //   Cannon — chunky brown/grey heavy weapon with splash on impact
    //   Frost  — cyan/white crystal core, slows enemies on hit
    //   Beam   — purple/magenta laser emitter that draws a continuous beam to its target
    private func towerLabel(_ k: TowerKind) -> String {
        switch k {
        case .basic:  return "Basic"
        case .cannon: return "Cannon"
        case .frost:  return "Frost"
        case .beam:   return "Beam"
        }
    }
    private func towerHint(_ k: TowerKind) -> String {
        switch k {
        case .basic:  return "fast, balanced"
        case .cannon: return "splash damage"
        case .frost:  return "slows enemies"
        case .beam:   return "long-range laser"
        }
    }
    private func towerTint(_ k: TowerKind) -> Color {
        switch k {
        case .basic:  return Color(red: 0.95, green: 0.78, blue: 0.20)   // yellow/gold (single barrel)
        case .cannon: return Color(red: 0.78, green: 0.55, blue: 0.30)   // burnt orange (heavy weapon)
        case .frost:  return Color(red: 0.55, green: 0.85, blue: 0.97)   // ice cyan
        case .beam:   return Color(red: 0.78, green: 0.50, blue: 0.95)   // laser purple
        }
    }
    /// SF Symbol that visually reads as the corresponding turret. Beam uses a
    /// laser symbol so the player understands that's where the line comes from.
    private func towerSymbol(_ k: TowerKind) -> String {
        switch k {
        case .basic:  return "dot.scope"
        case .cannon: return "circle.grid.cross.fill"
        case .frost:  return "snowflake"
        case .beam:   return "wand.and.rays"
        }
    }

    private func cellFill(pathTile: Bool, canBuild: Bool) -> Color {
        if pathTile { return Color(red: 0.42, green: 0.32, blue: 0.16) }
        if canBuild { return Color(red: 0.16, green: 0.36, blue: 0.22) }
        return Color(red: 0.10, green: 0.22, blue: 0.16)
    }

    private func cellHelp(point: PuzzlePoint, placedTower: TowerDefenseTower?, pathTile: Bool) -> String {
        if let t = placedTower { return "\(towerLabel(t.kind)) tower (range \(Int(t.range)), damage \(Int(t.damage)))" }
        if pathTile { return "Enemy path — towers can't build here" }
        if engine.credits < pickedKind.cost { return "Need $\(pickedKind.cost) for \(towerLabel(pickedKind))" }
        return "Click to build a \(towerLabel(pickedKind)) ($\(pickedKind.cost))"
    }

    private func cellAccessibility(point: PuzzlePoint, placedTower: TowerDefenseTower?, pathTile: Bool) -> String {
        if let t = placedTower { return "\(towerLabel(t.kind)) tower at row \(point.row + 1), column \(point.col + 1)" }
        if pathTile { return "Enemy path at row \(point.row + 1), column \(point.col + 1)" }
        return "Build site at row \(point.row + 1), column \(point.col + 1)"
    }

    private func isPath(_ point: PuzzlePoint) -> Bool {
        TowerDefenseBoard.defaultPath.contains(point)
    }

    private func canPlaceTower(at point: PuzzlePoint) -> Bool {
        !isPath(point) && engine.credits >= pickedKind.cost && !engine.towers.contains(where: { $0.position == point })
    }

    // MARK: - Actions

    private func placeSelectedTower() {
        guard let point = selected else {
            status = "Select a green tile first."
            return
        }
        guard !isPath(point) else {
            status = "That's the enemy path — towers can't build there."
            return
        }
        guard !engine.towers.contains(where: { $0.position == point }) else {
            status = "A tower is already there."
            return
        }
        guard engine.credits >= pickedKind.cost else {
            status = "Not enough gold for \(towerLabel(pickedKind)) ($\(pickedKind.cost) needed)."
            return
        }

        if engine.placeTower(at: point, kind: pickedKind) {
            status = "\(towerLabel(pickedKind)) tower placed."
            print("[TowerDefenseExample] tower kind=\(pickedKind.rawValue) row=\(point.row) col=\(point.col) credits=\(engine.credits)")
        }
    }

    private func startWave() {
        guard engine.phase != .playing, engine.phase != .lost else { return }
        engine.startWave(count: 7 + engine.wave)
        status = "Wave \(engine.wave) incoming — defend the base!"
        print("[TowerDefenseExample] start wave=\(engine.wave) enemies=\(engine.enemies.count)")
    }

    private func tick() {
        guard engine.phase == .playing else { return }
        engine.update(dt: 0.12)
        switch engine.phase {
        case .won:
            status = "Wave \(engine.wave) cleared. \(engine.lives) lives, $\(engine.credits) gold."
            print("[TowerDefenseExample] wave cleared credits=\(engine.credits) lives=\(engine.lives)")
        case .lost:
            status = "Base breached! Press R to reset."
            print("[TowerDefenseExample] lost wave=\(engine.wave)")
        default:
            let normals = engine.enemies.filter { $0.kind == .normal }.count
            let fasts = engine.enemies.filter { $0.kind == .fast }.count
            let heavies = engine.enemies.filter { $0.kind == .heavy }.count
            var parts: [String] = []
            if normals > 0 { parts.append("\(normals) normal") }
            if fasts > 0   { parts.append("\(fasts) fast") }
            if heavies > 0 { parts.append("\(heavies) heavy") }
            let breakdown = parts.isEmpty ? "no enemies left" : parts.joined(separator: " · ")
            status = "Wave \(engine.wave): \(breakdown)."
        }
    }

    private func moveSelection(_ direction: GridDirection) {
        let current = selected ?? PuzzlePoint(row: 3, col: 1)
        let next = current.moved(direction)
        guard next.row >= 0, next.row < TowerDefenseBoard.rows,
              next.col >= 0, next.col < TowerDefenseBoard.columns else { return }
        selected = next
    }

    private func newGame() {
        engine = TowerDefenseEngine(path: TowerDefenseBoard.defaultPath)
        selected = nil
        pickedKind = .basic
        status = "New game. Pick a tower, then click a green tile to build."
        print("[TowerDefenseExample] new game")
    }

    private func cellCenter(_ point: PuzzlePoint) -> CGPoint {
        CGPoint(
            x: CGFloat(point.col) * (cellSize + cellGap) + cellSize / 2,
            y: CGFloat(point.row) * (cellSize + cellGap) + cellSize / 2
        )
    }

    private func enemyCenter(_ enemy: TowerDefenseEnemy) -> CGPoint {
        let progress = max(enemy.progress, 0)
        let lowerIndex = max(0, min(engine.path.count - 1, Int(progress.rounded(.down))))
        let upperIndex = min(engine.path.count - 1, lowerIndex + 1)
        let local = min(max(progress - Double(lowerIndex), 0), 1)
        let start = cellCenter(engine.path[lowerIndex])
        let end = cellCenter(engine.path[upperIndex])

        return CGPoint(
            x: boardPadding + start.x + (end.x - start.x) * local,
            y: boardPadding + start.y + (end.y - start.y) * local
        )
    }
}

// MARK: - Keyboard capture

private struct TowerDefenseKeyboardCaptureView: NSViewRepresentable {
    var onPlaceTower: () -> Void
    var onStartWave: () -> Void
    var onReset: () -> Void
    var onMove: (GridDirection) -> Void
    var onPickBasic: () -> Void
    var onPickCannon: () -> Void
    var onPickFrost: () -> Void
    var onPickBeam: () -> Void

    func makeNSView(context: Context) -> TowerDefenseKeyCatcherView {
        let view = TowerDefenseKeyCatcherView()
        wire(view)
        DispatchQueue.main.async { view.window?.makeFirstResponder(view) }
        return view
    }

    func updateNSView(_ nsView: TowerDefenseKeyCatcherView, context: Context) {
        wire(nsView)
        DispatchQueue.main.async { nsView.window?.makeFirstResponder(nsView) }
    }

    private func wire(_ v: TowerDefenseKeyCatcherView) {
        v.onPlaceTower = onPlaceTower
        v.onStartWave = onStartWave
        v.onReset = onReset
        v.onMove = onMove
        v.onPickBasic = onPickBasic
        v.onPickCannon = onPickCannon
        v.onPickFrost = onPickFrost
        v.onPickBeam = onPickBeam
    }
}

private final class TowerDefenseKeyCatcherView: NSView {
    var onPlaceTower: (() -> Void)?
    var onStartWave: (() -> Void)?
    var onReset: (() -> Void)?
    var onMove: ((GridDirection) -> Void)?
    var onPickBasic: (() -> Void)?
    var onPickCannon: (() -> Void)?
    var onPickFrost: (() -> Void)?
    var onPickBeam: (() -> Void)?

    override var acceptsFirstResponder: Bool { true }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        DispatchQueue.main.async { self.window?.makeFirstResponder(self) }
    }

    override func keyDown(with event: NSEvent) {
        switch event.keyCode {
        case 123: onMove?(.left)
        case 124: onMove?(.right)
        case 125: onMove?(.down)
        case 126: onMove?(.up)
        case 36:  onPlaceTower?()       // Return
        case 49:  onStartWave?()        // Space
        case 18:  onPickBasic?()        // 1
        case 19:  onPickCannon?()       // 2
        case 20:  onPickFrost?()        // 3
        case 21:  onPickBeam?()         // 4
        case 15:  onReset?()            // R
        default:
            if event.charactersIgnoringModifiers?.lowercased() == "r" {
                onReset?()
            }
        }
    }
}
