package com.example.smart_health_android.scan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.BackendStatus
import com.example.smart_health_android.data.LiveMetrics
import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.data.SmartDevice
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.canonicalWorkspaceId
import com.example.smart_health_android.data.toVietnameseMessage
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

private const val LIVE_WAVEFORM_SAMPLE_COUNT = 1_024

enum class LiveMonitoringLoadState {
    Loading,
    Content,
    PermissionDenied,
    Offline,
    Error,
}

data class LiveMonitoringUiState(
    val loadState: LiveMonitoringLoadState = LiveMonitoringLoadState.Loading,
    val devices: List<SmartDevice> = emptyList(),
    val selectedDeviceId: String = "",
    val activeScanId: String? = null,
    val mode: String = "heart",
    val expectation: LiveAudioExpectation? = null,
    val realtimeEpoch: Long = 0,
    val isRecording: Boolean = false,
    val isConnected: Boolean = false,
    val connectionText: String = "Đang kết nối máy chủ…",
    val metrics: LiveMetrics = LiveMetrics(),
    val hasMetrics: Boolean = false,
    val waveformSamples: List<Float> = List(LIVE_WAVEFORM_SAMPLE_COUNT) { 0f },
    val droppedPackets: Long = 0,
    val isBusy: Boolean = false,
    val isStopPending: Boolean = false,
    val actionError: String? = null,
    val interruptionMessage: String? = null,
    val terminalNotice: String? = null,
) {
    val selectedDevice: SmartDevice?
        get() = devices.firstOrNull { it.id == selectedDeviceId }

    val heartRate: Int
        get() = metrics.bpm.coerceAtLeast(0)

    val signalQuality: Int
        get() = metrics.levelPercent.coerceIn(0, 100)
}

sealed interface LiveMonitoringUiAction {
    data object Retry : LiveMonitoringUiAction
    data class StopRequested(val navigateBackAfterStop: Boolean = false) : LiveMonitoringUiAction
    data object BackRequested : LiveMonitoringUiAction
    data object CreateScanRequested : LiveMonitoringUiAction
    data class ConnectionChanged(
        val realtimeEpoch: Long,
        val scanId: String,
        val connected: Boolean,
        val message: String,
    ) : LiveMonitoringUiAction
    data class StatusChanged(val realtimeEpoch: Long, val status: BackendStatus) : LiveMonitoringUiAction
    data class MetricsChanged(val realtimeEpoch: Long, val metrics: LiveMetrics) : LiveMonitoringUiAction
    data class SamplesChanged(
        val realtimeEpoch: Long,
        val scanId: String,
        val samples: FloatArray,
    ) : LiveMonitoringUiAction
    data class ScanLifecycleChanged(
        val realtimeEpoch: Long,
        val scanId: String,
        val state: String,
    ) : LiveMonitoringUiAction
    data class DroppedPacketsChanged(
        val realtimeEpoch: Long,
        val scanId: String,
        val count: Long,
    ) : LiveMonitoringUiAction
}

sealed interface LiveMonitoringUiEffect {
    data object NavigateBack : LiveMonitoringUiEffect
    data object CreateScan : LiveMonitoringUiEffect
}

interface LiveMonitoringRepository {
    suspend fun getCurrentUser(): AuthUser
    suspend fun getScan(scanId: String): Scan
    suspend fun listDevices(): List<SmartDevice>
    suspend fun stopScan(scanId: String, idempotencyKey: String): Scan
}

class ApiLiveMonitoringRepository : LiveMonitoringRepository {
    override suspend fun getCurrentUser(): AuthUser = SmartHealthRepository.api.getMe()

    override suspend fun getScan(scanId: String): Scan = SmartHealthRepository.api.getScan(scanId)

    override suspend fun listDevices(): List<SmartDevice> = SmartHealthRepository.api.listDevices()

