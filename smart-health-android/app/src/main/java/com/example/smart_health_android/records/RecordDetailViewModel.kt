package com.example.smart_health_android.records

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.data.ScanAudioDownloadProgress
import com.example.smart_health_android.data.ScanAudioDownloadResult
import com.example.smart_health_android.data.ScanAudioPlaybackSource
import com.example.smart_health_android.data.ScanWaveform
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.toVietnameseMessage
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class RecordDetailLoadState {
    Loading,
    Ready,
    NotFound,
    PermissionDenied,
    Offline,
    Error,
}

enum class RecordWaveformLoadState {
    Loading,
    Ready,
    Unavailable,
    Error,
}

enum class RecordAudioOperation {
    None,
    ResolvingPlayback,
    PreparingShare,
    PreparingDownload,
}

enum class RecordAudioPurpose {
    Share,
    Save,
}

data class RecordAudioArtifact(
    val download: ScanAudioDownloadResult,
    val displayName: String,
)

data class RecordDetailUiState(
    val loadState: RecordDetailLoadState = RecordDetailLoadState.Loading,
    val scan: Scan? = null,
    val waveformLoadState: RecordWaveformLoadState = RecordWaveformLoadState.Loading,
    val waveform: ScanWaveform? = null,
    val canManageScan: Boolean = false,
    val isRefreshing: Boolean = false,
    val isStopping: Boolean = false,
    val isStale: Boolean = false,
    val audioOperation: RecordAudioOperation = RecordAudioOperation.None,
    val audioProgress: ScanAudioDownloadProgress? = null,
    val errorMessage: String = "",
    val statusMessage: String = "",
) {
    val hasAudio: Boolean
        get() = !scan?.audioUrl.isNullOrBlank()
}

sealed interface RecordDetailUiAction {
    data object Retry : RecordDetailUiAction
    data object Refresh : RecordDetailUiAction
    data object StopRecording : RecordDetailUiAction
    data object PlayAudio : RecordDetailUiAction
    data object ShareAudio : RecordDetailUiAction
    data object DownloadAudio : RecordDetailUiAction
    data class SaveAudioFinished(val success: Boolean) : RecordDetailUiAction
    data object SaveAudioCancelled : RecordDetailUiAction
    data object ShareLaunchFailed : RecordDetailUiAction
    data object DismissMessage : RecordDetailUiAction
}

sealed interface RecordDetailUiEffect {
    data class PlayAudio(val source: ScanAudioPlaybackSource) : RecordDetailUiEffect
    data class ShareAudio(val artifact: RecordAudioArtifact) : RecordDetailUiEffect
    data class ChooseSaveDestination(val artifact: RecordAudioArtifact) : RecordDetailUiEffect
}

interface RecordDetailRepository {
    suspend fun getScan(recordId: String): Scan
    suspend fun getWaveform(recordId: String): ScanWaveform
    suspend fun stopScan(recordId: String, idempotencyKey: String): Scan
    suspend fun getPlaybackSource(recordId: String): ScanAudioPlaybackSource
    suspend fun downloadAudio(
        recordId: String,
        purpose: RecordAudioPurpose,
        onProgress: (ScanAudioDownloadProgress) -> Unit,
    ): RecordAudioArtifact
}

