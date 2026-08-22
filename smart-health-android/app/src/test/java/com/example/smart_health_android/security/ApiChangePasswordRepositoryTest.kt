package com.example.smart_health_android.security

import com.example.smart_health_android.data.SmartHealthAuthorizationEvents
import com.example.smart_health_android.data.SmartHealthApi
import com.example.smart_health_android.data.SmartHealthApiException
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.TimeUnit

class ApiChangePasswordRepositoryTest {
    private lateinit var server: MockWebServer
    private lateinit var api: SmartHealthApi

    @Before
    fun setUp() {
        runBlocking { drainAuthorizationEvents() }
        server = MockWebServer()
        server.start()
        api = SmartHealthApi(baseUrl = server.url("/api/v1").toString().trimEnd('/'))
        api.setAuthToken("initial-token")
    }

    @After
    fun tearDown() {
        runBlocking { drainAuthorizationEvents() }
        server.shutdown()
    }

    @Test
    fun `ambiguous commit then revoked retry reauthenticates the bound Firebase uid and replays the exact intent`() =
        runBlocking {
            server.enqueue(apiError("PASSWORD_CHANGE_PROVIDER_UNAVAILABLE", statusCode = 503))
            server.enqueue(apiError("FIREBASE_ID_TOKEN_REVOKED"))
            server.enqueue(confirmedReceipt(replayed = true))
            val firebase = FakePasswordChangeFirebaseSession(
                freshTokens = ArrayDeque(listOf("prepared-token", "recovered-token")),
            )
            val repository = ApiChangePasswordRepository(api, firebase)

            repository.prepare(
                currentPassword = " CurrentPass1 ",
                expectedFirebaseUserId = "firebase-user-a",
                idempotencyKey = "stable-password-key",
            )
            val ambiguous = runCatching {
                repository.commit(
                    expectedUserId = "user-a",
                    expectedFirebaseUserId = "firebase-user-a",
                    currentPassword = " CurrentPass1 ",
                    newPassword = " NextPassword2 ",
                    idempotencyKey = "stable-password-key",
                )
            }.exceptionOrNull() as SmartHealthApiException
            assertEquals(503, ambiguous.statusCode)

            val unexpectedInvalidation = async(start = CoroutineStart.UNDISPATCHED) {
                withTimeoutOrNull(250) { SmartHealthAuthorizationEvents.events.first() }
            }
            val receipt = repository.commit(
                expectedUserId = "user-a",
                expectedFirebaseUserId = "firebase-user-a",
                currentPassword = " CurrentPass1 ",
                newPassword = " NextPassword2 ",
                idempotencyKey = "stable-password-key",
            )

            assertNull(unexpectedInvalidation.await())
            assertEquals(
                listOf(" CurrentPass1 ", " NextPassword2 "),
                firebase.reauthenticatedPasswords,
            )
            assertEquals(listOf(true, true), firebase.forceRefreshArguments)
            assertTrue(receipt.confirmed)
            assertTrue(receipt.replayed)
            assertEquals("user-a", receipt.userId)
            assertEquals(3, server.requestCount)

            val firstAttempt = server.takeRequest()
            val revokedRetry = server.takeRequest()
            val confirmedReplay = server.takeRequest()
            assertEquals("Bearer prepared-token", firstAttempt.getHeader("Authorization"))
            assertEquals("Bearer prepared-token", revokedRetry.getHeader("Authorization"))
            assertEquals("Bearer recovered-token", confirmedReplay.getHeader("Authorization"))
            assertEquals("stable-password-key", firstAttempt.getHeader("Idempotency-Key"))
            assertEquals("stable-password-key", revokedRetry.getHeader("Idempotency-Key"))
            assertEquals("stable-password-key", confirmedReplay.getHeader("Idempotency-Key"))
            val firstBody = firstAttempt.body.readUtf8()
            val retryBody = revokedRetry.body.readUtf8()
            val replayBody = confirmedReplay.body.readUtf8()
            assertEquals(firstBody, retryBody)
            assertEquals(firstBody, replayBody)
            val body = JSONObject(replayBody)
            assertEquals(
                setOf("currentPassword", "newPassword"),
                body.keys().asSequence().toSet(),
            )
            assertEquals(" CurrentPass1 ", body.getString("currentPassword"))
            assertEquals(" NextPassword2 ", body.getString("newPassword"))
        }

