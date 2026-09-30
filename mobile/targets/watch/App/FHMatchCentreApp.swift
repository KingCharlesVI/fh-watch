import SwiftUI
import WatchKit

/// The Apple Watch umpire app: the same match engine and screens as the Wear OS app
/// (docs/design.md), in SwiftUI.
@main
struct FHMatchCentreApp: App {
    @WKApplicationDelegateAdaptor private var delegate: AppDelegate
    @State private var controller: MatchController

    init() {
        let store = MatchStore()
        let sync = PhoneSync(store: store)
        let controller = MatchController(store: store, prefs: Prefs(), sync: sync)
        _controller = State(initialValue: controller)
        AppDelegate.controller = controller
        sync.activate()
        controller.restore()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(controller)
                .tint(.brand)
        }
    }
}

final class AppDelegate: NSObject, WKApplicationDelegate {
    @MainActor static var controller: MatchController?

    /// watchOS relaunched the app to carry on a workout that was running when it stopped.
    func handleActiveWorkoutRecovery() {
        Task { @MainActor in await Self.controller?.workout.recover() }
    }
}
