package com.example.smart_health_android.devices

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.SmartDevice
import com.example.smart_health_android.data.DeviceReleaseReceipt
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException
import java.time.Instant
import java.util.UUID

enum class DeviceManagementFailureKind {
    Offline,
    Permission,
    Error,
}

enum class DeviceManagementOperation {
    Load,
    Refresh,
    Release,
}

data class DeviceManagementFailure(
    val kind: DeviceManagementFailureKind,
    val operation: DeviceManagementOperation,
    val message: String = "",
    val requestId: String = "",
)

data class DeviceManagementUiState(
    val devices: List<SmartDevice> = emptyList(),
    val selectedDeviceId: String = "",
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val releasingDeviceId: String = "",
    val failure: DeviceManagementFailure? = null,
    val hasLoaded: Boolean = false,
) {
    val selectedDevice: SmartDevice?
        get() = devices.firstOrNull { it.id == selectedDeviceId }
            ?: devices.firstOrNull()

    val hasStaleData: Boolean
        get() = devices.isNotEmpty() && failure != null

    val isMutating: Boolean
        get() = releasingDeviceId.isNotBlank()
}

sealed interface DeviceManagementUiAction {
    data class ScreenOpened(
        val preferredDeviceId: String = "",
    ) : DeviceManagementUiAction
    data object Refresh : DeviceManagementUiAction
    data class SelectDevice(val deviceId: String) : DeviceManagementUiAction
    data class Release(val deviceId: String) : DeviceManagementUiAction
}

interface DeviceManagementRepository {
    suspend fun listDevices(): List<SmartDevice>
    suspend fun releaseDevice(deviceId: String, idempotencyKey: String): DeviceReleaseReceipt
}

class ApiDeviceManagementRepository : DeviceManagementRepository {
    override suspend fun listDevices(): List<SmartDevice> = SmartHealthRepository.api.listDevices()

    override suspend fun releaseDevice(
        deviceId: String,
        idempotencyKey: String,
    ): DeviceReleaseReceipt = SmartHealthRepository.api.releaseDevice(deviceId, idempotencyKey)
}

class DeviceManagementViewModel(
    private val repository: DeviceManagementRepository = ApiDeviceManagementRepository(),
    private val idempotencyKeyFactory: () -> String = { UUID.randomUUID().toString() },
) : ViewModel() {
    private val _uiState = MutableStateFlow(DeviceManagementUiState())
    val uiState = _uiState.asStateFlow()

    fun onAction(action: DeviceManagementUiAction) {
        when (action) {
            is DeviceManagementUiAction.ScreenOpened -> {
                val preferredDeviceId = action.preferredDeviceId.trim()
                if (
                    preferredDeviceId.isNotBlank() &&
                    (
                        !_uiState.value.hasLoaded ||
                            _uiState.value.devices.any { it.id == preferredDeviceId }
                        )
                ) {
                    _uiState.update { it.copy(selectedDeviceId = preferredDeviceId) }
                }
                if (!_uiState.value.hasLoaded) loadDevices(isRefresh = false)
            }
            DeviceManagementUiAction.Refresh -> loadDevices(isRefresh = _uiState.value.hasLoaded)
            is DeviceManagementUiAction.SelectDevice -> selectDevice(action.deviceId)
            is DeviceManagementUiAction.Release -> releaseDevice(action.deviceId)
        }
    }

    private fun loadDevices(isRefresh: Boolean) {
        val current = _uiState.value
        if (current.isLoading || current.isRefreshing || current.isMutating) return
        _uiState.update {
            it.copy(
                isLoading = !isRefresh,
                isRefreshing = isRefresh,
                failure = null,
            )
        }
        viewModelScope.launch {
            try {
                val devices = repository.listDevices()
                _uiState.update { state ->
                    state.copy(
                        devices = devices,
                        selectedDeviceId = preferredDeviceId(devices, state.selectedDeviceId),
                        isLoading = false,
                        isRefreshing = false,
                        failure = null,
                        hasLoaded = true,
                    )
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        failure = error.toDeviceManagementFailure(
                            operation = if (isRefresh) {
                                DeviceManagementOperation.Refresh
                            } else {
                                DeviceManagementOperation.Load
                            },
                        ),
                        hasLoaded = true,
                    )
                }
            }
        }
    }

    private fun selectDevice(deviceId: String) {
        if (_uiState.value.devices.none { it.id == deviceId }) return
        _uiState.update { it.copy(selectedDeviceId = deviceId) }
    }

    private fun releaseDevice(deviceId: String) {
        val current = _uiState.value
        if (current.isLoading || current.isRefreshing || current.isMutating) return
        if (current.devices.none { it.id == deviceId }) return
        val idempotencyKey = idempotencyKeyFactory()
        _uiState.update { it.copy(releasingDeviceId = deviceId, failure = null) }
        viewModelScope.launch {
            try {
                val receipt = repository.releaseDevice(deviceId, idempotencyKey)
                check(
                    receipt.deviceId == deviceId &&
                        receipt.released &&
                        receipt.historyRetained
                ) {
                    "Backend did not confirm the canonical device release"
                }
                _uiState.update { state ->
                    val remaining = state.devices.filterNot { it.id == deviceId }
                    state.copy(
                        devices = remaining,
                        selectedDeviceId = preferredDeviceId(remaining, state.selectedDeviceId),
                        releasingDeviceId = "",
                        failure = null,
                    )
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                _uiState.update {
                    it.copy(
                        releasingDeviceId = "",
                        failure = error.toDeviceManagementFailure(DeviceManagementOperation.Release),
                    )
                }
            }
        }
    }
}

private fun preferredDeviceId(devices: List<SmartDevice>, currentId: String): String {
    if (devices.any { it.id == currentId }) return currentId
    return devices.maxWithOrNull(
        compareBy<SmartDevice> { if (it.online) 1 else 0 }
            .thenBy { it.lastSeenEpochMillis() },
    )?.id.orEmpty()
}

private fun SmartDevice.lastSeenEpochMillis(): Long {
    val value = lastSeenAt?.trim().orEmpty()
    if (value.isBlank()) return Long.MIN_VALUE
    return runCatching { Instant.parse(value).toEpochMilli() }.getOrDefault(Long.MIN_VALUE)
}

private fun Throwable.toDeviceManagementFailure(
    operation: DeviceManagementOperation,
): DeviceManagementFailure {
    val apiError = this as? SmartHealthApiException
    val kind = when {
        apiError?.statusCode == 401 || apiError?.statusCode == 403 -> DeviceManagementFailureKind.Permission
        apiError == null && this is IOException -> DeviceManagementFailureKind.Offline
        apiError?.statusCode == 0 || apiError?.code in NetworkFailureCodes -> DeviceManagementFailureKind.Offline
        else -> DeviceManagementFailureKind.Error
    }
    return DeviceManagementFailure(
        kind = kind,
        operation = operation,
        message = message.orEmpty(),
        requestId = apiError?.requestId.orEmpty(),
    )
}

private val NetworkFailureCodes = setOf(
    "NETWORK_ERROR",
    "NETWORK_UNAVAILABLE",
    "OFFLINE",
    "REQUEST_TIMEOUT",
)
