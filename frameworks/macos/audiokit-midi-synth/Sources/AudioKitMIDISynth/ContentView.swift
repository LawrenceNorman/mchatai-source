import AudioKit
import AudioKitUI
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

            KeyboardWrapper(conductor: conductor)
                .frame(height: 140)
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

/// Bridges AudioKitUI's `KeyboardView` (NSViewRepresentable internally on macOS)
/// to our conductor. Keep this thin — extension scaffolds usually replace this
/// view (e.g., piano-roll grid for sequencer mode) without touching the conductor.
struct KeyboardWrapper: View {
    let conductor: SynthConductor

    var body: some View {
        KeyboardControl(
            firstOctave: 3,
            octaveCount: 3,
            polyphonicMode: false,
            noteOn: { pitch, _ in conductor.noteOn(pitch: pitch.midiNoteNumber) },
            noteOff: { _ in conductor.noteOff() }
        )
    }
}
