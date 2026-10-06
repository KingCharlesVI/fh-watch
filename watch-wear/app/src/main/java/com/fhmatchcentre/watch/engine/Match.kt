package com.fhmatchcentre.watch.engine

import kotlinx.serialization.Serializable
import java.security.SecureRandom
import java.time.Instant
import kotlin.math.max
import kotlin.math.min

/**
 * The match engine: pure functions from a [MatchRecord] and a [Moment] to a new
 * record. No Android here, so all of it runs in plain JVM unit tests.
 *
 * The document's event log is the record of what happened; [ClockState] is
 * what the watch needs to keep the clock running between events.
 */

/**
 * A point in time from two clocks. `elapsedMs` is the monotonic clock (Android's
 * elapsedRealtime), which wall-clock changes can't disturb; it restarts from zero
 * on reboot, which a changed `bootCount` reveals, and then the wall clock is used.
 */
@Serializable
data class Moment(val elapsedMs: Long, val wallMs: Long, val bootCount: Int) {
    /** Milliseconds from this moment to a later one. */
    fun until(later: Moment): Long =
        if (later.bootCount == bootCount && later.elapsedMs >= elapsedMs) later.elapsedMs - elapsedMs
        else max(0, later.wallMs - wallMs)

    val iso: String get() = Instant.ofEpochMilli(wallMs).toString()
}

@Serializable
enum class Phase {
    /** Set up, waiting for the first period to start. */
    READY,

    /** In a period; the clock may be running or stopped. */
    PLAYING,

    /** Between periods. */
    BREAK,

    /** The break is over: the next period is up on screen, waiting to be started. */
    NEXT_PERIOD,

    /** The last period has ended; a shootout may follow if the score is level. */
    FULL_TIME,
    SHOOTOUT,

    /** The final whistle has been recorded. */
    ENDED,
}

@Serializable
data class ClockState(
    val phase: Phase = Phase.READY,
    val period: Int = 1,
    val running: Boolean = false,
    /** Time in this period before the current running stretch began. */
    val bankedMs: Long = 0,
    /** When the current running stretch began. */
    val runningSince: Moment? = null,
    /** How long each finished period actually ran. */
    val completedPeriodsMs: List<Long> = emptyList(),
    val breakStartedAt: Moment? = null,
)

@Serializable
data class MatchRecord(
    val document: MatchDocument,
    val clock: ClockState = ClockState(),
    /** Alerts already given, so each vibrates once. */
    val fired: Set<String> = emptySet(),
) {
    val id: String get() = document.id
    val settings: MatchSettings get() = document.settings
}

/** Something the umpire should feel on their wrist. */
sealed interface Alert {
    data class TwoMinutesLeft(val period: Int) : Alert
    data class OneMinuteLeft(val period: Int) : Alert
    data class TimeUp(val period: Int) : Alert
    data class SuspensionOver(val cardSeq: Int, val team: Side, val player: Int?) : Alert
    data class BreakOver(val afterPeriod: Int) : Alert
}

class MatchRuleException(message: String) : IllegalStateException(message)

private fun rule(ok: Boolean, message: () -> String) {
    if (!ok) throw MatchRuleException(message())
}

object Engine {
    private val random = SecureRandom()

    val DEFAULT_CARDS = CardDurations(green = 120, yellowShort = 300, yellowLong = 600)

    fun newMatch(settings: MatchSettings, teams: Teams, venue: String?, now: Moment, id: String = uuidV7(now.wallMs)): MatchRecord {
        rule(settings.breakLengthsSec.size == settings.periods - 1) { "Need ${settings.periods - 1} break lengths." }
        return MatchRecord(
            document = MatchDocument(
                schemaVersion = SCHEMA_VERSION,
                id = id,
                createdOn = "wear",
                settings = settings,
                teams = teams,
                venue = venue?.trim()?.ifEmpty { null },
                // Replaced when the first period starts.
                startedAt = now.iso,
                events = emptyList(),
            ),
        )
    }

    /** A time-ordered UUID (RFC 9562 version 7), so matches sort by when they were created. */
    fun uuidV7(nowMs: Long): String {
        val b = ByteArray(16).also(random::nextBytes)
        for (i in 0..5) b[i] = (nowMs ushr (40 - 8 * i)).toByte()
        b[6] = ((b[6].toInt() and 0x0f) or 0x70).toByte()
        b[8] = ((b[8].toInt() and 0x3f) or 0x80).toByte()
        val hex = b.joinToString("") { "%02x".format(it) }
        return "${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}"
    }
}

