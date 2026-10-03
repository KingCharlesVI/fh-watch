import XCTest
@testable import MatchEngine

/// A controllable pair of clocks.
final class FakeTime {
    var elapsed: Int64 = 1_000_000
    var wall: Int64 = 1_790_000_000_000
    var boot = 7

    var now: Moment { Moment(elapsedMs: elapsed, wallMs: wall, bootCount: boot) }

    func advance(_ ms: Int64) {
        elapsed += ms
        wall += ms
    }

    func reboot(downFor ms: Int64) {
        boot += 1
        elapsed = 5_000
        wall += ms
    }
}

let quarters = MatchSettings(periods: 4, periodLengthSec: 900, breakLengthsSec: [120, 300, 120], cardDurationsSec: Engine.defaultCards, shootoutIfDrawn: true)

let teams = Teams(
    home: Team(name: "Oxford Hawks M1", color: "#1E40AF", captain: 7),
    away: Team(name: "Reading M1", color: "#B91C1C")
)

let MIN: Int64 = 60_000

/// The same cases as the Wear OS app's EngineTest.kt, so both watches keep the same rules.
final class EngineTests: XCTestCase {
    var t = FakeTime()

    override func setUp() {
        t = FakeTime()
    }

    func newMatch(_ settings: MatchSettings = quarters) throws -> MatchRecord {
        try Engine.newMatch(settings: settings, teams: teams, venue: "Pitch 1", now: t.now)
    }

    func types(_ m: MatchRecord) -> [String] { m.document.events.map(\.type) }

    func testClockRunsOnlyWhileThePeriodIsLiveAndStopsAtFullTime() throws {
        var m = try newMatch().startPeriod(t.now)
        t.advance(5 * MIN)
        XCTAssertEqual(m.periodElapsedMs(t.now), 5 * MIN)

        m = try m.stopClock(t.now, reason: .injury)
        t.advance(3 * MIN) // stoppage: doesn't count
        XCTAssertEqual(m.periodElapsedMs(t.now), 5 * MIN)

        m = try m.resumeClock(t.now)
        t.advance(20 * MIN)
        XCTAssertEqual(m.periodElapsedMs(t.now), 15 * MIN)
        XCTAssertTrue(m.isTimeUp(t.now))
        XCTAssertThrowsError(try m.stopClock(t.now).resumeClock(t.now))
    }

    func testTheButtonStartsStopsResumesAndEndsAPeriodWhoseTimeIsUp() throws {
        var m = try newMatch().toggleClock(t.now)
        XCTAssertEqual(m.clock.phase, .playing)
        XCTAssertTrue(m.clock.running)
        t.advance(MIN)
        m = try m.toggleClock(t.now)
        XCTAssertFalse(m.clock.running)
        m = try m.toggleClock(t.now)
        XCTAssertTrue(m.clock.running)
        t.advance(15 * MIN)
        m = try m.toggleClock(t.now)
        XCTAssertEqual(m.clock.phase, .breakTime)
        guard case let .periodEnd(end) = m.document.events.last else { return XCTFail("no period end") }
        XCTAssertEqual(end.clockMs, 15 * MIN)
        // The break leads to the next period, which waits for a second press before the clock runs.
        m = try m.toggleClock(t.now)
        XCTAssertEqual(m.clock.phase, .nextPeriod)
        XCTAssertEqual(m.clock.period, 2)
        XCTAssertFalse(m.clock.running)
        XCTAssertEqual(types(m), ["period_start", "clock_stop", "clock_resume", "period_end"])
        m = try m.toggleClock(t.now)
        XCTAssertEqual(m.clock.phase, .playing)
        XCTAssertTrue(m.clock.running)
        XCTAssertEqual(types(m), ["period_start", "clock_stop", "clock_resume", "period_end", "period_start"])
    }

    func testTheNextPeriodWaitsForTheWhistleAndStartsFromZero() throws {
        var m = try newMatch().startPeriod(t.now)
        t.advance(15 * MIN)
        m = try m.endPeriod(t.now)
        t.advance(30_000)
        m = try m.nextPeriod()
        XCTAssertEqual(m.clock.phase, .nextPeriod)
        XCTAssertEqual(m.clock.period, 2)
        // Nothing is logged and no time runs until the period actually starts.
        XCTAssertEqual(types(m), ["period_start", "period_end"])
        t.advance(2 * MIN)
        XCTAssertEqual(m.periodElapsedMs(t.now), 0)
        XCTAssertEqual(m.matchTimeMs(t.now), 15 * MIN)
        XCTAssertTrue(m.tick(t.now).alerts.isEmpty())

        m = try m.startPeriod(t.now)
        XCTAssertEqual(m.clock.period, 2)
        guard case let .periodStart(start) = m.document.events.last else { return XCTFail("no period start") }
        XCTAssertEqual(start, PeriodStart(seq: 3, wallTime: t.now.iso, period: 2, clockMs: 0))
        t.advance(MIN)
        XCTAssertEqual(m.periodElapsedMs(t.now), MIN)
        XCTAssertThrowsError(try m.nextPeriod())
    }

