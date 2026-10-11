package com.fhmatchcentre.watch.ui

import com.fhmatchcentre.watch.engine.Engine
import com.fhmatchcentre.watch.engine.FakeTime
import com.fhmatchcentre.watch.engine.MIN
import com.fhmatchcentre.watch.engine.MatchRecord
import com.fhmatchcentre.watch.engine.QUARTERS
import com.fhmatchcentre.watch.engine.TEAMS
import com.fhmatchcentre.watch.engine.startPeriod
import com.fhmatchcentre.watch.engine.stopClock
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class AmbientTest {
    private val t = FakeTime()
    private fun playing() = Engine.newMatch(QUARTERS, TEAMS, "Pitch 1", t.now).startPeriod(t.now)

    /** The ambient screen shows something new exactly when it says it will, and not before. */
    private fun assertWakesOnTheChange(m: MatchRecord, countDown: Boolean) {
        val wait = untilAmbientChange(m, t.now, countDown)
        val before = t.now.let { it.copy(elapsedMs = it.elapsedMs + wait - 1, wallMs = it.wallMs + wait - 1) }
        assertEquals(ambientLines(m, t.now, countDown), ambientLines(m, before, countDown))
        t.advance(wait)
        assertNotEquals(ambientLines(m, before, countDown), ambientLines(m, t.now, countDown))
    }

    @Test
    fun `counting up it wakes once a minute, as the minute changes`() {
        val m = playing()
        t.advance(2 * MIN + 12_345)
        assertWakesOnTheChange(m, countDown = false)
        assertEquals("3′", ambientLines(m, t.now, false).second)
        assertEquals(MIN, untilAmbientChange(m, t.now, false))
    }

    @Test
    fun `counting down it wakes as the minute changes`() {
        val m = playing()
        t.advance(4 * MIN + 30_000)
        assertWakesOnTheChange(m, countDown = true)
        assertEquals("9′", ambientLines(m, t.now, true).second)
    }

    @Test
    fun `it wakes at time up`() {
        val m = playing()
        t.advance(14 * MIN + 50_000)
        assertWakesOnTheChange(m, countDown = true)
        assertEquals("Q1 · time up", ambientLines(m, t.now, true).first)
    }

    @Test
    fun `with the clock stopped it sleeps a whole minute`() {
        val m = playing().also { t.advance(3 * MIN) }.stopClock(t.now)
        assertEquals(MIN, untilAmbientChange(m, t.now, false))
    }
}
