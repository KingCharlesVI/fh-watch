package com.fhmatchcentre.watch.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** A controllable pair of clocks. */
class FakeTime(var elapsed: Long = 1_000_000, var wall: Long = 1_790_000_000_000, var boot: Int = 7) {
    val now get() = Moment(elapsed, wall, boot)
    fun advance(ms: Long) {
        elapsed += ms
        wall += ms
    }
    fun reboot(downForMs: Long) {
        boot++
        elapsed = 5_000
        wall += downForMs
    }
}

val QUARTERS = MatchSettings(
    periods = 4,
    periodLengthSec = 900,
    breakLengthsSec = listOf(120, 300, 120),
    cardDurationsSec = Engine.DEFAULT_CARDS,
    shootoutIfDrawn = true,
)

val TEAMS = Teams(
    home = Team("Oxford Hawks M1", null, "#1E40AF", captain = 7),
    away = Team("Reading M1", null, "#B91C1C"),
)

const val MIN = 60_000L

class EngineTest {
    private val t = FakeTime()
    private fun newMatch(settings: MatchSettings = QUARTERS) = Engine.newMatch(settings, TEAMS, "Pitch 1", t.now)

    @Test
    fun `the clock runs only while the period is live and stops at full time`() {
        var m = newMatch().startPeriod(t.now)
        t.advance(5 * MIN)
        assertEquals(5 * MIN, m.periodElapsedMs(t.now))

        m = m.stopClock(t.now, StopReason.INJURY)
        t.advance(3 * MIN) // stoppage: doesn't count
        assertEquals(5 * MIN, m.periodElapsedMs(t.now))

        m = m.resumeClock(t.now)
        t.advance(20 * MIN)
        assertEquals(15 * MIN, m.periodElapsedMs(t.now))
        assertTrue(m.isTimeUp(t.now))
        assertThrows(MatchRuleException::class.java) { m.stopClock(t.now).resumeClock(t.now) }
    }

    @Test
    fun `the button starts, stops and resumes, and ends a period whose time is up`() {
        var m = newMatch().toggleClock(t.now)
        assertEquals(Phase.PLAYING, m.clock.phase)
        assertTrue(m.clock.running)
        t.advance(MIN)
        m = m.toggleClock(t.now)
        assertFalse(m.clock.running)
        m = m.toggleClock(t.now)
        assertTrue(m.clock.running)
        t.advance(15 * MIN)
        m = m.toggleClock(t.now)
        assertEquals(Phase.BREAK, m.clock.phase)
        val end = m.document.events.last() as PeriodEnd
        assertEquals(15 * MIN, end.clockMs)
        // The break leads to the next period, which waits for a second press before the clock runs.
        m = m.toggleClock(t.now)
        assertEquals(Phase.NEXT_PERIOD, m.clock.phase)
        assertEquals(2, m.clock.period)
        assertFalse(m.clock.running)
        assertEquals(listOf("period_start", "clock_stop", "clock_resume", "period_end"), m.types())
        m = m.toggleClock(t.now)
        assertEquals(Phase.PLAYING, m.clock.phase)
        assertTrue(m.clock.running)
        assertEquals(listOf("period_start", "clock_stop", "clock_resume", "period_end", "period_start"), m.types())
    }

    @Test
    fun `the next period waits for the whistle, and its clock starts from zero then`() {
        var m = newMatch().startPeriod(t.now)
        t.advance(15 * MIN)
        m = m.endPeriod(t.now)
        t.advance(30_000)
        m = m.nextPeriod()
        assertEquals(Phase.NEXT_PERIOD, m.clock.phase)
        assertEquals(2, m.clock.period)
        // Nothing is logged and no time runs until the period actually starts.
        assertEquals(listOf("period_start", "period_end"), m.types())
        t.advance(2 * MIN)
        assertEquals(0L, m.periodElapsedMs(t.now))
        assertEquals(15 * MIN, m.matchTimeMs(t.now))
        assertTrue(m.tick(t.now).alerts.isEmpty())

        m = m.startPeriod(t.now)
        assertEquals(2, m.clock.period)
        assertEquals(PeriodStart(3, t.now.iso, 2, 0), m.document.events.last())
        t.advance(MIN)
        assertEquals(MIN, m.periodElapsedMs(t.now))
        assertThrows(MatchRuleException::class.java) { m.nextPeriod() }
    }

