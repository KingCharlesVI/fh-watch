package com.fhmatchcentre.watch.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.wear.compose.foundation.lazy.ScalingLazyListScope
import androidx.wear.compose.foundation.pager.HorizontalPager
import androidx.wear.compose.foundation.pager.rememberPagerState
import androidx.wear.compose.material3.AlertDialog
import androidx.wear.compose.material3.AlertDialogDefaults
import androidx.wear.compose.material3.AnimatedPage
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.HorizontalPagerScaffold
import androidx.wear.compose.material3.SwitchButton
import androidx.wear.compose.material3.Text
import com.fhmatchcentre.watch.Services
import com.fhmatchcentre.watch.engine.Card
import com.fhmatchcentre.watch.engine.CardColor
import com.fhmatchcentre.watch.engine.MatchRecord
import com.fhmatchcentre.watch.engine.Moment
import com.fhmatchcentre.watch.engine.Phase
import com.fhmatchcentre.watch.engine.Side
import com.fhmatchcentre.watch.engine.StopReason
import com.fhmatchcentre.watch.engine.Suspension
import com.fhmatchcentre.watch.engine.activeEvents
import com.fhmatchcentre.watch.engine.breakRemainingMs
import com.fhmatchcentre.watch.engine.endMatch
import com.fhmatchcentre.watch.engine.endPeriod
import com.fhmatchcentre.watch.engine.isTimeUp
import com.fhmatchcentre.watch.engine.matchTimeMs
import com.fhmatchcentre.watch.engine.penaltyCorner
import com.fhmatchcentre.watch.engine.penaltyCorners
import com.fhmatchcentre.watch.engine.periodElapsedMs
import com.fhmatchcentre.watch.engine.score
import com.fhmatchcentre.watch.engine.startShootout
import com.fhmatchcentre.watch.engine.stopClock
import com.fhmatchcentre.watch.engine.suspensions
import com.fhmatchcentre.watch.engine.toggleClock
import com.fhmatchcentre.watch.match.MatchController
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** The match pages, swiped left and right. Timing comes first; swiping right from it goes back home. */
private enum class Page { TIMING, CARDS, GOALS, SYNC, SETTINGS }

private val BRAND = Color(0xFF106C3E)
private val STOP_RED = Color(0xFF8A2B20)
private val MUTED = Color(0xFFB0B8B3)
private val SURFACE = Color(0xFF262626)
private val TABULAR = TextStyle(fontFeatureSettings = "tnum")

/**
 * The screen during a match: one page per kind of action, like MatchGear.
 * The physical button starts and stops the clock on every page (see MainActivity).
 */
@Composable
fun MatchScreen(
    services: Services,
    ambient: Boolean,
    onGoal: (Side) -> Unit,
    onCard: () -> Unit,
    onStroke: () -> Unit,
    onEvents: () -> Unit,
) {
    val controller = services.controller
    val record by controller.active.collectAsStateWithLifecycle()
    val m = record ?: return
    val now = rememberNow()
    // Held here so the Settings page's switch changes the Timing page straight away.
    var countDown by remember { mutableStateOf(services.prefs.clockCountsDown) }
    // Ending a period early, the match, or cancelling it can't be undone, so they ask first.
    var confirm by remember { mutableStateOf<Pair<String, () -> Unit>?>(null) }

    if (ambient) {
        AmbientMatch(m, now, countDown)
        return
    }

    val pager = rememberPagerState(pageCount = { Page.entries.size })
    HorizontalPagerScaffold(pagerState = pager) {
        HorizontalPager(state = pager) { index ->
            AnimatedPage(pageIndex = index, pagerState = pager) {
                when (Page.entries[index]) {
                    Page.TIMING -> TimingPage(m, now, countDown, controller)
                    Page.CARDS -> CardsPage(m, now, controller, onCard)
                    Page.GOALS -> GoalsPage(m, now, controller, onGoal, onStroke)
                    Page.SYNC -> SyncPage(services)
                    Page.SETTINGS -> SettingsPage(
                        m, now, countDown,
                        onCountDown = { countDown = it; services.prefs.clockCountsDown = it },
                        onEvents = onEvents,
                        controller = controller,
                        onConfirm = { confirm = it },
                    )
                }
            }
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
                action()
            })
        },
        dismissButton = { AlertDialogDefaults.DismissButton(onClick = { confirm = null }) },
    )
}

