import SwiftUI

struct MatchesView: View {
    @Environment(MatchController.self) private var controller
    @Binding var path: [Route]

    var body: some View {
        // Reloads when a match finishes, syncs or is deleted.
        let rows = controller.storeVersion >= 0 ? controller.store.finished() : []
        List {
            if rows.isEmpty { Text("None yet") }
            ForEach(rows) { row in
                ChoiceButton(label: "\(row.title) \(row.scoreText)", secondary: "\(date(row)) · \(row.sync == .synced ? "On phone" : "Not synced")") {
                    path.append(.summary(row.id))
                }
            }
        }
        .navigationTitle("Past matches")
    }

    private func date(_ row: StoredMatch) -> String {
        Date(timeIntervalSince1970: Double(row.createdAt) / 1000).formatted(date: .numeric, time: .omitted)
    }
}

/// A finished match: the result, and whether the phone has it yet.
struct SummaryView: View {
    @Environment(MatchController.self) private var controller
    let id: String
    @Binding var path: [Route]
    @State private var confirmDelete = false

    var body: some View {
        let row = controller.storeVersion >= 0 ? controller.store.get(id) : nil
        if let row {
            let m = row.record
            let t = m.document.teams
            let s = m.score
            let so = m.shootout
            let cards = m.activeEvents.compactMap { if case let .card(c) = $0 { return c.color } else { return nil } }
            List {
                Text("\(t.home.name) \(s.home) – \(s.away) \(t.away.name)")
                if !so.home.isEmpty { Text("Shootout \(so.homeScore) – \(so.awayScore)").font(.footnote) }
                Text("Cards: " + [CardColor.green, .yellow, .red].map { c in "\(cards.filter { $0 == c }.count) \(c.rawValue)" }.joined(separator: ", "))
                    .font(.footnote)
                if let f = row.fitness, let hr = f.heartRate {
                    Text("Workout: avg \(hr.avg) bpm" + (f.distanceM.map { String(format: " · %.1f km", $0 / 1000) } ?? "")).font(.footnote)
                }
                Text(row.sync == .synced ? "✓ On your phone" : "Waiting for your phone. It sends by itself when the phone is in reach.")
                    .font(.footnote)
                if row.sync != .synced {
                    ChoiceButton(label: "Send to phone") { controller.resend(id) }
                }
                ChoiceButton(label: "Done", color: .brand) { path.removeAll() }
                ChoiceButton(label: "Delete from watch") { confirmDelete = true }
            }
            .navigationTitle("Full time")
            .alert("Delete this match?", isPresented: $confirmDelete) {
                Button("Delete", role: .destructive) {
                    controller.delete(id)
                    path.removeAll()
                }
                Button("Keep", role: .cancel) {}
            } message: {
                Text(row.sync == .synced ? "It stays on your phone." : "It hasn't reached your phone, so it will be gone for good.")
            }
        }
    }
}