    func testKickoffSetsStartedAtAndEachPeriodStartsAtZero() throws {
        t.advance(10 * MIN)
        let m = try newMatch().startPeriod(t.now)
        XCTAssertEqual(m.document.startedAt, t.now.iso)
        XCTAssertEqual(m.document.events, [.periodStart(PeriodStart(seq: 1, wallTime: t.now.iso, period: 1, clockMs: 0))])
    }

    func testAFullMatchRunsThroughBreaksToFullTimeAndTheFinalWhistle() throws {
        var m = try newMatch()
        for p in 0..<4 {
            m = try m.startPeriod(t.now)
            t.advance(15 * MIN)
            m = try m.endPeriod(t.now)
            if p < 3 {
                XCTAssertEqual(m.clock.phase, .breakTime)
                t.advance(Int64(quarters.breakLengthsSec[p]) * 1000)
            }
        }
        XCTAssertEqual(m.clock.phase, .fullTime)
        XCTAssertEqual(m.matchTimeMs(t.now), 60 * MIN)
        m = try m.endMatch(t.now)
        XCTAssertEqual(m.clock.phase, .ended)
        XCTAssertEqual(m.document.endedAt, t.now.iso)
        XCTAssertThrowsError(try m.startPeriod(t.now))
    }

    func testEndingTheMatchMidPeriodClosesThePeriodFirst() throws {
        var m = try newMatch().startPeriod(t.now)
        t.advance(7 * MIN)
        m = try m.endMatch(t.now)
        XCTAssertEqual(types(m), ["period_start", "period_end"])
        guard case let .periodEnd(end) = m.document.events.last else { return XCTFail("no period end") }
        XCTAssertEqual(end.clockMs, 7 * MIN)
    }

    func testGoalsCornersAndStrokesCountPerTeam() throws {
        var m = try newMatch().startPeriod(t.now)
        t.advance(MIN)
        m = try m.goal(team: .home, player: 9, method: .field, now: t.now)
            .penaltyCorner(team: .away, now: t.now)
            .penaltyCorner(team: .away, now: t.now)
            .goal(team: .away, player: nil, method: .ps, now: t.now)
            .missedStroke(team: .home, now: t.now)
        XCTAssertEqual(m.score, Score(home: 1, away: 1))
        XCTAssertEqual(m.penaltyCorners, Score(home: 0, away: 2))
        // A stroke goal records the stroke too, so the website's check that they match holds.
        let stroke = m.document.events.compactMap { if case let .penaltyStroke(s) = $0 { return s } else { return nil } }.first!
        XCTAssertTrue(stroke.scored && stroke.team == .away)
        guard case let .goal(first) = m.document.events[1] else { return XCTFail("no goal") }
        XCTAssertEqual(first.clockMs, MIN)
    }

    func testNothingCanBeRecordedBeforeKickoffOrInABreak() throws {
        XCTAssertThrowsError(try newMatch().goal(team: .home, player: nil, method: nil, now: t.now))
        var m = try newMatch().startPeriod(t.now)
        t.advance(15 * MIN)
        m = try m.endPeriod(t.now)
        XCTAssertThrowsError(try m.card(team: .home, player: 4, kind: .green, now: t.now))
    }

    func testUndoCancelsWithoutDeletingAndAStrokeGoalWithItsStroke() throws {
        var m = try newMatch().startPeriod(t.now)
        m = try m.goal(team: .home, player: 9, method: nil, now: t.now)
        let goalSeq = m.document.events.last!.seq
        m = try m.undo(seq: goalSeq, now: t.now)
        XCTAssertEqual(m.score, Score(home: 0, away: 0))
        guard case let .void(v) = m.document.events.last else { return XCTFail("no void") }
        XCTAssertEqual(v.refSeq, goalSeq)
        XCTAssertThrowsError(try m.undo(seq: goalSeq, now: t.now))
        XCTAssertThrowsError(try m.undo(seq: 1, now: t.now)) // the period start

        m = try m.goal(team: .away, player: 11, method: .ps, now: t.now)
        m = try m.undo(seq: m.document.events.last!.seq, now: t.now)
        let voids = Set(m.document.events.suffix(2).compactMap { if case let .void(v) = $0 { return v.refSeq } else { return nil } })
        let strokeAndGoal = Set(m.document.events.compactMap { e -> Int? in
            switch e {
            case let .penaltyStroke(s): return s.seq
            case let .goal(g) where g.method == .ps: return g.seq
            default: return nil
            }
        })
        XCTAssertEqual(voids, strokeAndGoal)
        XCTAssertEqual(m.score, Score(home: 0, away: 0))
    }

