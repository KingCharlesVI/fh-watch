import ExpoModulesCore
import WatchConnectivity

/// The JS side of Apple Watch sync: the same functions as the Android module.
public class WatchSyncModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WatchSync")

    Events("onMatchReceived")

    OnCreate {
      WatchReceiver.shared.onReceived = { [weak self] id in
        self?.sendEvent("onMatchReceived", ["id": id])
      }
    }

    OnDestroy {
      WatchReceiver.shared.onReceived = nil
    }

    AsyncFunction("listInbox") { () -> [[String: Any?]] in
      WatchInbox.list().map { ["id": $0.id, "json": $0.json, "receivedAt": $0.receivedAt, "fitness": $0.fitness] }
    }

    AsyncFunction("removeFromInbox") { (id: String) in
      WatchInbox.remove(id: id)
    }

    // WatchConnectivity delivers everything the watch queued once the session is
    // active, so there's nothing to pull.
    AsyncFunction("pullPending") { () -> Int in
      0
    }

    AsyncFunction("connectedWatches") { () -> [[String: String]] in
      WatchReceiver.shared.hasWatchApp ? [["id": "apple-watch", "name": "Apple Watch"]] : []
    }

    // The watch app comes with the iPhone app, so there are no separate watch updates to tell about.
    AsyncFunction("watchVersions") { () -> [[String: Any]] in
      []
    }

    // Setup on phone: to the watch if it's in reach now. Returns how many watches got it.
    AsyncFunction("sendSetup") { (json: String, promise: Promise) in
      guard let session = WatchReceiver.shared.session, session.isReachable else {
        promise.resolve(0)
        return
      }
      session.sendMessage(["setup": json], replyHandler: { _ in promise.resolve(1) }, errorHandler: { _ in promise.resolve(0) })
    }
  }
}
