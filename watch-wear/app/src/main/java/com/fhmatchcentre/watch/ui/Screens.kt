package com.fhmatchcentre.watch.ui

import android.app.RemoteInput
import android.content.Intent
import android.view.inputmethod.EditorInfo
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material3.SwitchButton
import androidx.wear.compose.material3.Text
import androidx.wear.input.RemoteInputIntentHelper
import androidx.wear.input.wearableExtender
import com.fhmatchcentre.watch.Services
import com.fhmatchcentre.watch.data.MatchRow
import com.fhmatchcentre.watch.data.Setup
import com.fhmatchcentre.watch.data.SyncState
import com.fhmatchcentre.watch.data.decode
import com.fhmatchcentre.watch.engine.CardColor
import com.fhmatchcentre.watch.engine.Team
import com.fhmatchcentre.watch.engine.Teams
import com.fhmatchcentre.watch.engine.activeEvents
import com.fhmatchcentre.watch.engine.penaltyCorners
import com.fhmatchcentre.watch.engine.score
import com.fhmatchcentre.watch.engine.shootout
import kotlinx.coroutines.launch
import java.text.DateFormat
import java.util.Date

@Composable
fun HomeScreen(services: Services, onNewMatch: () -> Unit, onResume: () -> Unit, onMatches: () -> Unit, onSettings: () -> Unit) {
    val active by services.controller.active.collectAsState()
    ListScreen("FH Match Centre") {
        if (active != null) item { ChoiceButton("Back to match", color = Color(0xFF1F6F43)) { onResume() } }
        else item { ChoiceButton("New match", color = Color(0xFF1F6F43)) { onNewMatch() } }
        item { ChoiceButton("Past matches") { onMatches() } }
        item { ChoiceButton("Settings") { onSettings() } }
    }
}

/** Opens the watch keyboard (or voice) for a line of text. */
@Composable
fun rememberTextInput(label: String, onText: (String) -> Unit): () -> Unit {
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val text = result.data?.let { RemoteInput.getResultsFromIntent(it)?.getCharSequence("text") }?.toString()?.trim()
        if (!text.isNullOrEmpty()) onText(text)
    }
    return {
        val input = RemoteInput.Builder("text").setLabel(label)
            .wearableExtender {
                setEmojisAllowed(false)
                setInputActionType(EditorInfo.IME_ACTION_DONE)
            }.build()
        val intent: Intent = RemoteInputIntentHelper.createActionRemoteInputIntent()
        RemoteInputIntentHelper.putRemoteInputsExtra(intent, listOf(input))
        launcher.launch(intent)
    }
}

private enum class Editing { PERIODS, LENGTH, BREAK, HALF_TIME, HOME_CAPTAIN, AWAY_CAPTAIN }

