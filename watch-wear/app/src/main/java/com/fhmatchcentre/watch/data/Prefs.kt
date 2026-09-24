package com.fhmatchcentre.watch.data

import android.content.Context
import com.fhmatchcentre.watch.engine.CardDurations
import com.fhmatchcentre.watch.engine.Engine
import com.fhmatchcentre.watch.engine.MatchSettings
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
    val homeColor: String = "#1E40AF",
    val homeCaptain: Int? = null,
    val awayName: String = "Away",
    val awayColor: String = "#B91C1C",
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

    companion object {
        data class Preset(val label: String, val periods: Int, val minutes: Int, val breakMinutes: Int, val halfTimeMinutes: Int)

        val PRESETS = listOf(
            Preset("4 × 15 min", 4, 15, 2, 5),
            Preset("2 × 35 min", 2, 35, 5, 5),
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

    /** Whether the match clock shows time left (the default) or time played. */
    var clockCountsDown: Boolean
        get() = prefs.getBoolean("countDown", true)
        set(value) = prefs.edit().putBoolean("countDown", value).apply()
}
