import SwiftUI

/// Match setup, starting from the last match's choices (or a setup from the phone).
struct SetupView: View {
    @Environment(MatchController.self) private var controller
    @Binding var setup: Setup
    @Binding var path: [Route]
    @State private var starting = false

    private var preset: Setup.Preset? {
        Setup.presets.first {
            $0.periods == setup.periods && $0.minutes == setup.periodMinutes && $0.breakMinutes == setup.breakMinutes && $0.halfTimeMinutes == setup.halfTimeMinutes
        }
    }

    var body: some View {
        List {
            ChoiceButton(label: "Format", secondary: preset?.label ?? "Custom") {
                let i = preset.flatMap { p in Setup.presets.firstIndex { $0.label == p.label } } ?? -1
                let p = Setup.presets[(i + 1) % Setup.presets.count]
                setup.periods = p.periods
                setup.periodMinutes = p.minutes
                setup.breakMinutes = p.breakMinutes
                setup.halfTimeMinutes = p.halfTimeMinutes
            }
            ChoiceButton(label: "Periods", secondary: "\(setup.periods)") { path.append(.number(.periods)) }
            ChoiceButton(label: "Period length", secondary: "\(setup.periodMinutes) min") { path.append(.number(.length)) }
            if setup.periods > 1 {
                ChoiceButton(label: setup.hasHalfTime ? "Other breaks" : "Breaks", secondary: "\(setup.breakMinutes) min") { path.append(.number(.breaks)) }
                if setup.hasHalfTime {
                    ChoiceButton(label: "Half-time", secondary: "\(setup.halfTimeMinutes) min") { path.append(.number(.halfTime)) }
                }
            }
            team(.home)
            team(.away)
            TextField("Venue", text: Binding(get: { setup.venue ?? "" }, set: { setup.venue = String($0.prefix(120)) }))
            Toggle("Shootout if drawn", isOn: $setup.shootoutIfDrawn)
            ChoiceButton(label: starting ? "Starting…" : "Ready", color: .brand) { start() }
                .disabled(starting)
        }
        .navigationTitle("New match")
    }

    @ViewBuilder
    private func team(_ side: Side) -> some View {
        let name = Binding(
            get: { side == .home ? setup.homeName : setup.awayName },
            set: { v in if side == .home { setup.homeName = String(v.prefix(80)) } else { setup.awayName = String(v.prefix(80)) } }
        )
        let color = side == .home ? setup.homeColor : setup.awayColor
        let captain = side == .home ? setup.homeCaptain : setup.awayCaptain
        Section(side.label) {
            TextField("\(side.label) team", text: name)
            ChoiceButton(label: "Colour", secondary: colourNames[color] ?? color, color: Color(hex: color)) { path.append(.colour(side)) }
            ChoiceButton(label: "Captain", secondary: captain.map { "#\($0)" } ?? "None") { path.append(.number(.captain(side))) }
        }
    }

    private func start() {
        starting = true
        let chosen = setup.sanitized()
        Task {
            // Asked once, before the first match: the workout session keeps the match
            // running with the wrist down. The match works without it, only with the app open.
            _ = await controller.workout.requestAuthorization()
            controller.prefs.lastSetup = chosen
            do {
                try controller.create(settings: chosen.settings(), teams: chosen.teams(), venue: chosen.venue)
                path = []
            } catch {
                controller.refused = String(describing: error)
            }
            starting = false
        }
    }
}

/// A number in setup, on the keypad.
struct SetupNumber: View {
    let field: NumberField
    @Binding var setup: Setup
    @Binding var path: [Route]

    var body: some View {
        switch field {
        case .periods: pad("Periods", 1...8, setup.periods, false) { setup.periods = $0! }
        case .length: pad("Minutes", 1...90, setup.periodMinutes, false) { setup.periodMinutes = $0! }
        case .breaks: pad("Break", 0...30, setup.breakMinutes, false) { setup.breakMinutes = $0! }
        case .halfTime: pad("Half-time", 0...30, setup.halfTimeMinutes, false) { setup.halfTimeMinutes = $0! }
        case .captain(.home): pad("Captain", shirtNumbers, setup.homeCaptain, true) { setup.homeCaptain = $0 }
        case .captain(.away): pad("Captain", shirtNumbers, setup.awayCaptain, true) { setup.awayCaptain = $0 }
        }
    }

    private func pad(_ title: String, _ range: ClosedRange<Int>, _ initial: Int?, _ optional: Bool, _ set: @escaping (Int?) -> Void) -> some View {
        NumberPad(title: title, range: range, initial: initial, optional: optional) { value in
            set(value)
            path.removeLast()
        }
    }
}
