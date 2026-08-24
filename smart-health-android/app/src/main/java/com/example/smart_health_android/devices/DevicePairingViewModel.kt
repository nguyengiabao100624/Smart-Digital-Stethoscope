package com.example.smart_health_android.devices

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.CreationExtras
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
    ClaimFailed,
    SetupReady,
    Provisioning,
    OpeningWifi,
    PortalGuidance,
    AwaitingOnline,
    Offline,
    Online,
}

enum class DeviceSetupCapability {
    None,
    SecureSetupV1,
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
    val targetWifiFieldErrors: Set<DeviceTargetWifiField> = emptySet(),
    val isBusy: Boolean = false,
    val canRetryClaim: Boolean = false,
    val canRetryOnline: Boolean = false,
    val failureKind: DevicePairingFailureKind = DevicePairingFailureKind.None,
    val errorMessage: String = "",
    val errorMessageRes: Int? = null,
    val requestId: String = "",
)

sealed interface DevicePairingUiAction {
    data class QrScanned(val rawValue: String) : DevicePairingUiAction
    data class ManualDeviceIdChanged(val value: String) : DevicePairingUiAction
    data class ManualClaimCodeChanged(val value: String) : DevicePairingUiAction
    data class ManualSetupSsidChanged(val value: String) : DevicePairingUiAction
    data class ManualProofChanged(val value: String) : DevicePairingUiAction
    data object SubmitManual : DevicePairingUiAction
    data object RetryClaim : DevicePairingUiAction
    data class TargetWifiSsidChanged(val value: String) : DevicePairingUiAction
    data class TargetWifiPasswordChanged(val value: String) : DevicePairingUiAction
    data object StartLocalProvisioning : DevicePairingUiAction
    data class NearbyWifiPermissionResult(val granted: Boolean) : DevicePairingUiAction
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
    data class RequestNearbyWifiPermissions(val permissions: List<String>) : DevicePairingUiEffect
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
}

