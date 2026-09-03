package com.example.smart_health_android.scan

import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.BackendStatus
import com.example.smart_health_android.data.LiveMetrics
import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.data.SmartDevice
import com.example.smart_health_android.data.SmartHealthApiException
import java.net.UnknownHostException
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
class LiveMonitoringViewModelTest {
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
    fun `active scan binds exact authenticated identity and prefers online stethoscope`() =
        runTest(dispatcher) {
            val repository = FakeLiveMonitoringRepository(
                scan = scan(status = "recording", deviceId = "device-offline"),
                devices = listOf(
                    device("wrong-kind", type = "thermometer", online = true),
                    device("device-online", online = true),
                    device("device-offline", online = false),
                ),
            )

            val viewModel = LiveMonitoringViewModel("scan-1", repository)
            runCurrent()

            val state = viewModel.uiState.value
            assertEquals(LiveMonitoringLoadState.Content, state.loadState)
            assertEquals(listOf("device-online", "device-offline"), state.devices.map { it.id })
            assertEquals("device-offline", state.selectedDeviceId)
            assertEquals(
                LiveAudioExpectation(
                    "workspace-1",
                    "patient-1",
                    "device-offline",
                    "scan-1",
                    "heart",
                ),
                state.expectation,
            )
            assertEquals("scan-1", state.activeScanId)
        }

    @Test
    fun `terminal scan never opens realtime and exposes honest result`() = runTest(dispatcher) {
        val viewModel = LiveMonitoringViewModel(
            "scan-1",
            FakeLiveMonitoringRepository(scan = scan(status = "completed")),
        )
        runCurrent()

        assertNull(viewModel.uiState.value.expectation)
        assertNull(viewModel.uiState.value.activeScanId)
        assertTrue(viewModel.uiState.value.terminalNotice.orEmpty().contains("đã kết thúc"))
    }

    @Test
    fun `accepted stop waits for device lifecycle before success and navigation`() =
        runTest(dispatcher) {
            val repository = FakeLiveMonitoringRepository(
                scan = scan(status = "recording"),
                stopResult = scan(status = "recording"),
            )
            val viewModel = LiveMonitoringViewModel("scan-1", repository)
            runCurrent()
            val realtimeEpoch = viewModel.uiState.value.realtimeEpoch
            val effect = async { viewModel.effects.first() }

            viewModel.onAction(LiveMonitoringUiAction.StopRequested(navigateBackAfterStop = true))
            runCurrent()

            assertTrue(viewModel.uiState.value.isStopPending)
            assertEquals("scan-1", viewModel.uiState.value.activeScanId)
            assertNull(viewModel.uiState.value.terminalNotice)
            assertFalse(effect.isCompleted)

            viewModel.onAction(
                LiveMonitoringUiAction.ScanLifecycleChanged(
                    realtimeEpoch,
                    "scan-1",
                    "scan_stopped",
                ),
            )
            runCurrent()

            assertNull(viewModel.uiState.value.activeScanId)
            assertTrue(viewModel.uiState.value.terminalNotice.orEmpty().contains("xác nhận"))
            assertEquals(LiveMonitoringUiEffect.NavigateBack, effect.await())
        }

    @Test
    fun `back while stop is already pending waits for terminal device event then navigates`() =
        runTest(dispatcher) {
            val repository = FakeLiveMonitoringRepository(
                scan = scan(status = "recording"),
                stopResult = scan(status = "recording"),
            )
            val viewModel = LiveMonitoringViewModel("scan-1", repository)
            runCurrent()
            val realtimeEpoch = viewModel.uiState.value.realtimeEpoch

            viewModel.onAction(LiveMonitoringUiAction.StopRequested())
            runCurrent()
            assertTrue(viewModel.uiState.value.isStopPending)

            val effect = async { viewModel.effects.first() }
            viewModel.onAction(LiveMonitoringUiAction.BackRequested)
            runCurrent()
            assertFalse(effect.isCompleted)

            viewModel.onAction(
                LiveMonitoringUiAction.ScanLifecycleChanged(
                    realtimeEpoch,
                    "scan-1",
                    "scan_stopped",
                ),
            )
            runCurrent()
            assertEquals(LiveMonitoringUiEffect.NavigateBack, effect.await())
        }

    @Test
    fun `foreign realtime status metrics and lifecycle cannot mutate selected scan`() =
        runTest(dispatcher) {
            val viewModel = LiveMonitoringViewModel(
                "scan-1",
                FakeLiveMonitoringRepository(scan = scan(status = "recording")),
            )
            runCurrent()
            val realtimeEpoch = viewModel.uiState.value.realtimeEpoch

            viewModel.onAction(
                LiveMonitoringUiAction.StatusChanged(
                    realtimeEpoch,
                    BackendStatus(recording = true, activeScanId = "scan-other"),
                ),
            )
            viewModel.onAction(
                LiveMonitoringUiAction.MetricsChanged(
                    realtimeEpoch,
                    LiveMetrics(recording = true, activeScanId = "scan-other", bpm = 99),
                ),
            )
            viewModel.onAction(
                LiveMonitoringUiAction.ScanLifecycleChanged(
                    realtimeEpoch,
                    "scan-other",
                    "scan_stopped",
                ),
            )

            assertEquals("scan-1", viewModel.uiState.value.activeScanId)
            assertFalse(viewModel.uiState.value.isRecording)
            assertFalse(viewModel.uiState.value.hasMetrics)
            assertNull(viewModel.uiState.value.terminalNotice)
        }

