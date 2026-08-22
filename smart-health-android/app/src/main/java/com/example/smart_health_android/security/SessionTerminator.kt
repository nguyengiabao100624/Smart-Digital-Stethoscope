package com.example.smart_health_android.security

import com.example.smart_health_android.data.FirebaseAuthService
import com.example.smart_health_android.data.FirebaseOwnerBinding
import com.example.smart_health_android.data.AuthSessionAuthority
import com.example.smart_health_android.data.SmartHealthPushRegistrar
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.notifications.SmartHealthNotificationCenter
import com.example.smart_health_android.notifications.SmartHealthNotificationSession
import com.example.smart_health_android.records.RecordAudioCache
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

internal data class SessionTerminationAuthority(
    val firebaseOwner: FirebaseOwnerBinding?,
    val backendAuthority: AuthSessionAuthority?,
) {
    fun ownsFirebaseOwner(expectedOwner: FirebaseOwnerBinding): Boolean {
        return expectedOwner.firebaseUserId.isNotBlank() &&
            expectedOwner.email.isNotBlank() &&
            expectedOwner.sessionEpoch > 0L &&
            firebaseOwner == expectedOwner
    }
}

internal class SessionTerminator(
    private val disableNotifications: () -> Unit,
    private val markPushInvalidationPending: () -> Unit,
    private val unregisterPush: suspend () -> Unit,
    private val logoutBackend: suspend () -> Unit,
    private val clearApiAuthentication: () -> Unit,
    private val signOutFirebase: () -> Unit,
    private val schedulePushInvalidation: () -> Unit,
    private val clearSensitiveCache: () -> Unit = {},
    private val remoteCleanupTimeoutMillis: Long = REMOTE_CLEANUP_TIMEOUT_MILLIS,
    private val unregisterTimeoutMillis: Long = UNREGISTER_TIMEOUT_MILLIS,
) {
    init {
        require(remoteCleanupTimeoutMillis >= 2)
        require(unregisterTimeoutMillis > 0)
    }

    suspend fun terminate() {
        try {
            runLocalStepBestEffort(disableNotifications)
            runLocalStepBestEffort(clearSensitiveCache)
            runLocalStepBestEffort(markPushInvalidationPending)
            withContext(NonCancellable) {
                runLocalStepBestEffort(signOutFirebase)
            }
            val unregisterBudget = minOf(
                unregisterTimeoutMillis,
                remoteCleanupTimeoutMillis / 2,
            )
            val logoutBudget = remoteCleanupTimeoutMillis - unregisterBudget
            try {
                withTimeoutOrNull(unregisterBudget) {
                    runRemoteStepBestEffort(unregisterPush)
                }
            } finally {
                // Logout must start only after token unregister has completed or timed out.
                // NonCancellable guarantees the session-revoke attempt still runs when the
                // caller leaves the screen, while its own timeout preserves the total bound.
                withContext(NonCancellable) {
                    withTimeoutOrNull(logoutBudget) {
                        runRemoteStepBestEffort(logoutBackend)
                    }
                }
            }
        } finally {
            withContext(NonCancellable) {
                try {
                    clearApiAuthentication()
                } finally {
                    schedulePushInvalidation()
                }
            }
        }
    }

    private suspend fun runRemoteStepBestEffort(action: suspend () -> Unit) {
        try {
            action()
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            // Backend cleanup is best-effort. The local session is cleared in the outer finally.
        }
    }

    private inline fun runLocalStepBestEffort(action: () -> Unit) {
        try {
            action()
        } catch (_: Exception) {
            // Every other teardown step must still run. The notification gate is closed first.
        }
    }

    private companion object {
        const val REMOTE_CLEANUP_TIMEOUT_MILLIS = 1_500L
        const val UNREGISTER_TIMEOUT_MILLIS = 500L
    }
}

object SmartHealthSessionTerminator {
    private fun createCoordinator(
        authority: SessionTerminationAuthority,
        onFirebaseSignOutResult: (Boolean) -> Unit = {},
    ) = SessionTerminator(
        disableNotifications = {
            runLocalStepBestEffort {
                SmartHealthNotificationSession.deactivateAndClearPostedNotifications {
                    SmartHealthNotificationCenter.clearAllPostedNotifications()
                }
            }
        },
        markPushInvalidationPending = { SmartHealthPushRegistrar.markLocalInvalidationPending() },
        unregisterPush = {
            authority.backendAuthority?.let {
                SmartHealthPushRegistrar.unregisterCurrentToken(it)
            }
        },
        logoutBackend = {
            authority.backendAuthority?.let {
                SmartHealthRepository.api.logout(it)
            }
        },
        clearApiAuthentication = {
            authority.backendAuthority?.let {
                SmartHealthRepository.api.clearAuthTokenIfCurrent(it)
            }
        },
        signOutFirebase = {
            val signedOut = authority.firebaseOwner?.let {
                FirebaseAuthService.signOutIfCurrentOwner(it)
            } ?: false
            onFirebaseSignOutResult(signedOut)
        },
        schedulePushInvalidation = {
            if (!hasReplacementAuthority(authority)) {
                SmartHealthPushRegistrar.scheduleLocalTokenInvalidation()
            }
        },
        clearSensitiveCache = {
            SmartHealthBiometricLocalUnlock.clear()
            RecordAudioCache.clear()
        },
    )

