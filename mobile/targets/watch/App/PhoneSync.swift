import Foundation
import WatchConnectivity

/// Watch → iPhone sync with WatchConnectivity (see docs/design.md):
///
/// - A finished match is queued with `transferUserInfo` (a file with `transferFile` if
///   it's big), which is delivered whenever the phone is next in reach, even after restarts.
/// - The phone replies `["ack": id]` once it has stored the match (a message, or queued
///   user info if the watch is out of reach); only then is it marked Synced here.
/// - Resending is always safe: the phone treats the match ID as the key.
/// - The umpire's workout, if recorded, goes with the match as `fitness`, apart from the document.
/// - The phone can send a match setup, `["setup": json]`.
/// - The watch app's version goes in the application context, for update notices on the phone.
final class PhoneSync: NSObject, WCSessionDelegate {
    private let store: MatchStore
    /// A setup that arrived from the phone, and a match the phone confirmed: on the main actor.
    var onSetup: (@MainActor (Setup) -> Void)?
    var onSynced: (@MainActor (String) -> Void)?

    private static let inlineLimit = 50_000

    init(store: MatchStore) {
        self.store = store
        super.init()
    }

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    private var session: WCSession? {
        WCSession.isSupported() && WCSession.default.activationState == .activated ? WCSession.default : nil
    }

    /// The phone has the app and is in reach right now.
    var phoneReachable: Bool { session?.isReachable ?? false }

    func send(_ document: MatchDocument, fitness: Fitness?) {
        guard let session else { return }
        do {
            let json = String(decoding: try DocumentJSON.encode(document), as: UTF8.self)
            let workout = try fitness.map { String(decoding: try JSONEncoder().encode($0), as: UTF8.self) }
            // A resend replaces anything for this match still waiting to go.
            cancelPending(document.id)

            var info: [String: Any] = ["kind": "match", "id": document.id, "schemaVersion": schemaVersion]
            if let workout { info["fitness"] = workout }
            if json.utf8.count + (workout?.utf8.count ?? 0) <= Self.inlineLimit {
                info["json"] = json
                session.transferUserInfo(info)
            } else {
                let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(document.id).json")
                try Data(json.utf8).write(to: url, options: .atomic)
                session.transferFile(url, metadata: info)
            }
            NSLog("FH: queued match %@ for the phone", document.id)
        } catch {
            NSLog("FH: couldn't queue match %@: %@", document.id, String(describing: error))
        }
    }

    /// Drops anything for this match still queued for the phone, so a match deleted here
    /// (or about to be sent again) can't arrive later as one the umpire has already dealt with.
    func cancelPending(_ id: String) {
        guard let session else { return }
        for t in session.outstandingUserInfoTransfers where t.userInfo["id"] as? String == id { t.cancel() }
        for t in session.outstandingFileTransfers where t.file.metadata?["id"] as? String == id { t.cancel() }
    }

    /// Sends every finished match the phone hasn't confirmed. Returns how many.
    @discardableResult
    func resendPending() -> Int {
        let pending = store.pending()
        for m in pending { send(m.record.document, fitness: m.fitness) }
        return pending.count
    }

    private func announceVersion() {
        guard let session else { return }
        let info = Bundle.main.infoDictionary
        let context: [String: Any] = [
            "watchVersion": info?["CFBundleShortVersionString"] as? String ?? "",
            "watchBuild": Int(info?["CFBundleVersion"] as? String ?? "") ?? 0,
        ]
        try? session.updateApplicationContext(context)
    }

    private func handle(_ message: [String: Any]) {
        if let id = message["ack"] as? String {
            if store.markSynced(id) { NSLog("FH: phone has match %@", id) }
            Task { @MainActor in self.onSynced?(id) }
        }
        if let json = message["setup"] as? String {
            guard let setup = Setup.fromPhone(json) else {
                NSLog("FH: ignored a setup from the phone that couldn't be read")
                return
            }
            Task { @MainActor in self.onSetup?(setup) }
        }
    }

    // MARK: - WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        guard activationState == .activated else { return }
        announceVersion()
        // Anything the phone never confirmed goes again.
        resendPending()
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) { handle(message) }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        handle(message)
        replyHandler([:])
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) { handle(userInfo) }

    func session(_ session: WCSession, didFinish fileTransfer: WCSessionFileTransfer, error: Error?) {
        try? FileManager.default.removeItem(at: fileTransfer.file.fileURL)
    }
}
