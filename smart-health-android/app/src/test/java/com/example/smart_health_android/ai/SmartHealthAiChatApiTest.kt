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

    @Test
    fun conversationContractCarriesHistoryReferencesAndSelectedAttachments() = runBlocking {
        server.enqueue(
            MockResponse().setResponseCode(200).setHeader("Content-Type", "application/json").setBody(
                """{
                  "conversation":{"id":"conv-1","title":"Lượt đo tim","updatedAt":"2026-09-03T00:00:00Z"},
                  "availability":{"available":true,"provider":"clinical-provider"},
                  "messages":[{
                    "id":"msg-ai","role":"assistant","content":"Thông tin hỗ trợ",
                    "conversationId":"conv-1",
                    "references":[{"type":"scan","id":"scan-1","label":"heart · mỏm tim"}]
                  }],
                  "attachments":[{"id":"att-1","conversationId":"conv-1","name":"ket-qua.pdf","contentType":"application/pdf","byteSize":128,"providerInterpretation":"not_enabled"}],
                  "references":[{"type":"scan","id":"scan-1","label":"heart · mỏm tim"}]
                }""",
            ),
        )

        val result = api.getAiConversationSession("conv-1")
        val request = server.takeRequest()

        assertEquals("/api/v1/ai/conversations/conv-1", request.path)
        assertEquals("conv-1", result.conversation?.id)
        assertEquals("scan-1", result.messages.single().references.single().id)
        assertEquals("not_enabled", result.attachments.single().providerInterpretation)
    }

    @Test
    fun conversationSendBindsAttachmentIdsAndIdempotency() = runBlocking {
        server.enqueue(
            MockResponse().setResponseCode(200).setHeader("Content-Type", "application/json").setBody(
                """{
                  "conversation":{"id":"conv-1","title":"Giải thích kết quả"},
                  "availability":{"available":true,"provider":"clinical-provider"},
                  "messages":[]
                }""",
            ),
        )

        api.sendAiConversationMessage("conv-1", "Giải thích kết quả", listOf("att-1"), "idem-conv-1")
        val request = server.takeRequest()
        val payload = org.json.JSONObject(request.body.readUtf8())

        assertEquals("/api/v1/ai/conversations/conv-1/messages", request.path)
        assertEquals("idem-conv-1", request.getHeader("Idempotency-Key"))
        assertEquals("att-1", payload.getJSONArray("attachmentIds").getString(0))
    }
}
