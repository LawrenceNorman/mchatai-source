// Example glue — adapt freely. SwiftUI piano keyboard host:
//   1. Owns a PianoEngine seeded with one octave (default C4).
//   2. Renders white + black keys with proper layered geometry.
//   3. Tap (or A/W/S/E/D/F/T/G/Y/H/U/J keys) → engine.noteOn → UI highlight.
//   4. Releases on key/touch up → engine.noteOff.
//
// No game-over surface here (piano is a tool, not a game), so mac-022 doesn't
// apply. Reset Keys command (Cmd+R) clears any stuck active notes.

import SwiftUI
import AppKit

struct ContentView: View {
    @State private var engine = PianoEngine()
    @State private var lastFreq: Int = 0
    @FocusState private var hasKeyboardFocus: Bool

    private let whiteKeyWidth: CGFloat = 56
    private let whiteKeyHeight: CGFloat = 220
    private let blackKeyWidth: CGFloat = 36
    private let blackKeyHeight: CGFloat = 130

    private var whiteNotes: [PianoNote] { engine.notes.filter { !$0.isSharp } }
    private var blackNotes: [PianoNote] { engine.notes.filter { $0.isSharp } }

    var body: some View {
        VStack(spacing: 16) {
            HStack(alignment: .firstTextBaseline) {
                Text("Piano")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                Spacer()
                Text(lastFreq > 0 ? "\(lastFreq) Hz" : "—")
                    .font(.system(size: 18, weight: .semibold, design: .monospaced))
                    .foregroundStyle(.secondary)
            }

            keyboard
                .frame(height: whiteKeyHeight + 24)

            HStack(spacing: 10) {
                Button("Reset Keys") { resetKeys() }
                Spacer()
                Text("Click keys · A W S E D F T G Y H U J on the keyboard")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(20)
        .frame(minWidth: 7 * whiteKeyWidth + 60, minHeight: whiteKeyHeight + 110)
        .focusable()
        .focused($hasKeyboardFocus)
        .onAppear { hasKeyboardFocus = true }
        .onReceive(NotificationCenter.default.publisher(for: .pianoReset)) { _ in resetKeys() }
        .onKeyPress(phases: [.down, .up]) { press in
            handleKeyboard(char: press.characters.first, isDown: press.phase == .down)
            return .handled
        }
    }

    @ViewBuilder
    private var keyboard: some View {
        ZStack(alignment: .topLeading) {
            // White keys
            HStack(spacing: 2) {
                ForEach(whiteNotes) { note in
                    whiteKey(note)
                }
            }
            // Black keys overlaid at correct positions (between white keys 0/1, 1/2, 3/4, 4/5, 5/6).
            // Indexes within whiteNotes for which a black-key gap follows: 0 (C→D), 1 (D→E),
            // 3 (F→G), 4 (G→A), 5 (A→B). E→F and B→C have no black key between them.
            ForEach(Array(blackNotes.enumerated()), id: \.element.id) { idx, note in
                let whiteIndex = blackKeyWhiteIndex(idx)
                blackKey(note)
                    .offset(
                        x: CGFloat(whiteIndex + 1) * (whiteKeyWidth + 2) - blackKeyWidth / 2 - 1,
                        y: 0
                    )
            }
        }
    }

    /// Maps index within blackNotes (0...4) to the white-key index it sits between.
    /// Black key 0 = C# → between C(0) and D(1) → returns 0.
    /// Black key 1 = D# → between D(1) and E(2) → returns 1.
    /// Black key 2 = F# → between F(3) and G(4) → returns 3.
    /// Black key 3 = G# → between G(4) and A(5) → returns 4.
    /// Black key 4 = A# → between A(5) and B(6) → returns 5.
    private func blackKeyWhiteIndex(_ blackIndex: Int) -> Int {
        switch blackIndex {
        case 0: return 0
        case 1: return 1
        case 2: return 3
        case 3: return 4
        case 4: return 5
        default: return 0
        }
    }

    @ViewBuilder
    private func whiteKey(_ note: PianoNote) -> some View {
        let pressed = engine.activeNotes.contains(note.id)
        Rectangle()
            .fill(pressed ? Color(red: 0.85, green: 0.92, blue: 1.0) : .white)
            .frame(width: whiteKeyWidth, height: whiteKeyHeight)
            .overlay(alignment: .bottom) {
                Text(note.name)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(.black.opacity(0.55))
                    .padding(.bottom, 8)
            }
            .clipShape(RoundedRectangle(cornerRadius: 4))
            .shadow(color: .black.opacity(0.18), radius: 2, x: 0, y: 1)
            .onTapGesture { strike(note) }
    }

    @ViewBuilder
    private func blackKey(_ note: PianoNote) -> some View {
        let pressed = engine.activeNotes.contains(note.id)
        Rectangle()
            .fill(pressed ? Color(red: 0.32, green: 0.40, blue: 0.55) : Color.black)
            .frame(width: blackKeyWidth, height: blackKeyHeight)
            .overlay(alignment: .bottom) {
                Text(note.name)
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundStyle(.white.opacity(0.6))
                    .padding(.bottom, 4)
            }
            .clipShape(RoundedRectangle(cornerRadius: 3))
            .shadow(color: .black.opacity(0.4), radius: 1, x: 0, y: 1)
            .onTapGesture { strike(note) }
    }

    // MARK: - Input

    private func handleKeyboard(char: Character?, isDown: Bool) {
        guard let char else { return }
        let mapping: [Character: String] = [
            "a": "C4",  "w": "C#4", "s": "D4",  "e": "D#4", "d": "E4",
            "f": "F4",  "t": "F#4", "g": "G4",  "y": "G#4", "h": "A4",
            "u": "A#4", "j": "B4"
        ]
        guard let noteName = mapping[Character(char.lowercased())],
              let note = engine.notes.first(where: { $0.name == noteName }) else { return }
        if isDown {
            strike(note)
        } else {
            engine.noteOff(note)
        }
    }

    private func strike(_ note: PianoNote) {
        engine.noteOn(note)
        lastFreq = Int(note.frequency.rounded())
        // Real synth glue would play here. Default macOS beep keeps the example
        // self-contained without an AVAudioEngine dependency.
        NSSound.beep()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
            engine.noteOff(note)
        }
    }

    private func resetKeys() {
        engine = PianoEngine()
        lastFreq = 0
    }
}
