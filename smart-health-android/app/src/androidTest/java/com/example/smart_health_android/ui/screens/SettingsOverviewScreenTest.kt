package com.example.smart_health_android.ui.screens

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.material3.SnackbarHostState
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.smart_health_android.settings.SettingsAccountRole
import com.example.smart_health_android.settings.SettingsOverviewAccount
import com.example.smart_health_android.settings.SettingsOverviewError
import com.example.smart_health_android.settings.SettingsOverviewLoadState
import com.example.smart_health_android.settings.SettingsOverviewUiAction
import com.example.smart_health_android.settings.SettingsOverviewUiState
import com.example.smart_health_android.ui.foundation.ShcareThemeMode
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SettingsOverviewScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun readySettingsRemainReadableAtTwoHundredPercentFontScaleInDarkTheme() {
        setSettingsContent(
            state = readyState(),
            canManageFamilyProfiles = false,
            canAccessStethoscope = false,
            canViewAiCalibration = false,
            canViewDataStorage = false,
            fontScale = 2f,
            themeMode = ShcareThemeMode.Dark,
        )

        composeRule.onAllNodesWithTag("settings.profile")
            .assertCountEquals(1)
        composeRule.onAllNodesWithContentDescription(
            "Bác sĩ Nguyễn An. Vai trò Bác sĩ. Mã thành viên member-01. " +
                "Workspace Workspace Tim phổi.",
        ).assertCountEquals(1)
        composeRule.onNodeWithTag("settings.content")
            .performScrollToNode(hasTestTag("settings.item.profile"))
        composeRule.onNodeWithTag("settings.item.profile")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
        composeRule.onNodeWithTag("settings.content")
            .performScrollToNode(hasTestTag("settings.item.logout"))
        composeRule.onNodeWithTag("settings.item.logout")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
        composeRule.onNodeWithTag("settings.item.data_storage")
            .assertDoesNotExist()
    }

    @Test
    fun externallySuppliedTypedRouteGatesExposeAllFourAvailableEntries() {
        setSettingsContent(
            state = readyState(),
            canManageFamilyProfiles = true,
            canAccessStethoscope = true,
            canViewAiCalibration = true,
            canViewDataStorage = true,
        )

        composeRule.onNodeWithTag("settings.item.family")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
        composeRule.onNodeWithTag("settings.item.stethoscope")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
        composeRule.onNodeWithTag("settings.item.analysis")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
        composeRule.onNodeWithTag("settings.item.data_storage")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
    }

    @Test
    fun unavailableFeatureEntriesAndEmptyDeviceGroupStayHidden() {
        setSettingsContent(
            state = readyState(),
            canManageFamilyProfiles = false,
            canAccessStethoscope = false,
            canViewAiCalibration = false,
            canViewDataStorage = false,
        )

        composeRule.onNodeWithTag("settings.item.family").assertDoesNotExist()
        composeRule.onNodeWithTag("settings.item.stethoscope").assertDoesNotExist()
        composeRule.onNodeWithTag("settings.item.analysis").assertDoesNotExist()
        composeRule.onNodeWithTag("settings.item.data_storage").assertDoesNotExist()
        composeRule.onNodeWithTag("settings.group.device_analysis").assertDoesNotExist()
    }

    @Test
    fun logoutProgressDisablesTheActionAndKeepsStatusExplicit() {
        setSettingsContent(
            state = readyState().copy(isLoggingOut = true),
        )

        composeRule.onNodeWithTag("settings.content")
            .performScrollToNode(hasTestTag("settings.item.logout"))
        composeRule.onNodeWithTag("settings.item.logout")
            .assertIsDisplayed()
        composeRule.onNodeWithText("Đang đăng xuất…")
            .assertIsDisplayed()
    }

    @Test
    fun offlineStateExposesAnExplicitRetryAction() {
        val actions = mutableListOf<SettingsOverviewUiAction>()
        setSettingsContent(
            state = SettingsOverviewUiState(
                loadState = SettingsOverviewLoadState.Offline,
                error = SettingsOverviewError.Offline,
            ),
            onAction = actions::add,
        )

        composeRule.onNodeWithTag("settings.state.offline")
            .assertIsDisplayed()
        composeRule.onNodeWithText("Thử lại")
            .performClick()
        composeRule.runOnIdle {
            assertEquals(listOf(SettingsOverviewUiAction.Retry), actions)
        }
    }

    @Test
    fun forbiddenStateDoesNotRenderAccountActions() {
        setSettingsContent(
            state = SettingsOverviewUiState(
                loadState = SettingsOverviewLoadState.PermissionDenied,
                error = SettingsOverviewError.PermissionDenied,
                requestId = "request-settings-403",
            ),
        )

        composeRule.onNodeWithTag("settings.state.permission")
            .assertIsDisplayed()
        composeRule.onNodeWithTag("settings.item.profile")
            .assertDoesNotExist()
    }

    private fun setSettingsContent(
        state: SettingsOverviewUiState,
        canManageFamilyProfiles: Boolean = true,
        canAccessStethoscope: Boolean = true,
        canViewAiCalibration: Boolean = true,
        canViewDataStorage: Boolean = true,
        fontScale: Float = 1f,
        themeMode: ShcareThemeMode = ShcareThemeMode.Light,
        onAction: (SettingsOverviewUiAction) -> Unit = {},
    ) {
        composeRule.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(
                LocalDensity provides Density(density.density, fontScale = fontScale),
            ) {
                ShcareMobileTheme(mode = themeMode) {
                    SettingsOverviewContent(
                        state = state,
                        canManageFamilyProfiles = canManageFamilyProfiles,
                        canAccessStethoscope = canAccessStethoscope,
                        canViewAiCalibration = canViewAiCalibration,
                        canViewDataStorage = canViewDataStorage,
                        showBackNavigation = true,
                        snackbarHostState = remember { SnackbarHostState() },
                        onAction = onAction,
                        onNavigateBack = {},
                        onNavigateToProfile = {},
                        onNavigateToWorkspace = {},
                        onNavigateToFamilyProfiles = {},
                        onNavigateToPrivacy = {},
                        onNavigateToStethoscopeSettings = {},
                        onNavigateToAICalibration = {},
                        onNavigateToDataStorage = {},
                        onNavigateToNotificationSettings = {},
                    )
                }
            }
        }
    }

    private fun readyState() = SettingsOverviewUiState(
        loadState = SettingsOverviewLoadState.Ready,
        account = SettingsOverviewAccount(
            memberId = "member-01",
            displayName = "Bác sĩ Nguyễn An",
            role = SettingsAccountRole.Doctor,
            workspaceName = "Workspace Tim phổi",
            initials = "NA",
        ),
        hasLoaded = true,
    )
}
