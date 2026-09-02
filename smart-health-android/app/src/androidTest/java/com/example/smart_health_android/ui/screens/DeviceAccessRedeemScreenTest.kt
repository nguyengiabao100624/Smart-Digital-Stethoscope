package com.example.smart_health_android.ui.screens

import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.dp
import com.example.smart_health_android.data.DeviceAccessGrant
import com.example.smart_health_android.data.DeviceAccessLevel
import com.example.smart_health_android.data.DeviceAccessRedeemResponse
import com.example.smart_health_android.data.SmartDevice
import com.example.smart_health_android.devices.DeviceAccessRedeemRepository
import com.example.smart_health_android.devices.DeviceAccessRedeemViewModel
import com.example.smart_health_android.devices.DevicePairingAuthoritySnapshot
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class DeviceAccessRedeemScreenTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<DevicePairingComposeTestActivity>()

    @Test
    fun accessCodeSurfaceUsesOpaqueCodeAndReturnsTheExactGrantedDevice() {
        var grantedDeviceId = ""
        val repository = RecordingAccessRepository()
        val viewModel = DeviceAccessRedeemViewModel(
            expectedAuthority = TestAuthority,
            currentAuthority = { TestAuthority },
            repository = repository,
            idempotencyKeyFactory = { "android-access-ui-test" },
        )

        composeRule.setContent {
            ShcareMobileTheme(useDynamicColor = false) {
                DeviceAccessRedeemScreen(
                    expectedAuthority = TestAuthority,
                    currentAuthority = { TestAuthority },
                    onNavigateBack = {},
                    onDeviceGranted = { grantedDeviceId = it },
                    viewModel = viewModel,
                )
            }
        }

        composeRule.onNodeWithTag("device_access.entry").assertIsDisplayed()
        composeRule.onNodeWithText("Nhập mã truy cập thiết bị").assertIsDisplayed()
        composeRule.onNodeWithText(
            "Mã do Platform Admin tạo và xác định đúng thiết bị cùng phạm vi quyền của bạn. Bạn không cần nhập Device ID.",
        ).assertIsDisplayed()
        composeRule.onAllNodesWithText("Device ID", substring = false).fetchSemanticsNodes()
            .also { nodes -> assertEquals(0, nodes.size) }
        composeRule.onNodeWithTag("device_access.scan_qr").assertHeightIsAtLeast(48.dp)
        composeRule.onNodeWithTag("device_access.submit").assertHeightIsAtLeast(48.dp)

        composeRule.onNodeWithTag("device_access.code")
            .performTextInput("shc abcd efgh jklm npqr")
        composeRule.onNodeWithTag("device_access.submit").performClick()

        composeRule.waitUntil(timeoutMillis = 5_000L) { grantedDeviceId == "device-1" }
        assertEquals("SHC-ABCD-EFGH-JKLM-NPQR", repository.redeemedCode)
        assertEquals("android-access-ui-test", repository.idempotencyKey)
    }

    private class RecordingAccessRepository : DeviceAccessRedeemRepository {
        var redeemedCode = ""
        var idempotencyKey = ""

        override suspend fun redeem(
            code: String,
            idempotencyKey: String,
        ): DeviceAccessRedeemResponse {
            redeemedCode = code
            this.idempotencyKey = idempotencyKey
            return DeviceAccessRedeemResponse(
                device = SmartDevice(
                    id = "device-1",
                    name = "Shcare One",
                    organizationId = "workspace-1",
                ),
                grant = DeviceAccessGrant(
                    id = "grant-1",
                    deviceId = "device-1",
                    organizationId = "workspace-1",
                    userId = "user-1",
                    accessLevel = DeviceAccessLevel.Viewer,
                    status = "active",
                    grantedAt = "2026-09-03T00:00:00Z",
                ),
                idempotent = false,
            )
        }
    }

    private companion object {
        val TestAuthority = DevicePairingAuthoritySnapshot.create(
            userId = "user-1",
            workspaceId = "workspace-1",
            authorityEpoch = 1L,
        )
    }
}
