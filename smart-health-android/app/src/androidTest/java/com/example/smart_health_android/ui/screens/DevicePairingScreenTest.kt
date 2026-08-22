package com.example.smart_health_android.ui.screens

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollToNode
import com.example.smart_health_android.data.DevicePairingOutcome
import com.example.smart_health_android.data.DevicePairingPresence
import com.example.smart_health_android.data.DevicePairingResponse
import com.example.smart_health_android.data.DevicePairingState
import com.example.smart_health_android.data.SmartDevice
import com.example.smart_health_android.devices.DeviceClaimPayload
import com.example.smart_health_android.devices.DeviceClaimRepository
import com.example.smart_health_android.devices.DevicePairingStage
import com.example.smart_health_android.devices.DevicePairingAuthoritySnapshot
import com.example.smart_health_android.devices.DevicePairingUiAction
import com.example.smart_health_android.devices.DevicePairingViewModel
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import org.junit.Rule
import org.junit.Test
import java.time.Instant
import androidx.compose.ui.unit.dp

class DevicePairingScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun secureQrShowsNativeSetupGuidanceWithoutPretendingDeviceIsOnline() {
        val viewModel = DevicePairingViewModel(
            repository = OfflineClaimRepository,
            expectedAuthority = TestAuthority,
            currentAuthority = { TestAuthority },
            idempotencyKeyFactory = { "android-test-pairing-key" },
            onlineRetryDelaysMillis = listOf(60_000L),
            nowMillis = { Instant.parse("2026-07-18T00:00:00Z").toEpochMilli() },
        )
        composeRule.setContent {
            ShcareMobileTheme(useDynamicColor = false) {
                DevicePairingScreen(
                    onNavigateBack = {},
                    onConnectionSuccess = {},
                    viewModel = viewModel,
                )
            }
        }

        composeRule.runOnIdle {
            viewModel.onAction(DevicePairingUiAction.QrScanned(SecureSetupQr))
        }
        composeRule.waitUntil(timeoutMillis = 5_000L) {
            viewModel.uiState.value.stage == DevicePairingStage.SetupReady
        }

        composeRule.onNodeWithTag("device_pairing.setup_ready").assertIsDisplayed()
        composeRule.onNodeWithText("Shcare-9487FC14F3E6").assertIsDisplayed()
        composeRule.onNodeWithText("4hxulJ_mCLIz2XhP-KXh").assertIsDisplayed()
        composeRule.onNodeWithTag("device_pairing.open_wifi_settings").assertIsDisplayed()
    }

    @Test
    fun manualFallbackUsesNativeFieldsAndKeepsPrimaryActionsAtLeastFortyEightDp() {
        val viewModel = DevicePairingViewModel(
            repository = OfflineClaimRepository,
            expectedAuthority = TestAuthority,
            currentAuthority = { TestAuthority },
            idempotencyKeyFactory = { "android-test-manual-key" },
            nowMillis = { Instant.parse("2026-07-18T00:00:00Z").toEpochMilli() },
        )
        composeRule.setContent {
            ShcareMobileTheme(useDynamicColor = false) {
                DevicePairingScreen(
                    onNavigateBack = {},
                    onConnectionSuccess = {},
                    viewModel = viewModel,
                )
            }
        }

        composeRule.onNodeWithTag("device_pairing.back").assertHeightIsAtLeast(48.dp)
        listOf(
            "device_pairing.device_id",
            "device_pairing.claim_code",
            "device_pairing.setup_ssid",
            "device_pairing.setup_proof",
            "device_pairing.submit_manual",
        ).forEach { tag ->
            composeRule.onNodeWithTag("device_pairing.entry")
                .performScrollToNode(hasTestTag(tag))
            composeRule.onNodeWithTag(tag).assertIsDisplayed()
        }
        composeRule.onNodeWithTag("device_pairing.submit_manual").assertHeightIsAtLeast(48.dp)
    }

    private object OfflineClaimRepository : DeviceClaimRepository {
        override suspend fun claimDevice(
            payload: DeviceClaimPayload,
            connectionMethod: String,
            idempotencyKey: String,
        ): DevicePairingResponse = DevicePairingResponse(
            device = SmartDevice(
                id = payload.deviceId,
                name = "Shcare test",
                organizationId = "workspace-1",
                online = false,
            ),
            pairing = DevicePairingState(
                outcome = DevicePairingOutcome.Accepted,
                presence = DevicePairingPresence.AwaitingOnline,
                onlineConfirmed = false,
            ),
        )

        override suspend fun listDevices(): List<SmartDevice> = emptyList()
    }

    private companion object {
        val TestAuthority = DevicePairingAuthoritySnapshot.create(
            userId = "user-1",
            workspaceId = "workspace-1",
            authorityEpoch = 1L,
        )
        val SecureSetupQr =
            """
            {
              "type": "shcare.device.setup",
              "protocolVersion": 1,
              "deviceId": "dev_alpha",
              "claimCode": "Claim_aB12",
              "claimExpiresAt": "2026-07-19T00:00:00Z",
              "setupAp": {
                "ssid": "Shcare-9487FC14F3E6",
                "security": "WPA2_PSK",
                "proofOfPossession": "4hxulJ_mCLIz2XhP-KXh"
              }
            }
            """.trimIndent()
    }
}
