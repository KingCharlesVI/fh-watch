import Foundation

// The match engine: pure functions from a MatchRecord and a Moment to a new
// record, ported from the Wear OS app's Match.kt so both watches behave the same.
// No watchOS here, so all of it runs in `swift test`.
//
// The document's event log is the record of what happened; ClockState is what
// the watch needs to keep the clock running between events.

/// A point in time from two clocks. `elapsedMs` is a monotonic clock that keeps
/// counting while the watch sleeps, which wall-clock changes can't disturb. It
/// restarts from zero on reboot, which a changed `bootCount` reveals, and then
/// the wall clock is used.
struct Moment: Codable, Equatable {
    var elapsedMs: Int64
    var wallMs: Int64
    var bootCount: Int

    /// Milliseconds from this moment to a later one.
    func until(_ later: Moment) -> Int64 {
        if later.bootCount == bootCount && later.elapsedMs >= elapsedMs { return later.elapsedMs - elapsedMs }
        return max(0, later.wallMs - wallMs)
    }

    var iso: String { isoTime(wallMs) }
}

/// "2026-09-19T10:00:00.123Z": UTC with milliseconds, as the Wear app writes it.
func isoTime(_ wallMs: Int64) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    formatter.timeZone = TimeZone(identifier: "UTC")
    return formatter.string(from: Date(timeIntervalSince1970: Double(wallMs) / 1000))
}

enum Phase: String, Codable {
    /// Set up, waiting for the first period to start.
    case ready = "READY"
    /// In a period; the clock may be running or stopped.
    case playing = "PLAYING"
    /// Between periods.
    case breakTime = "BREAK"
    /// The break is over: the next period is up on screen, waiting to be started.
    case nextPeriod = "NEXT_PERIOD"
    /// The last period has ended; a shootout may follow if the score is level.
    case fullTime = "FULL_TIME"
    case shootout = "SHOOTOUT"
    /// The final whistle has been recorded.
    case ended = "ENDED"
}

struct ClockState: Codable, Equatable {
    var phase: Phase = .ready
    var period: Int = 1
    var running = false
    /// Time in this period before the current running stretch began.
    var bankedMs: Int64 = 0
    /// When the current running stretch began.
    var runningSince: Moment?
    /// How long each finished period actually ran.
    var completedPeriodsMs: [Int64] = []
    var breakStartedAt: Moment?
}

struct MatchRecord: Codable, Equatable {
    var document: MatchDocument
    var clock = ClockState()
    /// Alerts already given, so each vibrates once.
    var fired: Set<String> = []

    var id: String { document.id }
    var settings: MatchSettings { document.settings }
}

/// Something the umpire should feel on their wrist.
enum Alert: Equatable {
    case twoMinutesLeft(period: Int)
    case oneMinuteLeft(period: Int)
    case timeUp(period: Int)
    case suspensionOver(cardSeq: Int, team: Side, player: Int?)
    case breakOver(afterPeriod: Int)
}

struct MatchRuleError: Error, Equatable, CustomStringConvertible {
    let message: String
    var description: String { message }
}

private func rule(_ ok: Bool, _ message: @autoclosure () -> String) throws {
    if !ok { throw MatchRuleError(message: message()) }
}

enum Engine {
    static let defaultCards = CardDurations(green: 120, yellowShort: 300, yellowLong: 600)

    static func newMatch(settings: MatchSettings, teams: Teams, venue: String?, now: Moment, id: String? = nil) throws -> MatchRecord {
        try rule(settings.breakLengthsSec.count == settings.periods - 1, "Need \(settings.periods - 1) break lengths.")
        let trimmed = venue?.trimmingCharacters(in: .whitespacesAndNewlines)
        return MatchRecord(
            document: MatchDocument(
                schemaVersion: schemaVersion,
                id: id ?? uuidV7(now.wallMs),
                createdOn: "watchos",
                settings: settings,
                teams: teams,
                venue: trimmed?.isEmpty == false ? trimmed : nil,
                competition: nil,
                // Replaced when the first period starts.
                startedAt: now.iso,
                endedAt: nil,
                events: []
            )
        )
    }