    @Test
    fun `failed new-password reauthentication never retries the backend mutation or invents a receipt`() =
        runBlocking {
            server.enqueue(apiError("PASSWORD_CHANGE_PROVIDER_UNAVAILABLE", statusCode = 503))
            server.enqueue(apiError("FIREBASE_ID_TOKEN_REVOKED"))
            val firebase = FakePasswordChangeFirebaseSession(
                freshTokens = ArrayDeque(listOf("prepared-token")),
                reauthenticateFailure = { password ->
                    if (password == "NextPassword2") {
                        IllegalStateException("new credential rejected")
                    } else {
                        null
                    }
                },
            )
            var notificationTeardownCalls = 0
            val repository = ApiChangePasswordRepository(
                api = api,
                firebaseSession = firebase,
                clearNotificationBinding = {
                    notificationTeardownCalls += 1
                },
            )
            repository.prepare("CurrentPass1", "firebase-user-a", "stable-password-key")
            val ambiguous = runCatching {
                repository.commit(
                    expectedUserId = "user-a",
                    expectedFirebaseUserId = "firebase-user-a",
                    currentPassword = "CurrentPass1",
                    newPassword = "NextPassword2",
                    idempotencyKey = "stable-password-key",
                )
            }.exceptionOrNull() as SmartHealthApiException
            assertEquals(503, ambiguous.statusCode)

            val error = runCatching {
                repository.commit(
                    expectedUserId = "user-a",
                    expectedFirebaseUserId = "firebase-user-a",
                    currentPassword = "CurrentPass1",
                    newPassword = "NextPassword2",
                    idempotencyKey = "stable-password-key",
                )
            }.exceptionOrNull()

            assertTrue(error is ChangePasswordSessionInvalidatedException)
            assertEquals("new credential rejected", error?.cause?.message)
            assertEquals(
                listOf("CurrentPass1", "NextPassword2"),
                firebase.reauthenticatedPasswords,
            )
            assertEquals(2, server.requestCount)
            assertNull(api.currentAuthToken())
            assertEquals(1, notificationTeardownCalls)
        }

    @Test
    fun `Firebase uid change during revoked-token recovery fails closed before replay`() =
        runBlocking {
            server.enqueue(apiError("PASSWORD_CHANGE_PROVIDER_UNAVAILABLE", statusCode = 503))
            server.enqueue(apiError("FIREBASE_ID_TOKEN_REVOKED"))
            val firebase = FakePasswordChangeFirebaseSession(
                freshTokens = ArrayDeque(listOf("prepared-token", "recovered-token")),
                afterFreshToken = { refreshCall ->
                    if (refreshCall == 2) currentUserId = "firebase-user-b"
                },
            )
            val repository = ApiChangePasswordRepository(api, firebase)
            repository.prepare("CurrentPass1", "firebase-user-a", "stable-password-key")
            val ambiguous = runCatching {
                repository.commit(
                    expectedUserId = "user-a",
                    expectedFirebaseUserId = "firebase-user-a",
                    currentPassword = "CurrentPass1",
                    newPassword = "NextPassword2",
                    idempotencyKey = "stable-password-key",
                )
            }.exceptionOrNull() as SmartHealthApiException
            assertEquals(503, ambiguous.statusCode)

            val error = runCatching {
                repository.commit(
                    expectedUserId = "user-a",
                    expectedFirebaseUserId = "firebase-user-a",
                    currentPassword = "CurrentPass1",
                    newPassword = "NextPassword2",
                    idempotencyKey = "stable-password-key",
                )
            }.exceptionOrNull()

            assertTrue(error is SecurityException)
            assertEquals(2, server.requestCount)
            assertNull(api.currentAuthToken())
            assertEquals(
                listOf("CurrentPass1", "NextPassword2"),
                firebase.reauthenticatedPasswords,
            )
        }

