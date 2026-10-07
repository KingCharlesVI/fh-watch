package com.fhmatchcentre.watch.data

import android.content.Context
import com.fhmatchcentre.watch.engine.CardDurations
import com.fhmatchcentre.watch.engine.Engine
import com.fhmatchcentre.watch.engine.MatchSettings
import com.fhmatchcentre.watch.engine.SHIRT_NUMBERS
import kotlinx.serialization.Serializable

/** What the setup screen starts from: the last match's choices. */
@Serializable
data class Setup(
    val periods: Int = 4,
    val periodMinutes: Int = 15,
    /** Breaks between periods; with 4 periods the middle one is half-time. */
    val breakMinutes: Int = 2,
    val halfTimeMinutes: Int = 5,
    val cards: CardDurations = Engine.DEFAULT_CARDS,
    val shootoutIfDrawn: Boolean = false,
    val homeName: String = "Home",
    val homeColor: String = "#1D4ED8",
    val homeCaptain: Int? = null,
    val awayName: String = "Away",
    val awayColor: String = "#DC2626",
    val awayCaptain: Int? = null,
    val venue: String? = null,
) {
    fun settings(): MatchSettings = MatchSettings(
        periods = periods,
        periodLengthSec = periodMinutes * 60,
        breakLengthsSec = List(periods - 1) { i ->
            val halfTime = periods % 2 == 0 && periods > 2 && i == periods / 2 - 1
            (if (halfTime) halfTimeMinutes else breakMinutes) * 60
        },
        cardDurationsSec = cards,
        shootoutIfDrawn = shootoutIfDrawn,
    )

    val hasHalfTime get() = periods % 2 == 0 && periods > 2

    /**
     * The same setup with every value in the range the watch's own setup screen allows:
     * for a setup that came from somewhere else (the phone), which could be anything.
     */
    fun sanitized(): Setup {
        val defaults = Setup()
        fun colour(hex: String, fallback: String) = if (HEX.matches(hex)) hex.uppercase() else fallback
        fun name(text: String, fallback: String) = text.trim().take(80).ifEmpty { fallback }
        return copy(
            periods = periods.coerceIn(1, 8),
            periodMinutes = periodMinutes.coerceIn(1, 90),
            breakMinutes = breakMinutes.coerceIn(0, 30),
            halfTimeMinutes = halfTimeMinutes.coerceIn(0, 30),
            homeName = name(homeName, defaults.homeName),
            homeColor = colour(homeColor, defaults.homeColor),
            homeCaptain = homeCaptain?.takeIf { it in SHIRT_NUMBERS },
            awayName = name(awayName, defaults.awayName),
            awayColor = colour(awayColor, defaults.awayColor),
            awayCaptain = awayCaptain?.takeIf { it in SHIRT_NUMBERS },
            venue = venue?.trim()?.take(120)?.ifEmpty { null },
        )
    }

    companion object {
        private val HEX = Regex("^#[0-9A-Fa-f]{6}$")

        /** A setup sent by the phone (Setup on phone), or null if it isn't one. */
        fun fromPhone(json: String): Setup? = runCatching { StorageJson.decodeFromString(serializer(), json).sanitized() }.getOrNull()

        data class Preset(val label: String, val periods: Int, val minutes: Int, val breakMinutes: Int, val halfTimeMinutes: Int)

        val PRESETS = listOf(
            Preset("4 × 15 min", 4, 15, 2, 5),
            Preset("2 × 35 min", 2, 35, 10, 5),
            Preset("2 × 30 min", 2, 30, 5, 5),
            Preset("2 × 25 min", 2, 25, 5, 5),
        )
    }
}

class Prefs(context: Context) {
    private val prefs = context.getSharedPreferences("settings", Context.MODE_PRIVATE)

    var lastSetup: Setup
        get() = prefs.getString("setup", null)?.let { runCatching { StorageJson.decodeFromString(Setup.serializer(), it) }.getOrNull() } ?: Setup()
        set(value) = prefs.edit().putString("setup", StorageJson.encodeToString(Setup.serializer(), value)).apply()

    /**
     * Whether the Timing page has an on-screen Start/Stop button. Off by default: time
     * is started and stopped with the side button. For watches without a usable one.
     */
    var clockButtonOnScreen: Boolean
        get() = prefs.getBoolean("clockButton", false)
        set(value) = prefs.edit().putBoolean("clockButton", value).apply()

    /** Whether the match clock shows time left (the default) or time played. */
    var clockCountsDown: Boolean
        get() = prefs.getBoolean("countDown", true)
        set(value) = prefs.edit().putBoolean("countDown", value).apply()

    /** Whether matches are recorded as a workout (heart rate, steps, distance). Off until the umpire turns it on. */
    var fitnessTracking: Boolean
        get() = prefs.getBoolean("fitness", false)
        set(value) = prefs.edit().putBoolean("fitness", value).apply()
}