    func testSuspensionsCountDownOnlyWhileTheClockRuns() throws {
        var m = try newMatch().startPeriod(t.now)
        t.advance(14 * MIN)
        m = try m.card(team: .away, player: 4, kind: .yellowShort, now: t.now) // 5 minutes, 1 minute left in Q1
        t.advance(30_000)
        m = try m.stopClock(t.now)
        t.advance(10 * MIN) // stoppage
        XCTAssertEqual(m.suspensions(t.now).map(\.remainingMs), [270_000])
        m = try m.resumeClock(t.now)
        t.advance(30_000)
        m = try m.endPeriod(t.now)
        t.advance(2 * MIN) // break
        XCTAssertEqual(m.suspensions(t.now).map(\.remainingMs), [240_000])

        m = try m.startPeriod(t.now)
        t.advance(4 * MIN - 1)
        var tick = m.tick(t.now)
        XCTAssertTrue(tick.alerts.isEmpty)
        t.advance(1)
        tick = tick.record.tick(t.now)
        m = tick.record
        guard case let .cardEnd(end) = m.document.events.last else { return XCTFail("no card end") }
        let cardSeq = m.document.events.first { if case .card = $0 { return true } else { return false } }!.seq
        XCTAssertEqual(end, CardEnd(seq: end.seq, wallTime: t.now.iso, period: 2, clockMs: 4 * MIN, refSeq: cardSeq))
        XCTAssertEqual(tick.alerts, [.suspensionOver(cardSeq: cardSeq, team: .away, player: 4)])
        XCTAssertTrue(m.suspensions(t.now).isEmpty)
        XCTAssertTrue(m.tick(t.now).alerts.isEmpty)
    }

    func testARedCardHasNoTimerAndACancelledCardsTimerGoes() throws {
        var m = try newMatch().startPeriod(t.now)
        m = try m.card(team: .home, player: 3, kind: .red, now: t.now)
        guard case let .card(red) = m.document.events.last else { return XCTFail("no card") }
        XCTAssertNil(red.durationSec)
        XCTAssertTrue(m.suspensions(t.now).isEmpty)
        m = try m.card(team: .home, player: 5, kind: .green, now: t.now)
        XCTAssertEqual(m.suspensions(t.now).count, 1)
        m = try m.undo(seq: m.document.events.last!.seq, now: t.now)
        XCTAssertTrue(m.suspensions(t.now).isEmpty)
    }

    func testSeveralSuspensionsRunAtOnceAndEndInOrder() throws {
        var m = try newMatch().startPeriod(t.now)
        m = try m.card(team: .home, player: 2, kind: .green, now: t.now)
        t.advance(MIN)
        m = try m.card(team: .away, player: 6, kind: .yellowLong, now: t.now)
        m = try m.card(team: .away, player: 8, kind: .green, now: t.now)
        XCTAssertEqual(m.suspensions(t.now).map(\.remainingMs), [MIN, 10 * MIN, 2 * MIN])
        t.advance(2 * MIN)
        let players = m.tick(t.now).alerts.compactMap { if case let .suspensionOver(_, _, p) = $0 { return p } else { return nil } }
        XCTAssertEqual(players, [2, 8])
    }

    func testASuspensionThatRanOutWhileTheWatchWasOffIsLoggedWhenItRanOut() throws {
        var m = try newMatch().startPeriod(t.now)
        m = try m.card(team: .home, player: 2, kind: .green, now: t.now)
        t.advance(10 * MIN)
        m = m.tick(t.now).record
        guard case let .cardEnd(end) = m.document.events.last else { return XCTFail("no card end") }
        XCTAssertEqual(end.clockMs, 2 * MIN)
    }

