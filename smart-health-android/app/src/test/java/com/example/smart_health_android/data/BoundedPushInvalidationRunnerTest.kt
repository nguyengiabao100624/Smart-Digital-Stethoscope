package com.example.smart_health_android.data

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BoundedPushInvalidationRunnerTest {
    @Test
    fun `retries with bounded backoff until invalidation succeeds`() = runTest {
        var calls = 0
        val delays = mutableListOf<Long>()
        val runner = BoundedPushInvalidationRunner(
            retry = {
                calls += 1
                calls >= 3
            },
            delayBeforeRetry = { delays += it },
            maxAttempts = 3,
            initialDelayMillis = 100,
        )

        assertTrue(runner.run())
        assertEquals(3, calls)
        assertEquals(listOf(100L, 200L), delays)
    }

    @Test
    fun `stops after the bounded attempt count and leaves durable state to startup`() = runTest {
        var calls = 0
        val runner = BoundedPushInvalidationRunner(
            retry = {
                calls += 1
                false
            },
            delayBeforeRetry = {},
            maxAttempts = 3,
            initialDelayMillis = 100,
        )

        assertFalse(runner.run())
        assertEquals(3, calls)
    }
}
