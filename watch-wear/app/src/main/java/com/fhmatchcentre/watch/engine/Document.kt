package com.fhmatchcentre.watch.engine

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * The match document the watch sends to the phone: the same contract as
 * packages/shared/src/schema.ts (and schema/match.schema.json, which the
 * unit tests validate against). Optional fields are left out when unset,
 * because the schema rejects unknown fields and nulls where it expects absence.
 */

const val SCHEMA_VERSION = 1

/** Encodes documents exactly as the schema wants them; decodes strictly. */
val DocumentJson = Json {
    classDiscriminator = "type"
    encodeDefaults = false
    explicitNulls = true
}

@Serializable
enum class Side {
    @SerialName("home") HOME,
    @SerialName("away") AWAY;

    val other: Side get() = if (this == HOME) AWAY else HOME
}

@Serializable
enum class CardColor {
    @SerialName("green") GREEN,
    @SerialName("yellow") YELLOW,
    @SerialName("red") RED,
}

/** Why a card was given; the same codes as CardReason in packages/shared/src/schema.ts. */
@Serializable
enum class CardReason {
    @SerialName("danger") DANGER,
    @SerialName("breakdown") BREAKDOWN,
    @SerialName("physical") PHYSICAL,
    @SerialName("dissent") DISSENT,
    @SerialName("other") OTHER,
}

@Serializable
enum class GoalMethod {
    @SerialName("field") FIELD,
    @SerialName("pc") PC,
    @SerialName("ps") PS,
}

@Serializable
enum class StopReason {
    @SerialName("injury") INJURY,
    @SerialName("video") VIDEO,
    @SerialName("other") OTHER,
}

@Serializable
data class CardDurations(val green: Int, val yellowShort: Int, val yellowLong: Int)

@Serializable
data class MatchSettings(
    val periods: Int,
    val periodLengthSec: Int,
    /** After each period except the last. */
    val breakLengthsSec: List<Int>,
    val cardDurationsSec: CardDurations,
    val shootoutIfDrawn: Boolean,
) {
    val periodLengthMs: Long get() = periodLengthSec * 1000L
}

@Serializable
data class Team(
    val name: String,
    /** Always present: null until the umpire links the team on the phone. */
    val teamId: String?,
    val color: String,
    val captain: Int? = null,
)

/** The shirt numbers a player can have, as in the match format (0 to 999). */
val SHIRT_NUMBERS = 0..999

@Serializable
data class Teams(val home: Team, val away: Team) {
    operator fun get(side: Side): Team = if (side == Side.HOME) home else away
}

@Serializable
data class MatchDocument(
    val schemaVersion: Int,
    val id: String,
    val createdOn: String,
    val settings: MatchSettings,
    val teams: Teams,
    val venue: String? = null,
    val competition: String? = null,
    val startedAt: String,
    val endedAt: String? = null,
    val events: List<MatchEvent>,
)

@Serializable
sealed class MatchEvent {
    abstract val seq: Int
    abstract val wallTime: String?
}

/** An event at a point on the match clock. */
sealed interface Timed {
    val period: Int
    val clockMs: Long
}

/** An event that belongs to one team. */
sealed interface ForTeam {
    val team: Side
}

@Serializable
@SerialName("period_start")
data class PeriodStart(
    override val seq: Int,
    override val wallTime: String? = null,
    override val period: Int,
    override val clockMs: Long,
) : MatchEvent(), Timed

@Serializable
@SerialName("period_end")
data class PeriodEnd(
    override val seq: Int,
    override val wallTime: String? = null,
    override val period: Int,
    override val clockMs: Long,
) : MatchEvent(), Timed

@Serializable
@SerialName("clock_stop")
data class ClockStop(
    override val seq: Int,
    override val wallTime: String? = null,
    override val period: Int,
    override val clockMs: Long,
    val reason: StopReason? = null,
) : MatchEvent(), Timed

@Serializable
@SerialName("clock_resume")
data class ClockResume(
    override val seq: Int,
    override val wallTime: String? = null,
    override val period: Int,
    override val clockMs: Long,
) : MatchEvent(), Timed

@Serializable
@SerialName("goal")
data class Goal(
    override val seq: Int,
    override val wallTime: String? = null,
    override val period: Int,
    override val clockMs: Long,
    override val team: Side,
    val player: Int? = null,
    val method: GoalMethod? = null,
) : MatchEvent(), Timed, ForTeam

@Serializable
@SerialName("card")
data class Card(
    override val seq: Int,
    override val wallTime: String? = null,
    override val period: Int,
    override val clockMs: Long,
    override val team: Side,
    val player: Int? = null,
    val color: CardColor,
    val reason: CardReason? = null,
    /** Suspension length; absent for red and in the shootout. */
    val durationSec: Int? = null,
    /** Given during the shootout: the player takes no further part. Left out (null) otherwise. */
    val shootout: Boolean? = null,
) : MatchEvent(), Timed, ForTeam

@Serializable
@SerialName("card_end")
data class CardEnd(
    override val seq: Int,
    override val wallTime: String? = null,
    override val period: Int,
    override val clockMs: Long,
    val refSeq: Int,
) : MatchEvent(), Timed

@Serializable
@SerialName("penalty_corner")
data class PenaltyCorner(
    override val seq: Int,
    override val wallTime: String? = null,
    override val period: Int,
    override val clockMs: Long,
    override val team: Side,
) : MatchEvent(), Timed, ForTeam

@Serializable
@SerialName("penalty_stroke")
data class PenaltyStroke(
    override val seq: Int,
    override val wallTime: String? = null,
    override val period: Int,
    override val clockMs: Long,
    override val team: Side,
    val scored: Boolean,
) : MatchEvent(), Timed, ForTeam

@Serializable
@SerialName("shootout_attempt")
data class ShootoutAttempt(
    override val seq: Int,
    override val wallTime: String? = null,
    override val team: Side,
    val round: Int,
    val player: Int? = null,
    val scored: Boolean,
    /** Not taken: the player due was suspended in the shootout. Left out (null) otherwise. */
    val forfeit: Boolean? = null,
) : MatchEvent(), ForTeam

@Serializable
@SerialName("void")
data class VoidEvent(
    override val seq: Int,
    override val wallTime: String? = null,
    val refSeq: Int,
    val period: Int? = null,
    val clockMs: Long? = null,
) : MatchEvent()

@Serializable
@SerialName("note")
data class Note(
    override val seq: Int,
    override val wallTime: String? = null,
    val text: String,
    val period: Int? = null,
    val clockMs: Long? = null,
) : MatchEvent()
