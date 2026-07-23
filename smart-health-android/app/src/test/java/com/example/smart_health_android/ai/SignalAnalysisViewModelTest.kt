package com.example.smart_health_android.ai

import com.example.smart_health_android.data.SignalAnalysisRuntime
import com.example.smart_health_android.data.SignalAnalysisScanRuntime
import com.example.smart_health_android.data.SignalAnalysisSettings
import com.example.smart_health_android.data.SignalAnalysisStatus
import com.example.smart_health_android.data.SignalAnalysisUpdateRuntime
import com.example.smart_health_android.data.SmartHealthApiException
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SignalAnalysisViewModelTest {
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
    fun successfulLoadExposesOnlyBackendConfirmedSignalQualityStatus() = runTest(dispatcher) {
        val expected = signalAnalysisStatus()
        val repository = FakeSignalAnalysisRepository(result = expected)

        val viewModel = SignalAnalysisViewModel(repository)
        advanceUntilIdle()

        assertEquals(SignalAnalysisLoadState.Ready, viewModel.uiState.value.loadState)
        assertEquals(expected, viewModel.uiState.value.status)
        assertEquals(1, repository.loadCalls)
    }

    @Test
    fun networkFailureHasDedicatedOfflineRetryState() = runTest(dispatcher) {
        val repository = FakeSignalAnalysisRepository(failure = IOException("network unavailable"))
        val viewModel = SignalAnalysisViewModel(repository)
        advanceUntilIdle()

        assertEquals(SignalAnalysisLoadState.Offline, viewModel.uiState.value.loadState)
        assertNull(viewModel.uiState.value.status)

        repository.failure = null
        repository.result = signalAnalysisStatus()
        viewModel.onAction(SignalAnalysisUiAction.Retry)
        advanceUntilIdle()

        assertEquals(SignalAnalysisLoadState.Ready, viewModel.uiState.value.loadState)
        assertEquals(2, repository.loadCalls)
    }

    @Test
    fun forbiddenResponseStaysPermissionDeniedAndPreservesRequestId() = runTest(dispatcher) {
        val repository = FakeSignalAnalysisRepository(
            failure = SmartHealthApiException(
                statusCode = 403,
                code = "AI_SETTINGS_FORBIDDEN",
                requestId = "req-signal-403",
                message = "forbidden",
            ),
        )

        val viewModel = SignalAnalysisViewModel(repository)
        advanceUntilIdle()

        assertEquals(SignalAnalysisLoadState.PermissionDenied, viewModel.uiState.value.loadState)
        assertEquals("req-signal-403", viewModel.uiState.value.requestId)
        assertNull(viewModel.uiState.value.status)
    }

    @Test
    fun unexpectedFailureDoesNotCreateFallbackSettings() = runTest(dispatcher) {
        val repository = FakeSignalAnalysisRepository(failure = IllegalStateException("invalid contract"))

        val viewModel = SignalAnalysisViewModel(repository)
        advanceUntilIdle()

        assertEquals(SignalAnalysisLoadState.Error, viewModel.uiState.value.loadState)
        assertNull(viewModel.uiState.value.status)
    }
}

private class FakeSignalAnalysisRepository(
    var result: SignalAnalysisStatus? = null,
    var failure: Throwable? = null,
) : SignalAnalysisRepository {
    var loadCalls: Int = 0

    override suspend fun loadStatus(): SignalAnalysisStatus {
        loadCalls += 1
        failure?.let { throw it }
        return requireNotNull(result)
    }
}

private fun signalAnalysisStatus() = SignalAnalysisStatus(
    settings = SignalAnalysisSettings(
        analysisKind = "signal_quality",
        version = "signal_quality_rules_v1",
        analyzerVersion = "signal_quality_rules_v1",
        status = "local_signal_quality_only",
        updateSupported = false,
        clinicalDecisionSupport = false,
        accuracyMetricsAvailable = false,
        lastUpdateStatus = "unavailable",
    ),
    runtime = SignalAnalysisRuntime(
        scanAnalysis = SignalAnalysisScanRuntime(
            available = true,
            analysisKind = "signal_quality",
            analyzerVersion = "signal_quality_rules_v1",
            clinicalDecisionSupport = false,
        ),
        modelUpdate = SignalAnalysisUpdateRuntime(
            available = false,
            reason = "not_supported",
        ),
    ),
)
