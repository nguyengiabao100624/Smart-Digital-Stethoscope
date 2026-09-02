package com.example.smart_health_android.devices

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.R
import com.example.smart_health_android.data.DeviceAccessRedeemResponse
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthRepository
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class DeviceAccessRedeemUiState(
    val code: String = "",
    val isSubmitting: Boolean = false,
    val errorMessage: String = "",
    val errorMessageRes: Int? = null,
    val requestId: String = "",
)

sealed interface DeviceAccessRedeemUiAction {
    data class CodeChanged(val value: String) : DeviceAccessRedeemUiAction
    data class QrScanned(val rawValue: String) : DeviceAccessRedeemUiAction
    data object Submit : DeviceAccessRedeemUiAction
    data object Cancel : DeviceAccessRedeemUiAction
}

sealed interface DeviceAccessRedeemUiEffect {
    data class DeviceGranted(
        val deviceId: String,
        val deviceName: String,
    ) : DeviceAccessRedeemUiEffect
}

interface DeviceAccessRedeemRepository {
    suspend fun redeem(code: String, idempotencyKey: String): DeviceAccessRedeemResponse
}

class ApiDeviceAccessRedeemRepository : DeviceAccessRedeemRepository {
    override suspend fun redeem(
        code: String,
        idempotencyKey: String,
    ): DeviceAccessRedeemResponse = SmartHealthRepository.api.redeemDeviceAccess(
        code = code,
        idempotencyKey = idempotencyKey,
    )
}

class DeviceAccessRedeemViewModel(
    private val expectedAuthority: DevicePairingAuthoritySnapshot?,
    private val currentAuthority: () -> DevicePairingAuthoritySnapshot?,
    private val repository: DeviceAccessRedeemRepository = ApiDeviceAccessRedeemRepository(),
    private val idempotencyKeyFactory: () -> String = { UUID.randomUUID().toString() },
) : ViewModel() {
    private val _uiState = MutableStateFlow(DeviceAccessRedeemUiState())
    val uiState = _uiState.asStateFlow()
    private val _effects = Channel<DeviceAccessRedeemUiEffect>(Channel.BUFFERED)
    val effects = _effects.receiveAsFlow()
    private var stableIntentCode = ""
    private var stableIdempotencyKey = ""

    fun onAction(action: DeviceAccessRedeemUiAction) {
        when (action) {
            is DeviceAccessRedeemUiAction.CodeChanged -> updateCode(action.value)
            is DeviceAccessRedeemUiAction.QrScanned -> submit(action.rawValue)
            DeviceAccessRedeemUiAction.Submit -> submit(_uiState.value.code)
            DeviceAccessRedeemUiAction.Cancel -> clearSensitiveState()
        }
    }

    private fun updateCode(value: String) {
        if (_uiState.value.isSubmitting) return
        val bounded = value.take(120)
        if (normalizeDeviceAccessCode(bounded) != stableIntentCode) {
            stableIntentCode = ""
            stableIdempotencyKey = ""
        }
        _uiState.value = DeviceAccessRedeemUiState(code = bounded)
    }

    private fun submit(rawValue: String) {
        if (_uiState.value.isSubmitting) return
        val normalized = parseDeviceAccessCode(rawValue)
        if (normalized == null) {
            _uiState.update {
                it.copy(
                    errorMessage = "",
                    errorMessageRes = R.string.device_access_code_invalid,
                    requestId = "",
                )
            }
            return
        }
        val authority = expectedAuthority
        if (authority == null || currentAuthority() != authority) {
            publishSessionExpired()
            return
        }
        if (stableIntentCode != normalized || stableIdempotencyKey.isBlank()) {
            stableIntentCode = normalized
            stableIdempotencyKey = idempotencyKeyFactory()
        }
        val intentKey = stableIdempotencyKey
        _uiState.value = DeviceAccessRedeemUiState(
            code = normalized,
            isSubmitting = true,
        )
        viewModelScope.launch {
            val result = try {
                repository.redeem(normalized, intentKey)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                publishFailure(error)
                return@launch
            }
            if (currentAuthority() != authority) {
                publishSessionExpired()
                return@launch
            }
            if (
                result.grant.userId != authority.userId ||
                result.grant.organizationId != authority.workspaceId ||
                result.device.id != result.grant.deviceId ||
                result.device.organizationId != authority.workspaceId
            ) {
                publishFailure(IllegalStateException("Device access authority mismatch"))
                return@launch
            }
            val deviceId = result.device.id
            val deviceName = result.device.name.ifBlank { deviceId }
            clearSensitiveState()
            _effects.send(DeviceAccessRedeemUiEffect.DeviceGranted(deviceId, deviceName))
        }
    }

    private fun publishFailure(error: Throwable) {
        val apiError = error as? SmartHealthApiException
        val messageRes = when {
            apiError?.statusCode == 401 || apiError?.code in SessionErrorCodes ->
                R.string.device_access_session_expired
            apiError?.code == "DEVICE_ACCESS_CODE_ALREADY_USED" ->
                R.string.device_access_code_used
            apiError?.statusCode == 410 || apiError?.code in ExpiredErrorCodes ->
                R.string.device_access_code_expired
            apiError?.statusCode == 400 || apiError?.statusCode == 403 ->
                R.string.device_access_code_invalid_or_forbidden
            error is IOException -> R.string.device_access_offline
            else -> R.string.device_access_backend_error
        }
        _uiState.update {
            it.copy(
                isSubmitting = false,
                errorMessage = apiError?.message.orEmpty(),
                errorMessageRes = messageRes,
                requestId = apiError?.requestId.orEmpty(),
            )
        }
    }

    private fun publishSessionExpired() {
        stableIntentCode = ""
        stableIdempotencyKey = ""
        _uiState.value = DeviceAccessRedeemUiState(
            errorMessageRes = R.string.device_access_session_expired,
        )
    }

    private fun clearSensitiveState() {
        stableIntentCode = ""
        stableIdempotencyKey = ""
        _uiState.value = DeviceAccessRedeemUiState()
    }

    override fun onCleared() {
        clearSensitiveState()
        super.onCleared()
    }

    private companion object {
        val SessionErrorCodes = setOf(
            "AUTH_SESSION_REPLACED",
            "AUTH_SESSION_REVOKED",
            "AUTH_SESSION_REQUIRED",
            "AUTH_SESSION_CHANGED",
            "ACCOUNT_LOCKED",
        )
        val ExpiredErrorCodes = setOf(
            "DEVICE_ACCESS_CODE_EXPIRED",
            "DEVICE_ACCESS_CODE_REVOKED",
            "DEVICE_ACCESS_DEVICE_UNAVAILABLE",
        )
    }
}

class DeviceAccessRedeemViewModelFactory(
    private val expectedAuthority: DevicePairingAuthoritySnapshot?,
    private val currentAuthority: () -> DevicePairingAuthoritySnapshot?,
    private val repository: DeviceAccessRedeemRepository = ApiDeviceAccessRedeemRepository(),
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(DeviceAccessRedeemViewModel::class.java))
        return DeviceAccessRedeemViewModel(
            expectedAuthority = expectedAuthority,
            currentAuthority = currentAuthority,
            repository = repository,
        ) as T
    }
}
