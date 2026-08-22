package com.example.smart_health_android.data

import java.io.File
import java.io.IOException
import java.security.MessageDigest
import kotlin.io.path.createTempDirectory
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class SmartHealthExportApiTest {
    private lateinit var server: MockWebServer
    private lateinit var api: SmartHealthApi
    private lateinit var tempDir: File

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = SmartHealthApi(baseUrl = server.url("/api/v1").toString().trimEnd('/'))
        api.setAuthToken("export-token")
        tempDir = createTempDirectory("shcare-export-api-").toFile()
    }

    @After
    fun tearDown() {
        server.shutdown()
        tempDir.deleteRecursively()
    }

    @Test
    fun `create export is idempotent and sends the canonical personal dataset contract`() = runBlocking {
        server.enqueue(exportJobResponse())

        val job = api.createExport(
            format = "pdf",
            includeAudio = false,
            includeReports = true,
            includeHistory = true,
            startDate = "2026-07-01",
            endDate = "2026-07-27",
            idempotencyKey = "export-intent-1",
        )

        val request = server.takeRequest()
        val body = JSONObject(request.body.readUtf8())
        assertEquals("/api/v1/exports", request.path)
        assertEquals("Bearer export-token", request.getHeader("Authorization"))
        assertEquals("export-intent-1", request.getHeader("Idempotency-Key"))
        assertEquals("clinical_bundle", body.getString("dataset"))
        assertEquals("2026-07-01", body.getJSONObject("filters").getString("startDate"))
        assertEquals("2026-07-27", body.getJSONObject("filters").getString("endDate"))
        assertFalse(body.has("organizationId"))
        assertEquals("export_1", job.id)
        assertEquals("user_1", job.createdByUserId)
        assertEquals("workspace_1", job.workspaceId)
        assertEquals("personal", job.scopeKind)
    }

    @Test
    fun `download verifies renderer and sha before publishing the completed file`() = runBlocking {
        val expected = "real-export-artifact".toByteArray()
        val sha256 = sha256(expected)
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/pdf")
                .setHeader("Content-Disposition", "attachment; filename=\"shcare-export-export_1.pdf\"")
                .setHeader("X-Shcare-Artifact-SHA256", sha256)
                .setHeader("X-Shcare-Renderer-Version", "shcare.export-artifact.v1")
                .setBody(okio.Buffer().write(expected)),
        )
        val destination = File(tempDir, "export.pdf")
        val progress = mutableListOf<ExportDownloadProgress>()

        val result = api.downloadExport(
            exportJob(artifactSha256 = sha256),
            destination,
            progress::add,
        )

        val request = server.takeRequest()
        assertEquals("/api/v1/exports/download/export_1", request.path)
        assertEquals("Bearer export-token", request.getHeader("Authorization"))
        assertArrayEquals(expected, destination.readBytes())
        assertEquals(sha256, result.artifactSha256)
        assertEquals("shcare.export-artifact.v1", result.rendererVersion)
        assertEquals("application/pdf", result.contentType)
        assertEquals(expected.size.toLong(), progress.last().bytesDownloaded)
        assertFalse(File(tempDir, "export.pdf.part").exists())
    }

    @Test
    fun `integrity mismatch removes both partial and destination artifacts`() {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/pdf")
                .setHeader("X-Shcare-Artifact-SHA256", "0".repeat(64))
                .setHeader("X-Shcare-Renderer-Version", "shcare.export-artifact.v1")
                .setBody("tampered"),
        )
        val destination = File(tempDir, "tampered.pdf")

        assertThrows(IOException::class.java) {
            runBlocking {
                api.downloadExport(
                    exportJob(artifactSha256 = "0".repeat(64)),
                    destination,
                )
            }
        }

        assertFalse(destination.exists())
        assertFalse(File(tempDir, "tampered.pdf.part").exists())
    }

    @Test
    fun `cross origin export url is rejected before any authenticated request`() {
        val destination = File(tempDir, "cross-origin.pdf")

        assertThrows(IOException::class.java) {
            runBlocking {
                api.downloadExport(
                    exportJob(artifactSha256 = "a".repeat(64)).copy(
                        downloadUrl = "https://example.invalid/export.pdf",
                    ),
                    destination,
                )
            }
        }

        assertEquals(0, server.requestCount)
        assertFalse(destination.exists())
    }

    private fun exportJobResponse() = MockResponse()
        .setResponseCode(201)
        .setHeader("Content-Type", "application/json")
        .setBody("""{"export":${exportJobJson()},"replayed":false}""")

    private fun exportJob(artifactSha256: String) = ExportJob(
        id = "export_1",
        organizationId = "workspace_1",
        workspaceId = "workspace_1",
        createdByUserId = "user_1",
        format = "pdf",
        dataset = "clinical_bundle",
        scopeKind = "personal",
        rendererVersion = "shcare.export-artifact.v1",
        status = "ready",
        recordCount = 3,
        downloadUrl = "/api/v1/exports/download/export_1",
        artifactSha256 = artifactSha256,
    )

    private fun exportJobJson() = """
        {
          "id": "export_1",
          "organizationId": "workspace_1",
          "workspaceId": "workspace_1",
          "createdByUserId": "user_1",
          "format": "pdf",
          "dataset": "clinical_bundle",
          "scopeKind": "personal",
          "rendererVersion": "shcare.export-artifact.v1",
          "status": "ready",
          "includeAudio": false,
          "includeReports": true,
          "includeHistory": true,
          "startDate": "2026-07-01",
          "endDate": "2026-07-27",
          "recordCount": 3,
          "downloadUrl": "/api/v1/exports/download/export_1",
          "artifactByteSize": 20,
          "artifactSha256": "${"a".repeat(64)}",
          "createdAt": "2026-07-27T06:00:00.000Z"
        }
    """.trimIndent()

    private fun sha256(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256")
            .digest(bytes)
            .joinToString("") { "%02x".format(it) }
}
