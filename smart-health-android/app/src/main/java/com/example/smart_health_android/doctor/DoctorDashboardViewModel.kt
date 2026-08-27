package com.example.smart_health_android.doctor

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.appointments.AppointmentRoute
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.BackendStatus
import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.canonicalWorkspaceId
import com.example.smart_health_android.data.toVietnameseMessage
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class DoctorDashboardLoadState {
    Loading,
    Content,
    PermissionDenied,
    Offline,
    Error,
}

data class DoctorDashboardUiState(
    val loadState: DoctorDashboardLoadState = DoctorDashboardLoadState.Loading,
    val displayName: String = "Bác sĩ",
    val workspaceId: String = "",
    val workspaceName: String = "",
    val workspaceMeta: String = "",
    val canViewAppointments: Boolean = false,
    val backendStatus: BackendStatus = BackendStatus(),
    val scans: List<Scan> = emptyList(),
    val searchQuery: String = "",
    val isRefreshing: Boolean = false,
    val isStale: Boolean = false,
    val stoppingScanId: String? = null,
    val errorMessage: String = "",
) {
    val filteredScans: List<Scan>
        get() {
            val query = searchQuery.trim().lowercase()
            return if (query.isBlank()) {
                scans.take(3)
            } else {
                scans.filter { scan ->
                    listOf(scan.id, scan.patientName, scan.patientCode, scan.mode)
                        .any { it.lowercase().contains(query) }
                }.take(5)
            }
        }
}

sealed interface DoctorDashboardUiAction {
    data object Refresh : DoctorDashboardUiAction
    data class SearchChanged(val value: String) : DoctorDashboardUiAction
    data class StopScan(val scanId: String) : DoctorDashboardUiAction
    data object DismissError : DoctorDashboardUiAction
}

interface DoctorDashboardRepository {
    suspend fun getCurrentUser(): AuthUser
    suspend fun getStatus(workspaceId: String): BackendStatus
    suspend fun listRecentScans(): List<Scan>
    suspend fun stopScan(scanId: String, idempotencyKey: String): Scan
}

class ApiDoctorDashboardRepository : DoctorDashboardRepository {
    override suspend fun getCurrentUser(): AuthUser = SmartHealthRepository.api.getMe()

    override suspend fun getStatus(workspaceId: String): BackendStatus =
        SmartHealthRepository.api.getStatus(workspaceId)

    override suspend fun listRecentScans(): List<Scan> = SmartHealthRepository.api.listScans(limit = 5)

    override suspend fun stopScan(scanId: String, idempotencyKey: String): Scan =
        SmartHealthRepository.api.stopScan(scanId, idempotencyKey)
}

