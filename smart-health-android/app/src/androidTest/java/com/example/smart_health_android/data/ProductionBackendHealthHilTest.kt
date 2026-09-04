package com.example.smart_health_android.data

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Opt-in device check that exercises the same OkHttp/JSON path as the splash screen.
 * It intentionally logs neither authentication material nor response bodies.
 */
@RunWith(AndroidJUnit4::class)
class ProductionBackendHealthHilTest {
    @Test
    fun installedAppCanReachConfiguredProductionBackend() = runBlocking {
        val arguments = InstrumentationRegistry.getArguments()
        assumeTrue(
            "This production connectivity check runs only when explicitly enabled.",
            arguments.getString("shcareBackendHealthHil").equals("true", ignoreCase = true),
        )

        val health = runCatching { SmartHealthApi().getHealth() }
            .getOrElse { error ->
                throw AssertionError(
                    "Configured backend health failed with ${error::class.java.name}: ${error.message}",
                    error,
                )
            }

        assertTrue("Configured backend responded but did not report ok=true.", health.ok)
    }
}
