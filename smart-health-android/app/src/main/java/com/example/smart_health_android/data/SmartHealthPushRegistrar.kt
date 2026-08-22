package com.example.smart_health_android.data

import android.annotation.SuppressLint
import android.content.Context
import android.util.Log
import com.example.smart_health_android.BuildConfig
import com.example.smart_health_android.notifications.NotificationActivationLease
import com.example.smart_health_android.notifications.SmartHealthNotificationSession
import com.google.android.gms.tasks.Task
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

internal enum class PushRegistrationOutcome {
    Registered,
    InvalidInput,
    Unauthenticated,
    StaleSession,
    BackendRejected,
    TransientFailure,
}

internal class BoundedPushTokenAcquirer(
    private val acquireToken: suspend () -> String,
    private val timeoutMillis: Long = TOKEN_ACQUISITION_TIMEOUT_MILLIS,
) {
    init {
        require(timeoutMillis > 0)
    }

    suspend fun acquireOrNull(): String? {
        return try {
            withTimeoutOrNull(timeoutMillis) {
                acquireToken().trim().takeIf(String::isNotEmpty)
            }
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            null
        }
    }

    private companion object {
        const val TOKEN_ACQUISITION_TIMEOUT_MILLIS = 5_000L
    }
}

/**
 * Pure registration transaction used by both initial and refreshed-token paths.
 *
 * The lease and authenticated identity are checked on both sides of the backend call.
 * Consequently a late response after logout can never reactivate the local delivery gate.
 */
internal class PushRegistrationAttempt<Lease>(
    private val isBackendAuthenticated: () -> Boolean,
    private val currentBackendAuthSessionId: () -> String?,
    private val isFirebaseIdentityCurrent: () -> Boolean,
    private val isLeaseCurrent: (Lease) -> Boolean,
    private val registerBackend: suspend (String) -> NotificationDeviceRegistrationAck,
    private val complete: (Lease) -> Boolean,
    private val minimumProtocolVersion: Int,
    private val expectedBackendUserId: String,
    private val expectedWorkspaceId: String,
    private val expectedBackendAuthSessionId: String,
    private val expectedAppVersion: String,
) {
    suspend fun run(lease: Lease, token: String): PushRegistrationOutcome {
        if (token.isBlank()) return PushRegistrationOutcome.InvalidInput
        if (
            !isBackendAuthenticated() ||
            expectedBackendAuthSessionId.isBlank()
        ) {
            return PushRegistrationOutcome.Unauthenticated
        }
        if (currentBackendAuthSessionId() != expectedBackendAuthSessionId) {
            return PushRegistrationOutcome.StaleSession
        }
        if (!isFirebaseIdentityCurrent() || !isLeaseCurrent(lease)) {
            return PushRegistrationOutcome.StaleSession
        }

        val acknowledgement = try {
            registerBackend(token)
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            return PushRegistrationOutcome.TransientFailure
        }
        if (
            !acknowledgement.confirmsPrivacyGatedDelivery(
                minimumProtocolVersion = minimumProtocolVersion,
                expectedUserId = expectedBackendUserId,
                expectedWorkspaceId = expectedWorkspaceId,
                expectedFcmToken = token,
                expectedAuthSessionId = expectedBackendAuthSessionId,
                expectedAppVersion = expectedAppVersion,
            )
        ) {
            return PushRegistrationOutcome.BackendRejected
        }
        if (
            !isBackendAuthenticated() ||
            currentBackendAuthSessionId() != expectedBackendAuthSessionId ||
            !isFirebaseIdentityCurrent() ||
            !isLeaseCurrent(lease)
        ) {
            return PushRegistrationOutcome.StaleSession
        }
        return if (complete(lease)) {
            PushRegistrationOutcome.Registered
        } else {
            PushRegistrationOutcome.StaleSession
        }
    }
}

internal class BoundedPushRegistrationRunner(
    private val attempt: suspend () -> PushRegistrationOutcome,
    private val delayBeforeRetry: suspend (Long) -> Unit = { delay(it) },
    private val maxAttempts: Int = MAX_ATTEMPTS,
    private val initialDelayMillis: Long = INITIAL_DELAY_MILLIS,
) {
    init {
        require(maxAttempts > 0)
        require(initialDelayMillis >= 0)
    }

    suspend fun run(): PushRegistrationOutcome {
        var latestOutcome = PushRegistrationOutcome.TransientFailure
        repeat(maxAttempts) { attemptIndex ->
            latestOutcome = attempt()
            if (latestOutcome != PushRegistrationOutcome.TransientFailure) {
                return latestOutcome
            }
            if (attemptIndex < maxAttempts - 1) {
                delayBeforeRetry(initialDelayMillis shl attemptIndex)
            }
        }
        return latestOutcome
    }

    private companion object {
        const val MAX_ATTEMPTS = 3
        const val INITIAL_DELAY_MILLIS = 750L
    }
}

