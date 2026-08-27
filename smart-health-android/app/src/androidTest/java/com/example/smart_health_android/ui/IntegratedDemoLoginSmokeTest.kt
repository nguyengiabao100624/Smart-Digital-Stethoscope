package com.example.smart_health_android.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.printToString
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.smart_health_android.BuildConfig
import com.example.smart_health_android.MainActivity
import com.example.smart_health_android.security.LoginAccountMode
import com.example.smart_health_android.security.ProductionLoginRepository
import kotlinx.coroutines.runBlocking
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class IntegratedDemoLoginSmokeTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun patientDemoAccountReachesTheRealPatientDashboard() {
        assumeTrue(
            "This smoke requires the explicit local Firebase Auth emulator build.",
            BuildConfig.SHCARE_FIREBASE_AUTH_EMULATOR_HOST.isNotBlank(),
        )

        composeRule.waitUntil(timeoutMillis = 20_000) {
            composeRule.onAllNodesWithTag("login.email").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("patient-dashboard.content")
                    .fetchSemanticsNodes()
                    .isNotEmpty()
        }
        if (composeRule.onAllNodesWithTag("login.email").fetchSemanticsNodes().isNotEmpty()) {
            composeRule.onNodeWithTag("login.mode.patient").performClick()
            composeRule.onNodeWithTag("login.email").performTextReplacement("patient@example.com")
            composeRule.onNodeWithTag("login.password").performTextReplacement("12345678")
            composeRule.onNodeWithTag("login.submit").performClick()
        }

        val reachedDashboard = runCatching {
            composeRule.waitUntil(timeoutMillis = 30_000) {
                composeRule.onAllNodesWithTag("patient-dashboard.content")
                    .fetchSemanticsNodes()
                    .isNotEmpty()
            }
        }.isSuccess
        check(reachedDashboard) {
            val repositoryProbe = runCatching {
                runBlocking {
                    ProductionLoginRepository(composeRule.activity.applicationContext).signIn(
                        mode = LoginAccountMode.Patient,
                        email = "patient@example.com",
                        password = "12345678",
                    )
                }
            }.fold(
                onSuccess = { "Production repository probe unexpectedly succeeded with ${it::class.simpleName}." },
                onFailure = { "Production repository probe failed: ${it::class.qualifiedName}: ${it.message}" },
            )
            val loginError = composeRule.onAllNodesWithTag("login.error")
                .fetchSemanticsNodes()
                .firstOrNull()
                ?.config
                ?.toString()
                .orEmpty()
            "Patient login did not reach the dashboard. Current semantics:\n" +
                "$repositoryProbe\n" +
                "Login error semantics: $loginError\n" +
                composeRule.onRoot(useUnmergedTree = true).printToString(maxDepth = 8)
        }
        composeRule.onNodeWithTag("patient-dashboard.content").assertIsDisplayed()
        composeRule.onNodeWithTag("patient-dashboard.search").assertIsDisplayed()
        if (composeRule.onAllNodesWithTag("patient-dashboard.device").fetchSemanticsNodes().isNotEmpty()) {
            composeRule.onNodeWithTag("patient-dashboard.device").performClick()
            composeRule.waitUntil(timeoutMillis = 10_000) {
                composeRule.onAllNodesWithTag("device_management.configure_wifi")
                    .fetchSemanticsNodes()
                    .isNotEmpty()
            }
            composeRule.onNodeWithTag("device_management.configure_wifi")
                .performScrollTo()
                .assertIsDisplayed()
            check(
                composeRule.onAllNodesWithTag("device_pairing.entry")
                    .fetchSemanticsNodes()
                    .isEmpty(),
            ) {
                "A paired dashboard device must open Device Management, not Device ID pairing."
            }
        } else {
            composeRule.onNodeWithTag("patient-dashboard.device.pair").performClick()
            composeRule.waitUntil(timeoutMillis = 10_000) {
                composeRule.onAllNodesWithTag("device_pairing.entry")
                    .fetchSemanticsNodes()
                    .isNotEmpty()
            }
            composeRule.onNodeWithTag("device_pairing.entry").assertIsDisplayed()
            composeRule.onNodeWithTag("device_pairing.device_id").assertIsDisplayed()
        }
    }
}
