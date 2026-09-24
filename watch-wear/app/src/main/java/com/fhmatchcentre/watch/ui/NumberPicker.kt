package com.fhmatchcentre.watch.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.Picker
import androidx.wear.compose.material3.Text
import androidx.wear.compose.material3.rememberPickerState

/**
 * Picks a number with the crown/bezel or a swipe. `optional` adds a button for
 * "no number", e.g. a goal whose scorer the umpire didn't see.
 */
@Composable
fun NumberPicker(
    title: String,
    range: IntRange,
    initial: Int,
    optional: Boolean,
    format: (Int) -> String = { it.toString() },
    onPicked: (Int?) -> Unit,
) {
    val state = rememberPickerState(initialNumberOfOptions = range.count(), initiallySelectedIndex = (initial - range.first).coerceIn(0, range.count() - 1))
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    Box(Modifier.fillMaxSize().padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, fontSize = 13.sp)
            Picker(
                state = state,
                contentDescription = { "$title: ${format(range.first + state.selectedOptionIndex)}" },
                modifier = Modifier.height(96.dp).fillMaxWidth().focusRequester(focus),
            ) { index ->
                Text(format(range.first + index), fontSize = 34.sp)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (optional) {
                    Button(onClick = { onPicked(null) }, colors = ButtonDefaults.filledTonalButtonColors()) { Text("None") }
                }
                Button(onClick = { onPicked(range.first + state.selectedOptionIndex) }) { Text("OK") }
            }
        }
    }
}
