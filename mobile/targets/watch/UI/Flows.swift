import SwiftUI

/// Pick the team: two big buttons in the teams' colours.
private struct PickTeam: View {
    let m: MatchRecord
    let title: String
    let onPick: (Side) -> Void

    var body: some View {
        List {
            TeamButton(team: m.document.teams.home, secondary: "Home") { onPick(.home) }
            TeamButton(team: m.document.teams.away, secondary: "Away") { onPick(.away) }
        }
        .navigationTitle(title)
    }
}

/// Goal: team (unless the Goals page's button already said), then scorer (optional), then how it was scored (optional).
struct GoalFlow: View {
    @Environment(MatchController.self) private var controller
    @State private var team: Side?
    @State private var player: Int?
    @State private var pickedPlayer = false
    @Binding var path: [Route]

    init(team: Side?, path: Binding<[Route]>) {
        _team = State(initialValue: team)
        _path = path
    }

    var body: some View {
        if let m = controller.active {
            if team == nil {
                PickTeam(m: m, title: "Goal") { team = $0 }
            } else if !pickedPlayer {
                NumberPad(title: "Scorer", range: shirtNumbers, initial: nil, optional: true) { player = $0; pickedPlayer = true }
            } else {
                List {
                    ChoiceButton(label: "Field goal") { save(.field) }
                    ChoiceButton(label: "Penalty corner") { save(.pc) }
                    ChoiceButton(label: "Penalty stroke") { save(.ps) }
                    ChoiceButton(label: "Skip") { save(nil) }
                }
                .navigationTitle("How?")
            }
        }
    }

    private func save(_ method: GoalMethod?) {
        let side = team!
        let scorer = player
        controller.perform("goal") { try $0.goal(team: side, player: scorer, method: method, now: $1) }
        path.removeLast()
    }
}

/// Card: team, colour and length, the player (required), then why (optional). If the
/// player already has a card this match, the umpire confirms before going on.
struct CardFlow: View {
    @Environment(MatchController.self) private var controller
    @State private var team: Side?
    @State private var kind: CardKind?
    @State private var repeatFor: Int?
    @State private var player: Int?
    @Binding var path: [Route]

    var body: some View {
        if let m = controller.active {
            let s = m.settings
            if team == nil {
                PickTeam(m: m, title: "Card") { team = $0 }
            } else if kind == nil && m.clock.phase == .shootout {
                // In the shootout: yellow or red only, and either is for the rest of it.
                List {
                    ChoiceButton(label: "Yellow", secondary: "Rest of shootout", color: .cardYellow) { kind = .yellowShort }
                    ChoiceButton(label: "Red", secondary: "Rest of shootout", color: .cardRed) { kind = .red }
                }
                .navigationTitle("Card")
            } else if kind == nil {
                List {
                    ChoiceButton(label: "Green", secondary: mins(s, .green), color: .cardGreen) { kind = .green }
                    ChoiceButton(label: "Yellow", secondary: mins(s, .yellowShort), color: .cardYellow) { kind = .yellowShort }
                    ChoiceButton(label: "Yellow", secondary: mins(s, .yellowLong), color: .cardYellow) { kind = .yellowLong }
                    ChoiceButton(label: "Red", secondary: "Rest of match", color: .cardRed) { kind = .red }
                }
                .navigationTitle("Card")
            } else if player != nil {
                List {
                    ChoiceButton(label: "Skip") { save(nil) }
                    ForEach(CardReason.allCases, id: \.self) { r in
                        ChoiceButton(label: cardReasonLabels[r] ?? r.rawValue) { save(r) }
                    }
                }
                .navigationTitle("Why?")
            } else if let number = repeatFor {
                let earlier = cards(m, number)
                List {
                    Text("#\(number) already has " + earlier.map { c in
                        "a \(c.color.rawValue) card (\(c.shootout == true ? "shootout" : "\(periodName(c.period, s.periods)) \(formatClock(c.clockMs))"))"
                    }.joined(separator: " and ") + ".")
                    .font(.footnote)
                    ChoiceButton(label: "Continue", color: .brand) { player = number; repeatFor = nil }
                    ChoiceButton(label: "Change card") { kind = nil; repeatFor = nil }
                }
                .navigationTitle("Card \(earlier.count + 1) for #\(number)")
            } else {
                NumberPad(title: "Player", range: shirtNumbers, initial: nil, optional: false) { number in
                    guard let n = number else { return }
                    if cards(m, n).isEmpty { player = n } else { repeatFor = n }
                }
            }
        }
    }

