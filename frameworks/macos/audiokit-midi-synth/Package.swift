// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "AudioKitMIDISynth",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "AudioKitMIDISynth", targets: ["AudioKitMIDISynth"])
    ],
    dependencies: [
        .package(url: "https://github.com/AudioKit/AudioKit.git", from: "5.6.0"),
        .package(url: "https://github.com/AudioKit/AudioKitUI.git", from: "0.3.0"),
        .package(url: "https://github.com/AudioKit/SoundpipeAudioKit.git", from: "5.6.0")
    ],
    targets: [
        .executableTarget(
            name: "AudioKitMIDISynth",
            dependencies: [
                .product(name: "AudioKit", package: "AudioKit"),
                .product(name: "AudioKitUI", package: "AudioKitUI"),
                .product(name: "SoundpipeAudioKit", package: "SoundpipeAudioKit")
            ],
            path: "Sources/AudioKitMIDISynth"
        )
    ]
)