// ------------------------------------------------------------------ clock

/** Time played in the current period, stopping at the period's length. */
fun MatchRecord.periodElapsedMs(now: Moment): Long {
    val c = clock
    val live = if (c.running && c.runningSince != null) c.runningSince.until(now) else 0
    return min(settings.periodLengthMs, c.bankedMs + live)
}

fun MatchRecord.isTimeUp(now: Moment): Boolean =
    clock.phase == Phase.PLAYING && periodElapsedMs(now) >= settings.periodLengthMs

/** Match-clock time since kickoff, excluding stoppages and breaks. Suspensions run on this. */
fun MatchRecord.matchTimeMs(now: Moment): Long =
    clock.completedPeriodsMs.sum() + if (clock.phase == Phase.PLAYING) periodElapsedMs(now) else 0

private fun MatchRecord.nextSeq(): Int = (document.events.maxOfOrNull { it.seq } ?: 0) + 1

private fun MatchRecord.append(vararg make: (seq: Int) -> MatchEvent): MatchRecord {
    var seq = nextSeq()
    val added = make.map { it(seq++) }
    return copy(document = document.copy(events = document.events + added))
}

// ------------------------------------------------------------------ operations

/** The physical button: start, stop or resume the clock, or end a period whose time is up. */
fun MatchRecord.toggleClock(now: Moment): MatchRecord = when (clock.phase) {
    Phase.READY, Phase.NEXT_PERIOD -> startPeriod(now)
    // A break leads to the next period, which then waits for the whistle.
    Phase.BREAK -> nextPeriod()
    Phase.PLAYING -> when {
        isTimeUp(now) -> endPeriod(now)
        clock.running -> stopClock(now)
        else -> resumeClock(now)
    }
    else -> this
}

/**
 * Leaves the break with the next period up but its clock at zero and stopped, so the
 * umpire starts it when play restarts. Nothing is logged: the period begins when it starts.
 */
fun MatchRecord.nextPeriod(): MatchRecord {
    rule(clock.phase == Phase.BREAK) { "There's no break to leave." }
    return copy(clock = clock.copy(phase = Phase.NEXT_PERIOD, period = clock.period + 1, bankedMs = 0, breakStartedAt = null))
}

/** Starts a period: the first one, the one the break led to, or the next one straight from a break. */
fun MatchRecord.startPeriod(now: Moment): MatchRecord {
    rule(clock.phase == Phase.READY || clock.phase == Phase.BREAK || clock.phase == Phase.NEXT_PERIOD) { "A period is already under way." }
    val period = when (clock.phase) {
        Phase.READY -> 1
        Phase.BREAK -> clock.period + 1
        else -> clock.period
    }
    val started = if (period == 1) copy(document = document.copy(startedAt = now.iso)) else this
    return started
        .append({ PeriodStart(it, now.iso, period, 0) })
        .copy(clock = clock.copy(phase = Phase.PLAYING, period = period, running = true, bankedMs = 0, runningSince = now, breakStartedAt = null))
}

fun MatchRecord.stopClock(now: Moment, reason: StopReason? = null): MatchRecord {
    rule(clock.phase == Phase.PLAYING && clock.running) { "The clock isn't running." }
    val at = periodElapsedMs(now)
    return append({ ClockStop(it, now.iso, clock.period, at, reason) })
        .copy(clock = clock.copy(running = false, bankedMs = at, runningSince = null))
}

fun MatchRecord.resumeClock(now: Moment): MatchRecord {
    rule(clock.phase == Phase.PLAYING && !clock.running) { "The clock is already running." }
    rule(!isTimeUp(now)) { "Time is up in this period." }
    return append({ ClockResume(it, now.iso, clock.period, clock.bankedMs) })
        .copy(clock = clock.copy(running = true, runningSince = now))
}

fun MatchRecord.endPeriod(now: Moment): MatchRecord {
    rule(clock.phase == Phase.PLAYING) { "No period is under way." }
    val ended = tick(now).record // any suspension that ran out goes in the log first
    val at = ended.periodElapsedMs(now)
    val last = ended.clock.period >= settings.periods
    return ended.append({ PeriodEnd(it, now.iso, ended.clock.period, at) }).copy(
        clock = ended.clock.copy(
            phase = if (last) Phase.FULL_TIME else Phase.BREAK,
            running = false,
            bankedMs = at,
            runningSince = null,
            completedPeriodsMs = ended.clock.completedPeriodsMs + at,
            breakStartedAt = if (last) null else now,
        ),
    )
}

