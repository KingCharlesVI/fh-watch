import Foundation
import Observation

/// A just-recorded event the umpire can take back with one tap for a few seconds.
struct UndoOffer: Equatable {
    let seq: Int
    let label: String
    let untilElapsedMs: Int64
}

/// The match in progress: applies the umpire's actions through the engine and writes
/// every change to storage before anything else sees it. A timer ticks once a second
/// to log suspensions that end and to give alerts, with the wrist down too (the
/// workout session keeps the app running).
@MainActor
@Observable
final class MatchController {
    static let undoWindowMs: Int64 = 10_000

    /// The match being played, or nil.
    private(set) var active: MatchRecord?
    private(set) var undoOffer: UndoOffer?
    /// A match whose final whistle has just gone, for its summary.
    var finishedId: String?
    /// Why the last action wasn't allowed.
    var refused: String?
    /// A setup that just arrived from the phone, until the setup screen opens with it.
    var phoneSetup: Setup?
    /// Bumped when the stored matches change, so lists reload.
    private(set) var storeVersion = 0

    let store: MatchStore
    let prefs: Prefs
    let sync: PhoneSync
    let workout = WorkoutRecorder()
    @ObservationIgnored private var createdAt: Int64 = 0
    @ObservationIgnored private var timer: Timer?

    init(store: MatchStore, prefs: Prefs, sync: PhoneSync) {
        self.store = store
        self.prefs = prefs
        self.sync = sync
        sync.onSetup = { [weak self] setup in
            self?.prefs.lastSetup = setup
            self?.phoneSetup = setup
        }
        sync.onSynced = { [weak self] _ in self?.storeVersion += 1 }
    }

    /// Picks up a match that was in progress when the app last stopped.
    func restore() {
        store.deleteSyncedBefore(nowMs - 30 * 24 * 60 * 60 * 1000)
        guard let row = store.active() else { return }
        createdAt = row.createdAt
        active = row.record
        startTicking()
        if row.record.clock.phase != .ready { Task { await workout.recover() } }
    }

    func create(settings: MatchSettings, teams: Teams, venue: String?) throws {
        let now = currentMoment()
        createdAt = now.wallMs
        let record = try Engine.newMatch(settings: settings, teams: teams, venue: venue, now: now)
        save(record)
        active = record
        startTicking()
    }

    /// Throws away a match that never started.
    func discard() {
        guard let record = active, record.clock.phase == .ready else { return }
        store.delete(record.id)
        active = nil
        stopTicking()
    }

    /// Applies an action to the match. With `undoLabel`, the event it records can be
    /// taken back from the match screen for `undoWindowMs`.
    func perform(_ undoLabel: String? = nil, _ action: (MatchRecord, Moment) throws -> MatchRecord) {
        guard let current = active else { return }
        let now = currentMoment()
        let next: MatchRecord
        do {
            next = try action(current, now)
        } catch let e as MatchRuleError {
            refused = e.message
            return
        } catch {
            refused = String(describing: error)
            return
        }
        guard next != current else { return }
        save(next)
        active = next
        // One buzz whenever the clock starts or stops, however it was done.
        if next.clock.running != current.clock.running { Haptics.buzz() }
        // The workout starts with the first period.
        if current.clock.phase == .ready && next.clock.phase != .ready { Task { await workout.start() } }
        if let undoLabel {
            let recorded = next.document.events.dropFirst(current.document.events.count).last { $0.isUndoable }
            undoOffer = recorded.map { UndoOffer(seq: $0.seq, label: undoLabel, untilElapsedMs: now.elapsedMs + Self.undoWindowMs) }
        }
        if next.clock.phase == .ended { finish(next) }
    }

    func undo(_ offer: UndoOffer) {
        undoOffer = nil
        perform { try $0.undo(seq: offer.seq, now: $1) }
    }

    /// Moves time on: logs suspensions that ran out and gives alerts.
    private func tick() {
        guard let current = active else { return }
        let now = currentMoment()
        if let offer = undoOffer, now.elapsedMs > offer.untilElapsedMs { undoOffer = nil }
        let result = current.tick(now)
        if result.record != current {
            save(result.record)
            active = result.record
        }
        Haptics.alert(result.alerts)
    }

    private func startTicking() {
        guard timer == nil else { return }
        let t = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    private func stopTicking() {
        timer?.invalidate()
        timer = nil
    }

    private func save(_ record: MatchRecord) {
        let ended = record.clock.phase == .ended
        let existing = store.get(record.id)
        store.save(StoredMatch(
            record: record,
            sync: ended ? .pending : .none,
            createdAt: createdAt,
            updatedAt: nowMs,
            syncedAt: nil,
            fitness: existing?.fitness
        ))
    }

    private func finish(_ record: MatchRecord) {
        active = nil
        undoOffer = nil
        stopTicking()
        finishedId = record.id
        storeVersion += 1
        Task {
            let fitness = await workout.finish(keep: prefs.recordWorkout)
            if let fitness, var row = store.get(record.id) {
                row.fitness = fitness
                store.save(row)
            }
            sync.send(record.document, fitness: fitness)
        }
    }

    /// Deletes a match from the watch. One the phone already has stays on the phone.
    func delete(_ id: String) {
        store.delete(id)
        storeVersion += 1
    }

    func resend(_ id: String) {
        guard let row = store.get(id) else { return }
        sync.send(row.record.document, fitness: row.fitness)
    }
}
