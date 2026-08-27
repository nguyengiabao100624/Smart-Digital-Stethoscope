package com.example.smart_health_android.devices

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.CreationExtras
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.R
import com.example.smart_health_android.data.DevicePairingOutcome
import com.example.smart_health_android.data.DevicePairingPresence
import com.example.smart_health_android.data.DevicePairingResponse
import com.example.smart_health_android.data.DeviceWifiSetupSession
import com.example.smart_health_android.data.SmartDevice
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException
import java.time.Instant
import java.util.UUID

@ConsistentCopyVisibility
data class DevicePairingAuthoritySnapshot private constructor(
    val userId: String,
    val workspaceId: String,
    val authorityEpoch: Long,
) {
    companion object {
        fun create(
            userId: String,
            workspaceId: String,
            authorityEpoch: Long,
        ): DevicePairingAuthoritySnapshot {
            val normalizedUserId = userId.trim()
            val normalizedWorkspaceId = workspaceId.trim()
            require(normalizedUserId.isNotBlank()) {
                "Device pairing authority requires a backend user id."
            }
            require(normalizedWorkspaceId.isNotBlank()) {
                "Device pairing authority requires an active workspace id."
            }
            require(authorityEpoch >= 0L) {
                "Device pairing authority epoch cannot be negative."
            }
            return DevicePairingAuthoritySnapshot(
                userId = normalizedUserId,
                workspaceId = normalizedWorkspaceId,
                authorityEpoch = authorityEpoch,
            )
        }
    }
}

enum class DevicePairingStage {
    Entry,
    Claiming,
    PreparingWifi,
    ClaimFailed,
    SetupReady,
    Provisioning,
    AwaitingOnline,
    Offline,
    Online,
}

enum class DeviceSetupCapability {
    None,
    SecureSetupV1,
    ESPTouchV2,
}

enum class DeviceCurrentWifiSsidState {
    Idle,
    Detected,
    PermissionRequired,
    LocationDisabled,
    Manual,
    Unavailable,
}

enum class DevicePairingFailureKind {
    None,
    Offline,
    Permission,
    Session,
    Invalid,
    Conflict,
    Expired,
    Backend,
}

data class DevicePairingUiState(
    val stage: DevicePairingStage = DevicePairingStage.Entry,
    val manualDeviceId: String = "",
    val manualClaimCode: String = "",
    val manualSetupSsid: String = "",
    val manualProofOfPossession: String = "",
    val manualFieldErrors: Set<DeviceManualSetupField> = emptySet(),
    val claimedDeviceId: String = "",
    val claimedDeviceName: String = "",
    val idempotencyKey: String = "",
    val setupCapability: DeviceSetupCapability = DeviceSetupCapability.None,
    val setupSsid: String = "",
    val setupProofOfPossession: String = "",
    val setupExpiresAtEpochMillis: Long? = null,
    val targetWifiSsid: String = "",
    val targetWifiPassword: String = "",
    val currentWifiSsidState: DeviceCurrentWifiSsidState = DeviceCurrentWifiSsidState.Idle,
    val targetWifiFieldErrors: Set<DeviceTargetWifiField> = emptySet(),
    val provisioningProgress: DeviceProvisioningProgress = DeviceProvisioningProgress.Idle,
    val isBusy: Boolean = false,
    val isQrImageDecoding: Boolean = false,
    val canRetryClaim: Boolean = false,
    val canRetryOnline: Boolean = false,
    val failureKind: DevicePairingFailureKind = DevicePairingFailureKind.None,
    val errorMessage: String = "",
    val errorMessageRes: Int? = null,
    val requestId: String = "",
)

sealed interface DevicePairingUiAction {
    data class QrScanned(val rawValue: String) : DevicePairingUiAction
    data class QrImageSelected(val contentUri: String) : DevicePairingUiAction
    data class ManualDeviceIdChanged(val value: String) : DevicePairingUiAction
    data class ManualClaimCodeChanged(val value: String) : DevicePairingUiAction
    data class ManualSetupSsidChanged(val value: String) : DevicePairingUiAction
    data class ManualProofChanged(val value: String) : DevicePairingUiAction
    data object SubmitManual : DevicePairingUiAction
    data class OpenWifiSetup(val deviceId: String) : DevicePairingUiAction
    data object RetryWifiSetup : DevicePairingUiAction
    data object RetryClaim : DevicePairingUiAction
    data class TargetWifiSsidChanged(val value: String) : DevicePairingUiAction
    data class TargetWifiPasswordChanged(val value: String) : DevicePairingUiAction
    data object UseCurrentWifiSsid : DevicePairingUiAction
    data class CurrentWifiSsidPermissionResult(val granted: Boolean) : DevicePairingUiAction
    data object StartLocalProvisioning : DevicePairingUiAction
    data class WifiAccessPermissionResult(val granted: Boolean) : DevicePairingUiAction
    data object RetryOnline : DevicePairingUiAction
    data object ScreenStarted : DevicePairingUiAction
    data object ScreenStopped : DevicePairingUiAction
    data object Cancel : DevicePairingUiAction
    data object Reset : DevicePairingUiAction
}

sealed interface DevicePairingUiEffect {
    data class RequestCurrentWifiSsidPermissions(val permissions: List<String>) : DevicePairingUiEffect
    data class RequestWifiAccessPermissions(val permissions: List<String>) : DevicePairingUiEffect
    data object OpenSystemLocationSettings : DevicePairingUiEffect
    data class DeviceOnlineConfirmed(val deviceName: String) : DevicePairingUiEffect
    data class DeviceRegistered(val deviceId: String, val deviceName: String) : DevicePairingUiEffect
}

interface DeviceClaimRepository {
    suspend fun claimDevice(
        payload: DeviceClaimPayload,
        connectionMethod: String,
        idempotencyKey: String,
    ): DevicePairingResponse

    suspend fun listDevices(): List<SmartDevice>

    suspend fun getRegisteredDevice(deviceId: String): SmartDevice =
        listDevices().firstOrNull { it.id == deviceId }
            ?: throw NoSuchElementException("Device is unavailable in the current account scope")

