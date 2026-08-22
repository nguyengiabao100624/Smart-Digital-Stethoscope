package com.example.smart_health_android.ui.screens

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.smart_health_android.security.BiometricLocalUnlockAvailability
import com.example.smart_health_android.security.BiometricLocalUnlockUiAction
import com.example.smart_health_android.security.BiometricLocalUnlockUiState
import com.example.smart_health_android.ui.foundation.ShcareThemeMode
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class BiometricLocalUnlockUiTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun settingsControlIsHiddenWhenStrongBiometricRuntimeIsUnavailable() {
        composeRule.setContent {
            ShcareMobileTheme {
                BiometricLocalUnlockCard(
                    state = state(
                        availability = BiometricLocalUnlockAvailability.NoneEnrolled,
                    ),
                    onAction = {},
                )
            }
        }

        composeRule.onNodeWithTag("security-biometric-local-unlock-card")
            .assertDoesNotExist()
    }

    @Test
    fun localUnlockCopyIsDistinctFromServerTwoFactorAndActionIsFortyEightDp() {
        val actions = mutableListOf<BiometricLocalUnlockUiAction>()
        composeRule.setContent {
            ShcareMobileTheme {
                BiometricLocalUnlockCard(
                    state = state(),
                    onAction = actions::add,
                )
            }
        }

        composeRule.onNodeWithText("Khóa ứng dụng bằng sinh trắc học")
            .assertIsDisplayed()
        composeRule.onNodeWithText(
            "Khóa riêng ứng dụng Shcare trên thiết bị này. " +
                "Tính năng này không thay thế xác thực hai bước của tài khoản.",
        ).assertIsDisplayed()
        composeRule.onNodeWithTag("security-biometric-local-unlock-action")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
            .performClick()
        composeRule.runOnIdle {
            assertEquals(listOf(BiometricLocalUnlockUiAction.EnableRequested), actions)
        }
    }

    @Test
    fun lockGateKeepsRecoveryActionsReachableAtTwoHundredPercentFontScale() {
        var unlocks = 0
        var signOuts = 0
        composeRule.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(
                LocalDensity provides Density(density.density, fontScale = 2f),
            ) {
                ShcareMobileTheme(mode = ShcareThemeMode.Dark) {
                    BiometricLocalUnlockGate(
                        state = state(configured = true, locked = true),
                        onUnlock = { unlocks += 1 },
                        onSignOut = { signOuts += 1 },
                    )
                }
            }
        }

        composeRule.onNodeWithTag("biometric-local-unlock-gate")
            .assertIsDisplayed()
        composeRule.onNodeWithTag("biometric-local-unlock-retry")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
            .performClick()
        composeRule.onNodeWithTag("biometric-local-unlock-sign-out")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
            .performClick()
        composeRule.runOnIdle {
            assertEquals(1, unlocks)
            assertEquals(1, signOuts)
        }
    }

    private fun state(
        availability: BiometricLocalUnlockAvailability =
            BiometricLocalUnlockAvailability.Available,
        configured: Boolean = false,
        locked: Boolean = false,
    ) = BiometricLocalUnlockUiState(
        availability = availability,
        configured = configured,
        locked = locked,
        hasBoundAuthority = true,
    )
}
