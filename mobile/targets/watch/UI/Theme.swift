import SwiftUI

extension Color {
    static let brand = Color(hex: "#106C3E")
    static let stopRed = Color(hex: "#8A2B20")
    /// For ending the match: it can't be undone.
    static let endRed = Color(hex: "#8A2B20")
    static let muted = Color(hex: "#B0B8B3")
    static let surface = Color(hex: "#262626")
    static let timeUp = Color(hex: "#FF6B5B")
    static let cardGreen = Color(hex: "#2E9E44")
    static let cardYellow = Color(hex: "#F2C230")
    static let cardRed = Color(hex: "#D93A2B")

    init(hex: String) {
        let v = UInt64(hex.dropFirst(), radix: 16) ?? 0
        self.init(red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255)
    }

    /// Black or white text, whichever reads better on a team colour.
    static func on(_ hex: String) -> Color {
        let v = UInt64(hex.dropFirst(), radix: 16) ?? 0
        let luminance = (0.299 * Double((v >> 16) & 0xff) + 0.587 * Double((v >> 8) & 0xff) + 0.114 * Double(v & 0xff)) / 255
        return luminance > 0.6 ? .black : .white
    }

    static func card(_ color: CardColor) -> Color {
        switch color {
        case .green: .cardGreen
        case .yellow: .cardYellow
        case .red: .cardRed
        }
    }
}

/// Team colours: the same palette as the Wear OS app and the phone's team editor.
let teamColours = ["#DC2626", "#1D4ED8", "#FACC15", "#16A34A", "#EA580C", "#7C3AED", "#38BDF8", "#EC4899", "#111111", "#FFFFFF"]

let colourNames = [
    "#DC2626": "Red", "#1D4ED8": "Blue", "#FACC15": "Yellow", "#16A34A": "Green", "#EA580C": "Orange",
    "#7C3AED": "Purple", "#38BDF8": "Sky blue", "#EC4899": "Pink", "#111111": "Black", "#FFFFFF": "White",
]

/// What each card reason is called: the same as CARD_REASONS in packages/shared/src/describe.ts.
let cardReasonLabels: [CardReason: String] = [
    .danger: "Danger",
    .breakdown: "Breakdown of play",
    .physical: "Physical misconduct",
    .dissent: "Dissent",
    .other: "Other",
]

/// "Q2" with quarters, "H1" with halves, otherwise "P3".
func periodName(_ period: Int, _ periods: Int) -> String {
    switch periods {
    case 4: "Q\(period)"
    case 2: "H\(period)"
    default: "P\(period)"
    }
}

func formatClock(_ ms: Int64) -> String {
    let totalSec = (max(ms, 0) + 999) / 1000
    return String(format: "%d:%02d", totalSec / 60, totalSec % 60)
}

extension Side {
    var label: String { self == .home ? "Home" : "Away" }
}

/// A team's colour dot, with a thin ring so a black team shows on the black screen.
struct TeamDot: View {
    let hex: String
    var size: CGFloat = 9

    var body: some View {
        Circle().fill(Color(hex: hex)).frame(width: size, height: size)
            .overlay(Circle().stroke(Color.white.opacity(0.4), lineWidth: 1))
    }
}

/// A full-width button in a team's colours.
struct TeamButton: View {
    let team: Team
    var secondary: String?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 1) {
                Text(team.name).lineLimit(1)
                if let secondary { Text(secondary).font(.footnote).opacity(0.8) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .foregroundStyle(Color.on(team.color))
        }
        .tint(Color(hex: team.color))
        .buttonStyle(.borderedProminent)
    }
}

/// A list button with an optional second line, optionally in a colour.
struct ChoiceButton: View {
    let label: String
    var secondary: String?
    var color: Color?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 1) {
                Text(label)
                if let secondary { Text(secondary).font(.footnote).foregroundStyle(color == nil ? Color.muted : Color.white.opacity(0.85)) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .tint(color)
        .buttonStyle(.borderedProminent)
        .modifier(PlainWhenNoColor(plain: color == nil))
    }
}

private struct PlainWhenNoColor: ViewModifier {
    let plain: Bool
    func body(content: Content) -> some View {
        if plain { content.tint(Color.surface) } else { content }
    }
}

extension View {
    /// Double-tap (Series 9 and later, Ultra 2) presses this button: watchOS 11 and later.
    @ViewBuilder
    func primaryHandGesture() -> some View {
        if #available(watchOS 11.0, *) {
            handGestureShortcut(.primaryAction)
        } else {
            self
        }
    }
}
