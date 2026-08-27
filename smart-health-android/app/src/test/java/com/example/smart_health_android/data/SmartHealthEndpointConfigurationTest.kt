package com.example.smart_health_android.data

import org.junit.Assert.assertTrue
import org.junit.Test

class SmartHealthEndpointConfigurationTest {
    @Test
    fun `default API base URL includes the versioned API prefix`() {
        assertTrue(
            "SmartHealthApi appends endpoint paths, so BackendConfig must select /api/v1.",
            BackendConfig.API_BASE_URL.endsWith("/api/v1"),
        )
    }
}
