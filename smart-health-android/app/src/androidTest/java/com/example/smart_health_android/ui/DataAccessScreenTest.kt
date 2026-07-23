package com.example.smart_health_android.ui

import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.smart_health_android.consent.ConsentRepository
import com.example.smart_health_android.consent.ConsentViewModel
import com.example.smart_health_android.consent.CreateConsentGrantCommand
import com.example.smart_health_android.data.Patient
import com.example.smart_health_android.data.PatientShare
import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.data.ShareRecipient
import com.example.smart_health_android.data.ShareTargetDoctor
import com.example.smart_health_android.data.ShareTargets
import com.example.smart_health_android.ui.screens.DataAccessScreen
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import java.net.UnknownHostException
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DataAccessScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun rendersBackendAuthorityRecipientAndExpiredStateWithoutARevokeAction() {
        val share = PatientShare(
            id = "share-1",
            patientId = "patient-1",
            authorityType = "patient_consent",
            status = "expired",
            recipient = ShareRecipient(
                type = "doctor",
                id = "doctor-1",
                name = "Bác sĩ Minh",
                workspaceId = "workspace-1",
            ),
            scope = "patient_profile",
            active = false,
        )
        val viewModel = ConsentViewModel(ScreenConsentRepository(shares = listOf(share)))

        composeRule.setContent {
            ShcareMobileTheme {
                DataAccessScreen(
                    onNavigateBack = {},
                    viewModel = viewModel,
                )
            }
        }

        composeRule.waitUntil(timeoutMillis = 5_000) {
            composeRule.onAllNodesWithTag("consent_grant_share-1")
                .fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithTag("consent_grant_share-1").assertIsDisplayed()
        composeRule.onNodeWithText("Bác sĩ Minh").assertIsDisplayed()
        composeRule.onNodeWithText("Đồng ý chia sẻ của bệnh nhân").assertIsDisplayed()
        composeRule.onNodeWithText("Đã hết hạn").assertIsDisplayed()
        composeRule.onAllNodesWithText("Thu hồi quyền").assertCountEquals(0)
    }

    @Test
    fun exposesAReachableOfflineRecoveryAction() {
        val viewModel = ConsentViewModel(
            ScreenConsentRepository(patientFailure = UnknownHostException("offline"))
        )

        composeRule.setContent {
            ShcareMobileTheme {
                DataAccessScreen(
                    onNavigateBack = {},
                    viewModel = viewModel,
                )
            }
        }

        composeRule.waitUntil(timeoutMillis = 5_000) {
            composeRule.onAllNodesWithText("Không thể kết nối máy chủ")
                .fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithText("Không thể kết nối máy chủ")
            .assertIsDisplayed()
        composeRule.onNodeWithText("Thử lại")
            .assertIsDisplayed()
            .assertHasClickAction()
    }

    @Test
    fun legacyPrincipalAndActiveFlagRenderUnknownAndNeverEnableRevoke() {
        val legacyShare = PatientShare(
            id = "legacy-share",
            patientId = "patient-1",
            doctorUserId = "doctor-1",
            organizationId = "workspace-1",
            active = true,
        )
        val viewModel = ConsentViewModel(
            ScreenConsentRepository(shares = listOf(legacyShare))
        )

        composeRule.setContent {
            ShcareMobileTheme {
                DataAccessScreen(
                    onNavigateBack = {},
                    viewModel = viewModel,
                )
            }
        }

        composeRule.waitUntil(timeoutMillis = 5_000) {
            composeRule.onAllNodesWithTag("consent_grant_legacy-share")
                .fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithText("Người nhận chưa xác định").assertIsDisplayed()
        composeRule.onNodeWithText("Trạng thái chưa được máy chủ xác định").assertIsDisplayed()
        composeRule.onAllNodesWithText("Bác sĩ Minh").assertCountEquals(0)
        composeRule.onAllNodesWithText("Thu hồi quyền").assertCountEquals(0)
    }
}

private class ScreenConsentRepository(
    private val shares: List<PatientShare> = emptyList(),
    private val patientFailure: Throwable? = null,
) : ConsentRepository {
    override suspend fun listPatients(): List<Patient> {
        patientFailure?.let { throw it }
        return listOf(
            Patient(
                id = "patient-1",
                patientCode = "BN-001",
                name = "Nguyễn An",
                profileType = "self",
            )
        )
    }

    override suspend fun listTargets(): ShareTargets = ShareTargets(
        doctors = listOf(
            ShareTargetDoctor(
                id = "doctor-1",
                name = "Bác sĩ Minh",
                organizationId = "workspace-1",
            )
        )
    )

    override suspend fun listShares(patientId: String): List<PatientShare> = shares

    override suspend fun listScans(patientId: String): List<Scan> = emptyList()

    override suspend fun createGrant(
        command: CreateConsentGrantCommand,
        idempotencyKey: String,
    ): PatientShare = error("Not used")

    override suspend fun revokeGrant(
        patientId: String,
        shareId: String,
        idempotencyKey: String,
    ): PatientShare = error("Not used")
}
