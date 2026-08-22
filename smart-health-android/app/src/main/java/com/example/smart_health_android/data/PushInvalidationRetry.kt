package com.example.smart_health_android.data

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeoutOrNull

internal class PushInvalidationRetry(
    private val isPending: () -> Boolean,
    private val deleteToken: suspend () -> Unit,
    private val clearPending: () -> Boolean,
    private val tokenDeletionTimeoutMillis: Long = TOKEN_DELETION_TIMEOUT_MILLIS,
) {
    suspend fun retryIfPending(): Boolean {
        if (!isPending()) return true
        return try {
            val deleted = withTimeoutOrNull(tokenDeletionTimeoutMillis) {
                deleteToken()
                true
            } ?: false
            deleted && clearPending()
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            false
        }
    }

    private companion object {
        const val TOKEN_DELETION_TIMEOUT_MILLIS = 5_000L
    }
}

internal class BoundedPushInvalidationRunner(
    private val retry: suspend () -> Boolean,
    private val delayBeforeRetry: suspend (Long) -> Unit = { delay(it) },
    private val maxAttempts: Int = MAX_ATTEMPTS,
    private val initialDelayMillis: Long = INITIAL_DELAY_MILLIS,
) {
    init {
        require(maxAttempts > 0)
        require(initialDelayMillis >= 0)
    }

    suspend fun run(): Boolean {
        repeat(maxAttempts) { attempt ->
            if (retry()) return true
            if (attempt < maxAttempts - 1) {
                delayBeforeRetry(initialDelayMillis shl attempt)
            }
        }
        return false
    }

    private companion object {
        const val MAX_ATTEMPTS = 3
        const val INITIAL_DELAY_MILLIS = 500L
    }
}