object SmartHealthPushRegistrar {
    private const val TAG = "SmartHealthPush"
    private val backgroundScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val tokenLifecycleMutex = Mutex()
    private val registrationRetryMonitor = Any()
    private var registrationRetryJob: Job? = null
    private var registrationRetryKey: RegistrationRetryKey? = null
    private val tokenAcquirer = BoundedPushTokenAcquirer(
        acquireToken = { FirebaseMessaging.getInstance().token.await() },
    )
    private val invalidationRetry = PushInvalidationRetry(
        isPending = PushInvalidationStore::isPending,
        deleteToken = { FirebaseMessaging.getInstance().deleteToken().await() },
        clearPending = PushInvalidationStore::clearPending,
    )

    fun initialize(context: Context) {
        PushInvalidationStore.initialize(context)
    }

    fun hasPendingInvalidation(): Boolean = PushInvalidationStore.isPending()

    suspend fun registerCurrentTokenIfAuthenticated(
        userId: String,
        workspaceId: String,
    ): Boolean {
        val firebaseUserId = FirebaseAuthService.currentUserIdOrNull()
            ?.takeIf(String::isNotBlank)
            ?: return false
        val normalizedUserId = userId.trim().takeIf(String::isNotEmpty) ?: return false
        val normalizedWorkspaceId = workspaceId.trim().takeIf(String::isNotEmpty) ?: return false
        val expectedBackendAuthSessionId =
            SmartHealthRepository.api.currentAuthSessionId()
                ?.takeIf(String::isNotBlank)
                ?: return false
        val activeBinding = SmartHealthNotificationSession.activeBindingOrNull()
        val activationLease = if (
            activeBinding?.backendUserId == normalizedUserId &&
            activeBinding.firebaseUserId == firebaseUserId &&
            activeBinding.workspaceId == normalizedWorkspaceId
        ) {
            SmartHealthNotificationSession.beginRefresh()
        } else {
            runCatching {
                SmartHealthNotificationSession.beginAuthentication(
                    firebaseUserId = firebaseUserId,
                    workspaceId = normalizedWorkspaceId,
                )
            }.getOrNull()
        } ?: return false

        val outcome = registerCurrentProviderToken(
            userId = normalizedUserId,
            firebaseUserId = firebaseUserId,
            activationLease = activationLease,
            expectedBackendAuthSessionId = expectedBackendAuthSessionId,
        )
        if (outcome == PushRegistrationOutcome.Registered) {
            cancelRegistrationRetry(activationLease)
            Log.d(TAG, "FCM token registered with Smart Health backend")
            return true
        }
        if (outcome == PushRegistrationOutcome.TransientFailure) {
            scheduleRegistrationRetry(
                userId = normalizedUserId,
                firebaseUserId = firebaseUserId,
                activationLease = activationLease,
                expectedBackendAuthSessionId = expectedBackendAuthSessionId,
            )
        }
        Log.w(TAG, "FCM registration was not activated: $outcome")
        return false
    }

    suspend fun registerRefreshedToken(token: String): Boolean {
        val refreshLease = SmartHealthNotificationSession.beginRefresh() ?: return false
        val firebaseUserId = refreshLease.firebaseUserId
        val userId = refreshLease.expectedBackendUserId ?: return false
        val expectedBackendAuthSessionId =
            SmartHealthRepository.api.currentAuthSessionId()
                ?.takeIf(String::isNotBlank)
                ?: return false
        val outcome = tokenLifecycleMutex.withLock {
            if (PushInvalidationStore.isPending()) {
                PushRegistrationOutcome.TransientFailure
            } else {
                registrationAttempt(
                    firebaseUserId = firebaseUserId,
                    expectedBackendUserId = userId,
                    activationWorkspaceId = refreshLease.workspaceId,
                    expectedBackendAuthSessionId = expectedBackendAuthSessionId,
                    complete = SmartHealthNotificationSession::confirmRefresh,
                ).run(
                    lease = refreshLease,
                    token = token,
                )
            }
        }
        if (outcome == PushRegistrationOutcome.Registered) {
            cancelRegistrationRetry(refreshLease)
            Log.d(TAG, "Refreshed FCM token registered with Smart Health backend")
            return true
        }
        if (outcome == PushRegistrationOutcome.TransientFailure) {
            scheduleRegistrationRetry(
                userId = userId,
                firebaseUserId = firebaseUserId,
                activationLease = refreshLease,
                expectedBackendAuthSessionId = expectedBackendAuthSessionId,
            )
        }
        Log.w(TAG, "Refreshed FCM registration was not confirmed: $outcome")
        return false
    }

