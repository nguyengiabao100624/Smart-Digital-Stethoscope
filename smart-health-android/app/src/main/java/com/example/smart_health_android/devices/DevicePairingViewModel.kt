package com.example.smart_health_android.devices

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.R
import com.example.smart_health_android.data.DevicePairingOutcome
import com.example.smart_health_android.data.DevicePairingPresence
import com.example.smart_health_android.data.DevicePairingResponse
import com.example.smart_health_android.data.SmartDevice
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.UUID

enum class DevicePairingStage {
    Entry,
    Claiming,
    ClaimFailed,
    SetupReady,
    OpeningWifi,
    PortalGuidance,
    AwaitingOnline,
    Offline,
    Online,
}

enum class DeviceSetupCapability {
    ClaimOnly,
    SecureQrV1,
}

data class DevicePairingUiState(
    val stage: DevicePairingStage = DevicePairingStage.Entry,
    val manualDeviceId: String = "",
    val manualClaimCode: String = "",
    val claimedDeviceId: String = "",
    val claimedDeviceName: String = "",
    val idempotencyKey: String = "",
    val setupCapability: DeviceSetupCapability = DeviceSetupCapability.ClaimOnly,
    val setupSsid: String = "",
    val setupProofOfPossession: String = "",
    val setupExpiresAtEpochMillis: Long? = null,
    val isBusy: Boolean = false,
    val canRetryClaim: Boolean = false,
    val canRetryOnline: Boolean = false,
    val errorMessage: String = "",
    val errorMessageRes: Int? = null,
    val requestId: String = "",
) {
    val isManualClaimOnly: Boolean
        get() = setupCapability == DeviceSetupCapability.ClaimOnly
}

sealed interface DevicePairingUiAction {
    data class QrScanned(val rawValue: String) : DevicePairingUiAction
    data class DeviceIdChanged(val value: String) : DevicePairingUiAction
    data class ClaimCodeChanged(val value: String) : DevicePairingUiAction
    data object SubmitManual : DevicePairingUiAction
    data object RetryClaim : DevicePairingUiAction
    data object OpenWifiSettings : DevicePairingUiAction
    data object WifiSettingsLaunchFailed : DevicePairingUiAction
    data object WifiSettingsReturned : DevicePairingUiAction
    data object OpenSetupPortal : DevicePairingUiAction
    data object PortalSetupConfirmed : DevicePairingUiAction
    data object RetryOnline : DevicePairingUiAction
    data object ScreenStarted : DevicePairingUiAction
    data object ScreenStopped : DevicePairingUiAction
    data object Cancel : DevicePairingUiAction
    data object Reset : DevicePairingUiAction
}

sealed interface DevicePairingUiEffect {
    data object OpenSystemWifiSettings : DevicePairingUiEffect
    data class OpenExternalSetupPortal(val url: String) : DevicePairingUiEffect
    data class DeviceOnlineConfirmed(val deviceName: String) : DevicePairingUiEffect
}

interface DeviceClaimRepository {
    suspend fun claimDevice(
        payload: DeviceClaimPayload,
        connectionMethod: String,
        idempotencyKey: String,
    ): DevicePairingResponse

    suspend fun listDevices(): List<SmartDevice>
}

class ApiDeviceClaimRepository : DeviceClaimRepository {
    override suspend fun claimDevice(
        payload: DeviceClaimPayload,
        connectionMethod: String,
        idempotencyKey: String,
    ): DevicePairingResponse = SmartHealthRepository.api.pairDevice(
        deviceId = payload.deviceId,
        claimCode = payload.claimCode,
        connectionMethod = connectionMethod,
        idempotencyKey = idempotencyKey,
    )

    override suspend fun listDevices(): List<SmartDevice> = SmartHealthRepository.api.listDevices()
}

