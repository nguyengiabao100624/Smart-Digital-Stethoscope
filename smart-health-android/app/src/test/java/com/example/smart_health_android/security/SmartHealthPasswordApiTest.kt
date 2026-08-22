package com.example.smart_health_android.security

import com.example.smart_health_android.data.SmartHealthApi
import com.example.smart_health_android.data.SmartHealthApiException
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class SmartHealthPasswordApiTest {
    private lateinit var server: MockWebServer
    private lateinit var api: SmartHealthApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = SmartHealthApi(baseUrl = server.url("/api/v1").toString().trimEnd('/'))
        api.setAuthToken("account-token")
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun `confirmed receipt is account bound and sends a required idempotency key`() = runBlocking {
        server.enqueue(
            jsonResponse(
                """
                {
                  "ok": true,
                  "provider": "firebase",
                  "operationId": "identity-operation-1",
                  "replayed": false,
                  "user": {"id": "user-a"}
                }
                """,
            ),
        )

        val receipt = api.changePassword(
            expectedUserId = "user-a",
            currentPassword = " CurrentPass1 ",
            newPassword = " NextPassword2 ",
            idempotencyKey = "stable-password-key",
        )

        assertTrue(receipt.confirmed)
        assertEquals("user-a", receipt.userId)
        assertEquals("firebase", receipt.provider)
        assertEquals("identity-operation-1", receipt.operationId)
        assertFalse(receipt.replayed)

        val request = server.takeRequest()
        assertEquals("/api/v1/me/password", request.path)
        assertEquals("stable-password-key", request.getHeader("Idempotency-Key"))
        val body = JSONObject(request.body.readUtf8())
        assertEquals(" CurrentPass1 ", body.getString("currentPassword"))
        assertEquals(" NextPassword2 ", body.getString("newPassword"))
        assertFalse(body.has("firebaseClientUpdated"))
    }

    @Test
    fun `unconfirmed or wrong-account response fails closed`() = runBlocking {
        server.enqueue(
            jsonResponse(
                """
                {
                  "ok": true,
                  "provider": "firebase",
                  "operationId": "identity-operation-1",
                  "replayed": false,
                  "user": {"id": "user-b"}
                }
                """,
            ),
        )

        val mismatch = runCatching {
            api.changePassword(
                expectedUserId = "user-a",
                currentPassword = "CurrentPass1",
                newPassword = "NextPassword2",
                idempotencyKey = "wrong-owner-key",
            )
        }.exceptionOrNull() as SmartHealthApiException
        assertEquals("PASSWORD_CHANGE_RESPONSE_OWNER_MISMATCH", mismatch.code)

        server.enqueue(
            jsonResponse(
                """
                {
                  "ok": "true",
                  "provider": "firebase",
                  "operationId": "identity-operation-2",
                  "replayed": false,
                  "user": {"id": "user-a"}
                }
                """,
            ),
        )
        val invalid = runCatching {
            api.changePassword(
                expectedUserId = "user-a",
                currentPassword = "CurrentPass1",
                newPassword = "NextPassword2",
                idempotencyKey = "invalid-receipt-key",
            )
        }.exceptionOrNull() as SmartHealthApiException
        assertEquals("PASSWORD_CHANGE_RESPONSE_INVALID", invalid.code)
    }

    @Test
    fun `padded or expanded receipt identities are rejected instead of normalized`() = runBlocking {
        server.enqueue(
            jsonResponse(
                """
                {
                  "ok": true,
                  "provider": "firebase",
                  "operationId": "identity-operation-1",
                  "replayed": true,
                  "user": {"id": " user-a "}
                }
                """,
            ),
        )
        val paddedOwner = capturePasswordError("padded-owner-key")
        assertEquals("PASSWORD_CHANGE_RESPONSE_OWNER_MISMATCH", paddedOwner.code)

        server.enqueue(
            jsonResponse(
                """
                {
                  "ok": true,
                  "provider": "firebase",
                  "operationId": " identity-operation-1 ",
                  "replayed": true,
                  "user": {"id": "user-a"}
                }
                """,
            ),
        )
        val paddedOperation = capturePasswordError("padded-operation-key")
        assertEquals("PASSWORD_CHANGE_RESPONSE_INVALID", paddedOperation.code)

        server.enqueue(
            jsonResponse(
                """
                {
                  "ok": true,
                  "provider": "firebase",
                  "operationId": "identity-operation-1",
                  "replayed": true,
                  "user": {"id": "user-a", "role": "patient"}
                }
                """,
            ),
        )
        val expandedOwner = capturePasswordError("expanded-owner-key")
        assertEquals("PASSWORD_CHANGE_RESPONSE_INVALID", expandedOwner.code)

        server.enqueue(
            jsonResponse(
                """
                {
                  "ok": true,
                  "provider": "firebase",
                  "operationId": "identity-operation-1",
                  "replayed": true,
                  "user": {"id": "user-a"},
                  "requestId": "success-request-id"
                }
                """,
            ),
        )
        val expandedRoot = capturePasswordError("expanded-root-key")
        assertEquals("PASSWORD_CHANGE_RESPONSE_INVALID", expandedRoot.code)

        val oversizedOperationId = "x".repeat(161)
        server.enqueue(
            jsonResponse(
                """
                {
                  "ok": true,
                  "provider": "firebase",
                  "operationId": "$oversizedOperationId",
                  "replayed": true,
                  "user": {"id": "user-a"}
                }
                """,
            ),
        )
        val oversizedOperation = capturePasswordError("oversized-operation-key")
        assertEquals("PASSWORD_CHANGE_RESPONSE_INVALID", oversizedOperation.code)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `blank idempotency key is rejected before transport`() = runBlocking<Unit> {
        api.changePassword(
            expectedUserId = "user-a",
            currentPassword = "CurrentPass1",
            newPassword = "NextPassword2",
            idempotencyKey = "",
        )
    }

    private suspend fun capturePasswordError(idempotencyKey: String): SmartHealthApiException =
        runCatching {
            api.changePassword(
                expectedUserId = "user-a",
                currentPassword = "CurrentPass1",
                newPassword = "NextPassword2",
                idempotencyKey = idempotencyKey,
            )
        }.exceptionOrNull() as SmartHealthApiException

    private fun jsonResponse(body: String, status: Int = 200) = MockResponse()
        .setResponseCode(status)
        .setHeader("Content-Type", "application/json")
        .setBody(body.trimIndent())
}
