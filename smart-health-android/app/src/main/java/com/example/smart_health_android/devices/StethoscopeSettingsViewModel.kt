package com.example.smart_health_android.devices

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.SmartDevice
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.toVietnameseMessage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class StethoscopeSettingsLoadState {
    Loading,
    Ready,
    Empty,
    Error,
}

data class StethoscopeSettingsUiState(
    val loadState: StethoscopeSettingsLoadState = StethoscopeSettingsLoadState.Loading,
    val currentDevice: SmartDevice? = null,
    val isRefreshing: Boolean = false,
    val isStale: Boolean = false,
    val errorMessage: String? = null,
    val statusMessage: String? = null,
)

sealed interface StethoscopeSettingsUiAction {
    data object Refresh : StethoscopeSettingsUiAction
    data object DismissStatus : StethoscopeSettingsUiAction
}

interface StethoscopeDeviceRepository {
    suspend fun listDevices(): List<SmartDevice>
}

class ApiStethoscopeDeviceRepository : StethoscopeDeviceRepository {
    override suspend fun listDevices(): List<SmartDevice> =
        SmartHealthRepository.api.listDevices()
}

class StethoscopeSettingsViewModel(
    private val repository: StethoscopeDeviceRepository = ApiStethoscopeDeviceRepository(),
) : ViewModel() {
    private val _uiState = MutableStateFlow(StethoscopeSettingsUiState())
    val uiState: StateFlow<StethoscopeSettingsUiState> = _uiState.asStateFlow()

    init {
        refresh(announceSuccess = false)
    }

    fun onAction(action: StethoscopeSettingsUiAction) {
        when (action) {
            StethoscopeSettingsUiAction.Refresh -> refresh(announceSuccess = true)
            StethoscopeSettingsUiAction.DismissStatus -> {
                _uiState.update {
                    it.copy(errorMessage = null, statusMessage = null)
                }
            }
        }
    }

    private fun refresh(announceSuccess: Boolean) {
        if (_uiState.value.isRefreshing) return
        _uiState.update { current ->
            current.copy(
                isRefreshing = true,
                errorMessage = null,
                statusMessage = null,
            )
        }
        viewModelScope.launch {
            runCatching { repository.listDevices() }
                .onSuccess { devices ->
                    val previousDeviceId = _uiState.value.currentDevice?.id
                    val selectedDevice = devices.firstOrNull { it.id == previousDeviceId }
                        ?: devices.firstOrNull { it.online }
                        ?: devices.firstOrNull { it.connected }
                        ?: devices.firstOrNull()
                    _uiState.value = StethoscopeSettingsUiState(
                        loadState = if (selectedDevice == null) {
                            StethoscopeSettingsLoadState.Empty
                        } else {
                            StethoscopeSettingsLoadState.Ready
                        },
                        currentDevice = selectedDevice,
                        isRefreshing = false,
                        isStale = false,
                        statusMessage = if (announceSuccess) {
                            "Đã tải trạng thái thiết bị mới nhất từ hệ thống."
                        } else {
                            null
                        },
                    )
                }
                .onFailure { exception ->
                    val message = exception.toVietnameseMessage(
                        "Không thể tải trạng thái thiết bị.",
                    )
                    _uiState.update { current ->
                        if (current.currentDevice != null) {
                            current.copy(
                                loadState = StethoscopeSettingsLoadState.Ready,
                                isRefreshing = false,
                                isStale = true,
                                errorMessage = message,
                                statusMessage = null,
                            )
                        } else {
                            current.copy(
                                loadState = StethoscopeSettingsLoadState.Error,
                                currentDevice = null,
                                isRefreshing = false,
                                isStale = false,
                                errorMessage = message,
                                statusMessage = null,
                            )
                        }
                    }
                }
        }
    }
}
