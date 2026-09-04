package com.example.smart_health_android.startup

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Opt-in, read-only diagnosis of the authenticated splash bootstrap on a real phone. */
@RunWith(AndroidJUnit4::class)
class SplashBootstrapHilTest {
    @Test
    fun currentSessionCompletesEachBootstrapBoundary() {
        runBlocking {
            val instrumentation = InstrumentationRegistry.getInstrumentation()
            val arguments = InstrumentationRegistry.getArguments()
            assumeTrue(
                "This authenticated startup check runs only when explicitly enabled.",
                arguments.getString("shcareSplashHil").equals("true", ignoreCase = true),
            )
            val gateway = DefaultSplashBootstrapGateway(instrumentation.targetContext)

            step("backend health") { assertTrue(gateway.checkHealth()) }
            val owner = step("Firebase owner pin") { gateway.pinnedFirebaseOwner() }
                ?: return@runBlocking
            assertNotNull(owner)

            val token = step("Firebase ID token") { gateway.existingSessionToken() }
            assertTrue("Firebase owner exists but no ID token was available.", !token.isNullOrBlank())

            val verified = step("Firebase email reload") { gateway.reloadCurrentUser() }
            if (!verified) return@runBlocking

            step("backend Firebase exchange") { gateway.authenticateCurrentUser() }
        }
    }

    private suspend fun <T> step(name: String, block: suspend () -> T): T =
        runCatching { block() }.getOrElse { error ->
            throw AssertionError(
                "Splash boundary '$name' failed with ${error::class.java.name}: ${error.message}",
                error,
            )
        }
}