    suspend fun openWifiSetupSession(deviceId: String): DeviceWifiSetupSession =
        throw UnsupportedOperationException("The device repository does not support Wi-Fi setup")
}

class ApiDeviceClaimRepository(
    private val expectedWorkspaceId: String,
) : DeviceClaimRepository {
    override suspend fun claimDevice(
        payload: DeviceClaimPayload,
        connectionMethod: String,
        idempotencyKey: String,
    ): DevicePairingResponse = SmartHealthRepository.api.pairDevice(
        deviceId = payload.deviceId,
        claimCode = payload.claimCode,
        connectionMethod = connectionMethod,
        organizationId = expectedWorkspaceId,
        idempotencyKey = idempotencyKey,
    )

    override suspend fun listDevices(): List<SmartDevice> = SmartHealthRepository.api.listDevices()

    override suspend fun getRegisteredDevice(deviceId: String): SmartDevice =
        SmartHealthRepository.api.getDevice(deviceId)

    override suspend fun openWifiSetupSession(deviceId: String): DeviceWifiSetupSession =
        SmartHealthRepository.api.openDeviceWifiSetup(deviceId)
}

class DevicePairingViewModel(
    private val repository: DeviceClaimRepository,
    private val provisioner: DeviceWifiProvisioner = UnsupportedDeviceWifiProvisioner,
    private val qrImageDecoder: DeviceQrImageDecoder = UnsupportedDeviceQrImageDecoder,
    private val expectedAuthority: DevicePairingAuthoritySnapshot?,
    private val currentAuthority: () -> DevicePairingAuthoritySnapshot?,
    private val idempotencyKeyFactory: () -> String = { UUID.randomUUID().toString() },
    private val onlineRetryDelaysMillis: List<Long> = listOf(0L, 1_000L, 2_000L, 4_000L, 8_000L, 15_000L),
    private val authorityRetryDelaysMillis: List<Long> =
        listOf(0L, 100L, 250L, 500L, 1_000L, 2_000L, 4_000L),
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
    private var provisioningJob: Job? = null
    private var expiryJob: Job? = null
    private var currentWifiSsidJob: Job? = null
    private var qrImageDecodeJob: Job? = null
    private var operationGeneration = 0L
    private var isScreenActive = true
    private var resumePollingOnStart = false
    private var targetWifiSsidEdited = false
    private var wifiSetupDeviceId = ""
    private var setupProvisioningKey: ByteArray? = null
    private var setupReservedData: ByteArray? = null

    fun onAction(action: DevicePairingUiAction) {
        when (action) {
            is DevicePairingUiAction.QrScanned -> submitQr(action.rawValue)
            is DevicePairingUiAction.QrImageSelected -> decodeQrImage(action.contentUri)
            is DevicePairingUiAction.ManualDeviceIdChanged -> updateManual(
                editedField = DeviceManualSetupField.DeviceId,
                deviceId = action.value,
            )
            is DevicePairingUiAction.ManualClaimCodeChanged -> updateManual(
                editedField = DeviceManualSetupField.ClaimCode,
                claimCode = action.value,
            )
            is DevicePairingUiAction.ManualSetupSsidChanged -> updateManual(
                editedField = DeviceManualSetupField.SetupSsid,
                setupSsid = action.value,
            )
            is DevicePairingUiAction.ManualProofChanged -> updateManual(
                editedField = DeviceManualSetupField.ProofOfPossession,
                proofOfPossession = action.value,
            )
            DevicePairingUiAction.SubmitManual -> submitManual()
            is DevicePairingUiAction.OpenWifiSetup -> openWifiSetup(action.deviceId)
            DevicePairingUiAction.RetryWifiSetup -> retryWifiSetup()
            DevicePairingUiAction.RetryClaim -> retryClaim()
            is DevicePairingUiAction.TargetWifiSsidChanged -> updateTargetWifi(
                field = DeviceTargetWifiField.Ssid,
                ssid = action.value,
            )
            is DevicePairingUiAction.TargetWifiPasswordChanged -> updateTargetWifi(
                field = DeviceTargetWifiField.Password,
                password = action.value,
            )
            DevicePairingUiAction.UseCurrentWifiSsid -> {
                targetWifiSsidEdited = false
                if (
                    _uiState.value.currentWifiSsidState ==
                    DeviceCurrentWifiSsidState.LocationDisabled
                ) {
                    viewModelScope.launch {
                        _effects.send(DevicePairingUiEffect.OpenSystemLocationSettings)
                    }
                } else {
                    refreshCurrentWifiSsid(requestPermission = true)
                }
            }
            is DevicePairingUiAction.CurrentWifiSsidPermissionResult -> {
                if (action.granted) {
                    refreshCurrentWifiSsid(requestPermission = false)
                } else {
                    markCurrentWifiUnavailable()
                }
            }
            DevicePairingUiAction.StartLocalProvisioning -> startLocalProvisioning()
            is DevicePairingUiAction.WifiAccessPermissionResult -> {
                if (action.granted) startLocalProvisioning() else publishProvisioningPermissionDenied()
            }
            DevicePairingUiAction.RetryOnline -> retryOnline()
            DevicePairingUiAction.ScreenStarted -> onScreenStarted()
            DevicePairingUiAction.ScreenStopped -> onScreenStopped()
            DevicePairingUiAction.Cancel,
            DevicePairingUiAction.Reset,
            -> reset()
        }
    }

    private fun updateManual(
        editedField: DeviceManualSetupField,
        deviceId: String? = null,
        claimCode: String? = null,
        setupSsid: String? = null,
        proofOfPossession: String? = null,
    ) {
        val current = _uiState.value
        if (current.isBusy) return
        cancelSensitiveWork()
        _uiState.value = DevicePairingUiState(
            manualDeviceId = deviceId ?: current.manualDeviceId,
            manualClaimCode = claimCode ?: current.manualClaimCode,
            manualSetupSsid = setupSsid ?: current.manualSetupSsid,
            manualProofOfPossession = proofOfPossession ?: current.manualProofOfPossession,
            manualFieldErrors = current.manualFieldErrors - editedField,
        )
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

    private fun decodeQrImage(contentUri: String) {
        val state = _uiState.value
        if (
            state.isBusy ||
            state.isQrImageDecoding ||
            state.stage != DevicePairingStage.Entry ||
            contentUri.isBlank()
        ) {
            return
        }
        qrImageDecodeJob?.cancel()
        qrImageDecodeJob = viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isQrImageDecoding = true,
                    errorMessage = "",
                    errorMessageRes = null,
                    requestId = "",
                )
            }
            val result = try {
                qrImageDecoder.decode(contentUri)
            } catch (error: CancellationException) {
                throw error
            } catch (_: Throwable) {
                DeviceQrImageDecodeResult.UnreadableImage
            }
            val latest = _uiState.value
            if (
                latest.stage != DevicePairingStage.Entry ||
                !latest.isQrImageDecoding
            ) {
                return@launch
            }
            if (hasDifferentCurrentAuthority()) {
                denyStaleAuthority()
                return@launch
            }
            when (result) {
                is DeviceQrImageDecodeResult.Decoded -> {
                    _uiState.update { it.copy(isQrImageDecoding = false) }
                    submitQr(result.rawValue)
                }

                DeviceQrImageDecodeResult.NoQrCode -> publishQrImageDecodeFailure(
                    R.string.device_pairing_qr_image_no_code,
                )

                DeviceQrImageDecodeResult.UnreadableImage -> publishQrImageDecodeFailure(
                    R.string.device_pairing_qr_image_unreadable,
                )

                DeviceQrImageDecodeResult.ImageTooLarge -> publishQrImageDecodeFailure(
                    R.string.device_pairing_qr_image_too_large,
                )
            }
        }
    }

    private fun publishQrImageDecodeFailure(messageRes: Int) {
        _uiState.update {
            it.copy(
                stage = DevicePairingStage.Entry,
                isQrImageDecoding = false,
                errorMessage = "",
                errorMessageRes = messageRes,
                requestId = "",
            )
        }
    }

    private fun submitManual() {
        val state = _uiState.value
        if (state.isBusy) return
        val deviceId = state.manualDeviceId.trim()
        if (!CanonicalDeviceIdPattern.matches(deviceId)) {
            _uiState.update {
                it.copy(
                    stage = DevicePairingStage.Entry,
                    manualFieldErrors = setOf(DeviceManualSetupField.DeviceId),
                    errorMessage = "",
                    errorMessageRes = R.string.device_pairing_invalid_manual,
                    requestId = "",
                )
            }
            return
        }
        connectRegisteredDevice(deviceId)
    }

    private fun connectRegisteredDevice(deviceId: String) {
        if (expectedAuthority == null || hasDifferentCurrentAuthority()) {
            denyStaleAuthority()
            return
        }
        claimJob?.cancel()
        operationGeneration += 1
        val generation = operationGeneration
        _uiState.update {
            it.copy(
                stage = DevicePairingStage.Claiming,
                manualFieldErrors = emptySet(),
                isBusy = true,
                errorMessage = "",
                errorMessageRes = null,
                requestId = "",
                provisioningProgress = DeviceProvisioningProgress.Idle,
            )
        }
        claimJob = viewModelScope.launch {
            if (!awaitCurrentAuthority()) {
                if (generation == operationGeneration) denyStaleAuthority()
                return@launch
            }
            val device = try {
                repository.getRegisteredDevice(deviceId)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (generation == operationGeneration) publishClaimFailure(error)
                return@launch
            }
            if (generation != operationGeneration) return@launch
            if (!awaitCurrentAuthority()) {
                denyStaleAuthority()
                return@launch
            }
            if (
                device.id != deviceId ||
                device.organizationId != expectedAuthority.workspaceId
            ) {
                publishClaimFailure(IllegalStateException("Device identity mismatch"))
                return@launch
            }
            _uiState.update { it.copy(stage = DevicePairingStage.Entry, isBusy = false) }
            _effects.send(
                DevicePairingUiEffect.DeviceRegistered(
                    deviceId = device.id,
                    deviceName = device.name.ifBlank { device.id },
                ),
            )
        }
    }

    private fun openWifiSetup(deviceIdRaw: String) {
        val deviceId = deviceIdRaw.trim()
        if (_uiState.value.isBusy || !CanonicalDeviceIdPattern.matches(deviceId)) {
            _uiState.update {
                it.copy(
                    stage = DevicePairingStage.ClaimFailed,
                    isBusy = false,
                    failureKind = DevicePairingFailureKind.Invalid,
                    errorMessage = "",
                    errorMessageRes = R.string.device_pairing_invalid_manual,
                    requestId = "",
                )
            }
            return
        }
        if (expectedAuthority == null || hasDifferentCurrentAuthority()) {
            denyStaleAuthority()
            return
        }
        wifiSetupDeviceId = deviceId
        cancelSensitiveWork()
        val generation = operationGeneration
        _uiState.update {
            it.copy(
                stage = DevicePairingStage.PreparingWifi,
                claimedDeviceId = deviceId,
                claimedDeviceName = "",
                isBusy = true,
                canRetryClaim = false,
                canRetryOnline = false,
                failureKind = DevicePairingFailureKind.None,
                errorMessage = "",
                errorMessageRes = null,
                requestId = "",
            )
        }
        claimJob = viewModelScope.launch {
            if (!awaitCurrentAuthority()) {
                if (generation == operationGeneration) denyStaleAuthority()
                return@launch
            }
            val session = try {
                repository.openWifiSetupSession(deviceId)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (generation == operationGeneration) publishClaimFailure(error)
                return@launch
            }
            if (generation != operationGeneration) return@launch
            if (!awaitCurrentAuthority()) {
                denyStaleAuthority()
                return@launch
            }
            val validSession = session.device.id == deviceId &&
                session.device.organizationId == expectedAuthority.workspaceId &&
                session.transport == ESPTouchV2Transport &&
                session.security == ESPTouchV2Security &&
                isValidSmartConfigV2Material(
                    deviceId = session.device.id,
                    provisioningKey = session.provisioningKey,
                    reservedData = session.reservedData,
                ) &&
                session.expiresAt.toEpochMilli() > nowMillis()
            if (!validSession) {
                session.clearSensitiveMaterial()
                publishClaimFailure(IllegalStateException("Invalid Wi-Fi setup session"))
                return@launch
            }
            eraseSmartConfigMaterial()
            setupProvisioningKey = session.provisioningKey.copyOf()
            setupReservedData = session.reservedData.copyOf()
            session.clearSensitiveMaterial()
            targetWifiSsidEdited = false
            _uiState.update {
                it.copy(
                    stage = DevicePairingStage.SetupReady,
                    claimedDeviceId = session.device.id,
                    claimedDeviceName = session.device.name.ifBlank { session.device.id },
                    setupCapability = DeviceSetupCapability.ESPTouchV2,
                    setupSsid = "",
                    setupProofOfPossession = "",
                    setupExpiresAtEpochMillis = session.expiresAt.toEpochMilli(),
                    isBusy = false,
                    failureKind = DevicePairingFailureKind.None,
                    errorMessage = "",
                    errorMessageRes = null,
                    requestId = "",
                    currentWifiSsidState = DeviceCurrentWifiSsidState.Idle,
                    targetWifiFieldErrors = emptySet(),
                    targetWifiPassword = "",
                    provisioningProgress = DeviceProvisioningProgress.Idle,
                )
            }
            scheduleSetupExpiryAt(session.expiresAt.toEpochMilli(), generation)
        }
    }

    private fun claim(payload: DeviceClaimPayload, connectionMethod: String) {
        if (_uiState.value.isBusy) return
        if (expectedAuthority == null || hasDifferentCurrentAuthority()) {
            denyStaleAuthority()
            return
        }
        if (!payload.supportsSecureSetup) {
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
                manualDeviceId = "",
                manualClaimCode = "",
                manualSetupSsid = "",
                manualProofOfPossession = "",
                manualFieldErrors = emptySet(),
                claimedDeviceId = payload.deviceId,
                claimedDeviceName = "",
                idempotencyKey = idempotencyKey,
                setupCapability = DeviceSetupCapability.SecureSetupV1,
                setupSsid = setupAp?.ssid.orEmpty(),
                setupProofOfPossession = setupAp?.proofOfPossession.orEmpty(),
                setupExpiresAtEpochMillis = payload.setupExpiresAt?.toEpochMilli(),
                isBusy = true,
                canRetryClaim = false,
                canRetryOnline = false,
                failureKind = DevicePairingFailureKind.None,
                errorMessage = "",
                errorMessageRes = null,
                requestId = "",
            )
        }
        scheduleSetupExpiry(payload, generation)
        claimJob = viewModelScope.launch {
            val authorityReady = awaitCurrentAuthority()
            if (!authorityReady) {
                if (generation == operationGeneration) denyStaleAuthority()
                return@launch
            }
            val response = try {
                repository.claimDevice(payload, connectionMethod, idempotencyKey)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (generation == operationGeneration) {
                    if (!awaitCurrentAuthority()) {
                        denyStaleAuthority()
                    } else if (isConsumedClaimConflict(error)) {
                        val recoveredDevice = try {
                            recoverOwnedClaimedDevice(payload)
                        } catch (recoveryError: CancellationException) {
                            throw recoveryError
                        } catch (recoveryError: Throwable) {
                            publishClaimFailure(recoveryError)
                            return@launch
                        }
                        if (!awaitCurrentAuthority()) {
                            denyStaleAuthority()
                        } else if (recoveredDevice != null) {
                            acceptClaimForSetup(recoveredDevice)
                        } else {
                            publishClaimFailure(error)
                        }
                    } else {
                        publishClaimFailure(error)
                    }
                }
                return@launch
            }
            if (generation != operationGeneration) return@launch
            if (!awaitCurrentAuthority()) {
                denyStaleAuthority()
                return@launch
            }
            val device = response.device
            pendingClaim = null
            if (
                device.id != payload.deviceId ||
                device.organizationId != expectedAuthority?.workspaceId
            ) {
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
            acceptClaimForSetup(device)
        }
    }

    private suspend fun recoverOwnedClaimedDevice(
        payload: DeviceClaimPayload,
    ): SmartDevice? {
        val authority = expectedAuthority ?: return null
        val devices = repository.listDevices()
        return devices.firstOrNull { device ->
            device.id == payload.deviceId &&
                device.organizationId == authority.workspaceId &&
                (device.ownerUserId == authority.userId || device.pairedUserId == authority.userId)
        }
    }

    private fun acceptClaimForSetup(device: SmartDevice) {
        pendingClaim = null
        targetWifiSsidEdited = false
        _uiState.update {
            it.copy(
                claimedDeviceName = device.name,
                stage = DevicePairingStage.SetupReady,
                isBusy = false,
                canRetryClaim = false,
                canRetryOnline = false,
                failureKind = DevicePairingFailureKind.None,
                errorMessage = "",
                errorMessageRes = null,
                requestId = "",
                currentWifiSsidState = DeviceCurrentWifiSsidState.Idle,
            )
        }
    }

    private fun retryClaim() {
        val state = _uiState.value
        val pending = pendingClaim ?: return
        if (state.isBusy || state.stage != DevicePairingStage.ClaimFailed) return
        claim(pending.payload, pending.connectionMethod)
    }

    private fun retryWifiSetup() {
        val deviceId = wifiSetupDeviceId
        if (deviceId.isBlank() || _uiState.value.isBusy) return
        openWifiSetup(deviceId)
    }

    private fun updateTargetWifi(
        field: DeviceTargetWifiField,
        ssid: String? = null,
        password: String? = null,
    ) {
        val state = _uiState.value
        if (
            state.isBusy ||
            state.stage != DevicePairingStage.SetupReady
        ) return
        if (field == DeviceTargetWifiField.Ssid) {
            targetWifiSsidEdited = true
        }
        _uiState.update {
            it.copy(
                targetWifiSsid = ssid ?: it.targetWifiSsid,
                targetWifiPassword = password ?: it.targetWifiPassword,
                currentWifiSsidState = if (field == DeviceTargetWifiField.Ssid) {
                    DeviceCurrentWifiSsidState.Manual
                } else {
                    it.currentWifiSsidState
                },
                targetWifiFieldErrors = it.targetWifiFieldErrors - field,
                errorMessage = "",
                errorMessageRes = null,
                requestId = "",
                provisioningProgress = DeviceProvisioningProgress.Idle,
            )
        }
    }

    private fun refreshCurrentWifiSsid(requestPermission: Boolean) {
        val state = _uiState.value
        if (
            state.isBusy ||
            state.stage != DevicePairingStage.SetupReady ||
            expectedAuthority == null ||
            hasDifferentCurrentAuthority()
        ) return

        currentWifiSsidJob?.cancel()
        currentWifiSsidJob = viewModelScope.launch {
            val currentWifi = provisioner.currentWifiSsid()
            val latestState = _uiState.value
            if (
                latestState.isBusy ||
                latestState.stage != DevicePairingStage.SetupReady ||
                hasDifferentCurrentAuthority()
            ) return@launch

            when (currentWifi) {
                is DeviceCurrentWifiSsid.Available -> {
                    _uiState.update {
                        if (targetWifiSsidEdited) {
                            it.copy(currentWifiSsidState = DeviceCurrentWifiSsidState.Manual)
                        } else {
                            it.copy(
                                targetWifiSsid = currentWifi.value,
                                currentWifiSsidState = DeviceCurrentWifiSsidState.Detected,
                                targetWifiFieldErrors =
                                    it.targetWifiFieldErrors - DeviceTargetWifiField.Ssid,
                            )
                        }
                    }
                }

                is DeviceCurrentWifiSsid.PermissionRequired -> {
                    _uiState.update {
                        it.copy(currentWifiSsidState = DeviceCurrentWifiSsidState.PermissionRequired)
                    }
                    if (requestPermission) {
                        _effects.send(
                            DevicePairingUiEffect.RequestCurrentWifiSsidPermissions(
                                currentWifi.permissions,
                            ),
                        )
                    }
                }

                DeviceCurrentWifiSsid.LocationDisabled -> {
                    _uiState.update {
                        it.copy(currentWifiSsidState = DeviceCurrentWifiSsidState.LocationDisabled)
                    }
                }

                DeviceCurrentWifiSsid.Unavailable -> markCurrentWifiUnavailable()
            }
        }
    }

    private fun markCurrentWifiUnavailable() {
        val state = _uiState.value
        if (state.stage != DevicePairingStage.SetupReady) return
        _uiState.update {
            it.copy(
                currentWifiSsidState = if (targetWifiSsidEdited) {
                    DeviceCurrentWifiSsidState.Manual
                } else {
                    DeviceCurrentWifiSsidState.Unavailable
                },
            )
        }
    }

    private fun startLocalProvisioning() {
        val state = _uiState.value
        if (
            state.isBusy ||
            state.stage != DevicePairingStage.SetupReady ||
            state.claimedDeviceId.isBlank() ||
            state.setupCapability != DeviceSetupCapability.ESPTouchV2 ||
            setupProvisioningKey == null ||
            setupReservedData == null
        ) return
        if (expectedAuthority == null || hasDifferentCurrentAuthority()) {
            denyStaleAuthority()
            return
        }
        if (hasSetupExpired(state)) {
            expireSetup()
            return
        }
        val fieldErrors = validateTargetWifiCredentials(
            ssid = state.targetWifiSsid,
            password = state.targetWifiPassword,
        )
        if (fieldErrors.isNotEmpty()) {
            _uiState.update {
                it.copy(
                    targetWifiFieldErrors = fieldErrors,
                    errorMessage = "",
                    errorMessageRes = R.string.device_pairing_target_wifi_invalid,
                )
            }
            return
        }
        when (val availability = provisioner.availability()) {
            DeviceWifiProvisioningAvailability.Available -> beginLocalProvisioning(state)
            is DeviceWifiProvisioningAvailability.PermissionRequired -> {
                viewModelScope.launch {
                    _effects.send(
                        DevicePairingUiEffect.RequestWifiAccessPermissions(availability.permissions),
                    )
                }
            }
            DeviceWifiProvisioningAvailability.Unsupported -> {
                _uiState.update {
                    it.copy(errorMessageRes = R.string.device_pairing_wifi_unsupported)
                }
            }
        }
    }

    private fun beginLocalProvisioning(state: DevicePairingUiState) {
        val provisioningKey = setupProvisioningKey?.copyOf() ?: return
        val reservedData = setupReservedData?.copyOf() ?: run {
            provisioningKey.fill(0)
            return
        }
        val request = DeviceWifiProvisioningRequest(
            deviceId = state.claimedDeviceId,
            provisioningKey = provisioningKey,
            reservedData = reservedData,
            targetSsid = state.targetWifiSsid.trim(),
            targetPassword = state.targetWifiPassword,
        )
        provisioningJob?.cancel()
        val generation = operationGeneration
        _uiState.update {
            it.copy(
                stage = DevicePairingStage.Provisioning,
                isBusy = true,
                targetWifiFieldErrors = emptySet(),
                errorMessage = "",
                errorMessageRes = null,
                requestId = "",
                provisioningProgress = DeviceProvisioningProgress.CheckingTargetNetwork,
            )
        }
        provisioningJob = viewModelScope.launch {
            if (!awaitCurrentAuthority()) {
                if (generation == operationGeneration) denyStaleAuthority()
                return@launch
            }
            val broadcastResult = try {
                provisioner.provision(request) { progress ->
                    if (generation == operationGeneration) {
                        _uiState.update { current ->
                            if (
                                current.stage == DevicePairingStage.Provisioning &&
                                current.isBusy
                            ) {
                                current.copy(provisioningProgress = progress)
                            } else {
                                current
                            }
                        }
                        if (
                            progress == DeviceProvisioningProgress.BroadcastingCredentials &&
                            pollingJob?.isActive != true
                        ) {
                            startOnlinePolling(request.deviceId)
                        }
                    }
                }
            } catch (error: CancellationException) {
                request.clearSensitiveMaterial()
                clearSetupMaterial()
                throw error
            } catch (error: Throwable) {
                pollingJob?.cancel()
                pollingJob = null
                request.clearSensitiveMaterial()
                clearSetupMaterial()
                if (generation == operationGeneration) {
                    if (awaitCurrentAuthority()) {
                        _uiState.update {
                            it.copy(
                                stage = DevicePairingStage.ClaimFailed,
                                isBusy = false,
                                targetWifiPassword = "",
                                errorMessageRes = when (error) {
                                    else -> R.string.device_pairing_local_provision_failed
                                },
                                provisioningProgress = when (error) {
                                    is DeviceSetupNetworkUnavailableException,
                                    is TimeoutCancellationException ->
                                        DeviceProvisioningProgress.TargetNetworkUnavailable

                                    else -> DeviceProvisioningProgress.SmartConfigFailed
                                },
                            )
                        }
                    } else {
                        denyStaleAuthority()
                    }
                }
                return@launch
            }
            if (generation != operationGeneration) return@launch
            if (!awaitCurrentAuthority()) {
                denyStaleAuthority()
                return@launch
            }
            provisioningJob = null
            request.clearSensitiveMaterial()
            clearSetupMaterial()
            _uiState.update {
                it.copy(
                    stage = DevicePairingStage.AwaitingOnline,
                    targetWifiPassword = "",
                    isBusy = true,
                    canRetryOnline = false,
                    provisioningProgress = when (broadcastResult) {
                        DeviceSmartConfigBroadcastResult.DirectAcknowledged ->
                            DeviceProvisioningProgress.WaitingForDeviceOnline

                        DeviceSmartConfigBroadcastResult.BroadcastCompletedWithoutDirectResponse ->
                            DeviceProvisioningProgress
                                .WaitingForDeviceOnlineWithoutDirectResponse
                    },
                )
            }
            if (pollingJob?.isActive != true) {
                startOnlinePolling(request.deviceId)
            }
        }
    }

    private fun publishProvisioningPermissionDenied() {
        if (
            _uiState.value.stage != DevicePairingStage.SetupReady
        ) return
        _uiState.update {
            it.copy(
                failureKind = DevicePairingFailureKind.Permission,
                errorMessageRes = R.string.device_pairing_wifi_access_permission_denied,
            )
        }
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
                provisioningProgress = DeviceProvisioningProgress.WaitingForDeviceOnline,
            )
        }
        startOnlinePolling(state.claimedDeviceId)
    }

    private fun onScreenStarted() {
        isScreenActive = true
        if (
            _uiState.value.stage == DevicePairingStage.SetupReady &&
            _uiState.value.currentWifiSsidState ==
            DeviceCurrentWifiSsidState.LocationDisabled
        ) {
            refreshCurrentWifiSsid(requestPermission = false)
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
                provisioningProgress = DeviceProvisioningProgress.WaitingForDeviceOnline,
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
            if (!awaitCurrentAuthority()) {
                denyStaleAuthority()
                return
            }
            _uiState.update { current ->
                if (current.stage == DevicePairingStage.AwaitingOnline && current.isBusy) {
                    current.copy(
                        provisioningProgress = if (
                            current.provisioningProgress.usesOnlineCheckWithoutDirectResponse()
                        ) {
                            DeviceProvisioningProgress.CheckingDeviceOnlineWithoutDirectResponse
                        } else {
                            DeviceProvisioningProgress.CheckingDeviceOnline
                        },
                    )
                } else {
                    current
                }
            }
            val devices = try {
                repository.listDevices().also { lastFailure = null }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (!awaitCurrentAuthority()) {
                    denyStaleAuthority()
                    return
                }
                lastFailure = error
                continue
            }
            if (!awaitCurrentAuthority()) {
                denyStaleAuthority()
                return
            }
            val device = devices.firstOrNull {
                it.id == deviceId && it.organizationId == expectedAuthority?.workspaceId
            }
            if (device?.isAuthenticatedOnline() == true) {
                confirmOnline(device)
                return
            }
        }
        if (generation != operationGeneration) return
        if (
            _uiState.value.stage == DevicePairingStage.Provisioning &&
            provisioningJob?.isActive == true
        ) {
            pollingJob = null
            return
        }
        if (lastFailure != null) {
            publishPresenceFailure(lastFailure)
            return
        }
        _uiState.update {
            it.copy(
                stage = DevicePairingStage.AwaitingOnline,
                isBusy = false,
                canRetryOnline = true,
                errorMessage = "",
                errorMessageRes = R.string.device_pairing_waiting_online,
                provisioningProgress = if (
                    it.provisioningProgress.usesOnlineCheckWithoutDirectResponse()
                ) {
                    DeviceProvisioningProgress.DeviceNotOnlineWithoutDirectResponse
                } else {
                    DeviceProvisioningProgress.DeviceNotOnline
                },
            )
        }
    }

    private fun scheduleSetupExpiry(payload: DeviceClaimPayload, generation: Long) {
        payload.setupExpiresAt?.toEpochMilli()?.let { expiresAt ->
            scheduleSetupExpiryAt(expiresAt, generation)
        }
    }

    private fun scheduleSetupExpiryAt(expiresAt: Long, generation: Long) {
        expiryJob?.cancel()
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
        // Keep the Wi-Fi setup surface in place. Returning to Entry here would
        // expose the Device ID form after an ESPTouch session expires and make a
        // Wi-Fi retry look like a new device pairing flow.
        clearSetupMaterial()
        _uiState.update {
            it.copy(
                stage = DevicePairingStage.ClaimFailed,
                isBusy = false,
                canRetryClaim = false,
                canRetryOnline = false,
                failureKind = DevicePairingFailureKind.Expired,
                errorMessage = "",
                errorMessageRes = R.string.device_pairing_setup_expired,
                requestId = "",
                provisioningProgress = DeviceProvisioningProgress.Idle,
            )
        }
    }

    private fun publishPresenceFailure(error: Throwable) {
        val apiError = error as? SmartHealthApiException
        val policy = classifyPresenceFailure(error)
        if (!policy.retryable) {
            pendingClaim = null
            clearSetupMaterial()
        }
        _uiState.update {
            it.copy(
                stage = if (policy.retryable) {
                    DevicePairingStage.Offline
                } else {
                    DevicePairingStage.ClaimFailed
                },
                isBusy = false,
                canRetryClaim = false,
                canRetryOnline = policy.retryable,
                failureKind = policy.kind,
                errorMessage = "",
                errorMessageRes = policy.messageRes,
                requestId = apiError?.requestId.orEmpty(),
                provisioningProgress = if (
                    it.provisioningProgress.usesOnlineCheckWithoutDirectResponse()
                ) {
                    DeviceProvisioningProgress.DeviceNotOnlineWithoutDirectResponse
                } else {
                    DeviceProvisioningProgress.DeviceNotOnline
                },
            )
        }
    }

    private fun classifyPresenceFailure(error: Throwable): ClaimFailurePolicy {
        val apiError = error as? SmartHealthApiException
        if (apiError != null) {
            return when {
                apiError.statusCode == 401 || apiError.code in SessionAuthorityErrorCodes ->
                    ClaimFailurePolicy(
                        retryable = false,
                        messageRes = R.string.device_pairing_session_expired,
                        kind = DevicePairingFailureKind.Session,
                    )

                apiError.statusCode == 403 || apiError.code in WorkspaceAuthorityErrorCodes ->
                    ClaimFailurePolicy(
                        retryable = false,
                        messageRes = R.string.device_pairing_permission_denied,
                        kind = DevicePairingFailureKind.Permission,
                    )

                apiError.statusCode in setOf(408, 429) || apiError.statusCode >= 500 ->
                    ClaimFailurePolicy(
                        retryable = true,
                        messageRes = R.string.device_pairing_presence_offline,
                        kind = DevicePairingFailureKind.Backend,
                    )

                else -> ClaimFailurePolicy(
                    retryable = false,
                    messageRes = R.string.device_pairing_backend_error,
                    kind = DevicePairingFailureKind.Backend,
                )
            }
        }
        return if (error is IOException) {
            ClaimFailurePolicy(
                retryable = true,
                messageRes = R.string.device_pairing_presence_offline,
                kind = DevicePairingFailureKind.Offline,
            )
        } else {
            ClaimFailurePolicy(
                retryable = false,
                messageRes = R.string.device_pairing_backend_error,
                kind = DevicePairingFailureKind.Backend,
            )
        }
    }

    private suspend fun confirmOnline(device: SmartDevice) {
        if (!awaitCurrentAuthority() || device.organizationId != expectedAuthority?.workspaceId) {
            denyStaleAuthority()
            return
        }
        val deviceName = device.name.ifBlank { device.id }
        val activeProvisioningJob = provisioningJob
        provisioningJob = null
        activeProvisioningJob?.cancel()
        clearSetupMaterial()
        pendingClaim = null
        _uiState.update {
            it.copy(
                stage = DevicePairingStage.Online,
                claimedDeviceName = deviceName,
                provisioningProgress = DeviceProvisioningProgress.DeviceOnline,
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
        val policy = classifyClaimFailure(error)
        if (!policy.retryable) {
            pendingClaim = null
            clearSetupMaterial()
        }
        _uiState.update {
            it.copy(
                stage = DevicePairingStage.ClaimFailed,
                isBusy = false,
                canRetryClaim = policy.retryable && pendingClaim != null,
                canRetryOnline = false,
                errorMessage = "",
                errorMessageRes = policy.messageRes,
                failureKind = policy.kind,
                requestId = apiError?.requestId.orEmpty(),
            )
        }
    }

    private fun classifyClaimFailure(error: Throwable): ClaimFailurePolicy {
        val apiError = error as? SmartHealthApiException
        if (apiError != null) {
            return when {
                apiError.statusCode == 401 || apiError.code in SessionAuthorityErrorCodes ->
                    ClaimFailurePolicy(
                        retryable = false,
                        messageRes = R.string.device_pairing_session_expired,
                        kind = DevicePairingFailureKind.Session,
                    )

                apiError.statusCode == 403 || apiError.code in WorkspaceAuthorityErrorCodes ->
                    ClaimFailurePolicy(
                        retryable = false,
                        messageRes = R.string.device_pairing_permission_denied,
                        kind = DevicePairingFailureKind.Permission,
                    )

                apiError.statusCode == 404 || apiError.code == "DEVICE_NOT_PROVISIONED" ->
                    ClaimFailurePolicy(
                        retryable = false,
                        messageRes = R.string.device_pairing_not_provisioned,
                        kind = DevicePairingFailureKind.Invalid,
                    )

                apiError.statusCode == 409 ->
                    ClaimFailurePolicy(
                        retryable = false,
                        messageRes = R.string.device_pairing_claim_conflict,
                        kind = DevicePairingFailureKind.Conflict,
                    )

                apiError.statusCode == 410 || apiError.code in ExpiredClaimErrorCodes ->
                    ClaimFailurePolicy(
                        retryable = false,
                        messageRes = R.string.device_pairing_claim_expired,
                        kind = DevicePairingFailureKind.Expired,
                    )

                apiError.statusCode in 400..499 && apiError.statusCode !in setOf(408, 429) ->
                    ClaimFailurePolicy(
                        retryable = false,
                        messageRes = R.string.device_pairing_invalid_manual,
                        kind = DevicePairingFailureKind.Invalid,
                    )

                else -> ClaimFailurePolicy(
                    retryable = true,
                    messageRes = R.string.device_pairing_backend_error,
                    kind = DevicePairingFailureKind.Backend,
                )
            }
        }
        return if (error is IOException) {
            ClaimFailurePolicy(
                retryable = true,
                messageRes = R.string.device_pairing_claim_offline,
                kind = DevicePairingFailureKind.Offline,
            )
        } else {
            ClaimFailurePolicy(
                retryable = false,
                messageRes = R.string.device_pairing_backend_error,
                kind = DevicePairingFailureKind.Backend,
            )
        }
    }

    private fun clearSetupMaterial() {
        expiryJob?.cancel()
        expiryJob = null
        eraseSmartConfigMaterial()
        _uiState.update {
            it.copy(
                setupSsid = "",
                setupProofOfPossession = "",
                setupExpiresAtEpochMillis = null,
                targetWifiPassword = "",
            )
        }
    }

    private fun hasDifferentCurrentAuthority(): Boolean =
        currentAuthority()?.let { it != expectedAuthority } == true

    private suspend fun awaitCurrentAuthority(): Boolean {
        if (expectedAuthority == null) return false
        for (retryDelayMillis in authorityRetryDelaysMillis) {
            if (retryDelayMillis > 0L) delay(retryDelayMillis)
            val current = currentAuthority()
            if (current == expectedAuthority) return true
            if (current != null) return false
        }
        return false
    }

    private fun isConsumedClaimConflict(error: Throwable): Boolean {
        val apiError = error as? SmartHealthApiException ?: return false
        return apiError.statusCode == 409 && apiError.code in ConsumedClaimConflictErrorCodes
    }

    private fun denyStaleAuthority() {
        cancelSensitiveWork()
        _uiState.value = DevicePairingUiState(
            stage = DevicePairingStage.ClaimFailed,
            failureKind = DevicePairingFailureKind.Session,
            errorMessageRes = R.string.device_pairing_session_expired,
        )
    }

    private fun cancelSensitiveWork() {
        operationGeneration += 1
        claimJob?.cancel()
        claimJob = null
        pollingJob?.cancel()
        pollingJob = null
        provisioningJob?.cancel()
        provisioningJob = null
        expiryJob?.cancel()
        expiryJob = null
        currentWifiSsidJob?.cancel()
        currentWifiSsidJob = null
        qrImageDecodeJob?.cancel()
        qrImageDecodeJob = null
        pendingClaim = null
        resumePollingOnStart = false
        eraseSmartConfigMaterial()
    }

    private fun eraseSmartConfigMaterial() {
        setupProvisioningKey?.fill(0)
        setupReservedData?.fill(0)
        setupProvisioningKey = null
        setupReservedData = null
    }

    private fun reset(errorMessageRes: Int? = null) {
        cancelSensitiveWork()
        targetWifiSsidEdited = false
        wifiSetupDeviceId = ""
        _uiState.value = DevicePairingUiState(errorMessageRes = errorMessageRes)
    }

    override fun onCleared() {
        cancelSensitiveWork()
        super.onCleared()
    }

    private companion object {
        val CanonicalDeviceIdPattern = Regex("^[A-Za-z0-9][A-Za-z0-9_-]{2,62}$")
        const val ESPTouchV2Transport = "esptouch_v2"
        const val ESPTouchV2Security = "aes128"
        val SessionAuthorityErrorCodes = setOf(
            "AUTH_SESSION_REPLACED",
            "AUTH_SESSION_REVOKED",
            "AUTH_SESSION_REQUIRED",
            "AUTH_SESSION_CHANGED",
            "AUTH_SESSION_BINDING_MISSING",
            "ACCOUNT_LOCKED",
            "ACCOUNT_NOT_FOUND",
        )
        val WorkspaceAuthorityErrorCodes = setOf(
            "WORKSPACE_MEMBERSHIP_REQUIRED",
            "WORKSPACE_ARCHIVED",
        )
        val ExpiredClaimErrorCodes = setOf(
            "DEVICE_CLAIM_EXPIRED",
            "DEVICE_CLAIM_REVOKED",
        )
        val ConsumedClaimConflictErrorCodes = setOf(
            "DEVICE_CLAIM_ALREADY_USED",
            "DEVICE_CLAIM_STATE_INVALID",
            "DEVICE_ALREADY_OWNED",
        )
    }
}

class DevicePairingViewModelFactory(
    private val expectedAuthority: DevicePairingAuthoritySnapshot?,
    private val currentAuthority: () -> DevicePairingAuthoritySnapshot?,
    private val repository: DeviceClaimRepository = ApiDeviceClaimRepository(
        expectedAuthority?.workspaceId.orEmpty(),
    ),
    private val provisioner: DeviceWifiProvisioner? = null,
    private val qrImageDecoder: DeviceQrImageDecoder? = null,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return createViewModel(
            modelClass = modelClass,
            resolvedProvisioner = provisioner ?: UnsupportedDeviceWifiProvisioner,
            resolvedQrImageDecoder = qrImageDecoder ?: UnsupportedDeviceQrImageDecoder,
        )
    }

    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T {
        val application = extras[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY]
        val resolvedProvisioner = provisioner
            ?: application?.let(::AndroidDeviceWifiProvisioner)
            ?: UnsupportedDeviceWifiProvisioner
        val resolvedQrImageDecoder = qrImageDecoder
            ?: application?.let(::AndroidDeviceQrImageDecoder)
            ?: UnsupportedDeviceQrImageDecoder
        return createViewModel(
            modelClass,
            resolvedProvisioner,
            resolvedQrImageDecoder,
        )
    }

    @Suppress("UNCHECKED_CAST")
    private fun <T : ViewModel> createViewModel(
        modelClass: Class<T>,
        resolvedProvisioner: DeviceWifiProvisioner,
        resolvedQrImageDecoder: DeviceQrImageDecoder,
    ): T {
        require(modelClass.isAssignableFrom(DevicePairingViewModel::class.java))
        return DevicePairingViewModel(
            repository = repository,
            provisioner = resolvedProvisioner,
            qrImageDecoder = resolvedQrImageDecoder,
            expectedAuthority = expectedAuthority,
            currentAuthority = currentAuthority,
        ) as T
    }
}

private data class ClaimFailurePolicy(
    val retryable: Boolean,
    val messageRes: Int,
    val kind: DevicePairingFailureKind,
)

private fun SmartDevice.isAuthenticatedOnline(): Boolean = online

private fun DeviceProvisioningProgress.usesOnlineCheckWithoutDirectResponse(): Boolean = this in setOf(
    DeviceProvisioningProgress.BroadcastCompletedWithoutDirectResponse,
    DeviceProvisioningProgress.WaitingForDeviceOnlineWithoutDirectResponse,
    DeviceProvisioningProgress.CheckingDeviceOnlineWithoutDirectResponse,
    DeviceProvisioningProgress.DeviceNotOnlineWithoutDirectResponse,
)

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
