package com.example.smart_health_android.security

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.example.smart_health_android.BuildConfig
import com.example.smart_health_android.data.FirebaseAuthService
import com.example.smart_health_android.data.PendingRegistrationStore
import com.example.smart_health_android.data.SmartHealthApiException
import com.google.android.gms.tasks.Tasks
import com.google.firebase.auth.FirebaseAuth
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Explicit HIL probe for the account already signed in on a debuggable device.
 * It executes the same owner-bound completion workflow as the verification UI
 * and deliberately never logs the Firebase ID token.
 */
@RunWith(AndroidJUnit4::class)
class EmailVerificationRuntimeHilTest {
    @Test
    fun verifiedFirebaseAccountIsAcceptedByProductionBackend() {
        assumeTrue(
            "This HIL test requires an explicitly authorized, verified account on the device.",
            InstrumentationRegistry.getArguments()
                .getString("SHCARE_EMAIL_VERIFICATION_HIL") == "true",
        )
        val auth = FirebaseAuth.getInstance()
        val staleUser = auth.currentUser ?: error("No Firebase account is signed in")

        Tasks.await(staleUser.reload(), 30, TimeUnit.SECONDS)
        val currentUser = auth.currentUser ?: error("Firebase account disappeared after reload")
        assertEquals(staleUser.uid, currentUser.uid)
        assertTrue("Firebase has not recorded email verification", currentUser.isEmailVerified)

        val tokenResult = Tasks.await(currentUser.getIdToken(true), 30, TimeUnit.SECONDS)
        val idToken = tokenResult.token
        assertTrue("Firebase returned an empty ID token", !idToken.isNullOrBlank())

        val connection = URL(
            "${BuildConfig.SMART_HEALTH_BASE_URL.trimEnd('/')}/api/v1/auth/firebase",
        ).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "GET"
            connection.connectTimeout = 30_000
            connection.readTimeout = 60_000
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Authorization", "Bearer $idToken")
            val status = connection.responseCode
            val errorBody = if (status >= 400) {
                connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
            } else {
                ""
            }
            assertEquals("Backend rejected the refreshed Firebase token: $errorBody", 200, status)
        } finally {
            connection.disconnect()
        }

        val targetContext = InstrumentationRegistry.getInstrumentation().targetContext
        val owner = FirebaseAuthService.currentOwnerBindingOrNull()
            ?: error("Firebase owner binding is unavailable")
        val pendingRegistration = PendingRegistrationStore.loadForFirebaseOwner(
            context = targetContext,
            firebaseUserId = owner.firebaseUserId,
            firebaseEmail = owner.email,
        )
        val completed = try {
            runBlocking {
                ProductionEmailVerificationRepository(
                    context = targetContext,
                    fallbackAccountType = pendingRegistration?.accountType ?: "personal",
                    expectedOwner = owner,
                ).checkStatus()
            }
        } catch (error: Throwable) {
            val apiError = error as? SmartHealthApiException
            throw AssertionError(
                "Verification completion failed for " +
                    "accountType=${pendingRegistration?.accountType.orEmpty()}, " +
                    "organizationId=${pendingRegistration?.organizationId.orEmpty()}: " +
                    "status=${apiError?.statusCode}, code=${apiError?.code}, " +
                    "requestId=${apiError?.requestId}, details=${apiError?.details}, " +
                    "message=${error.message}",
                error,
            )
        }
        assertTrue(
            "The production email-verification workflow did not complete",
            completed is EmailVerificationCheckResult.Verified,
        )
    }
}
