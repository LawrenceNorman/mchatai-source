// BEGIN mChatAI macOS Component: effects.sound-engine (components/effects/SoundEngine.swift)
import Foundation
import AVFoundation
import AppKit

/// Game-flavor sound effects engine. Loads CC0 sound assets bundled in the
/// generated app's `Resources/SFX/` directory and plays them on demand via
/// pooled AVAudioPlayer instances (one player per SFX, multiple instances
/// for overlapping playback).
///
/// Why this exists: arcade and game-flavored mini-apps (asteroids, pac-man,
/// match-3, plants-vs-zombies, breakout) NEED sound to feel complete. But
/// sound is easy to get wrong — jarring volumes, no fade-out on music,
/// playing on every render, no mute toggle. SoundEngine encapsulates the
/// production-quality patterns: pooled players for low-latency overlap,
/// debounced playback, music fade in/out, persistent mute, intensity
/// preset matching AnimationIntensity.
///
/// Quick start (in a SwiftUI App / View):
///   ```
///   SoundEngine.shared.play(.match3Pop)
///   SoundEngine.shared.loop(.puzzleAmbient, fadeIn: 1.5)
///   SoundEngine.shared.intensity = .punchy   // arcade pace
///   SoundEngine.shared.muted.toggle()        // user mute toggle
///   ```
///
/// Asset packaging contract: copy the `assets/sfx/*.ogg` files into the
/// generated app target's `Resources/SFX/` and ensure they're added to the
/// SwiftPM target's `resources` array as `.process("Resources")` (or in
/// xcodeproj, the "Copy Bundle Resources" build phase). SoundEngine looks
/// them up via `Bundle.main.url(forResource:withExtension:subdirectory:)`.
@available(macOS 11.0, *)
@MainActor
public final class SoundEngine: NSObject, ObservableObject {
    public static let shared = SoundEngine()

    /// Preset-driven volume / mute envelope. Switch presets to scale all
    /// sounds together; override individual fields for fine-tuning.
    @Published public var intensity: SoundIntensity = .standard

    /// User mute. Persisted to UserDefaults so it survives app restarts.
    /// Defaults to `false` (sound on). Visible mute toggle is required —
    /// see wisdom rule `audio-always-mute-toggle`.
    @Published public var muted: Bool {
        didSet {
            UserDefaults.standard.set(muted, forKey: "SoundEngine.muted")
            if muted { stopMusic(fadeOut: 0.3) }
        }
    }

    /// Pool of preloaded SFX players keyed by SFX case. Each entry holds 3
    /// player instances so overlapping plays (e.g. rapid-fire match clears)
    /// don't truncate each other. Created lazily on first play.
    private var sfxPool: [SFX: [AVAudioPlayer]] = [:]
    private var sfxPoolIndex: [SFX: Int] = [:]
    private let poolSize = 3

    /// Currently looping music player (one at a time). nil when nothing's
    /// playing. Fade in/out implemented via volume ramps on a Timer.
    private var musicPlayer: AVAudioPlayer?
    /// Generation counter for the music fade task. Bumping it cancels any
    /// in-progress fade. (Used instead of Timer to satisfy Swift 6 strict
    /// concurrency around Sendable closures.)
    private var fadeGeneration: Int = 0

    /// Last-play timestamp per SFX case for debouncing — avoids stacking
    /// dozens of identical pops in a single frame.
    private var lastPlayed: [SFX: Date] = [:]

    /// Minimum interval between repeated plays of the same SFX. Prevents
    /// the audio engine from getting hammered when (e.g.) a UI re-renders
    /// rapidly. Default 30ms; raise for very short snappy SFX.
    public var debounceInterval: TimeInterval = 0.030

    private override init() {
        self.muted = UserDefaults.standard.bool(forKey: "SoundEngine.muted")
        super.init()
    }

    // MARK: - SFX