    private func cards(_ m: MatchRecord, _ number: Int) -> [Card] {
        m.activeEvents.compactMap { if case let .card(c) = $0, c.team == team, c.player == number { return c } else { return nil } }
    }

    private func mins(_ s: MatchSettings, _ k: CardKind) -> String? {
        s.durationSec(k).map { "\($0 / 60)′" + ($0 % 60 != 0 ? "\($0 % 60)″" : "") }
    }

    private func save(_ reason: CardReason?) {
        guard let side = team, let k = kind, let number = player, let m = controller.active else { return }
        if m.clock.phase == .shootout {
            controller.perform("card") { try $0.shootoutCard(team: side, player: number, color: k.color, now: $1, reason: reason) }
        } else {
            controller.perform("card") { try $0.card(team: side, player: number, kind: k, now: $1, reason: reason) }
        }
        path.removeLast()
    }
}

/// The log, newest first. Recorded events can be cancelled; cancelled ones are struck through.
struct EventsView: View {
    @Environment(MatchController.self) private var controller
    @State private var confirm: Int?

    var body: some View {
        if let m = controller.active {
            let voided = m.voidedSeqs
            let events = m.document.events.filter { if case .void = $0 { return false } else { return true } }.reversed()
            List {
                if events.isEmpty { Text("Nothing yet") }
                ForEach(Array(events), id: \.seq) { e in
                    let cancelled = voided.contains(e.seq)
                    Button {
                        if e.isUndoable && !cancelled { confirm = e.seq }
                    } label: {
                        VStack(alignment: .leading) {
                            Text(describe(m, e)).font(.footnote).strikethrough(cancelled)
                            Text(whenText(m, e) + (cancelled ? " · cancelled" : "")).font(.caption2).foregroundStyle(Color.muted)
                        }
                    }
                }
            }
            .navigationTitle("Events")
            .alert("Cancel this?", isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } })) {
                Button("Cancel it", role: .destructive) {
                    if let seq = confirm { controller.perform { try $0.undo(seq: seq, now: $1) } }
                    confirm = nil
                }
                Button("Keep", role: .cancel) { confirm = nil }
            } message: {
                Text(m.document.events.first { $0.seq == confirm }.map { describe(m, $0) } ?? "")
            }
        }
    }
}

func describe(_ m: MatchRecord, _ e: MatchEvent) -> String {
    let t = m.document.teams
    func who(_ side: Side, _ player: Int?) -> String { t[side].name + (player.map { " #\($0)" } ?? "") }
    let periods = m.settings.periods
    switch e {
    case let .goal(g): return "Goal " + who(g.team, g.player) + (g.method == .pc ? " (PC)" : g.method == .ps ? " (PS)" : "")
    case let .card(c): return c.color.rawValue.capitalized + " card " + who(c.team, c.player) + (c.reason.flatMap { cardReasonLabels[$0] }.map { ": " + $0.lowercased() } ?? "")
    case .cardEnd: return "Suspension over"
    case let .penaltyCorner(p): return "PC " + t[p.team].name
    case let .penaltyStroke(p): return "Stroke " + t[p.team].name + (p.scored ? " scored" : " missed")
    case let .shootoutAttempt(a): return "Shootout " + who(a.team, a.player) + (a.forfeit == true ? " forfeited" : a.scored ? " scored" : " missed")
    case let .periodStart(p): return "Start of \(periodName(p.period, periods))"
    case let .periodEnd(p): return "End of \(periodName(p.period, periods))"
    case let .clockStop(c): return "Clock stopped" + (c.reason.map { " (\($0.rawValue))" } ?? "")
    case .clockResume: return "Clock restarted"
    case let .note(n): return n.text
    case .void: return "Cancelled"
    }
}