    func testAlertsFireOnceEach() throws {
        var m = try newMatch().startPeriod(t.now)
        t.advance(12 * MIN)
        XCTAssertTrue(m.tick(t.now).alerts.isEmpty)
        t.advance(MIN)
        var tick = m.tick(t.now)
        XCTAssertEqual(tick.alerts, [.twoMinutesLeft(period: 1)])
        m = tick.record
        XCTAssertTrue(m.tick(t.now).alerts.isEmpty)
        t.advance(MIN)
        tick = m.tick(t.now)
        XCTAssertEqual(tick.alerts, [.oneMinuteLeft(period: 1)])
        m = tick.record
        XCTAssertTrue(m.tick(t.now).alerts.isEmpty)
        t.advance(MIN)
        tick = m.tick(t.now)
        XCTAssertEqual(tick.alerts, [.timeUp(period: 1)])
        m = try tick.record.endPeriod(t.now)
        t.advance(2 * MIN)
        tick = m.tick(t.now)
        XCTAssertEqual(tick.alerts, [.breakOver(afterPeriod: 1)])
        XCTAssertTrue(tick.record.tick(t.now).alerts.isEmpty)
    }

    func testAfterAGapOnlyTheAlertThatStillAppliesFires() throws {
        let m = try newMatch().startPeriod(t.now)
        t.advance(14 * MIN + 30_000)
        XCTAssertEqual(m.tick(t.now).alerts, [.oneMinuteLeft(period: 1)])
    }

    func testTheClockSurvivesARebootByFallingBackToTheWallClock() throws {
        var m = try newMatch().startPeriod(t.now)
        t.advance(4 * MIN)
        t.reboot(downFor: 2 * MIN)
        XCTAssertEqual(m.periodElapsedMs(t.now), 6 * MIN)
        m = try m.stopClock(t.now)
        t.advance(MIN)
        m = try m.resumeClock(t.now)
        t.advance(MIN)
        XCTAssertEqual(m.periodElapsedMs(t.now), 7 * MIN)
    }

    func testChangingTheWallClockDoesntDisturbTheMatchClock() throws {
        let m = try newMatch().startPeriod(t.now)
        t.advance(MIN)
        t.wall -= 60 * MIN // the watch syncs its time
        XCTAssertEqual(m.periodElapsedMs(t.now), MIN)
    }

    func testADrawnMatchCanGoToAShootoutWhichStopsOnceDecided() throws {
        var m = try fullTime(newMatch())
        m = try m.startShootout()
        // Home scores 3 of 3, away misses 3 of 3: away can't catch up with two left.
        for i in 0..<3 {
            m = try m.shootoutAttempt(team: .home, player: nil, scored: true, now: t.now)
                .shootoutAttempt(team: .away, player: 10 + i, scored: false, now: t.now)
        }
        XCTAssertEqual(m.shootout.winner, .home)
        XCTAssertThrowsError(try m.shootoutAttempt(team: .home, player: nil, scored: true, now: t.now))
        let awayRounds = m.document.events.compactMap { if case let .shootoutAttempt(a) = $0, a.team == .away { return a.round } else { return nil } }
        XCTAssertEqual(awayRounds, [1, 2, 3])
    }

    func testALevelShootoutGoesToSuddenDeathInPairs() {
        let five = (0..<5).map { $0 % 2 == 0 }
        XCTAssertNil(shootoutWinner(five, five))
        XCTAssertNil(shootoutWinner(five + [true], five))
        XCTAssertEqual(shootoutWinner(five + [true], five + [false]), .home)
        XCTAssertNil(shootoutWinner(five + [true], five + [true]))
        XCTAssertEqual(shootoutWinner(five + [true, false], five + [true, true]), .away)
        // Early finish in the first five.
        XCTAssertEqual(shootoutWinner([false, false, false], [true, true, true]), .away)
        XCTAssertNil(shootoutWinner([false, false, false], [true, true]))
    }

    func testNoShootoutUnlessTheScoreIsLevelAtFullTime() throws {
        var m = try newMatch().startPeriod(t.now).goal(team: .home, player: nil, method: nil, now: t.now)
        m = try fullTime(m)
        XCTAssertThrowsError(try m.startShootout())
    }

    func testMatchIdsAreVersion7UUIDsInTimeOrder() {
        let a = Engine.uuidV7(1_790_000_000_000)
        let b = Engine.uuidV7(1_790_000_000_001)
        XCTAssertNotNil(a.range(of: "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", options: .regularExpression))
        XCTAssertLessThan(a, b)
    }

    func fullTime(_ start: MatchRecord) throws -> MatchRecord {
        var m = start
        while m.clock.phase != .fullTime {
            if m.clock.phase != .playing { m = try m.startPeriod(t.now) }
            t.advance(15 * MIN)
            m = try m.endPeriod(t.now)
        }
        return m
    }
}
