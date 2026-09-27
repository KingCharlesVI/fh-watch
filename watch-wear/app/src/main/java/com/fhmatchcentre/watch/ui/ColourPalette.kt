package com.fhmatchcentre.watch.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material3.Text

/** Picks a team colour from [TEAM_COLOURS], laid out 3, 4, 3 to fit a round face. */
@Composable
fun ColourPalette(title: String, selected: String, onPick: (String) -> Unit) {
    val rows = listOf(TEAM_COLOURS.subList(0, 3), TEAM_COLOURS.subList(3, 7), TEAM_COLOURS.subList(7, 10))
    BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        val swatch = minOf(maxWidth, maxHeight) * 0.17f
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(swatch * 0.18f)) {
            Text(title, fontSize = 14.sp)
            rows.forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(swatch * 0.25f)) {
                    row.forEach { hex ->
                        val chosen = hex.equals(selected, ignoreCase = true)
                        Box(
                            contentAlignment = Alignment.Center,
                            modifier = Modifier
                                .size(swatch)
                                .clip(CircleShape)
                                .background(parseColor(hex))
                                // A ring shows black on the black screen; a thicker one marks the current colour.
                                .border(if (chosen) 3.dp else 1.dp, if (chosen) Color.White else Color(0x66FFFFFF), CircleShape)
                                .clickable { onPick(hex) }
                                .semantics { contentDescription = COLOUR_NAMES[hex] ?: hex },
                        ) {
                            if (chosen) Text("✓", fontSize = 16.sp, color = onColor(hex))
                        }
                    }
                }
            }
        }
    }
}
