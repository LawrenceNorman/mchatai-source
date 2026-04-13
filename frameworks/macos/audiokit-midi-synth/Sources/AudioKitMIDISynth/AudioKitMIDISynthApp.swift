import SwiftUI

@main
struct AudioKitMIDISynthApp: App {
    @StateObject private var conductor = SynthConductor()

    var body: some Scene {
        WindowGroup("AudioKit MIDI Synth") {
            ContentView()
                .environmentObject(conductor)
                .frame(minWidth: 720, minHeight: 360)
                .onAppear {
                    do { try conductor.start() }
                    catch { print("AudioEngine start failed: \(error)") }
                }
        }
        .windowResizability(.contentSize)
    }
}