    /// A time-ordered UUID (RFC 9562 version 7), so matches sort by when they were created.
    static func uuidV7(_ nowMs: Int64) -> String {
        var b = (0..<16).map { _ in UInt8.random(in: 0...255) }
        for i in 0...5 { b[i] = UInt8(truncatingIfNeeded: nowMs >> (40 - 8 * Int64(i))) }
        b[6] = (b[6] & 0x0f) | 0x70
        b[8] = (b[8] & 0x3f) | 0x80
        let hex = b.map { String(format: "%02x", $0) }.joined()
        let parts = [0..<8, 8..<12, 12..<16, 16..<20, 20..<32].map { r in
            String(hex[hex.index(hex.startIndex, offsetBy: r.lowerBound)..<hex.index(hex.startIndex, offsetBy: r.upperBound)])
        }
        return parts.joined(separator: "-")
    }
}

// MARK: - Clock

extension MatchRecord {
    /// Time played in the current period, stopping at the period's length.
    func periodElapsedMs(_ now: Moment) -> Int64 {
        let live = clock.running ? (clock.runningSince?.until(now) ?? 0) : 0
        return min(settings.periodLengthMs, clock.bankedMs + live)
    }

    func isTimeUp(_ now: Moment) -> Bool {
        clock.phase == .playing && periodElapsedMs(now) >= settings.periodLengthMs
    }

    /// Match-clock time since kickoff, excluding stoppages and breaks. Suspensions run on this.
    func matchTimeMs(_ now: Moment) -> Int64 {
        clock.completedPeriodsMs.reduce(0, +) + (clock.phase == .playing ? periodElapsedMs(now) : 0)
    }

    private var nextSeq: Int { (document.events.map(\.seq).max() ?? 0) + 1 }

    fileprivate func appending(_ make: (Int) -> MatchEvent) -> MatchRecord {
        withoutActuallyEscaping(make) { appending(all: [$0]) }
    }

    fileprivate func appending(all make: [(Int) -> MatchEvent]) -> MatchRecord {
        var next = self
        var seq = nextSeq
        for m in make {
            next.document.events.append(m(seq))
            seq += 1
        }
        return next
    }
}

// MARK: - Operations

enum CardKind: CaseIterable {
    case green, yellowShort, yellowLong, red

    var color: CardColor {
        switch self {
        case .green: .green
        case .yellowShort, .yellowLong: .yellow
        case .red: .red
        }
    }
}

extension MatchSettings {
    func durationSec(_ kind: CardKind) -> Int? {
        switch kind {
        case .green: cardDurationsSec.green
        case .yellowShort: cardDurationsSec.yellowShort
        case .yellowLong: cardDurationsSec.yellowLong
        case .red: nil
        }
    }
}

extension MatchEvent {
    /// Events the umpire may cancel: what they recorded, not the clock's own entries.
    var isUndoable: Bool {
        switch self {
        case .goal, .card, .penaltyCorner, .penaltyStroke, .shootoutAttempt: true
        default: false
        }
    }
}

extension MatchRecord {
    /// The physical button: start, stop or resume the clock, or end a period whose time is up.
    func toggleClock(_ now: Moment) throws -> MatchRecord {
        switch clock.phase {
        case .ready, .nextPeriod: return try startPeriod(now)
        // A break leads to the next period, which then waits for the whistle.
        case .breakTime: return try nextPeriod()
        case .playing:
            if isTimeUp(now) { return try endPeriod(now) }
            return try clock.running ? stopClock(now) : resumeClock(now)
        default: return self
        }
    }

    /// Leaves the break with the next period up but its clock at zero and stopped, so the
    /// umpire starts it when play restarts. Nothing is logged: the period begins when it starts.
    func nextPeriod() throws -> MatchRecord {
        try rule(clock.phase == .breakTime, "There's no break to leave.")
        var next = self
        next.clock.phase = .nextPeriod
        next.clock.period = clock.period + 1
        next.clock.bankedMs = 0
        next.clock.breakStartedAt = nil
        return next
    }

