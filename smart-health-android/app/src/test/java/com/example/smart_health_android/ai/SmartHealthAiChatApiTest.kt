package com.example.smart_health_android.ai

import com.example.smart_health_android.data.SmartHealthApi
import com.example.smart_health_android.data.SmartHealthApiException
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

class SmartHealthAiChatApiTest {
    private lateinit var server: MockWebServer
    private lateinit var api: SmartHealthApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = SmartHealthApi(baseUrl = server.url("/api/v1").toString().trimEnd('/'))
        api.setAuthToken("firebase-id-token")
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun getChatParsesProviderAvailabilityWithoutInventingMessages() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """{
                      "messages": [],
                      "availability": {
                        "available": false,
                        "provider": "none",
                        "reason": "AI_PROVIDER_UNAVAILABLE"
                      }
                    }""",
                ),
        )

        val result = api.getAiChatSession()
        val request = server.takeRequest()

        assertEquals("/api/v1/ai/chat", request.path)
        assertEquals("Bearer firebase-id-token", request.getHeader("Authorization"))
        assertFalse(result.availability.available)
        assertEquals("AI_PROVIDER_UNAVAILABLE", result.availability.reason)
        assertTrue(result.messages.isEmpty())
    }

    @Test
    fun sendUsesIdempotencyKeyAndTrustsOnlyBackendConfirmedTimeline() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """{
                      "availability": {"available": true, "provider": "clinical-provider"},
                      "messages": [
                        {"id":"msg-user","role":"user","content":"Tín hiệu nhiễu","createdAt":"2026-07-14T00:00:00.000Z"},
                        {"id":"msg-ai","role":"assistant","content":"Hãy đo lại","createdAt":"2026-07-14T00:00:01.000Z"}
                      ]
                    }""",
                ),
        )

        val result = api.sendAiChatMessage("Tín hiệu nhiễu", "ai-idempotency-1")
        val request = server.takeRequest()

        assertEquals("POST", request.method)
        assertEquals("ai-idempotency-1", request.getHeader("Idempotency-Key"))
        assertEquals("Tín hiệu nhiễu", request.body.readUtf8().let { org.json.JSONObject(it).getString("message") })
        assertTrue(result.availability.available)
        assertEquals(listOf("msg-user", "msg-ai"), result.messages.map { it.id })
    }

    @Test
    fun unavailableProviderPreservesStructuredErrorAndRequestId() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(503)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """{
                      "code":"AI_PROVIDER_UNAVAILABLE",
                      "message":"Provider AI chưa được cấu hình",
                      "requestId":"req-ai-1"
                    }""",
                ),
        )

        try {
            api.sendAiChatMessage("Câu hỏi", "ai-idempotency-2")
            fail("Expected SmartHealthApiException")
        } catch (error: SmartHealthApiException) {
            assertEquals(503, error.statusCode)
            assertEquals("AI_PROVIDER_UNAVAILABLE", error.code)
            assertEquals("req-ai-1", error.requestId)
        }
    }
}
