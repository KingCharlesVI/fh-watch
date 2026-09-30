import Foundation
import XCTest
@testable import MatchEngine

/**
 * The watch's documents against the contract the phone and API enforce. The full
 * match is written to mobile/test/fixtures/watchos-full-match.json, which the
 * phone's tests check with the shared Zod schema, as they do the Wear OS app's.
 */
final class DocumentTests: XCTestCase {
    let t = FakeTime()

    /// A match that uses every kind of event the watch writes, as the Wear OS app's DocumentSchemaTest plays it.
    func everything() throws -> MatchRecord {
        var m = try Engine.newMatch(settings: quarters, teams: teams, venue: "Oxford Hawks, Pitch 1", now: t.now)
        m = try m.startPeriod(t.now)
        t.advance(3 * MIN)
        m = try m.goal(team: .home, player: 9, method: .field, now: t.now)
            .goal(team: .away, player: nil, method: nil, now: t.now)
            .penaltyCorner(team: .home, now: t.now)
            .card(team: .away, player: 4, kind: .green, now: t.now)
            .card(team: .home, player: 12, kind: .yellowLong, now: t.now, reason: .dissent)
            .card(team: .home, player: 3, kind: .red, now: t.now)
            .stopClock(t.now, reason: .video)
        t.advance(MIN)
        m = try m.resumeClock(t.now)
        t.advance(3 * MIN)
        m = try m.tick(t.now).record // the green card ends
            .goal(team: .away, player: 11, method: .ps, now: t.now)
            .missedStroke(team: .home, now: t.now)
            .goal(team: .home, player: 10, method: .pc, now: t.now)
        m = try m.undo(seq: m.document.events.last!.seq, now: t.now)
        m = try m.goal(team: .home, player: 10, method: .pc, now: t.now)
        while m.clock.phase != .fullTime {
            if m.clock.phase == .breakTime { m = try m.startPeriod(t.now) }
            t.advance(15 * MIN)
            m = try m.tick(t.now).record.endPeriod(t.now)
        }
        m = try m.startShootout()
        for i in 0..<5 { // 4–4 after five each
            m = try m.shootoutAttempt(team: .home, player: 20 + i, scored: i != 2, now: t.now)
                .shootoutAttempt(team: .away, player: nil, scored: i < 4, now: t.now)
        }
        m = try m.shootoutAttempt(team: .home, player: 7, scored: true, now: t.now).shootoutAttempt(team: .away, player: 5, scored: false, now: t.now)
        m = try m.undo(seq: m.document.events.last!.seq, now: t.now).shootoutAttempt(team: .away, player: 5, scored: false, now: t.now)
        return try m.endMatch(t.now)
    }

    func json(_ document: MatchDocument) throws -> String {
        String(decoding: try DocumentJSON.encode(document), as: UTF8.self)
    }

    func testAFullMatchUsesEveryEventTypeAndIsWrittenForThePhonesTests() throws {
        let m = try everything()
        let types = Set(m.document.events.map(\.type))
        for type in ["period_start", "period_end", "clock_stop", "clock_resume", "goal", "card", "card_end", "penalty_corner", "penalty_stroke", "shootout_attempt", "void"] {
            XCTAssertTrue(types.contains(type), "no \(type) event")
        }
        XCTAssertEqual(m.shootout.winner, .home)
        XCTAssertEqual(m.document.createdOn, "watchos")

        let fixture = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("test/fixtures/watchos-full-match.json")
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .prettyPrinted, .withoutEscapingSlashes]
        try encoder.encode(m.document).write(to: fixture)
    }

    func testOptionalFieldsAreLeftOutRatherThanSentAsNull() throws {
        var m = try Engine.newMatch(settings: quarters, teams: Teams(home: teams.home, away: Team(name: "Reading M1", color: "#B91C1C")), venue: nil, now: t.now)
            .startPeriod(t.now)
        m = try m.goal(team: .away, player: nil, method: nil, now: t.now)
        let text = try json(m.document)
        XCTAssertFalse(text.contains("venue"))
        XCTAssertFalse(text.contains("\"player\""))
        XCTAssertFalse(text.contains("endedAt"))
        XCTAssertFalse(text.contains("competition"))
        // teamId is required-but-nullable, so it's always there.
        XCTAssertEqual(text.components(separatedBy: "\"teamId\":null").count - 1, 2)
    }

    func testTheWearOSAppsDocumentReadsBackUnchanged() throws {
        let fixture = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("test/fixtures/wear-full-match.json")
        let data = try Data(contentsOf: fixture)
        let document = try DocumentJSON.decode(data)
        let again = try JSONSerialization.jsonObject(with: try DocumentJSON.encode(document)) as? NSDictionary
        let original = try JSONSerialization.jsonObject(with: data) as? NSDictionary
        XCTAssertEqual(again, original)
    }

    func testAStoredMatchSurvivesARoundTripIncludingTheClock() throws {
        var m = try everything()
        m.clock.runningSince = t.now
        let stored = try JSONEncoder().encode(m)
        XCTAssertEqual(try JSONDecoder().decode(MatchRecord.self, from: stored), m)
    }
}
