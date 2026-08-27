package com.example.smart_health_android.data

import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import java.io.IOException
import java.util.concurrent.TimeUnit

class SmartHealthAuthorizationEventsTest {
    private lateinit var server: MockWebServer
    private lateinit var api: SmartHealthApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = SmartHealthApi(baseUrl = server.url("/api/v1").toString().trimEnd('/'))
        api.setAuthToken("primary-token")
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun `classifier accepts only 401 and terminal account or membership codes`() {
        assertTrue(apiException(401, "INVALID_TOKEN").isTerminalAuthorizationFailure())
        assertTrue(apiException(403, "account_locked").isTerminalAuthorizationFailure())
        assertTrue(apiException(403, "Account_Not_Found").isTerminalAuthorizationFailure())
        assertTrue(apiException(409, "workspace_membership_required").isTerminalAuthorizationFailure())
        assertTrue(apiException(423, "WORKSPACE_ARCHIVED").isTerminalAuthorizationFailure())

        assertFalse(apiException(403, "CAPABILITY_REQUIRED").isTerminalAuthorizationFailure())
        assertFalse(apiException(500, "ACCOUNT_LOOKUP_FAILED").isTerminalAuthorizationFailure())
    }

    @Test
    fun `only token or account terminal invalidation requires full local termination`() {
        assertTrue(invalidation(401, "TOKEN_REVOKED").requiresFullLocalTermination())
        assertTrue(invalidation(403, "account_locked").requiresFullLocalTermination())
        assertTrue(invalidation(404, "ACCOUNT_NOT_FOUND").requiresFullLocalTermination())

        assertFalse(
            invalidation(409, "WORKSPACE_MEMBERSHIP_REQUIRED")
                .requiresFullLocalTermination(),
        )
        assertFalse(invalidation(423, "WORKSPACE_ARCHIVED").requiresFullLocalTermination())
    }

    @Test
    fun `terminal invalidation emitted before collector is retained once`() = runBlocking {
        val published = SmartHealthAuthorizationEvents.publishIfTerminal(
            exception = apiException(401, "TOKEN_REVOKED"),
            authSessionEpoch = 17L,
        )

        val event = withTimeout(2_000) {
            SmartHealthAuthorizationEvents.events.first()
        }
        assertTrue(SmartHealthAuthorizationEvents.acknowledge(event))

        assertTrue(published)
        assertEquals(401, event.statusCode)
        assertEquals("TOKEN_REVOKED", event.code)
        assertEquals(17L, event.authSessionEpoch)
    }

    @Test
    fun `json 401 publishes invalidation before returning the exception`() = runBlocking {
        server.enqueue(
            errorResponse(
                statusCode = 401,
                code = "TOKEN_REVOKED",
                requestId = "request-json-401",
            ),
        )
        val pendingEvent = async(start = CoroutineStart.UNDISPATCHED) {
            withTimeout(2_000) { SmartHealthAuthorizationEvents.events.first() }
        }

        val exception = captureApiException { api.getMe() }
        val event = pendingEvent.await()
        assertTrue(SmartHealthAuthorizationEvents.acknowledge(event))

        assertEquals(401, exception.statusCode)
        assertEquals(exception.statusCode, event.statusCode)
        assertEquals(exception.code, event.code)
        assertEquals("request-json-401", event.requestId)
        assertEquals(api.currentAuthSessionEpoch(), event.authSessionEpoch)
    }

    @Test
    fun `binary terminal workspace response publishes invalidation`() = runBlocking {
        server.enqueue(
            errorResponse(
                statusCode = 403,
                code = "workspace_archived",
                requestId = "request-bytes-403",
            ),
        )
        val pendingEvent = async(start = CoroutineStart.UNDISPATCHED) {
            withTimeout(2_000) { SmartHealthAuthorizationEvents.events.first() }
        }

        val exception = captureApiException { api.downloadMyAvatarBytes() }
        val event = pendingEvent.await()
        assertTrue(SmartHealthAuthorizationEvents.acknowledge(event))

        assertEquals(403, exception.statusCode)
        assertEquals("workspace_archived", event.code)
        assertEquals("request-bytes-403", event.requestId)
        assertEquals(api.currentAuthSessionEpoch(), event.authSessionEpoch)
    }

    @Test
    fun `terminal response remains bound to token epoch that owned the request`() = runBlocking {
        val requestEpoch = api.currentAuthSessionEpoch()
        server.enqueue(
            errorResponse(
                statusCode = 401,
                code = "TOKEN_REVOKED",
                requestId = "request-stale-token",
            ).setBodyDelay(150, TimeUnit.MILLISECONDS),
        )
        val pendingEvent = async(start = CoroutineStart.UNDISPATCHED) {
            withTimeout(2_000) { SmartHealthAuthorizationEvents.events.first() }
        }
        val pendingRequest = async(start = CoroutineStart.UNDISPATCHED) {
            captureApiException { api.getMe() }
        }
        val recordedRequest = server.takeRequest(1, TimeUnit.SECONDS)
        assertEquals("Bearer primary-token", recordedRequest?.getHeader("Authorization"))

        api.setAuthToken("rotated-token")
        val exception = pendingRequest.await()
        val event = pendingEvent.await()
        assertTrue(SmartHealthAuthorizationEvents.acknowledge(event))

        assertEquals("TOKEN_REVOKED", exception.code)
        assertEquals(requestEpoch, event.authSessionEpoch)
        assertNotEquals(api.currentAuthSessionEpoch(), event.authSessionEpoch)
    }