    override suspend fun stopScan(scanId: String, idempotencyKey: String): Scan =
        SmartHealthRepository.api.stopScan(scanId, idempotencyKey)
}

class LiveMonitoringViewModel(
    private val initialScanId: String?,
    private val repository: LiveMonitoringRepository,
    private val idempotencyKeyFactory: () -> String = { UUID.randomUUID().toString() },
) : ViewModel() {
    private val _uiState = MutableStateFlow(LiveMonitoringUiState())
    val uiState = _uiState.asStateFlow()

    private val _effects = Channel<LiveMonitoringUiEffect>(Channel.BUFFERED)
    val effects = _effects.receiveAsFlow()

    private var navigateAfterStop = false
    private var realtimeEpoch = 0L
    private var loadJob: Job? = null
    private var pendingStopScanId = ""
    private var pendingStopIdempotencyKey = ""

    init {
        load()
    }

    fun onAction(action: LiveMonitoringUiAction) {
        when (action) {
            LiveMonitoringUiAction.Retry -> load()
            is LiveMonitoringUiAction.StopRequested -> stop(action.navigateBackAfterStop)
            LiveMonitoringUiAction.BackRequested -> {
                if (_uiState.value.activeScanId == null) {
                    emitEffect(LiveMonitoringUiEffect.NavigateBack)
                } else {
                    stop(navigateBackAfterStop = true)
                }
            }
            LiveMonitoringUiAction.CreateScanRequested -> {
                if (_uiState.value.activeScanId == null && !_uiState.value.isBusy) {
                    emitEffect(LiveMonitoringUiEffect.CreateScan)
                }
            }
            is LiveMonitoringUiAction.ConnectionChanged -> updateForActiveScan(
                action.realtimeEpoch,
                action.scanId,
            ) {
                it.copy(isConnected = action.connected, connectionText = action.message)
            }
            is LiveMonitoringUiAction.StatusChanged -> applyStatus(action.realtimeEpoch, action.status)
            is LiveMonitoringUiAction.MetricsChanged -> applyMetrics(action.realtimeEpoch, action.metrics)
            is LiveMonitoringUiAction.SamplesChanged -> updateForActiveScan(
                action.realtimeEpoch,
                action.scanId,
            ) {
                it.copy(waveformSamples = action.samples.copyOf().toList())
            }
            is LiveMonitoringUiAction.ScanLifecycleChanged -> applyLifecycle(
                action.realtimeEpoch,
                action.scanId,
                action.state,
            )
            is LiveMonitoringUiAction.DroppedPacketsChanged -> updateForActiveScan(
                action.realtimeEpoch,
                action.scanId,
            ) {
                it.copy(droppedPackets = action.count.coerceAtLeast(0))
            }
        }
    }

    private fun load() {
        loadJob?.cancel()
        realtimeEpoch += 1
        val loadEpoch = realtimeEpoch
        _uiState.value = LiveMonitoringUiState(
            loadState = LiveMonitoringLoadState.Loading,
            realtimeEpoch = loadEpoch,
        )
        navigateAfterStop = false
        loadJob = viewModelScope.launch {
            runCatching {
                val user = repository.getCurrentUser()
                val scan = initialScanId?.trim()?.takeIf(String::isNotEmpty)?.let {
                    repository.getScan(it)
                }
                val devices = repository.listDevices()
                    .filter { it.type == "stethoscope" || it.type.isBlank() }
                    .sortedWith(
                        compareByDescending<SmartDevice> { it.online || it.connected }
                            .thenByDescending { it.lastSeenAt.orEmpty() },
                    )
                LoadedMonitoringContext(user, scan, devices)
            }.onSuccess { context ->
                if (loadEpoch != realtimeEpoch) return@onSuccess
                runCatching { applyLoadedContext(context, loadEpoch) }
                    .onFailure { if (loadEpoch == realtimeEpoch) applyLoadFailure(it, loadEpoch) }
            }
                .onFailure { if (loadEpoch == realtimeEpoch) applyLoadFailure(it, loadEpoch) }
        }
    }

    private fun applyLoadedContext(context: LoadedMonitoringContext, loadEpoch: Long) {
        val scan = context.scan
        val terminalNotice = when (scan?.status) {
            "completed" -> "Lượt đo này đã kết thúc. Mở hồ sơ để xem dữ liệu đã được lưu."
            else -> null
        }
        val interruptionMessage = when (scan?.status) {
            "interrupted", "failed" ->
                "Lượt đo này đã bị gián đoạn. Hãy kiểm tra kết nối trước khi đo lại."
            else -> null
        }
        val isTerminal = terminalNotice != null || interruptionMessage != null
        val expectation = if (scan == null || isTerminal) {
            null
        } else {
            val workspaceId = context.user.canonicalWorkspaceId()
            require(workspaceId.isNotBlank()) { "Không xác định được workspace của lượt đo." }
            LiveAudioExpectation(
                workspaceId = workspaceId,
                patientId = scan.patientId,
                deviceId = scan.deviceId,
                scanId = scan.id,
                audioProfile = scan.mode.ifBlank { "heart" },
            )
        }
        _uiState.value = LiveMonitoringUiState(
            loadState = LiveMonitoringLoadState.Content,
            devices = context.devices,
            selectedDeviceId = scan?.deviceId.orEmpty().ifBlank {
                context.devices.firstOrNull()?.id.orEmpty()
            },
            activeScanId = scan?.id?.takeUnless { isTerminal },
            mode = scan?.mode?.ifBlank { "heart" } ?: "heart",
            expectation = expectation,
            realtimeEpoch = loadEpoch,
            terminalNotice = terminalNotice,
            interruptionMessage = interruptionMessage,
        )
    }

    private fun applyLoadFailure(error: Throwable, loadEpoch: Long) {
        _uiState.value = LiveMonitoringUiState(
            loadState = when {
                error is SmartHealthApiException && error.statusCode in setOf(401, 403) ->
                    LiveMonitoringLoadState.PermissionDenied
                error is SmartHealthApiException -> LiveMonitoringLoadState.Error
                error is IOException -> LiveMonitoringLoadState.Offline
                else -> LiveMonitoringLoadState.Error
            },
            realtimeEpoch = loadEpoch,
            actionError = error.toVietnameseMessage("Không chuẩn bị được phiên theo dõi."),
        )
    }

    private fun stop(navigateBackAfterStop: Boolean) {
        val scanId = _uiState.value.activeScanId ?: return
        if (_uiState.value.isBusy) return
        if (_uiState.value.isStopPending) {
            navigateAfterStop = navigateAfterStop || navigateBackAfterStop
            return
        }
        navigateAfterStop = navigateAfterStop || navigateBackAfterStop
        _uiState.update {
            it.copy(
                isBusy = true,
                actionError = null,
            )
        }
        viewModelScope.launch {
            if (pendingStopScanId != scanId) {
                pendingStopScanId = scanId
                pendingStopIdempotencyKey = idempotencyKeyFactory()
            }
            runCatching { repository.stopScan(scanId, pendingStopIdempotencyKey) }
                .onSuccess { scan ->
                    if (_uiState.value.activeScanId != scanId) return@onSuccess
                    if (scan.id != scanId) {
                        applyStopFailure(IllegalStateException("Máy chủ trả sai lượt đo."))
                        return@onSuccess
                    }
                    _uiState.update {
                        it.copy(
                            isBusy = false,
                            isStopPending = scan.status !in TERMINAL_SCAN_STATES,
                            connectionText = if (scan.status in TERMINAL_SCAN_STATES) {
                                it.connectionText
                            } else {
                                "Máy chủ đã nhận yêu cầu; đang chờ thiết bị xác nhận dừng…"
                            },
                        )
                    }
                    if (scan.status in TERMINAL_SCAN_STATES) {
                        applyLifecycle(
                            _uiState.value.realtimeEpoch,
                            scanId,
                            if (scan.status == "completed") "scan_stopped" else "scan_interrupted",
                        )
                    }
                }
                .onFailure { error ->
                    if (_uiState.value.activeScanId == scanId) applyStopFailure(error)
                }
        }
    }

    private fun applyStopFailure(error: Throwable) {
        navigateAfterStop = false
        _uiState.update {
            it.copy(
                isBusy = false,
                isStopPending = false,
                actionError = error.toVietnameseMessage("Không gửi được yêu cầu dừng lượt đo."),
            )
        }
    }

    private fun applyStatus(eventEpoch: Long, status: BackendStatus) {
        val current = _uiState.value
        if (eventEpoch != current.realtimeEpoch) return
        if (status.recording && status.activeScanId != current.activeScanId) return
        _uiState.update {
            it.copy(
                isRecording = status.recording,
                activeScanId = if (status.recording) status.activeScanId else it.activeScanId,
            )
        }
    }

    private fun applyMetrics(eventEpoch: Long, metrics: LiveMetrics) {
        val current = _uiState.value
        if (eventEpoch != current.realtimeEpoch) return
        if (!metrics.recording || metrics.activeScanId != current.activeScanId) return
        _uiState.update {
            it.copy(
                metrics = metrics,
                hasMetrics = true,
            )
        }
    }

    private fun applyLifecycle(eventEpoch: Long, scanId: String, state: String) {
        val current = _uiState.value
        if (eventEpoch != current.realtimeEpoch) return
        if (scanId != current.activeScanId || state !in TERMINAL_REALTIME_EVENTS) return
        val interrupted = state == "scan_interrupted"
        _uiState.update {
            it.copy(
                activeScanId = null,
                expectation = null,
                isRecording = false,
                isConnected = false,
                metrics = LiveMetrics(),
                hasMetrics = false,
                waveformSamples = List(LIVE_WAVEFORM_SAMPLE_COUNT) { 0f },
                droppedPackets = 0,
                isBusy = false,
                isStopPending = false,
                interruptionMessage = if (interrupted) {
                    "Luồng âm thanh đã bị gián đoạn trước khi thiết bị xác nhận hoàn tất."
                } else {
                    null
                },
                terminalNotice = if (interrupted) {
                    null
                } else {
                    "Thiết bị đã xác nhận dừng lượt đo. Dữ liệu đã nhận có thể xem trong hồ sơ."
                },
            )
        }
        if (navigateAfterStop) {
            navigateAfterStop = false
            emitEffect(LiveMonitoringUiEffect.NavigateBack)
        }
        pendingStopScanId = ""
        pendingStopIdempotencyKey = ""
    }

    private inline fun updateForActiveScan(
        eventEpoch: Long,
        scanId: String,
        transform: (LiveMonitoringUiState) -> LiveMonitoringUiState,
    ) {
        _uiState.update { current ->
            if (current.realtimeEpoch == eventEpoch && current.activeScanId == scanId) {
                transform(current)
            } else {
                current
            }
        }
    }

    private fun emitEffect(effect: LiveMonitoringUiEffect) {
        viewModelScope.launch { _effects.send(effect) }
    }

    private data class LoadedMonitoringContext(
        val user: AuthUser,
        val scan: Scan?,
        val devices: List<SmartDevice>,
    )

    private companion object {
        val TERMINAL_SCAN_STATES = setOf("completed", "interrupted", "failed")
        val TERMINAL_REALTIME_EVENTS = setOf("scan_stopped", "scan_interrupted")
    }
}

class LiveMonitoringViewModelFactory(
    private val initialScanId: String?,
    private val repository: LiveMonitoringRepository = ApiLiveMonitoringRepository(),
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(LiveMonitoringViewModel::class.java))
        return LiveMonitoringViewModel(initialScanId, repository) as T
    }
}