class ApiRecordDetailRepository(
    context: Context,
) : RecordDetailRepository {
    init {
        RecordAudioCache.initialize(context.applicationContext)
    }

    override suspend fun getScan(recordId: String): Scan =
        SmartHealthRepository.api.getScan(recordId)

    override suspend fun getWaveform(recordId: String): ScanWaveform =
        SmartHealthRepository.api.getScanWaveform(recordId)

    override suspend fun stopScan(recordId: String, idempotencyKey: String): Scan =
        SmartHealthRepository.api.stopScan(recordId, idempotencyKey)

    override suspend fun getPlaybackSource(recordId: String): ScanAudioPlaybackSource =
        SmartHealthRepository.api.getScanAudioPlaybackSource(recordId)

    override suspend fun downloadAudio(
        recordId: String,
        purpose: RecordAudioPurpose,
        onProgress: (ScanAudioDownloadProgress) -> Unit,
    ): RecordAudioArtifact {
        val destination = RecordAudioCache.createDestination()
        return try {
            val download = SmartHealthRepository.api.downloadScanAudio(
                scanId = recordId,
                destination = destination,
                onProgress = onProgress,
            )
            RecordAudioArtifact(
                download = download,
                displayName = download.fileName,
            )
        } catch (error: Throwable) {
            destination.delete()
            throw error
        }
    }
}