    /// Starts a period: the first one, the one the break led to, or the next one straight from a break.
    func startPeriod(_ now: Moment) throws -> MatchRecord {
        try rule(clock.phase == .ready || clock.phase == .breakTime || clock.phase == .nextPeriod, "A period is already under way.")
        let period = switch clock.phase {
        case .ready: 1
        case .breakTime: clock.period + 1
        default: clock.period
        }
        var next = self
        if period == 1 { next.document.startedAt = now.iso }
        next = next.appending { .periodStart(PeriodStart(seq: $0, wallTime: now.iso, period: period, clockMs: 0)) }
        next.clock.phase = .playing
        next.clock.period = period
        next.clock.running = true
        next.clock.bankedMs = 0
        next.clock.runningSince = now
        next.clock.breakStartedAt = nil
        return next
    }

    func stopClock(_ now: Moment, reason: StopReason? = nil) throws -> MatchRecord {
        try rule(clock.phase == .playing && clock.running, "The clock isn't running.")
        let at = periodElapsedMs(now)
        let period = clock.period
        var next = appending { .clockStop(ClockStop(seq: $0, wallTime: now.iso, period: period, clockMs: at, reason: reason)) }
        next.clock.running = false
        next.clock.bankedMs = at
        next.clock.runningSince = nil
        return next
    }

    func resumeClock(_ now: Moment) throws -> MatchRecord {
        try rule(clock.phase == .playing && !clock.running, "The clock is already running.")
        try rule(!isTimeUp(now), "Time is up in this period.")
        let period = clock.period
        let banked = clock.bankedMs
        var next = appending { .clockResume(ClockResume(seq: $0, wallTime: now.iso, period: period, clockMs: banked)) }
        next.clock.running = true
        next.clock.runningSince = now
        return next
    }

    func endPeriod(_ now: Moment) throws -> MatchRecord {
        try rule(clock.phase == .playing, "No period is under way.")
        let ended = tick(now).record // any suspension that ran out goes in the log first
        let at = ended.periodElapsedMs(now)
        let period = ended.clock.period
        let last = period >= settings.periods
        var next = ended.appending { .periodEnd(PeriodEnd(seq: $0, wallTime: now.iso, period: period, clockMs: at)) }
        next.clock.phase = last ? .fullTime : .breakTime
        next.clock.running = false
        next.clock.bankedMs = at
        next.clock.runningSince = nil
        next.clock.completedPeriodsMs = ended.clock.completedPeriodsMs + [at]
        next.clock.breakStartedAt = last ? nil : now
        return next
    }

    private func requirePlaying() throws {
        try rule(clock.phase == .playing, "Start the period first.")
    }

    func goal(team: Side, player: Int?, method: GoalMethod?, now: Moment) throws -> MatchRecord {
        try requirePlaying()
        let at = periodElapsedMs(now)
        let p = clock.period
        let goal: (Int) -> MatchEvent = { .goal(Goal(seq: $0, wallTime: now.iso, period: p, clockMs: at, team: team, player: player, method: method)) }
        // A goal from a stroke also records the stroke, so the two always agree.
        if method == .ps {
            let stroke: (Int) -> MatchEvent = { .penaltyStroke(PenaltyStroke(seq: $0, wallTime: now.iso, period: p, clockMs: at, team: team, scored: true)) }
            return appending(all: [stroke, goal])
        }
        return appending(goal)
    }

    func missedStroke(team: Side, now: Moment) throws -> MatchRecord {
        try requirePlaying()
        let at = periodElapsedMs(now)
        let p = clock.period
        return appending { .penaltyStroke(PenaltyStroke(seq: $0, wallTime: now.iso, period: p, clockMs: at, team: team, scored: false)) }
    }

