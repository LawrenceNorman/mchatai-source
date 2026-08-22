// Standalone verify harness: real decode → real repair → real render.
// Compiles the Toon model files with swiftc, outside Xcode, so authored
// content is judged by the exact code that will ship it.

import CoreGraphics
import Foundation
import ImageIO

@available(macOS 26.0, *)
func run() throws {
    let args = CommandLine.arguments
    guard args.count >= 4 else {
        print("usage: toonverify <mchatai-source/frameworks/toon-studio> <content-out> <verify-out>")
        exit(2)
    }
    let srcRoot = URL(fileURLWithPath: args[1])
    let newRoot = URL(fileURLWithPath: args[2])
    let outRoot = URL(fileURLWithPath: args[3])
    try FileManager.default.createDirectory(at: outRoot, withIntermediateDirectories: true)

    var library = ToonLibrary()
    var failures: [String] = []
    var newPuppets: [ToonPuppet] = []
    var newBackdrops: [ToonBackdrop] = []

    func jsons(_ dir: URL) -> [URL] {
        ((try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? [])
            .filter { $0.pathExtension == "json" && !$0.lastPathComponent.hasPrefix("_") }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
    }

    // Existing shipped content first.
    for url in jsons(srcRoot.appendingPathComponent("puppets")) {
        if let data = try? Data(contentsOf: url), let p = try? ToonPuppet.load(from: data) {
            library.add(ToonRigRepair.repair(p, id: p.id))
        }
    }
    for url in jsons(srcRoot.appendingPathComponent("backdrops")) {
        if let data = try? Data(contentsOf: url), let b = try? ToonBackdrop.load(from: data) {
            library.add(ToonRigRepair.repair(b, id: b.id))
        }
    }

    // New candidates — a decode failure here is a hard failure.
    for url in jsons(newRoot.appendingPathComponent("puppets")) {
        do {
            let raw = try ToonPuppet.load(from: try Data(contentsOf: url))
            let repaired = ToonRigRepair.repair(raw, id: raw.id)
            // Post-repair invariants the lint can't see.
            if repaired.resolvedKind == .character {
                let ids = Set(repaired.parts.map(\.id))
                for need in ["body", "head", "mouth", "eyes"] where !ids.contains(need) {
                    failures.append("\(url.lastPathComponent): post-repair missing \(need)")
                }
                if repaired.visemes.filter({ !$0.key.hasPrefix("face_") && !$0.key.contains("/") }).count < 9 {
                    failures.append("\(url.lastPathComponent): post-repair core visemes < 9")
                }
                let clipNames = Set((repaired.clips ?? [:]).keys.map { $0.lowercased() })
                for need in ["walk", "run"] where !clipNames.contains(need) {
                    failures.append("\(url.lastPathComponent): post-repair clip '\(need)' vanished")
                }
            }
            library.add(repaired)
            newPuppets.append(repaired)
            let clipList = (repaired.clips ?? [:]).keys.sorted().joined(separator: ",")
            print("puppet   \(repaired.id.padding(toLength: 28, withPad: " ", startingAt: 0)) parts=\(repaired.parts.count) visemes=\(repaired.visemes.count) clips=\(clipList)")
        } catch {
            failures.append("\(url.lastPathComponent): DECODE FAILED — \(error)")
        }
    }
    for url in jsons(newRoot.appendingPathComponent("backdrops")) {
        do {
            let raw = try ToonBackdrop.load(from: try Data(contentsOf: url))
            let repaired = ToonRigRepair.repair(raw, id: raw.id)
            library.add(repaired)
            newBackdrops.append(repaired)
            let count = ToonResolvedBackdrop(repaired).layers.reduce(0) { $0 + $1.paths.count }
            print("backdrop \(repaired.id.padding(toLength: 28, withPad: " ", startingAt: 0)) layers=\(repaired.layers.count) expanded=\(count)")
            if count < 170 {
                failures.append("\(url.lastPathComponent): post-repair expanded paths \(count) < 170")
            }
        } catch {
            failures.append("\(url.lastPathComponent): DECODE FAILED — \(error)")
        }
    }

    let renderer = ToonRenderer(library: library)

    func writePNG(_ image: CGImage, to url: URL) {
        guard let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil) else { return }
        CGImageDestinationAddImage(dest, image, nil)
        CGImageDestinationFinalize(dest)
    }

    func makeContext(_ w: Int, _ h: Int) -> CGContext? {
        CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                  space: CGColorSpaceCreateDeviceRGB(),
                  bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue
                      | CGBitmapInfo.byteOrder32Little.rawValue)
    }

    // Contact sheet: every NEW puppet, framed to its own bounds.
    do {
        let cell = 240
        let cols = 6
        let rows = (newPuppets.count + cols - 1) / cols
        if let sheet = makeContext(cell * cols, cell * rows) {
            sheet.setFillColor(CGColor(gray: 0.94, alpha: 1))
            sheet.fill(CGRect(x: 0, y: 0, width: cell * cols, height: cell * rows))
            for (i, puppet) in newPuppets.enumerated() {
                var solo = ToonLibrary()
                solo.add(puppet)
                guard let resolved = solo.puppets[puppet.id] else { continue }
                var box: CGRect?
                for entry in resolved.ordered {
                    for (path, _) in entry.paths {
                        let b = path.boundingBoxOfPath
                        guard !b.isNull, !b.isInfinite else { continue }
                        box = box.map { $0.union(b) } ?? b
                    }
                }
                let bounds = box ?? CGRect(x: -0.3, y: 0, width: 0.6, height: 1)
                let height = max(Double(bounds.height), 0.15)
                let state = ToonFrameState(
                    backdropID: nil,
                    camera: ToonCamera(x: Double(bounds.midX), y: Double(bounds.midY),
                                       zoom: 0.8 / height),
                    actors: [ToonActorState(puppetID: puppet.id, x: 0, y: 0, scale: 1,
                                            viseme: ToonViseme.slight)])
                if let ctx = makeContext(cell, cell) {
                    ToonRenderer(library: solo).draw(state, into: ctx, size: CGSize(width: cell, height: cell))
                    if let img = ctx.makeImage() {
                        let col = i % cols, row = rows - 1 - i / cols
                        sheet.draw(img, in: CGRect(x: col * cell, y: row * cell, width: cell, height: cell))
                    }
                }
            }
            if let img = sheet.makeImage() {
                writePNG(img, to: outRoot.appendingPathComponent("contact-puppets.png"))
            }
        }
    }

    // Contact sheet: every NEW backdrop at the wide framing.
    do {
        let cw = 384, ch = 216
        let cols = 3
        let rows = (newBackdrops.count + cols - 1) / cols
        if let sheet = makeContext(cw * cols, ch * rows) {
            for (i, backdrop) in newBackdrops.enumerated() {
                if let ctx = makeContext(cw, ch) {
                    renderer.draw(ToonFrameState(backdropID: backdrop.id,
                                                 camera: ToonCamera(x: 0, y: 0.46, zoom: 0.95),
                                                 actors: []),
                                  into: ctx, size: CGSize(width: cw, height: ch))
                    if let img = ctx.makeImage() {
                        let col = i % cols, row = rows - 1 - i / cols
                        sheet.draw(img, in: CGRect(x: col * cw, y: row * ch, width: cw, height: ch))
                    }
                }
            }
            if let img = sheet.makeImage() {
                writePNG(img, to: outRoot.appendingPathComponent("contact-backdrops.png"))
            }
        }
    }

    // Stories: decode, resolve every reference, render sample frames.
    for url in jsons(newRoot.appendingPathComponent("stories")) {
        do {
            let project = try ToonProject.load(from: try Data(contentsOf: url))
            let missing = library.missingPuppetIDs(for: project)
            if !missing.isEmpty {
                failures.append("\(url.lastPathComponent): missing puppets \(missing)")
            }
            for scene in project.scenes {
                if let id = scene.backdropID, library.backdrops[id] == nil {
                    failures.append("\(url.lastPathComponent): missing backdrop \(id)")
                }
            }
            let timeline = ToonTimeline(project)
            print("story    \(project.id.padding(toLength: 28, withPad: " ", startingAt: 0)) \(String(format: "%.1f", timeline.duration))s  \(timeline.frameCount) frames  \(project.scenes.count) scenes")
            let w = 384, h = 216
            let samples = 10
            if let strip = makeContext(w * 5, h * 2) {
                for s in 0..<samples {
                    let t = timeline.duration * (Double(s) + 0.5) / Double(samples)
                    if let ctx = makeContext(w, h) {
                        renderer.draw(timeline.state(at: t), into: ctx,
                                      size: CGSize(width: w, height: h))
                        if let img = ctx.makeImage() {
                            let col = s % 5, row = 1 - s / 5
                            strip.draw(img, in: CGRect(x: col * w, y: row * h, width: w, height: h))
                        }
                    }
                }
                if let img = strip.makeImage() {
                    writePNG(img, to: outRoot.appendingPathComponent("story-\(project.id).png"))
                }
            }
        } catch {
            failures.append("\(url.lastPathComponent): STORY DECODE FAILED — \(error)")
        }
    }

    print("")
    if failures.isEmpty {
        print("VERIFY PASS — contact sheets + story strips in \(outRoot.path)")
    } else {
        print("VERIFY FAIL:")
        for f in failures { print("  \(f)") }
        exit(1)
    }
}

if #available(macOS 26.0, *) {
    try run()
} else {
    fatalError("needs macOS 26")
}