    suspend fun unregisterCurrentToken(): Boolean {
        val api = SmartHealthRepository.api
        val bearerToken = api.currentAuthToken() ?: return false
        val authority = api.currentAuthSessionAuthorityFor(bearerToken) ?: return false
        return unregisterCurrentToken(authority)
    }

    suspend fun unregisterCurrentToken(
        expectedAuthority: AuthSessionAuthority,
    ): Boolean {
        return tokenLifecycleMutex.withLock {
            val token = tokenAcquirer.acquireOrNull() ?: return@withLock false
            val unregistered = SmartHealthRepository.api.unregisterNotificationDevice(
                fcmToken = token,
                expectedAuthority = expectedAuthority,
            )
            Log.d(TAG, "FCM token unregistered from the captured Smart Health account: $unregistered")
            unregistered
        }
    }

    fun markLocalInvalidationPending(): Boolean {
        val persisted = PushInvalidationStore.markPending()
        if (!persisted) {
            Log.w(TAG, "Cannot persist pending local FCM invalidation marker")
        }
        return persisted
    }

    suspend fun retryPendingInvalidation(): Boolean {
        val invalidated = tokenLifecycleMutex.withLock {
            invalidationRetry.retryIfPending()
        }
        if (!invalidated) {
            Log.w(TAG, "Pending local FCM token invalidation still requires retry")
        }
        return invalidated
    }

    fun scheduleLocalTokenInvalidation() {
        backgroundScope.launch {
            val invalidated = BoundedPushInvalidationRunner(
                retry = {
                    tokenLifecycleMutex.withLock {
                        invalidationRetry.retryIfPending()
                    }
                },
            ).run()
            if (invalidated) {
                Log.d(TAG, "Local FCM token invalidated")
            } else {
                Log.w(TAG, "Local FCM token invalidation remains pending for the next startup")
            }
        }
    }

    suspend fun invalidateLocalToken(): Boolean {
        markLocalInvalidationPending()
        return retryPendingInvalidation()
    }

    private fun registrationAttempt(
        firebaseUserId: String,
        expectedBackendUserId: String,
        activationWorkspaceId: String,
        expectedBackendAuthSessionId: String,
        complete: (NotificationActivationLease) -> Boolean,
    ): PushRegistrationAttempt<NotificationActivationLease> {
        return PushRegistrationAttempt(
            isBackendAuthenticated = {
                !SmartHealthRepository.api.currentAuthToken().isNullOrBlank()
            },
            currentBackendAuthSessionId = SmartHealthRepository.api::currentAuthSessionId,
            isFirebaseIdentityCurrent = {
                FirebaseAuthService.currentUserIdOrNull() == firebaseUserId
            },
            isLeaseCurrent = SmartHealthNotificationSession::isLeaseCurrent,
            registerBackend = { token ->
                SmartHealthRepository.api.registerNotificationDevice(
                    fcmToken = token,
                    notificationProtocolVersion = NOTIFICATION_PROTOCOL_VERSION,
                    appVersion = BuildConfig.VERSION_NAME,
                )
            },
            complete = complete,
            minimumProtocolVersion = NOTIFICATION_PROTOCOL_VERSION,
            expectedBackendUserId = expectedBackendUserId,
            expectedWorkspaceId = activationWorkspaceId,
            expectedBackendAuthSessionId = expectedBackendAuthSessionId,
            expectedAppVersion = BuildConfig.VERSION_NAME,
        )
    }

