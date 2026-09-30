import Foundation

// The match document the watch sends to the phone: the same contract as
// packages/shared/src/schema.ts (and schema/match.schema.json), and the same
// as the Wear OS app's Document.kt. Optional fields are left out when unset,
// because the schema rejects unknown fields and nulls where it expects absence.
// Foundation only, so the engine tests run with `swift test` (see ../../Package.swift).

let schemaVersion = 1

enum Side: String, Codable, CaseIterable {
    case home, away

    var other: Side { self == .home ? .away : .home }
}

enum CardColor: String, Codable {
    case green, yellow, red
}

/// Why a card was given; the same codes as CardReason in packages/shared/src/schema.ts.
enum CardReason: String, Codable, CaseIterable {
    case danger, breakdown, physical, dissent, other
}

enum GoalMethod: String, Codable {
    case field, pc, ps
}

enum StopReason: String, Codable {
    case injury, video, other
}

struct CardDurations: Codable, Equatable {
    var green: Int
    var yellowShort: Int
    var yellowLong: Int
}

struct MatchSettings: Codable, Equatable {
    var periods: Int
    var periodLengthSec: Int
    /// After each period except the last.
    var breakLengthsSec: [Int]
    var cardDurationsSec: CardDurations
    var shootoutIfDrawn: Bool

    var periodLengthMs: Int64 { Int64(periodLengthSec) * 1000 }
}

struct Team: Codable, Equatable {
    var name: String
    /// Always present: null until the umpire links the team on the phone.
    var teamId: String?
    var color: String
    var captain: Int?

    init(name: String, teamId: String? = nil, color: String, captain: Int? = nil) {
        self.name = name
        self.teamId = teamId
        self.color = color
        self.captain = captain
    }

    enum CodingKeys: String, CodingKey { case name, teamId, color, captain }

    // teamId is required but nullable, so it's written as null rather than left out.
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(name, forKey: .name)
        if let teamId { try c.encode(teamId, forKey: .teamId) } else { try c.encodeNil(forKey: .teamId) }
        try c.encode(color, forKey: .color)
        try c.encodeIfPresent(captain, forKey: .captain)
    }
}

/// The shirt numbers a player can have, as in the match format.
let shirtNumbers = 0...999

struct Teams: Codable, Equatable {
    var home: Team
    var away: Team

    subscript(side: Side) -> Team { side == .home ? home : away }
}

struct MatchDocument: Codable, Equatable {
    var schemaVersion: Int
    var id: String
    var createdOn: String
    var settings: MatchSettings
    var teams: Teams
    var venue: String?
    var competition: String?
    var startedAt: String
    var endedAt: String?
    var events: [MatchEvent]
}

// MARK: - Events

struct PeriodStart: Codable, Equatable { var seq: Int; var wallTime: String?; var period: Int; var clockMs: Int64 }
struct PeriodEnd: Codable, Equatable { var seq: Int; var wallTime: String?; var period: Int; var clockMs: Int64 }
struct ClockStop: Codable, Equatable { var seq: Int; var wallTime: String?; var period: Int; var clockMs: Int64; var reason: StopReason? }
struct ClockResume: Codable, Equatable { var seq: Int; var wallTime: String?; var period: Int; var clockMs: Int64 }

struct Goal: Codable, Equatable {
    var seq: Int
    var wallTime: String?
    var period: Int
    var clockMs: Int64
    var team: Side
    var player: Int?
    var method: GoalMethod?
}

struct Card: Codable, Equatable {
    var seq: Int
    var wallTime: String?
    var period: Int
    var clockMs: Int64
    var team: Side
    var player: Int?
    var color: CardColor
    var reason: CardReason?
    /// Suspension length; absent for red.
    var durationSec: Int?
}

struct CardEnd: Codable, Equatable { var seq: Int; var wallTime: String?; var period: Int; var clockMs: Int64; var refSeq: Int }
struct PenaltyCorner: Codable, Equatable { var seq: Int; var wallTime: String?; var period: Int; var clockMs: Int64; var team: Side }
struct PenaltyStroke: Codable, Equatable { var seq: Int; var wallTime: String?; var period: Int; var clockMs: Int64; var team: Side; var scored: Bool }

struct ShootoutAttempt: Codable, Equatable {
    var seq: Int
    var wallTime: String?
    var team: Side
    var round: Int
    var player: Int?
    var scored: Bool
}

struct VoidEvent: Codable, Equatable { var seq: Int; var wallTime: String?; var refSeq: Int; var period: Int?; var clockMs: Int64? }
struct Note: Codable, Equatable { var seq: Int; var wallTime: String?; var text: String; var period: Int?; var clockMs: Int64? }

