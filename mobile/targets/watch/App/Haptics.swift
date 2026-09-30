import WatchKit

/// Distinct patterns, so the umpire can tell alerts apart without looking. watchOS has a
/// fixed set of haptics rather than custom vibrations, so they're built from those, as
/// close as it allows to the Wear OS app's:
///
/// - clock started or stopped, a suspension over: one buzz
/// - two minutes left in the period: two buzzes
/// - one minute left: three buzzes
/// - end of the period: strong, light, light, strong
/// - end of a break: four quick taps
enum Haptics {
    static func alert(_ alerts: [Alert]) {
        for a in alerts {
            switch a {
            case .twoMinutesLeft: buzzes(2)
            case .oneMinuteLeft: buzzes(3)
            case .timeUp: play([.notification, .directionUp, .directionUp, .notification], gap: 0.45)
            case .suspensionOver: buzzes(1)
            case .breakOver: play([.click, .click, .click, .click], gap: 0.25)
            }
        }
    }

    /// The clock started or stopped, whichever way it was done.
    static func buzz() { buzzes(1) }

    private static func buzzes(_ n: Int) {
        play(Array(repeating: .notification, count: n), gap: 0.6)
    }

    private static func play(_ pattern: [WKHapticType], gap: TimeInterval) {
        for (i, type) in pattern.enumerated() {
            DispatchQueue.main.asyncAfter(deadline: .now() + gap * Double(i)) {
                WKInterfaceDevice.current().play(type)
            }
        }
    }
}