    @Test
    fun `interrupted lifecycle clears waveform metrics and reports interruption`() =
        runTest(dispatcher) {
            val viewModel = LiveMonitoringViewModel(
                "scan-1",
                FakeLiveMonitoringRepository(scan = scan(status = "recording")),
            )
            runCurrent()
            val realtimeEpoch = viewModel.uiState.value.realtimeEpoch
            viewModel.onAction(
                LiveMonitoringUiAction.MetricsChanged(
                    realtimeEpoch,
                    LiveMetrics(recording = true, activeScanId = "scan-1", bpm = 88),
                ),
            )
            viewModel.onAction(
                LiveMonitoringUiAction.SamplesChanged(
                    realtimeEpoch,
                    "scan-1",
                    floatArrayOf(0.5f, -0.5f),
                ),
            )

            viewModel.onAction(
                LiveMonitoringUiAction.ScanLifecycleChanged(
                    realtimeEpoch,
                    "scan-1",
                    "scan_interrupted",
                ),
            )

            val state = viewModel.uiState.value
            assertNull(state.activeScanId)
            assertFalse(state.hasMetrics)
            assertTrue(state.waveformSamples.all { it == 0f })
            assertTrue(state.interruptionMessage.orEmpty().contains("gián đoạn"))
            assertNull(state.terminalNotice)

            viewModel.onAction(
                LiveMonitoringUiAction.SamplesChanged(
                    realtimeEpoch,
                    "scan-1",
                    floatArrayOf(0.75f),
                ),
            )
            viewModel.onAction(
                LiveMonitoringUiAction.ConnectionChanged(
                    realtimeEpoch,
                    "scan-1",
                    true,
                    "stale",
                ),
            )
            assertTrue(viewModel.uiState.value.waveformSamples.all { it == 0f })
            assertFalse(viewModel.uiState.value.isConnected)
        }

    @Test
    fun `retry epoch rejects queued callbacks from the previous socket for the same scan`() =
        runTest(dispatcher) {
            val viewModel = LiveMonitoringViewModel(
                "scan-1",
                FakeLiveMonitoringRepository(scan = scan(status = "recording")),
            )
            runCurrent()
            val staleEpoch = viewModel.uiState.value.realtimeEpoch

            viewModel.onAction(LiveMonitoringUiAction.Retry)
            runCurrent()
            val currentEpoch = viewModel.uiState.value.realtimeEpoch
            assertTrue(currentEpoch > staleEpoch)

            viewModel.onAction(
                LiveMonitoringUiAction.ConnectionChanged(
                    staleEpoch,
                    "scan-1",
                    true,
                    "stale socket",
                ),
            )
            viewModel.onAction(
                LiveMonitoringUiAction.ScanLifecycleChanged(
                    staleEpoch,
                    "scan-1",
                    "scan_stopped",
                ),
            )

            assertEquals("scan-1", viewModel.uiState.value.activeScanId)
            assertFalse(viewModel.uiState.value.isConnected)
            assertNull(viewModel.uiState.value.terminalNotice)
        }

    @Test
    fun `load distinguishes permission denial and offline retry state`() = runTest(dispatcher) {
        val forbidden = LiveMonitoringViewModel(
            "scan-1",
            FakeLiveMonitoringRepository(
                loadFailure = SmartHealthApiException(403, "FORBIDDEN", message = "denied"),
            ),
        )
        runCurrent()
        assertEquals(LiveMonitoringLoadState.PermissionDenied, forbidden.uiState.value.loadState)

        val offline = LiveMonitoringViewModel(
            "scan-1",
            FakeLiveMonitoringRepository(loadFailure = UnknownHostException("offline")),
        )
        runCurrent()
        assertEquals(LiveMonitoringLoadState.Offline, offline.uiState.value.loadState)
    }

    private fun scan(
        status: String,
        deviceId: String = "device-online",
    ) = Scan(
        id = "scan-1",
        patientId = "patient-1",
        organizationId = "workspace-1",
        status = status,
        mode = "heart",
        deviceId = deviceId,
    )

    private fun device(
        id: String,
        type: String = "stethoscope",
        online: Boolean,
    ) = SmartDevice(
        id = id,
        type = type,
        online = online,
        organizationId = "workspace-1",
    )
}

private class FakeLiveMonitoringRepository(
    private val user: AuthUser = AuthUser(
        id = "user-1",
        currentWorkspaceId = "workspace-1",
        organizationId = "workspace-1",
    ),
    private val scan: Scan? = null,
    private val devices: List<SmartDevice> = listOf(
        SmartDevice(id = "device-online", online = true, organizationId = "workspace-1"),
    ),
    private val stopResult: Scan = scan ?: Scan(id = "scan-1", status = "recording"),
    private val loadFailure: Throwable? = null,
) : LiveMonitoringRepository {
    override suspend fun getCurrentUser(): AuthUser = loadFailure?.let { throw it } ?: user

    override suspend fun getScan(scanId: String): Scan = scan ?: error("scan not configured")

    override suspend fun listDevices(): List<SmartDevice> = devices

    override suspend fun stopScan(scanId: String, idempotencyKey: String): Scan = stopResult
}