// ---- Timing ------------------------------------------------------------------

@Composable
private fun TimingPage(m: MatchRecord, now: Moment, countDown: Boolean, controller: MatchController) {
    // No undo offer here: it would push the Stop button off the screen. It's on the Cards and Goals pages.
    val (label, clock, clockColor) = clockDisplay(m, now, countDown)
    val toggle: () -> Unit = { controller.perform { toggleClock(it) } }
    ListScreen(title = null, fromTop = true) {
        item {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
            ) {
                // The match minute (time played in all periods) sits beside the period, like a referee's second watch.
                val played = if (m.clock.phase == Phase.PLAYING) " · ${m.matchTimeMs(now) / 60_000}′" else ""
                Text(label + played, fontSize = 14.sp, color = MUTED)
                if (clock.isNotEmpty()) Text(clock, fontSize = 46.sp, fontWeight = FontWeight.Bold, color = clockColor, style = TABULAR)
            }
        }
        item { MiniScore(m) }
        val suspensions = m.suspensions(now)
        if (suspensions.isNotEmpty() && (m.clock.phase == Phase.PLAYING || m.clock.phase == Phase.BREAK)) {
            item { SuspensionChips(m, suspensions) }
        }
        when (m.clock.phase) {
            Phase.READY, Phase.BREAK -> {
                val next = if (m.clock.phase == Phase.READY) 1 else m.clock.period + 1
                item { PillButton("Start ${periodName(next, m.settings.periods)}", BRAND, onClick = toggle) }
                if (m.clock.phase == Phase.READY) {
                    item { Hint("The side button (the lower one on Galaxy watches) also starts and stops time. Swipe left for cards, goals and more.") }
                }
            }
            Phase.PLAYING -> {
                val timeUp = m.isTimeUp(now)
                item {
                    PillButton(
                        when {
                            timeUp -> "End ${periodName(m.clock.period, m.settings.periods)}"
                            m.clock.running -> "Stop"
                            else -> "Restart"
                        },
                        if (m.clock.running && !timeUp) STOP_RED else BRAND,
                        onClick = toggle,
                    )
                }
                // A stop with a reason, so the report shows why time was stopped.
                if (m.clock.running && !timeUp) {
                    item {
                        ButtonPair(
                            { mod -> SmallButton("Injury", mod) { controller.perform { stopClock(it, StopReason.INJURY) } } },
                            { mod -> SmallButton("Video", mod) { controller.perform { stopClock(it, StopReason.VIDEO) } } },
                        )
                    }
                }
            }
            Phase.FULL_TIME -> {
                val s = m.score()
                val shootout = m.settings.shootoutIfDrawn && s.home == s.away
                if (shootout) item { PillButton("Shootout", BRAND) { controller.perform { startShootout() }; Unit } }
                item { PillButton("End match", if (shootout) SURFACE else BRAND) { controller.perform { endMatch(it) }; Unit } }
            }
            else -> {}
        }
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
                !m.clock.running -> CARD_YELLOW
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

/** "● 1 – 0 ●" in the teams' colours. */
@Composable
private fun MiniScore(m: MatchRecord, fontSize: Int = 22) {
    val s = m.score()
    val teams = m.document.teams
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
        TeamDot(teams.home.color, (fontSize / 2.5).dp)
        Text(
            "${s.home} – ${s.away}",
            fontSize = fontSize.sp,
            fontWeight = FontWeight.Bold,
            style = TABULAR,
            modifier = Modifier.padding(horizontal = (fontSize / 3).dp),
        )
        TeamDot(teams.away.color, (fontSize / 2.5).dp)
    }
}

