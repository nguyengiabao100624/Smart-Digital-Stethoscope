package com.example.smart_health_android.ui.screens

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.Density
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.smart_health_android.data.SmartDevice
import com.example.smart_health_android.data.SmartDeviceTelemetry
import com.example.smart_health_android.devices.DeviceHealthSnapshot
import com.example.smart_health_android.ui.foundation.ShcareThemeMode
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Instant

@RunWith(AndroidJUnit4::class)
class DeviceHealthPanelTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun offlineDeviceKeepsMissingTelemetryExplicitAtTwoHundredPercentFontScale() {
        val snapshot = DeviceHealthSnapshot.from(
            device = SmartDevice(
                id = "SHCARE-DEVICE-WITH-A-LONG-IDENTIFIER-001",
                name = "Ống nghe gia đình với tên thiết bị dài",
                connected = true,
                online = false,
                lastSeenAt = "2026-07-18T11:59:30Z",
            ),
            now = Instant.parse("2026-07-18T12:00:00Z"),
        )

        composeRule.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(
                LocalDensity provides Density(density.density, fontScale = 2f),
            ) {
                ShcareMobileTheme(mode = ShcareThemeMode.Dark) {
                    DeviceHealthPanel(
                        snapshot = snapshot,
                        isReleasing = false,
                        mutationEnabled = true,
                        onRelease = {},
                    )
                }
            }
        }

        composeRule.onNodeWithTag("device_health.presence")
            .assertTextContains("Ngoại tuyến")
        composeRule.onNodeWithTag("device_health.metric.i2s")
            .assertTextContains("Chưa báo cáo")
    }

    @Test
    fun degradedTelemetryAndLongCommandRemainAvailableToTalkBack() {
        val commandId = "cmd-2026-07-18-very-long-correlation-identifier"
        val snapshot = DeviceHealthSnapshot.from(
            device = SmartDevice(
                id = "dev-001",
                online = true,
                lastSeenAt = "2026-07-18T11:59:30Z",
                telemetry = SmartDeviceTelemetry(
                    i2sStatus = "degraded",
                    lastCommandState = "failed",
                    lastCommandCode = "DEVICE_AUDIO_PIPELINE_NOT_READY",
                    lastCommandId = commandId,
                ),
            ),
            now = Instant.parse("2026-07-18T12:00:00Z"),
        )

        composeRule.setContent {
            ShcareMobileTheme {
                DeviceHealthPanel(
                    snapshot = snapshot,
                    isReleasing = false,
                    mutationEnabled = true,
                    onRelease = {},
                )
            }
        }

        composeRule.onNodeWithTag("device_health.presence")
            .assertTextContains("Online, cần kiểm tra")
        composeRule.onNodeWithTag("device_health.metric.last_command")
            .assertTextContains(commandId, substring = true)
            .assert(
                SemanticsMatcher("state description contains the command correlation ID") { node ->
                    node.config
                        .getOrElse(SemanticsProperties.StateDescription) { "" }
                        .contains(commandId)
                },
            )
    }

    @Test
    fun viewOnlyDoctorSeesDeviceHealthWithoutMutationActions() {
        val snapshot = DeviceHealthSnapshot.from(
            device = SmartDevice(
                id = "doctor-assigned-device",
                name = "Shcare phòng khám",
                connected = true,
                online = true,
                lastSeenAt = "2026-07-18T11:59:30Z",
            ),
            now = Instant.parse("2026-07-18T12:00:00Z"),
        )

        composeRule.setContent {
            ShcareMobileTheme {
                DeviceHealthPanel(
                    snapshot = snapshot,
                    isReleasing = false,
                    mutationEnabled = false,
                    onRelease = {},
                    canConfigureWifi = true,
                    canReleaseDevice = false,
                )
            }
        }

        composeRule.onNodeWithTag("device_health.panel").assertExists()
        composeRule.onNodeWithTag("device_management.configure_wifi").assertExists()
        composeRule.onAllNodesWithTag("device_management.release").assertCountEquals(0)
    }

    @Test
    fun weakMicSignalShowsQualityWarningNoticeAndMetric() {
        val snapshot = DeviceHealthSnapshot.from(
            device = SmartDevice(
                id = "dev-001",
                online = true,
                lastSeenAt = "2026-07-18T11:59:30Z",
                telemetry = SmartDeviceTelemetry(audioSignalQuality = "too_weak"),
            ),
            now = Instant.parse("2026-07-18T12:00:00Z"),
        )

        composeRule.setContent {
            ShcareMobileTheme {
                DeviceHealthPanel(
                    snapshot = snapshot,
                    isReleasing = false,
                    mutationEnabled = true,
                    onRelease = {},
                )
            }
        }

        composeRule.onNodeWithTag("device_health.signal_quality_notice")
            .assertTextContains("Mic chưa thu được âm tim/phổi")
        composeRule.onNodeWithTag("device_health.metric.signal_quality")
            .assertTextContains("Tín hiệu quá yếu")
    }

    @Test
    fun detectedMicSignalHidesWarningNoticeButKeepsMetricVisible() {
        val snapshot = DeviceHealthSnapshot.from(
            device = SmartDevice(
                id = "dev-001",
                online = true,
                lastSeenAt = "2026-07-18T11:59:30Z",
                telemetry = SmartDeviceTelemetry(audioSignalQuality = "detected"),
            ),
            now = Instant.parse("2026-07-18T12:00:00Z"),
        )

        composeRule.setContent {
            ShcareMobileTheme {
                DeviceHealthPanel(
                    snapshot = snapshot,
                    isReleasing = false,
                    mutationEnabled = true,
                    onRelease = {},
                )
            }
        }

        composeRule.onAllNodesWithTag("device_health.signal_quality_notice").assertCountEquals(0)
        composeRule.onNodeWithTag("device_health.metric.signal_quality")
            .assertTextContains("Thu được tín hiệu")
    }
}
