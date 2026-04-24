// swift-tools-version:5.9
// macOS SwiftPM app scaffold — Phase WX-C reference template.
//
// Generator: replace every `<TargetName>` token with the PascalCase app name
// (e.g. "Zombie Tower Defense" → `ZombieTowerDefense`). The target name, the
// directory under Sources/, AND the file containing `@main` MUST all agree
// on this same identifier — otherwise SwiftPM emits the linker error
// `"_<TargetName>_main", referenced from: _main in command-line-aliases-file`
// (which is a link-time error, not a Swift-compile error, so auto-fix loops
// reading Swift diagnostics will NOT catch it). See wisdom rule `mac-005`.

import PackageDescription

let package = Package(
    name: "<TargetName>",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "<TargetName>", targets: ["<TargetName>"])
    ],
    targets: [
        .executableTarget(
            name: "<TargetName>",
            path: "Sources/<TargetName>"
        )
    ]
)
