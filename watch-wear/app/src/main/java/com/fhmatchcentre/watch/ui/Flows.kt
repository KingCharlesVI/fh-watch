package com.fhmatchcentre.watch.ui

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.wear.compose.material3.AlertDialog
import androidx.wear.compose.material3.AlertDialogDefaults
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.Text
import com.fhmatchcentre.watch.engine.Card
import com.fhmatchcentre.watch.engine.CardEnd
import com.fhmatchcentre.watch.engine.CardKind
import com.fhmatchcentre.watch.engine.CardReason
import com.fhmatchcentre.watch.engine.ClockResume
import com.fhmatchcentre.watch.engine.ClockStop
import com.fhmatchcentre.watch.engine.Goal
import com.fhmatchcentre.watch.engine.GoalMethod
import com.fhmatchcentre.watch.engine.MatchEvent
import com.fhmatchcentre.watch.engine.MatchRecord
import com.fhmatchcentre.watch.engine.Note
import com.fhmatchcentre.watch.engine.PenaltyCorner
import com.fhmatchcentre.watch.engine.PenaltyStroke
import com.fhmatchcentre.watch.engine.PeriodEnd
import com.fhmatchcentre.watch.engine.PeriodStart
import com.fhmatchcentre.watch.engine.Phase
import com.fhmatchcentre.watch.engine.SHIRT_NUMBERS
import com.fhmatchcentre.watch.engine.ShootoutAttempt
import com.fhmatchcentre.watch.engine.Side
import com.fhmatchcentre.watch.engine.Timed
import com.fhmatchcentre.watch.engine.VoidEvent
import com.fhmatchcentre.watch.engine.activeEvents
import com.fhmatchcentre.watch.engine.card
import com.fhmatchcentre.watch.engine.durationSec
import com.fhmatchcentre.watch.engine.endMatch
import com.fhmatchcentre.watch.engine.goal
import com.fhmatchcentre.watch.engine.isUndoable
import com.fhmatchcentre.watch.engine.shootout
import com.fhmatchcentre.watch.engine.shootoutAttempt
import com.fhmatchcentre.watch.engine.shootoutCard
import com.fhmatchcentre.watch.engine.undo
import com.fhmatchcentre.watch.engine.voidedSeqs
import com.fhmatchcentre.watch.match.MatchController

/** Pick the team: two big buttons in the teams' colours. */
@Composable
private fun PickTeam(m: MatchRecord, title: String, onPick: (Side) -> Unit) {
    ListScreen(title) {
        item { TeamButton(m.document.teams.home, secondary = "Home") { onPick(Side.HOME) } }
        item { TeamButton(m.document.teams.away, secondary = "Away") { onPick(Side.AWAY) } }
    }
}

/** Goal: team (unless the Goals page's button already said), then scorer (optional), then how it was scored (optional). */
@Composable
fun GoalFlow(controller: MatchController, forTeam: Side?, onDone: () -> Unit) {
    val m = controller.active.collectAsStateWithLifecycle().value ?: return onDone()
    var team by rememberSaveable { mutableStateOf(forTeam) }
    var player by rememberSaveable { mutableStateOf<Int?>(null) }
    var pickedPlayer by rememberSaveable { mutableStateOf(false) }
    fun save(method: GoalMethod?) {
        val side = team!!
        controller.perform("goal") { goal(side, player, method, it) }
        onDone()
    }
    when {
        team == null -> PickTeam(m, "Goal") { team = it }
        !pickedPlayer -> NumberPad("Scorer", SHIRT_NUMBERS, null, optional = true) { player = it; pickedPlayer = true }
        else -> ListScreen("How?") {
            item { ChoiceButton("Field goal") { save(GoalMethod.FIELD) } }
            item { ChoiceButton("Penalty corner") { save(GoalMethod.PC) } }
            item { ChoiceButton("Penalty stroke") { save(GoalMethod.PS) } }
            item { ChoiceButton("Skip") { save(null) } }
        }
    }
}

/**
 * Card: team, colour and length, the player (required), then why (optional). If the
 * player already has a card this match, the umpire confirms before going on. In the
 * shootout it's yellow or red only, and either is for the rest of the shootout.
 */
