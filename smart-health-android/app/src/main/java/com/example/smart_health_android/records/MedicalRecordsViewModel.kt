package com.example.smart_health_android.records

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.data.ShareTargetDoctor
import com.example.smart_health_android.data.ShareTargetWorkspace
import com.example.smart_health_android.data.ShareTargets
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.toVietnameseMessage
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class MedicalRecordsLoadState {
    Loading,
    Content,
    PermissionDenied,
    Offline,
    Error,
}

data class MedicalRecordsUiState(
    val loadState: MedicalRecordsLoadState = MedicalRecordsLoadState.Loading,
    val activeTab: String = "recent",
    val scans: List<Scan> = emptyList(),
    val isRefreshing: Boolean = false,
    val isStale: Boolean = false,
    val stoppingRecordId: String? = null,
    val sharingRecordId: String? = null,
    val shareTargetQuery: String = "",
    val shareTargets: ShareTargets = ShareTargets(),
    val selectedShareDoctor: ShareTargetDoctor? = null,
    val selectedShareWorkspace: ShareTargetWorkspace? = null,
    val isLoadingShareTargets: Boolean = false,
    val errorMessage: String = "",
    val statusMessage: String = "",
) {
    val hasShareTarget: Boolean
        get() = selectedShareDoctor != null || selectedShareWorkspace != null
}

sealed interface MedicalRecordsUiAction {
    data object Refresh : MedicalRecordsUiAction
    data class TabSelected(val tab: String) : MedicalRecordsUiAction
    data class ShareQueryChanged(val value: String) : MedicalRecordsUiAction
    data object RefreshShareTargets : MedicalRecordsUiAction
    data class DoctorSelected(val doctor: ShareTargetDoctor) : MedicalRecordsUiAction
    data class WorkspaceSelected(val workspace: ShareTargetWorkspace) : MedicalRecordsUiAction
    data class StopRecord(val scanId: String) : MedicalRecordsUiAction
    data class ShareRecord(val scanId: String) : MedicalRecordsUiAction
    data object DismissMessage : MedicalRecordsUiAction
}

interface MedicalRecordsRepository {
    suspend fun listScans(): List<Scan>
    suspend fun listShareTargets(query: String): ShareTargets
    suspend fun stopScan(scanId: String, idempotencyKey: String): Scan
    suspend fun shareRecord(
        patientId: String,
        scanId: String,
        targetDoctorUserId: String,
        targetWorkspaceId: String,
        idempotencyKey: String,
    )
}

class ApiMedicalRecordsRepository : MedicalRecordsRepository {
    override suspend fun listScans(): List<Scan> = SmartHealthRepository.api.listScans(limit = 100)

    override suspend fun listShareTargets(query: String): ShareTargets =
        SmartHealthRepository.api.listShareTargets(query)

    override suspend fun stopScan(scanId: String, idempotencyKey: String): Scan =
        SmartHealthRepository.api.stopScan(scanId, idempotencyKey)

    override suspend fun shareRecord(
        patientId: String,
        scanId: String,
        targetDoctorUserId: String,
        targetWorkspaceId: String,
        idempotencyKey: String,
    ) {
        SmartHealthRepository.api.sharePatientRecord(
            patientId = patientId,
            targetDoctorUserId = targetDoctorUserId,
            targetWorkspaceId = targetWorkspaceId,
            scope = "selected_scans",
            scanIds = listOf(scanId),
            idempotencyKey = idempotencyKey,
        )
    }
}

