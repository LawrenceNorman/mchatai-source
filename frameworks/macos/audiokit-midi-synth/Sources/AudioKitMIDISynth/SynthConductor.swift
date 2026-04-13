import AudioKit
import SoundpipeAudioKit
import Combine
import Foundation

/// Owns the AudioKit signal graph for the synth.
///
/// Pattern: SwiftUI views observe this `ObservableObject` and call high-level
/// methods (`noteOn`, `noteOff`, `setWaveform`). All AudioKit node connections
/// happen inside the Conductor — views never touch the engine directly.
///
/// When extending (sequencer, MIDI input, effects, multi-track), keep this
/// shape: one Conductor per audio scene, views bind via `@EnvironmentObject`.
final class SynthConductor: ObservableObject {
    enum Waveform: String, CaseIterable, Identifiable {
        case sine, square, sawtooth, triangle
        var id: String { rawValue }
        var table: Table {
            switch self {
            case .sine:     return Table(.sine)
            case .square:   return Table(.square)
            case .sawtooth: return Table(.sawtooth)
            case .triangle: return Table(.triangle)
            }
        }
    }

    @Published var attack: AUValue = 0.05
    @Published var decay: AUValue = 0.10
    @Published var sustain: AUValue = 0.70
    @Published var release: AUValue = 0.40
    @Published var waveform: Waveform = .sine {
        didSet { oscillator.setWaveform(waveform.table) }
    }

    private let engine = AudioEngine()
    private let oscillator: DynamicOscillator
    private let envelope: AmplitudeEnvelope

    init() {
        oscillator = DynamicOscillator(waveform: Waveform.sine.table)
        envelope = AmplitudeEnvelope(oscillator,
                                     attackDuration: attack,
                                     decayDuration: decay,
                                     sustainLevel: sustain,
                                     releaseDuration: release)
        engine.output = envelope
        oscillator.start()
    }

    func start() throws {
        try engine.start()
    }

    func stop() {
        engine.stop()
    }

    /// Trigger a MIDI note. `pitch` is a MIDI note number (60 = C4).
    /// `velocity` is 0–127 (mapped to amplitude 0.0–1.0).
    func noteOn(pitch: MIDINoteNumber, velocity: MIDIVelocity = 90) {
        applyEnvelopeParams()
        oscillator.frequency = pitch.midiNoteToFrequency()
        oscillator.amplitude = AUValue(velocity) / 127.0
        envelope.openGate()
    }

    func noteOff() {
        envelope.closeGate()
    }

    private func applyEnvelopeParams() {
        envelope.attackDuration = attack
        envelope.decayDuration = decay
        envelope.sustainLevel = sustain
        envelope.releaseDuration = release
    }
}
