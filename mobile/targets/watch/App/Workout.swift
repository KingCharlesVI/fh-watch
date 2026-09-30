import Foundation
import HealthKit

/// The workout session that runs from the first period to the final whistle. watchOS
/// keeps a workout app running with the wrist down, so this is what keeps the clock,
/// suspension timers and haptics going (like the Wear OS app's foreground service).
///
/// With Record workout on, the workout is saved to Health and its summary goes to the
/// phone with the match; otherwise it's discarded at the end.
///
/// Its state is only touched on the main queue: the delegates hop there.
final class WorkoutRecorder: NSObject, HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate {
    private let health = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var startedAt: Date?
    private var samples: [[Int]] = []
    private var lastSampleSec = -sampleEverySec
    private var ended: CheckedContinuation<Void, Never>?

    private static let sampleEverySec = 10
    private static let heartRate = HKQuantityType(.heartRate)
    private static let read: Set<HKObjectType> = [
        heartRate,
        HKQuantityType(.activeEnergyBurned),
        HKQuantityType(.distanceWalkingRunning),
        HKQuantityType(.stepCount),
    ]

    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    /// Asks once for what the workout needs. Safe to call again: it only asks the first time.
    @MainActor
    func requestAuthorization() async -> Bool {
        guard isAvailable else { return false }
        do {
            try await health.requestAuthorization(toShare: [HKObjectType.workoutType()], read: Self.read)
            return health.authorizationStatus(for: HKObjectType.workoutType()) == .sharingAuthorized
        } catch {
            NSLog("FH: Health authorization failed: %@", String(describing: error))
            return false
        }
    }

    var running: Bool { session != nil }

    @MainActor
    func start() async {
        guard session == nil, isAvailable else { return }
        let config = HKWorkoutConfiguration()
        // Health has hockey; there's no umpiring. Outdoors, but no GPS route is recorded.
        config.activityType = .hockey
        config.locationType = .outdoor
        do {
            let session = try HKWorkoutSession(healthStore: health, configuration: config)
            let builder = session.associatedWorkoutBuilder()
            let source = HKLiveWorkoutDataSource(healthStore: health, workoutConfiguration: config)
            source.enableCollection(for: HKQuantityType(.stepCount), predicate: nil)
            builder.dataSource = source
            attach(session, builder)
            let now = Date()
            startedAt = now
            samples = []
            lastSampleSec = -Self.sampleEverySec
            session.startActivity(with: now)
            try await builder.beginCollection(at: now)
            NSLog("FH: workout session started")
        } catch {
            NSLog("FH: couldn't start the workout session: %@", String(describing: error))
            session = nil
            builder = nil
        }
    }

    /// Picks up the session after the app was relaunched mid-match.
    @MainActor
    func recover() async {
        guard session == nil, isAvailable else { return }
        do {
            guard let session = try await health.recoverActiveWorkoutSession() else { return }
            attach(session, session.associatedWorkoutBuilder())
            startedAt = builder?.startDate ?? Date()
            NSLog("FH: workout session recovered")
        } catch {
            NSLog("FH: couldn't recover the workout session: %@", String(describing: error))
        }
    }

    private func attach(_ session: HKWorkoutSession, _ builder: HKLiveWorkoutBuilder) {
        self.session = session
        self.builder = builder
        session.delegate = self
        builder.delegate = self
    }

    /// Ends the session. Saves the workout and returns its summary if `keep`, otherwise
    /// discards it and returns nil.
    @MainActor
    func finish(keep: Bool) async -> Fitness? {
        guard let session, let builder else { return nil }
        let end = Date()
        await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
            ended = c
            session.end()
            // The delegate hears it's ended; don't wait forever if it doesn't.
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in self?.resumeEnded() }
        }
        var fitness: Fitness?
        do {
            try await builder.endCollection(at: end)
            if keep {
                fitness = summary(builder, end: end)
                _ = try await builder.finishWorkout()
            } else {
                builder.discardWorkout()
            }
        } catch {
            NSLog("FH: couldn't finish the workout: %@", String(describing: error))
        }
        self.session = nil
        self.builder = nil
        return fitness
    }

    private func resumeEnded() {
        ended?.resume()
        ended = nil
    }

    private func summary(_ builder: HKLiveWorkoutBuilder, end: Date) -> Fitness {
        let start = startedAt ?? builder.startDate ?? end
        func sum(_ id: HKQuantityTypeIdentifier, _ unit: HKUnit) -> Double? {
            builder.statistics(for: HKQuantityType(id))?.sumQuantity()?.doubleValue(for: unit)
        }
        let bpm = HKUnit.count().unitDivided(by: .minute())
        let hr = builder.statistics(for: Self.heartRate)
        var heartRate: Fitness.HeartRate?
        if let avg = hr?.averageQuantity(), let lo = hr?.minimumQuantity(), let hi = hr?.maximumQuantity() {
            heartRate = .init(avg: Int(avg.doubleValue(for: bpm).rounded()), min: Int(lo.doubleValue(for: bpm).rounded()), max: Int(hi.doubleValue(for: bpm).rounded()))
        }
        return Fitness(
            startedAt: isoTime(Int64(start.timeIntervalSince1970 * 1000)),
            endedAt: isoTime(Int64(end.timeIntervalSince1970 * 1000)),
            steps: sum(.stepCount, .count()).map { Int($0.rounded()) },
            distanceM: sum(.distanceWalkingRunning, .meter()),
            caloriesKcal: sum(.activeEnergyBurned, .kilocalorie()),
            heartRate: heartRate,
            heartRateSamples: samples
        )
    }

    // MARK: - Delegates (called on HealthKit's queues)

    func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
        if toState == .ended || toState == .stopped {
            DispatchQueue.main.async { [weak self] in self?.resumeEnded() }
        }
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        NSLog("FH: workout session failed: %@", String(describing: error))
    }

    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        guard collectedTypes.contains(Self.heartRate),
              let quantity = workoutBuilder.statistics(for: Self.heartRate)?.mostRecentQuantity() else { return }
        let bpm = Int(quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute())).rounded())
        DispatchQueue.main.async { [weak self] in
            guard let self, let start = self.startedAt, bpm > 0 else { return }
            let sec = Int(Date().timeIntervalSince(start))
            if sec - self.lastSampleSec >= Self.sampleEverySec {
                self.samples.append([sec, bpm])
                self.lastSampleSec = sec
            }
        }
    }

    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
}
