package com.fhmatchcentre.watch.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.AutoCenteringParams
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.ScalingLazyListScope
import androidx.wear.compose.foundation.lazy.ScalingLazyListState
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.ListHeader
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.SwitchButton
import androidx.wear.compose.material3.Text
import com.fhmatchcentre.watch.engine.CardReason
import com.fhmatchcentre.watch.engine.Moment
import com.fhmatchcentre.watch.engine.Side
import com.fhmatchcentre.watch.engine.Team
import com.fhmatchcentre.watch.match.moment
import kotlinx.coroutines.delay

/** The Settings switch for the on-screen Start/Stop button (Prefs.clockButtonOnScreen). */
@Composable
fun ClockButtonSwitch(checked: Boolean, onChange: (Boolean) -> Unit) {
    SwitchButton(
        checked = checked,
        onCheckedChange = onChange,
        modifier = Modifier.fillMaxWidth(),
        label = { Text("Start/stop on screen") },
        secondaryLabel = { Text("For watches without a side button") },
    )
}

/** "Q2" with quarters, "H1" with halves, otherwise "P3". */
fun periodName(period: Int, periods: Int): String = when (periods) {
    4 -> "Q$period"
    2 -> "H$period"
    else -> "P$period"
}

fun formatClock(ms: Long): String {
    val totalSec = (maxOf(ms, 0) + 999) / 1000
    return "%d:%02d".format(totalSec / 60, totalSec % 60)
}

fun parseColor(hex: String): Color = Color(android.graphics.Color.parseColor(hex))

/** Black or white text, whichever reads better on the colour. */
fun onColor(hex: String): Color {
    val c = android.graphics.Color.parseColor(hex)
    val luminance = (0.299 * android.graphics.Color.red(c) + 0.587 * android.graphics.Color.green(c) + 0.114 * android.graphics.Color.blue(c)) / 255
    return if (luminance > 0.6) Color.Black else Color.White
}

/** Team colours: the primary colours, black and white, and a few more. The same palette as the phone app's team editor. */
val TEAM_COLOURS = listOf(
    "#DC2626", "#1D4ED8", "#FACC15",
    "#16A34A", "#EA580C", "#7C3AED", "#38BDF8",
    "#EC4899", "#111111", "#FFFFFF",
)

val COLOUR_NAMES = mapOf(
    "#DC2626" to "Red", "#1D4ED8" to "Blue", "#FACC15" to "Yellow",
    "#16A34A" to "Green", "#EA580C" to "Orange", "#7C3AED" to "Purple", "#38BDF8" to "Sky blue",
    "#EC4899" to "Pink", "#111111" to "Black", "#FFFFFF" to "White",
)

/** What each card reason is called: the same as CARD_REASONS in packages/shared/src/describe.ts. */
val CARD_REASON_LABELS = mapOf(
    CardReason.DANGER to "Danger",
    CardReason.BREAKDOWN to "Breakdown of play",
    CardReason.PHYSICAL to "Physical misconduct",
    CardReason.DISSENT to "Dissent",
    CardReason.OTHER to "Other",
)

val CARD_GREEN = Color(0xFF2E9E44)
val CARD_YELLOW = Color(0xFFF2C230)
val CARD_RED = Color(0xFFD93A2B)

/** The current [Moment], updated several times a second for running clocks. */
@Composable
fun rememberNow(intervalMs: Long = 200): Moment {
    val context = LocalContext.current
    var now by remember { mutableStateOf(moment(context)) }
    LaunchedEffect(intervalMs) {
        while (true) {
            delay(intervalMs)
            now = moment(context)
        }
    }
    return now
}

/**
 * A scrolling screen with a title, the standard layout for every list and choice.
 * [fromTop] lays it out from just under the time instead of centring it, for the match pages.
 */
@Composable
fun ListScreen(
    title: String?,
    fromTop: Boolean = false,
    state: ScalingLazyListState = rememberScalingLazyListState(initialCenterItemIndex = if (fromTop) 0 else 1),
    content: ScalingLazyListScope.() -> Unit,
) {
    ScreenScaffold(scrollState = state) { padding ->
        ScalingLazyColumn(
            state = state,
            contentPadding = padding,
            autoCentering = if (fromTop) null else AutoCenteringParams(itemIndex = 1),
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (title != null) item { ListHeader { Text(title, textAlign = TextAlign.Center) } }
            content()
        }
    }
}

/** A full-width button in a team's colours. */
@Composable
fun TeamButton(team: Team, label: String = team.name, secondary: String? = null, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        colors = ButtonDefaults.buttonColors(containerColor = parseColor(team.color), contentColor = onColor(team.color), secondaryContentColor = onColor(team.color)),
        label = { Text(label, maxLines = 1) },
        secondaryLabel = secondary?.let { { Text(it) } },
    )
}

@Composable
fun ChoiceButton(label: String, secondary: String? = null, color: Color? = null, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        colors = if (color != null) {
            ButtonDefaults.buttonColors(containerColor = color, contentColor = if (color.luminance() > 0.5f) Color.Black else Color.White, secondaryContentColor = if (color.luminance() > 0.5f) Color.Black else Color.White)
        } else {
            ButtonDefaults.filledTonalButtonColors()
        },
        label = { Text(label) },
        secondaryLabel = secondary?.let { { Text(it) } },
    )
}

/** Two buttons side by side, e.g. one per team. */
@Composable
fun ButtonPair(left: @Composable (Modifier) -> Unit, right: @Composable (Modifier) -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        left(Modifier.weight(1f))
        right(Modifier.weight(1f))
    }
}


fun Side.label(): String = if (this == Side.HOME) "Home" else "Away"