    @Test
    fun `unacknowledged invalidation replays to replacement collector`() = runBlocking {
        SmartHealthAuthorizationEvents.publishIfTerminal(
            exception = apiException(401, "TOKEN_REVOKED"),
            authSessionEpoch = 19L,
        )

        val receivedByCancelledOwner = withTimeout(2_000) {
            SmartHealthAuthorizationEvents.events.first()
        }
        val receivedByReplacementOwner = withTimeout(2_000) {
            SmartHealthAuthorizationEvents.events.first()
        }

        assertEquals(receivedByCancelledOwner.deliveryId, receivedByReplacementOwner.deliveryId)
        assertEquals(19L, receivedByReplacementOwner.authSessionEpoch)
        assertTrue(SmartHealthAuthorizationEvents.acknowledge(receivedByReplacementOwner))
        assertNull(
            withTimeoutOrNull(300) {
                SmartHealthAuthorizationEvents.events.first()
            },
        )
    }

    @Test
    fun `overflow preserves unacknowledged head across mixed auth epochs`() = runBlocking {
        SmartHealthAuthorizationEvents.publishIfTerminal(
            exception = apiException(401, "CURRENT_SESSION_REVOKED"),
            authSessionEpoch = 77L,
        )
        val currentSessionHead = withTimeout(2_000) {
            SmartHealthAuthorizationEvents.events.first()
        }

        repeat(32) { index ->
            SmartHealthAuthorizationEvents.publishIfTerminal(
                exception = apiException(401, "STALE_SESSION_REVOKED"),
                authSessionEpoch = 100L + index,
            )
        }

        val headAfterOverflow = withTimeout(2_000) {
            SmartHealthAuthorizationEvents.events.first()
        }
        assertEquals(currentSessionHead.deliveryId, headAfterOverflow.deliveryId)
        assertEquals(77L, headAfterOverflow.authSessionEpoch)
        assertTrue(SmartHealthAuthorizationEvents.acknowledge(headAfterOverflow))

        var drainedTailEvents = 0
        while (true) {
            val tail = withTimeoutOrNull(100) {
                SmartHealthAuthorizationEvents.events.first()
            } ?: break
            assertTrue(SmartHealthAuthorizationEvents.acknowledge(tail))
            drainedTailEvents += 1
        }
        assertEquals(31, drainedTailEvents)
    }

    @Test
    fun `ordinary capability 403 does not publish invalidation`() = runBlocking {
        server.enqueue(
            errorResponse(
                statusCode = 403,
                code = "CAPABILITY_REQUIRED",
                requestId = "request-capability-403",
            ),
        )
        val pendingEvent = async(start = CoroutineStart.UNDISPATCHED) {
            withTimeoutOrNull(300) { SmartHealthAuthorizationEvents.events.first() }
        }

        val exception = captureApiException { api.getMe() }

        assertEquals("CAPABILITY_REQUIRED", exception.code)
        assertNull(pendingEvent.await())
    }

    @Test
    fun `network IOException does not publish invalidation`() = runBlocking {
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        val pendingEvent = async(start = CoroutineStart.UNDISPATCHED) {
            withTimeoutOrNull(300) { SmartHealthAuthorizationEvents.events.first() }
        }

        val failure = runCatching { api.getMe() }.exceptionOrNull()

        assertTrue(failure is IOException)
        assertFalse(failure is SmartHealthApiException)
        assertNull(pendingEvent.await())
    }

    private suspend fun captureApiException(block: suspend () -> Unit): SmartHealthApiException {
        try {
            block()
            fail("Expected SmartHealthApiException")
        } catch (exception: SmartHealthApiException) {
            return exception
        }
        error("Unreachable")
    }

    private fun apiException(statusCode: Int, code: String) = SmartHealthApiException(
        statusCode = statusCode,
        code = code,
        message = code,
    )

    private fun invalidation(
        statusCode: Int,
        code: String,
    ) = SmartHealthAuthorizationInvalidation(
        statusCode = statusCode,
        code = code,
        requestId = "",
        authSessionEpoch = 1L,
    )

    private fun errorResponse(
        statusCode: Int,
        code: String,
        requestId: String,
    ) = MockResponse()
        .setResponseCode(statusCode)
        .setHeader("Content-Type", "application/json")
        .setBody(
            """
            {
              "code": "$code",
              "message": "Rejected",
              "requestId": "$requestId"
            }
            """.trimIndent(),
        )
}
