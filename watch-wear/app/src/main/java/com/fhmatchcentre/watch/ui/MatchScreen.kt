package com.fhmatchcentre.watch.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material3.AlertDialog
import androidx.wear.compose.material3.AlertDialogDefaults
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.Text
import com.fhmatchcentre.watch.data.Prefs
import com.fhmatchcentre.watch.engine.CardColor
import com.fhmatchcentre.watch.engine.MatchRecord
import com.fhmatchcentre.watch.engine.Moment
import com.fhmatchcentre.watch.engine.Phase
import com.fhmatchcentre.watch.engine.Side
import com.fhmatchcentre.watch.engine.StopReason
import com.fhmatchcentre.watch.engine.breakRemainingMs
import com.fhmatchcentre.watch.engine.endMatch
import com.fhmatchcentre.watch.engine.endPeriod
import com.fhmatchcentre.watch.engine.isTimeUp
import com.fhmatchcentre.watch.engine.penaltyCorner
import com.fhmatchcentre.watch.engine.penaltyCorners
import com.fhmatchcentre.watch.engine.periodElapsedMs
import com.fhmatchcentre.watch.engine.score
import com.fhmatchcentre.watch.engine.startShootout
import com.fhmatchcentre.watch.engine.stopClock
import com.fhmatchcentre.watch.engine.suspensions
import com.fhmatchcentre.watch.engine.toggleClock
import com.fhmatchcentre.watch.match.MatchController

/**
 * The screen during a match: period, clock and score at the top, then the
 * suspension timers and the actions, scrolled with the crown. Tapping the clock
 * does the same as the physical button.
 *
 * The layout is provisional until it's matched to MatchGear's.
 */
@Composable
fun MatchScreen(
    controller: MatchController,
    prefs: Prefs,
    ambient: Boolean,
    onGoal: () -> Unit,
    onCard: () -> Unit,
    onStroke: () -> Unit,
    onEvents: () -> Unit,
) {
    val record by controller.active.collectAsStateWithLifecycle()
    val undo by controller.undoOffer.collectAsStateWithLifecycle()
    val m = record ?: return
    val now = rememberNow()
    // Ending a period early or the match can't be undone, so both ask first.
    var confirm by remember { mutableStateOf<Pair<String, (MatchRecord, Moment) -> MatchRecord>?>(null) }

    // Back to the clock and score whenever something is recorded.
    val listState = rememberScalingLazyListState(initialCenterItemIndex = 0)
    val eventCount = m.document.events.size
    LaunchedEffect(eventCount) { listState.scrollToItem(0) }

    if (ambient) {
        AmbientMatch(m, now, prefs.clockCountsDown)
        return
    }

    ListScreen(title = null, state = listState) {
        item { Header(m, now, prefs.clockCountsDown) { controller.perform { toggleClock(it) } } }
        item { Scoreline(m) }
        val suspensions = m.suspensions(now).filter { m.clock.phase == Phase.PLAYING || m.clock.phase == Phase.BREAK }
        if (suspensions.isNotEmpty()) {
            item {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterHorizontally), modifier = Modifier.fillMaxWidth()) {
                    suspensions.take(6).forEach { s ->
                        val color = if (s.color == CardColor.GREEN) CARD_GREEN else CARD_YELLOW
                        Text(
                            "${if (s.team == Side.HOME) "H" else "A"}${s.player ?: ""} ${formatClock(s.remainingMs)}",
                            color = Color.Black,
                            fontSize = 12.sp,
                            modifier = Modifier.background(color, RoundedCornerShape(6.dp)).padding(horizontal = 5.dp, vertical = 1.dp),
                        )
                    }
                }
            }
        }
        undo?.let { offer ->
            if (now.elapsedMs < offer.untilElapsedMs) {
                item {
                    Button(
                        onClick = { controller.undo(offer) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.outlinedButtonColors(),
                        label = { Text("Undo ${offer.label}") },
                        secondaryLabel = { Text("${(offer.untilElapsedMs - now.elapsedMs + 999) / 1000} s") },
                    )
                }
            }
        }

        when (m.clock.phase) {
            Phase.READY, Phase.BREAK -> {
                val next = if (m.clock.phase == Phase.READY) 1 else m.clock.period + 1
                item { ChoiceButton("Start ${periodName(next, m.settings.periods)}", color = Color(0xFF1F6F43)) { controller.perform { toggleClock(it) } } }
                if (m.clock.phase == Phase.READY) item { ChoiceButton("Cancel match") { controller.discard() } }
                else item { ChoiceButton("Events") { onEvents() } }
            }
            Phase.PLAYING -> {
                val timeUp = m.isTimeUp(now)
                item {
                    ChoiceButton(
                        label = when {
                            timeUp -> "End ${periodName(m.clock.period, m.settings.periods)}"
                            m.clock.running -> "Stop clock"
                            else -> "Restart clock"
                        },
                        color = if (m.clock.running && !timeUp) Color(0xFF8A2B20) else Color(0xFF1F6F43),
                    ) { controller.perform { toggleClock(it) } }
                }
                item { ChoiceButton("Goal") { onGoal() } }
                item { ChoiceButton("Card") { onCard() } }
                item {
                    ButtonPair(
                        { mod -> SmallTeamButton(m, Side.HOME, "PC", mod) { controller.perform("corner") { penaltyCorner(Side.HOME, it) } } },
                        { mod -> SmallTeamButton(m, Side.AWAY, "PC", mod) { controller.perform("corner") { penaltyCorner(Side.AWAY, it) } } },
                    )
                }
                item { ChoiceButton("Penalty stroke") { onStroke() } }
                if (m.clock.running) {
                    item { ChoiceButton("Stop: injury") { controller.perform { stopClock(it, StopReason.INJURY) } } }
                    item { ChoiceButton("Stop: video referral") { controller.perform { stopClock(it, StopReason.VIDEO) } } }
                }
                item { ChoiceButton("Events") { onEvents() } }
                if (!timeUp) item { ChoiceButton("End ${periodName(m.clock.period, m.settings.periods)} early") { confirm = "End ${periodName(m.clock.period, m.settings.periods)} now?" to { r, t -> r.endPeriod(t) } } }
            }
            Phase.FULL_TIME -> {
                val s = m.score()
                if (m.settings.shootoutIfDrawn && s.home == s.away) {
                    item { ChoiceButton("Shootout", color = Color(0xFF1F6F43)) { controller.perform { startShootout() } } }
                }
                item { ChoiceButton("End match", color = if (s.home == s.away && m.settings.shootoutIfDrawn) null else Color(0xFF1F6F43)) { controller.perform { endMatch(it) } } }
                item { ChoiceButton("Events") { onEvents() } }
            }
            else -> {}
        }
        if (m.clock.phase == Phase.PLAYING || m.clock.phase == Phase.BREAK) {
            item { ChoiceButton("End match") { confirm = "End the match now?" to { r, t -> r.endMatch(t) } } }
        }
    }

    AlertDialog(
        visible = confirm != null,
        onDismissRequest = { confirm = null },
        title = { Text(confirm?.first ?: "") },
        confirmButton = {
            AlertDialogDefaults.ConfirmButton(onClick = {
                val action = confirm!!.second
                confirm = null
                controller.perform { action(this, it) }
            })
        },
        dismissButton = { AlertDialogDefaults.DismissButton(onClick = { confirm = null }) },
    )
}

