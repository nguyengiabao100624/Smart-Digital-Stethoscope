package com.example.smart_health_android.ui.foundation

import com.example.smart_health_android.ui.theme.ShcareMotionTokens
import com.example.smart_health_android.ui.theme.ShcareSpacingTokens
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ShcareMobileFoundationTest {
    @Test
    fun systemThemeFollowsSystemWhileExplicitModesOverrideIt() {
        assertTrue(ShcareThemeMode.System.resolveDarkTheme(systemInDarkTheme = true))
        assertFalse(ShcareThemeMode.System.resolveDarkTheme(systemInDarkTheme = false))
        assertFalse(ShcareThemeMode.Light.resolveDarkTheme(systemInDarkTheme = true))
        assertTrue(ShcareThemeMode.Dark.resolveDarkTheme(systemInDarkTheme = false))
    }

    @Test
    fun stateKindsExposeTheNativeActionUsersNeed() {
        assertEquals(ShcareStateAction.None, ShcareStateKind.Loading.defaultAction)
        assertEquals(ShcareStateAction.None, ShcareStateKind.Empty.defaultAction)
        assertEquals(ShcareStateAction.Retry, ShcareStateKind.Error.defaultAction)
        assertEquals(ShcareStateAction.Retry, ShcareStateKind.Offline.defaultAction)
        assertEquals(ShcareStateAction.RequestPermission, ShcareStateKind.Permission.defaultAction)
    }

    @Test
    fun motionTokensStayInsideTheNativeProductCadence() {
        val motion = ShcareMotionTokens()

        assertEquals(0, motion.reducedMillis)
        assertTrue(motion.quickMillis in 100..150)
        assertTrue(motion.standardMillis in 150..250)
        assertTrue(motion.emphasizedMillis in motion.standardMillis..250)
    }

    @Test
    fun spacingTokensUseAConsistentFourDpGrid() {
        val spacing = ShcareSpacingTokens()

        listOf(
            spacing.extraSmall,
            spacing.small,
            spacing.medium,
            spacing.large,
            spacing.extraLarge,
            spacing.doubleExtraLarge,
        ).forEach { value ->
            assertEquals(0f, value.value % 4f, 0f)
        }
    }
}