@Composable
private fun TeamDot(color: String, size: androidx.compose.ui.unit.Dp) {
    // A thin ring keeps a black team visible on the black screen.
    Box(Modifier.size(size).background(parseColor(color), CircleShape).border(1.dp, Color(0x66FFFFFF), CircleShape))
}

/** Each suspension's time left, in the card's colour, soonest first: "A10 1:47". */
@Composable
private fun SuspensionChips(m: MatchRecord, suspensions: List<Suspension>) {
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterHorizontally),
        verticalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
    ) {
        suspensions.sortedBy { it.remainingMs }.forEach { s ->
            val side = if (s.team == Side.HOME) "H" else "A"
            Text(
                "$side${s.player ?: ""} ${formatClock(s.remainingMs)}",
                color = Color.Black,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                style = TABULAR,
                modifier = Modifier
                    .background(if (s.color == CardColor.GREEN) CARD_GREEN else CARD_YELLOW, RoundedCornerShape(6.dp))
                    .padding(horizontal = 6.dp, vertical = 1.dp),
            )
        }
    }
}

// ---- Cards -------------------------------------------------------------------

@Composable
private fun CardsPage(m: MatchRecord, now: Moment, controller: MatchController, onCard: () -> Unit) {
    val undo by controller.undoOffer.collectAsStateWithLifecycle()
    val playing = m.clock.phase == Phase.PLAYING
    val suspensions = m.suspensions(now)
    val suspended = suspensions.map { it.cardSeq }.toSet()
    // Everything else: red cards, and suspensions that are over.
    val earlier = m.activeEvents().filterIsInstance<Card>().filter { it.seq !in suspended }.reversed()
    val teams = m.document.teams
    val reasons = m.activeEvents().filterIsInstance<Card>().associate { it.seq to it.reason?.let(CARD_REASON_LABELS::getValue) }
    ListScreen(title = null, fromTop = true) {
        item {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                PageTitle("Cards")
                Button(
                    onClick = onCard,
                    enabled = playing,
                    shape = CircleShape,
                    colors = ButtonDefaults.buttonColors(containerColor = BRAND, contentColor = Color.White),
                    modifier = Modifier.size(52.dp),
                ) { Text("+", fontSize = 28.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) }
            }
        }
        if (!playing && m.clock.phase != Phase.BREAK) item { Hint("Cards can be given while a period is on.") }
        undoItem(undo, now, controller)
        if (suspensions.isEmpty()) item { Hint("No one is suspended.") }
        suspensions.sortedBy { it.remainingMs }.forEach { s ->
            item {
                val paused = !(playing && m.clock.running)
                CardRow(
                    color = if (s.color == CardColor.GREEN) CARD_GREEN else CARD_YELLOW,
                    title = teams[s.team].name + (s.player?.let { " #$it" } ?: ""),
                    detail = formatClock(s.remainingMs) + if (paused) " · paused" else " left",
                    reason = reasons[s.cardSeq],
                )
            }
        }
        if (earlier.isNotEmpty()) {
            item { Text("Earlier", fontSize = 12.sp, color = MUTED, modifier = Modifier.padding(top = 6.dp)) }
            earlier.forEach { c ->
                item {
                    CardRow(
                        color = when (c.color) { CardColor.GREEN -> CARD_GREEN; CardColor.YELLOW -> CARD_YELLOW; CardColor.RED -> CARD_RED },
                        title = teams[c.team].name + (c.player?.let { " #$it" } ?: ""),
                        detail = "${periodName(c.period, m.settings.periods)} ${formatClock(c.clockMs)}" + if (c.color == CardColor.RED) " · sent off" else " · served",
                        reason = c.reason?.let(CARD_REASON_LABELS::getValue),
                        dim = c.color != CardColor.RED,
                    )
                }
            }
        }
    }
}

