import SwiftUI
import WatchConnectivity

enum Route: Hashable {
    case setup
    case matches
    case settings
    case summary(String)
    case goal(Side?)
    case card
    case events
    case number(NumberField)
    case colour(Side)
}

/// Numbers picked with the keypad during setup.
enum NumberField: Hashable {
    case periods, length, breaks, halfTime
    case captain(Side)
}

/// Home, or the match while one is on. Everything else is pushed on top.
struct RootView: View {
    @Environment(MatchController.self) private var controller
    @State private var path: [Route] = []
    @State private var setup = Setup()

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if controller.active != nil {
                    MatchView(path: $path)
                } else {
                    HomeView(path: $path, setup: $setup)
                }
            }
            .navigationDestination(for: Route.self) { route in
                switch route {
                case .setup: SetupView(setup: $setup, path: $path)
                case .matches: MatchesView(path: $path)
                case .settings: SettingsView()
                case let .summary(id): SummaryView(id: id, path: $path)
                case let .goal(team): GoalFlow(team: team, path: $path)
                case .card: CardFlow(path: $path)
                case .events: EventsView()
                case let .number(field): SetupNumber(field: field, setup: $setup, path: $path)
                case let .colour(side): ColourPalette(title: "\(side.label) colour", selected: side == .home ? setup.homeColor : setup.awayColor) { hex in
                    if side == .home { setup.homeColor = hex } else { setup.awayColor = hex }
                    path.removeLast()
                }
                }
            }
        }
        .onChange(of: controller.finishedId) { _, id in
            guard let id else { return }
            path = [.summary(id)]
            controller.finishedId = nil
        }
        // A setup sent from the phone opens the setup screen with it, to check and start.
        .onChange(of: controller.phoneSetup) { _, received in
            guard let received, controller.active == nil else { return }
            setup = received
            controller.phoneSetup = nil
            path = [.setup]
        }
        .alert(controller.refused ?? "", isPresented: Binding(get: { controller.refused != nil }, set: { if !$0 { controller.refused = nil } })) {
            Button("OK", role: .cancel) {}
        }
    }
}

struct HomeView: View {
    @Environment(MatchController.self) private var controller
    @Binding var path: [Route]
    @Binding var setup: Setup

    var body: some View {
        List {
            ChoiceButton(label: "New match", color: .brand) {
                setup = controller.prefs.lastSetup
                path.append(.setup)
            }
            ChoiceButton(label: "Past matches") { path.append(.matches) }
            ChoiceButton(label: "Settings") { path.append(.settings) }
        }
        .navigationTitle("FH Match Centre")
    }
}

struct SettingsView: View {
    @Environment(MatchController.self) private var controller
    @State private var countDown = true
    @State private var recordWorkout = false
    @State private var resent: Int?

    var body: some View {
        List {
            Toggle("Clock counts down", isOn: $countDown)
                .onChange(of: countDown) { _, on in controller.prefs.clockCountsDown = on }
            Toggle(isOn: $recordWorkout) {
                VStack(alignment: .leading) {
                    Text("Record workout")
                    Text("Saved in Health, sent to your phone").font(.footnote).foregroundStyle(Color.muted)
                }
            }
            .onChange(of: recordWorkout) { _, on in
                controller.prefs.recordWorkout = on
                if on { Task { _ = await controller.workout.requestAuthorization() } }
            }
            PhoneStatus()
            ChoiceButton(label: "Resend all unsynced", secondary: resent.map { "\($0) sent" }) {
                resent = controller.sync.resendPending()
            }
            Text(versionText).font(.footnote).foregroundStyle(Color.muted)
        }
        .navigationTitle("Settings")
        .onAppear {
            countDown = controller.prefs.clockCountsDown
            recordWorkout = controller.prefs.recordWorkout
        }
    }

    /// "Version 0.4.0 (8)", as the phone's Settings shows it.
    private var versionText: String {
        let info = Bundle.main.infoDictionary
        return "Version \(info?["CFBundleShortVersionString"] as? String ?? "?") (\(info?["CFBundleVersion"] as? String ?? "?"))"
    }
}

/// Whether the phone is in reach: matches go to it when they end.
struct PhoneStatus: View {
    @Environment(MatchController.self) private var controller
    @State private var reachable: Bool?

    var body: some View {
        HStack(spacing: 8) {
            Circle().fill(reachable == nil ? Color.muted : reachable! ? Color.cardGreen : Color.cardRed).frame(width: 9, height: 9)
            Text(reachable == nil ? "Looking for your phone…" : reachable! ? "Phone in reach" : "No phone in reach").font(.footnote)
        }
        // The phone comes and goes as the umpire moves about, so keep checking.
        .task {
            while !Task.isCancelled {
                reachable = controller.sync.phoneReachable
                try? await Task.sleep(for: .seconds(10))
            }
        }
    }
}
