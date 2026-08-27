package com.example.smart_health_android.data

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class SmartHealthDeviceReleaseApiTest {
    private lateinit var server: MockWebServer
    private lateinit var api: SmartHealthApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = SmartHealthApi(baseUrl = server.url("/api/v1").toString().trimEnd('/'))
        api.setAuthToken("patient-token")
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun `release sends an idempotent scoped mutation and accepts the exact receipt`() =
        runBlocking {
            server.enqueue(
                MockResponse()
                    .setHeader("Content-Type", "application/json")
                    .setBody(
                        """{"release":{"deviceId":"dev-1","released":true,"historyRetained":true},"replayed":false}""",
                    ),
            )

            val receipt = api.releaseDevice("dev-1", "release-key-123")

            val request = server.takeRequest()
            assertEquals("POST", request.method)
            assertEquals("/api/v1/devices/dev-1/release", request.path)
            assertEquals("Bearer patient-token", request.getHeader("Authorization"))
            assertEquals("release-key-123", request.getHeader("Idempotency-Key"))
            assertEquals("dev-1", receipt.deviceId)
            assertTrue(receipt.released)
            assertTrue(receipt.historyRetained)
            assertFalse(receipt.replayed)
        }

    @Test
    fun `release rejects a receipt that does not retain history`() {
        server.enqueue(
            MockResponse()
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """{"release":{"deviceId":"dev-1","released":true,"historyRetained":false},"replayed":false}""",
                ),
        )

        val error = assertThrows(SmartHealthApiException::class.java) {
            runBlocking { api.releaseDevice("dev-1", "release-key-123") }
        }
        assertEquals("DEVICE_RELEASE_CONTRACT_INVALID", error.code)
    }
}