class MedicalRecordsViewModel(
    private val repository: MedicalRecordsRepository,
    private val idempotencyKeyFactory: () -> String = { UUID.randomUUID().toString() },
) : ViewModel() {
    private val _uiState = MutableStateFlow(MedicalRecordsUiState())
    val uiState = _uiState.asStateFlow()

    private var refreshJob: Job? = null
    private var shareTargetsJob: Job? = null
    private var mutationJob: Job? = null
    private var pendingStopScanId = ""
    private var pendingStopKey = ""
    private val pendingShareKeys = mutableMapOf<String, String>()

    init {
        refresh()
        refreshShareTargets(debounce = false)
    }

    fun onAction(action: MedicalRecordsUiAction) {
        when (action) {
            MedicalRecordsUiAction.Refresh -> refresh()
            is MedicalRecordsUiAction.TabSelected -> if (action.tab in FILTER_TABS) {
                _uiState.update { it.copy(activeTab = action.tab) }
            }
            is MedicalRecordsUiAction.ShareQueryChanged -> {
                _uiState.update {
                    it.copy(shareTargetQuery = action.value.take(MAX_QUERY_LENGTH))
                }
                refreshShareTargets(debounce = true)
            }
            MedicalRecordsUiAction.RefreshShareTargets -> refreshShareTargets(debounce = false)
            is MedicalRecordsUiAction.DoctorSelected -> _uiState.update {
                it.copy(
                    selectedShareDoctor = action.doctor,
                    selectedShareWorkspace = null,
                    errorMessage = "",
                    statusMessage = "",
                )
            }
            is MedicalRecordsUiAction.WorkspaceSelected -> _uiState.update {
                it.copy(
                    selectedShareDoctor = null,
                    selectedShareWorkspace = action.workspace,
                    errorMessage = "",
                    statusMessage = "",
                )
            }
            is MedicalRecordsUiAction.StopRecord -> stopRecord(action.scanId)
            is MedicalRecordsUiAction.ShareRecord -> shareRecord(action.scanId)
            MedicalRecordsUiAction.DismissMessage -> _uiState.update {
                it.copy(errorMessage = "", statusMessage = "")
            }
        }
    }

    private fun refresh() {
        if (refreshJob?.isActive == true) return
        val current = _uiState.value
        _uiState.update {
            if (current.loadState == MedicalRecordsLoadState.Content) {
                it.copy(isRefreshing = true, errorMessage = "")
            } else {
                it.copy(loadState = MedicalRecordsLoadState.Loading, errorMessage = "")
            }
        }
        refreshJob = viewModelScope.launch {
            try {
                val scans = repository.listScans()
                _uiState.update {
                    it.copy(
                        loadState = MedicalRecordsLoadState.Content,
                        scans = scans,
                        isRefreshing = false,
                        isStale = false,
                        errorMessage = "",
                    )
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                applyLoadFailure(error)
            }
        }
    }

    private fun applyLoadFailure(error: Throwable) {
        val current = _uiState.value
        val message = error.toVietnameseMessage("Không tải được hồ sơ lượt đo.")
        _uiState.update {
            if (current.loadState == MedicalRecordsLoadState.Content) {
                current.copy(
                    isRefreshing = false,
                    isStale = true,
                    errorMessage = message,
                )
            } else {
                current.copy(
                    loadState = classifyFailure(error),
                    isRefreshing = false,
                    isStale = false,
                    errorMessage = message,
                )
            }
        }
    }

    private fun refreshShareTargets(debounce: Boolean) {
        shareTargetsJob?.cancel()
        val query = _uiState.value.shareTargetQuery.trim()
        shareTargetsJob = viewModelScope.launch {
            if (debounce) delay(SHARE_TARGET_DEBOUNCE_MS)
            _uiState.update { it.copy(isLoadingShareTargets = true) }
            runCatching { repository.listShareTargets(query) }
                .onSuccess { targets ->
                    if (query != _uiState.value.shareTargetQuery.trim()) return@onSuccess
                    _uiState.update {
                        it.copy(
                            shareTargets = targets,
                            isLoadingShareTargets = false,
                            errorMessage = "",
                        )
                    }
                }
                .onFailure { error ->
                    if (error is CancellationException) throw error
                    _uiState.update {
                        it.copy(
                            isLoadingShareTargets = false,
                            errorMessage = error.toVietnameseMessage(
                                "Không tải được danh sách nơi nhận chia sẻ.",
                            ),
                        )
                    }
                }
        }
    }

    private fun stopRecord(scanId: String) {
        val scan = _uiState.value.scans.firstOrNull { it.id == scanId } ?: return
        if (!scan.isRecording || mutationJob?.isActive == true) return
        if (pendingStopScanId != scanId) {
            pendingStopScanId = scanId
            pendingStopKey = idempotencyKeyFactory()
        }
        _uiState.update {
            it.copy(stoppingRecordId = scanId, errorMessage = "", statusMessage = "")
        }
        mutationJob = viewModelScope.launch {
            runCatching { repository.stopScan(scanId, pendingStopKey) }
                .onSuccess { stopped ->
                    if (stopped.id != scanId || stopped.status !in TERMINAL_SCAN_STATES) {
                        _uiState.update {
                            it.copy(
                                stoppingRecordId = null,
                                errorMessage = "Thiết bị chưa xác nhận kết thúc lượt ghi.",
                            )
                        }
                        return@onSuccess
                    }
                    pendingStopScanId = ""
                    pendingStopKey = ""
                    _uiState.update { current ->
                        current.copy(
                            scans = current.scans.map { if (it.id == scanId) stopped else it },
                            stoppingRecordId = null,
                            statusMessage = if (stopped.status == "completed") {
                                "Lượt ghi đã được thiết bị và máy chủ xác nhận hoàn tất."
                            } else {
                                "Lượt ghi đã dừng ở trạng thái gián đoạn."
                            },
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            stoppingRecordId = null,
                            errorMessage = error.toVietnameseMessage("Không dừng được lượt ghi."),
                        )
                    }
                }
        }
    }

    private fun shareRecord(scanId: String) {
        val state = _uiState.value
        val scan = state.scans.firstOrNull { it.id == scanId } ?: return
        if (mutationJob?.isActive == true) return
        if (scan.patientId.isBlank()) {
            _uiState.update {
                it.copy(errorMessage = "Lượt đo này chưa gắn với hồ sơ bệnh nhân để chia sẻ.")
            }
            return
        }
        val doctorId = state.selectedShareDoctor?.id.orEmpty()
        val workspaceId = state.selectedShareWorkspace?.id.orEmpty()
        if ((doctorId.isBlank()) == (workspaceId.isBlank())) {
            _uiState.update {
                it.copy(errorMessage = "Chọn đúng một bác sĩ hoặc cơ sở nhận chia sẻ.")
            }
            return
        }
        val fingerprint = listOf(scan.patientId, scan.id, doctorId, workspaceId).joinToString("\u001f")
        val idempotencyKey = pendingShareKeys.getOrPut(fingerprint, idempotencyKeyFactory)
        _uiState.update {
            it.copy(sharingRecordId = scanId, errorMessage = "", statusMessage = "")
        }
        mutationJob = viewModelScope.launch {
            runCatching {
                repository.shareRecord(
                    patientId = scan.patientId,
                    scanId = scan.id,
                    targetDoctorUserId = doctorId,
                    targetWorkspaceId = workspaceId,
                    idempotencyKey = idempotencyKey,
                )
            }.onSuccess {
                pendingShareKeys.remove(fingerprint)
                val targetName = state.selectedShareDoctor?.name.orEmpty()
                    .ifBlank { state.selectedShareWorkspace?.name.orEmpty() }
                    .ifBlank { doctorId.ifBlank { workspaceId } }
                _uiState.update {
                    it.copy(
                        sharingRecordId = null,
                        statusMessage = "Đã chia sẻ lượt đo với $targetName.",
                    )
                }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        sharingRecordId = null,
                        errorMessage = error.toVietnameseMessage("Không chia sẻ được lượt đo."),
                    )
                }
            }
        }
    }

    override fun onCleared() {
        refreshJob?.cancel()
        shareTargetsJob?.cancel()
        mutationJob?.cancel()
        super.onCleared()
    }

    private companion object {
        const val MAX_QUERY_LENGTH = 160
        const val SHARE_TARGET_DEBOUNCE_MS = 300L
        val FILTER_TABS = setOf("recent", "heart", "lung", "abnormal")
        val TERMINAL_SCAN_STATES = setOf("completed", "interrupted")
    }
}

class MedicalRecordsViewModelFactory(
    private val repository: MedicalRecordsRepository = ApiMedicalRecordsRepository(),
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(MedicalRecordsViewModel::class.java))
        return MedicalRecordsViewModel(repository) as T
    }
}

private fun classifyFailure(error: Throwable): MedicalRecordsLoadState = when {
    error is SmartHealthApiException && error.statusCode in setOf(401, 403) ->
        MedicalRecordsLoadState.PermissionDenied
    error is SmartHealthApiException -> MedicalRecordsLoadState.Error
    error is IOException -> MedicalRecordsLoadState.Offline
    else -> MedicalRecordsLoadState.Error
}