    /// Play a one-shot SFX. Safe to call from any thread; AVAudioPlayer
    /// hops to the audio queue internally. Honors mute, intensity volume,
    /// and per-SFX debounce.
    public func play(_ sfx: SFX, volume: Float = 1.0) {
        guard !muted else { return }

        // Debounce repeated calls — if the same SFX fired within the
        // window, swallow it. Without this, render-loop-driven UIs can
        // stack 20+ identical players in a single frame.
        let now = Date()
        if let last = lastPlayed[sfx], now.timeIntervalSince(last) < debounceInterval {
            return
        }
        lastPlayed[sfx] = now

        guard let players = ensurePool(for: sfx) else { return }
        // Round-robin through the pool so overlapping plays don't truncate.
        let idx = (sfxPoolIndex[sfx] ?? 0) % players.count
        sfxPoolIndex[sfx] = idx + 1
        let player = players[idx]
        player.currentTime = 0
        player.volume = max(0, min(1, volume * intensity.sfxVolume))
        player.play()
    }

    /// Convenience: play with explicit pitch shift via playbackRate.
    /// Useful for cascades — each cascade depth bumps pitch +1 semitone
    /// for the satisfying ascending chord. Pass `pitchSemitones: 0` for
    /// neutral (same as `play()`).
    public func play(_ sfx: SFX, volume: Float = 1.0, pitchSemitones: Int) {
        guard !muted, pitchSemitones != 0 else { play(sfx, volume: volume); return }
        guard let players = ensurePool(for: sfx) else { return }
        let idx = (sfxPoolIndex[sfx] ?? 0) % players.count
        sfxPoolIndex[sfx] = idx + 1
        let player = players[idx]
        player.currentTime = 0
        player.volume = max(0, min(1, volume * intensity.sfxVolume))
        // Each semitone is 2^(1/12) ≈ 1.0595 rate change. Capped to
        // [0.5, 2.0] = ±12 semitones; outside that AVAudioPlayer artifacts
        // become obvious. AVAudioPlayer.enableRate must be true to honor
        // .rate (set lazily in ensurePool).
        let rate = pow(2.0, Double(pitchSemitones) / 12.0)
        player.rate = Float(max(0.5, min(2.0, rate)))
        player.play()
    }

    // MARK: - Music

    /// Start looping a music track with a fade-in. Replaces any currently
    /// playing music (with a quick crossfade-via-stop). Music keeps playing
    /// until `stopMusic` is called or `muted` flips to true.
    public func loop(_ music: Music, fadeIn: TimeInterval = 1.0) {
        guard !muted else { return }

        // Stop existing music with a quick fade so we don't get a hard cut
        // when switching tracks.
        if musicPlayer != nil {
            stopMusic(fadeOut: 0.3)
        }

        guard let url = music.url else {
            print("⚠️ SoundEngine: music asset missing for \(music.rawValue)")
            return
        }
        do {
            let player = try AVAudioPlayer(contentsOf: url)
            player.numberOfLoops = -1  // infinite
            player.volume = 0
            player.prepareToPlay()
            player.play()
            musicPlayer = player
            startFade(toVolume: intensity.musicVolume, duration: fadeIn)
        } catch {
            print("⚠️ SoundEngine: failed to load music \(music.rawValue): \(error)")
        }
    }

    public func stopMusic(fadeOut: TimeInterval = 1.0) {
        guard let player = musicPlayer else { return }
        if fadeOut <= 0 {
            player.stop()
            musicPlayer = nil
            return
        }
        startFade(toVolume: 0, duration: fadeOut) { [weak self] in
            self?.musicPlayer?.stop()
            self?.musicPlayer = nil
        }
    }

    // MARK: - Internals

    private func ensurePool(for sfx: SFX) -> [AVAudioPlayer]? {
        if let existing = sfxPool[sfx] { return existing }
        guard let url = sfx.url else {
            print("⚠️ SoundEngine: SFX asset missing for \(sfx.rawValue)")
            return nil
        }
        var players: [AVAudioPlayer] = []
        for _ in 0..<poolSize {
            do {
                let p = try AVAudioPlayer(contentsOf: url)
                p.enableRate = true  // allow pitch-shift via .rate
                p.prepareToPlay()
                players.append(p)
            } catch {
                print("⚠️ SoundEngine: failed to create player for \(sfx.rawValue): \(error)")
            }
        }
        guard !players.isEmpty else { return nil }
        sfxPool[sfx] = players
        return players
    }

