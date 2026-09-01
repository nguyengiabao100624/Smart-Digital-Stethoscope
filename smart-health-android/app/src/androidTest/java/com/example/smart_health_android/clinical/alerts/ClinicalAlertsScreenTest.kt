package com.example.smart_health_android.clinical.alerts

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.smart_health_android.data.ClinicalAlert
import com.example.smart_health_android.data.ClinicalAlertList
import com.example.smart_health_android.data.ClinicalAlertStatus
import com.example.smart_health_android.ui.foundation.ShcareThemeMode
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ClinicalAlertsScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun readOnlyLedgerRemainsReadableAtTwoHundredPercentFontScaleWithoutMutationActions() {
        val viewModel = ClinicalAlertsViewModel(
            repository = StaticClinicalAlertsRepository(),
            expectedWorkspaceId = "workspace-1",
            canManage = false,
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
                    ClinicalAlertsScreen(
                        expectedWorkspaceId = "workspace-1",
                        canManage = false,
                        onOpenWorkspaceSwitcher = {},
                        providedViewModel = viewModel,
                    )
                }
            }
        }

        composeRule.waitUntil(timeoutMillis = 5_000L) {
            viewModel.uiState.value.loadState == ClinicalAlertsLoadState.Content
        }
        composeRule.waitUntil(timeoutMillis = 10_000L) {
            runCatching {
                composeRule.onAllNodesWithText("Cảnh báo")
                    .fetchSemanticsNodes()
                    .isNotEmpty()
            }.getOrDefault(false)
        }
        composeRule.onNodeWithText("Cảnh báo").assertIsDisplayed()
        composeRule.onNodeWithTag("clinical-alert-alert-1").performClick()
        composeRule.onNodeWithText("Tài khoản này chỉ được xem cảnh báo.")
            .assertIsDisplayed()
        composeRule.onAllNodesWithText("Tiếp nhận").assertCountEquals(0)
        composeRule.onAllNodesWithText("Đánh dấu đã xử lý").assertCountEquals(0)
    }

    @Test
    fun manageAuthorityGetsAReachableConfirmationBeforeAcknowledging() {
        val viewModel = ClinicalAlertsViewModel(
            repository = StaticClinicalAlertsRepository(),
            expectedWorkspaceId = "workspace-1",
            canManage = true,
            idempotencyKeyFactory = { "ack-key" },
        )

        composeRule.setContent {
            ShcareMobileTheme(
                mode = ShcareThemeMode.Light,
                useDynamicColor = false,
            ) {
                ClinicalAlertsScreen(
                    expectedWorkspaceId = "workspace-1",
                    canManage = true,
                    onOpenWorkspaceSwitcher = {},
                    providedViewModel = viewModel,
                )
            }
        }

        composeRule.waitUntil(timeoutMillis = 5_000L) {
            viewModel.uiState.value.loadState == ClinicalAlertsLoadState.Content
        }
        composeRule.waitUntil(timeoutMillis = 10_000L) {
            runCatching {
                composeRule.onAllNodesWithText("Cảnh báo")
                    .fetchSemanticsNodes()
                    .isNotEmpty()
            }.getOrDefault(false)
        }
        composeRule.onNodeWithTag("clinical-alert-alert-1").performClick()
        composeRule.onNodeWithText("Tiếp nhận")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
            .performClick()
        composeRule.onNodeWithText("Tiếp nhận cảnh báo?")
            .assertIsDisplayed()
        composeRule.onNodeWithText("Xác nhận tiếp nhận")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
    }
}

private class StaticClinicalAlertsRepository : ClinicalAlertsRepository {
    override suspend fun load(
        filter: ClinicalAlertFilter,
        expectedWorkspaceId: String,
    ): ClinicalAlertList = ClinicalAlertList(
        workspaceId = expectedWorkspaceId,
        alerts = listOf(openAlert(expectedWorkspaceId)),
    )

    override suspend fun transition(
        alert: ClinicalAlert,
        action: ClinicalAlertAction,
        note: String,
        idempotencyKey: String,
        expectedWorkspaceId: String,
    ): ClinicalAlert = error("Confirmation is not submitted by this render test")
}

private fun openAlert(workspaceId: String) = ClinicalAlert(
    id = "alert-1",
    organizationId = workspaceId,
    sourceType = "scan",
    sourceId = "scan-1",
    occurredAt = "2026-07-27T08:30:00.000Z",
    status = ClinicalAlertStatus.Open,
    severity = "warning",
    title = "Tín hiệu cần xem lại",
    message = "Lượt đo có chất lượng tín hiệu thấp và cần người có chuyên môn xem lại.",
    patientId = "patient-1",
    scanId = "scan-1",
    version = 1,
)
