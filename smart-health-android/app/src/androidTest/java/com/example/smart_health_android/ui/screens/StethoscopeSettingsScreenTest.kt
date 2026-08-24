package com.example.smart_health_android.ui.screens

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.smart_health_android.data.SmartDevice
import com.example.smart_health_android.devices.StethoscopeDeviceRepository
import com.example.smart_health_android.devices.StethoscopeSettingsLoadState
import com.example.smart_health_android.devices.StethoscopeSettingsViewModel
import com.example.smart_health_android.ui.foundation.ShcareThemeMode
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StethoscopeSettingsScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun emptyInventoryOffersOnlyTheCanonicalPairingAction() {
        var pairingClicks = 0
        val viewModel = StethoscopeSettingsViewModel(
            repository = QueueDeviceRepository(
                ArrayDeque(listOf(emptyList())),
            ),
        )

        composeRule.setContent {
            ShcareMobileTheme(
                mode = ShcareThemeMode.Light,
                useDynamicColor = false,
            ) {
                StethoscopeSettingsScreen(
                    onNavigateBack = {},
                    onNavigateToDevicePairing = { pairingClicks += 1 },
                    onNavigateToDeviceManagement = {},
                    settingsViewModel = viewModel,
                )
            }
        }

        composeRule.waitUntil(timeoutMillis = 5_000L) {
            viewModel.uiState.value.loadState == StethoscopeSettingsLoadState.Empty
        }
        composeRule.onNodeWithText("Chưa có thiết bị").assertIsDisplayed()
        composeRule.onNodeWithText("Ghép thiết bị")
            .assertIsDisplayed()
            .assertHasClickAction()
            .assertHeightIsAtLeast(48.dp)
            .performClick()
        composeRule.onNodeWithText("Hiệu chuẩn cảm biến").assertDoesNotExist()
        composeRule.onNodeWithText("Tự động kết nối").assertDoesNotExist()
        composeRule.onNodeWithText("Bluetooth").assertDoesNotExist()

        composeRule.runOnIdle {
            assertEquals(1, pairingClicks)
        }
    }

    @Test
    fun readyDeviceRemainsReadableInDarkThemeAtTwoHundredPercentFontScale() {
        val device = SmartDevice(
            id = "device-1",
            name = "Shcare One",
            online = true,
            battery = 82,
            wifiRssi = -57,
            firmwareVersion = "1.0.0",
            connectionMethod = "QR",
            lastSeenAt = Instant.now().toString(),
        )
        val viewModel = StethoscopeSettingsViewModel(
            repository = QueueDeviceRepository(
                ArrayDeque(listOf(listOf(device))),
            ),
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
                    StethoscopeSettingsScreen(
                        onNavigateBack = {},
                        onNavigateToDevicePairing = {},
                        onNavigateToDeviceManagement = {},
                        settingsViewModel = viewModel,
                    )
                }
            }
        }

        composeRule.waitUntil(timeoutMillis = 5_000L) {
            viewModel.uiState.value.loadState == StethoscopeSettingsLoadState.Ready
        }
        composeRule.onNodeWithText("Shcare One").assertIsDisplayed()
        composeRule.onNodeWithText("Trực tuyến").assertIsDisplayed()
        composeRule.onNodeWithTag("stethoscope.content")
            .performScrollToNode(hasText("Tùy chỉnh nâng cao chưa khả dụng"))
        composeRule.onAllNodesWithText("Tùy chỉnh nâng cao chưa khả dụng")
            .assertCountEquals(1)
        composeRule.onNodeWithText("Hiệu chuẩn cảm biến").assertDoesNotExist()
        composeRule.onNodeWithText("Online qua cloud").assertDoesNotExist()
    }
}

private class QueueDeviceRepository(
    private val responses: ArrayDeque<List<SmartDevice>>,
) : StethoscopeDeviceRepository {
    override suspend fun listDevices(): List<SmartDevice> = responses.removeFirst()
}
