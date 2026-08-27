package com.example.smart_health_android.ui.screens

import android.os.Build
import android.view.WindowManager
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performClick
import com.example.smart_health_android.data.DevicePairingOutcome
import com.example.smart_health_android.data.DevicePairingPresence
import com.example.smart_health_android.data.DevicePairingResponse
import com.example.smart_health_android.data.DevicePairingState
import com.example.smart_health_android.data.DeviceWifiSetupSession
import com.example.smart_health_android.data.SmartDevice
import com.example.smart_health_android.devices.DeviceClaimPayload
import com.example.smart_health_android.devices.DeviceClaimRepository
import com.example.smart_health_android.devices.DevicePairingStage
import com.example.smart_health_android.devices.DevicePairingAuthoritySnapshot
import com.example.smart_health_android.devices.DevicePairingUiAction
import com.example.smart_health_android.devices.DevicePairingViewModel
import com.example.smart_health_android.devices.DeviceProvisioningProgress
import com.example.smart_health_android.devices.DeviceSmartConfigBroadcastResult
import com.example.smart_health_android.devices.DeviceCurrentWifiSsid
import com.example.smart_health_android.devices.DeviceWifiProvisioner
import com.example.smart_health_android.devices.DeviceWifiProvisioningAvailability
import com.example.smart_health_android.devices.DeviceWifiProvisioningRequest
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.runBlocking
import org.junit.Rule
import org.junit.Before
import org.junit.Test
import java.time.Instant
import androidx.compose.ui.unit.dp

class DevicePairingScreenTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<DevicePairingComposeTestActivity>()

    @Before
    fun preparePhysicalDeviceUi() {
        composeRule.activity.runOnUiThread {
            composeRule.activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                composeRule.activity.setShowWhenLocked(true)
                composeRule.activity.setTurnScreenOn(true)
            } else {
                @Suppress("DEPRECATION")
                composeRule.activity.window.addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
                )
            }
        }
    }

    @Test
    fun authorizedSoftApSetupKeepsAccessMaterialOffScreen() {
        val viewModel = DevicePairingViewModel(
            repository = OfflineClaimRepository,
            expectedAuthority = TestAuthority,
            currentAuthority = { TestAuthority },
            idempotencyKeyFactory = { "android-test-wifi-key" },
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
            viewModel.onAction(DevicePairingUiAction.OpenWifiSetup("dev_alpha"))
        }
        composeRule.waitUntil(timeoutMillis = 5_000L) {
            viewModel.uiState.value.stage == DevicePairingStage.SetupReady
        }

        composeRule.onNodeWithTag("device_pairing.setup_ready").assertIsDisplayed()
        composeRule.onNodeWithTag("device_pairing.provision_in_app").assertIsDisplayed()
        composeRule.onNodeWithTag("device_pairing.provision_in_app").assertHeightIsAtLeast(48.dp)
        composeRule.onNodeWithTag("device_pairing.use_current_wifi")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
        composeRule.onAllNodesWithText("Shcare-9487FC14F3E6").assertCountEquals(0)
        composeRule.onAllNodesWithText("4hxulJ_mCLIz2XhP-KXh").assertCountEquals(0)
        composeRule.onAllNodesWithTag("device_pairing.open_bluetooth_settings").assertCountEquals(0)
        composeRule.onAllNodesWithTag("device_pairing.open_wifi_settings").assertCountEquals(0)
    }

    @Test
    fun wifiSetupSurfaceNeverShowsTheDeviceIdPairingEntry() {
        val viewModel = DevicePairingViewModel(
            repository = OfflineClaimRepository,
            expectedAuthority = TestAuthority,
            currentAuthority = { TestAuthority },
            idempotencyKeyFactory = { "android-test-wifi-surface-key" },
            nowMillis = { Instant.parse("2026-07-18T00:00:00Z").toEpochMilli() },
        )
        composeRule.setContent {
            ShcareMobileTheme(useDynamicColor = false) {
                DeviceWifiSetupScreen(
                    deviceId = "dev_alpha",
                    onNavigateBack = {},
                    onWifiConfigured = { _ -> },
                    expectedAuthority = TestAuthority,
                    currentAuthority = { TestAuthority },
                    viewModel = viewModel,
                )
            }
        }

        composeRule.waitUntil(timeoutMillis = 5_000L) {
            viewModel.uiState.value.stage == DevicePairingStage.SetupReady
        }

        composeRule.onNodeWithTag("device_wifi.surface").assertIsDisplayed()
        composeRule.onNodeWithTag("device_pairing.setup_ready").assertIsDisplayed()
        composeRule.onAllNodesWithTag("device_pairing.entry").assertCountEquals(0)
        composeRule.onAllNodesWithText("Ghép thiết bị").assertCountEquals(0)
    }

    @Test
    fun entryShowsOnlyDeviceIdAndKeepsPrimaryActionAtLeastFortyEightDp() {
        val viewModel = DevicePairingViewModel(
            repository = OfflineClaimRepository,
            expectedAuthority = TestAuthority,
            currentAuthority = { TestAuthority },
            idempotencyKeyFactory = { "android-test-device-id-key" },
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
        listOf("device_pairing.device_id", "device_pairing.submit_manual").forEach { tag ->
            composeRule.onNodeWithTag("device_pairing.entry")
                .performScrollToNode(hasTestTag(tag))
            composeRule.onNodeWithTag(tag).assertIsDisplayed()
        }
        composeRule.onNodeWithTag("device_pairing.submit_manual").assertHeightIsAtLeast(48.dp)
        listOf(
            "device_pairing.scan_qr",
            "device_pairing.pick_qr_image",
            "device_pairing.claim_code",
            "device_pairing.setup_ssid",
            "device_pairing.setup_proof",
        ).forEach { tag ->
            composeRule.onAllNodesWithTag(tag).assertCountEquals(0)
        }
    }

    @Test
    fun enteringOnlyDeviceIdReportsARegisteredDeviceToNavigation() {
        val viewModel = DevicePairingViewModel(
            repository = OfflineClaimRepository,
            expectedAuthority = TestAuthority,
            currentAuthority = { TestAuthority },
            idempotencyKeyFactory = { "android-test-registration-key" },
            nowMillis = { Instant.parse("2026-07-18T00:00:00Z").toEpochMilli() },
        )
        composeRule.setContent {
            ShcareMobileTheme(useDynamicColor = false) {
                DevicePairingScreen(
                    onNavigateBack = {},
                    onConnectionSuccess = {},
                    onDeviceRegistered = { registeredDeviceId = it },
                    viewModel = viewModel,
                )
            }
        }

        composeRule.runOnIdle {
            viewModel.onAction(DevicePairingUiAction.ManualDeviceIdChanged("dev_alpha"))
            viewModel.onAction(DevicePairingUiAction.SubmitManual)
        }
        composeRule.waitUntil(timeoutMillis = 5_000L) {
            registeredDeviceId == "dev_alpha"
        }
        composeRule.onNodeWithTag("device_pairing.entry").assertIsDisplayed()
    }

    @Test
    fun provisioningShowsAProgressTraceWithoutExposingTheWifiPassword() {
        val provisionGate = CompletableDeferred<Unit>()
        val viewModel = DevicePairingViewModel(
            repository = OfflineClaimRepository,
            provisioner = ProgressHoldingProvisioner(provisionGate),
            expectedAuthority = TestAuthority,
            currentAuthority = { TestAuthority },
            idempotencyKeyFactory = { "android-test-progress-key" },
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
            viewModel.onAction(DevicePairingUiAction.OpenWifiSetup("dev_alpha"))
        }
        composeRule.waitUntil(timeoutMillis = 5_000L) {
            viewModel.uiState.value.stage == DevicePairingStage.SetupReady
        }
        composeRule.runOnIdle {
            viewModel.onAction(DevicePairingUiAction.TargetWifiSsidChanged("Test WiFi"))
            viewModel.onAction(DevicePairingUiAction.TargetWifiPasswordChanged("testpass123"))
            viewModel.onAction(DevicePairingUiAction.StartLocalProvisioning)
        }
        composeRule.waitUntil(timeoutMillis = 5_000L) {
            viewModel.uiState.value.stage == DevicePairingStage.Provisioning &&
                viewModel.uiState.value.provisioningProgress ==
                DeviceProvisioningProgress.BroadcastingCredentials
        }

        composeRule.onNodeWithTag("device_pairing.connection_trace").assertIsDisplayed()
        composeRule.onNodeWithText("Phát cấu hình Wi-Fi").assertIsDisplayed()
        composeRule.onAllNodesWithText("testpass123").assertCountEquals(0)

        runBlocking { provisionGate.complete(Unit) }
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

        override suspend fun getRegisteredDevice(deviceId: String): SmartDevice = SmartDevice(
            id = deviceId,
            name = "Shcare test",
            organizationId = "workspace-1",
        )

        override suspend fun openWifiSetupSession(deviceId: String): DeviceWifiSetupSession =
            DeviceWifiSetupSession(
                device = SmartDevice(
                    id = deviceId,
                    name = "Shcare test",
                    organizationId = "workspace-1",
                    online = false,
                ),
                transport = "esptouch_v2",
                security = "aes128",
                provisioningKey = ByteArray(16) { 0x5a },
                reservedData = "v2:${"2b".repeat(16)}".toByteArray(),
                expiresAt = Instant.parse("2026-07-18T00:10:00Z"),
            )
    }

    private class ProgressHoldingProvisioner(
        private val provisionGate: CompletableDeferred<Unit>,
    ) : DeviceWifiProvisioner {
        override fun availability(): DeviceWifiProvisioningAvailability =
            DeviceWifiProvisioningAvailability.Available

        override suspend fun currentWifiSsid(): DeviceCurrentWifiSsid =
            DeviceCurrentWifiSsid.Unavailable

        override suspend fun provision(
            request: DeviceWifiProvisioningRequest,
            onProgress: (DeviceProvisioningProgress) -> Unit,
        ): DeviceSmartConfigBroadcastResult {
            onProgress(DeviceProvisioningProgress.BroadcastingCredentials)
            provisionGate.await()
            return DeviceSmartConfigBroadcastResult.DirectAcknowledged
        }
    }

    private companion object {
        val TestAuthority = DevicePairingAuthoritySnapshot.create(
            userId = "user-1",
            workspaceId = "workspace-1",
            authorityEpoch = 1L,
        )
        var registeredDeviceId = ""
    }
}