    func card(team: Side, player: Int?, kind: CardKind, now: Moment, reason: CardReason? = nil) throws -> MatchRecord {
        try requirePlaying()
        let at = periodElapsedMs(now)
        let p = clock.period
        let duration = settings.durationSec(kind)
        return appending {
            .card(Card(seq: $0, wallTime: now.iso, period: p, clockMs: at, team: team, player: player, color: kind.color, reason: reason, durationSec: duration))
        }
    }

    func penaltyCorner(team: Side, now: Moment) throws -> MatchRecord {
        try requirePlaying()
        let at = periodElapsedMs(now)
        let p = clock.period
        return appending { .penaltyCorner(PenaltyCorner(seq: $0, wallTime: now.iso, period: p, clockMs: at, team: team)) }
    }

    /// Cancels an event, keeping it in the log. A stroke and its goal are cancelled together.
    func undo(seq: Int, now: Moment) throws -> MatchRecord {
        let target = document.events.first { $0.seq == seq }
        try rule(target?.isUndoable == true, "There's nothing to undo there.")
        let voided = voidedSeqs
        try rule(!voided.contains(seq), "That's already cancelled.")
        let pair = strokePartner(target!).flatMap { voided.contains($0.seq) ? nil : $0 }
        let timed = clock.phase == .playing
        let period: Int? = timed ? clock.period : nil
        let at: Int64? = timed ? periodElapsedMs(now) : nil
        let cancelled = [target!] + (pair.map { [$0] } ?? [])
        let voids = cancelled.map { e -> (Int) -> MatchEvent in
            { seq in .void(VoidEvent(seq: seq, wallTime: now.iso, refSeq: e.seq, period: period, clockMs: at)) }
        }
        return appending(all: voids)
    }

    /// The stroke recorded with a stroke goal, or the goal recorded with a scored stroke.
    private func strokePartner(_ event: MatchEvent) -> MatchEvent? {
        switch event {
        case let .goal(g) where g.method == .ps:
            return document.events.first {
                if case let .penaltyStroke(s) = $0 { return s.seq == g.seq - 1 && s.team == g.team && s.scored }
                return false
            }
        case let .penaltyStroke(s) where s.scored:
            return document.events.first {
                if case let .goal(g) = $0 { return g.seq == s.seq + 1 && g.team == s.team && g.method == .ps }
                return false
            }
        default:
            return nil
        }
    }

    var voidedSeqs: Set<Int> {
        Set(document.events.compactMap { if case let .void(v) = $0 { return v.refSeq } else { return nil } })
    }

    /// The log without cancelled events and the cancellations themselves.
    var activeEvents: [MatchEvent] {
        let voided = voidedSeqs
        return document.events.filter {
            if case .void = $0 { return false }
            return !voided.contains($0.seq)
        }
    }

    func startShootout() throws -> MatchRecord {
        try rule(clock.phase == .fullTime, "The match isn't at full time.")
        let s = score
        try rule(s.home == s.away, "A shootout needs a level score.")
        var next = self
        next.clock.phase = .shootout
        return next
    }

    /// A shoot-out, scored or missed. Whoever takes the first one (the coin toss) sets the
    /// order from then on: see `ShootoutState.next`. A forfeit is one the team loses because
    /// the player due to take it was suspended in the shootout.
    func shootoutAttempt(team: Side, player: Int?, scored: Bool, now: Moment, forfeit: Bool = false) throws -> MatchRecord {
        try rule(clock.phase == .shootout, "The shootout hasn't started.")
        let so = shootout
        try rule(so.winner == nil, "The shootout is already decided.")
        try rule(so.next == nil || so.next == team, "It's \(document.teams[so.next ?? team].name)'s turn.")
        try rule(!forfeit || !scored, "A forfeit can't be scored.")
        try rule(!forfeit || so.suspended.contains(team), "No one in \(document.teams[team].name) has been suspended in the shootout.")
        let round = activeEvents.filter { if case let .shootoutAttempt(a) = $0 { return a.team == team } else { return false } }.count + 1
        return appending {
            .shootoutAttempt(ShootoutAttempt(seq: $0, wallTime: now.iso, team: team, round: round, player: player, scored: scored, forfeit: forfeit ? true : nil))
        }
    }