@Composable
fun CardFlow(controller: MatchController, onDone: () -> Unit) {
    val m = controller.active.collectAsStateWithLifecycle().value ?: return onDone()
    var team by rememberSaveable { mutableStateOf<Side?>(null) }
    var kind by rememberSaveable { mutableStateOf<CardKind?>(null) }
    var repeat by rememberSaveable { mutableStateOf<Int?>(null) }
    var player by rememberSaveable { mutableStateOf<Int?>(null) }
    val s = m.settings
    val inShootout = m.clock.phase == Phase.SHOOTOUT
    fun save(reason: CardReason?) {
        val side = team!!
        val k = kind!!
        val number = player!!
        controller.perform("card") { if (inShootout) shootoutCard(side, number, k.color, it, reason) else card(side, number, k, it, reason) }
        onDone()
    }
    fun mins(k: CardKind) = s.durationSec(k)?.let { "${it / 60}′" + if (it % 60 != 0) "${it % 60}″" else "" }
    when {
        team == null -> PickTeam(m, "Card") { team = it }
        kind == null && inShootout -> ListScreen("Card") {
            item { ChoiceButton("Yellow", "Rest of shootout", CARD_YELLOW) { kind = CardKind.YELLOW_SHORT } }
            item { ChoiceButton("Red", "Rest of shootout", CARD_RED) { kind = CardKind.RED } }
        }
        kind == null -> ListScreen("Card") {
            item { ChoiceButton("Green", mins(CardKind.GREEN), CARD_GREEN) { kind = CardKind.GREEN } }
            item { ChoiceButton("Yellow", mins(CardKind.YELLOW_SHORT), CARD_YELLOW) { kind = CardKind.YELLOW_SHORT } }
            item { ChoiceButton("Yellow", mins(CardKind.YELLOW_LONG), CARD_YELLOW) { kind = CardKind.YELLOW_LONG } }
            item { ChoiceButton("Red", "Rest of match", CARD_RED) { kind = CardKind.RED } }
        }
        player != null -> ListScreen("Why?") {
            item { ChoiceButton("Skip") { save(null) } }
            CardReason.entries.forEach { r -> item { ChoiceButton(CARD_REASON_LABELS.getValue(r)) { save(r) } } }
        }
        repeat != null -> {
            val number = repeat!!
            val earlier = m.activeEvents().filterIsInstance<Card>().filter { it.team == team && it.player == number }
            ListScreen("Card ${earlier.size + 1} for #$number") {
                item {
                    Text(
                        "#$number already has " + earlier.joinToString(" and ") { c ->
                            "a " + c.color.name.lowercase() + " card (" + (if (c.shootout == true) "shootout" else periodName(c.period, s.periods) + " " + formatClock(c.clockMs)) + ")"
                        } + ".",
                        fontSize = 14.sp,
                        textAlign = TextAlign.Center,
                    )
                }
                item { ChoiceButton("Continue", color = Color(0xFF106C3E)) { player = number; repeat = null } }
                item { ChoiceButton("Change card") { kind = null; repeat = null } }
            }
        }
        else -> NumberPad("Player", SHIRT_NUMBERS, null, optional = false) { number ->
            val n = number!!
            val carded = m.activeEvents().any { it is Card && it.team == team && it.player == n }
            if (carded) repeat = n else player = n
        }
    }
}

/** The log, newest first. Recorded events can be cancelled; cancelled ones are struck through. */
@Composable
fun EventsScreen(controller: MatchController) {
    val m = controller.active.collectAsStateWithLifecycle().value ?: return
    var confirm by rememberSaveable { mutableStateOf<Int?>(null) }
    val voided = m.voidedSeqs()
    val events = m.document.events.filter { it !is VoidEvent }.reversed()
    ListScreen("Events") {
        if (events.isEmpty()) item { Text("Nothing yet") }
        events.forEach { e ->
            item {
                val cancelled = e.seq in voided
                Button(
                    onClick = { if (e.isUndoable() && !cancelled) confirm = e.seq },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.filledTonalButtonColors(),
                    label = {
                        Text(describe(m, e), fontSize = 13.sp, textDecoration = if (cancelled) TextDecoration.LineThrough else null)
                    },
                    secondaryLabel = { Text(whenText(m, e) + if (cancelled) " · cancelled" else "", fontSize = 11.sp) },
                )
            }
        }
    }
    val target = m.document.events.firstOrNull { it.seq == confirm }
    AlertDialog(
        visible = target != null,
        onDismissRequest = { confirm = null },
        title = { Text("Cancel this?") },
        text = { Text(target?.let { describe(m, it) } ?: "") },
        confirmButton = {
            AlertDialogDefaults.ConfirmButton(onClick = {
                val seq = confirm!!
                confirm = null
                controller.perform { undo(seq, it) }
            })
        },
        dismissButton = { AlertDialogDefaults.DismissButton(onClick = { confirm = null }) },
    )
}

