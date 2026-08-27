package com.example.smart_health_android.storage

import com.example.smart_health_android.data.SmartHealthApi
import java.io.File
import java.io.IOException
import kotlin.io.path.createTempDirectory
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test

class ExportDataRepositoryTest {
    private lateinit var server: MockWebServer
    private lateinit var cacheDirectory: File
    private lateinit var repository: ApiExportDataRepository

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        cacheDirectory = createTempDirectory("shcare-export-repository-").toFile()
        val api = SmartHealthApi(server.url("/api/v1").toString().trimEnd('/'))
        api.setAuthToken("export-token")
        repository = ApiExportDataRepository(api, cacheDirectory)
    }

    @After
    fun tearDown() {
        server.shutdown()
        cacheDirectory.deleteRecursively()
    }

    @Test
    fun `missing authenticated owner context fails before the network`() {
        assertThrows(IOException::class.java) {
            runBlocking {
                repository.createAndDownload(
                    request = ExportDataRequest(),
                    idempotencyKey = "export-empty-owner",
                    expectedUserId = "",
                    expectedWorkspaceId = "workspace_1",
                    onProgress = {},
                )
            }
        }

        assertEquals(0, server.requestCount)
    }

    @Test
    fun `unknown renderer or empty artifact is rejected before download`() {
        server.enqueue(
            MockResponse()
                .setResponseCode(201)
                .setHeader("Content-Type", "application/json")
                .setBody(exportResponse(rendererVersion = "unknown.renderer", byteSize = 0)),
        )

        assertThrows(IOException::class.java) {
            runBlocking {
                repository.createAndDownload(
                    request = ExportDataRequest(),
                    idempotencyKey = "export-invalid-artifact",
                    expectedUserId = "user_1",
                    expectedWorkspaceId = "workspace_1",
                    onProgress = {},
                )
            }
        }

        assertEquals(1, server.requestCount)
    }

    private fun exportResponse(
        rendererVersion: String,
        byteSize: Long,
    ) = """
        {
          "export": {
            "id": "export_1",
            "organizationId": "workspace_1",
            "workspaceId": "workspace_1",
            "createdByUserId": "user_1",
            "format": "pdf",
            "dataset": "clinical_bundle",
            "scopeKind": "personal",
            "rendererVersion": "$rendererVersion",
            "status": "ready",
            "includeAudio": false,
            "includeReports": true,
            "includeHistory": true,
            "startDate": "",
            "endDate": "",
            "recordCount": 2,
            "downloadUrl": "/api/v1/exports/download/export_1",
            "artifactByteSize": $byteSize,
            "artifactSha256": "${"a".repeat(64)}",
            "createdAt": "2026-07-27T08:00:00.000Z"
          },
          "replayed": false
        }
    """.trimIndent()
}