    /// A card in the shootout: yellow or red only, and either way the player takes no further
    /// part, so there's no suspension to time. It's logged where the match clock ended.
    func shootoutCard(team: Side, player: Int?, color: CardColor, now: Moment, reason: CardReason? = nil) throws -> MatchRecord {
        try rule(clock.phase == .shootout, "The shootout hasn't started.")
        try rule(color != .green, "Only yellow or red cards in the shootout.")
        let p = clock.period
        let at = clock.bankedMs
        return appending {
            .card(Card(seq: $0, wallTime: now.iso, period: p, clockMs: at, team: team, player: player, color: color, reason: reason, durationSec: nil, shootout: true))
        }
    }

    /// The final whistle. Ending mid-period (an abandoned match) closes the period first.
    func endMatch(_ now: Moment) throws -> MatchRecord {
        try rule(clock.phase != .ready && clock.phase != .ended, "The match hasn't started.")
        var next = try clock.phase == .playing ? endPeriod(now) : self
        next.document.endedAt = now.iso
        next.clock.phase = .ended
        next.clock.running = false
        next.clock.runningSince = nil
        next.clock.breakStartedAt = nil
        return next
    }
}

// MARK: - Time passing

struct Tick {
    var record: MatchRecord
    var alerts: [Alert]
}

extension MatchRecord {
    /// Moves the match on to `now`: logs suspensions that have run out and returns
    /// the alerts that are due. Called every second or so while a match is on;
    /// safe to call as often as you like, and after any gap (a crash or a reboot).
    func tick(_ now: Moment) -> Tick {
        var record = self
        var alerts: [Alert] = []
        func once(_ key: String, _ alert: Alert) {
            if !record.fired.contains(key) {
                record.fired.insert(key)
                alerts.append(alert)
            }
        }

        for s in record.suspensions(now) where s.remainingMs <= 0 {
            let (period, clockMs) = record.clockAt(s.endsAtMatchMs)
            let cardSeq = s.cardSeq
            record = record.appending { .cardEnd(CardEnd(seq: $0, wallTime: now.iso, period: period, clockMs: clockMs, refSeq: cardSeq)) }
            once("card:\(cardSeq)", .suspensionOver(cardSeq: cardSeq, team: s.team, player: s.player))
        }

        let c = record.clock
        switch c.phase {
        case .playing:
            let length = settings.periodLengthMs
            let left = length - record.periodElapsedMs(now)
            // Only the one that applies: after a gap (a restart, say) the two-minute one is skipped if it's already under a minute.
            if length > 120_000 && (60_001...120_000).contains(left) { once("two:\(c.period)", .twoMinutesLeft(period: c.period)) }
            if length > 60_000 && (1...60_000).contains(left) { once("minute:\(c.period)", .oneMinuteLeft(period: c.period)) }
            if left <= 0 { once("time:\(c.period)", .timeUp(period: c.period)) }
        case .breakTime:
            if record.breakRemainingMs(now) <= 0 { once("break:\(c.period)", .breakOver(afterPeriod: c.period)) }
        default:
            break
        }
        return Tick(record: record, alerts: alerts)
    }

    /// Period and clock time at which the match clock reached `matchMs`.
    private func clockAt(_ matchMs: Int64) -> (Int, Int64) {
        var before: Int64 = 0
        for (i, length) in clock.completedPeriodsMs.enumerated() {
            if matchMs <= before + length { return (i + 1, matchMs - before) }
            before += length
        }
        return (clock.period, matchMs - before)
    }

    var breakLengthMs: Int64 {
        let i = clock.period - 1
        return i >= 0 && i < settings.breakLengthsSec.count ? Int64(settings.breakLengthsSec[i]) * 1000 : 0
    }

    func breakRemainingMs(_ now: Moment) -> Int64 {
        guard let start = clock.breakStartedAt else { return 0 }
        return breakLengthMs - start.until(now)
    }
}

