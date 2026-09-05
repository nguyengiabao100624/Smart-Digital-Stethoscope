package com.example.smart_health_android.data

import java.io.File
import java.io.IOException
import kotlin.io.path.createTempDirectory
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class SmartHealthScanRecordApiTest {
    private lateinit var server: MockWebServer
    private lateinit var api: SmartHealthApi
    private lateinit var tempDir: File

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = SmartHealthApi(baseUrl = server.url("/api/v1").toString().trimEnd('/'))
        api.setAuthToken("record-token")
        tempDir = createTempDirectory("shcare-record-api-").toFile()
    }

    @After
    fun tearDown() {
        server.shutdown()
        tempDir.deleteRecursively()
    }

    @Test
    fun `waveform request is authenticated and parses bounded real points`() = runBlocking {
        server.enqueue(
            jsonResponse(
                """
                    {
                      "waveform": {
                        "scanId": "scan_1",
                        "sampleRate": 16000,
                        "representation": "signed_peak_v1",
                        "points": [0.0, 0.25, -0.75, 1.0],
                        "generatedAt": "2026-07-27T00:00:00.000Z"
                      }
                    }
                """,
            ),
        )

        val waveform = api.getScanWaveform("scan_1")

        val request = server.takeRequest()
        assertEquals("/api/v1/scans/scan_1/waveform", request.path)
        assertEquals("Bearer record-token", request.getHeader("Authorization"))
        assertEquals("scan_1", waveform.scanId)
        assertEquals(16000, waveform.sampleRate)
        assertEquals("signed_peak_v1", waveform.representation)
        assertEquals(listOf(0f, 0.25f, -0.75f, 1f), waveform.points)
    }

    @Test
    fun `legacy magnitude envelope remains readable without inventing signed polarity`() = runBlocking {
        server.enqueue(
            jsonResponse(
                """
                    {
                      "waveform": {
                        "scanId": "scan_legacy",
                        "sampleRate": 16000,
                        "points": [0.0, 0.3, 0.8, 0.2],
                        "generatedAt": "2026-07-27T00:00:00.000Z"
                      }
                    }
                """,
            ),
        )

        val waveform = api.getScanWaveform("scan_legacy")

        assertEquals("magnitude_envelope_v1", waveform.representation)
        assertEquals(listOf(0f, 0.3f, 0.8f, 0.2f), waveform.points)
    }

    @Test
    fun `same-origin audio source carries current authorization without exposing it in URL`() = runBlocking {
        server.enqueue(
            audioAccessResponse(
                url = "/api/v1/objects/local?key=opaque",
            ),
        )

        val source = api.getScanAudioPlaybackSource("scan_1")

        val request = server.takeRequest()
        assertEquals("/api/v1/scans/scan_1/audio-url", request.path)
        assertEquals("Bearer record-token", request.getHeader("Authorization"))
        assertEquals("Bearer record-token", source.headers["Authorization"])
        assertFalse(source.url.contains("record-token"))
        assertEquals("audio/wav", source.contentType)
    }

    @Test
    fun `foreign HTTPS audio source never receives bearer token`() = runBlocking {
        server.enqueue(
            audioAccessResponse(
                url = "https://cdn.example.test/private/scan.wav?signature=opaque",
            ),
        )

        val source = api.getScanAudioPlaybackSource("scan_1")

        assertTrue(source.url.startsWith("https://cdn.example.test/"))
        assertNull(source.headers["Authorization"])
        assertTrue(source.headers.isEmpty())
    }

    @Test
    fun `foreign cleartext audio source is rejected`() {
        server.enqueue(
            audioAccessResponse(
                url = "http://cdn.example.test/private/scan.wav",
            ),
        )

        assertThrows(IOException::class.java) {
            runBlocking {
                api.getScanAudioPlaybackSource("scan_1")
            }
        }
    }

    @Test
    fun `authorized audio download streams through part file and reports progress`() = runBlocking {
        val expected = ByteArray(4_096) { index -> (index % 251).toByte() }
        server.enqueue(audioAccessResponse(url = "/api/v1/objects/local?key=opaque"))
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "audio/wav")
                .setBody(okio.Buffer().write(expected)),
        )
        val destination = File(tempDir, "scan.wav")
        val progress = mutableListOf<ScanAudioDownloadProgress>()

        val result = api.downloadScanAudio(
            scanId = "scan_1",
            destination = destination,
            onProgress = progress::add,
        )

        val accessRequest = server.takeRequest()
        val downloadRequest = server.takeRequest()
        assertEquals("/api/v1/scans/scan_1/audio-url", accessRequest.path)
        assertEquals("/api/v1/objects/local?key=opaque", downloadRequest.path)
        assertEquals("Bearer record-token", downloadRequest.getHeader("Authorization"))
        assertArrayEquals(expected, destination.readBytes())
        assertEquals(destination, result.file)
        assertEquals(expected.size.toLong(), result.byteCount)
        assertTrue(progress.isNotEmpty())
        assertEquals(expected.size.toLong(), progress.last().bytesDownloaded)
        assertFalse(File(tempDir, "scan.wav.part").exists())
    }

    @Test
    fun `same-origin audio redirect never forwards bearer token to another origin`() = runBlocking {
        val foreignServer = MockWebServer()
        foreignServer.start()
        try {
            server.enqueue(audioAccessResponse(url = "/api/v1/objects/local?key=opaque"))
            server.enqueue(
                MockResponse()
                    .setResponseCode(302)
                    .setHeader("Location", foreignServer.url("/signed/scan.wav")),
            )
            foreignServer.enqueue(
                MockResponse()
                    .setResponseCode(200)
                    .setHeader("Content-Type", "audio/wav")
                    .setBody("RIFF-record"),
            )

            assertThrows(IOException::class.java) {
                runBlocking {
                    api.downloadScanAudio(
                        scanId = "scan_1",
                        destination = File(tempDir, "redirect.wav"),
                    )
                }
            }

            server.takeRequest()
            val localRequest = server.takeRequest()
            val foreignRequest = foreignServer.takeRequest()
            assertEquals("Bearer record-token", localRequest.getHeader("Authorization"))
            assertNull(foreignRequest.getHeader("Authorization"))
        } finally {
            foreignServer.shutdown()
        }
    }

    @Test
    fun `oversized audio response is rejected and partial file is removed`() {
        server.enqueue(audioAccessResponse(url = "/api/v1/objects/local?key=opaque"))
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "audio/wav")
                .setBody("too-large")
                .setHeader("Content-Length", (SmartHealthApi.MAX_SCAN_AUDIO_DOWNLOAD_BYTES + 1).toString()),
        )
        val destination = File(tempDir, "oversized.wav")

        assertThrows(IOException::class.java) {
            runBlocking {
                api.downloadScanAudio("scan_1", destination)
            }
        }

        assertFalse(destination.exists())
        assertFalse(File(tempDir, "oversized.wav.part").exists())
    }

    private fun jsonResponse(body: String) = MockResponse()
        .setResponseCode(200)
        .setHeader("Content-Type", "application/json")
        .setBody(body.trimIndent())

    private fun audioAccessResponse(url: String) = jsonResponse(
        """
            {
              "url": "$url",
              "expiresInSeconds": 900,
              "contentType": "audio/wav",
              "fileName": "shcare-record.wav"
            }
        """,
    )
}
