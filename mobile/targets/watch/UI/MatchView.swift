import SwiftUI

/// The screen during a match: one page per kind of action, swiped left and right, as in
/// the Wear OS app. There's no side button to use on an Apple Watch, so the Timing
/// page has the Start/Stop button, which double-tap also presses.
struct MatchView: View {
    @Environment(MatchController.self) private var controller
    @Environment(\.isLuminanceReduced) private var dimmed
    @Binding var path: [Route]
    @State private var page = 0
    @State private var countDown = true

    var body: some View {
        if let m = controller.active {
            // Several times a second for running clocks; once a second with the wrist down.
            TimelineView(.periodic(from: .now, by: dimmed ? 1 : 0.2)) { _ in
                let now = currentMoment()
                if m.clock.phase == .shootout {
                    ShootoutView(m: m)
                } else {
                    TabView(selection: $page) {
                        TimingPage(m: m, now: now, countDown: countDown).tag(0)
                        GoalsPage(m: m, now: now, path: $path).tag(1)
                        CardsPage(m: m, now: now, path: $path).tag(2)
                        MatchSettingsPage(m: m, now: now, countDown: $countDown, path: $path).tag(3)
                    }
                    .tabViewStyle(.page)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .onAppear { countDown = controller.prefs.clockCountsDown }
        }
    }
}

// MARK: - Timing

/// The clock and score, with the Start/Stop button (double-tap presses it too).
private struct TimingPage: View {
    @Environment(MatchController.self) private var controller
    let m: MatchRecord
    let now: Moment
    let countDown: Bool

    var body: some View {
        let display = clockDisplay(m, now, countDown)
        VStack(spacing: 3) {
            // The match minute (time played in all periods) beside the period, like a referee's second watch.
            let played = m.clock.phase == .playing ? " · \(m.matchTimeMs(now) / 60_000)′" : ""
            Text(display.label + played).font(.footnote).foregroundStyle(Color.muted)
            if !display.clock.isEmpty {
                Text(display.clock).font(.system(size: 46, weight: .bold).monospacedDigit()).foregroundStyle(display.color).minimumScaleFactor(0.6)
            }
            MiniScore(m: m)
            let suspensions = m.suspensions(now)
            if !suspensions.isEmpty && [.playing, .breakTime, .nextPeriod].contains(m.clock.phase) {
                SuspensionChips(suspensions: suspensions)
            }
            controls
        }
        .padding(.horizontal, 6)
    }

    @ViewBuilder
    private var controls: some View {
        switch m.clock.phase {
        case .ready, .nextPeriod:
            let next = periodName(m.clock.phase == .ready ? 1 : m.clock.period, m.settings.periods)
            pill("Start \(next)", .brand)
        case .breakTime:
            pill("Next: \(periodName(m.clock.period + 1, m.settings.periods))", .brand)
        case .playing:
            let timeUp = m.isTimeUp(now)
            let period = periodName(m.clock.period, m.settings.periods)
            pill(timeUp ? "End \(period)" : m.clock.running ? "Stop" : "Restart", m.clock.running && !timeUp ? .stopRed : .brand)
        case .fullTime:
            let s = m.score
            if m.settings.shootoutIfDrawn && s.home == s.away {
                Button("Shootout") { controller.perform { r, _ in try r.startShootout() } }.tint(.brand)
            }
            Button("End match") { controller.perform { try $0.endMatch($1) } }.tint(.endRed)
        default:
            EmptyView()
        }
    }

    private func pill(_ label: String, _ color: Color) -> some View {
        Button { controller.perform { try $0.toggleClock($1) } } label: {
            Text(label).font(.headline).frame(maxWidth: .infinity)
        }
        .tint(color)
        .buttonStyle(.borderedProminent)
        .primaryHandGesture()
    }
}

/// Period label, clock text and colour: amber while stopped, red at time up.
func clockDisplay(_ m: MatchRecord, _ now: Moment, _ countDown: Bool) -> (label: String, clock: String, color: Color) {
    let periods = m.settings.periods
    switch m.clock.phase {
    case .ready:
        return ("Ready", formatClock(countDown ? m.settings.periodLengthMs : 0), .white)
    case .playing:
        let elapsed = m.periodElapsedMs(now)
        let shown = countDown ? m.settings.periodLengthMs - elapsed : elapsed
        let timeUp = m.isTimeUp(now)
        let label = periodName(m.clock.period, periods) + (timeUp ? " · time up" : !m.clock.running ? " · stopped" : "")
        return (label, formatClock(shown), timeUp ? .timeUp : !m.clock.running ? .cardYellow : .white)
    case .breakTime:
        let left = m.breakRemainingMs(now)
        return ("Break after \(periodName(m.clock.period, periods))", left >= 0 ? formatClock(left) : "+" + formatClock(-left), left >= 0 ? .white : .timeUp)
    case .nextPeriod:
        return (periodName(m.clock.period, periods) + " · ready", formatClock(countDown ? m.settings.periodLengthMs : 0), .white)
    case .fullTime: return ("Full time", "", .white)
    case .shootout: return ("Shootout", "", .white)
    case .ended: return ("Ended", "", .white)
    }
}

/// "● 1 – 0 ●" in the teams' colours.
struct MiniScore: View {
    let m: MatchRecord
    var size: CGFloat = 20

    var body: some View {
        let s = m.score
        HStack(spacing: size / 3) {
            TeamDot(hex: m.document.teams.home.color, size: size / 2.2)
            Text("\(s.home) – \(s.away)").font(.system(size: size, weight: .bold).monospacedDigit())
            TeamDot(hex: m.document.teams.away.color, size: size / 2.2)
        }
    }
}

/// Each suspension's time left, in the card's colour, soonest first: "A10 1:47".
private struct SuspensionChips: View {
    let suspensions: [Suspension]

    var body: some View {
        let sorted = suspensions.sorted { $0.remainingMs < $1.remainingMs }
        let rows = stride(from: 0, to: sorted.count, by: 3).map { Array(sorted[$0..<min($0 + 3, sorted.count)]) }
        VStack(spacing: 2) {
            ForEach(rows.indices, id: \.self) { i in
                HStack(spacing: 3) {
                    ForEach(rows[i], id: \.cardSeq) { s in
                        Text("\(s.team == .home ? "H" : "A")\(s.player.map(String.init) ?? "") \(formatClock(s.remainingMs))")
                            .font(.caption2.weight(.semibold).monospacedDigit())
                            .foregroundStyle(.black)
                            .padding(.horizontal, 4)
                            .background(RoundedRectangle(cornerRadius: 5).fill(s.color == .green ? Color.cardGreen : Color.cardYellow))
                    }
                }
            }
        }
    }
}

// MARK: - Goals

private struct GoalsPage: View {
    @Environment(MatchController.self) private var controller
    let m: MatchRecord
    let now: Moment
    @Binding var path: [Route]

    var body: some View {
        let playing = m.clock.phase == .playing
        let teams = m.document.teams
        ScrollView {
            VStack(spacing: 6) {
                Text("Goals").font(.footnote).foregroundStyle(Color.muted)
                MiniScore(m: m, size: 30)
                HStack {
                    Text(teams.home.name).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
                    Text(teams.away.name).lineLimit(1).frame(maxWidth: .infinity, alignment: .trailing)
                }
                .font(.footnote)
                if !playing { Hint("Goals can be recorded while a period is on.") }
                UndoButton(now: now)
                HStack(spacing: 4) {
                    plusOne(teams.home, .home, enabled: playing)
                    plusOne(teams.away, .away, enabled: playing)
                }
            }
        }
    }

    private func plusOne(_ team: Team, _ side: Side, enabled: Bool) -> some View {
        Button { path.append(.goal(side)) } label: {
            Text("+1").font(.title2.weight(.semibold)).frame(maxWidth: .infinity).foregroundStyle(Color.on(team.color))
        }
        .tint(Color(hex: team.color))
        .buttonStyle(.borderedProminent)
        .disabled(!enabled)
    }
}

// MARK: - Cards

private struct CardsPage: View {
    @Environment(MatchController.self) private var controller
    let m: MatchRecord
    let now: Moment
    @Binding var path: [Route]

    var body: some View {
        let playing = m.clock.phase == .playing
        let suspensions = m.suspensions(now).sorted { $0.remainingMs < $1.remainingMs }
        let suspended = Set(suspensions.map(\.cardSeq))
        let cards = m.activeEvents.compactMap { if case let .card(c) = $0 { return c } else { return nil } }
        // Everything else: red cards, and suspensions that are over.
        let earlier = cards.filter { !suspended.contains($0.seq) }.reversed()
        let reasons = Dictionary(uniqueKeysWithValues: cards.map { ($0.seq, $0.reason.flatMap { cardReasonLabels[$0] }) })
        let teams = m.document.teams
        List {
            VStack(spacing: 4) {
                Text("Cards").font(.footnote).foregroundStyle(Color.muted)
                Button { path.append(.card) } label: { Text("+").font(.title) }
                    .buttonStyle(.borderedProminent).tint(.brand).clipShape(Circle()).frame(width: 52, height: 52)
                    .disabled(!playing)
            }
            .frame(maxWidth: .infinity)
            .listRowBackground(Color.clear)
            if !playing && m.clock.phase != .breakTime { Hint("Cards can be given while a period is on.") }
            UndoButton(now: now)
            if suspensions.isEmpty { Hint("No one is suspended.") }
            ForEach(suspensions, id: \.cardSeq) { s in
                let paused = !(playing && m.clock.running)
                CardRow(
                    color: s.color == .green ? .cardGreen : .cardYellow,
                    title: teams[s.team].name + (s.player.map { " #\($0)" } ?? ""),
                    detail: formatClock(s.remainingMs) + (paused ? " · paused" : " left"),
                    reason: reasons[s.cardSeq] ?? nil
                )
            }
            if !earlier.isEmpty {
                Text("Earlier").font(.footnote).foregroundStyle(Color.muted).listRowBackground(Color.clear)
                ForEach(Array(earlier), id: \.seq) { c in
                    CardRow(
                        color: Color.card(c.color),
                        title: teams[c.team].name + (c.player.map { " #\($0)" } ?? ""),
                        detail: "\(periodName(c.period, m.settings.periods)) \(formatClock(c.clockMs))" + (c.color == .red ? " · sent off" : " · served"),
                        reason: c.reason.flatMap { cardReasonLabels[$0] },
                        dim: c.color != .red
                    )
                }
            }
        }
    }
}

private struct CardRow: View {
    let color: Color
    let title: String
    let detail: String
    var reason: String?
    var dim = false

    var body: some View {
        HStack(spacing: 8) {
            // A card shape: taller than wide.
            RoundedRectangle(cornerRadius: 2).fill(dim ? color.opacity(0.5) : color).frame(width: 11, height: 15)
            VStack(alignment: .leading, spacing: 0) {
                Text(title).font(.footnote).lineLimit(1).foregroundStyle(dim ? Color.muted : .white)
                Text(detail).font(.caption2.monospacedDigit()).foregroundStyle(Color.muted)
                if let reason { Text(reason).font(.caption2).foregroundStyle(Color.muted).lineLimit(1) }
            }
        }
    }
}

// MARK: - Settings

private struct MatchSettingsPage: View {
    @Environment(MatchController.self) private var controller
    let m: MatchRecord
    let now: Moment
    @Binding var countDown: Bool
    @Binding var path: [Route]
    @State private var confirm: Confirm?
    @State private var sent: Int?

    struct Confirm: Identifiable {
        let title: String
        let action: () -> Void
        var id: String { title }
    }

    var body: some View {
        let s = m.settings
        let period = periodName(m.clock.period, s.periods)
        let pending = controller.store.pending().count
        List {
            Text("Settings").font(.footnote).foregroundStyle(Color.muted).frame(maxWidth: .infinity).listRowBackground(Color.clear)
            Hint("\(s.periods) × \(s.periodLengthSec / 60) min · \(m.document.teams.home.name) v \(m.document.teams.away.name)")
            Toggle("Clock counts down", isOn: $countDown)
                .onChange(of: countDown) { _, on in controller.prefs.clockCountsDown = on }
            ChoiceButton(label: "Events", secondary: "Everything so far; cancel mistakes") { path.append(.events) }
            PhoneStatus()
            if pending > 0 {
                ChoiceButton(label: "Send \(pending) to phone", secondary: sent.map { "\($0) sent" } ?? "Earlier matches not sent yet") {
                    sent = controller.sync.resendPending()
                }
            }
            switch m.clock.phase {
            case .ready:
                ChoiceButton(label: "Cancel match") { confirm = Confirm(title: "Cancel this match? Nothing is kept.") { controller.discard() } }
            case .playing where !m.isTimeUp(now):
                ChoiceButton(label: "End \(period) early") { confirm = Confirm(title: "End \(period) now?") { controller.perform { try $0.endPeriod($1) } } }
            default:
                EmptyView()
            }
            if [.playing, .breakTime, .nextPeriod].contains(m.clock.phase) {
                ChoiceButton(label: "End match", color: .endRed) { confirm = Confirm(title: "End the match now?") { controller.perform { try $0.endMatch($1) } } }
            }
        }
        // Ending a period early, the match, or cancelling it can't be undone, so they ask first.
        .alert(confirm?.title ?? "", isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } })) {
            Button("Yes", role: .destructive) { confirm?.action(); confirm = nil }
            Button("No", role: .cancel) { confirm = nil }
        }
    }
}

// MARK: - Shared

struct Hint: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text).font(.footnote).foregroundStyle(Color.muted).multilineTextAlignment(.center)
            .frame(maxWidth: .infinity).listRowBackground(Color.clear)
    }
}

/// For a few seconds after a goal or card, a way to take it back.
struct UndoButton: View {
    @Environment(MatchController.self) private var controller
    let now: Moment

    var body: some View {
        if let offer = controller.undoOffer, now.elapsedMs < offer.untilElapsedMs {
            Button { controller.undo(offer) } label: {
                VStack(alignment: .leading) {
                    Text("Undo \(offer.label)")
                    Text("\((offer.untilElapsedMs - now.elapsedMs + 999) / 1000) s").font(.footnote).foregroundStyle(Color.muted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.bordered)
        }
    }
}
