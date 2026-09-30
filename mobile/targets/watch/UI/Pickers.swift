import SwiftUI
import WatchKit

/// Types a number on a keypad: shirt numbers, and the numbers in match setup.
///
/// `initial` fills it in to start with; the first key typed replaces it. With `optional`,
/// the bottom-left key offers "None" while nothing is typed, e.g. for a goal whose scorer
/// the umpire didn't see. ✓ works once the number is in `range`.
struct NumberPad: View {
    let title: String
    let range: ClosedRange<Int>
    var initial: Int?
    var optional = false
    let onPicked: (Int?) -> Void

    @State private var text = ""
    /// True until the first key: typing then replaces the starting value rather than adding to it.
    @State private var fresh = false
    @State private var started = false

    private var value: Int? { Int(text) }
    private var valid: Bool { value.map(range.contains) ?? false }

    var body: some View {
        GeometryReader { geo in
            let size = min(geo.size.width, geo.size.height) * 0.19
            VStack(spacing: 3) {
                HStack(spacing: 6) {
                    Text(title).font(.footnote).foregroundStyle(Color.muted).lineLimit(1)
                    Text(text.isEmpty ? "–" : text).font(.title3.bold().monospacedDigit()).foregroundStyle(fresh ? Color.muted : .white)
                }
                ForEach(["123", "456", "789"], id: \.self) { row in
                    HStack(spacing: size * 0.3) {
                        ForEach(Array(row), id: \.self) { d in padKey(String(d), size: size) { type(d) } }
                    }
                }
                HStack(spacing: size * 0.3) {
                    if optional && (text.isEmpty || fresh) {
                        padKey("None", size: size, font: .caption2) { onPicked(nil) }
                    } else {
                        padKey("⌫", size: size, enabled: !text.isEmpty) {
                            text = fresh ? "" : String(text.dropLast())
                            fresh = false
                        }
                    }
                    padKey("0", size: size) { type("0") }
                    padKey("✓", size: size, color: .brand, enabled: valid) { onPicked(value) }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .navigationTitle(title)
        .toolbar(.hidden, for: .navigationBar)
        .onAppear {
            guard !started else { return }
            started = true
            text = initial.map(String.init) ?? ""
            fresh = initial != nil
        }
    }

    private func type(_ digit: Character) {
        WKInterfaceDevice.current().play(.click)
        let maxDigits = String(range.upperBound).count
        if fresh {
            text = String(digit)
        } else {
            let joined = String((text + String(digit)).prefix(maxDigits))
            let trimmed = String(joined.drop { $0 == "0" })
            text = trimmed.isEmpty ? "0" : trimmed
        }
        fresh = false
    }

    private func padKey(_ label: String, size: CGFloat, font: Font = .title3, color: Color = .surface, enabled: Bool = true, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label).font(font.weight(.medium)).foregroundStyle(enabled ? .white : Color.muted)
                .frame(width: size, height: size)
                .background(Circle().fill(enabled ? color : color.opacity(0.35)))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityLabel(label == "⌫" ? "Delete" : label == "✓" ? "Done" : label)
    }
}

/// Picks a team colour, laid out 3, 4, 3 to fit the screen.
struct ColourPalette: View {
    let title: String
    let selected: String
    let onPick: (String) -> Void

    var body: some View {
        GeometryReader { geo in
            let swatch = min(geo.size.width, geo.size.height) * 0.19
            VStack(spacing: swatch * 0.18) {
                Text(title).font(.footnote)
                ForEach([0..<3, 3..<7, 7..<10], id: \.lowerBound) { r in
                    HStack(spacing: swatch * 0.25) {
                        ForEach(teamColours[r], id: \.self) { hex in
                            let chosen = hex.caseInsensitiveCompare(selected) == .orderedSame
                            Button { onPick(hex) } label: {
                                Circle().fill(Color(hex: hex)).frame(width: swatch, height: swatch)
                                    .overlay(Circle().stroke(chosen ? Color.white : Color.white.opacity(0.4), lineWidth: chosen ? 3 : 1))
                                    .overlay(chosen ? Text("✓").font(.footnote).foregroundStyle(Color.on(hex)) : nil)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(colourNames[hex] ?? hex)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .toolbar(.hidden, for: .navigationBar)
    }
}
