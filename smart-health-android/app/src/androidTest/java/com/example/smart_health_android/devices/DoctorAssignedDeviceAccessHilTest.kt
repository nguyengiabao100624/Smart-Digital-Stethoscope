package com.example.smart_health_android.devices

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.example.smart_health_android.MainActivity
import org.junit.Assert.assertFalse
import org.junit.Rule
import org.junit.Test
import org.junit.Assume.assumeTrue
import org.junit.runner.RunWith

/**
 * Opt-in production canary for the exact doctor flow reported by the user.
 *
 * This test deliberately reuses the already authenticated account on the physical phone. It does
 * not accept credentials through instrumentation arguments and it does not mutate device ownership.
 */
@RunWith(AndroidJUnit4::class)
class DoctorAssignedDeviceAccessHilTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun assignedDoctorCanOpenDeviceAndReachWifiWithoutManagementActions() {
        val arguments = InstrumentationRegistry.getArguments()
        assumeTrue(
            "This production doctor canary must be explicitly enabled.",
            arguments.getString("shcareDoctorDeviceHil").equals("true", ignoreCase = true),
        )

        composeRule.waitUntil(timeoutMillis = 45_000) {
            hasNode("doctor-dashboard.screen") || hasNode("login.email")
        }
        assertFalse(
            "The Xiaomi no longer has the authenticated doctor session required by this canary.",
            hasNode("login.email"),
        )

        composeRule.onNodeWithTag("doctor-dashboard.device")
            .assertIsDisplayed()
            .performClick()

        composeRule.waitUntil(timeoutMillis = 45_000) {
            hasNode("device_management.configure_wifi") ||
                hasNode("device_management.error") ||
                hasNode("login.email")
        }
        composeRule.onNodeWithTag("device_management.configure_wifi")
            .performScrollTo()
            .assertIsDisplayed()
        assertFalse(
            "A doctor with assigned-device access must not receive the platform Add action.",
            hasNode("device_management.add"),
        )
        assertFalse(
            "A doctor with assigned-device access must not receive the ownership Release action.",
            hasNode("device_management.release"),
        )

        composeRule.onNodeWithTag("device_management.configure_wifi").performClick()
        composeRule.waitUntil(timeoutMillis = 45_000) {
            hasNode("device_wifi.surface") || hasNode("login.email")
        }
        composeRule.onNodeWithTag("device_wifi.surface").assertIsDisplayed()
    }

    private fun hasNode(testTag: String): Boolean =
        runCatching {
            composeRule.onAllNodesWithTag(testTag).fetchSemanticsNodes().isNotEmpty()
        }.getOrDefault(false)
}
