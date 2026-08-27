package com.example.smart_health_android.devices

import android.os.Build
import android.view.WindowManager
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.printToString
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.example.smart_health_android.BuildConfig
import com.example.smart_health_android.MainActivity
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PhysicalDeviceProvisioningHilTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun assignedDeviceOpensDeviceManagementThenNativeSoftApFlow() {
        preparePhysicalDeviceUi()
        val arguments = InstrumentationRegistry.getArguments()
        assumeTrue(
            "This physical provisioning HIL runs only when explicitly enabled.",
            arguments.getString("shcareProvisioningHil").equals("true", ignoreCase = true),
        )
        assertTrue(
            "The physical provisioning HIL requires the explicit local Firebase emulator build.",
            BuildConfig.SHCARE_FIREBASE_AUTH_EMULATOR_HOST.isNotBlank(),
        )
        val passwordInputTimeoutMillis = arguments
            .getString("shcareProvisioningInputTimeoutMs")
            ?.toLongOrNull()
            ?.coerceIn(60_000L, 3_600_000L)
            ?: 3_600_000L
        val deviceId = arguments.getString("shcareProvisioningDeviceId")
            ?.trim()
            ?.ifBlank { "shcare-g3-hil" }
            ?: "shcare-g3-hil"
        check(deviceId.matches(Regex("^[A-Za-z0-9][A-Za-z0-9_-]{2,62}$"))) {
            "The HIL Device ID is malformed."
        }

        composeRule.waitUntil(timeoutMillis = 20_000) {
            hasNode("login.email") ||
                hasNode("patient-dashboard.content") ||
                hasNode("device_pairing.entry")
        }
        if (hasNode("login.email")) {
            composeRule.onNodeWithTag("login.mode.patient").performClick()
            composeRule.onNodeWithTag("login.email").performTextReplacement("patient@example.com")
            composeRule.onNodeWithTag("login.password").performTextReplacement("12345678")
            composeRule.onNodeWithTag("login.submit").performClick()
        }

        if (!hasNode("device_pairing.entry")) {
            composeRule.waitUntil(timeoutMillis = 30_000) {
                hasNode("patient-dashboard.content")
            }
            if (hasNode("patient-dashboard.device")) {
                composeRule.onNodeWithTag("patient-dashboard.device").performClick()
                composeRule.waitUntil(timeoutMillis = 30_000) {
                    hasNode("device_management.configure_wifi") ||
                        hasNode("device_management.error")
                }
            } else {
                composeRule.onNodeWithTag("patient-dashboard.device.pair").performClick()
            }
        }
        if (!hasNode("device_management.configure_wifi")) {
            composeRule.waitUntil(timeoutMillis = 15_000) {
                hasNode("device_pairing.entry")
            }
            composeRule.onNodeWithTag("device_pairing.entry").assertIsDisplayed()
            composeRule.onNodeWithTag("device_pairing.device_id")
                .performTextReplacement(deviceId)
            composeRule.onNodeWithTag("device_pairing.submit_manual")
                .assertIsEnabled()
                .performSemanticsAction(SemanticsActions.OnClick)

            composeRule.waitUntil(timeoutMillis = 45_000) {
                hasNode("device_management.configure_wifi") ||
                    hasNode("device_pairing.error") ||
                    hasNode("device_pairing.permission_denied")
            }
        }
        check(hasNode("device_management.configure_wifi")) {
            "The assigned Device ID did not return to Device Settings."
        }
        composeRule.onNodeWithTag("device_management.configure_wifi")
            .performScrollTo()
            .assertIsDisplayed()
            .performClick()

        val openedSetup = runCatching {
            composeRule.waitUntil(timeoutMillis = 45_000) {
                hasNode("device_wifi.surface") &&
                    (
                        hasNode("device_pairing.setup_ready") ||
                            hasNode("device_wifi.error") ||
                            hasNode("device_wifi.permission_denied")
                    )
            }
        }.isSuccess
        check(openedSetup) {
            val semantics = runCatching {
                composeRule.onRoot(useUnmergedTree = true).printToString(maxDepth = 8)
            }.getOrElse { error ->
                "Compose semantics unavailable (${error::class.simpleName})."
            }
            "The Wi-Fi setup route did not settle. Current semantics:\n$semantics"
        }
        check(hasNode("device_wifi.surface") && hasNode("device_pairing.setup_ready")) {
            "The authorized SoftAP setup session did not reach the native Wi-Fi step."
        }
        check(!hasNode("device_pairing.entry")) {
            "Wi-Fi setup must not fall back to the Device ID pairing surface."
        }
        composeRule.onNodeWithTag("device_pairing.setup_ready").assertIsDisplayed()
        composeRule.onNodeWithTag("device_pairing.target_wifi_ssid").assertIsDisplayed()
        composeRule.onNodeWithTag("device_pairing.use_current_wifi").assertIsDisplayed()
        composeRule.onNodeWithTag("device_pairing.target_wifi_password")
            .assertIsDisplayed()
            .performClick()

        if (arguments.getString("shcareProvisioningStopAtPassword").equals("true", ignoreCase = true)) {
            return
        }

        // The Wi-Fi password is deliberately never supplied through ADB,
        // instrumentation arguments, source, environment variables or logs.
        // Keep the real App responsive while the user enters it in the secure
        // on-device field, then continue the rest of the HIL automatically.
        composeRule.waitUntil(timeoutMillis = passwordInputTimeoutMillis) {
            editableFieldHasText("device_pairing.target_wifi_password") ||
                hasNode("device_pairing.provisioning") ||
                hasNode("device_pairing.awaiting_online") ||
                hasNode("device_pairing.success")
        }
        if (
            hasNode("device_pairing.setup_ready") &&
            editableFieldHasText("device_pairing.target_wifi_password")
        ) {
            composeRule.onNodeWithTag("device_pairing.provision_in_app")
                .assertIsEnabled()
                .performSemanticsAction(SemanticsActions.OnClick)
        }

        composeRule.waitUntil(timeoutMillis = 300_000) {
            hasNode("device_management.configure_wifi") ||
                hasNode("device_wifi.error") ||
                hasNode("device_pairing.retry_online") ||
                (
                    hasNode("device_pairing.setup_ready") &&
                        !editableFieldHasText("device_pairing.target_wifi_password")
                )
        }
        check(hasNode("device_management.configure_wifi")) {
            "SoftAP provisioning did not return to the configured device settings."
        }
        composeRule.onNodeWithTag("device_management.configure_wifi").assertIsDisplayed()
    }

    private fun hasNode(testTag: String): Boolean =
        runCatching {
            composeRule.onAllNodesWithTag(testTag).fetchSemanticsNodes().isNotEmpty()
        }.getOrDefault(false)

    private fun editableFieldHasText(testTag: String): Boolean = runCatching {
        composeRule.onNodeWithTag(testTag)
            .fetchSemanticsNode()
            .config[SemanticsProperties.EditableText]
            .text
            .isNotBlank()
    }.getOrDefault(false)

    private fun preparePhysicalDeviceUi() {
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

}