private fun MatchRecord.requirePlaying() = rule(clock.phase == Phase.PLAYING) { "Start the period first." }

fun MatchRecord.goal(team: Side, player: Int?, method: GoalMethod?, now: Moment): MatchRecord {
    requirePlaying()
    val at = periodElapsedMs(now)
    val p = clock.period
    // A goal from a stroke also records the stroke, so the two always agree.
    return if (method == GoalMethod.PS) {
        append({ PenaltyStroke(it, now.iso, p, at, team, scored = true) }, { Goal(it, now.iso, p, at, team, player, method) })
    } else {
        append({ Goal(it, now.iso, p, at, team, player, method) })
    }
}

fun MatchRecord.missedStroke(team: Side, now: Moment): MatchRecord {
    requirePlaying()
    return append({ PenaltyStroke(it, now.iso, clock.period, periodElapsedMs(now), team, scored = false) })
}

enum class CardKind(val color: CardColor) { GREEN(CardColor.GREEN), YELLOW_SHORT(CardColor.YELLOW), YELLOW_LONG(CardColor.YELLOW), RED(CardColor.RED) }

fun MatchSettings.durationSec(kind: CardKind): Int? = when (kind) {
    CardKind.GREEN -> cardDurationsSec.green
    CardKind.YELLOW_SHORT -> cardDurationsSec.yellowShort
    CardKind.YELLOW_LONG -> cardDurationsSec.yellowLong
    CardKind.RED -> null
}

fun MatchRecord.card(team: Side, player: Int?, kind: CardKind, now: Moment, reason: CardReason? = null): MatchRecord {
    requirePlaying()
    return append({ Card(it, now.iso, clock.period, periodElapsedMs(now), team, player, kind.color, reason, settings.durationSec(kind)) })
}

fun MatchRecord.penaltyCorner(team: Side, now: Moment): MatchRecord {
    requirePlaying()
    return append({ PenaltyCorner(it, now.iso, clock.period, periodElapsedMs(now), team) })
}

/** Events the umpire may cancel: what they recorded, not the clock's own entries. */
fun MatchEvent.isUndoable(): Boolean = this is Goal || this is Card || this is PenaltyCorner || this is PenaltyStroke || this is ShootoutAttempt

/** Cancels an event, keeping it in the log. A stroke and its goal are cancelled together. */
fun MatchRecord.undo(seq: Int, now: Moment): MatchRecord {
    val events = document.events
    val target = events.firstOrNull { it.seq == seq }
    rule(target != null && target.isUndoable()) { "There's nothing to undo there." }
    val voided = voidedSeqs()
    rule(seq !in voided) { "That's already cancelled." }
    val pair = strokePartner(target!!)?.takeIf { it.seq !in voided }
    val timed = clock.phase == Phase.PLAYING
    val period = if (timed) clock.period else null
    val at = if (timed) periodElapsedMs(now) else null
    return append(*listOfNotNull(target, pair).map { e -> { s: Int -> VoidEvent(s, now.iso, e.seq, period, at) } }.toTypedArray())
}

/** The stroke recorded with a stroke goal, or the goal recorded with a scored stroke. */
private fun MatchRecord.strokePartner(event: MatchEvent): MatchEvent? {
    val events = document.events
    return when {
        event is Goal && event.method == GoalMethod.PS ->
            events.firstOrNull { it is PenaltyStroke && it.seq == event.seq - 1 && it.team == event.team && it.scored }
        event is PenaltyStroke && event.scored ->
            events.firstOrNull { it is Goal && it.seq == event.seq + 1 && it.team == event.team && it.method == GoalMethod.PS }
        else -> null
    }
}

fun MatchRecord.voidedSeqs(): Set<Int> = document.events.filterIsInstance<VoidEvent>().map { it.refSeq }.toSet()

/** The log without cancelled events and the cancellations themselves. */
fun MatchRecord.activeEvents(): List<MatchEvent> {
    val voided = voidedSeqs()
    return document.events.filter { it !is VoidEvent && it.seq !in voided }
}

fun MatchRecord.startShootout(): MatchRecord {
    rule(clock.phase == Phase.FULL_TIME) { "The match isn't at full time." }
    rule(score().let { it.home == it.away }) { "A shootout needs a level score." }
    return copy(clock = clock.copy(phase = Phase.SHOOTOUT))
}