class RecordDetailViewModel(
    private val recordId: String,
    private val canManageScan: Boolean,
    private val repository: RecordDetailRepository,
    private val idempotencyKeyFactory: () -> String = { UUID.randomUUID().toString() },
) : ViewModel() {
    private val _uiState = MutableStateFlow(
        RecordDetailUiState(canManageScan = canManageScan),
    )
    val uiState = _uiState.asStateFlow()

    private val _effects = Channel<RecordDetailUiEffect>(capacity = Channel.BUFFERED)
    val effects = _effects.receiveAsFlow()
    private var pendingStopIdempotencyKey = ""

    init {
        load(initial = true)
    }

    fun onAction(action: RecordDetailUiAction) {
        when (action) {
            RecordDetailUiAction.Retry -> load(initial = _uiState.value.scan == null)
            RecordDetailUiAction.Refresh -> load(initial = false)
            RecordDetailUiAction.StopRecording -> stopRecording()
            RecordDetailUiAction.PlayAudio -> resolvePlayback()
            RecordDetailUiAction.ShareAudio -> prepareAudio(RecordAudioPurpose.Share)
            RecordDetailUiAction.DownloadAudio -> prepareAudio(RecordAudioPurpose.Save)
            is RecordDetailUiAction.SaveAudioFinished -> {
                _uiState.update {
                    it.copy(
                        statusMessage = if (action.success) {
                            "Đã lưu bản ghi vào vị trí bạn chọn."
                        } else {
                            ""
                        },
                        errorMessage = if (action.success) {
                            ""
                        } else {
                            "Không thể lưu bản ghi vào vị trí đã chọn."
                        },
                    )
                }
            }
            RecordDetailUiAction.SaveAudioCancelled -> {
                _uiState.update {
                    it.copy(errorMessage = "", statusMessage = "")
                }
            }
            RecordDetailUiAction.ShareLaunchFailed -> {
                _uiState.update {
                    it.copy(
                        statusMessage = "",
                        errorMessage = "Không thể mở bảng chia sẻ trên thiết bị này.",
                    )
                }
            }
            RecordDetailUiAction.DismissMessage -> {
                _uiState.update {
                    it.copy(errorMessage = "", statusMessage = "")
                }
            }
        }
    }

    private fun load(initial: Boolean) {
        val current = _uiState.value
        if (current.isRefreshing || current.isStopping || current.audioOperation != RecordAudioOperation.None) {
            return
        }
        if (recordId.isBlank()) {
            _uiState.update {
                it.copy(
                    loadState = RecordDetailLoadState.NotFound,
                    errorMessage = "Mã lượt đo không hợp lệ.",
                )
            }
            return
        }
        _uiState.update {
            it.copy(
                loadState = if (initial && it.scan == null) {
                    RecordDetailLoadState.Loading
                } else {
                    it.loadState
                },
                isRefreshing = !initial || it.scan != null,
                errorMessage = "",
                statusMessage = "",
            )
        }
        viewModelScope.launch {
            runCatching { repository.getScan(recordId) }
                .onSuccess { scan ->
                    if (scan.id != recordId) {
                        applyLoadFailure(
                            SmartHealthApiException(
                                statusCode = 502,
                                code = "SCAN_IDENTITY_MISMATCH",
                                message = "Máy chủ trả sai lượt đo.",
                            ),
                        )
                        return@onSuccess
                    }
                    _uiState.update {
                        it.copy(
                            loadState = RecordDetailLoadState.Ready,
                            scan = scan,
                            isRefreshing = false,
                            isStale = false,
                            errorMessage = "",
                            waveformLoadState = RecordWaveformLoadState.Loading,
                            waveform = null,
                        )
                    }
                    loadWaveform(scan)
                }
                .onFailure(::applyLoadFailure)
        }
    }

    private suspend fun loadWaveform(scan: Scan) {
        if (scan.status !in setOf("completed", "processing", "queued")) {
            _uiState.update {
                it.copy(
                    waveformLoadState = RecordWaveformLoadState.Unavailable,
                    waveform = null,
                )
            }
            return
        }
        runCatching { repository.getWaveform(recordId) }
            .onSuccess { waveform ->
                if (waveform.scanId != recordId) {
                    _uiState.update {
                        it.copy(
                            waveformLoadState = RecordWaveformLoadState.Error,
                            waveform = null,
                        )
                    }
                } else {
                    _uiState.update {
                        it.copy(
                            waveformLoadState = RecordWaveformLoadState.Ready,
                            waveform = waveform,
                        )
                    }
                }
            }
            .onFailure { error ->
                val unavailable = error is SmartHealthApiException &&
                    error.code == "SCAN_WAVEFORM_UNAVAILABLE"
                _uiState.update {
                    it.copy(
                        waveformLoadState = if (unavailable) {
                            RecordWaveformLoadState.Unavailable
                        } else {
                            RecordWaveformLoadState.Error
                        },
                        waveform = null,
                    )
                }
            }
    }

    private fun applyLoadFailure(error: Throwable) {
        val current = _uiState.value
        val message = error.toVietnameseMessage("Không thể tải chi tiết lượt đo.")
        _uiState.update {
            if (current.scan != null) {
                current.copy(
                    loadState = RecordDetailLoadState.Ready,
                    isRefreshing = false,
                    isStale = true,
                    errorMessage = message,
                    statusMessage = "",
                )
            } else {
                current.copy(
                    loadState = classifyLoadFailure(error),
                    scan = null,
                    isRefreshing = false,
                    isStale = false,
                    errorMessage = message,
                    statusMessage = "",
                )
            }
        }
    }

    private fun stopRecording() {
        val current = _uiState.value
        val scan = current.scan ?: return
        if (
            !canManageScan ||
            scan.status != "recording" ||
            current.isStopping ||
            current.audioOperation != RecordAudioOperation.None
        ) {
            return
        }
        _uiState.update {
            it.copy(
                isStopping = true,
                errorMessage = "",
                statusMessage = "",
            )
        }
        viewModelScope.launch {
            val idempotencyKey = pendingStopIdempotencyKey.ifBlank(idempotencyKeyFactory)
            pendingStopIdempotencyKey = idempotencyKey
            runCatching { repository.stopScan(recordId, idempotencyKey) }
                .onSuccess { stopped ->
                    if (stopped.id != recordId || stopped.status !in setOf("completed", "interrupted")) {
                        _uiState.update {
                            it.copy(
                                isStopping = false,
                                errorMessage = "Máy chủ chưa xác nhận lượt ghi đã dừng.",
                            )
                        }
                        return@onSuccess
                    }
                    _uiState.update {
                        it.copy(
                            scan = stopped,
                            isStopping = false,
                            isStale = false,
                            statusMessage = if (stopped.status == "completed") {
                                "Thiết bị và máy chủ đã xác nhận lượt ghi hoàn tất."
                            } else {
                                "Lượt ghi đã dừng nhưng bị gián đoạn."
                            },
                            waveformLoadState = if (stopped.status == "completed") {
                                RecordWaveformLoadState.Loading
                            } else {
                                RecordWaveformLoadState.Unavailable
                            },
                            waveform = null,
                        )
                    }
                    pendingStopIdempotencyKey = ""
                    loadWaveform(stopped)
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            isStopping = false,
                            errorMessage = error.toVietnameseMessage(
                                "Không thể dừng lượt ghi.",
                            ),
                        )
                    }
                }
        }
    }

    private fun resolvePlayback() {
        val current = _uiState.value
        if (!current.hasAudio || current.audioOperation != RecordAudioOperation.None) return
        _uiState.update {
            it.copy(
                audioOperation = RecordAudioOperation.ResolvingPlayback,
                errorMessage = "",
                statusMessage = "",
            )
        }
        viewModelScope.launch {
            runCatching { repository.getPlaybackSource(recordId) }
                .onSuccess { source ->
                    _uiState.update {
                        it.copy(audioOperation = RecordAudioOperation.None)
                    }
                    _effects.send(RecordDetailUiEffect.PlayAudio(source))
                }
                .onFailure { error ->
                    applyAudioFailure(error)
                }
        }
    }

    private fun prepareAudio(purpose: RecordAudioPurpose) {
        val current = _uiState.value
        if (!current.hasAudio || current.audioOperation != RecordAudioOperation.None) return
        val operation = when (purpose) {
            RecordAudioPurpose.Share -> RecordAudioOperation.PreparingShare
            RecordAudioPurpose.Save -> RecordAudioOperation.PreparingDownload
        }
        _uiState.update {
            it.copy(
                audioOperation = operation,
                audioProgress = ScanAudioDownloadProgress(0L, null),
                errorMessage = "",
                statusMessage = "",
            )
        }
        viewModelScope.launch {
            runCatching {
                repository.downloadAudio(
                    recordId = recordId,
                    purpose = purpose,
                    onProgress = { progress ->
                        _uiState.update { state ->
                            if (state.audioOperation == operation) {
                                state.copy(audioProgress = progress)
                            } else {
                                state
                            }
                        }
                    },
                )
            }
                .onSuccess { artifact ->
                    _uiState.update {
                        it.copy(
                            audioOperation = RecordAudioOperation.None,
                            audioProgress = null,
                        )
                    }
                    when (purpose) {
                        RecordAudioPurpose.Share -> {
                            _effects.send(RecordDetailUiEffect.ShareAudio(artifact))
                        }
                        RecordAudioPurpose.Save -> {
                            _effects.send(
                                RecordDetailUiEffect.ChooseSaveDestination(artifact),
                            )
                        }
                    }
                }
                .onFailure(::applyAudioFailure)
        }
    }

    private fun applyAudioFailure(error: Throwable) {
        _uiState.update {
            it.copy(
                audioOperation = RecordAudioOperation.None,
                audioProgress = null,
                errorMessage = error.toVietnameseMessage(
                    "Không thể truy cập bản ghi âm thanh.",
                ),
                statusMessage = "",
            )
        }
    }

    private fun classifyLoadFailure(error: Throwable): RecordDetailLoadState {
        return when {
            error is SmartHealthApiException && error.statusCode == 404 -> {
                RecordDetailLoadState.NotFound
            }
            error is SmartHealthApiException && error.statusCode in setOf(401, 403) -> {
                RecordDetailLoadState.PermissionDenied
            }
            error is IOException && error !is SmartHealthApiException -> {
                RecordDetailLoadState.Offline
            }
            else -> RecordDetailLoadState.Error
        }
    }
}

class RecordDetailViewModelFactory(
    context: Context,
    private val recordId: String,
    private val canManageScan: Boolean,
) : ViewModelProvider.Factory {
    private val repository = ApiRecordDetailRepository(context.applicationContext)

    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(RecordDetailViewModel::class.java))
        return RecordDetailViewModel(
            recordId = recordId,
            canManageScan = canManageScan,
            repository = repository,
        ) as T
    }
}