    @Test
    fun `kickoff sets startedAt, and each period starts at zero`() {
        t.advance(10 * MIN)
        val m = newMatch().startPeriod(t.now)
        assertEquals(t.now.iso, m.document.startedAt)
        assertEquals(PeriodStart(1, t.now.iso, 1, 0), m.document.events.single())
    }

    @Test
    fun `a full match runs through breaks to full time and the final whistle`() {
        var m = newMatch()
        repeat(4) { p ->
            m = m.startPeriod(t.now)
            t.advance(15 * MIN)
            m = m.endPeriod(t.now)
            if (p < 3) {
                assertEquals(Phase.BREAK, m.clock.phase)
                t.advance(QUARTERS.breakLengthsSec[p] * 1000L)
            }
        }
        assertEquals(Phase.FULL_TIME, m.clock.phase)
        assertEquals(60 * MIN, m.matchTimeMs(t.now))
        m = m.endMatch(t.now)
        assertEquals(Phase.ENDED, m.clock.phase)
        assertEquals(t.now.iso, m.document.endedAt)
        assertThrows(MatchRuleException::class.java) { m.startPeriod(t.now) }
    }

    @Test
    fun `ending the match mid-period closes the period first`() {
        var m = newMatch().startPeriod(t.now)
        t.advance(7 * MIN)
        m = m.endMatch(t.now)
        assertEquals(listOf("period_start", "period_end"), m.types())
        assertEquals(7 * MIN, (m.document.events.last() as PeriodEnd).clockMs)
    }

    @Test
    fun `goals, corners and strokes count per team`() {
        var m = newMatch().startPeriod(t.now)
        t.advance(MIN)
        m = m.goal(Side.HOME, 9, GoalMethod.FIELD, t.now)
            .penaltyCorner(Side.AWAY, t.now)
            .penaltyCorner(Side.AWAY, t.now)
            .goal(Side.AWAY, null, GoalMethod.PS, t.now)
            .missedStroke(Side.HOME, t.now)
        assertEquals(Score(1, 1), m.score())
        assertEquals(Score(0, 2), m.penaltyCorners())
        // A stroke goal records the stroke too, so the website's check that they match holds.
        val stroke = m.document.events.filterIsInstance<PenaltyStroke>().first()
        assertTrue(stroke.scored && stroke.team == Side.AWAY)
        assertEquals(MIN, (m.document.events[1] as Goal).clockMs)
    }

    @Test
    fun `nothing can be recorded before kickoff or in a break`() {
        assertThrows(MatchRuleException::class.java) { newMatch().goal(Side.HOME, null, null, t.now) }
        var m = newMatch().startPeriod(t.now)
        t.advance(15 * MIN)
        m = m.endPeriod(t.now)
        assertThrows(MatchRuleException::class.java) { m.card(Side.HOME, 4, CardKind.GREEN, t.now) }
    }

    @Test
    fun `undo cancels an event without deleting it, and a stroke goal with its stroke`() {
        var m = newMatch().startPeriod(t.now)
        m = m.goal(Side.HOME, 9, null, t.now)
        val goalSeq = m.document.events.last().seq
        m = m.undo(goalSeq, t.now)
        assertEquals(Score(0, 0), m.score())
        assertEquals(goalSeq, (m.document.events.last() as VoidEvent).refSeq)
        assertThrows(MatchRuleException::class.java) { m.undo(goalSeq, t.now) }
        assertThrows(MatchRuleException::class.java) { m.undo(1, t.now) } // the period start

        m = m.goal(Side.AWAY, 11, GoalMethod.PS, t.now)
        m = m.undo(m.document.events.last().seq, t.now)
        val voids = m.document.events.filterIsInstance<VoidEvent>().takeLast(2).map { it.refSeq }.toSet()
        val strokeAndGoal = m.document.events.filter { it is PenaltyStroke || (it is Goal && it.method == GoalMethod.PS) }.map { it.seq }.toSet()
        assertEquals(strokeAndGoal, voids)
        assertEquals(Score(0, 0), m.score())
    }