/**
 * A shoot-out, scored or missed. Whoever takes the first one (the coin toss) sets the
 * order from then on: see [ShootoutState.next]. A forfeit is one the team loses because
 * the player due to take it was suspended in the shootout.
 */
fun MatchRecord.shootoutAttempt(team: Side, player: Int?, scored: Boolean, now: Moment, forfeit: Boolean = false): MatchRecord {
    rule(clock.phase == Phase.SHOOTOUT) { "The shootout hasn't started." }
    val so = shootout()
    rule(so.winner == null) { "The shootout is already decided." }
    rule(so.next == null || so.next == team) { "It's ${document.teams[so.next!!].name}'s turn." }
    rule(!forfeit || !scored) { "A forfeit can't be scored." }
    rule(!forfeit || team in so.suspended) { "No one in ${document.teams[team].name} has been suspended in the shootout." }
    val round = activeEvents().count { it is ShootoutAttempt && it.team == team } + 1
    return append({ ShootoutAttempt(it, now.iso, team, round, player, scored, forfeit = if (forfeit) true else null) })
}

/**
 * A card in the shootout: yellow or red only, and either way the player takes no further
 * part, so there's no suspension to time. It's logged where the match clock ended.
 */
fun MatchRecord.shootoutCard(team: Side, player: Int?, color: CardColor, now: Moment, reason: CardReason? = null): MatchRecord {
    rule(clock.phase == Phase.SHOOTOUT) { "The shootout hasn't started." }
    rule(color != CardColor.GREEN) { "Only yellow or red cards in the shootout." }
    return append({ Card(it, now.iso, clock.period, clock.bankedMs, team, player, color, reason, durationSec = null, shootout = true) })
}

/** The final whistle. Ending mid-period (an abandoned match) closes the period first. */
fun MatchRecord.endMatch(now: Moment): MatchRecord {
    rule(clock.phase != Phase.READY && clock.phase != Phase.ENDED) { "The match hasn't started." }
    val closed = if (clock.phase == Phase.PLAYING) endPeriod(now) else this
    return closed.copy(
        document = closed.document.copy(endedAt = now.iso),
        clock = closed.clock.copy(phase = Phase.ENDED, running = false, runningSince = null, breakStartedAt = null),
    )
}

// ------------------------------------------------------------------ time passing

data class Tick(val record: MatchRecord, val alerts: List<Alert>)

/**
 * Moves the match on to `now`: logs suspensions that have run out and returns
 * the alerts that are due. Called every second or so by the match service; safe
 * to call as often as you like, and after any gap (a crash or a reboot).
 */
fun MatchRecord.tick(now: Moment): Tick {
    var record = this
    val alerts = mutableListOf<Alert>()
    fun once(key: String, alert: Alert) {
        if (key !in record.fired) {
            record = record.copy(fired = record.fired + key)
            alerts += alert
        }
    }

    for (s in record.suspensions(now)) {
        if (s.remainingMs > 0) continue
        val (period, clockMs) = record.clockAt(s.endsAtMatchMs)
        val seq = s.cardSeq
        record = record.append({ CardEnd(it, now.iso, period, clockMs, seq) })
        once("card:$seq", Alert.SuspensionOver(seq, s.team, s.player))
    }

    val c = record.clock
    when (c.phase) {
        Phase.PLAYING -> {
            val left = settings.periodLengthMs - record.periodElapsedMs(now)
            // Only the one that applies: after a gap (a restart, say) the two-minute one is skipped if it's already under a minute.
            if (settings.periodLengthMs > 120_000 && left in 60_001..120_000) once("two:${c.period}", Alert.TwoMinutesLeft(c.period))
            if (settings.periodLengthMs > 60_000 && left in 1..60_000) once("minute:${c.period}", Alert.OneMinuteLeft(c.period))
            if (left <= 0) once("time:${c.period}", Alert.TimeUp(c.period))
        }
        Phase.BREAK -> {
            if (record.breakRemainingMs(now) <= 0) once("break:${c.period}", Alert.BreakOver(c.period))
        }
        else -> {}
    }
    return Tick(record, alerts)
}