fun describe(m: MatchRecord, e: MatchEvent): String {
    val t = m.document.teams
    fun who(side: Side, player: Int?) = t[side].name + (player?.let { " #$it" } ?: "")
    return when (e) {
        is Goal -> "Goal " + who(e.team, e.player) + when (e.method) { GoalMethod.PC -> " (PC)"; GoalMethod.PS -> " (PS)"; else -> "" }
        is Card -> e.color.name.lowercase().replaceFirstChar(Char::uppercase) + " card " + who(e.team, e.player) +
            (e.reason?.let { ": " + CARD_REASON_LABELS.getValue(it).lowercase() } ?: "")
        is CardEnd -> "Suspension over"
        is PenaltyCorner -> "PC " + t[e.team].name
        is PenaltyStroke -> "Stroke " + t[e.team].name + if (e.scored) " scored" else " missed"
        is ShootoutAttempt -> "Shootout " + who(e.team, e.player) + when { e.forfeit == true -> " forfeited"; e.scored -> " scored"; else -> " missed" }
        is PeriodStart -> "Start of ${periodName(e.period, m.settings.periods)}"
        is PeriodEnd -> "End of ${periodName(e.period, m.settings.periods)}"
        is ClockStop -> "Clock stopped" + (e.reason?.let { " (${it.name.lowercase()})" } ?: "")
        is ClockResume -> "Clock restarted"
        is Note -> e.text
        is VoidEvent -> "Cancelled"
    }
}

private fun whenText(m: MatchRecord, e: MatchEvent): String = when (e) {
    is Card if e.shootout == true -> "Shootout"
    is Timed -> "${periodName(e.period, m.settings.periods)} ${formatClock(e.clockMs)}"
    is ShootoutAttempt -> "Round ${e.round}"
    else -> ""
}

/**
 * The shootout. Whoever takes the first shoot-out sets the order (the coin toss), so from
 * then on only the team that's up can be scored. The side button times each shoot-out's
 * 8 seconds (see MainActivity).
 */
@Composable
fun ShootoutScreen(controller: MatchController, onCard: () -> Unit) {
    val m = controller.active.collectAsStateWithLifecycle().value ?: return
    val timerStart by controller.shootoutTimer.collectAsStateWithLifecycle()
    val now = rememberNow()
    val so = m.shootout()
    val teams = m.document.teams
    val voided = m.voidedSeqs()
    val last = m.document.events.lastOrNull { (it is ShootoutAttempt || (it is Card && it.shootout == true)) && it.seq !in voided }
    fun dots(results: List<Boolean>) = results.joinToString(" ") { if (it) "●" else "○" }.ifEmpty { "–" }
    ListScreen(if (so.suddenDeath) "Sudden death" else "Shootout") {
        item { Text("${teams.home.name}  ${so.homeScore} – ${so.awayScore}  ${teams.away.name}", fontSize = 14.sp) }
        item { Text("${dots(so.home)}\n${dots(so.away)}", fontSize = 13.sp) }
        val start = timerStart
        if (start != null) {
            val left = MatchController.SHOOTOUT_MS - (now.elapsedMs - start)
            item { Text("${(left.coerceAtLeast(0) + 999) / 1000}", fontSize = 40.sp, fontWeight = FontWeight.Bold) }
        }
        if (so.winner == null) {
            // Before the first shoot-out either team may go; after it, only the team that's up.
            for (side in so.next?.let(::listOf) ?: listOf(Side.HOME, Side.AWAY)) {
                item {
                    ButtonPair(
                        { mod -> Button(onClick = { controller.perform("attempt") { shootoutAttempt(side, null, true, it) } }, modifier = mod, colors = ButtonDefaults.buttonColors(containerColor = parseColor(teams[side].color), contentColor = onColor(teams[side].color))) { Text("${side.label()} ✓", fontSize = 13.sp) } },
                        { mod -> Button(onClick = { controller.perform("attempt") { shootoutAttempt(side, null, false, it) } }, modifier = mod, colors = ButtonDefaults.filledTonalButtonColors()) { Text("${side.label()} ✗", fontSize = 13.sp) } },
                    )
                }
                // The player due may have been suspended in the shootout.
                if (side in so.suspended) item { ChoiceButton("${side.label()} forfeit") { controller.perform("attempt") { shootoutAttempt(side, null, false, it, forfeit = true) } } }
            }
        } else {
            item { Text("${teams[so.winner].name} win the shootout", fontSize = 14.sp) }
            item { ChoiceButton("End match", color = END_RED) { controller.perform { endMatch(it) } } }
        }
        item { ChoiceButton("Card") { onCard() } }
        if (last != null) item { ChoiceButton("Undo", describe(m, last)) { controller.perform { undo(last.seq, it) } } }
    }
}
