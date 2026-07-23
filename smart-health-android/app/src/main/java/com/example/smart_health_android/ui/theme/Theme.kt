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
    primary = Color(0xFF0A5E91),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD1E9FF),
    onPrimaryContainer = Color(0xFF001D33),
    inversePrimary = Color(0xFF98CCFA),
    secondary = Color(0xFF006A60),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFF9CF2E3),
    onSecondaryContainer = Color(0xFF00201C),
    tertiary = Color(0xFF466348),
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFC8EAC7),
    onTertiaryContainer = Color(0xFF08200C),
    background = Color(0xFFF7F9FC),
    onBackground = Color(0xFF171C22),
    surface = Color(0xFFF7F9FC),
    onSurface = Color(0xFF171C22),
    surfaceVariant = Color(0xFFDCE3EA),
    onSurfaceVariant = Color(0xFF41484F),
    inverseSurface = Color(0xFF2C3137),
    inverseOnSurface = Color(0xFFEDF1F7),
    error = Color(0xFFBA1A1A),
    onError = Color.White,
    errorContainer = Color(0xFFFFDAD6),
    onErrorContainer = Color(0xFF410002),
    outline = Color(0xFF71787F),
    outlineVariant = Color(0xFFC1C7CE),
    scrim = Color.Black,
)

private val ShcareDarkColorScheme = darkColorScheme(
    primary = Color(0xFF98CCFA),
    onPrimary = Color(0xFF003352),
    primaryContainer = Color(0xFF004B73),
    onPrimaryContainer = Color(0xFFD1E9FF),
    inversePrimary = Color(0xFF0A5E91),
    secondary = Color(0xFF7AD5C6),
    onSecondary = Color(0xFF003730),
    secondaryContainer = Color(0xFF005047),
    onSecondaryContainer = Color(0xFF9CF2E3),
    tertiary = Color(0xFFACCFAA),
    onTertiary = Color(0xFF18361D),
    tertiaryContainer = Color(0xFF2F4D32),
    onTertiaryContainer = Color(0xFFC8EAC7),
    background = Color(0xFF0E141A),
    onBackground = Color(0xFFDDE3EA),
    surface = Color(0xFF0E141A),
    onSurface = Color(0xFFDDE3EA),
    surfaceVariant = Color(0xFF41484E),
    onSurfaceVariant = Color(0xFFC1C7CE),
    inverseSurface = Color(0xFFDDE3EA),
    inverseOnSurface = Color(0xFF2C3137),
    error = Color(0xFFFFB4AB),
    onError = Color(0xFF690005),
    errorContainer = Color(0xFF93000A),
    onErrorContainer = Color(0xFFFFDAD6),
    outline = Color(0xFF8B9198),
    outlineVariant = Color(0xFF41484E),
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