    private func startFade(toVolume target: Float, duration: TimeInterval, completion: (() -> Void)? = nil) {
        // Cancel any in-progress fade by bumping the generation counter —
        // older fade tasks will see the mismatch and bail. Avoids Timer's
        // Sendable headaches under Swift 6 strict concurrency.
        fadeGeneration += 1
        let myGen = fadeGeneration

        guard let player = musicPlayer, duration > 0 else {
            musicPlayer?.volume = target
            completion?()
            return
        }
        let startVolume = player.volume
        let startTime = Date()

        Task { @MainActor in
            while myGen == self.fadeGeneration {
                guard let p = self.musicPlayer else { return }
                let elapsed = Date().timeIntervalSince(startTime)
                let t = min(1, max(0, elapsed / duration))
                p.volume = startVolume + (target - startVolume) * Float(t)
                if t >= 1 {
                    completion?()
                    return
                }
                try? await Task.sleep(nanoseconds: 33_000_000)  // ~30 fps
            }
        }
    }
}

// MARK: - SFX enum (semantic names; mapped to bundled files)

/// Semantic names for sound effects. Generated apps reference SFX by case
/// rather than file path so the underlying audio file can change without
/// touching every game. New SFX should be added here AND a corresponding
/// `.ogg` file copied into `Resources/SFX/` with the matching basename.
@available(macOS 11.0, *)
public enum SFX: String, CaseIterable, Sendable {
    // UI
    case uiButtonTap = "ui-button-tap"
    case uiError = "ui-error"
    case uiToggle = "ui-toggle"

    // Match-3 / puzzle (used by Match3 reference app)
    case match3Pop = "puzzle-pop"             // 3-match standard clear
    case match3Burst = "puzzle-burst"         // 4-match line-clear
    case match3Bomb = "puzzle-bomb"           // 5-match lightning
    case match3GlassClear = "puzzle-glass-clear" // alternate clear (lighter)
    case puzzleCascade = "puzzle-cascade"     // chain-cascade chord

    // Card / casino
    case cardSlide = "card-slide"
    case cardShove = "card-shove"
    case diceThrow = "dice-throw"
    case chipPlace = "chip-place"

    // Arcade / sci-fi
    case arcadeLaser = "arcade-laser"
    case arcadeLaserBig = "arcade-laser-big"
    case arcadeExplosion = "arcade-explosion"
    case arcadeExplosionBig = "arcade-explosion-big"
    case arcadeThruster = "arcade-thruster"
    case arcadeShield = "arcade-shield"
    case arcadePowerUp = "arcade-power-up"

    // Impact (platformer / physics)
    case impactWood = "impact-wood"
    case impactPlate = "impact-plate"
    case impactFootstep = "impact-footstep"

    // Win / lose
    case victory = "victory"
    case levelUp = "level-up"
    case gameOver = "game-over"

