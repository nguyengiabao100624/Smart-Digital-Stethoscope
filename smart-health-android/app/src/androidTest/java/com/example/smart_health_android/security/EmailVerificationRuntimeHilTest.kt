package com.example.smart_health_android.security

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.example.smart_health_android.BuildConfig
import com.google.android.gms.tasks.Tasks
import com.google.firebase.auth.FirebaseAuth
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Read-only HIL probe for the account already signed in on a debuggable device.
 * The probe deliberately never logs the Firebase ID token.
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
    }
}
