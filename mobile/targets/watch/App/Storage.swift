import Foundation

/// Now, from a monotonic clock that keeps counting while the watch sleeps, with the
/// wall clock and boot time as a fallback across a restart (see Moment).
func currentMoment() -> Moment {
    Moment(
        elapsedMs: Int64(clock_gettime_nsec_np(CLOCK_MONOTONIC) / 1_000_000),
        wallMs: Int64(Date().timeIntervalSince1970 * 1000),
        bootCount: bootTime
    )
}

/// When the watch last started, in seconds: it changes on every restart, like Android's boot count.
private let bootTime: Int = {
    var time = timeval()
    var size = MemoryLayout<timeval>.size
    var mib: [Int32] = [CTL_KERN, KERN_BOOTTIME]
    return sysctl(&mib, 2, &time, &size, nil, 0) == 0 ? Int(time.tv_sec) : 0
}()

var nowMs: Int64 { Int64(Date().timeIntervalSince1970 * 1000) }

enum SyncState: String, Codable {
    /// Still being played.
    case none
    /// Finished; waiting for the phone to confirm it has the match.
    case pending
    case synced
}

/// One match on the watch: the whole record (document plus clock), rewritten on every
/// event, so a crash or a flat battery loses nothing that was recorded.
struct StoredMatch: Codable, Identifiable {
    var record: MatchRecord
    var sync: SyncState
    var createdAt: Int64
    var updatedAt: Int64
    var syncedAt: Int64?
    /// The umpire's workout during the match, if recorded. Never in the match document.
    var fitness: Fitness?

    var id: String { record.id }
    var ended: Bool { record.clock.phase == .ended }
    var title: String { "\(record.document.teams.home.name) v \(record.document.teams.away.name)" }
    var scoreText: String { "\(record.score.home)–\(record.score.away)" }
}

/// Matches as JSON files in Application Support, one per match, written atomically.
final class MatchStore {
    private let dir: URL
    private let queue = DispatchQueue(label: "fh.store")

    init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        dir = base.appendingPathComponent("matches", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    private func file(_ id: String) -> URL { dir.appendingPathComponent("\(id).json") }

    func save(_ match: StoredMatch) {
        queue.sync {
            do {
                try JSONEncoder().encode(match).write(to: file(match.id), options: .atomic)
            } catch {
                NSLog("FH: couldn't save match %@: %@", match.id, String(describing: error))
            }
        }
    }

    func get(_ id: String) -> StoredMatch? {
        queue.sync { try? JSONDecoder().decode(StoredMatch.self, from: Data(contentsOf: file(id))) }
    }

    func all() -> [StoredMatch] {
        queue.sync {
            let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
            return files.filter { $0.pathExtension == "json" }
                .compactMap { try? JSONDecoder().decode(StoredMatch.self, from: Data(contentsOf: $0)) }
                .sorted { $0.createdAt > $1.createdAt }
        }
    }

    /// The match being played, if the app stopped during one.
    func active() -> StoredMatch? { all().first { !$0.ended } }

    func finished() -> [StoredMatch] { all().filter(\.ended) }

    func pending() -> [StoredMatch] { all().filter { $0.sync == .pending } }

    func delete(_ id: String) {
        queue.sync { try? FileManager.default.removeItem(at: file(id)) }
    }

    @discardableResult
    func markSynced(_ id: String) -> Bool {
        guard var match = get(id), match.sync == .pending else { return false }
        match.sync = .synced
        match.syncedAt = nowMs
        save(match)
        return true
    }

    /// Synced matches are kept for 30 days, then deleted.
    func deleteSyncedBefore(_ before: Int64) {
        for match in all() where match.sync == .synced && (match.syncedAt ?? 0) < before {
            delete(match.id)
        }
    }
}

/// What the setup screen starts from: the last match's choices. The same fields as the
/// Wear OS app's Setup and the phone's WatchSetup (mobile/src/core/setup.ts), so a setup
/// sent from the phone reads the same on either watch.
struct Setup: Codable, Equatable {
    var periods = 4
    var periodMinutes = 15
    /// Breaks between periods; with 4 periods the middle one is half-time.
    var breakMinutes = 2
    var halfTimeMinutes = 5
    var cards = Engine.defaultCards
    var shootoutIfDrawn = false
    var homeName = "Home"
    var homeColor = "#1D4ED8"
    var homeCaptain: Int?
    var awayName = "Away"
    var awayColor = "#DC2626"
    var awayCaptain: Int?
    var venue: String?

    init() {}

    // Every field may be missing (an older phone app, say): missing ones take the defaults.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let d = Setup()
        periods = try c.decodeIfPresent(Int.self, forKey: .periods) ?? d.periods
        periodMinutes = try c.decodeIfPresent(Int.self, forKey: .periodMinutes) ?? d.periodMinutes
        breakMinutes = try c.decodeIfPresent(Int.self, forKey: .breakMinutes) ?? d.breakMinutes
        halfTimeMinutes = try c.decodeIfPresent(Int.self, forKey: .halfTimeMinutes) ?? d.halfTimeMinutes
        cards = try c.decodeIfPresent(CardDurations.self, forKey: .cards) ?? d.cards
        shootoutIfDrawn = try c.decodeIfPresent(Bool.self, forKey: .shootoutIfDrawn) ?? d.shootoutIfDrawn
        homeName = try c.decodeIfPresent(String.self, forKey: .homeName) ?? d.homeName
        homeColor = try c.decodeIfPresent(String.self, forKey: .homeColor) ?? d.homeColor
        homeCaptain = try c.decodeIfPresent(Int.self, forKey: .homeCaptain)
        awayName = try c.decodeIfPresent(String.self, forKey: .awayName) ?? d.awayName
        awayColor = try c.decodeIfPresent(String.self, forKey: .awayColor) ?? d.awayColor
        awayCaptain = try c.decodeIfPresent(Int.self, forKey: .awayCaptain)
        venue = try c.decodeIfPresent(String.self, forKey: .venue)
    }