/** Period and clock time at which the match clock reached `matchMs`. */
private fun MatchRecord.clockAt(matchMs: Long): Pair<Int, Long> {
    var before = 0L
    clock.completedPeriodsMs.forEachIndexed { i, length ->
        if (matchMs <= before + length) return (i + 1) to (matchMs - before)
        before += length
    }
    return clock.period to (matchMs - before)
}

fun MatchRecord.breakLengthMs(): Long = settings.breakLengthsSec.getOrElse(clock.period - 1) { 0 } * 1000L

fun MatchRecord.breakRemainingMs(now: Moment): Long {
    val start = clock.breakStartedAt ?: return 0
    return breakLengthMs() - start.until(now)
}

// ------------------------------------------------------------------ what the screen shows

data class Score(val home: Int, val away: Int) {
    operator fun get(side: Side) = if (side == Side.HOME) home else away
}

fun MatchRecord.score(): Score {
    val goals = activeEvents().filterIsInstance<Goal>()
    return Score(goals.count { it.team == Side.HOME }, goals.count { it.team == Side.AWAY })
}

fun MatchRecord.penaltyCorners(): Score {
    val pcs = activeEvents().filterIsInstance<PenaltyCorner>()
    return Score(pcs.count { it.team == Side.HOME }, pcs.count { it.team == Side.AWAY })
}

data class Suspension(
    val cardSeq: Int,
    val team: Side,
    val player: Int?,
    val color: CardColor,
    val totalMs: Long,
    val remainingMs: Long,
    val endsAtMatchMs: Long,
)

/**
 * Green and yellow cards whose suspension hasn't been logged as over. Suspensions
 * count down only while the match clock runs, per FIH rules, so they pause for
 * stoppages and breaks and carry over into the next period.
 */
fun MatchRecord.suspensions(now: Moment): List<Suspension> {
    val active = activeEvents()
    val ended = active.filterIsInstance<CardEnd>().map { it.refSeq }.toSet()
    val nowMs = matchTimeMs(now)
    return active.filterIsInstance<Card>()
        .filter { it.durationSec != null && it.seq !in ended }
        .map { card ->
            val start = clock.completedPeriodsMs.take(card.period - 1).sum() + card.clockMs
            val total = card.durationSec!! * 1000L
            Suspension(card.seq, card.team, card.player, card.color, total, start + total - nowMs, start + total)
        }
}

data class ShootoutState(
    val home: List<Boolean>,
    val away: List<Boolean>,
    val winner: Side?,
    /** Who takes the next shoot-out; null before the first (either may) and once it's decided. */
    val next: Side?,
    /** Teams with a player suspended in the shootout, who may have to forfeit. */
    val suspended: Set<Side>,
) {
    val homeScore get() = home.count { it }
    val awayScore get() = away.count { it }
    val suddenDeath get() = home.size > ROUNDS || away.size > ROUNDS

    companion object {
        const val ROUNDS = 5
    }
}

fun MatchRecord.shootout(): ShootoutState {
    val active = activeEvents()
    val attempts = active.filterIsInstance<ShootoutAttempt>()
    val home = attempts.filter { it.team == Side.HOME }.map { it.scored }
    val away = attempts.filter { it.team == Side.AWAY }.map { it.scored }
    val winner = shootoutWinner(home, away)
    val next = attempts.firstOrNull()?.let { first -> shootoutTaker(first.team, attempts.size) }?.takeIf { winner == null }
    val suspended = active.filterIsInstance<Card>().filter { it.shootout == true }.map { it.team }.toSet()
    return ShootoutState(home, away, winner, next, suspended)
}

/**
 * Who takes shoot-out number `taken + 1`. The teams alternate, and the team that went
 * first in a series of five goes second in the next (FIH articles 21c and 22b).
 */
internal fun shootoutTaker(first: Side, taken: Int): Side {
    val starter = if ((taken / (2 * ShootoutState.ROUNDS)) % 2 == 0) first else first.other
    return if (taken % 2 == 0) starter else starter.other
}

/** Five attempts each, stopping early once one side can't catch up; then sudden death in pairs. */
internal fun shootoutWinner(home: List<Boolean>, away: List<Boolean>): Side? {
    val h = home.count { it }
    val a = away.count { it }
    val r = ShootoutState.ROUNDS
    if (home.size <= r && away.size <= r) {
        if (h + (r - home.size) < a) return Side.AWAY
        if (a + (r - away.size) < h) return Side.HOME
        return null
    }
    if (home.size == away.size && h != a) return if (h > a) Side.HOME else Side.AWAY
    return null
}
