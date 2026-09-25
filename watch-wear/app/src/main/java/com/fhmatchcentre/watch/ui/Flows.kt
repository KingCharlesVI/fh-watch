package com.fhmatchcentre.watch.ui

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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
import com.fhmatchcentre.watch.engine.missedStroke
import com.fhmatchcentre.watch.engine.shootout
import com.fhmatchcentre.watch.engine.shootoutAttempt
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
        !pickedPlayer -> NumberPicker("Scorer", 0..99, 10, optional = true) { player = it; pickedPlayer = true }
        else -> ListScreen("How?") {
            item { ChoiceButton("Field goal") { save(GoalMethod.FIELD) } }
            item { ChoiceButton("Penalty corner") { save(GoalMethod.PC) } }
            item { ChoiceButton("Penalty stroke") { save(GoalMethod.PS) } }
            item { ChoiceButton("Skip") { save(null) } }
        }
    }
}

/**
 * Card: team, colour and length, then the player (required). If the player
 * already has a card this match, the umpire confirms before it's recorded.
 */
@Composable
fun CardFlow(controller: MatchController, onDone: () -> Unit) {
    val m = controller.active.collectAsStateWithLifecycle().value ?: return onDone()
    var team by rememberSaveable { mutableStateOf<Side?>(null) }
    var kind by rememberSaveable { mutableStateOf<CardKind?>(null) }
    var repeat by rememberSaveable { mutableStateOf<Int?>(null) }
    val s = m.settings
    fun save(number: Int) {
        val side = team!!
        val k = kind!!
        controller.perform("card") { card(side, number, k, it) }
        onDone()
    }
    fun mins(k: CardKind) = s.durationSec(k)?.let { "${it / 60}′" + if (it % 60 != 0) "${it % 60}″" else "" }
    when {
        team == null -> PickTeam(m, "Card") { team = it }
        kind == null -> ListScreen("Card") {
            item { ChoiceButton("Green", mins(CardKind.GREEN), CARD_GREEN) { kind = CardKind.GREEN } }
            item { ChoiceButton("Yellow", mins(CardKind.YELLOW_SHORT), CARD_YELLOW) { kind = CardKind.YELLOW_SHORT } }
            item { ChoiceButton("Yellow", mins(CardKind.YELLOW_LONG), CARD_YELLOW) { kind = CardKind.YELLOW_LONG } }
            item { ChoiceButton("Red", "Rest of match", CARD_RED) { kind = CardKind.RED } }
        }
        repeat != null -> {
            val number = repeat!!
            val earlier = m.activeEvents().filterIsInstance<Card>().filter { it.team == team && it.player == number }
            ListScreen("Card ${earlier.size + 1} for #$number") {
                item {
                    Text(
                        "#$number already has " + earlier.joinToString(" and ") { c ->
                            "a " + c.color.name.lowercase() + " card (" + periodName(c.period, s.periods) + " " + formatClock(c.clockMs) + ")"
                        } + ".",
                        fontSize = 14.sp,
                        textAlign = TextAlign.Center,
                    )
                }
                item { ChoiceButton("Continue", color = Color(0xFF106C3E)) { save(number) } }
                item { ChoiceButton("Change card") { kind = null; repeat = null } }
            }
        }
        else -> NumberPicker("Player", 0..99, 10, optional = false) { number ->
            val n = number!!
            val carded = m.activeEvents().any { it is Card && it.team == team && it.player == n }
            if (carded) repeat = n else save(n)
        }
    }
}