/** Match setup, starting from the last match's choices. */
@Composable
fun SetupScreen(services: Services, onStarted: () -> Unit) {
    var setup by remember { mutableStateOf(services.prefs.lastSetup) }
    var editing by rememberSaveable { mutableStateOf<Editing?>(null) }
    val scope = rememberCoroutineScope()
    val homeName = rememberTextInput("Home team") { setup = setup.copy(homeName = it.take(80)) }
    val awayName = rememberTextInput("Away team") { setup = setup.copy(awayName = it.take(80)) }
    val venue = rememberTextInput("Venue") { setup = setup.copy(venue = it.take(120)) }

    editing?.let { field ->
        val done = { editing = null }
        when (field) {
            Editing.PERIODS -> NumberPicker("Periods", 1..8, setup.periods, false) { setup = setup.copy(periods = it!!); done() }
            Editing.LENGTH -> NumberPicker("Minutes each", 1..90, setup.periodMinutes, false) { setup = setup.copy(periodMinutes = it!!); done() }
            Editing.BREAK -> NumberPicker("Break minutes", 0..30, setup.breakMinutes, false) { setup = setup.copy(breakMinutes = it!!); done() }
            Editing.HALF_TIME -> NumberPicker("Half-time minutes", 0..30, setup.halfTimeMinutes, false) { setup = setup.copy(halfTimeMinutes = it!!); done() }
            Editing.HOME_CAPTAIN -> NumberPicker("Home captain", 0..99, setup.homeCaptain ?: 1, true) { setup = setup.copy(homeCaptain = it); done() }
            Editing.AWAY_CAPTAIN -> NumberPicker("Away captain", 0..99, setup.awayCaptain ?: 1, true) { setup = setup.copy(awayCaptain = it); done() }
        }
        return
    }

    fun nextColor(current: String) = TEAM_COLOURS[(TEAM_COLOURS.indexOf(current) + 1).mod(TEAM_COLOURS.size)]
    val preset = Setup.PRESETS.firstOrNull {
        it.periods == setup.periods && it.minutes == setup.periodMinutes && it.breakMinutes == setup.breakMinutes && it.halfTimeMinutes == setup.halfTimeMinutes
    }

    ListScreen("New match") {
        item {
            ChoiceButton("Format", preset?.label ?: "Custom") {
                val i = Setup.PRESETS.indexOf(preset)
                val p = Setup.PRESETS[(i + 1) % Setup.PRESETS.size]
                setup = setup.copy(periods = p.periods, periodMinutes = p.minutes, breakMinutes = p.breakMinutes, halfTimeMinutes = p.halfTimeMinutes)
            }
        }
        item { ChoiceButton("Periods", "${setup.periods}") { editing = Editing.PERIODS } }
        item { ChoiceButton("Period length", "${setup.periodMinutes} min") { editing = Editing.LENGTH } }
        if (setup.periods > 1) {
            item { ChoiceButton(if (setup.hasHalfTime) "Other breaks" else "Breaks", "${setup.breakMinutes} min") { editing = Editing.BREAK } }
            if (setup.hasHalfTime) item { ChoiceButton("Half-time", "${setup.halfTimeMinutes} min") { editing = Editing.HALF_TIME } }
        }
        item { TeamButton(Team(setup.homeName, null, setup.homeColor), secondary = "Home · tap to rename") { homeName() } }
        item { ChoiceButton("Home colour", color = parseColor(setup.homeColor)) { setup = setup.copy(homeColor = nextColor(setup.homeColor)) } }
        item { ChoiceButton("Home captain", setup.homeCaptain?.let { "#$it" } ?: "None") { editing = Editing.HOME_CAPTAIN } }
        item { TeamButton(Team(setup.awayName, null, setup.awayColor), secondary = "Away · tap to rename") { awayName() } }
        item { ChoiceButton("Away colour", color = parseColor(setup.awayColor)) { setup = setup.copy(awayColor = nextColor(setup.awayColor)) } }
        item { ChoiceButton("Away captain", setup.awayCaptain?.let { "#$it" } ?: "None") { editing = Editing.AWAY_CAPTAIN } }
        item { ChoiceButton("Venue", setup.venue ?: "None") { venue() } }
        item {
            SwitchButton(
                checked = setup.shootoutIfDrawn,
                onCheckedChange = { setup = setup.copy(shootoutIfDrawn = it) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Shootout if drawn") },
            )
        }
        item {
            ChoiceButton("Ready", color = Color(0xFF1F6F43)) {
                services.prefs.lastSetup = setup
                val teams = Teams(
                    home = Team(setup.homeName, null, setup.homeColor, setup.homeCaptain),
                    away = Team(setup.awayName, null, setup.awayColor, setup.awayCaptain),
                )
                scope.launch {
                    services.controller.create(setup.settings(), teams, setup.venue)
                    onStarted()
                }
            }
        }
    }
}

@Composable
fun MatchesScreen(services: Services, onOpen: (String) -> Unit) {
    val rows by services.db.matches().observeFinished().collectAsState(initial = emptyList())
    ListScreen("Past matches") {
        if (rows.isEmpty()) item { Text("None yet") }
        rows.forEach { row -> item { ChoiceButton("${row.title} ${row.score}", "${dateOf(row)} · ${syncLabel(row.sync)}") { onOpen(row.id) } } }
    }
}

private fun dateOf(row: MatchRow) = DateFormat.getDateInstance(DateFormat.SHORT).format(Date(row.createdAt))

private fun syncLabel(sync: SyncState) = when (sync) {
    SyncState.SYNCED -> "On phone"
    else -> "Not synced"
}

/** A finished match: the result, and whether the phone has it yet. */
@Composable
fun SummaryScreen(services: Services, id: String, onDone: () -> Unit) {
    val row by services.db.matches().observe(id).collectAsState(initial = null)
    val scope = rememberCoroutineScope()
    var sending by remember { mutableStateOf(false) }
    val r = row ?: return
    val m = remember(r.record) { r.decode() }
    val t = m.document.teams
    val s = m.score()
    val pcs = m.penaltyCorners()
    val cards = m.activeEvents().filterIsInstance<com.fhmatchcentre.watch.engine.Card>()
    val so = m.shootout()
    ListScreen("Full time") {
        item { Text("${t.home.name} ${s.home} – ${s.away} ${t.away.name}", fontSize = 15.sp) }
        if (so.home.isNotEmpty()) item { Text("Shootout ${so.homeScore} – ${so.awayScore}", fontSize = 13.sp) }
        item { Text("PCs ${pcs.home} – ${pcs.away}", fontSize = 13.sp) }
        item {
            Text(
                "Cards: " + CardColor.entries.joinToString(", ") { c -> "${cards.count { it.color == c }} ${c.name.lowercase()}" },
                fontSize = 12.sp,
            )
        }
        item {
            Text(
                when (r.sync) {
                    SyncState.SYNCED -> "✓ On your phone"
                    else -> "Waiting for your phone. It sends by itself when the phone is in reach."
                },
                fontSize = 12.sp,
            )
        }
        if (r.sync != SyncState.SYNCED) {
            item {
                ChoiceButton(if (sending) "Sending…" else "Send to phone") {
                    sending = true
                    scope.launch {
                        runCatching { services.sync.send(m.document) }
                        sending = false
                    }
                }
            }
        }
        item { ChoiceButton("Done", color = Color(0xFF1F6F43)) { onDone() } }
    }
}

@Composable
fun SettingsScreen(services: Services) {
    var countDown by remember { mutableStateOf(services.prefs.clockCountsDown) }
    var phones by remember { mutableStateOf<List<String>?>(null) }
    var resent by remember { mutableStateOf<Int?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { phones = services.sync.connectedPhones() }
    ListScreen("Settings") {
        item {
            SwitchButton(
                checked = countDown,
                onCheckedChange = { countDown = it; services.prefs.clockCountsDown = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Clock counts down") },
            )
        }
        item {
            Text(
                when {
                    phones == null -> "Looking for your phone…"
                    phones!!.isEmpty() -> "No phone connected"
                    else -> "Connected to ${phones!!.joinToString()}"
                },
                fontSize = 12.sp,
            )
        }
        item {
            ChoiceButton("Resend all unsynced", resent?.let { "$it sent" }) {
                scope.launch { resent = runCatching { services.sync.resendPending() }.getOrDefault(0) }
            }
        }
    }
}