@Composable
private fun CardRow(color: Color, title: String, detail: String, reason: String? = null, dim: Boolean = false) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().background(SURFACE, RoundedCornerShape(16.dp)).padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        // A card shape: taller than wide.
        Box(Modifier.width(12.dp).height(16.dp).background(if (dim) color.copy(alpha = 0.5f) else color, RoundedCornerShape(2.dp)))
        Spacer(Modifier.width(10.dp))
        Column {
            Text(title, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, color = if (dim) MUTED else Color.White)
            Text(detail, fontSize = 12.sp, color = MUTED, style = TABULAR)
            if (reason != null) Text(reason, fontSize = 12.sp, color = MUTED, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

// ---- Goals -------------------------------------------------------------------

@Composable
private fun GoalsPage(m: MatchRecord, now: Moment, controller: MatchController, onGoal: (Side) -> Unit, onStroke: () -> Unit) {
    val undo by controller.undoOffer.collectAsStateWithLifecycle()
    val playing = m.clock.phase == Phase.PLAYING
    val teams = m.document.teams
    val pcs = m.penaltyCorners()
    ListScreen(title = null, fromTop = true) {
        item { PageTitle("Goals") }
        item { MiniScore(m, fontSize = 34) }
        item {
            Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp)) {
                Text(teams.home.name, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Spacer(Modifier.width(8.dp))
                Text(teams.away.name, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.End, modifier = Modifier.weight(1f))
            }
        }
        if (!playing) item { Hint("Goals and corners can be recorded while a period is on.") }
        undoItem(undo, now, controller)
        item {
            ButtonPair(
                { mod -> TeamActionButton(teams.home.color, "+1", mod, playing, big = true) { onGoal(Side.HOME) } },
                { mod -> TeamActionButton(teams.away.color, "+1", mod, playing, big = true) { onGoal(Side.AWAY) } },
            )
        }
        item {
            ButtonPair(
                { mod -> CornerButton(teams.home.color, pcs.home, mod, playing) { controller.perform("corner") { penaltyCorner(Side.HOME, it) } } },
                { mod -> CornerButton(teams.away.color, pcs.away, mod, playing) { controller.perform("corner") { penaltyCorner(Side.AWAY, it) } } },
            )
        }
        item {
            Button(
                onClick = onStroke,
                enabled = playing,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.filledTonalButtonColors(),
                label = { Text("Penalty stroke", modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center) },
            )
        }
    }
}

@Composable
private fun TeamActionButton(color: String, label: String, modifier: Modifier, enabled: Boolean, big: Boolean, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(if (big) 56.dp else 44.dp),
        colors = ButtonDefaults.buttonColors(containerColor = parseColor(color), contentColor = onColor(color)),
    ) { Text(label, fontSize = if (big) 22.sp else 14.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) }
}

/** A penalty corner for one team: outlined in its colour, with the count so far. */
@Composable
private fun CornerButton(color: String, count: Int, modifier: Modifier, enabled: Boolean, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(44.dp),
        colors = ButtonDefaults.outlinedButtonColors(),
        border = BorderStroke(2.dp, if (enabled) parseColor(color) else parseColor(color).copy(alpha = 0.4f)),
    ) { Text("PC · $count", fontSize = 14.sp, style = TABULAR, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) }
}

// ---- Sync --------------------------------------------------------------------

