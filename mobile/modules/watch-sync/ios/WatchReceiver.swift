import ExpoModulesCore
import Foundation
import WatchConnectivity

/**
 The iPhone's end of Apple Watch sync (see docs/design.md), the counterpart of the
 Android WatchReceiver. A match arrives as user info (or a file, if it's big); it's
 written to a file inbox, and only then is the watch told the phone has it
 (`["ack": id]`). The JS app drains the inbox whenever it runs.
 */
final class WatchReceiver: NSObject, WCSessionDelegate {
  static let shared = WatchReceiver()
  private static let idPattern = "^[0-9a-fA-F-]{36}$"

  /// Set while the JS module is alive, to tell it a match has arrived.
  var onReceived: ((String) -> Void)?

  /// Called at launch, so no delivery is missed.
  func activate() {
    guard WCSession.isSupported() else { return }
    WCSession.default.delegate = self
    WCSession.default.activate()
  }

  var session: WCSession? {
    WCSession.isSupported() && WCSession.default.activationState == .activated ? WCSession.default : nil
  }

  /// A paired Apple Watch with the watch app installed.
  var hasWatchApp: Bool {
    guard let session else { return false }
    return session.isPaired && session.isWatchAppInstalled
  }

  private func receive(_ info: [String: Any], json fileJson: String? = nil) {
    guard info["kind"] as? String == "match",
          let id = info["id"] as? String, id.range(of: Self.idPattern, options: .regularExpression) != nil,
          let json = fileJson ?? info["json"] as? String else { return }
    do {
      try WatchInbox.write(id: id, json: json, fitness: info["fitness"] as? String)
    } catch {
      NSLog("WatchSync: couldn't store match %@: %@", id, String(describing: error))
      return
    }
    NSLog("WatchSync: stored match %@ from the watch", id)
    acknowledge(id)
    onReceived?(id)
  }

  /// The receipt: a message if the watch is in reach, otherwise queued for when it is.
  private func acknowledge(_ id: String) {
    guard let session else { return }
    let ack = ["ack": id]
    if session.isReachable {
      session.sendMessage(ack, replyHandler: nil) { _ in session.transferUserInfo(ack) }
    } else {
      session.transferUserInfo(ack)
    }
  }

  // MARK: - WCSessionDelegate

  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}

  func sessionDidBecomeInactive(_ session: WCSession) {}

  /// After switching to another watch: start again for the new one.
  func sessionDidDeactivate(_ session: WCSession) {
    WCSession.default.activate()
  }

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    receive(userInfo)
  }

  func session(_ session: WCSession, didReceive file: WCSessionFile) {
    guard let metadata = file.metadata, let data = try? Data(contentsOf: file.fileURL) else { return }
    receive(metadata, json: String(decoding: data, as: UTF8.self))
  }
}

/**
 Matches received but not yet taken by the JS app: one JSON file each, and a
 `.fitness` file beside it for the umpire's workout. The same layout as Android's.
 */
enum WatchInbox {
  struct Entry {
    let id: String
    let json: String
    let receivedAt: Double
    let fitness: String?
  }

  private static let lock = NSLock()

  private static var dir: URL {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    let dir = base.appendingPathComponent("watch-inbox", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }

  static func write(id: String, json: String, fitness: String?) throws {
    lock.lock()
    defer { lock.unlock() }
    // Before the match file, so the JS side never sees a match without its workout.
    if let fitness { try Data(fitness.utf8).write(to: dir.appendingPathComponent("\(id).fitness"), options: .atomic) }
    try Data(json.utf8).write(to: dir.appendingPathComponent("\(id).json"), options: .atomic)
  }

  static func list() -> [Entry] {
    lock.lock()
    defer { lock.unlock() }
    let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.contentModificationDateKey])) ?? []
    return files.filter { $0.pathExtension == "json" }.compactMap { url in
      guard let json = try? String(contentsOf: url, encoding: .utf8) else { return nil }
      let id = url.deletingPathExtension().lastPathComponent
      let modified = (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? Date()
      let fitness = try? String(contentsOf: dir.appendingPathComponent("\(id).fitness"), encoding: .utf8)
      return Entry(id: id, json: json, receivedAt: modified.timeIntervalSince1970 * 1000, fitness: fitness)
    }.sorted { $0.receivedAt < $1.receivedAt }
  }

  static func remove(id: String) {
    lock.lock()
    defer { lock.unlock() }
    try? FileManager.default.removeItem(at: dir.appendingPathComponent("\(id).json"))
    try? FileManager.default.removeItem(at: dir.appendingPathComponent("\(id).fitness"))
  }
}

/// Activates WatchConnectivity as the app launches, so a match queued by the watch is never missed.
public class WatchSyncAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    WatchReceiver.shared.activate()
    return true
  }
}
