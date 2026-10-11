package com.fhmatchcentre.watch.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Setups sent by the phone (Setup on phone): what mobile/src/core/setup.ts sends. */
class PhoneSetupTest {
    @Test
    fun `a setup from the phone is read`() {
        val setup = Setup.fromPhone(
            """
            {"periods":2,"periodMinutes":35,"breakMinutes":5,"halfTimeMinutes":5,"shootoutIfDrawn":true,
             "homeName":"Hawks M2","homeColor":"#dc2626","homeCaptain":7,
             "awayName":"Witney M1","awayColor":"#FACC15","awayCaptain":null,"venue":"Oxford",
             "competition":" South Men's Division 2 "}
            """,
        )!!
        assertEquals(2, setup.periods)
        assertEquals(35, setup.periodMinutes)
        assertEquals(true, setup.shootoutIfDrawn)
        assertEquals("Hawks M2", setup.homeName)
        assertEquals("#DC2626", setup.homeColor)
        assertEquals(7, setup.homeCaptain)
        assertNull(setup.awayCaptain)
        assertEquals("Oxford", setup.venue)
        assertEquals("South Men's Division 2", setup.competition)
        // Not sent: the watch's defaults.
        assertEquals(Setup().cards, setup.cards)
    }

    @Test
    fun `values out of range are brought into range`() {
        val setup = Setup.fromPhone(
            """{"periods":20,"periodMinutes":0,"breakMinutes":-1,"homeName":"  ","homeColor":"red","homeCaptain":1000,"venue":" ","competition":""}""",
        )!!
        assertEquals(8, setup.periods)
        assertEquals(1, setup.periodMinutes)
        assertEquals(0, setup.breakMinutes)
        assertEquals(Setup().homeName, setup.homeName)
        assertEquals(Setup().homeColor, setup.homeColor)
        assertNull(setup.homeCaptain)
        assertNull(setup.venue)
        assertNull(setup.competition)
    }

    @Test
    fun `three-digit shirt numbers are kept`() {
        val setup = Setup.fromPhone("""{"homeCaptain":150,"awayCaptain":999}""")!!
        assertEquals(150, setup.homeCaptain)
        assertEquals(999, setup.awayCaptain)
    }

    @Test
    fun `a setup from an older phone app has no competition`() {
        assertNull(Setup.fromPhone("""{"homeName":"Hawks M2","venue":"Oxford"}""")!!.competition)
    }

    @Test
    fun `something that isn't a setup is ignored`() {
        assertNull(Setup.fromPhone("not json"))
        assertNull(Setup.fromPhone("""{"periods":"four"}"""))
    }
}
