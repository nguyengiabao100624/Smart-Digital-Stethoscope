package com.example.smart_health_android.data

import com.example.smart_health_android.notifications.NotificationSessionGate
import java.io.IOException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.test.currentTime
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PushRegistrationOrchestrationTest {
    @Test
    fun `hanging provider token is bounded and releases the lifecycle mutex`() = runTest {
        val mutex = Mutex()
        val tokenAcquirer = BoundedPushTokenAcquirer(
            acquireToken = { awaitCancellation() },
            timeoutMillis = 100,
        )

        val first = async {
            mutex.withLock {
                tokenAcquirer.acquireOrNull()
            }
        }
        assertNull(first.await())
        val secondAcquired = mutex.withLock { true }

        assertTrue(secondAcquired)
        assertEquals(100, currentTime)
    }

    @Test
    fun `caller cancellation propagates out of token acquisition`() = runTest {
        var returned = false
        val tokenAcquirer = BoundedPushTokenAcquirer(
            acquireToken = { awaitCancellation() },
            timeoutMillis = 10_000,
        )
        val caller = launch {
            tokenAcquirer.acquireOrNull()
            returned = true
        }
        runCurrent()

        caller.cancelAndJoin()

        assertTrue(caller.isCancelled)
        assertFalse(returned)
    }

    @Test
    fun `protocol v1 acknowledgement cannot activate notification delivery`() = runTest {
        var completed = false
        val outcome = attempt(
            acknowledgement = acceptedAcknowledgement.copy(notificationProtocolVersion = 1),
            complete = {
                completed = true
                true
            },
        ).run(Unit, "token")

        assertEquals(PushRegistrationOutcome.BackendRejected, outcome)
        assertFalse(completed)
    }

    @Test
    fun `disabled acknowledgement cannot activate notification delivery`() = runTest {
        var completed = false
        val outcome = attempt(
            acknowledgement = acceptedAcknowledgement.copy(enabled = false),
            complete = {
                completed = true
                true
            },
        ).run(Unit, "token")

        assertEquals(PushRegistrationOutcome.BackendRejected, outcome)
        assertFalse(completed)
    }

    @Test
    fun `acknowledgement without an auth session binding cannot activate delivery`() = runTest {
        var completed = false
        val outcome = attempt(
            acknowledgement = acceptedAcknowledgement.copy(authSessionId = ""),
            complete = {
                completed = true
                true
            },
        ).run(Unit, "token")

        assertEquals(PushRegistrationOutcome.BackendRejected, outcome)
        assertFalse(completed)
    }

    @Test
    fun `acknowledgement for a different backend owner fails closed`() = runTest {
        var completed = false
        val outcome = attempt(
            acknowledgement = acceptedAcknowledgement.copy(userId = "user-b"),
            complete = {
                completed = true
                true
            },
        ).run(Unit, "token")

        assertEquals(PushRegistrationOutcome.BackendRejected, outcome)
        assertFalse(completed)
    }

    @Test
    fun `acknowledgement for a different workspace fails closed`() = runTest {
        var completed = false
        val outcome = attempt(
            acknowledgement = acceptedAcknowledgement.copy(workspaceId = "workspace-b"),
            complete = {
                completed = true
                true
            },
        ).run(Unit, "token")

        assertEquals(PushRegistrationOutcome.BackendRejected, outcome)
        assertFalse(completed)
    }

    @Test
    fun `acknowledgement for a different backend auth session fails closed`() = runTest {
        var completed = false
        val outcome = attempt(
            acknowledgement = acceptedAcknowledgement.copy(authSessionId = "auth-session-b"),
            complete = {
                completed = true
                true
            },
        ).run(Unit, "token")

        assertEquals(PushRegistrationOutcome.BackendRejected, outcome)
        assertFalse(completed)
    }

    @Test
    fun `acknowledgement for a different provider token fails closed`() = runTest {
        var completed = false
        val outcome = attempt(
            acknowledgement = acceptedAcknowledgement.copy(fcmToken = "token-b"),
            complete = {
                completed = true
                true
            },
        ).run(Unit, "token")

        assertEquals(PushRegistrationOutcome.BackendRejected, outcome)
        assertFalse(completed)
    }

    @Test
    fun `acknowledgement for a different app version fails closed`() = runTest {
        var completed = false
        val outcome = attempt(
            acknowledgement = acceptedAcknowledgement.copy(appVersion = "stale-build"),
            complete = {
                completed = true
                true
            },
        ).run(Unit, "token")

        assertEquals(PushRegistrationOutcome.BackendRejected, outcome)
        assertFalse(completed)
    }

    @Test
    fun `bounded registration retry recovers once without spawning an unbounded loop`() = runTest {
        var attempts = 0
        val delays = mutableListOf<Long>()
        val outcome = BoundedPushRegistrationRunner(
            attempt = {
                attempts += 1
                if (attempts < 3) {
                    PushRegistrationOutcome.TransientFailure
                } else {
                    PushRegistrationOutcome.Registered
                }
            },
            delayBeforeRetry = { delays += it },
            maxAttempts = 3,
            initialDelayMillis = 25,
        ).run()

        assertEquals(PushRegistrationOutcome.Registered, outcome)
        assertEquals(3, attempts)
        assertEquals(listOf(25L, 50L), delays)
    }

    @Test
    fun `bounded registration retry stops immediately for a stale session`() = runTest {
        var attempts = 0
        val outcome = BoundedPushRegistrationRunner(
            attempt = {
                attempts += 1
                PushRegistrationOutcome.StaleSession
            },
            delayBeforeRetry = { error("must not delay a stale session") },
        ).run()

        assertEquals(PushRegistrationOutcome.StaleSession, outcome)
        assertEquals(1, attempts)
    }

    @Test
    fun `late initial registration response after logout stays inactive`() = runTest {
        val gate = NotificationSessionGate()
        val lease = requireNotNull(gate.beginReplacement("firebase-a", "workspace-a"))
        val attempt = PushRegistrationAttempt(
            isBackendAuthenticated = { true },
            currentBackendAuthSessionId = { "auth-session-a" },
            isFirebaseIdentityCurrent = { true },
            isLeaseCurrent = gate::isLeaseCurrent,
            registerBackend = {
                gate.deactivate()
                acceptedAcknowledgement
            },
            complete = { gate.activateIfCurrent(it, "user-a") != null },
            minimumProtocolVersion = 2,
            expectedBackendUserId = "user-a",
            expectedWorkspaceId = "workspace-a",
            expectedBackendAuthSessionId = "auth-session-a",
            expectedAppVersion = "test-app",
        )

        val outcome = attempt.run(lease, "token")

        assertEquals(PushRegistrationOutcome.StaleSession, outcome)
        assertFalse(gate.canDisplay("user-a", "workspace-a", "firebase-a"))
    }

    @Test
    fun `late refreshed token response after logout stays inactive`() = runTest {
        val gate = NotificationSessionGate()
        val initialLease = requireNotNull(gate.beginReplacement("firebase-a", "workspace-a"))
        gate.activateIfCurrent(initialLease, "user-a")
        val refreshLease = requireNotNull(gate.beginRefresh())
        val attempt = PushRegistrationAttempt(
            isBackendAuthenticated = { true },
            currentBackendAuthSessionId = { "auth-session-a" },
            isFirebaseIdentityCurrent = { true },
            isLeaseCurrent = gate::isLeaseCurrent,
            registerBackend = {
                gate.deactivate()
                acceptedAcknowledgement
            },
            complete = gate::isLeaseCurrent,
            minimumProtocolVersion = 2,
            expectedBackendUserId = "user-a",
            expectedWorkspaceId = "workspace-a",
            expectedBackendAuthSessionId = "auth-session-a",
            expectedAppVersion = "test-app",
        )

        val outcome = attempt.run(refreshLease, "token")

        assertEquals(PushRegistrationOutcome.StaleSession, outcome)
        assertFalse(gate.canDisplay("user-a", "workspace-a", "firebase-a"))
    }

    @Test
    fun `same account refresh failure preserves the already active binding`() = runTest {
        val gate = NotificationSessionGate()
        val initialLease = requireNotNull(gate.beginReplacement("firebase-a", "workspace-a"))
        gate.activateIfCurrent(initialLease, "user-a")
        val refreshLease = requireNotNull(gate.beginRefresh())
        val attempt = PushRegistrationAttempt(
            isBackendAuthenticated = { true },
            currentBackendAuthSessionId = { "auth-session-a" },
            isFirebaseIdentityCurrent = { true },
            isLeaseCurrent = gate::isLeaseCurrent,
            registerBackend = { throw IOException("backend unavailable") },
            complete = gate::isLeaseCurrent,
            minimumProtocolVersion = 2,
            expectedBackendUserId = "user-a",
            expectedWorkspaceId = "workspace-a",
            expectedBackendAuthSessionId = "auth-session-a",
            expectedAppVersion = "test-app",
        )

        val outcome = attempt.run(refreshLease, "token")

        assertEquals(PushRegistrationOutcome.TransientFailure, outcome)
        assertTrue(gate.canDisplay("user-a", "workspace-a", "firebase-a"))
    }

    @Test
    fun `same account workspace replacement invalidates the old registration retry lease`() = runTest {
        val gate = NotificationSessionGate()
        val workspaceALease = requireNotNull(
            gate.beginReplacement("firebase-a", "workspace-a"),
        )
        assertTrue(gate.activateIfCurrent(workspaceALease, "user-a") != null)
        val staleRetryLease = requireNotNull(gate.beginRefresh())

        val workspaceBLease = requireNotNull(
            gate.beginReplacement("firebase-a", "workspace-b"),
        )
        val staleAttempt = PushRegistrationAttempt(
            isBackendAuthenticated = { true },
            currentBackendAuthSessionId = { "auth-session-a" },
            isFirebaseIdentityCurrent = { true },
            isLeaseCurrent = gate::isLeaseCurrent,
            registerBackend = { acceptedAcknowledgement },
            complete = gate::isLeaseCurrent,
            minimumProtocolVersion = 2,
            expectedBackendUserId = "user-a",
            expectedWorkspaceId = "workspace-a",
            expectedBackendAuthSessionId = "auth-session-a",
            expectedAppVersion = "test-app",
        )

        assertEquals(
            PushRegistrationOutcome.StaleSession,
            staleAttempt.run(staleRetryLease, "token"),
        )
        assertEquals(null, gate.activeBindingOrNull())
        assertTrue(gate.activateIfCurrent(workspaceBLease, "user-a") != null)
        assertEquals("workspace-b", gate.activeBindingOrNull()?.workspaceId)
    }

    @Test
    fun `backend auth session rotation during registration rejects the late acknowledgement`() =
        runTest {
            var currentAuthSessionId = "auth-session-a"
            val attempt = PushRegistrationAttempt<Unit>(
                isBackendAuthenticated = { true },
                currentBackendAuthSessionId = { currentAuthSessionId },
                isFirebaseIdentityCurrent = { true },
                isLeaseCurrent = { true },
                registerBackend = {
                    currentAuthSessionId = "auth-session-b"
                    acceptedAcknowledgement
                },
                complete = { true },
                minimumProtocolVersion = 2,
                expectedBackendUserId = "user-a",
                expectedWorkspaceId = "workspace-a",
                expectedBackendAuthSessionId = "auth-session-a",
                expectedAppVersion = "test-app",
            )

            assertEquals(
                PushRegistrationOutcome.StaleSession,
                attempt.run(Unit, "token"),
            )
        }

    private fun attempt(
        acknowledgement: NotificationDeviceRegistrationAck,
        complete: (Unit) -> Boolean,
    ): PushRegistrationAttempt<Unit> {
        return PushRegistrationAttempt(
            isBackendAuthenticated = { true },
            currentBackendAuthSessionId = { "auth-session-a" },
            isFirebaseIdentityCurrent = { true },
            isLeaseCurrent = { true },
            registerBackend = { acknowledgement },
            complete = complete,
            minimumProtocolVersion = 2,
            expectedBackendUserId = "user-a",
            expectedWorkspaceId = "workspace-a",
            expectedBackendAuthSessionId = "auth-session-a",
            expectedAppVersion = "test-app",
        )
    }

    private companion object {
        val acceptedAcknowledgement = NotificationDeviceRegistrationAck(
            id = "notification-device-a",
            userId = "user-a",
            workspaceId = "workspace-a",
            fcmToken = "token",
            authSessionId = "auth-session-a",
            notificationProtocolVersion = 2,
            appVersion = "test-app",
            enabled = true,
        )
    }
}