class DevicePairingViewModel(
    private val repository: DeviceClaimRepository,
    private val provisioner: DeviceWifiProvisioner = UnsupportedDeviceWifiProvisioner,
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
    private var operationGeneration = 0L
    private var isScreenActive = true
    private var resumePollingOnStart = false
    private var wifiOriginStage = DevicePairingStage.SetupReady

    fun onAction(action: DevicePairingUiAction) {
        when (action) {
            is DevicePairingUiAction.QrScanned -> submitQr(action.rawValue)
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
            DevicePairingUiAction.RetryClaim -> retryClaim()
            is DevicePairingUiAction.TargetWifiSsidChanged -> updateTargetWifi(
                field = DeviceTargetWifiField.Ssid,
                ssid = action.value,
            )
            is DevicePairingUiAction.TargetWifiPasswordChanged -> updateTargetWifi(
                field = DeviceTargetWifiField.Password,
                password = action.value,
            )
            DevicePairingUiAction.StartLocalProvisioning -> startLocalProvisioning()
            is DevicePairingUiAction.NearbyWifiPermissionResult -> {
                if (action.granted) startLocalProvisioning() else publishProvisioningPermissionDenied()
            }
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

    private fun submitManual() {
        val state = _uiState.value
        if (state.isBusy) return
        val fieldErrors = DeviceClaimPayloadParser.validateManualSetupFields(
            deviceId = state.manualDeviceId,
            claimCode = state.manualClaimCode,
            setupSsid = state.manualSetupSsid,
            proofOfPossession = state.manualProofOfPossession,
        )
        if (fieldErrors.isNotEmpty()) {
            _uiState.update {
                it.copy(
                    stage = DevicePairingStage.Entry,
                    manualFieldErrors = fieldErrors,
                    errorMessage = "",
                    errorMessageRes = R.string.device_pairing_invalid_manual,
                    requestId = "",
                )
            }
            return
        }
        val payload = DeviceClaimPayloadParser.fromManualSetupFields(
            deviceId = state.manualDeviceId,
            claimCode = state.manualClaimCode,
            setupSsid = state.manualSetupSsid,
            proofOfPossession = state.manualProofOfPossession,
            now = Instant.ofEpochMilli(nowMillis()),
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
            if (!awaitCurrentAuthority()) {
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
        return repository.listDevices().firstOrNull { device ->
            device.id == payload.deviceId &&
                device.organizationId == authority.workspaceId &&
                (device.ownerUserId == authority.userId || device.pairedUserId == authority.userId)
        }
    }

    private fun acceptClaimForSetup(device: SmartDevice) {
        pendingClaim = null
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
            )
        }
    }

    private fun retryClaim() {
        val state = _uiState.value
        val pending = pendingClaim ?: return
        if (state.isBusy || state.stage != DevicePairingStage.ClaimFailed) return
        claim(pending.payload, pending.connectionMethod)
    }

    private fun updateTargetWifi(
        field: DeviceTargetWifiField,
        ssid: String? = null,
        password: String? = null,
    ) {
        val state = _uiState.value
        if (
            state.isBusy ||
            state.stage !in setOf(DevicePairingStage.SetupReady, DevicePairingStage.PortalGuidance)
        ) return
        _uiState.update {
            it.copy(
                targetWifiSsid = ssid ?: it.targetWifiSsid,
                targetWifiPassword = password ?: it.targetWifiPassword,
                targetWifiFieldErrors = it.targetWifiFieldErrors - field,
                errorMessage = "",
                errorMessageRes = null,
                requestId = "",
            )
        }
    }

    private fun startLocalProvisioning() {
        val state = _uiState.value
        if (
            state.isBusy ||
            state.stage !in setOf(DevicePairingStage.SetupReady, DevicePairingStage.PortalGuidance) ||
            state.claimedDeviceId.isBlank() ||
            state.setupSsid.isBlank() ||
            state.setupProofOfPossession.isBlank()
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
                        DevicePairingUiEffect.RequestNearbyWifiPermissions(availability.permissions),
                    )
                }
            }
            DeviceWifiProvisioningAvailability.Unsupported -> openWifiSettings()
        }
    }

    private fun beginLocalProvisioning(state: DevicePairingUiState) {
        val request = DeviceWifiProvisioningRequest(
            deviceId = state.claimedDeviceId,
            setupSsid = state.setupSsid,
            setupPassphrase = state.setupProofOfPossession,
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
            )
        }
        provisioningJob = viewModelScope.launch {
            if (!awaitCurrentAuthority()) {
                if (generation == operationGeneration) denyStaleAuthority()
                return@launch
            }
            try {
                provisioner.provision(request)
            } catch (error: CancellationException) {
                throw error
            } catch (_: Throwable) {
                if (generation == operationGeneration) {
                    if (awaitCurrentAuthority()) {
                        _uiState.update {
                            it.copy(
                                stage = DevicePairingStage.SetupReady,
                                isBusy = false,
                                errorMessageRes = R.string.device_pairing_local_provision_failed,
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
            clearSetupMaterial()
            _uiState.update {
                it.copy(
                    stage = DevicePairingStage.AwaitingOnline,
                    targetWifiPassword = "",
                    isBusy = true,
                    canRetryOnline = false,
                )
            }
            startOnlinePolling(request.deviceId)
        }
    }

    private fun publishProvisioningPermissionDenied() {
        if (
            _uiState.value.stage !in
            setOf(DevicePairingStage.SetupReady, DevicePairingStage.PortalGuidance)
        ) return
        _uiState.update {
            it.copy(
                failureKind = DevicePairingFailureKind.Permission,
                errorMessageRes = R.string.device_pairing_nearby_wifi_permission_denied,
            )
        }
    }

    private fun openWifiSettings() {
        val state = _uiState.value
        if (
            state.stage !in setOf(DevicePairingStage.SetupReady, DevicePairingStage.PortalGuidance) ||
            state.setupCapability != DeviceSetupCapability.SecureSetupV1 ||
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
            if (!awaitCurrentAuthority()) {
                denyStaleAuthority()
                return
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
            )
        }
    }

    private fun scheduleSetupExpiry(payload: DeviceClaimPayload, generation: Long) {
        expiryJob?.cancel()
        val expiresAt = payload.setupExpiresAt?.toEpochMilli() ?: return
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
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return createViewModel(modelClass, provisioner ?: UnsupportedDeviceWifiProvisioner)
    }

    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T {
        val application = extras[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY]
        val resolvedProvisioner = provisioner
            ?: application?.let(::AndroidDeviceWifiProvisioner)
            ?: UnsupportedDeviceWifiProvisioner
        return createViewModel(modelClass, resolvedProvisioner)
    }

    @Suppress("UNCHECKED_CAST")
    private fun <T : ViewModel> createViewModel(
        modelClass: Class<T>,
        resolvedProvisioner: DeviceWifiProvisioner,
    ): T {
        require(modelClass.isAssignableFrom(DevicePairingViewModel::class.java))
        return DevicePairingViewModel(
            repository = repository,
            provisioner = resolvedProvisioner,
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