private func whenText(_ m: MatchRecord, _ e: MatchEvent) -> String {
    let periods = m.settings.periods
    switch e {
    case let .periodStart(x): return "\(periodName(x.period, periods)) \(formatClock(x.clockMs))"
    case let .periodEnd(x): return "\(periodName(x.period, periods)) \(formatClock(x.clockMs))"
    case let .clockStop(x): return "\(periodName(x.period, periods)) \(formatClock(x.clockMs))"
    case let .clockResume(x): return "\(periodName(x.period, periods)) \(formatClock(x.clockMs))"
    case let .goal(x): return "\(periodName(x.period, periods)) \(formatClock(x.clockMs))"
    case let .card(x): return x.shootout == true ? "Shootout" : "\(periodName(x.period, periods)) \(formatClock(x.clockMs))"
    case let .cardEnd(x): return "\(periodName(x.period, periods)) \(formatClock(x.clockMs))"
    case let .penaltyCorner(x): return "\(periodName(x.period, periods)) \(formatClock(x.clockMs))"
    case let .penaltyStroke(x): return "\(periodName(x.period, periods)) \(formatClock(x.clockMs))"
    case let .shootoutAttempt(a): return "Round \(a.round)"
    default: return ""
    }
}

/// The shootout. Whoever takes the first shoot-out sets the order (the coin toss), so from
/// then on only the team that's up can be scored. There's no side button to use on an Apple
/// Watch, so the 8 s button (double-tap presses it too) times each shoot-out.
struct ShootoutView: View {
    @Environment(MatchController.self) private var controller
    let m: MatchRecord
    let now: Moment
    @Binding var path: [Route]

    var body: some View {
        let so = m.shootout
        let teams = m.document.teams
        let voided = m.voidedSeqs
        let last = m.document.events.last { e in
            switch e {
            case .shootoutAttempt: return !voided.contains(e.seq)
            case let .card(c): return c.shootout == true && !voided.contains(e.seq)
            default: return false
            }
        }
        List {
            Text("\(teams.home.name)  \(so.homeScore) – \(so.awayScore)  \(teams.away.name)").font(.footnote)
            Text(dots(so.home) + "\n" + dots(so.away)).font(.footnote)
            if let winner = so.winner {
                Text("\(teams[winner].name) win the shootout").font(.footnote)
                ChoiceButton(label: "End match", color: .endRed) { controller.perform { try $0.endMatch($1) } }
            } else {
                timer
                // Before the first shoot-out either team may go; after it, only the team that's up.
                ForEach(so.next.map { [$0] } ?? [.home, .away], id: \.self) { side in
                    HStack(spacing: 4) {
                        Button("\(side.label) ✓") { controller.perform("attempt") { try $0.shootoutAttempt(team: side, player: nil, scored: true, now: $1) } }
                            .tint(Color(hex: teams[side].color)).foregroundStyle(Color.on(teams[side].color)).buttonStyle(.borderedProminent)
                        Button("\(side.label) ✗") { controller.perform("attempt") { try $0.shootoutAttempt(team: side, player: nil, scored: false, now: $1) } }
                            .buttonStyle(.bordered)
                    }
                    .listRowBackground(Color.clear)
                    // The player due may have been suspended in the shootout.
                    if so.suspended.contains(side) {
                        ChoiceButton(label: "\(side.label) forfeit") {
                            controller.perform("attempt") { try $0.shootoutAttempt(team: side, player: nil, scored: false, now: $1, forfeit: true) }
                        }
                    }
                }
            }
            ChoiceButton(label: "Card") { path.append(.card) }
            if let last {
                ChoiceButton(label: "Undo", secondary: describe(m, last)) { controller.perform { try $0.undo(seq: last.seq, now: $1) } }
            }
        }
        .navigationTitle(so.suddenDeath ? "Sudden death" : "Shootout")
    }

    /// Starts or stops the 8 seconds, counting them down while they run.
    private var timer: some View {
        let left = controller.shootoutTimerStart.map { MatchController.shootoutMs - (now.elapsedMs - $0) }
        return Button { controller.toggleShootoutTimer() } label: {
            Text(left.map { "\((max(0, $0) + 999) / 1000)" } ?? "8 s")
                .font(left == nil ? .headline : .system(size: 40, weight: .bold).monospacedDigit())
                .frame(maxWidth: .infinity)
        }
        .tint(.brand)
        .buttonStyle(.borderedProminent)
        .primaryHandGesture()
    }

    private func dots(_ results: [Bool]) -> String {
        results.isEmpty ? "–" : results.map { $0 ? "●" : "○" }.joined(separator: " ")
    }
}
