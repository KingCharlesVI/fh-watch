package com.fhmatchcentre.watch.ui

import android.app.RemoteInput
import android.content.Intent
import android.net.Uri
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material3.SwitchButton
import androidx.wear.compose.material3.Text
import androidx.wear.input.RemoteInputIntentHelper
import androidx.wear.input.wearableExtender
import androidx.wear.remote.interactions.RemoteActivityHelper
import com.google.android.gms.wearable.Wearable
import com.fhmatchcentre.watch.sync.WatchSync
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import java.util.concurrent.Executors
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
fun HomeScreen(services: Services, onNewMatch: () -> Unit, onPhoneSetup: () -> Unit, onResume: () -> Unit, onMatches: () -> Unit, onSettings: () -> Unit) {
    val active by services.controller.active.collectAsState()
    ListScreen("FH Match Centre") {
        if (active != null) item { ChoiceButton("Back to match", color = Color(0xFF106C3E)) { onResume() } }
        else {
            item { ChoiceButton("New match", color = Color(0xFF106C3E)) { onNewMatch() } }
            item { ChoiceButton("Setup on phone", "Type teams and format there") { onPhoneSetup() } }
        }
        item { ChoiceButton("Past matches") { onMatches() } }
        item { ChoiceButton("Settings") { onSettings() } }
    }
}

/**
 * Setup on phone: opens the phone app's setup screen, then waits for the setup it
 * sends. When it arrives, the watch's setup screen opens with it, to check and start.
 */
@Composable
fun PhoneSetupScreen(services: Services, onReceived: () -> Unit, onSetUpHere: () -> Unit) {
    val context = LocalContext.current
    var status by remember { mutableStateOf(PhoneSetupStatus.OPENING) }
    var attempt by remember { mutableStateOf(0) }

    LaunchedEffect(Unit) {
        // Only a setup that arrives from now on: clear one left over from before.
        services.phoneSetup.value = null
        services.phoneSetup.filterNotNull().first()
        services.phoneSetup.value = null
        onReceived()
    }
    LaunchedEffect(attempt) {
        status = PhoneSetupStatus.OPENING
        status = openOnPhone(context, services)
    }

    ListScreen("Setup on phone") {
        item {
            Text(
                when (status) {
                    PhoneSetupStatus.OPENING -> "Opening the app on your phone…"
                    PhoneSetupStatus.OPENED -> "Fill in the match on your phone, then tap Send to watch. It opens here to check and start."
                    PhoneSetupStatus.NO_PHONE -> "No phone in reach. Check Bluetooth, or set up on the watch."
                    PhoneSetupStatus.FAILED -> "Couldn't open the app on your phone. Open FH Match Centre there: Settings → Set up a match."
                },
                fontSize = 14.sp,
                textAlign = TextAlign.Center,
            )
        }
        if (status == PhoneSetupStatus.NO_PHONE || status == PhoneSetupStatus.FAILED) {
            item { ChoiceButton("Try again") { attempt++ } }
        }
        item { ChoiceButton("Set up here instead") { onSetUpHere() } }
    }
}

private enum class PhoneSetupStatus { OPENING, OPENED, NO_PHONE, FAILED }

/** Opens the phone app's setup screen on each phone in reach. */
private suspend fun openOnPhone(context: android.content.Context, services: Services): PhoneSetupStatus {
    val phones = runCatching { Wearable.getNodeClient(context).connectedNodes.await() }.getOrDefault(emptyList())
    if (phones.isEmpty()) return PhoneSetupStatus.NO_PHONE
    val helper = RemoteActivityHelper(context, Executors.newSingleThreadExecutor())
    val intent = Intent(Intent.ACTION_VIEW)
        .addCategory(Intent.CATEGORY_BROWSABLE)
        .setData(Uri.parse(WatchSync.PHONE_SETUP_URI))
    val opened = withContext(Dispatchers.IO) {
        phones.count { node -> runCatching { helper.startRemoteActivity(intent, node.id).get() }.isSuccess }
    }
    return if (opened > 0) PhoneSetupStatus.OPENED else PhoneSetupStatus.FAILED
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

private enum class Editing { PERIODS, LENGTH, BREAK, HALF_TIME, HOME_CAPTAIN, AWAY_CAPTAIN, HOME_COLOUR, AWAY_COLOUR }

/** Match setup, starting from the last match's choices. */
@Composable
fun SetupScreen(services: Services, onStarted: () -> Unit) {
    var setup by remember { mutableStateOf(services.prefs.lastSetup) }
    var editing by rememberSaveable { mutableStateOf<Editing?>(null) }
    // Kept out here so the list is where it was after a number or colour is picked.
    val listState = rememberScalingLazyListState(initialCenterItemIndex = 1)
    val scope = rememberCoroutineScope()
    val homeName = rememberTextInput("Home team") { setup = setup.copy(homeName = it.take(80)) }
    val awayName = rememberTextInput("Away team") { setup = setup.copy(awayName = it.take(80)) }
    val venue = rememberTextInput("Venue") { setup = setup.copy(venue = it.take(120)) }

    editing?.let { field ->
        val done = { editing = null }
        when (field) {
            Editing.PERIODS -> NumberPad("Periods", 1..8, setup.periods, false) { setup = setup.copy(periods = it!!); done() }
            Editing.LENGTH -> NumberPad("Minutes", 1..90, setup.periodMinutes, false) { setup = setup.copy(periodMinutes = it!!); done() }
            Editing.BREAK -> NumberPad("Break", 0..30, setup.breakMinutes, false) { setup = setup.copy(breakMinutes = it!!); done() }
            Editing.HALF_TIME -> NumberPad("Half-time", 0..30, setup.halfTimeMinutes, false) { setup = setup.copy(halfTimeMinutes = it!!); done() }
            Editing.HOME_CAPTAIN -> NumberPad("Captain", 0..99, setup.homeCaptain, true) { setup = setup.copy(homeCaptain = it); done() }
            Editing.AWAY_CAPTAIN -> NumberPad("Captain", 0..99, setup.awayCaptain, true) { setup = setup.copy(awayCaptain = it); done() }
            Editing.HOME_COLOUR -> ColourPalette("Home colour", setup.homeColor) { setup = setup.copy(homeColor = it); done() }
            Editing.AWAY_COLOUR -> ColourPalette("Away colour", setup.awayColor) { setup = setup.copy(awayColor = it); done() }
        }
        return
    }

    val preset = Setup.PRESETS.firstOrNull {
        it.periods == setup.periods && it.minutes == setup.periodMinutes && it.breakMinutes == setup.breakMinutes && it.halfTimeMinutes == setup.halfTimeMinutes
    }

    ListScreen("New match", state = listState) {
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
        item { ChoiceButton("Home colour", COLOUR_NAMES[setup.homeColor], color = parseColor(setup.homeColor)) { editing = Editing.HOME_COLOUR } }
        item { ChoiceButton("Home captain", setup.homeCaptain?.let { "#$it" } ?: "None") { editing = Editing.HOME_CAPTAIN } }
        item { TeamButton(Team(setup.awayName, null, setup.awayColor), secondary = "Away · tap to rename") { awayName() } }
        item { ChoiceButton("Away colour", COLOUR_NAMES[setup.awayColor], color = parseColor(setup.awayColor)) { editing = Editing.AWAY_COLOUR } }
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
            ChoiceButton("Ready", color = Color(0xFF106C3E)) {
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
        item { ChoiceButton("Done", color = Color(0xFF106C3E)) { onDone() } }
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
