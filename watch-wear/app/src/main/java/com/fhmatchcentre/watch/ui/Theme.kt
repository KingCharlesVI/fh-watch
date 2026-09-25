package com.fhmatchcentre.watch.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.wear.compose.material3.ColorScheme
import androidx.wear.compose.material3.MaterialTheme

/**
 * The website's colours on a black watch screen: the brand green for main
 * actions and neutral greys for everything else, instead of Material's purple.
 */
private val WatchColors = ColorScheme(
    primary = Color(0xFF3FB27A),
    primaryDim = Color(0xFF2E9E66),
    primaryContainer = Color(0xFF106C3E),
    onPrimary = Color(0xFF002111),
    onPrimaryContainer = Color.White,
    secondary = Color(0xFFD4D4D4),
    secondaryDim = Color(0xFFA3A3A3),
    secondaryContainer = Color(0xFF404040),
    onSecondary = Color(0xFF171717),
    onSecondaryContainer = Color.White,
    tertiary = Color(0xFFF2C230),
    tertiaryDim = Color(0xFFD9AD2A),
    tertiaryContainer = Color(0xFF5C4A0F),
    onTertiary = Color.Black,
    onTertiaryContainer = Color.White,
    surfaceContainerLow = Color(0xFF171717),
    surfaceContainer = Color(0xFF262626),
    surfaceContainerHigh = Color(0xFF333333),
    onSurface = Color.White,
    onSurfaceVariant = Color(0xFFB5B5B5),
    outline = Color(0xFF737373),
    outlineVariant = Color(0xFF404040),
    background = Color.Black,
    onBackground = Color.White,
)

@Composable
fun WatchTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = WatchColors, content = content)
}
