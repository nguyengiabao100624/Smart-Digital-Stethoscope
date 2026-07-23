package com.example.smart_health_android.ai

import com.example.smart_health_android.data.SmartHealthApi
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class SmartHealthSignalAnalysisApiTest {
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
    fun getSettingsParsesSignalQualityAndRuntimeWithoutModelClaims() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """{
                      "settings": {
                        "analysisKind": "signal_quality",
                        "selectedModel": "signal_quality",
                        "version": "signal_quality_rules_v1",
                        "analyzerVersion": "signal_quality_rules_v1",
                        "status": "local_signal_quality_only",
                        "updateSupported": false,
                        "clinicalDecisionSupport": false,
                        "accuracyMetricsAvailable": false,
                        "lastUpdateStatus": "unavailable"
                      },
                      "runtime": {
                        "scanAnalysis": {
                          "available": true,
                          "analysisKind": "signal_quality",
                          "analyzerVersion": "signal_quality_rules_v1",
                          "clinicalDecisionSupport": false
                        },
                        "chatProvider": {
                          "available": false,
                          "status": "unavailable",
                          "provider": "openai_compatible",
                          "reason": "not_configured"
                        },
                        "modelUpdate": {
                          "available": false,
                          "reason": "not_supported"
                        }
                      }
                    }""",
                ),
        )

        val result = api.getSignalAnalysisStatus()
        val request = server.takeRequest()

        assertEquals("GET", request.method)
        assertEquals("/api/v1/ai/settings", request.path)
        assertEquals("Bearer firebase-id-token", request.getHeader("Authorization"))
        assertEquals("signal_quality", result.settings.analysisKind)
        assertEquals("signal_quality_rules_v1", result.settings.analyzerVersion)
        assertEquals("local_signal_quality_only", result.settings.status)
        assertFalse(result.settings.updateSupported)
        assertFalse(result.settings.clinicalDecisionSupport)
        assertFalse(result.settings.accuracyMetricsAvailable)
        assertTrue(result.runtime.scanAnalysis.available)
        assertFalse(result.runtime.chatProvider.available)
        assertEquals("not_configured", result.runtime.chatProvider.reason)
        assertFalse(result.runtime.modelUpdate.available)
        assertEquals("not_supported", result.runtime.modelUpdate.reason)
    }
}