    var hasHalfTime: Bool { periods % 2 == 0 && periods > 2 }

    func settings() -> MatchSettings {
        MatchSettings(
            periods: periods,
            periodLengthSec: periodMinutes * 60,
            breakLengthsSec: (0..<max(periods - 1, 0)).map { i in
                let halfTime = periods % 2 == 0 && periods > 2 && i == periods / 2 - 1
                return (halfTime ? halfTimeMinutes : breakMinutes) * 60
            },
            cardDurationsSec: cards,
            shootoutIfDrawn: shootoutIfDrawn
        )
    }

    func teams() -> Teams {
        Teams(
            home: Team(name: homeName, color: homeColor, captain: homeCaptain),
            away: Team(name: awayName, color: awayColor, captain: awayCaptain)
        )
    }

    /// The same setup with every value in the range the watch's own setup screen allows:
    /// for a setup that came from somewhere else (the phone), which could be anything.
    func sanitized() -> Setup {
        let d = Setup()
        func colour(_ hex: String, _ fallback: String) -> String {
            hex.range(of: "^#[0-9A-Fa-f]{6}$", options: .regularExpression) != nil ? hex.uppercased() : fallback
        }
        func name(_ text: String, _ fallback: String) -> String {
            let t = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(80))
            return t.isEmpty ? fallback : t
        }
        var s = self
        s.periods = min(max(periods, 1), 8)
        s.periodMinutes = min(max(periodMinutes, 1), 90)
        s.breakMinutes = min(max(breakMinutes, 0), 30)
        s.halfTimeMinutes = min(max(halfTimeMinutes, 0), 30)
        s.homeName = name(homeName, d.homeName)
        s.homeColor = colour(homeColor, d.homeColor)
        s.homeCaptain = homeCaptain.flatMap { shirtNumbers.contains($0) ? $0 : nil }
        s.awayName = name(awayName, d.awayName)
        s.awayColor = colour(awayColor, d.awayColor)
        s.awayCaptain = awayCaptain.flatMap { shirtNumbers.contains($0) ? $0 : nil }
        let v = venue.map { String($0.trimmingCharacters(in: .whitespacesAndNewlines).prefix(120)) }
        s.venue = v?.isEmpty == false ? v : nil
        return s
    }

    /// A setup sent by the phone, or nil if it isn't one.
    static func fromPhone(_ json: String) -> Setup? {
        (try? JSONDecoder().decode(Setup.self, from: Data(json.utf8)))?.sanitized()
    }

    struct Preset {
        let label: String
        let periods: Int
        let minutes: Int
        let breakMinutes: Int
        let halfTimeMinutes: Int
    }

    static let presets = [
        Preset(label: "4 × 15 min", periods: 4, minutes: 15, breakMinutes: 2, halfTimeMinutes: 5),
        Preset(label: "2 × 35 min", periods: 2, minutes: 35, breakMinutes: 5, halfTimeMinutes: 5),
        Preset(label: "2 × 30 min", periods: 2, minutes: 30, breakMinutes: 5, halfTimeMinutes: 5),
        Preset(label: "2 × 25 min", periods: 2, minutes: 25, breakMinutes: 5, halfTimeMinutes: 5),
    ]
}

/// The watch's settings, in UserDefaults.
final class Prefs {
    private let defaults = UserDefaults.standard

    var lastSetup: Setup {
        get { defaults.data(forKey: "setup").flatMap { try? JSONDecoder().decode(Setup.self, from: $0) } ?? Setup() }
        set { defaults.set(try? JSONEncoder().encode(newValue), forKey: "setup") }
    }

    /// Whether the match clock shows time left (the default) or time played.
    var clockCountsDown: Bool {
        get { defaults.object(forKey: "countDown") as? Bool ?? true }
        set { defaults.set(newValue, forKey: "countDown") }
    }

    /// Whether each match is kept as a workout: saved to Health and sent to the phone. Off
    /// until the umpire turns it on. The workout session runs either way, to keep the match going.
    var recordWorkout: Bool {
        get { defaults.bool(forKey: "recordWorkout") }
        set { defaults.set(newValue, forKey: "recordWorkout") }
    }
}

/// The umpire's workout during a match, in the same JSON as the Wear OS app's (see
/// mobile/src/core/fitness.ts). Heart rate samples are [seconds since startedAt, bpm].
struct Fitness: Codable, Equatable {
    var version = 1
    var startedAt: String
    var endedAt: String?
    var steps: Int?
    var distanceM: Double?
    var caloriesKcal: Double?
    var heartRate: HeartRate?
    var heartRateSamples: [[Int]] = []

    struct HeartRate: Codable, Equatable {
        var avg: Int
        var min: Int
        var max: Int
    }
}
