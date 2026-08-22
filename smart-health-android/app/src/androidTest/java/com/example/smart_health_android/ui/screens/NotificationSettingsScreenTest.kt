package com.example.smart_health_android.ui.screens

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.smart_health_android.notifications.NotificationChannelAvailability
import com.example.smart_health_android.notifications.NotificationChannelAvailabilitySet
import com.example.smart_health_android.notifications.NotificationCloudPreferences
import com.example.smart_health_android.notifications.NotificationPreferenceField
import com.example.smart_health_android.notifications.NotificationPreferenceOwnership
import com.example.smart_health_android.notifications.NotificationPreferencesSnapshot
import com.example.smart_health_android.notifications.NotificationRuntimeReadiness
import com.example.smart_health_android.notifications.NotificationSettingsLoadState
import com.example.smart_health_android.notifications.NotificationSettingsRepository
import com.example.smart_health_android.notifications.NotificationSettingsViewModel
import com.example.smart_health_android.ui.foundation.ShcareThemeMode
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import java.io.IOException
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NotificationSettingsScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun readySettingsRemainReadableAndUsableInDarkThemeAtTwoHundredPercentFontScale() {
        val viewModel = NotificationSettingsViewModel(
            repository = StaticNotificationSettingsRepository(
                loadResult = Result.success(notificationSnapshot()),
            ),
            expectedUserId = "user-1",
            expectedWorkspaceId = "workspace-1",
            role = "patient",
        )

        composeRule.setContent {
            val hostDensity = LocalDensity.current
            CompositionLocalProvider(
                LocalDensity provides Density(hostDensity.density, fontScale = 2f),
            ) {
                ShcareMobileTheme(
                    mode = ShcareThemeMode.Dark,
                    useDynamicColor = false,
                ) {
                    NotificationSettingsScreen(
                        onNavigateBack = {},
                        expectedUserId = "user-1",
                        expectedWorkspaceId = "workspace-1",
                        role = "patient",
                        providedViewModel = viewModel,
                    )
                }
            }
        }

        composeRule.waitUntil(timeoutMillis = 5_000L) {
            viewModel.uiState.value.loadState == NotificationSettingsLoadState.Ready
        }
        composeRule.onNodeWithText("Tùy chọn thông báo").assertIsDisplayed()
        composeRule.onNodeWithText("Nhận thông báo")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
        composeRule.onNodeWithTag("notification-settings-list")
            .performScrollToNode(hasText("Mở cài đặt Android"))
        composeRule.onNodeWithText("Mở cài đặt Android")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
        composeRule.onNodeWithTag("notification-settings-list")
            .performScrollToNode(hasText("Đăng nhập mới"))
        composeRule.onNodeWithText("Đăng nhập mới")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
    }

    @Test
    fun offlineSettingsExposeAnExplicitFortyEightDpRetryState() {
        val viewModel = NotificationSettingsViewModel(
            repository = StaticNotificationSettingsRepository(
                loadResult = Result.failure(IOException("offline")),
            ),
            expectedUserId = "user-1",
            expectedWorkspaceId = "workspace-1",
            role = "patient",
        )

        composeRule.setContent {
            ShcareMobileTheme(
                mode = ShcareThemeMode.Light,
                useDynamicColor = false,
            ) {
                NotificationSettingsScreen(
                    onNavigateBack = {},
                    expectedUserId = "user-1",
                    expectedWorkspaceId = "workspace-1",
                    role = "patient",
                    providedViewModel = viewModel,
                )
            }
        }

        composeRule.waitUntil(timeoutMillis = 5_000L) {
            viewModel.uiState.value.loadState == NotificationSettingsLoadState.Offline
        }
        composeRule.onNodeWithText("Thử lại")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
    }
}

private class StaticNotificationSettingsRepository(
    private val loadResult: Result<NotificationPreferencesSnapshot?>,
) : NotificationSettingsRepository {
    override suspend fun load(
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationPreferencesSnapshot? = loadResult.getOrThrow()

    override suspend fun patch(
        field: NotificationPreferenceField,
        enabled: Boolean,
        idempotencyKey: String,
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationPreferencesSnapshot = error("Patch is not used by this render test")

    override fun runtimeReadiness(
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationRuntimeReadiness = NotificationRuntimeReadiness(
        firebaseConfigured = true,
        runtimePermissionGranted = true,
        appNotificationsEnabled = true,
        channelEnabled = true,
        encryptedSessionMatches = true,
    )
}

private fun notificationSnapshot() = NotificationPreferencesSnapshot(
    userId = "user-1",
    workspaceId = "workspace-1",
    ownership = NotificationPreferenceOwnership("self", "user-1"),
    preferences = NotificationCloudPreferences(
        enabled = true,
        doctorRequests = true,
        abnormalResults = true,
        deviceOffline = true,
        appointments = true,
        messages = true,
        aiUpdates = false,
        newLogin = true,
    ),
    channels = NotificationChannelAvailabilitySet(
        inApp = NotificationChannelAvailability(true, "ready", ""),
        email = NotificationChannelAvailability(false, "disabled", "PROVIDER_DISABLED"),
        push = NotificationChannelAvailability(true, "ready", ""),
    ),
    updatedAt = "2026-07-27T10:00:00.000Z",
)