class DevicePairingViewModel(
    private val repository: DeviceClaimRepository = ApiDeviceClaimRepository(),
    private val idempotencyKeyFactory: () -> String = { UUID.randomUUID().toString() },
    private val onlineRetryDelaysMillis: List<Long> = listOf(0L, 1_000L, 2_000L, 4_000L, 8_000L, 15_000L),
    private val nowMillis: () -> Long = System::currentTimeMillis,
) : ViewModel() {
    private data class PendingClaim(
        val payload: DeviceClaimPayload,
        val connectionMethod: String,
    )

    private val _uiState = MutableStateFlow(DevicePairingUiState())
    val uiState = _uiState.asStateFlow()

    private val _effects = Channel<DevicePairingUiEffect>(Channel.BUFFERED)
    val effects = _effects.receiveAsFlow()

    private var pendingClaim: PendingClaim? = null
    private var claimJob: Job? = null
    private var pollingJob: Job? = null
    private var expiryJob: Job? = null
    private var operationGeneration = 0L
    private var isScreenActive = true
    private var resumePollingOnStart = false
    private var wifiOriginStage = DevicePairingStage.SetupReady

    fun onAction(action: DevicePairingUiAction) {
        when (action) {
            is DevicePairingUiAction.QrScanned -> submitQr(action.rawValue)
            is DevicePairingUiAction.DeviceIdChanged -> updateManual(deviceId = action.value)
            is DevicePairingUiAction.ClaimCodeChanged -> updateManual(claimCode = action.value)
            DevicePairingUiAction.SubmitManual -> submitManual()
            DevicePairingUiAction.RetryClaim -> retryClaim()
            DevicePairingUiAction.OpenWifiSettings -> openWifiSettings()
            DevicePairingUiAction.WifiSettingsLaunchFailed -> wifiSettingsLaunchFailed()
            DevicePairingUiAction.WifiSettingsReturned -> wifiSettingsReturned()
            DevicePairingUiAction.OpenSetupPortal -> openSetupPortal()
            DevicePairingUiAction.PortalSetupConfirmed -> portalSetupConfirmed()
            DevicePairingUiAction.RetryOnline -> retryOnline()
            DevicePairingUiAction.ScreenStarted -> onScreenStarted()
            DevicePairingUiAction.ScreenStopped -> onScreenStopped()
            DevicePairingUiAction.Cancel,
            DevicePairingUiAction.Reset,
            -> reset()
        }
    }

    private fun updateManual(deviceId: String? = null, claimCode: String? = null) {
        if (_uiState.value.isBusy) return
        cancelSensitiveWork()
        _uiState.update { current ->
            DevicePairingUiState(
                manualDeviceId = deviceId ?: current.manualDeviceId,
                manualClaimCode = claimCode ?: current.manualClaimCode,
            )
        }
    }

    private fun submitQr(rawValue: String) {
        if (_uiState.value.isBusy) return
        val payload = DeviceClaimPayloadParser.parse(
            raw = rawValue,
            now = Instant.ofEpochMilli(nowMillis()),
        )
        if (payload == null) {
            _uiState.update {
                it.copy(
                    stage = DevicePairingStage.Entry,
                    errorMessage = "",
                    errorMessageRes = R.string.device_pairing_invalid_qr,
                    requestId = "",
                )
            }
            return
        }
        claim(payload, connectionMethod = "QR")
    }

    private fun submitManual() {
        val state = _uiState.value
        if (state.isBusy) return
        val payload = DeviceClaimPayloadParser.fromManualEntry(
            deviceId = state.manualDeviceId,
            claimCode = state.manualClaimCode,
        )
        if (payload == null) {
            _uiState.update {
                it.copy(
                    stage = DevicePairingStage.Entry,
                    errorMessage = "",
                    errorMessageRes = R.string.device_pairing_invalid_manual,
                    requestId = "",
                )
            }
            return
        }
        claim(payload, connectionMethod = "Manual")
    }

    private fun claim(payload: DeviceClaimPayload, connectionMethod: String) {
        if (_uiState.value.isBusy) return
        claimJob?.cancel()
        pollingJob?.cancel()
        operationGeneration += 1
        val generation = operationGeneration
        val pending = PendingClaim(payload, connectionMethod)
        pendingClaim = pending
        val idempotencyKey = _uiState.value.idempotencyKey.ifBlank(idempotencyKeyFactory)
        val setupAp = payload.setupAp
        _uiState.update {
            it.copy(
                stage = DevicePairingStage.Claiming,
                claimedDeviceId = payload.deviceId,
                claimedDeviceName = "",
                idempotencyKey = idempotencyKey,
                setupCapability = if (payload.supportsSecureSetup) {
                    DeviceSetupCapability.SecureQrV1
                } else {
                    DeviceSetupCapability.ClaimOnly
                },
                setupSsid = setupAp?.ssid.orEmpty(),
                setupProofOfPossession = setupAp?.proofOfPossession.orEmpty(),
                setupExpiresAtEpochMillis = payload.claimExpiresAt?.toEpochMilli(),
                isBusy = true,
                canRetryClaim = false,
                canRetryOnline = false,
                errorMessage = "",
                errorMessageRes = null,
                requestId = "",
            )
        }
        scheduleSetupExpiry(payload, generation)
        claimJob = viewModelScope.launch {
            val response = try {
                repository.claimDevice(payload, connectionMethod, idempotencyKey)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (generation == operationGeneration) publishClaimFailure(error)
                return@launch
            }
            if (generation != operationGeneration) return@launch
            val device = response.device
            pendingClaim = null
            _uiState.update { it.copy(manualClaimCode = "") }
            if (device.id != payload.deviceId) {
                clearSetupMaterial()
                _uiState.update {
                    it.copy(
                        stage = DevicePairingStage.ClaimFailed,
                        isBusy = false,
                        canRetryClaim = false,
                        canRetryOnline = false,
                        errorMessage = "",
                        errorMessageRes = R.string.device_pairing_identity_mismatch,
                        requestId = "",
                    )
                }
                return@launch
            }
            if (!response.hasConsistentPairingState() || (response.pairing.onlineConfirmed && !device.online)) {
                clearSetupMaterial()
                _uiState.update {
                    it.copy(
                        stage = DevicePairingStage.ClaimFailed,
                        isBusy = false,
                        canRetryClaim = false,
                        canRetryOnline = false,
                        errorMessage = "",
                        errorMessageRes = R.string.device_pairing_backend_error,
                        requestId = "",
                    )
                }
                return@launch
            }
            if (response.pairing.onlineConfirmed && device.isAuthenticatedOnline()) {
                confirmOnline(device)
                return@launch
            }
            _uiState.update {
                it.copy(
                    claimedDeviceName = device.name,
                    stage = if (payload.supportsSecureSetup) {
                        DevicePairingStage.SetupReady
                    } else {
                        DevicePairingStage.AwaitingOnline
                    },
                    isBusy = !payload.supportsSecureSetup,
                    canRetryClaim = false,
                    canRetryOnline = false,
                )
            }
            if (!payload.supportsSecureSetup) startOnlinePolling(payload.deviceId)
        }
    }

    private fun retryClaim() {
        val state = _uiState.value
        val pending = pendingClaim ?: return
        if (state.isBusy || state.stage != DevicePairingStage.ClaimFailed) return
        claim(pending.payload, pending.connectionMethod)
    }

    private fun openWifiSettings() {
        val state = _uiState.value
        if (
            state.stage !in setOf(DevicePairingStage.SetupReady, DevicePairingStage.PortalGuidance) ||
            state.setupCapability != DeviceSetupCapability.SecureQrV1 ||
            state.setupSsid.isBlank() ||
            state.setupProofOfPossession.isBlank()
        ) return
        if (hasSetupExpired(state)) {
            expireSetup()
            return
        }
        wifiOriginStage = state.stage
        _uiState.update { it.copy(stage = DevicePairingStage.OpeningWifi) }
        viewModelScope.launch { _effects.send(DevicePairingUiEffect.OpenSystemWifiSettings) }
    }

    private fun wifiSettingsLaunchFailed() {
        if (_uiState.value.stage != DevicePairingStage.OpeningWifi) return
        _uiState.update { it.copy(stage = wifiOriginStage) }
    }

    private fun wifiSettingsReturned() {
        if (_uiState.value.stage != DevicePairingStage.OpeningWifi) return
        if (hasSetupExpired(_uiState.value)) {
            expireSetup()
            return
        }
        _uiState.update { it.copy(stage = DevicePairingStage.PortalGuidance) }
    }

    private fun openSetupPortal() {
        val state = _uiState.value
        if (state.stage != DevicePairingStage.PortalGuidance) return
        if (hasSetupExpired(state)) {
            expireSetup()
            return
        }
        viewModelScope.launch {
            _effects.send(DevicePairingUiEffect.OpenExternalSetupPortal(SetupPortalUrl))
        }
    }

    private fun portalSetupConfirmed() {
        val state = _uiState.value
        if (state.stage != DevicePairingStage.PortalGuidance || state.claimedDeviceId.isBlank()) return
        if (hasSetupExpired(state)) {
            expireSetup()
            return
        }
        _uiState.update {
            it.copy(
                stage = DevicePairingStage.AwaitingOnline,
                isBusy = true,
                canRetryOnline = false,
                errorMessage = "",
                errorMessageRes = null,
                requestId = "",
            )
        }
        startOnlinePolling(state.claimedDeviceId)
    }

    private fun retryOnline() {
        val state = _uiState.value
        if (state.isBusy || state.claimedDeviceId.isBlank()) return
        _uiState.update {
            it.copy(
                stage = DevicePairingStage.AwaitingOnline,
                isBusy = true,
                canRetryOnline = false,
                errorMessage = "",
                errorMessageRes = null,
                requestId = "",
            )
        }
        startOnlinePolling(state.claimedDeviceId)
    }

    private fun onScreenStarted() {
        isScreenActive = true
        if (_uiState.value.stage == DevicePairingStage.OpeningWifi) {
            wifiSettingsReturned()
            return
        }
        if (!resumePollingOnStart) return
        val deviceId = _uiState.value.claimedDeviceId
        if (deviceId.isBlank()) {
            resumePollingOnStart = false
            return
        }
        _uiState.update {
            it.copy(
                stage = DevicePairingStage.AwaitingOnline,
                isBusy = true,
                canRetryOnline = false,
                errorMessage = "",
                errorMessageRes = null,
                requestId = "",
            )
        }
        startOnlinePolling(deviceId)
    }

    private fun onScreenStopped() {
        isScreenActive = false
        if (_uiState.value.stage != DevicePairingStage.AwaitingOnline || pollingJob?.isActive != true) return
        resumePollingOnStart = true
        pollingJob?.cancel()
        pollingJob = null
        _uiState.update { it.copy(isBusy = false) }
    }

    private fun startOnlinePolling(deviceId: String) {
        if (!isScreenActive) {
            resumePollingOnStart = true
            _uiState.update { it.copy(isBusy = false) }
            return
        }
        resumePollingOnStart = false
        pollingJob?.cancel()
        val generation = operationGeneration
        pollingJob = viewModelScope.launch { waitForOnline(deviceId, generation) }
    }

    private suspend fun waitForOnline(deviceId: String, generation: Long) {
        var lastFailure: Throwable? = null
        for (retryDelay in onlineRetryDelaysMillis) {
            delay(retryDelay)
            if (generation != operationGeneration) return
            val devices = try {
                repository.listDevices().also { lastFailure = null }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                lastFailure = error
                continue
            }
            val device = devices.firstOrNull { it.id == deviceId }
            if (device?.isAuthenticatedOnline() == true) {
                confirmOnline(device)
                return
            }
        }
        if (generation != operationGeneration) return
        if (lastFailure != null) {
            publishOfflineFailure(lastFailure)
            return
        }
        _uiState.update {
            it.copy(
                stage = DevicePairingStage.AwaitingOnline,
                isBusy = false,
                canRetryOnline = true,
                errorMessage = "",
                errorMessageRes = R.string.device_pairing_waiting_online,
            )
        }
    }

    private fun scheduleSetupExpiry(payload: DeviceClaimPayload, generation: Long) {
        expiryJob?.cancel()
        val expiresAt = payload.claimExpiresAt?.toEpochMilli() ?: return
        val delayMillis = (expiresAt - nowMillis()).coerceAtLeast(0L)
        expiryJob = viewModelScope.launch {
            delay(delayMillis)
            if (generation == operationGeneration && _uiState.value.stage != DevicePairingStage.Online) {
                expireSetup()
            }
        }
    }

    private fun hasSetupExpired(state: DevicePairingUiState): Boolean =
        state.setupExpiresAtEpochMillis?.let { it <= nowMillis() } ?: false

    private fun expireSetup() {
        reset(errorMessageRes = R.string.device_pairing_setup_expired)
    }

    private fun publishOfflineFailure(error: Throwable) {
        val apiError = error as? SmartHealthApiException
        _uiState.update {
            it.copy(
                stage = DevicePairingStage.Offline,
                isBusy = false,
                canRetryClaim = false,
                canRetryOnline = true,
                errorMessage = "",
                errorMessageRes = R.string.device_pairing_presence_offline,
                requestId = apiError?.requestId.orEmpty(),
            )
        }
    }

    private suspend fun confirmOnline(device: SmartDevice) {
        val deviceName = device.name.ifBlank { device.id }
        clearSetupMaterial()
        pendingClaim = null
        _uiState.update {
            it.copy(
                stage = DevicePairingStage.Online,
                claimedDeviceName = deviceName,
                isBusy = false,
                canRetryOnline = false,
                errorMessage = "",
                errorMessageRes = null,
                requestId = "",
            )
        }
        _effects.send(DevicePairingUiEffect.DeviceOnlineConfirmed(deviceName))
    }

    private fun publishClaimFailure(error: Throwable) {
        val apiError = error as? SmartHealthApiException
        _uiState.update {
            it.copy(
                stage = DevicePairingStage.ClaimFailed,
                isBusy = false,
                canRetryClaim = pendingClaim != null,
                canRetryOnline = false,
                errorMessage = "",
                errorMessageRes = R.string.device_pairing_backend_error,
                requestId = apiError?.requestId.orEmpty(),
            )
        }
    }

    private fun clearSetupMaterial() {
        expiryJob?.cancel()
        expiryJob = null
        _uiState.update {
            it.copy(
                setupSsid = "",
                setupProofOfPossession = "",
                setupExpiresAtEpochMillis = null,
            )
        }
    }

    private fun cancelSensitiveWork() {
        operationGeneration += 1
        claimJob?.cancel()
        claimJob = null
        pollingJob?.cancel()
        pollingJob = null
        expiryJob?.cancel()
        expiryJob = null
        pendingClaim = null
        resumePollingOnStart = false
    }

    private fun reset(errorMessageRes: Int? = null) {
        cancelSensitiveWork()
        _uiState.value = DevicePairingUiState(errorMessageRes = errorMessageRes)
    }

    override fun onCleared() {
        cancelSensitiveWork()
        super.onCleared()
    }

    private companion object {
        const val SetupPortalUrl = "http://192.168.4.1"
    }
}

private fun SmartDevice.isAuthenticatedOnline(): Boolean = online

private fun DevicePairingResponse.hasConsistentPairingState(): Boolean = when (pairing.outcome) {
    DevicePairingOutcome.Accepted ->
        pairing.presence == DevicePairingPresence.AwaitingOnline &&
            !pairing.onlineConfirmed &&
            pairing.authenticatedTransport == null

    DevicePairingOutcome.Success ->
        pairing.presence == DevicePairingPresence.Online &&
            pairing.onlineConfirmed &&
            pairing.authenticatedTransport == "wss"
}
