package com.fhmatchcentre.watch.engine

import com.fasterxml.jackson.databind.ObjectMapper
import com.networknt.schema.JsonSchemaFactory
import com.networknt.schema.SchemaValidatorsConfig
import com.networknt.schema.SpecVersion
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The watch's documents against the contract the phone and API enforce:
 * schema/match.schema.json, generated from the shared Zod schema.
 */
class DocumentSchemaTest {
    private val t = FakeTime()
    private val mapper = ObjectMapper()
    private val schema = run {
        val path = System.getProperty("matchSchema") ?: error("Run through Gradle, which passes the schema's path.")
        val config = SchemaValidatorsConfig.builder().formatAssertionsEnabled(true).build()
        JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(File(path).readText(), config)
    }

    private fun errors(json: String) = schema.validate(mapper.readTree(json)).map { it.message }

    /** A match that uses every kind of event the watch writes. */
    private fun everything(): MatchRecord {
        var m = Engine.newMatch(QUARTERS, TEAMS, "Oxford Hawks, Pitch 1", t.now)
        m = m.startPeriod(t.now)
        t.advance(3 * MIN)
        m = m.goal(Side.HOME, 9, GoalMethod.FIELD, t.now)
            .goal(Side.AWAY, null, null, t.now)
            .penaltyCorner(Side.HOME, t.now)
            .card(Side.AWAY, 4, CardKind.GREEN, t.now)
            .card(Side.HOME, 12, CardKind.YELLOW_LONG, t.now)
            .card(Side.HOME, 3, CardKind.RED, t.now)
            .stopClock(t.now, StopReason.VIDEO)
        t.advance(MIN)
        m = m.resumeClock(t.now)
        t.advance(3 * MIN)
        m = m.tick(t.now).record // the green card ends
            .goal(Side.AWAY, 11, GoalMethod.PS, t.now)
            .missedStroke(Side.HOME, t.now)
            .goal(Side.HOME, 10, GoalMethod.PC, t.now)
        m = m.undo(m.document.events.last().seq, t.now)
        m = m.goal(Side.HOME, 10, GoalMethod.PC, t.now)
        while (m.clock.phase != Phase.FULL_TIME) {
            if (m.clock.phase == Phase.BREAK) m = m.startPeriod(t.now)
            t.advance(15 * MIN)
            m = m.tick(t.now).record.endPeriod(t.now)
        }
        m = m.startShootout()
        repeat(5) { m = m.shootoutAttempt(Side.HOME, 20 + it, it != 2, t.now).shootoutAttempt(Side.AWAY, null, it < 4, t.now) } // 4–4 after five each
        m = m.shootoutAttempt(Side.HOME, 7, true, t.now).shootoutAttempt(Side.AWAY, 5, false, t.now)
        m = m.undo(m.document.events.last().seq, t.now).shootoutAttempt(Side.AWAY, 5, false, t.now)
        return m.endMatch(t.now)
    }

    @Test
    fun `a full match document matches the schema`() {
        val m = everything()
        val json = DocumentJson.encodeToString(m.document)
        assertEquals(emptyList<String>(), errors(json))

        val types = m.document.events.map { DocumentJson.encodeToJsonElement(MatchEvent.serializer(), it).jsonObject["type"].toString() }.toSet()
        for (type in listOf("period_start", "period_end", "clock_stop", "clock_resume", "goal", "card", "card_end", "penalty_corner", "penalty_stroke", "shootout_attempt", "void")) {
            assertTrue("no $type event", "\"$type\"" in types)
        }
        assertEquals(Side.HOME, m.shootout().winner)

        // For checking against the TypeScript validator too: see watch-wear/README.md.
        File("build/match-fixtures").apply { mkdirs() }.resolve("full-match.json").writeText(json)
    }

    @Test
    fun `optional fields are left out rather than sent as null`() {
        var m = Engine.newMatch(QUARTERS, TEAMS.copy(away = TEAMS.away.copy(captain = null)), null, t.now).startPeriod(t.now)
        m = m.goal(Side.AWAY, null, null, t.now)
        val json = DocumentJson.encodeToString(m.document)
        assertFalse("venue" in json)
        assertFalse("\"player\"" in json)
        assertFalse("endedAt" in json)
        // teamId is required-but-nullable, so it's always there.
        assertEquals(2, Regex("\"teamId\":null").findAll(json).count())
        assertEquals(emptyList<String>(), errors(json))
    }

    @Test
    fun `the schema check really catches mistakes`() {
        val json = DocumentJson.encodeToString(everything().document)
        assertTrue(errors(json.replace("\"type\":\"goal\"", "\"type\":\"gaol\"")).isNotEmpty())
        assertTrue(errors(json.replace("\"createdOn\":\"wear\"", "\"createdOn\":\"wear\",\"extra\":1")).isNotEmpty())
        assertTrue(errors(json.replace("\"teamId\":null", "\"teamId\":\"not-a-uuid\"")).isNotEmpty())
    }

    @Test
    fun `a stored match survives a round trip, including the clock`() {
        val m = everything()
        val stored = StorageJson.encodeToString(m)
        assertEquals(m, StorageJson.decodeFromString<MatchRecord>(stored))
    }
}

private val StorageJson = Json { classDiscriminator = "type"; encodeDefaults = true }