    private suspend fun registerCurrentProviderToken(
        userId: String,
        firebaseUserId: String,
        activationLease: NotificationActivationLease,
        expectedBackendAuthSessionId: String,
    ): PushRegistrationOutcome {
        return tokenLifecycleMutex.withLock {
            if (
                SmartHealthRepository.api.currentAuthToken().isNullOrBlank()
            ) {
                return@withLock PushRegistrationOutcome.Unauthenticated
            }
            if (
                FirebaseAuthService.currentUserIdOrNull() != firebaseUserId ||
                !SmartHealthNotificationSession.isLeaseCurrent(activationLease)
            ) {
                return@withLock PushRegistrationOutcome.StaleSession
            }
            if (!invalidationRetry.retryIfPending()) {
                return@withLock PushRegistrationOutcome.TransientFailure
            }
            val token = tokenAcquirer.acquireOrNull()
                ?: return@withLock PushRegistrationOutcome.TransientFailure
            registrationAttempt(
                firebaseUserId = firebaseUserId,
                expectedBackendUserId = userId,
                activationWorkspaceId = activationLease.workspaceId,
                expectedBackendAuthSessionId = expectedBackendAuthSessionId,
                complete = { lease ->
                    if (lease.expectedBackendUserId == null) {
                        SmartHealthNotificationSession.activate(lease, userId)
                    } else {
                        SmartHealthNotificationSession.confirmRefresh(lease)
                    }
                },
            ).run(
                lease = activationLease,
                token = token,
            )
        }
    }

    private fun scheduleRegistrationRetry(
        userId: String,
        firebaseUserId: String,
        activationLease: NotificationActivationLease,
        expectedBackendAuthSessionId: String,
    ) {
        val key = RegistrationRetryKey(
            userId = userId,
            firebaseUserId = firebaseUserId,
            leaseEpoch = activationLease.epoch,
            backendAuthSessionId = expectedBackendAuthSessionId,
        )
        synchronized(registrationRetryMonitor) {
            if (
                registrationRetryKey == key &&
                registrationRetryJob?.isActive == true
            ) {
                return
            }
            registrationRetryJob?.cancel()
            registrationRetryKey = key
            registrationRetryJob = backgroundScope.launch {
                try {
                    val outcome = BoundedPushRegistrationRunner(
                        attempt = {
                            registerCurrentProviderToken(
                                userId = userId,
                                firebaseUserId = firebaseUserId,
                                activationLease = activationLease,
                                expectedBackendAuthSessionId = expectedBackendAuthSessionId,
                            )
                        },
                    ).run()
                    if (outcome == PushRegistrationOutcome.Registered) {
                        Log.d(TAG, "FCM registration recovered after a bounded retry")
                    } else {
                        Log.w(TAG, "FCM registration retry stopped: $outcome")
                    }
                } finally {
                    val completedJob = kotlin.coroutines.coroutineContext[Job]
                    synchronized(registrationRetryMonitor) {
                        if (registrationRetryJob === completedJob) {
                            registrationRetryJob = null
                            registrationRetryKey = null
                        }
                    }
                }
            }
        }
    }

    private fun cancelRegistrationRetry(activationLease: NotificationActivationLease) {
        synchronized(registrationRetryMonitor) {
            if (registrationRetryKey?.leaseEpoch != activationLease.epoch) return
            registrationRetryJob?.cancel()
            registrationRetryJob = null
            registrationRetryKey = null
        }
    }

    private suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { continuation ->
        addOnSuccessListener { result ->
            if (continuation.isActive) continuation.resume(result)
        }
        addOnFailureListener { error ->
            if (continuation.isActive) continuation.resumeWithException(error)
        }
        addOnCanceledListener { continuation.cancel() }
    }

    private const val NOTIFICATION_PROTOCOL_VERSION = 2

    private data class RegistrationRetryKey(
        val userId: String,
        val firebaseUserId: String,
        val leaseEpoch: Long,
        val backendAuthSessionId: String,
    )
}

// Logout/startup recovery depends on the synchronous commit() result. The KTX
// edit helper returns Unit, so replacing this would lose the persisted ACK.
@SuppressLint("ApplySharedPref", "UseKtx")
private object PushInvalidationStore {
    private const val PREFS_NAME = "shcare_push_cleanup"
    private const val KEY_PENDING_INVALIDATION = "pending_token_invalidation"

    @Volatile
    private var applicationContext: Context? = null

    @Volatile
    private var inMemoryPending = false

    fun initialize(context: Context) {
        applicationContext = context.applicationContext
    }

    fun markPending(): Boolean {
        inMemoryPending = true
        val preferences = preferencesOrNull() ?: return false
        return preferences.edit()
            .putBoolean(KEY_PENDING_INVALIDATION, true)
            .commit()
    }

    fun isPending(): Boolean {
        return inMemoryPending ||
            preferencesOrNull()?.getBoolean(KEY_PENDING_INVALIDATION, false) == true
    }

    fun clearPending(): Boolean {
        val preferences = preferencesOrNull() ?: return false
        val cleared = preferences.edit()
            .remove(KEY_PENDING_INVALIDATION)
            .commit()
        if (cleared) {
            inMemoryPending = false
        }
        return cleared
    }

    private fun preferencesOrNull() = applicationContext
        ?.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
}