    @Test
    fun `suspensions count down only while the clock runs, across stoppages and periods`() {
        var m = newMatch().startPeriod(t.now)
        t.advance(14 * MIN)
        m = m.card(Side.AWAY, 4, CardKind.YELLOW_SHORT, t.now) // 5 minutes, 1 minute left in Q1
        t.advance(30_000)
        m = m.stopClock(t.now)
        t.advance(10 * MIN) // stoppage
        assertEquals(270_000, m.suspensions(t.now).single().remainingMs)
        m = m.resumeClock(t.now)
        t.advance(30_000)
        m = m.endPeriod(t.now)
        t.advance(2 * MIN) // break
        assertEquals(240_000, m.suspensions(t.now).single().remainingMs)

        m = m.startPeriod(t.now)
        t.advance(4 * MIN - 1)
        var tick = m.tick(t.now)
        assertTrue(tick.alerts.isEmpty())
        t.advance(1)
        tick = tick.record.tick(t.now)
        m = tick.record
        val end = m.document.events.last() as CardEnd
        assertEquals(CardEnd(end.seq, t.now.iso, 2, 4 * MIN, refSeq = m.document.events.first { it is Card }.seq), end)
        assertEquals(listOf(Alert.SuspensionOver(end.refSeq, Side.AWAY, 4)), tick.alerts)
        assertTrue(m.suspensions(t.now).isEmpty())
        assertTrue(m.tick(t.now).alerts.isEmpty())
    }

    @Test
    fun `a red card has no timer, and a cancelled card's timer goes`() {
        var m = newMatch().startPeriod(t.now)
        m = m.card(Side.HOME, 3, CardKind.RED, t.now)
        assertNull((m.document.events.last() as Card).durationSec)
        assertTrue(m.suspensions(t.now).isEmpty())
        m = m.card(Side.HOME, 5, CardKind.GREEN, t.now)
        assertEquals(1, m.suspensions(t.now).size)
        m = m.undo(m.document.events.last().seq, t.now)
        assertTrue(m.suspensions(t.now).isEmpty())
    }

    @Test
    fun `several suspensions run at once and end in order`() {
        var m = newMatch().startPeriod(t.now)
        m = m.card(Side.HOME, 2, CardKind.GREEN, t.now)
        t.advance(MIN)
        m = m.card(Side.AWAY, 6, CardKind.YELLOW_LONG, t.now)
        m = m.card(Side.AWAY, 8, CardKind.GREEN, t.now)
        assertEquals(listOf(MIN, 10 * MIN, 2 * MIN), m.suspensions(t.now).map { it.remainingMs })
        t.advance(2 * MIN)
        val tick = m.tick(t.now)
        assertEquals(listOf(2, 8), tick.alerts.map { (it as Alert.SuspensionOver).player })
    }

    @Test
    fun `a suspension that ran out while the watch was off is logged when it ran out`() {
        var m = newMatch().startPeriod(t.now)
        m = m.card(Side.HOME, 2, CardKind.GREEN, t.now)
        t.advance(10 * MIN)
        m = m.tick(t.now).record
        assertEquals(2 * MIN, (m.document.events.last() as CardEnd).clockMs)
    }

    @Test
    fun `alerts for two and one minutes left, time up and the end of a break fire once each`() {
        var m = newMatch().startPeriod(t.now)
        t.advance(12 * MIN)
        assertTrue(m.tick(t.now).alerts.isEmpty())
        t.advance(MIN)
        var tick = m.tick(t.now)
        assertEquals(listOf(Alert.TwoMinutesLeft(1)), tick.alerts)
        m = tick.record
        assertTrue(m.tick(t.now).alerts.isEmpty())
        t.advance(MIN)
        tick = m.tick(t.now)
        assertEquals(listOf(Alert.OneMinuteLeft(1)), tick.alerts)
        m = tick.record
        assertTrue(m.tick(t.now).alerts.isEmpty())
        t.advance(MIN)
        tick = m.tick(t.now)
        assertEquals(listOf(Alert.TimeUp(1)), tick.alerts)
        m = tick.record.endPeriod(t.now)
        t.advance(2 * MIN)
        tick = m.tick(t.now)
        assertEquals(listOf(Alert.BreakOver(1)), tick.alerts)
        assertTrue(tick.record.tick(t.now).alerts.isEmpty())
    }