class DoctorDashboardViewModel(
    private val repository: DoctorDashboardRepository,
    private val idempotencyKeyFactory: () -> String = { UUID.randomUUID().toString() },
) : ViewModel() {
    private val _uiState = MutableStateFlow(DoctorDashboardUiState())
    val uiState = _uiState.asStateFlow()

    private var refreshJob: Job? = null
    private var stopJob: Job? = null
    private var pendingStopScanId = ""
    private var pendingStopIdempotencyKey = ""

    init {
        refresh()
    }

    fun onAction(action: DoctorDashboardUiAction) {
        when (action) {
            DoctorDashboardUiAction.Refresh -> refresh()
            is DoctorDashboardUiAction.SearchChanged -> _uiState.update {
                it.copy(searchQuery = action.value.take(MAX_SEARCH_LENGTH))
            }
            is DoctorDashboardUiAction.StopScan -> stopScan(action.scanId)
            DoctorDashboardUiAction.DismissError -> _uiState.update { it.copy(errorMessage = "") }
        }
    }

    private fun refresh() {
        if (refreshJob?.isActive == true) return
        val existing = _uiState.value
        _uiState.update {
            if (existing.loadState == DoctorDashboardLoadState.Content) {
                it.copy(isRefreshing = true, errorMessage = "")
            } else {
                it.copy(loadState = DoctorDashboardLoadState.Loading, errorMessage = "")
            }
        }
        refreshJob = viewModelScope.launch {
            try {
                val user = repository.getCurrentUser()
                val workspaceId = user.canonicalWorkspaceId()
                require(workspaceId.isNotBlank()) { "Tài khoản chưa có workspace đang hoạt động" }
                val status = repository.getStatus(workspaceId)
                val scans = repository.listRecentScans()
                _uiState.update { current ->
                    current.copy(
                        loadState = DoctorDashboardLoadState.Content,
                        displayName = user.name.ifBlank { user.email.ifBlank { "Bác sĩ" } },
                        workspaceId = workspaceId,
                        workspaceName = user.currentWorkspace?.name.orEmpty()
                            .ifBlank { user.clinicName }
                            .ifBlank { user.organizationId },
                        workspaceMeta = listOf(
                            workspaceTypeLabel(user.workspaceType),
                            roleLabel(user.currentMembership?.role.orEmpty().ifBlank { user.role }),
                        ).filter(String::isNotBlank).joinToString(" • "),
                        canViewAppointments = AppointmentRoute.List.canOpen(user.capabilities.toSet()),
                        backendStatus = status,
                        scans = scans,
                        isRefreshing = false,
                        isStale = false,
                        errorMessage = "",
                    )
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                applyRefreshFailure(error)
            }
        }
    }

    private fun applyRefreshFailure(error: Throwable) {
        val current = _uiState.value
        val message = error.toVietnameseMessage("Không tải được bảng điều khiển.")
        _uiState.update {
            if (current.loadState == DoctorDashboardLoadState.Content) {
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

    private fun stopScan(scanId: String) {
        val scan = _uiState.value.scans.firstOrNull { it.id == scanId } ?: return
        if (!scan.isRecording || stopJob?.isActive == true) return
        if (pendingStopScanId != scanId) {
            pendingStopScanId = scanId
            pendingStopIdempotencyKey = idempotencyKeyFactory()
        }
        _uiState.update { it.copy(stoppingScanId = scanId, errorMessage = "") }
        stopJob = viewModelScope.launch {
            runCatching { repository.stopScan(scanId, pendingStopIdempotencyKey) }
                .onSuccess { stopped ->
                    if (stopped.id != scanId || stopped.status !in TERMINAL_SCAN_STATES) {
                        _uiState.update {
                            it.copy(
                                stoppingScanId = null,
                                errorMessage = "Thiết bị chưa xác nhận kết thúc lượt ghi.",
                            )
                        }
                        return@onSuccess
                    }
                    pendingStopScanId = ""
                    pendingStopIdempotencyKey = ""
                    _uiState.update { current ->
                        current.copy(
                            scans = current.scans.map { if (it.id == scanId) stopped else it },
                            stoppingScanId = null,
                            errorMessage = "",
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            stoppingScanId = null,
                            errorMessage = error.toVietnameseMessage("Không dừng được lượt ghi."),
                        )
                    }
                }
        }
    }

    override fun onCleared() {
        refreshJob?.cancel()
        stopJob?.cancel()
        super.onCleared()
    }

    private companion object {
        const val MAX_SEARCH_LENGTH = 160
        val TERMINAL_SCAN_STATES = setOf("completed", "interrupted")
    }
}

class DoctorDashboardViewModelFactory(
    private val repository: DoctorDashboardRepository = ApiDoctorDashboardRepository(),
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(DoctorDashboardViewModel::class.java))
        return DoctorDashboardViewModel(repository) as T
    }
}

private fun classifyFailure(error: Throwable): DoctorDashboardLoadState = when {
    error is SmartHealthApiException && error.statusCode in setOf(401, 403) ->
        DoctorDashboardLoadState.PermissionDenied
    error is SmartHealthApiException -> DoctorDashboardLoadState.Error
    error is IOException -> DoctorDashboardLoadState.Offline
    else -> DoctorDashboardLoadState.Error
}

private fun workspaceTypeLabel(value: String): String = when (value.trim().lowercase()) {
    "personal" -> "Không gian cá nhân"
    "clinic" -> "Phòng khám"
    "hospital" -> "Bệnh viện"
    "platform" -> "Nền tảng"
    else -> value.trim()
}

private fun roleLabel(value: String): String = when (value.trim().lowercase()) {
    "workspace_admin" -> "Quản trị workspace"
    "doctor" -> "Bác sĩ"
    "nurse" -> "Điều dưỡng"
    "technician" -> "Kỹ thuật viên"
    "billing" -> "Thanh toán"
    "viewer" -> "Chỉ xem"
    else -> value.trim()
}
