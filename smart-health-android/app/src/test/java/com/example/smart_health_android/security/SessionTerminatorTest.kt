package com.example.smart_health_android.security

import com.example.smart_health_android.data.AuthSessionAuthority
import com.example.smart_health_android.data.FirebaseOwnerBinding
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.currentTime
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SessionTerminatorTest {
    @Test
    fun `owner-bound completion cannot exit to login after a replacement authority appears`() {
        assertFalse(
            ownerBoundTerminationCanExitToLogin(
                signedOutExpectedUser = true,
                replacementAuthorityPresent = true,
            ),
        )
        assertFalse(
            ownerBoundTerminationCanExitToLogin(
                signedOutExpectedUser = false,
                replacementAuthorityPresent = false,
            ),
        )
        assertTrue(
            ownerBoundTerminationCanExitToLogin(
                signedOutExpectedUser = true,
                replacementAuthorityPresent = false,
            ),
        )
    }

    @Test
    fun `termination authority rejects same Firebase uid from a replacement epoch`() {
        val expectedOwner = FirebaseOwnerBinding(
            firebaseUserId = "firebase-b",
            email = "b@example.com",
            sessionEpoch = 4L,
        )
        val authority = SessionTerminationAuthority(
            firebaseOwner = expectedOwner,
            backendAuthority = AuthSessionAuthority(
                bearerToken = "backend-b",
                epoch = 9L,
            ),
        )

        assertFalse(
            authority.ownsFirebaseOwner(
                expectedOwner.copy(sessionEpoch = expectedOwner.sessionEpoch + 2L),
            ),
        )
        assertFalse(
            authority.ownsFirebaseOwner(
                expectedOwner.copy(email = "replacement@example.com"),
            ),
        )
        assertTrue(authority.ownsFirebaseOwner(expectedOwner))
    }

    @Test
    fun `replacement account survives remote cleanup that was captured for prior account`() =
        runTest {
            val events = mutableListOf<String>()
            val unregisterStarted = CompletableDeferred<Unit>()
            val allowUnregisterToFinish = CompletableDeferred<Unit>()
            var firebaseOwner: String? = "firebase-a"
            var backendToken: String? = "backend-a"
            val expectedFirebaseOwner = firebaseOwner
            val expectedBackendToken = backendToken
            val terminator = SessionTerminator(
                disableNotifications = { events += "disable-notifications-a" },
                markPushInvalidationPending = { events += "mark-push-invalidation-a" },
                unregisterPush = {
                    events += "unregister-backend-a"
                    unregisterStarted.complete(Unit)
                    allowUnregisterToFinish.await()
                },
                logoutBackend = { events += "logout-backend-a" },
                clearApiAuthentication = {
                    events += "clear-backend-a-if-current"
                    if (backendToken == expectedBackendToken) backendToken = null
                },
                signOutFirebase = {
                    events += "sign-out-firebase-a-if-current"
                    if (firebaseOwner == expectedFirebaseOwner) firebaseOwner = null
                },
                schedulePushInvalidation = {
                    if (
                        firebaseOwner == null &&
                        backendToken == null
                    ) {
                        events += "schedule-provider-invalidation-a"
                    }
                },
            )

            val termination = launch { terminator.terminate() }
            unregisterStarted.await()
            firebaseOwner = "firebase-b"
            backendToken = "backend-b"
            allowUnregisterToFinish.complete(Unit)
            advanceUntilIdle()
            termination.join()

            assertEquals("firebase-b", firebaseOwner)
            assertEquals("backend-b", backendToken)
            assertTrue(events.contains("unregister-backend-a"))
            assertTrue(events.contains("logout-backend-a"))
            assertFalse(events.contains("schedule-provider-invalidation-a"))
        }

    @Test
    fun `disables notification delivery before remote cleanup and always clears local authentication`() =
        runTest {
            val events = mutableListOf<String>()
            val terminator = SessionTerminator(
                disableNotifications = { events += "disable-notifications" },
                markPushInvalidationPending = { events += "mark-push-invalidation-pending" },
                unregisterPush = { events += "unregister-push" },
                logoutBackend = { events += "logout-backend" },
                clearApiAuthentication = { events += "clear-api-auth" },
                signOutFirebase = { events += "sign-out-firebase" },
                schedulePushInvalidation = { events += "schedule-push-invalidation" },
                clearSensitiveCache = { events += "clear-sensitive-cache" },
            )

            terminator.terminate()

            assertEquals(
                listOf(
                    "disable-notifications",
                    "clear-sensitive-cache",
                    "mark-push-invalidation-pending",
                    "sign-out-firebase",
                    "unregister-push",
                    "logout-backend",
                    "clear-api-auth",
                    "schedule-push-invalidation",
                ),
                events,
            )
        }

    @Test
    fun `dual remote cleanup failure cannot skip local clear or durable push invalidation`() =
        runTest {
            val events = mutableListOf<String>()
            val terminator = SessionTerminator(
                disableNotifications = { events += "disable-notifications" },
                markPushInvalidationPending = { events += "mark-push-invalidation-pending" },
                unregisterPush = {
                    events += "unregister-push"
                    throw IOException("push backend unavailable")
                },
                logoutBackend = {
                    events += "logout-backend"
                    throw IOException("auth backend unavailable")
                },
                clearApiAuthentication = { events += "clear-api-auth" },
                signOutFirebase = { events += "sign-out-firebase" },
                schedulePushInvalidation = { events += "schedule-push-invalidation" },
            )

            terminator.terminate()

            assertEquals(
                listOf(
                    "disable-notifications",
                    "mark-push-invalidation-pending",
                    "sign-out-firebase",
                    "unregister-push",
                    "logout-backend",
                    "clear-api-auth",
                    "schedule-push-invalidation",
                ),
                events,
            )
        }

    @Test
    fun `notification cancellation failure cannot skip identity and remote teardown`() = runTest {
        val events = mutableListOf<String>()
        val terminator = SessionTerminator(
            disableNotifications = {
                events += "disable-notifications"
                throw IllegalStateException("notification manager unavailable")
            },
            markPushInvalidationPending = { events += "mark-push-invalidation-pending" },
            unregisterPush = { events += "unregister-push" },
            logoutBackend = { events += "logout-backend" },
            clearApiAuthentication = { events += "clear-api-auth" },
            signOutFirebase = { events += "sign-out-firebase" },
            schedulePushInvalidation = { events += "schedule-push-invalidation" },
        )

        terminator.terminate()

        assertEquals(
            listOf(
                "disable-notifications",
                "mark-push-invalidation-pending",
                "sign-out-firebase",
                "unregister-push",
                "logout-backend",
                "clear-api-auth",
                "schedule-push-invalidation",
            ),
            events,
        )
    }

    @Test
    fun `Firebase sign out failure cannot skip backend or local cleanup`() = runTest {
        val events = mutableListOf<String>()
        val terminator = SessionTerminator(
            disableNotifications = { events += "disable-notifications" },
            markPushInvalidationPending = { events += "mark-push-invalidation-pending" },
            unregisterPush = { events += "unregister-push" },
            logoutBackend = { events += "logout-backend" },
            clearApiAuthentication = { events += "clear-api-auth" },
            signOutFirebase = {
                events += "sign-out-firebase"
                throw IllegalStateException("Firebase is not configured")
            },
            schedulePushInvalidation = { events += "schedule-push-invalidation" },
        )

        terminator.terminate()

        assertEquals(
            listOf(
                "disable-notifications",
                "mark-push-invalidation-pending",
                "sign-out-firebase",
                "unregister-push",
                "logout-backend",
                "clear-api-auth",
                "schedule-push-invalidation",
            ),
            events,
        )
    }

    @Test
    fun `short unregister sub-timeout still allows backend logout within the total bound`() = runTest {
        val events = mutableListOf<String>()
        val terminator = SessionTerminator(
            disableNotifications = { events += "disable-notifications" },
            markPushInvalidationPending = { events += "mark-push-invalidation-pending" },
            unregisterPush = {
                events += "unregister-push"
                delay(10_000)
            },
            logoutBackend = { events += "logout-backend" },
            clearApiAuthentication = { events += "clear-api-auth" },
            signOutFirebase = { events += "sign-out-firebase" },
            schedulePushInvalidation = { events += "schedule-push-invalidation" },
            remoteCleanupTimeoutMillis = 100,
        )

        terminator.terminate()

        assertEquals(50, currentTime)
        assertTrue(events.contains("logout-backend"))
        assertEquals(
            listOf(
                "disable-notifications",
                "mark-push-invalidation-pending",
                "sign-out-firebase",
                "unregister-push",
                "logout-backend",
                "clear-api-auth",
                "schedule-push-invalidation",
            ),
            events,
        )
    }

    @Test
    fun `caller cancellation clears local auth and cannot execute late navigation`() = runTest {
        val events = mutableListOf<String>()
        val terminator = SessionTerminator(
            disableNotifications = { events += "disable-notifications" },
            markPushInvalidationPending = { events += "mark-push-invalidation-pending" },
            unregisterPush = {
                events += "unregister-push"
                awaitCancellation()
            },
            logoutBackend = { events += "logout-backend" },
            clearApiAuthentication = { events += "clear-api-auth" },
            signOutFirebase = { events += "sign-out-firebase" },
            schedulePushInvalidation = { events += "schedule-push-invalidation" },
            remoteCleanupTimeoutMillis = 10_000,
        )
        val caller = launch {
            terminator.terminate()
            events += "navigate"
        }
        runCurrent()

        caller.cancelAndJoin()

        assertTrue(caller.isCancelled)
        assertFalse(events.contains("navigate"))
        assertEquals(
            listOf(
                "disable-notifications",
                "mark-push-invalidation-pending",
                "sign-out-firebase",
                "unregister-push",
                "logout-backend",
                "clear-api-auth",
                "schedule-push-invalidation",
            ),
            events,
        )
    }

    @Test
    fun `Firebase sign out and invalidation scheduling survive API authentication clear failure`() =
        runTest {
        val events = mutableListOf<String>()
        val terminator = SessionTerminator(
            disableNotifications = { events += "disable-notifications" },
            markPushInvalidationPending = { events += "mark-push-invalidation-pending" },
            unregisterPush = { events += "unregister-push" },
            logoutBackend = { events += "logout-backend" },
            clearApiAuthentication = {
                events += "clear-api-auth"
                throw IllegalStateException("local API auth clear failed")
            },
            signOutFirebase = { events += "sign-out-firebase" },
            schedulePushInvalidation = { events += "schedule-push-invalidation" },
        )

        val failure = try {
            terminator.terminate()
            null
        } catch (error: Throwable) {
            error
        }
        assertTrue(failure is IllegalStateException)
        assertEquals(
            listOf(
                "disable-notifications",
                "mark-push-invalidation-pending",
                "sign-out-firebase",
                "unregister-push",
                "logout-backend",
                "clear-api-auth",
                "schedule-push-invalidation",
            ),
            events,
        )
    }
}
