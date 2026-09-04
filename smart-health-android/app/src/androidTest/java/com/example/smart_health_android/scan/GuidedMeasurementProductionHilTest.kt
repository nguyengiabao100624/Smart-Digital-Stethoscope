package com.example.smart_health_android.scan

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.data.FirebaseAuthService
import com.example.smart_health_android.data.SmartHealthApi
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.StartScanRequest
import com.google.firebase.auth.FirebaseAuth
import com.google.android.gms.tasks.Tasks
import java.io.File
import java.io.IOException
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Explicit production HIL for the complete authenticated measurement path:
 * Android -> backend -> authenticated ESP WSS -> audio-v2 -> durable WAV.
 *
 * The test deliberately reuses the account already signed in on the physical phone. It accepts no
 * token, password, patient identifier, or device identifier through instrumentation arguments.
 */
@RunWith(AndroidJUnit4::class)
class GuidedMeasurementProductionHilTest {
    @Test
    fun authenticatedDeviceProducesDurableAudioMeasurement() = runBlocking {
        assumeTrue(
            "This production measurement HIL must be explicitly enabled.",
            InstrumentationRegistry.getArguments()
                .getString("shcareGuidedMeasurementHil")
                .equals("true", ignoreCase = true),
        )
        restoreOneTimeFirebaseSessionIfProvided()
        check(FirebaseAuth.getInstance().currentUser != null) {
            "The physical phone has no authenticated Firebase session."
        }

        val api = SmartHealthApi()
        val firebaseIdToken = FirebaseAuthService.getFreshIdToken(forceRefresh = true)
        api.authenticateFirebase(
            idToken = firebaseIdToken,
            expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
        )
        val patients = api.listPatients()
        val devices = api.listDevices()
        val patient = patients.firstOrNull()
            ?: error("The authenticated account has no accessible patient profile for a HIL scan.")
        val device = devices.firstOrNull { it.online || it.connected }
            ?: error("The authenticated account has no backend-confirmed online device.")
        val runId = UUID.randomUUID().toString()
        val startKey = "android-guided-hil-start-$runId"
        val stopKey = "android-guided-hil-stop-$runId"
        var activeScanId = ""
        var completed = false
        val downloadedFile = File(
            InstrumentationRegistry.getInstrumentation().targetContext.cacheDir,
            "guided-measurement-hil-$runId.wav",
        )

        try {
            val started = startWithTransportReconciliation(
                api = api,
                request = StartScanRequest(
                    patientId = patient.id,
                    mode = "heart",
                    bodySite = "aortic",
                    deviceId = device.id,
                    doctorNotes = "Production HIL - guided measurement integrity",
                ),
                idempotencyKey = startKey,
            )
            activeScanId = started.id
            assertTrue("Backend did not return a scan identifier.", activeScanId.isNotBlank())

            val recording = waitForScan(api, activeScanId, timeoutMillis = 45_000) { scan ->
                scan.status == "recording" && scan.sampleCount > 0
            }
            assertEquals("recording", recording.status)
            assertTrue("Device confirmed recording but sent no PCM samples.", recording.sampleCount > 0)

            delay(MINIMUM_CAPTURE_MILLIS)
            api.stopScan(activeScanId, stopKey)

            val durable = waitForScan(api, activeScanId, timeoutMillis = 90_000) { scan ->
                scan.status == "completed" &&
                    scan.durationSeconds >= MINIMUM_DURABLE_SECONDS &&
                    !scan.audioUrl.isNullOrBlank()
            }
            completed = durable.status == "completed"
            assertTrue(
                "Durable duration is shorter than the physical capture window.",
                durable.durationSeconds >= MINIMUM_DURABLE_SECONDS,
            )
            assertTrue(
                "Durable sample count is inconsistent with the capture duration.",
                durable.sampleCount >= durable.sampleRate * MINIMUM_DURABLE_SECONDS.toInt(),
            )
            assertNotNull("Completed scan has no audio URL.", durable.audioUrl)

            val waveform = api.getScanWaveform(activeScanId)
            assertEquals(activeScanId, waveform.scanId)
            assertTrue("Completed scan waveform is empty.", waveform.points.isNotEmpty())

            val downloaded = api.downloadScanAudio(activeScanId, downloadedFile)
            assertTrue("Downloaded WAV is too small to contain the captured signal.", downloaded.byteCount > 44)
            assertTrue("Downloaded WAV file was not persisted.", downloaded.file.isFile)
        } finally {
            if (activeScanId.isNotBlank() && !completed) {
                runCatching { api.stopScan(activeScanId, stopKey) }
            }
            downloadedFile.delete()
        }
    }

    private suspend fun startWithTransportReconciliation(
        api: SmartHealthApi,
        request: StartScanRequest,
        idempotencyKey: String,
    ): Scan {
        var lastTransportError: IOException? = null
        repeat(3) { attempt ->
            try {
                return api.startScan(request, idempotencyKey)
            } catch (error: SmartHealthApiException) {
                throw error
            } catch (error: IOException) {
                lastTransportError = error
                if (attempt < 2) delay((attempt + 1) * 750L)
            }
        }
        throw lastTransportError ?: IOException("The start request did not return a receipt.")
    }

    private suspend fun waitForScan(
        api: SmartHealthApi,
        scanId: String,
        timeoutMillis: Long,
        predicate: (Scan) -> Boolean,
    ): Scan {
        val deadline = System.currentTimeMillis() + timeoutMillis
        var latest: Scan? = null
        while (System.currentTimeMillis() < deadline) {
            latest = api.getScan(scanId)
            if (predicate(latest)) return latest
            if (latest.status in TERMINAL_FAILURE_STATES) {
                error("The physical audio session ended as ${latest.status}: ${latest.aiSummary}")
            }
            delay(POLL_INTERVAL_MILLIS)
        }
        error(
            "Timed out waiting for the physical audio session. " +
                "Last state=${latest?.status.orEmpty()}, samples=${latest?.sampleCount ?: 0}.",
        )
    }

    private fun restoreOneTimeFirebaseSessionIfProvided() {
        val tokenFile = File(
            InstrumentationRegistry.getInstrumentation().targetContext.filesDir,
            ONE_TIME_TOKEN_FILE_NAME,
        )
        if (!tokenFile.isFile) return

        val customToken = tokenFile.readText(Charsets.UTF_8).trim()
        check(tokenFile.delete()) { "The one-time Firebase token could not be deleted before use." }
        check(customToken.isNotBlank()) { "The one-time Firebase token file was empty." }
        Tasks.await(
            FirebaseAuth.getInstance().signInWithCustomToken(customToken),
            30,
            TimeUnit.SECONDS,
        )
    }

    private companion object {
        const val ONE_TIME_TOKEN_FILE_NAME = "guided-measurement-hil.custom-token"
        const val MINIMUM_CAPTURE_MILLIS = 8_000L
        const val MINIMUM_DURABLE_SECONDS = 5.0
        const val POLL_INTERVAL_MILLIS = 1_000L
        val TERMINAL_FAILURE_STATES = setOf("failed", "interrupted", "cancelled")
    }
}
