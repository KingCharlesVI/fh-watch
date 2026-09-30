// swift-tools-version:5.9
// The watchOS app's match engine as a Swift package, so its tests run without
// Xcode or a watch: `swift test` in this folder (on a Mac, or Windows or Linux
// with the Swift toolchain). The same files are compiled into the watch app,
// from watch/Engine. Only folders with an expo-target.config file are targets
// for the app, so engine-tests isn't one.
import PackageDescription

let package = Package(
    name: "WatchEngine",
    platforms: [.macOS(.v13)],
    targets: [
        .target(name: "MatchEngine", path: "watch/Engine"),
        .testTarget(name: "MatchEngineTests", dependencies: ["MatchEngine"], path: "engine-tests"),
    ]
)