/// One entry in the event log, tagged by `type` in JSON.
enum MatchEvent: Equatable {
    case periodStart(PeriodStart)
    case periodEnd(PeriodEnd)
    case clockStop(ClockStop)
    case clockResume(ClockResume)
    case goal(Goal)
    case card(Card)
    case cardEnd(CardEnd)
    case penaltyCorner(PenaltyCorner)
    case penaltyStroke(PenaltyStroke)
    case shootoutAttempt(ShootoutAttempt)
    case void(VoidEvent)
    case note(Note)

    var seq: Int {
        switch self {
        case let .periodStart(e): e.seq
        case let .periodEnd(e): e.seq
        case let .clockStop(e): e.seq
        case let .clockResume(e): e.seq
        case let .goal(e): e.seq
        case let .card(e): e.seq
        case let .cardEnd(e): e.seq
        case let .penaltyCorner(e): e.seq
        case let .penaltyStroke(e): e.seq
        case let .shootoutAttempt(e): e.seq
        case let .void(e): e.seq
        case let .note(e): e.seq
        }
    }

    var type: String {
        switch self {
        case .periodStart: "period_start"
        case .periodEnd: "period_end"
        case .clockStop: "clock_stop"
        case .clockResume: "clock_resume"
        case .goal: "goal"
        case .card: "card"
        case .cardEnd: "card_end"
        case .penaltyCorner: "penalty_corner"
        case .penaltyStroke: "penalty_stroke"
        case .shootoutAttempt: "shootout_attempt"
        case .void: "void"
        case .note: "note"
        }
    }

    /// The team an event belongs to, if it belongs to one.
    var team: Side? {
        switch self {
        case let .goal(e): e.team
        case let .card(e): e.team
        case let .penaltyCorner(e): e.team
        case let .penaltyStroke(e): e.team
        case let .shootoutAttempt(e): e.team
        default: nil
        }
    }
}

extension MatchEvent: Codable {
    private enum TypeKey: String, CodingKey { case type }

    init(from decoder: Decoder) throws {
        let type = try decoder.container(keyedBy: TypeKey.self).decode(String.self, forKey: .type)
        switch type {
        case "period_start": self = .periodStart(try PeriodStart(from: decoder))
        case "period_end": self = .periodEnd(try PeriodEnd(from: decoder))
        case "clock_stop": self = .clockStop(try ClockStop(from: decoder))
        case "clock_resume": self = .clockResume(try ClockResume(from: decoder))
        case "goal": self = .goal(try Goal(from: decoder))
        case "card": self = .card(try Card(from: decoder))
        case "card_end": self = .cardEnd(try CardEnd(from: decoder))
        case "penalty_corner": self = .penaltyCorner(try PenaltyCorner(from: decoder))
        case "penalty_stroke": self = .penaltyStroke(try PenaltyStroke(from: decoder))
        case "shootout_attempt": self = .shootoutAttempt(try ShootoutAttempt(from: decoder))
        case "void": self = .void(try VoidEvent(from: decoder))
        case "note": self = .note(try Note(from: decoder))
        default:
            throw DecodingError.dataCorruptedError(forKey: .type, in: try decoder.container(keyedBy: TypeKey.self), debugDescription: "Unknown event type \(type)")
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: TypeKey.self)
        try c.encode(type, forKey: .type)
        switch self {
        case let .periodStart(e): try e.encode(to: encoder)
        case let .periodEnd(e): try e.encode(to: encoder)
        case let .clockStop(e): try e.encode(to: encoder)
        case let .clockResume(e): try e.encode(to: encoder)
        case let .goal(e): try e.encode(to: encoder)
        case let .card(e): try e.encode(to: encoder)
        case let .cardEnd(e): try e.encode(to: encoder)
        case let .penaltyCorner(e): try e.encode(to: encoder)
        case let .penaltyStroke(e): try e.encode(to: encoder)
        case let .shootoutAttempt(e): try e.encode(to: encoder)
        case let .void(e): try e.encode(to: encoder)
        case let .note(e): try e.encode(to: encoder)
        }
    }
}

// MARK: - JSON

enum DocumentJSON {
    /// Encodes a document exactly as the schema wants it.
    static func encode(_ document: MatchDocument) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return try encoder.encode(document)
    }

    static func decode(_ data: Data) throws -> MatchDocument {
        try JSONDecoder().decode(MatchDocument.self, from: data)
    }
}
