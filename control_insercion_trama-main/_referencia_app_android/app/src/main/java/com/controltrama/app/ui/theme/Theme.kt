package com.controltrama.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Misma paleta que public/styles.css del frontend web — así la app móvil
// se ve como parte del mismo producto, no como algo aparte.
private val ColorTramaLight = lightColorScheme(
    primary = Color(0xFF7C2155),      // --rose
    onPrimary = Color(0xFFF5F0EB),    // --on-rose
    secondary = Color(0xFFA44F80),    // --rose-md
    background = Color(0xFFFAF5EC),   // --cream
    surface = Color(0xFFF9F6F0),      // --srf
    error = Color(0xFF8B1F1F)         // --red
)

// Equivalente al modo oscuro que ya existe en el CSS de la web.
private val ColorTramaDark = darkColorScheme(
    primary = Color(0xFFC47FAF),      // --acc (modo oscuro)
    onPrimary = Color(0xFF1F1B18),
    secondary = Color(0xFFA44F80),    // --acc-md
    background = Color(0xFF1F1B18),   // --bg (modo oscuro)
    surface = Color(0xFF2A2420),      // --srf (modo oscuro)
    error = Color(0xFF8B1F1F)
)

@Composable
fun ControlTramaTheme(
    useDarkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (useDarkTheme) ColorTramaDark else ColorTramaLight
    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
