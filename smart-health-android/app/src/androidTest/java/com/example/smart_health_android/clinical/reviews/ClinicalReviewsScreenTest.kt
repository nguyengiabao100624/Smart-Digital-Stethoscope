package com.example.smart_health_android.clinical.reviews

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.smart_health_android.data.ClinicalReview
import com.example.smart_health_android.data.ClinicalReviewDecision
import com.example.smart_health_android.data.ClinicalReviewList
import com.example.smart_health_android.data.ClinicalReviewStatus
import com.example.smart_health_android.ui.foundation.ShcareThemeMode
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ClinicalReviewsScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun readOnlyQueueRemainsReadableAtTwoHundredPercentFontWithoutDecisionActions() {
        val viewModel = ClinicalReviewsViewModel(
            repository = StaticClinicalReviewsRepository(),
            expectedWorkspaceId = "workspace-1",
            canManage = false,
        )
        composeRule.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(
                LocalDensity provides Density(density.density, fontScale = 2f),
            ) {
                ShcareMobileTheme(mode = ShcareThemeMode.Dark, useDynamicColor = false) {
                    ClinicalReviewsScreen(
                        expectedWorkspaceId = "workspace-1",
                        canManage = false,
                        onNavigateBack = {},
                        onOpenWorkspaceSwitcher = {},
                        providedViewModel = viewModel,
                    )
                }
            }
        }

        composeRule.waitUntil(5_000L) {
            viewModel.uiState.value.loadState == ClinicalReviewsLoadState.Content
        }
        composeRule.waitUntil(10_000L) {
            runCatching {
                composeRule.onAllNodesWithText("Hàng đợi duyệt")
                    .fetchSemanticsNodes()
                    .isNotEmpty()
            }.getOrDefault(false)
        }
        composeRule.onNodeWithText("Hàng đợi duyệt").assertIsDisplayed()
        composeRule.onNodeWithText(
            "Tài khoản hiện tại chỉ được xem, không được ghi quyết định lâm sàng.",
        ).assertIsDisplayed()
        composeRule.onAllNodesWithText("Chấp nhận kết quả").assertCountEquals(0)
        composeRule.onAllNodesWithText("Yêu cầu đo lại").assertCountEquals(0)
    }

    @Test
    fun manageAuthorityGetsReachableConfirmationAndRequiredActionNote() {
        val viewModel = ClinicalReviewsViewModel(
            repository = StaticClinicalReviewsRepository(),
            expectedWorkspaceId = "workspace-1",
            canManage = true,
            idempotencyKeyFactory = { "review-key" },
        )
        composeRule.setContent {
            ShcareMobileTheme(mode = ShcareThemeMode.Light, useDynamicColor = false) {
                ClinicalReviewsScreen(
                    expectedWorkspaceId = "workspace-1",
                    canManage = true,
                    onNavigateBack = {},
                    onOpenWorkspaceSwitcher = {},
                    providedViewModel = viewModel,
                )
            }
        }

        composeRule.waitUntil(5_000L) {
            viewModel.uiState.value.loadState == ClinicalReviewsLoadState.Content
        }
        composeRule.waitUntil(10_000L) {
            runCatching {
                composeRule.onAllNodesWithText("Hàng đợi duyệt")
                    .fetchSemanticsNodes()
                    .isNotEmpty()
            }.getOrDefault(false)
        }
        composeRule.onNodeWithText("Yêu cầu đo lại")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
            .performClick()
        composeRule.onNodeWithText("Ghi nhận quyết định")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
            .performClick()
        composeRule.onNodeWithText("Quyết định này bắt buộc có hướng dẫn rõ ràng.")
            .assertIsDisplayed()
    }
}

private class StaticClinicalReviewsRepository : ClinicalReviewsRepository {
    override suspend fun load(
        filter: ClinicalReviewFilter,
        expectedWorkspaceId: String,
    ): ClinicalReviewList = ClinicalReviewList(
        workspaceId = expectedWorkspaceId,
        reviews = listOf(
            ClinicalReview(
                id = "review-1",
                scanId = "scan-1",
                organizationId = expectedWorkspaceId,
                patientId = "patient-1",
                deviceId = "device-1",
                status = ClinicalReviewStatus.Pending,
                version = 1,
                scanStatus = "needs_review",
                scanCreatedAt = "2026-07-29T08:00:00.000Z",
            ),
        ),
    )

    override suspend fun decide(
        review: ClinicalReview,
        decision: ClinicalReviewDecision,
        note: String,
        idempotencyKey: String,
        expectedWorkspaceId: String,
    ): ClinicalReview = error("Confirmation is not submitted by this render test")
}
