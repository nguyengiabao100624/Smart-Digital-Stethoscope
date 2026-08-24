package com.example.smart_health_android.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

@Immutable
data class ShcareSemanticColors(
    val brandHeaderStart: Color,
    val brandHeaderEnd: Color,
    val onBrandHeader: Color,
    val success: Color,
    val onSuccess: Color,
    val successContainer: Color,
    val onSuccessContainer: Color,
    val warning: Color,
    val onWarning: Color,
    val warningContainer: Color,
    val onWarningContainer: Color,
    val info: Color,
    val onInfo: Color,
    val infoContainer: Color,
    val onInfoContainer: Color,
    val offline: Color,
    val onOffline: Color,
    val offlineContainer: Color,
    val onOfflineContainer: Color,
)

@Immutable
data class ShcareSpacingTokens(
    val extraSmall: Dp = 4.dp,
    val small: Dp = 8.dp,
    val medium: Dp = 12.dp,
    val large: Dp = 16.dp,
    val extraLarge: Dp = 24.dp,
    val doubleExtraLarge: Dp = 32.dp,
    val tripleExtraLarge: Dp = 48.dp,
)

@Immutable
data class ShcareMotionTokens(
    val reducedMillis: Int = 0,
    val quickMillis: Int = 150,
    val standardMillis: Int = 200,
    val emphasizedMillis: Int = 250,
)

val ShcareShapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(16.dp),
    extraLarge = RoundedCornerShape(24.dp),
)

internal val ShcareLightSemanticColors = ShcareSemanticColors(
    brandHeaderStart = Color(0xFF0B5C9A),
    brandHeaderEnd = Color(0xFF00A896),
    onBrandHeader = Color.White,
    success = Color(0xFF0B7A55),
    onSuccess = Color.White,
    successContainer = Color(0xFFD9F5E8),
    onSuccessContainer = Color(0xFF07543A),
    warning = Color(0xFF9A5B00),
    onWarning = Color.White,
    warningContainer = Color(0xFFFFEBC2),
    onWarningContainer = Color(0xFF704100),
    info = Color(0xFF0B5C9A),
    onInfo = Color.White,
    infoContainer = Color(0xFFE4F1FA),
    onInfoContainer = Color(0xFF073F6B),
    offline = Color(0xFF64748B),
    onOffline = Color.White,
    offlineContainer = Color(0xFFEDF2F7),
    onOfflineContainer = Color(0xFF475569),
)

internal val ShcareDarkSemanticColors = ShcareSemanticColors(
    brandHeaderStart = Color(0xFF0EA5E9),
    brandHeaderEnd = Color(0xFF00A896),
    onBrandHeader = Color.White,
    success = Color(0xFF8DD5A5),
    onSuccess = Color(0xFF00391D),
    successContainer = Color(0xFF07522D),
    onSuccessContainer = Color(0xFFA9F3C2),
    warning = Color(0xFFF6BE3C),
    onWarning = Color(0xFF3E2E00),
    warningContainer = Color(0xFF584400),
    onWarningContainer = Color(0xFFFFE087),
    info = Color(0xFF98CCFA),
    onInfo = Color(0xFF003352),
    infoContainer = Color(0xFF004B73),
    onInfoContainer = Color(0xFFD1E9FF),
    offline = Color(0xFFC6C6CA),
    onOffline = Color(0xFF303034),
    offlineContainer = Color(0xFF46464A),
    onOfflineContainer = Color(0xFFE2E2E6),
)

internal val DefaultShcareSpacing = ShcareSpacingTokens()
internal val DefaultShcareMotion = ShcareMotionTokens()

internal val LocalShcareSemanticColors = staticCompositionLocalOf { ShcareLightSemanticColors }
internal val LocalShcareSpacing = staticCompositionLocalOf { DefaultShcareSpacing }
internal val LocalShcareMotion = staticCompositionLocalOf { DefaultShcareMotion }

object ShcareTheme {
    val colors: ShcareSemanticColors
        @Composable
        @ReadOnlyComposable
        get() = LocalShcareSemanticColors.current

    val spacing: ShcareSpacingTokens
        @Composable
        @ReadOnlyComposable
        get() = LocalShcareSpacing.current

    val motion: ShcareMotionTokens
        @Composable
        @ReadOnlyComposable
        get() = LocalShcareMotion.current
}