    @Test
    fun `replacement Firebase account is never reauthenticated during revoked-token recovery`() =
        runBlocking {
            server.enqueue(apiError("PASSWORD_CHANGE_PROVIDER_UNAVAILABLE", statusCode = 503))
            server.enqueue(apiError("FIREBASE_ID_TOKEN_REVOKED"))
            val firebase = FakePasswordChangeFirebaseSession(
                freshTokens = ArrayDeque(listOf("prepared-token")),
            )
            val repository = ApiChangePasswordRepository(api, firebase)
            repository.prepare("CurrentPass1", "firebase-user-a", "stable-password-key")
            val ambiguous = runCatching {
                repository.commit(
                    expectedUserId = "user-a",
                    expectedFirebaseUserId = "firebase-user-a",
                    currentPassword = "CurrentPass1",
                    newPassword = "NextPassword2",
                    idempotencyKey = "stable-password-key",
                )
            }.exceptionOrNull() as SmartHealthApiException
            assertEquals(503, ambiguous.statusCode)
            firebase.currentUserId = "firebase-user-b"

            val error = runCatching {
                repository.commit(
                    expectedUserId = "user-a",
                    expectedFirebaseUserId = "firebase-user-a",
                    currentPassword = "CurrentPass1",
                    newPassword = "NextPassword2",
                    idempotencyKey = "stable-password-key",
                )
            }.exceptionOrNull()

            assertTrue(error is SecurityException)
            assertEquals(listOf("CurrentPass1"), firebase.reauthenticatedPasswords)
            assertEquals(1, server.requestCount)
            assertNull(api.currentAuthToken())
        }

    @Test
    fun `Firebase uid switch during prepare clears the backend and notification binding`() =
        runBlocking {
            val firebase = FakePasswordChangeFirebaseSession(
                freshTokens = ArrayDeque(listOf("prepared-token")),
                afterFreshToken = {
                    currentUserId = "firebase-user-b"
                },
            )
            var notificationTeardownCalls = 0
            val repository = ApiChangePasswordRepository(
                api = api,
                firebaseSession = firebase,
                clearNotificationBinding = {
                    notificationTeardownCalls += 1
                },
            )

            val error = runCatching {
                repository.prepare(
                    currentPassword = "CurrentPass1",
                    expectedFirebaseUserId = "firebase-user-a",
                    idempotencyKey = "stable-password-key",
                )
            }.exceptionOrNull()

            assertTrue(error is ChangePasswordSessionInvalidatedException)
            assertNull(api.currentAuthToken())
            assertEquals(1, notificationTeardownCalls)
            assertEquals(listOf("CurrentPass1"), firebase.reauthenticatedPasswords)
            assertEquals(0, server.requestCount)
        }

    @Test
    fun `commit preflight rejects a replacement Firebase account before sending the mutation`() =
        runBlocking {
            val firebase = FakePasswordChangeFirebaseSession(
                freshTokens = ArrayDeque(listOf("prepared-token")),
            )
            var notificationTeardownCalls = 0
            val repository = ApiChangePasswordRepository(
                api = api,
                firebaseSession = firebase,
                clearNotificationBinding = {
                    notificationTeardownCalls += 1
                },
            )
            repository.prepare("CurrentPass1", "firebase-user-a", "stable-password-key")
            firebase.currentUserId = "firebase-user-b"

            val error = runCatching {
                repository.commit(
                    expectedUserId = "user-a",
                    expectedFirebaseUserId = "firebase-user-a",
                    currentPassword = "CurrentPass1",
                    newPassword = "NextPassword2",
                    idempotencyKey = "stable-password-key",
                )
            }.exceptionOrNull()

            assertTrue(error is ChangePasswordSessionInvalidatedException)
            assertNull(api.currentAuthToken())
            assertEquals(1, notificationTeardownCalls)
            assertEquals(0, server.requestCount)
        }

