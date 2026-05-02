// BEGIN mChatAI macOS Component: music.piano (components/music/PianoEngine.swift)
import Foundation

struct PianoNote: Codable, Identifiable, Equatable, Sendable {
    let name: String
    let midi: Int
    let isSharp: Bool

    var id: String { name }

    var frequency: Double {
        440.0 * pow(2.0, Double(midi - 69) / 12.0)
    }
}

struct PianoEngine: Codable, Equatable, Sendable {
    private(set) var activeNotes: Set<String> = []
    let notes: [PianoNote]

    init(octave: Int = 4) {
        let names = [
            ("C", false), ("C#", true), ("D", false), ("D#", true), ("E", false),
            ("F", false), ("F#", true), ("G", false), ("G#", true), ("A", false),
            ("A#", true), ("B", false)
        ]
        let baseMidi = (octave + 1) * 12
        self.notes = names.enumerated().map { index, entry in
            PianoNote(name: "\(entry.0)\(octave)", midi: baseMidi + index, isSharp: entry.1)
        }
    }

    mutating func noteOn(_ note: PianoNote) {
        activeNotes.insert(note.id)
    }

    mutating func noteOff(_ note: PianoNote) {
        activeNotes.remove(note.id)
    }
}

enum PianoSmokeTests {
    static func launchReport() -> String {
        var piano = PianoEngine()
        if let note = piano.notes.first(where: { $0.name == "A4" }) {
            piano.noteOn(note)
            return "[PianoSmoke] note=\(note.name) frequency=\(Int(note.frequency.rounded())) active=\(piano.activeNotes.count)"
        }
        return "[PianoSmoke] missing A4"
    }

    static func printLaunchReport() {
        print(launchReport())
    }
}
// END mChatAI macOS Component: music.piano
