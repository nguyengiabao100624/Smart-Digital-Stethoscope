package com.example.smart_health_android.navigation

import androidx.compose.runtime.staticCompositionLocalOf
import com.example.smart_health_android.data.AuthUser
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

internal const val MOBILE_AUTHORITY_MAX_AGE_MILLIS = 30_000L

internal data class MobileAuthorityReauthorizationRuntime(
    val coordinator: MobileAuthorityReauthorizationCoordinator,
    val onResult: (MobileReauthorizationResult) -> Unit,
)

internal val LocalMobileAuthorityReauthorizationRuntime =
    staticCompositionLocalOf<MobileAuthorityReauthorizationRuntime?> { null }

sealed interface MobileReauthorizationResult {
    data object NotRequired : MobileReauthorizationResult

    data object NoActiveAuthority : MobileReauthorizationResult

    data object AlreadyInProgress : MobileReauthorizationResult

    data object AuthenticationSessionChanged : MobileReauthorizationResult

    data class Accepted(
        val authority: MobileSessionAuthority,
        val authorityChanged: Boolean,
    ) : MobileReauthorizationResult

    data class Rejected(
        val reason: MobileAuthorityRejection,
    ) : MobileReauthorizationResult

    data class Failed(
        val cause: Throwable,
    ) : MobileReauthorizationResult
}

/**
 * Re-checks the current backend account/workspace authority before protected content is composed
 * after a foreground transition or once the short authority TTL expires.
 *
 * A failed or ambiguous refresh clears the in-memory authority. Callers must then replace the
 * protected back stack with the startup route, where connectivity and authentication recovery are
 * shown without retaining a previously composed PHI screen.
 */
class MobileAuthorityReauthorizationCoordinator(
    private val authorityStore: MobileSessionAuthorityStore,
    private val loadCurrentUser: suspend () -> AuthUser,
    private val currentFirebaseUserId: () -> String,
    private val currentAuthSessionEpoch: () -> Long,
    private val elapsedRealtimeMillis: () -> Long,
    private val maxAgeMillis: Long = MOBILE_AUTHORITY_MAX_AGE_MILLIS,
) {
    private val mutex = Mutex()

    init {
        require(maxAgeMillis >= 0L)
    }

    /**
     * Called synchronously from ON_START so retained protected content is gated before the first
     * resumed frame. The returned authority is a one-shot ticket for
     * [completeForegroundReauthorization].
     */
    fun beginForegroundReauthorization(): MobileSessionAuthority? =
        authorityStore.beginReauthorization()

    fun resumeOrBeginForegroundReauthorization(): MobileSessionAuthority? {
        val state = authorityStore.state.value
        return if (state.reauthorizing) state.authority else authorityStore.beginReauthorization()
    }

    fun needsReauthorizationNow(): Boolean {
        return authorityStore.needsReauthorization(
            elapsedRealtimeMillis = elapsedRealtimeMillis(),
            maxAgeMillis = maxAgeMillis,
        )
    }

    fun millisUntilReauthorization(): Long? {
        val state = authorityStore.state.value
        if (state.authority == null || state.reauthorizing) return null
        val verifiedAt = state.verifiedAtElapsedRealtimeMillis
        val now = elapsedRealtimeMillis()
        if (verifiedAt <= 0L || now < verifiedAt) return 0L
        return (maxAgeMillis - (now - verifiedAt)).coerceAtLeast(0L)
    }

    suspend fun completeForegroundReauthorization(
        expectedAuthority: MobileSessionAuthority,
    ): MobileReauthorizationResult = mutex.withLock {
        val state = authorityStore.state.value
        val active = state.authority
            ?: return@withLock MobileReauthorizationResult.NoActiveAuthority
        if (!state.reauthorizing) {
            return@withLock MobileReauthorizationResult.NotRequired
        }
        if (active != expectedAuthority) {
            return@withLock MobileReauthorizationResult.AlreadyInProgress
        }
        refresh(expectedAuthority = expectedAuthority, activeAuthority = active)
    }

    suspend fun reauthorize(force: Boolean): MobileReauthorizationResult {
        val requestedAt = elapsedRealtimeMillis()
        return mutex.withLock {
            val state = authorityStore.state.value
            val active = state.authority
                ?: return@withLock MobileReauthorizationResult.NoActiveAuthority

            if (state.reauthorizing) {
                return@withLock MobileReauthorizationResult.AlreadyInProgress
            }

            val refreshedAfterRequest =
                state.verifiedAtElapsedRealtimeMillis > 0L &&
                    state.verifiedAtElapsedRealtimeMillis >= requestedAt
            if (
                (!force && !authorityStore.needsReauthorization(requestedAt, maxAgeMillis)) ||
                (force && refreshedAfterRequest)
            ) {
                return@withLock MobileReauthorizationResult.NotRequired
            }

            val expectedAuthority = authorityStore.beginReauthorization()
                ?: return@withLock MobileReauthorizationResult.AlreadyInProgress
            refresh(expectedAuthority = expectedAuthority, activeAuthority = active)
        }
    }

    private suspend fun refresh(
        expectedAuthority: MobileSessionAuthority,
        activeAuthority: MobileSessionAuthority,
    ): MobileReauthorizationResult {
        val expectedAuthSessionEpoch = currentAuthSessionEpoch()
        return try {
            val user = loadCurrentUser()
            if (currentAuthSessionEpoch() != expectedAuthSessionEpoch) {
                clearAuthorityIfCurrent(expectedAuthority)
                return MobileReauthorizationResult.AuthenticationSessionChanged
            }
            val update = authorityStore.completeReauthorization(
                user = user,
                expectedAuthority = expectedAuthority,
                firebaseUserId = currentFirebaseUserId(),
                verifiedAtElapsedRealtimeMillis = elapsedRealtimeMillis(),
            )
            when (update) {
                is MobileAuthorityUpdate.Accepted -> {
                    if (currentAuthSessionEpoch() != expectedAuthSessionEpoch) {
                        authorityStore.invalidateIfCurrent(update.authority)
                        MobileReauthorizationResult.AuthenticationSessionChanged
                    } else {
                        MobileReauthorizationResult.Accepted(
                            authority = update.authority,
                            authorityChanged = update.authority.epoch != activeAuthority.epoch,
                        )
                    }
                }

                is MobileAuthorityUpdate.Rejected -> {
                    clearAuthorityIfCurrent(expectedAuthority)
                    MobileReauthorizationResult.Rejected(update.reason)
                }
            }
        } catch (error: CancellationException) {
            // Activity/configuration replacement cancels the old composition scope. Preserve the
            // fail-closed lock so the replacement coordinator can resume the same authority
            // refresh; protected routes remain uncomposed while it is in flight.
            throw error
        } catch (error: Throwable) {
            clearAuthorityIfCurrent(expectedAuthority)
            MobileReauthorizationResult.Failed(error)
        }
    }

    private fun clearAuthorityIfCurrent(expectedAuthority: MobileSessionAuthority) {
        authorityStore.clearIfCurrent(expectedAuthority)
    }
}
