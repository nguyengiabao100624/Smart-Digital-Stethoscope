package com.example.smart_health_android.scan

import com.example.smart_health_android.data.SmartHealthApi
import com.example.smart_health_android.data.StartScanRequest
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test

class SmartHealthScanApiTest {
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
    fun tearDown() = server.shutdown()

    @Test
    fun `start scan sends authenticated exact intent with stable idempotency key`() = runBlocking {
        enqueueScan("scan-1", "created")

        api.startScan(
            StartScanRequest(
                patientId = "patient-1",
                mode = "heart",
                bodySite = "mitral",
                deviceId = "device-1",
                doctorNotes = "confirmed note",
            ),
            idempotencyKey = "scan-start-key-1",
        )

        val request = server.takeRequest()
        val body = JSONObject(request.body.readUtf8())
        assertEquals("POST", request.method)
        assertEquals("/api/v1/scans/start", request.path)
        assertEquals("Bearer firebase-id-token", request.getHeader("Authorization"))
        assertEquals("scan-start-key-1", request.getHeader("Idempotency-Key"))
        assertEquals("patient-1", body.getString("patientId"))
        assertEquals("device-1", body.getString("deviceId"))
        assertEquals("heart", body.getString("mode"))
        assertEquals("mitral", body.getString("bodySite"))
    }

    @Test
    fun `stop exact scan sends stable idempotency key`() = runBlocking {
        enqueueScan("scan-1", "completed")

        api.stopScan("scan-1", "scan-stop-key-1")

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/v1/scans/scan-1/stop", request.path)
        assertEquals("scan-stop-key-1", request.getHeader("Idempotency-Key"))
    }

    @Test
    fun `legacy active stop cannot bypass mutation idempotency`() = runBlocking {
        enqueueScan("scan-1", "completed")

        api.stopActiveScan("scan-active-stop-key-1")

        val request = server.takeRequest()
        assertEquals("/api/v1/scans/active/stop", request.path)
        assertEquals("scan-active-stop-key-1", request.getHeader("Idempotency-Key"))
    }

    @Test
    fun `scan mutations reject blank idempotency keys before network`() {
        assertThrows(IllegalArgumentException::class.java) {
            runBlocking { api.startScan(StartScanRequest(), "") }
        }
        assertThrows(IllegalArgumentException::class.java) {
            runBlocking { api.stopScan("scan-1", "") }
        }
        assertThrows(IllegalArgumentException::class.java) {
            runBlocking { api.stopActiveScan("") }
        }
        assertEquals(0, server.requestCount)
    }

    private fun enqueueScan(id: String, status: String) {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"scan":{"id":"$id","status":"$status"}}"""),
        )
    }
}