@Composable
private fun SyncPage(services: Services) {
    var phones by remember { mutableStateOf<List<String>?>(null) }
    var pending by remember { mutableIntStateOf(0) }
    var sent by remember { mutableStateOf<Int?>(null) }
    val scope = rememberCoroutineScope()
    // The phone comes and goes as the umpire moves about, so keep checking.
    LaunchedEffect(Unit) {
        while (true) {
            phones = services.sync.connectedPhones()
            pending = runCatching { services.db.matches().pending().size }.getOrDefault(0)
            delay(10_000)
        }
    }
    ListScreen(title = null, fromTop = true) {
        item { PageTitle("Phone") }
        item {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center, modifier = Modifier.fillMaxWidth()) {
                val connected = !phones.isNullOrEmpty()
                Box(Modifier.size(10.dp).background(if (phones == null) MUTED else if (connected) CARD_GREEN else CARD_RED, CircleShape))
                Spacer(Modifier.width(8.dp))
                Text(
                    when {
                        phones == null -> "Looking…"
                        phones!!.isEmpty() -> "No phone in reach"
                        else -> phones!!.joinToString()
                    },
                    fontSize = 15.sp,
                    maxLines = 2,
                )
            }
        }
        item { Hint("The match goes to your phone when it ends, or later by itself if the phone is out of reach.") }
        if (pending > 0) {
            item { Hint("$pending earlier ${if (pending == 1) "match" else "matches"} still to send.") }
            item {
                ChoiceButton("Send them now", sent?.let { "$it sent" }) {
                    scope.launch { sent = runCatching { services.sync.resendPending() }.getOrDefault(0) }
                }
            }
        }
    }
}

// ---- Settings ----------------------------------------------------------------

@Composable
private fun SettingsPage(
    m: MatchRecord,
    now: Moment,
    countDown: Boolean,
    onCountDown: (Boolean) -> Unit,
    onEvents: () -> Unit,
    controller: MatchController,
    onConfirm: (Pair<String, () -> Unit>) -> Unit,
) {
    val s = m.settings
    val period = periodName(m.clock.period, s.periods)
    ListScreen(title = null, fromTop = true) {
        item { PageTitle("Match") }
        item {
            Hint(
                "${s.periods} × ${s.periodLengthSec / 60} min · " +
                    "${m.document.teams.home.name} v ${m.document.teams.away.name}",
            )
        }
        item {
            SwitchButton(
                checked = countDown,
                onCheckedChange = onCountDown,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Clock counts down") },
            )
        }
        item { ChoiceButton("Events", "Everything so far; cancel mistakes") { onEvents() } }
        when (m.clock.phase) {
            Phase.READY -> item { ChoiceButton("Cancel match") { onConfirm("Cancel this match? Nothing is kept." to { controller.discard() }) } }
            Phase.PLAYING -> if (!m.isTimeUp(now)) item { ChoiceButton("End $period early") { onConfirm("End $period now?" to { controller.perform { endPeriod(it) } }) } }
            else -> {}
        }
        if (m.clock.phase == Phase.PLAYING || m.clock.phase == Phase.BREAK) {
            item { ChoiceButton("End match") { onConfirm("End the match now?" to { controller.perform { endMatch(it) } }) } }
        }
    }
}

// ---- Shared ------------------------------------------------------------------

@Composable
private fun PageTitle(text: String) {
    Text(text, fontSize = 13.sp, color = MUTED, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
}

@Composable
private fun Hint(text: String) {
    Text(text, fontSize = 12.sp, color = MUTED, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp))
}

@Composable
private fun PillButton(label: String, color: Color, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().height(52.dp),
        colors = ButtonDefaults.buttonColors(containerColor = color, contentColor = Color.White),
    ) { Text(label, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) }
}

@Composable
private fun SmallButton(label: String, modifier: Modifier, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = modifier.height(40.dp),
        colors = ButtonDefaults.filledTonalButtonColors(),
    ) { Text(label, fontSize = 13.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) }
}

/** For a few seconds after a goal, card or corner, a way to take it back. */
private fun ScalingLazyListScope.undoItem(offer: com.fhmatchcentre.watch.match.UndoOffer?, now: Moment, controller: MatchController) {
    if (offer == null || now.elapsedMs >= offer.untilElapsedMs) return
    item {
        Button(
            onClick = { controller.undo(offer) },
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.outlinedButtonColors(),
            border = ButtonDefaults.outlinedButtonBorder(enabled = true),
            label = { Text("Undo ${offer.label}") },
            secondaryLabel = { Text("${(offer.untilElapsedMs - now.elapsedMs + 999) / 1000} s") },
        )
    }
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
