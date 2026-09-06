package com.example.smart_health_android.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import com.example.smart_health_android.ui.foundation.ShcareThemeMode

private val ShcareLightColorScheme = lightColorScheme(
    primary = Color(0xFF0B5C9A),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE4F1FA),
    onPrimaryContainer = Color(0xFF073F6B),
    inversePrimary = Color(0xFF7CC7F2),
    secondary = Color(0xFF008C7D),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFD8F5F0),
    onSecondaryContainer = Color(0xFF00584F),
    tertiary = Color(0xFF187857),
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFD9F5E8),
    onTertiaryContainer = Color(0xFF07543A),
    background = Color.White,
    onBackground = Color(0xFF1A202C),
    surface = Color.White,
    onSurface = Color(0xFF1A202C),
    surfaceVariant = Color(0xFFEDF2F7),
    onSurfaceVariant = Color(0xFF64748B),
    inverseSurface = Color(0xFF1A202C),
    inverseOnSurface = Color(0xFFF5F7FA),
    error = Color(0xFFDC3545),
    onError = Color.White,
    errorContainer = Color(0xFFFFE7EA),
    onErrorContainer = Color(0xFF8F1726),
    outline = Color(0xFF64748B),
    outlineVariant = Color(0xFFE2E8F0),
    scrim = Color.Black,
)

private val ShcareDarkColorScheme = darkColorScheme(
    primary = Color(0xFF0EA5E9),
    onPrimary = Color(0xFF001F2E),
    primaryContainer = Color(0xFF0B4564),
    onPrimaryContainer = Color(0xFFC9ECFF),
    inversePrimary = Color(0xFF0B5C9A),
    secondary = Color(0xFF3DD8C7),
    onSecondary = Color(0xFF003731),
    secondaryContainer = Color(0xFF005047),
    onSecondaryContainer = Color(0xFF9FF2E8),
    tertiary = Color(0xFF68D5A8),
    onTertiary = Color(0xFF003825),
    tertiaryContainer = Color(0xFF07543A),
    onTertiaryContainer = Color(0xFFB5F2D5),
    background = Color(0xFF0F1419),
    onBackground = Color(0xFFE2E8F0),
    surface = Color(0xFF1A202C),
    onSurface = Color(0xFFE2E8F0),
    surfaceVariant = Color(0xFF263244),
    onSurfaceVariant = Color(0xFFB8C4D4),
    inverseSurface = Color(0xFFE2E8F0),
    inverseOnSurface = Color(0xFF1A202C),
    error = Color(0xFFFFB3BA),
    onError = Color(0xFF68000B),
    errorContainer = Color(0xFF761424),
    onErrorContainer = Color(0xFFFFD9DD),
    outline = Color(0xFF94A3B8),
    outlineVariant = Color(0xFF334155),
    scrim = Color.Black,
)

@Composable
fun ShcareMobileTheme(
    mode: ShcareThemeMode = ShcareThemeMode.System,
    useDynamicColor: Boolean = false,
    content: @Composable () -> Unit,
) {
    val systemInDarkTheme = isSystemInDarkTheme()
    val isDarkTheme = mode.resolveDarkTheme(systemInDarkTheme)
    val context = LocalContext.current
    val colorScheme = when {
        useDynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && isDarkTheme -> {
            dynamicDarkColorScheme(context)
        }
        useDynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            dynamicLightColorScheme(context)
        }
        isDarkTheme -> ShcareDarkColorScheme
        else -> ShcareLightColorScheme
    }
    val semanticColors = if (isDarkTheme) ShcareDarkSemanticColors else ShcareLightSemanticColors
    val view = LocalView.current

    if (!view.isInEditMode) {
        SideEffect {
            val activity = view.context as? Activity ?: return@SideEffect
            WindowCompat.getInsetsController(activity.window, view).apply {
                isAppearanceLightStatusBars = !isDarkTheme
                isAppearanceLightNavigationBars = !isDarkTheme
            }
        }
    }

    CompositionLocalProvider(
        LocalShcareSemanticColors provides semanticColors,
        LocalShcareSpacing provides DefaultShcareSpacing,
        LocalShcareMotion provides DefaultShcareMotion,
    ) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = ShcareTypography,
            shapes = ShcareShapes,
            content = content,
        )
    }
}

// Existing screens keep this wrapper until their incremental migration to semantic roles.
@Composable
fun SmarthealthandroidTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit,
) {
    ShcareMobileTheme(
        mode = if (darkTheme) ShcareThemeMode.Dark else ShcareThemeMode.Light,
        useDynamicColor = dynamicColor,
        content = content,
    )
}