/** Penalty stroke: team, then scored (with optional scorer) or missed. */
@Composable
fun StrokeFlow(controller: MatchController, onDone: () -> Unit) {
    val m = controller.active.collectAsStateWithLifecycle().value ?: return onDone()
    var team by rememberSaveable { mutableStateOf<Side?>(null) }
    var scored by rememberSaveable { mutableStateOf(false) }
    when {
        team == null -> PickTeam(m, "Penalty stroke") { team = it }
        !scored -> ListScreen("Stroke") {
            item { ChoiceButton("Scored", color = Color(0xFF106C3E)) { scored = true } }
            item {
                ChoiceButton("Missed") {
                    val side = team!!
                    controller.perform("stroke") { missedStroke(side, it) }
                    onDone()
                }
            }
        }
        else -> NumberPicker("Scorer", 0..99, 10, optional = true) { player ->
            val side = team!!
            controller.perform("goal") { goal(side, player, GoalMethod.PS, it) }
            onDone()
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
        is Card -> e.color.name.lowercase().replaceFirstChar(Char::uppercase) + " card " + who(e.team, e.player)
        is CardEnd -> "Suspension over"
        is PenaltyCorner -> "PC " + t[e.team].name
        is PenaltyStroke -> "Stroke " + t[e.team].name + if (e.scored) " scored" else " missed"
        is ShootoutAttempt -> "Shootout " + who(e.team, e.player) + if (e.scored) " scored" else " missed"
        is PeriodStart -> "Start of ${periodName(e.period, m.settings.periods)}"
        is PeriodEnd -> "End of ${periodName(e.period, m.settings.periods)}"
        is ClockStop -> "Clock stopped" + (e.reason?.let { " (${it.name.lowercase()})" } ?: "")
        is ClockResume -> "Clock restarted"
        is Note -> e.text
        is VoidEvent -> "Cancelled"
    }
}

private fun whenText(m: MatchRecord, e: MatchEvent): String = when (e) {
    is Timed -> "${periodName(e.period, m.settings.periods)} ${formatClock(e.clockMs)}"
    is ShootoutAttempt -> "Round ${e.round}"
    else -> ""
}

/** Attempts alternate between the teams; each can be scored or missed, with an optional player. */
@Composable
fun ShootoutScreen(controller: MatchController) {
    val m = controller.active.collectAsStateWithLifecycle().value ?: return
    val so = m.shootout()
    val teams = m.document.teams
    val last = m.document.events.lastOrNull { it is ShootoutAttempt && it.seq !in m.voidedSeqs() }
    // Suggest the team that has taken fewer attempts (home first).
    val next = if (so.home.size <= so.away.size) Side.HOME else Side.AWAY
    fun dots(results: List<Boolean>) = results.joinToString(" ") { if (it) "●" else "○" }.ifEmpty { "–" }
    ListScreen("Shootout${if (so.suddenDeath) " · sudden death" else ""}") {
        item { Text("${teams.home.name}  ${so.homeScore} – ${so.awayScore}  ${teams.away.name}", fontSize = 14.sp) }
        item { Text("${dots(so.home)}\n${dots(so.away)}", fontSize = 13.sp) }
        if (so.winner == null) {
            for (side in listOf(next, next.other)) {
                item {
                    ButtonPair(
                        { mod -> Button(onClick = { controller.perform("attempt") { shootoutAttempt(side, null, true, it) } }, modifier = mod, colors = ButtonDefaults.buttonColors(containerColor = parseColor(teams[side].color), contentColor = onColor(teams[side].color))) { Text("${side.label()} ✓", fontSize = 13.sp) } },
                        { mod -> Button(onClick = { controller.perform("attempt") { shootoutAttempt(side, null, false, it) } }, modifier = mod, colors = ButtonDefaults.filledTonalButtonColors()) { Text("${side.label()} ✗", fontSize = 13.sp) } },
                    )
                }
            }
        } else {
            item { Text("${teams[so.winner].name} win the shootout", fontSize = 14.sp) }
            item { ChoiceButton("End match", color = Color(0xFF106C3E)) { controller.perform { endMatch(it) } } }
        }
        if (last != null) item { ChoiceButton("Undo last attempt") { controller.perform { undo(last.seq, it) } } }
    }
}