    suspend fun terminate() {
        createCoordinator(captureAuthority()).terminate()
    }

    suspend fun terminateIfCurrentFirebaseOwner(
        expectedFirebaseOwner: FirebaseOwnerBinding,
    ): Boolean {
        val authority = captureAuthority()
        if (!authority.ownsFirebaseOwner(expectedFirebaseOwner)) return false

        var signedOutExpectedUser = false
        createCoordinator(
            authority = authority,
            onFirebaseSignOutResult = { signedOutExpectedUser = it },
        ).terminate()
        return ownerBoundTerminationCanExitToLogin(
            signedOutExpectedUser = signedOutExpectedUser,
            replacementAuthorityPresent = hasReplacementAuthority(authority),
        )
    }

    /**
     * Fail-closed teardown for abandoning an authentication flow or replacing accounts.
     *
     * This path is synchronous because it is also used by back navigation and ViewModel
     * disposal. Remote unregister/logout remain the responsibility of [terminate] for an
     * established session; the durable local token marker prevents a later account from
     * reusing the previous installation token before provider invalidation succeeds.
     */
    fun terminateLocallyForAccountReplacement() {
        val authority = captureAuthority()
        terminateLocally(
            authority = authority,
            expectedFirebaseOwner = authority.firebaseOwner,
        )
    }

    fun terminateLocallyIfCurrentFirebaseOwner(
        expectedFirebaseOwner: FirebaseOwnerBinding,
    ): Boolean {
        val authority = captureAuthority()
        if (!authority.ownsFirebaseOwner(expectedFirebaseOwner)) return false
        return terminateLocally(
            authority = authority,
            expectedFirebaseOwner = expectedFirebaseOwner,
        )
    }

    private fun terminateLocally(
        authority: SessionTerminationAuthority,
        expectedFirebaseOwner: FirebaseOwnerBinding?,
    ): Boolean {
        runLocalStepBestEffort {
            SmartHealthNotificationSession.deactivateAndClearPostedNotifications {
                SmartHealthNotificationCenter.clearAllPostedNotifications()
            }
        }
        runLocalStepBestEffort { SmartHealthBiometricLocalUnlock.clear() }
        runLocalStepBestEffort { RecordAudioCache.clear() }
        runLocalStepBestEffort { SmartHealthPushRegistrar.markLocalInvalidationPending() }
        var signedOutExpectedOwner = false
        expectedFirebaseOwner?.let { expectedOwner ->
            runLocalStepBestEffort {
                signedOutExpectedOwner = FirebaseAuthService.signOutIfCurrentOwner(expectedOwner)
            }
        }
        authority.backendAuthority?.let { expectedAuthority ->
            runLocalStepBestEffort {
                SmartHealthRepository.api.clearAuthTokenIfCurrent(expectedAuthority)
            }
        }
        if (!hasReplacementAuthority(authority)) {
            runLocalStepBestEffort { SmartHealthPushRegistrar.scheduleLocalTokenInvalidation() }
        }
        return ownerBoundTerminationCanExitToLogin(
            signedOutExpectedUser = signedOutExpectedOwner,
            replacementAuthorityPresent = hasReplacementAuthority(authority),
        )
    }

    private fun captureAuthority(): SessionTerminationAuthority {
        val api = SmartHealthRepository.api
        val backendAuthority = api.currentAuthToken()
            ?.let(api::currentAuthSessionAuthorityFor)
        return SessionTerminationAuthority(
            firebaseOwner = FirebaseAuthService.currentOwnerBindingOrNull(),
            backendAuthority = backendAuthority,
        )
    }

    private fun hasReplacementAuthority(
        expected: SessionTerminationAuthority,
    ): Boolean {
        val currentFirebaseOwner = FirebaseAuthService.currentOwnerBindingOrNull()
        val api = SmartHealthRepository.api
        val currentBackendAuthority = api.currentAuthToken()
            ?.let(api::currentAuthSessionAuthorityFor)
        return (
            currentFirebaseOwner != null &&
                currentFirebaseOwner != expected.firebaseOwner
            ) || (
            currentBackendAuthority != null &&
                currentBackendAuthority != expected.backendAuthority
            )
    }

    private inline fun runLocalStepBestEffort(action: () -> Unit) {
        try {
            action()
        } catch (_: Exception) {
            // Each remaining local cleanup step still has to run.
        }
    }
}

internal fun ownerBoundTerminationCanExitToLogin(
    signedOutExpectedUser: Boolean,
    replacementAuthorityPresent: Boolean,
): Boolean = signedOutExpectedUser && !replacementAuthorityPresent
