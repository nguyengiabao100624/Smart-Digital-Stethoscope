package com.example.smart_health_android.records

import com.example.smart_health_android.data.PatientSnapshot
import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.data.ScanAudioDownloadProgress
import com.example.smart_health_android.data.ScanAudioDownloadResult
import com.example.smart_health_android.data.ScanAudioPlaybackSource
import com.example.smart_health_android.data.ScanWaveform
import com.example.smart_health_android.data.SmartHealthApiException
import java.io.File
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class RecordDetailViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `initial load exposes confirmed scan and real waveform`() = runTest(dispatcher) {
        val repository = FakeRecordDetailRepository()

        val viewModel = RecordDetailViewModel(
            recordId = "scan_1",
            canManageScan = true,
            repository = repository,
        )
        runCurrent()

        val state = viewModel.uiState.value
        assertEquals(RecordDetailLoadState.Ready, state.loadState)
        assertEquals("scan_1", state.scan?.id)
        assertEquals(RecordWaveformLoadState.Ready, state.waveformLoadState)
        assertEquals(listOf(0.1f, 0.5f, 0.2f), state.waveform?.points)
        assertFalse(state.isStale)
    }

    @Test
    fun `initial permission denial is distinct from offline and generic errors`() = runTest(dispatcher) {
        val repository = FakeRecordDetailRepository(
            scanResults = ArrayDeque(
                listOf(
                    Result.failure(
                        SmartHealthApiException(
                            statusCode = 403,
                            code = "SCAN_SCOPE_DENIED",
                            message = "forbidden",
                        ),
                    ),
                ),
            ),
        )

        val viewModel = RecordDetailViewModel("scan_1", false, repository)
        runCurrent()

        assertEquals(RecordDetailLoadState.PermissionDenied, viewModel.uiState.value.loadState)
        assertNull(viewModel.uiState.value.scan)
    }

    @Test
    fun `initial network failure is an explicit offline state`() = runTest(dispatcher) {
        val repository = FakeRecordDetailRepository(
            scanResults = ArrayDeque(listOf(Result.failure(IOException("offline")))),
        )

        val viewModel = RecordDetailViewModel("scan_1", false, repository)
        runCurrent()

        assertEquals(RecordDetailLoadState.Offline, viewModel.uiState.value.loadState)
    }

    @Test
    fun `refresh failure retains last confirmed scan and marks it stale`() = runTest(dispatcher) {
        val repository = FakeRecordDetailRepository(
            scanResults = ArrayDeque(
                listOf(
                    Result.success(completedScan()),
                    Result.failure(IOException("offline")),
                ),
            ),
        )
        val viewModel = RecordDetailViewModel("scan_1", false, repository)
        runCurrent()

        viewModel.onAction(RecordDetailUiAction.Refresh)
        runCurrent()

        val state = viewModel.uiState.value
        assertEquals(RecordDetailLoadState.Ready, state.loadState)
        assertEquals("scan_1", state.scan?.id)
        assertTrue(state.isStale)
        assertTrue(state.errorMessage.isNotBlank())
    }

    @Test
    fun `view-only route cannot issue stop mutation`() = runTest(dispatcher) {
        val repository = FakeRecordDetailRepository(
            scanResults = ArrayDeque(listOf(Result.success(recordingScan()))),
        )
        val viewModel = RecordDetailViewModel("scan_1", false, repository)
        runCurrent()

        viewModel.onAction(RecordDetailUiAction.StopRecording)
        runCurrent()

        assertEquals(0, repository.stopCalls)
        assertFalse(viewModel.uiState.value.isStopping)
    }

    @Test
    fun `stop success is shown only after backend confirms same scan terminal state`() = runTest(dispatcher) {
        val repository = FakeRecordDetailRepository(
            scanResults = ArrayDeque(listOf(Result.success(recordingScan()))),
            stopResult = Result.success(completedScan()),
        )
        val viewModel = RecordDetailViewModel("scan_1", true, repository)
        runCurrent()

        viewModel.onAction(RecordDetailUiAction.StopRecording)
        runCurrent()

        assertEquals(1, repository.stopCalls)
        assertEquals("completed", viewModel.uiState.value.scan?.status)
        assertTrue(viewModel.uiState.value.statusMessage.isNotBlank())
    }

    @Test
    fun `stop retry reuses exact idempotency key and rejects nonterminal receipt`() =
        runTest(dispatcher) {
            val repository = FakeRecordDetailRepository(
                scanResults = ArrayDeque(listOf(Result.success(recordingScan()))),
                stopResults = ArrayDeque(
                    listOf(
                        Result.failure(IOException("timeout")),
                        Result.success(recordingScan()),
                    ),
                ),
            )
            val viewModel = RecordDetailViewModel(
                recordId = "scan_1",
                canManageScan = true,
                repository = repository,
                idempotencyKeyFactory = { "stable-record-stop-key" },
            )
            runCurrent()

            viewModel.onAction(RecordDetailUiAction.StopRecording)
            runCurrent()
            viewModel.onAction(RecordDetailUiAction.StopRecording)
            runCurrent()

            assertEquals(
                listOf("stable-record-stop-key", "stable-record-stop-key"),
                repository.stopKeys,
            )
            assertEquals("recording", viewModel.uiState.value.scan?.status)
            assertTrue(viewModel.uiState.value.statusMessage.isBlank())
            assertTrue(viewModel.uiState.value.errorMessage.isNotBlank())
        }

    @Test
    fun `share effect is emitted only after authorized download completes`() = runTest(dispatcher) {
        val repository = FakeRecordDetailRepository()
        val viewModel = RecordDetailViewModel("scan_1", false, repository)
        runCurrent()
        val effect = async { viewModel.effects.first() }

        viewModel.onAction(RecordDetailUiAction.ShareAudio)
        runCurrent()

        assertEquals(1, repository.downloadCalls)
        assertTrue(effect.await() is RecordDetailUiEffect.ShareAudio)
        assertEquals(RecordAudioOperation.None, viewModel.uiState.value.audioOperation)
    }

    private class FakeRecordDetailRepository(
        private val scanResults: ArrayDeque<Result<Scan>> = ArrayDeque(
            listOf(Result.success(completedScan())),
        ),
        private val waveformResult: Result<ScanWaveform> = Result.success(
            ScanWaveform(
                scanId = "scan_1",
                sampleRate = 16_000,
                points = listOf(0.1f, 0.5f, 0.2f),
                generatedAt = "2026-07-27T00:00:00.000Z",
            ),
        ),
        private val stopResult: Result<Scan> = Result.success(completedScan()),
        private val stopResults: ArrayDeque<Result<Scan>>? = null,
    ) : RecordDetailRepository {
        var stopCalls = 0
        val stopKeys = mutableListOf<String>()
        var downloadCalls = 0

        override suspend fun getScan(recordId: String): Scan =
            scanResults.removeFirst().getOrThrow()

        override suspend fun getWaveform(recordId: String): ScanWaveform =
            waveformResult.getOrThrow()

        override suspend fun stopScan(recordId: String, idempotencyKey: String): Scan {
            stopCalls += 1
            stopKeys += idempotencyKey
            stopResults?.let { return it.removeFirst().getOrThrow() }
            return stopResult.getOrThrow()
        }

        override suspend fun getPlaybackSource(recordId: String): ScanAudioPlaybackSource =
            ScanAudioPlaybackSource(
                url = "https://cdn.example.test/scan.wav",
                headers = emptyMap(),
                expiresInSeconds = 900,
                contentType = "audio/wav",
                fileName = "shcare-record.wav",
            )

        override suspend fun downloadAudio(
            recordId: String,
            purpose: RecordAudioPurpose,
            onProgress: (ScanAudioDownloadProgress) -> Unit,
        ): RecordAudioArtifact {
            downloadCalls += 1
            onProgress(ScanAudioDownloadProgress(4, 4))
            return RecordAudioArtifact(
                download = ScanAudioDownloadResult(
                    file = File("record.wav"),
                    byteCount = 4,
                    contentType = "audio/wav",
                ),
                displayName = "shcare-record.wav",
            )
        }
    }

    companion object {
        private fun completedScan() = Scan(
            id = "scan_1",
            patientId = "patient_1",
            patient = PatientSnapshot(
                id = "patient_1",
                patientCode = "BN-001",
                name = "Nguyễn An",
            ),
            status = "completed",
            audioUrl = "/api/scans/scan_1/audio",
        )

        private fun recordingScan() = completedScan().copy(status = "recording")
    }
}