    @Test
    fun `first revoked response without prior ambiguity publishes denial and never uses the new password`() =
        runBlocking {
            server.enqueue(apiError("FIREBASE_ID_TOKEN_REVOKED"))
            val firebase = FakePasswordChangeFirebaseSession(
                freshTokens = ArrayDeque(listOf("prepared-token")),
            )
            val repository = ApiChangePasswordRepository(api, firebase)
            repository.prepare("CurrentPass1", "firebase-user-a", "stable-password-key")
            val pendingInvalidation = async(start = CoroutineStart.UNDISPATCHED) {
                withTimeout(2_000) { SmartHealthAuthorizationEvents.events.first() }
            }

            val error = runCatching {
                repository.commit(
                    expectedUserId = "user-a",
                    expectedFirebaseUserId = "firebase-user-a",
                    currentPassword = "CurrentPass1",
                    newPassword = "NextPassword2",
                    idempotencyKey = "stable-password-key",
                )
            }.exceptionOrNull() as SmartHealthApiException
            val invalidation = pendingInvalidation.await()

            assertEquals("FIREBASE_ID_TOKEN_REVOKED", error.code)
            assertEquals(error.code, invalidation.code)
            assertTrue(SmartHealthAuthorizationEvents.acknowledge(invalidation))
            assertEquals(listOf("CurrentPass1"), firebase.reauthenticatedPasswords)
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `changed intent cannot inherit ambiguity from an older idempotency key`() =
        runBlocking {
            server.enqueue(apiError("PASSWORD_CHANGE_PROVIDER_UNAVAILABLE", statusCode = 503))
            server.enqueue(apiError("FIREBASE_ID_TOKEN_REVOKED"))
            val firebase = FakePasswordChangeFirebaseSession(
                freshTokens = ArrayDeque(listOf("first-token", "changed-intent-token")),
            )
            val repository = ApiChangePasswordRepository(api, firebase)
            repository.prepare("CurrentPass1", "firebase-user-a", "first-key")
            val ambiguous = runCatching {
                repository.commit(
                    expectedUserId = "user-a",
                    expectedFirebaseUserId = "firebase-user-a",
                    currentPassword = "CurrentPass1",
                    newPassword = "NextPassword2",
                    idempotencyKey = "first-key",
                )
            }.exceptionOrNull() as SmartHealthApiException
            assertEquals(503, ambiguous.statusCode)

            repository.prepare("DifferentCurrent3", "firebase-user-a", "changed-key")
            val error = runCatching {
                repository.commit(
                    expectedUserId = "user-a",
                    expectedFirebaseUserId = "firebase-user-a",
                    currentPassword = "DifferentCurrent3",
                    newPassword = "DifferentNext4",
                    idempotencyKey = "changed-key",
                )
            }.exceptionOrNull() as SmartHealthApiException

            assertEquals("FIREBASE_ID_TOKEN_REVOKED", error.code)
            assertEquals(
                listOf("CurrentPass1", "DifferentCurrent3"),
                firebase.reauthenticatedPasswords,
            )
            assertEquals(2, server.requestCount)
        }

    @Test
    fun `Firebase uid switch while confirmed replay is pending clears backend auth and returns no receipt`() =
        runBlocking {
            server.enqueue(apiError("PASSWORD_CHANGE_PROVIDER_UNAVAILABLE", statusCode = 503))
            server.enqueue(apiError("FIREBASE_ID_TOKEN_REVOKED"))
            server.enqueue(
                confirmedReceipt(replayed = true)
                    .setBodyDelay(1, TimeUnit.SECONDS),
            )
            val firebase = FakePasswordChangeFirebaseSession(
                freshTokens = ArrayDeque(listOf("prepared-token", "recovered-token")),
            )
            val repository = ApiChangePasswordRepository(api, firebase)
            repository.prepare("CurrentPass1", "firebase-user-a", "stable-password-key")
            val ambiguous = runCatching {
                repository.commit(
                    expectedUserId = "user-a",
                    expectedFirebaseUserId = "firebase-user-a",
                    currentPassword = "CurrentPass1",
                    newPassword = "NextPassword2",
                    idempotencyKey = "stable-password-key",
                )
            }.exceptionOrNull() as SmartHealthApiException
            assertEquals(503, ambiguous.statusCode)

            val pendingReplay = async(start = CoroutineStart.UNDISPATCHED) {
                runCatching {
                    repository.commit(
                        expectedUserId = "user-a",
                        expectedFirebaseUserId = "firebase-user-a",
                        currentPassword = "CurrentPass1",
                        newPassword = "NextPassword2",
                        idempotencyKey = "stable-password-key",
                    )
                }.exceptionOrNull()
            }
            withTimeout(5_000) {
                while (server.requestCount < 3) delay(10)
            }
            firebase.currentUserId = "firebase-user-b"

            val error = pendingReplay.await()

            assertTrue(error is SecurityException)
            assertNull(api.currentAuthToken())
            assertEquals(3, server.requestCount)
        }

    @Test
    fun `generic unauthorized response keeps the existing deny path and never uses the new password`() =
        runBlocking {
            assertNonRecoverable401("UNAUTHENTICATED")
        }

    @Test
    fun `expired Firebase token response is not treated as a post-mutation revoked response`() =
        runBlocking {
            assertNonRecoverable401("FIREBASE_ID_TOKEN_EXPIRED")
        }

    @Test
    fun `revoked response is not recovered when the commit key was never prepared`() =
        runBlocking {
            server.enqueue(apiError("FIREBASE_ID_TOKEN_REVOKED"))
            val firebase = FakePasswordChangeFirebaseSession(
                freshTokens = ArrayDeque(listOf("prepared-token")),
            )
            val repository = ApiChangePasswordRepository(api, firebase)
            repository.prepare("CurrentPass1", "firebase-user-a", "prepared-key")

            val error = runCatching {
                repository.commit(
                    expectedUserId = "user-a",
                    expectedFirebaseUserId = "firebase-user-a",
                    currentPassword = "CurrentPass1",
                    newPassword = "NextPassword2",
                    idempotencyKey = "different-key",
                )
            }.exceptionOrNull() as SmartHealthApiException

            assertEquals("FIREBASE_ID_TOKEN_REVOKED", error.code)
            assertEquals(listOf("CurrentPass1"), firebase.reauthenticatedPasswords)
            assertEquals(1, server.requestCount)
        }

    private suspend fun assertNonRecoverable401(code: String) {
        server.enqueue(apiError(code))
        val firebase = FakePasswordChangeFirebaseSession(
            freshTokens = ArrayDeque(listOf("prepared-token")),
        )
        val repository = ApiChangePasswordRepository(api, firebase)
        repository.prepare("CurrentPass1", "firebase-user-a", "stable-password-key")

        val error = runCatching {
            repository.commit(
                expectedUserId = "user-a",
                expectedFirebaseUserId = "firebase-user-a",
                currentPassword = "CurrentPass1",
                newPassword = "NextPassword2",
                idempotencyKey = "stable-password-key",
            )
        }.exceptionOrNull() as SmartHealthApiException

        assertEquals(code, error.code)
        assertEquals(listOf("CurrentPass1"), firebase.reauthenticatedPasswords)
        assertEquals(1, server.requestCount)
    }

    private suspend fun drainAuthorizationEvents() {
        while (true) {
            val event = withTimeoutOrNull(10) {
                SmartHealthAuthorizationEvents.events.first()
            } ?: return
            SmartHealthAuthorizationEvents.acknowledge(event)
        }
    }

    private fun apiError(
        code: String,
        statusCode: Int = 401,
    ) = MockResponse()
        .setResponseCode(statusCode)
        .setHeader("Content-Type", "application/json")
        .setBody(
            """
            {
              "error": {
                "code": "$code",
                "message": "Authorization failed",
                "requestId": "request-1"
              }
            }
            """.trimIndent(),
        )

    private fun confirmedReceipt(replayed: Boolean) = MockResponse()
        .setResponseCode(200)
        .setHeader("Content-Type", "application/json")
        .setBody(
            """
            {
              "ok": true,
              "provider": "firebase",
              "operationId": "identity-operation-1",
              "replayed": $replayed,
              "user": {"id": "user-a"}
            }
            """.trimIndent(),
        )
}

private class FakePasswordChangeFirebaseSession(
    var currentUserId: String? = "firebase-user-a",
    private val freshTokens: ArrayDeque<String>,
    private val reauthenticateFailure: (String) -> Throwable? = { null },
    private val afterFreshToken: FakePasswordChangeFirebaseSession.(Int) -> Unit = {},
) : PasswordChangeFirebaseSession {
    val reauthenticatedPasswords = mutableListOf<String>()
    val forceRefreshArguments = mutableListOf<Boolean>()

    override fun currentUserIdOrNull(): String? = currentUserId

    override suspend fun reauthenticateWithPassword(password: String) {
        reauthenticatedPasswords += password
        reauthenticateFailure(password)?.let { throw it }
    }

    override suspend fun getFreshIdToken(forceRefresh: Boolean): String {
        forceRefreshArguments += forceRefresh
        val token = freshTokens.removeFirst()
        afterFreshToken(forceRefreshArguments.size)
        return token
    }
}