    @Test
    fun `after a gap only the alert that still applies fires`() {
        val m = newMatch().startPeriod(t.now)
        t.advance(14 * MIN + 30_000)
        assertEquals(listOf(Alert.OneMinuteLeft(1)), m.tick(t.now).alerts)
    }

    @Test
    fun `the clock survives a reboot by falling back to the wall clock`() {
        var m = newMatch().startPeriod(t.now)
        t.advance(4 * MIN)
        t.reboot(downForMs = 2 * MIN)
        assertEquals(6 * MIN, m.periodElapsedMs(t.now))
        m = m.stopClock(t.now)
        t.advance(MIN)
        m = m.resumeClock(t.now)
        t.advance(MIN)
        assertEquals(7 * MIN, m.periodElapsedMs(t.now))
    }

    @Test
    fun `changing the wall clock doesn't disturb the match clock`() {
        val m = newMatch().startPeriod(t.now)
        t.advance(MIN)
        t.wall -= 60 * MIN // the watch syncs its time
        assertEquals(MIN, m.periodElapsedMs(t.now))
    }

    @Test
    fun `a drawn match can go to a shootout, which stops once decided`() {
        var m = fullTime(newMatch())
        m = m.startShootout()
        // Home scores 3 of 3, away misses 3 of 3: away can't catch up with two left.
        repeat(3) {
            m = m.shootoutAttempt(Side.HOME, null, true, t.now).shootoutAttempt(Side.AWAY, 10 + it, false, t.now)
        }
        assertEquals(Side.HOME, m.shootout().winner)
        assertThrows(MatchRuleException::class.java) { m.shootoutAttempt(Side.HOME, null, true, t.now) }
        assertEquals(listOf(1, 2, 3), m.document.events.filterIsInstance<ShootoutAttempt>().filter { it.team == Side.AWAY }.map { it.round })
    }

    @Test
    fun `a level shootout goes to sudden death in pairs`() {
        val five = List(5) { it % 2 == 0 }
        assertNull(shootoutWinner(five, five))
        assertNull(shootoutWinner(five + true, five))
        assertEquals(Side.HOME, shootoutWinner(five + true, five + false))
        assertNull(shootoutWinner(five + true, five + true))
        assertEquals(Side.AWAY, shootoutWinner(five + listOf(true, false), five + listOf(true, true)))
        // Early finish in the first five.
        assertEquals(Side.AWAY, shootoutWinner(listOf(false, false, false), listOf(true, true, true)))
        assertNull(shootoutWinner(listOf(false, false, false), listOf(true, true)))
    }

    @Test
    fun `no shootout unless the score is level at full time`() {
        var m = newMatch().startPeriod(t.now).goal(Side.HOME, null, null, t.now)
        m = fullTime(m)
        assertThrows(MatchRuleException::class.java) { m.startShootout() }
    }

    @Test
    fun `match ids are version 7 UUIDs in time order`() {
        val a = Engine.uuidV7(1_790_000_000_000)
        val b = Engine.uuidV7(1_790_000_000_001)
        assertTrue(a.matches(Regex("^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")))
        assertTrue(a < b)
    }

    private fun fullTime(start: MatchRecord): MatchRecord {
        var m = start
        while (m.clock.phase != Phase.FULL_TIME) {
            if (m.clock.phase != Phase.PLAYING) m = m.startPeriod(t.now)
            t.advance(15 * MIN)
            m = m.endPeriod(t.now)
        }
        return m
    }

    private fun MatchRecord.types() = document.events.map { it::class.simpleName!!.let(::snake) }

    private fun snake(name: String) = when (name) {
        "PeriodStart" -> "period_start"
        "PeriodEnd" -> "period_end"
        "ClockStop" -> "clock_stop"
        "ClockResume" -> "clock_resume"
        else -> name.lowercase()
    }
}