// MARK: - What the screen shows

struct Score: Equatable {
    var home: Int
    var away: Int

    subscript(side: Side) -> Int { side == .home ? home : away }
}

struct Suspension: Equatable {
    var cardSeq: Int
    var team: Side
    var player: Int?
    var color: CardColor
    var totalMs: Int64
    var remainingMs: Int64
    var endsAtMatchMs: Int64
}

struct ShootoutState: Equatable {
    static let rounds = 5

    var home: [Bool]
    var away: [Bool]
    var winner: Side?
    /// Who takes the next shoot-out; nil before the first (either may) and once it's decided.
    var next: Side?
    /// Teams with a player suspended in the shootout, who may have to forfeit.
    var suspended: Set<Side>

    var homeScore: Int { home.filter { $0 }.count }
    var awayScore: Int { away.filter { $0 }.count }
    var suddenDeath: Bool { home.count > Self.rounds || away.count > Self.rounds }
}

extension MatchRecord {
    var score: Score {
        var s = Score(home: 0, away: 0)
        for case let .goal(g) in activeEvents {
            if g.team == .home { s.home += 1 } else { s.away += 1 }
        }
        return s
    }

    var penaltyCorners: Score {
        var s = Score(home: 0, away: 0)
        for case let .penaltyCorner(p) in activeEvents {
            if p.team == .home { s.home += 1 } else { s.away += 1 }
        }
        return s
    }

    /// Green and yellow cards whose suspension hasn't been logged as over. Suspensions
    /// count down only while the match clock runs, per FIH rules, so they pause for
    /// stoppages and breaks and carry over into the next period.
    func suspensions(_ now: Moment) -> [Suspension] {
        let active = activeEvents
        let ended = Set(active.compactMap { if case let .cardEnd(e) = $0 { return e.refSeq } else { return nil } })
        let nowMs = matchTimeMs(now)
        return active.compactMap { event -> Suspension? in
            guard case let .card(card) = event, let duration = card.durationSec, !ended.contains(card.seq) else { return nil }
            let start = clock.completedPeriodsMs.prefix(card.period - 1).reduce(0, +) + card.clockMs
            let total = Int64(duration) * 1000
            return Suspension(cardSeq: card.seq, team: card.team, player: card.player, color: card.color, totalMs: total, remainingMs: start + total - nowMs, endsAtMatchMs: start + total)
        }
    }

    var shootout: ShootoutState {
        var home: [Bool] = []
        var away: [Bool] = []
        var first: Side?
        var suspended: Set<Side> = []
        for event in activeEvents {
            switch event {
            case let .shootoutAttempt(a):
                first = first ?? a.team
                if a.team == .home { home.append(a.scored) } else { away.append(a.scored) }
            case let .card(c) where c.shootout == true:
                suspended.insert(c.team)
            default:
                break
            }
        }
        let winner = shootoutWinner(home, away)
        let next = winner == nil ? first.map { shootoutTaker(first: $0, taken: home.count + away.count) } : nil
        return ShootoutState(home: home, away: away, winner: winner, next: next, suspended: suspended)
    }
}

/// Who takes shoot-out number `taken + 1`. The teams alternate, and the team that went
/// first in a series of five goes second in the next (FIH articles 21c and 22b).
func shootoutTaker(first: Side, taken: Int) -> Side {
    let starter = (taken / (2 * ShootoutState.rounds)) % 2 == 0 ? first : first.other
    return taken % 2 == 0 ? starter : starter.other
}

/// Five attempts each, stopping early once one side can't catch up; then sudden death in pairs.
func shootoutWinner(_ home: [Bool], _ away: [Bool]) -> Side? {
    let h = home.filter { $0 }.count
    let a = away.filter { $0 }.count
    let r = ShootoutState.rounds
    if home.count <= r && away.count <= r {
        if h + (r - home.count) < a { return .away }
        if a + (r - away.count) < h { return .home }
        return nil
    }
    if home.count == away.count && h != a { return h > a ? .home : .away }
    return nil
}
