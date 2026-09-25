package com.fhmatchcentre.watch.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material3.Text

private val KEY = Color(0xFF262626)
private val KEY_OK = Color(0xFF106C3E)
private val MUTED = Color(0xFFB5B5B5)

/**
 * Types a number on a keypad: shirt numbers, and the numbers in match setup.
 *
 * `initial` fills it in to start with; the first key typed replaces it. With
 * `optional`, the bottom-left key offers "None" while nothing is typed, e.g. for a
 * goal whose scorer the umpire didn't see. ✓ works once the number is in `range`.
 */
@Composable
fun NumberPad(title: String, range: IntRange, initial: Int?, optional: Boolean, onPicked: (Int?) -> Unit) {
    var text by rememberSaveable { mutableStateOf(initial?.toString() ?: "") }
    // True until the first key: typing then replaces the starting value rather than adding to it.
    var fresh by rememberSaveable { mutableStateOf(initial != null) }
    val maxDigits = range.last.toString().length
    val value = text.toIntOrNull()
    val valid = value != null && value in range
    val haptics = LocalHapticFeedback.current

    fun type(digit: Char) {
        haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        text = if (fresh) digit.toString() else (text + digit).take(maxDigits).trimStart('0').ifEmpty { "0" }
        fresh = false
    }

    BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        // Round keys sized from the screen, so the corner keys stay inside a round face.
        val key = minOf(maxWidth, maxHeight) * 0.16f
        val gap = key * 0.35f
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.height(key * 0.8f).widthIn(max = key * 4.5f),
            ) {
                Text(title, fontSize = 13.sp, color = MUTED, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                Text(
                    text.ifEmpty { "–" },
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (fresh) MUTED else Color.White,
                    style = TextStyle(fontFeatureSettings = "tnum"),
                )
            }
            for (row in listOf("123", "456", "789")) {
                Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                    row.forEach { d -> Key(d.toString(), key) { type(d) } }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                if (optional && (text.isEmpty() || fresh)) {
                    Key("None", key, fontSize = 11.sp) { onPicked(null) }
                } else {
                    Key("⌫", key, enabled = text.isNotEmpty(), description = "Delete") {
                        text = if (fresh) "" else text.dropLast(1)
                        fresh = false
                    }
                }
                Key("0", key) { type('0') }
                Key("✓", key, color = KEY_OK, enabled = valid, description = "Done") { onPicked(value) }
            }
        }
    }
}

@Composable
private fun Key(
    label: String,
    size: Dp,
    color: Color = KEY,
    enabled: Boolean = true,
    fontSize: androidx.compose.ui.unit.TextUnit = 20.sp,
    description: String = label,
    onClick: () -> Unit,
) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(if (enabled) color else color.copy(alpha = 0.35f))
            .clickable(enabled = enabled, onClick = onClick)
            .semantics { contentDescription = description },
    ) {
        Text(label, fontSize = fontSize, fontWeight = FontWeight.Medium, color = if (enabled) Color.White else MUTED)
    }
}
