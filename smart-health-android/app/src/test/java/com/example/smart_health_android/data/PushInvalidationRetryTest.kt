package com.example.smart_health_android.data

import java.io.IOException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PushInvalidationRetryTest {
    @Test
    fun `failed token deletion preserves the durable retry marker`() = runTest {
        var pending = true
        var deleteCalls = 0
        val retry = PushInvalidationRetry(
            isPending = { pending },
            deleteToken = {
                deleteCalls += 1
                throw IOException("FCM unavailable")
            },
            clearPending = {
                pending = false
                true
            },
        )

        assertFalse(retry.retryIfPending())
        assertTrue(pending)
        assertEquals(1, deleteCalls)
    }

    @Test
    fun `a later successful retry invalidates the token and clears the marker`() = runTest {
        var pending = true
        var shouldFail = true
        var deleteCalls = 0
        val retry = PushInvalidationRetry(
            isPending = { pending },
            deleteToken = {
                deleteCalls += 1
                if (shouldFail) throw IOException("FCM unavailable")
            },
            clearPending = {
                pending = false
                true
            },
        )

        assertFalse(retry.retryIfPending())
        shouldFail = false
        assertTrue(retry.retryIfPending())

        assertFalse(pending)
        assertEquals(2, deleteCalls)
    }

    @Test
    fun `delayed worker cannot delete a token after a new login cleared the marker`() = runTest {
        var pending = false
        var deleteCalls = 0
        val retry = PushInvalidationRetry(
            isPending = { pending },
            deleteToken = { deleteCalls += 1 },
            clearPending = {
                pending = false
                true
            },
        )

        assertTrue(retry.retryIfPending())
        assertEquals(0, deleteCalls)
    }

    @Test
    fun `provider timeout preserves the marker for a later retry`() = runTest {
        var pending = true
        val retry = PushInvalidationRetry(
            isPending = { pending },
            deleteToken = { delay(10_000) },
            clearPending = {
                pending = false
                true
            },
            tokenDeletionTimeoutMillis = 100,
        )

        assertFalse(retry.retryIfPending())
        assertTrue(pending)
    }

    @Test
    @OptIn(ExperimentalCoroutinesApi::class)
    fun `caller cancellation is never mistaken for the local provider timeout`() = runTest {
        var pending = true
        var returned = false
        val retry = PushInvalidationRetry(
            isPending = { pending },
            deleteToken = { awaitCancellation() },
            clearPending = {
                pending = false
                true
            },
            tokenDeletionTimeoutMillis = 10_000,
        )
        val caller = launch {
            retry.retryIfPending()
            returned = true
        }
        runCurrent()

        caller.cancelAndJoin()

        assertTrue(caller.isCancelled)
        assertFalse(returned)
        assertTrue(pending)
    }
}