    /// File URL within the app bundle. Returns nil if the asset isn't packaged.
    ///
    /// Resolution order:
    ///   1. `Bundle.main.url(forResource:withExtension:subdirectory:"SFX")`
    ///   2. `Bundle.main.url(forResource:withExtension:)` (flat)
    ///   3. SwiftPM resource bundle (`<Module>_<Module>.bundle/SFX/<name>.<ext>`)
    ///   4. Direct path build via Bundle.main.resourcePath + "/SFX/<name>.<ext>"
    ///   5. Same direct-path search inside any `*.bundle` under Resources/
    ///
    /// Step 4 and 5 exist because `Bundle.main.url(forResource:subdirectory:)`
    /// has been observed to return nil when the file IS present in the
    /// directory — likely a Bundle.main caching quirk on freshly-modified
    /// .app folders. Building the URL directly bypasses Bundle's index.
    public var url: URL? {
        let name = self.rawValue
        let exts = ["m4a", "mp3", "wav", "aiff", "aif", "caf", "ogg"]

        for ext in exts {
            if let u = Bundle.main.url(forResource: name, withExtension: ext, subdirectory: "SFX") { return u }
            if let u = Bundle.main.url(forResource: name, withExtension: ext) { return u }
        }

        let fm = FileManager.default

        // 4. Direct path inside the main bundle's Resources/SFX/.
        if let resPath = Bundle.main.resourcePath {
            for ext in exts {
                let candidate = "\(resPath)/SFX/\(name).\(ext)"
                if fm.fileExists(atPath: candidate) {
                    return URL(fileURLWithPath: candidate)
                }
            }
        }

        // 5. SwiftPM resource bundles (Module_Module.bundle/SFX/<file>) and
        // any other *.bundle under Resources/.
        if let resPath = Bundle.main.resourcePath,
           let entries = try? fm.contentsOfDirectory(atPath: resPath) {
            for entry in entries where entry.hasSuffix(".bundle") {
                for ext in exts {
                    let candidate = "\(resPath)/\(entry)/SFX/\(name).\(ext)"
                    if fm.fileExists(atPath: candidate) {
                        return URL(fileURLWithPath: candidate)
                    }
                    let flatCandidate = "\(resPath)/\(entry)/\(name).\(ext)"
                    if fm.fileExists(atPath: flatCandidate) {
                        return URL(fileURLWithPath: flatCandidate)
                    }
                }
            }
        }

        return nil
    }
}

// MARK: - Music enum (placeholder; v1 ships SFX only — music loops are TODO)

/// Looping background music tracks. v1 of the SFX framework ships SFX only;
/// music loops will be added in a follow-up commit (Kenney music packs are
/// bundled separately and need separate curation). Each generated app that
/// wants music should bundle its own loop into `Resources/Music/`.
@available(macOS 11.0, *)
public enum Music: String, CaseIterable, Sendable {
    case puzzleAmbient = "music-puzzle-ambient"
    case arcadeUpbeat = "music-arcade-upbeat"
    case casinoLounge = "music-casino-lounge"
    case retroChiptune = "music-retro-chiptune"

    public var url: URL? {
        let name = self.rawValue
        for ext in ["ogg", "m4a", "mp3", "aiff", "wav"] {
            if let u = Bundle.main.url(forResource: name, withExtension: ext, subdirectory: "Music") { return u }
            if let u = Bundle.main.url(forResource: name, withExtension: ext) { return u }
        }
        return nil
    }
}

// MARK: - SoundIntensity

/// Volume / pacing struct mirroring AnimationIntensity. Pick a preset by
/// game pace; override individual fields for fine-tuning.
@available(macOS 11.0, *)
public struct SoundIntensity: Equatable, Sendable {
    public var sfxVolume: Float = 0.65
    public var musicVolume: Float = 0.35

    public init() {}
    public init(sfxVolume: Float, musicVolume: Float) {
        self.sfxVolume = sfxVolume
        self.musicVolume = musicVolume
    }

    /// For productivity / utility apps that want subtle audio punctuation
    /// without overshadowing focus work.
    public static let subtle = SoundIntensity(sfxVolume: 0.35, musicVolume: 0.15)

    /// Validated default. Mechanics-driven games (match-3, minesweeper).
    public static let standard = SoundIntensity()

    /// Arcade-pace games (asteroids, pacman, plants-vs-zombies, kids).
    public static let punchy = SoundIntensity(sfxVolume: 0.85, musicVolume: 0.55)

    /// Soft / relaxing games (solitaire, idle, ambient puzzlers).
    public static let soft = SoundIntensity(sfxVolume: 0.5, musicVolume: 0.45)
}

// END mChatAI macOS Component: effects.sound-engine
