package com.example.smart_health_android.data

import java.util.Locale
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.filterNotNull

data class SmartHealthAuthorizationInvalidation(
    val statusCode: Int,
    val code: String,
    val requestId: String,
    val authSessionEpoch: Long,
    val deliveryId: Long = 0L,
)

internal data class SmartHealthAuthorizationRequestContext(
    val authSessionEpoch: Long,
)

object SmartHealthAuthorizationEvents {
    private const val MaxPendingEvents = 32
    private val pendingEvents = ArrayDeque<SmartHealthAuthorizationInvalidation>()
    private val pendingHead =
        MutableStateFlow<SmartHealthAuthorizationInvalidation?>(null)
    private var nextDeliveryId = 1L

    /**
     * The bounded head remains replayable until the navigation owner acknowledges it. An Activity
     * cancelled after receiving an event therefore cannot remove the invalidation before its
     * teardown/navigation side effects finish. Repeated handling is safe and idempotent.
     */
    val events: Flow<SmartHealthAuthorizationInvalidation> = pendingHead.filterNotNull()

    @Synchronized
    internal fun publishIfTerminal(
        exception: SmartHealthApiException,
        authSessionEpoch: Long,
    ): Boolean {
        if (!exception.isTerminalAuthorizationFailure()) return false
        if (pendingEvents.size == MaxPendingEvents) {
            // Never evict the unacknowledged head: it may already belong to a cancelled Activity
            // whose replacement still has to perform teardown. Sacrifice the newest queued tail
            // entry instead; every terminal event is idempotent and the head remains authoritative.
            pendingEvents.removeLast()
        }
        val event = SmartHealthAuthorizationInvalidation(
            statusCode = exception.statusCode,
            code = exception.code,
            requestId = exception.requestId,
            authSessionEpoch = authSessionEpoch,
            deliveryId = nextDeliveryId,
        )
        nextDeliveryId = if (nextDeliveryId == Long.MAX_VALUE) 1L else nextDeliveryId + 1L
        pendingEvents.addLast(event)
        pendingHead.value = pendingEvents.firstOrNull()
        return true
    }

    @Synchronized
    internal fun acknowledge(event: SmartHealthAuthorizationInvalidation): Boolean {
        if (pendingEvents.firstOrNull()?.deliveryId != event.deliveryId) {
            return false
        }
        pendingEvents.removeFirst()
        pendingHead.value = pendingEvents.firstOrNull()
        return true
    }
}

fun SmartHealthApiException.isTerminalAuthorizationFailure(): Boolean {
    if (statusCode == 401) return true
    return code.trim().uppercase(Locale.ROOT) in TerminalAuthorizationFailureCodes
}

fun SmartHealthAuthorizationInvalidation.requiresFullLocalTermination(): Boolean {
    if (statusCode == 401) return true
    return code.trim().uppercase(Locale.ROOT) in AccountTerminalAuthorizationFailureCodes
}

private val AccountTerminalAuthorizationFailureCodes = setOf(
    "ACCOUNT_LOCKED",
    "ACCOUNT_NOT_FOUND",
)

private val TerminalAuthorizationFailureCodes = setOf(
    *AccountTerminalAuthorizationFailureCodes.toTypedArray(),
    "WORKSPACE_MEMBERSHIP_REQUIRED",
    "WORKSPACE_ARCHIVED",
)
