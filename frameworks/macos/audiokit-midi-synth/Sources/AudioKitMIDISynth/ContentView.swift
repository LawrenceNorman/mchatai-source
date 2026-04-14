import AudioKit
import SwiftUI

struct ContentView: View {
    @EnvironmentObject var conductor: SynthConductor

    var body: some View {
        VStack(spacing: 16) {
            Text("AudioKit MIDI Synth")
                .font(.title2.weight(.semibold))

            HStack(spacing: 24) {
                waveformPicker
                envelopeSliders
            }
            .padding(.horizontal)

            SimplePianoKeyboard(
                startPitch: 48,  // C3
                keyCount: 24,
                onNoteOn: { pitch in conductor.noteOn(pitch: MIDINoteNumber(pitch)) },
                onNoteOff: { _ in conductor.noteOff() }
            )
            .frame(height: 140)
            .padding(.horizontal, 8)
        }
        .padding(20)
    }

    private var waveformPicker: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Oscillator").font(.caption).foregroundStyle(.secondary)
            Picker("", selection: $conductor.waveform) {
                ForEach(SynthConductor.Waveform.allCases) { w in
                    Text(w.rawValue.capitalized).tag(w)
                }
            }
            .pickerStyle(.segmented)
            .frame(width: 280)
        }
    }

    private var envelopeSliders: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("ADSR").font(.caption).foregroundStyle(.secondary)
            HStack {
                slider("A", value: $conductor.attack,  range: 0.001...2.0)
                slider("D", value: $conductor.decay,   range: 0.001...2.0)
                slider("S", value: $conductor.sustain, range: 0.0...1.0)
                slider("R", value: $conductor.release, range: 0.001...4.0)
            }
        }
    }

    private func slider(_ label: String, value: Binding<AUValue>, range: ClosedRange<AUValue>) -> some View {
        VStack(spacing: 2) {
            Text(label).font(.caption2).monospaced()
            Slider(value: value, in: range).frame(width: 70)
            Text(String(format: "%.2f", value.wrappedValue)).font(.caption2).monospaced()
        }
    }
}

/// Minimal SwiftUI piano keyboard — no external UI dependency.
///
/// This is deliberately hand-rolled (vs. the AudioKit `Keyboard` package) so the
/// scaffold has ZERO extra SPM deps beyond core AudioKit. AIWizard extension
/// scaffolds (V4 sequencer, V5 DAW-lite) can replace this with a piano-roll
/// grid, velocity-sensitive keys, or a full DAW timeline without touching the
/// Conductor. Standard MIDI note numbers: C4 = 60.
struct SimplePianoKeyboard: View {
    let startPitch: Int
    let keyCount: Int
    let onNoteOn: (Int) -> Void
    let onNoteOff: (Int) -> Void

    @State private var pressedPitch: Int?

    private static let blackKeyOffsets: Set<Int> = [1, 3, 6, 8, 10]

    var body: some View {
        GeometryReader { geo in
            let whiteKeys = (0..<keyCount).filter { !Self.isBlack(pitch: startPitch + $0) }
            let whiteKeyWidth = geo.size.width / CGFloat(whiteKeys.count)
            ZStack(alignment: .topLeading) {
                HStack(spacing: 0) {
                    ForEach(whiteKeys, id: \.self) { offset in
                        let pitch = startPitch + offset
                        keyView(pitch: pitch, isBlack: false)
                            .frame(width: whiteKeyWidth)
                    }
                }
                ForEach(0..<keyCount, id: \.self) { offset in
                    let pitch = startPitch + offset
                    if Self.isBlack(pitch: pitch) {
                        let whiteIdx = whiteKeys.firstIndex { ($0 + 1) == offset } ?? 0
                        keyView(pitch: pitch, isBlack: true)
                            .frame(width: whiteKeyWidth * 0.6, height: geo.size.height * 0.6)
                            .offset(x: whiteKeyWidth * CGFloat(whiteIdx + 1) - whiteKeyWidth * 0.3)
                    }
                }
            }
        }
    }

    private static func isBlack(pitch: Int) -> Bool {
        blackKeyOffsets.contains(pitch % 12)
    }

    @ViewBuilder
    private func keyView(pitch: Int, isBlack: Bool) -> some View {
        let isPressed = pressedPitch == pitch
        RoundedRectangle(cornerRadius: 4)
            .fill(isBlack ? (isPressed ? Color.blue : Color.black) : (isPressed ? Color.blue.opacity(0.3) : Color.white))
            .overlay(RoundedRectangle(cornerRadius: 4).stroke(Color.gray, lineWidth: 0.5))
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in
                        if pressedPitch != pitch {
                            if let prev = pressedPitch { onNoteOff(prev) }
                            pressedPitch = pitch
                            onNoteOn(pitch)
                        }
                    }
                    .onEnded { _ in
                        if pressedPitch == pitch {
                            onNoteOff(pitch)
                            pressedPitch = nil
                        }
                    }
            )
    }
}
