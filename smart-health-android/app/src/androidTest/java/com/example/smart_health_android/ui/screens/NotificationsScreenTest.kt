package com.example.smart_health_android.ui.screens

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.smart_health_android.data.AppNotification
import com.example.smart_health_android.notifications.NotificationInboxLoadState
import com.example.smart_health_android.notifications.NotificationInboxMutationReceipt
import com.example.smart_health_android.notifications.NotificationInboxRepository
import com.example.smart_health_android.notifications.NotificationInboxSnapshot
import com.example.smart_health_android.notifications.NotificationInboxViewModel
import com.example.smart_health_android.ui.foundation.ShcareThemeMode
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import java.io.IOException
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NotificationsScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun readyInboxRemainsReadableAndConfirmableInDarkThemeAtTwoHundredPercentFontScale() {
        val viewModel = NotificationInboxViewModel(
            repository = StaticNotificationInboxRepository(
                loadResult = Result.success(notificationSnapshot()),
            ),
            expectedUserId = "user-1",
            expectedWorkspaceId = "workspace-1",
        )

        composeRule.setContent {
            val hostDensity = LocalDensity.current
            CompositionLocalProvider(
                LocalDensity provides Density(
                    density = hostDensity.density,
                    fontScale = 2f,
                ),
            ) {
                ShcareMobileTheme(
                    mode = ShcareThemeMode.Dark,
                    useDynamicColor = false,
                ) {
                    NotificationsScreen(
                        onNavigateBack = {},
                        expectedUserId = "user-1",
                        expectedWorkspaceId = "workspace-1",
                        providedViewModel = viewModel,
                    )
                }
            }
        }

        composeRule.waitUntil(timeoutMillis = 5_000L) {
            viewModel.uiState.value.loadState == NotificationInboxLoadState.Ready
        }
        composeRule.onNodeWithText("Thông báo").assertIsDisplayed()
        composeRule.onNodeWithTag("notification-inbox-list")
            .performScrollToNode(hasText("Đánh dấu đã đọc"))
        composeRule.onNodeWithText("Đánh dấu đã đọc")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
        composeRule.onNodeWithContentDescription(
            "Xóa thông báo Shcare update",
        )
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
            .performClick()
        composeRule.onNodeWithText("Xóa thông báo?").assertIsDisplayed()
        composeRule.onNodeWithText("Xóa")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
    }

    @Test
    fun offlineInboxExposesExplicitFortyEightDpRetryState() {
        val viewModel = NotificationInboxViewModel(
            repository = StaticNotificationInboxRepository(
                loadResult = Result.failure(IOException("offline")),
            ),
            expectedUserId = "user-1",
            expectedWorkspaceId = "workspace-1",
        )

        composeRule.setContent {
            ShcareMobileTheme(
                mode = ShcareThemeMode.Light,
                useDynamicColor = false,
            ) {
                NotificationsScreen(
                    onNavigateBack = {},
                    expectedUserId = "user-1",
                    expectedWorkspaceId = "workspace-1",
                    providedViewModel = viewModel,
                )
            }
        }

        composeRule.waitUntil(timeoutMillis = 5_000L) {
            viewModel.uiState.value.loadState == NotificationInboxLoadState.Offline
        }
        composeRule.onNodeWithText("Thử lại")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
    }
}

private class StaticNotificationInboxRepository(
    private val loadResult: Result<NotificationInboxSnapshot>,
) : NotificationInboxRepository {
    override suspend fun load(
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationInboxSnapshot = loadResult.getOrThrow()

    override suspend fun markRead(
        notificationId: String,
        idempotencyKey: String,
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationInboxMutationReceipt =
        error("Mutation is not used by this render test")

    override suspend fun markAllRead(
        idempotencyKey: String,
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationInboxMutationReceipt =
        error("Mutation is not used by this render test")

    override suspend fun delete(
        notificationId: String,
        idempotencyKey: String,
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationInboxMutationReceipt =
        error("Mutation is not used by this render test")
}

private fun notificationSnapshot() = NotificationInboxSnapshot(
    userId = "user-1",
    workspaceId = "workspace-1",
    notifications = listOf(
        AppNotification(
            id = "notification-1",
            userId = "user-1",
            workspaceId = "workspace-1",
            organizationId = "workspace-1",
            type = "info",
            title = "Shcare update",
            message = "Confirmed by backend",
            read = false,
            createdAt = "2026-07-29T08:00:00.000Z",
            updatedAt = "2026-07-29T08:00:00.000Z",
        ),
    ),
    updatedAt = "2026-07-29T08:00:00.000Z",
)
