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
import com.google.android.gms.tasks.Tasks
import com.google.firebase.auth.FirebaseAuth
import java.io.File
import java.util.concurrent.TimeUnit
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

        restoreOneTimeFirebaseSessionIfProvided()

        composeRule.waitUntil(timeoutMillis = 45_000) {
            hasNode("doctor-dashboard.screen") || hasNode("login.email")
        }
        assertFalse(
            "The Xiaomi no longer has the authenticated doctor session required by this canary.",
            hasNode("login.email"),
        )

        composeRule.waitUntil(timeoutMillis = 60_000) {
            hasNode("doctor-dashboard.content") ||
                hasNode("doctor-dashboard.state.permission") ||
                hasNode("doctor-dashboard.state.offline") ||
                hasNode("doctor-dashboard.state.error") ||
                hasNode("login.email")
        }
        check(hasNode("doctor-dashboard.content")) {
            "The authenticated doctor dashboard did not reach its backend-confirmed content state."
        }

        composeRule.onNodeWithTag("doctor-dashboard.device")
            .performScrollTo()
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

    private fun restoreOneTimeFirebaseSessionIfProvided() {
        val tokenFile = File(composeRule.activity.filesDir, OneTimeTokenFileName)
        if (!tokenFile.isFile) return

        val customToken = tokenFile.readText(Charsets.UTF_8).trim()
        check(tokenFile.delete()) { "The one-time Firebase token could not be deleted before use." }
        check(customToken.isNotBlank()) { "The one-time Firebase token file was empty." }
        Tasks.await(
            FirebaseAuth.getInstance().signInWithCustomToken(customToken),
            30,
            TimeUnit.SECONDS,
        )
        composeRule.activityRule.scenario.recreate()
    }

    private companion object {
        const val OneTimeTokenFileName = "doctor-device-canary.custom-token"
    }
}