@Composable
private fun Header(m: MatchRecord, now: Moment, countDown: Boolean, onTap: () -> Unit) {
    val (label, clock, clockColor) = clockDisplay(m, now, countDown)
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth().clickable(onClick = onTap).padding(top = 8.dp),
    ) {
        Text(label, fontSize = 13.sp, color = Color(0xFFB0B8B3))
        Text(clock, fontSize = 44.sp, fontWeight = FontWeight.Bold, color = clockColor)
    }
}

/** Period label, clock text and colour: amber while stopped, red at time up. */
private fun clockDisplay(m: MatchRecord, now: Moment, countDown: Boolean): Triple<String, String, Color> {
    val periods = m.settings.periods
    return when (m.clock.phase) {
        Phase.READY -> Triple("Ready", formatClock(if (countDown) m.settings.periodLengthMs else 0), Color.White)
        Phase.PLAYING -> {
            val elapsed = m.periodElapsedMs(now)
            val shown = if (countDown) m.settings.periodLengthMs - elapsed else elapsed
            val label = periodName(m.clock.period, periods) + when {
                m.isTimeUp(now) -> " · time up"
                !m.clock.running -> " · stopped"
                else -> ""
            }
            val color = when {
                m.isTimeUp(now) -> Color(0xFFFF6B5B)
                !m.clock.running -> Color(0xFFF2C230)
                else -> Color.White
            }
            Triple(label, formatClock(shown), color)
        }
        Phase.BREAK -> {
            val left = m.breakRemainingMs(now)
            Triple("Break after ${periodName(m.clock.period, periods)}", if (left >= 0) formatClock(left) else "+" + formatClock(-left), if (left >= 0) Color.White else Color(0xFFFF6B5B))
        }
        Phase.FULL_TIME -> Triple("Full time", "", Color.White)
        Phase.SHOOTOUT -> Triple("Shootout", "", Color.White)
        Phase.ENDED -> Triple("Ended", "", Color.White)
    }
}

@Composable
private fun Scoreline(m: MatchRecord) {
    val s = m.score()
    val pcs = m.penaltyCorners()
    val teams = m.document.teams
    Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        TeamScore(teams.home.name, teams.home.color, s.home, pcs.home, Modifier.weight(1f))
        Text("–", fontSize = 22.sp, modifier = Modifier.padding(horizontal = 4.dp))
        TeamScore(teams.away.name, teams.away.color, s.away, pcs.away, Modifier.weight(1f))
    }
}

@Composable
private fun TeamScore(name: String, color: String, goals: Int, corners: Int, modifier: Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.background(parseColor(color), RoundedCornerShape(8.dp)).padding(horizontal = 10.dp)) {
            Text("$goals", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = onColor(color))
        }
        Text(name, fontSize = 11.sp, maxLines = 1, textAlign = TextAlign.Center)
        Text("PC $corners", fontSize = 10.sp, color = Color(0xFFB0B8B3))
    }
}

@Composable
private fun SmallTeamButton(m: MatchRecord, side: Side, label: String, modifier: Modifier, onClick: () -> Unit) {
    val team = m.document.teams[side]
    Button(
        onClick = onClick,
        modifier = modifier,
        colors = ButtonDefaults.buttonColors(containerColor = parseColor(team.color), contentColor = onColor(team.color)),
    ) { Text("$label ${side.label()}", fontSize = 12.sp, maxLines = 1) }
}

/** Low-power display: updated about once a minute, so whole minutes only. */
@Composable
private fun AmbientMatch(m: MatchRecord, now: Moment, countDown: Boolean) {
    val (label, clock, _) = clockDisplay(m, now, countDown)
    val s = m.score()
    Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(label, color = Color.Gray, fontSize = 13.sp)
            Text(clock.substringBefore(":") + "′", color = Color.White, fontSize = 40.sp)
            Text("${s.home} – ${s.away}", color = Color.White, fontSize = 22.sp)
        }
    }
}
