package com.example.smart_health_android.scan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.Patient
import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.data.SmartDevice
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.StartScanRequest
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID

enum class NewScanLoadState {
    Loading,
    Content,
    Error,
    Offline,
    Permission,
}

enum class NewScanType(
    val wireValue: String,
) {
    Heart("heart"),
    Lung("lung"),
}

enum class ScanBodySite(
    val scanType: NewScanType,
    val wireValue: String,
) {
    Aortic(NewScanType.Heart, "aortic"),
    Pulmonic(NewScanType.Heart, "pulmonic"),
    Tricuspid(NewScanType.Heart, "tricuspid"),
    Mitral(NewScanType.Heart, "mitral"),
    RightUpperAnterior(NewScanType.Lung, "right_upper_anterior"),
    LeftUpperAnterior(NewScanType.Lung, "left_upper_anterior"),
    RightLowerPosterior(NewScanType.Lung, "right_lower_posterior"),
    LeftLowerPosterior(NewScanType.Lung, "left_lower_posterior"),
}

enum class NewScanReadinessCheck {
    QuietEnvironment,
    DirectSkinContact,
    PatientReady,
}

enum class NewScanFailure {
    None,
    Validation,
    Offline,
    Permission,
    DeviceOffline,
    InvalidReceipt,
    Backend,
}

data class NewScanUiState(
    val loadState: NewScanLoadState = NewScanLoadState.Loading,
    val profiles: List<Patient> = emptyList(),
    val selectedProfileId: String = "",
    val devices: List<SmartDevice> = emptyList(),
    val selectedDeviceId: String = "",
    val scanType: NewScanType = NewScanType.Heart,
    val selectedBodySite: ScanBodySite? = null,
    val readiness: Set<NewScanReadinessCheck> = emptySet(),
    val notes: String = "",
    val profileName: String = "",
    val relationship: String = "",
    val profileNameInvalid: Boolean = false,
    val relationshipInvalid: Boolean = false,
    val isCreatingProfile: Boolean = false,
    val isSubmitting: Boolean = false,
    val failure: NewScanFailure = NewScanFailure.None,
    val errorDetail: String = "",
    val requestId: String = "",
    val startedScanId: String = "",
) {
    val availableBodySites: List<ScanBodySite>
        get() = ScanBodySite.entries.filter { it.scanType == scanType }

    val selectedProfile: Patient?
        get() = profiles.firstOrNull { it.id == selectedProfileId }

    val selectedDevice: SmartDevice?
        get() = devices.firstOrNull { it.id == selectedDeviceId }

    val canCreateProfile: Boolean
        get() = profileName.isNotBlank() && relationship.isNotBlank() &&
            !isCreatingProfile && !isSubmitting

    val canStart: Boolean
        get() = loadState == NewScanLoadState.Content &&
            selectedProfileId.isNotBlank() &&
            selectedDevice?.isEligibleForScan(selectedProfile) == true &&
            selectedBodySite?.scanType == scanType &&
            readiness.containsAll(NewScanReadinessCheck.entries) &&
            !isCreatingProfile &&
            !isSubmitting &&
            startedScanId.isBlank()
}

sealed interface NewScanUiAction {
    data object Load : NewScanUiAction
    data object Retry : NewScanUiAction
    data class ProfileSelected(val patientId: String) : NewScanUiAction
    data class ProfileNameChanged(val value: String) : NewScanUiAction
    data class RelationshipChanged(val value: String) : NewScanUiAction
    data object CreateProfile : NewScanUiAction
    data class DeviceSelected(val deviceId: String) : NewScanUiAction
    data class ScanTypeSelected(val type: NewScanType) : NewScanUiAction
    data class BodySiteSelected(val bodySite: ScanBodySite) : NewScanUiAction
    data class ReadinessToggled(val item: NewScanReadinessCheck) : NewScanUiAction
    data class NotesChanged(val value: String) : NewScanUiAction
    data object DismissFailure : NewScanUiAction
    data object Submit : NewScanUiAction
}

sealed interface NewScanUiEffect {
    data class BackendAccepted(val scanId: String) : NewScanUiEffect
}

interface NewScanRepository {
    suspend fun loadProfiles(): List<Patient>
    suspend fun loadDevices(): List<SmartDevice>
    suspend fun createDependentProfile(name: String, relationship: String): Patient
    suspend fun startScan(request: StartScanRequest, idempotencyKey: String): Scan
}

class ApiNewScanRepository : NewScanRepository {
    override suspend fun loadProfiles(): List<Patient> = SmartHealthRepository.api.listPatients()

    override suspend fun loadDevices(): List<SmartDevice> = SmartHealthRepository.api.listDevices()

    override suspend fun createDependentProfile(name: String, relationship: String): Patient =
        SmartHealthRepository.api.createPatient(
            patientCode = "",
            name = name,
            notes = "Hồ sơ gia đình tạo từ app Android",
            profileType = "dependent",
            relationship = relationship,
        )

    override suspend fun startScan(request: StartScanRequest, idempotencyKey: String): Scan =
        SmartHealthRepository.api.startScan(request, idempotencyKey)
}

class NewScanViewModel(
    private val repository: NewScanRepository,
    private val idempotencyKeyFactory: () -> String = { UUID.randomUUID().toString() },
    private val startRetryDelaysMillis: List<Long> = listOf(500L, 1_500L),
) : ViewModel() {
    private val _uiState = MutableStateFlow(NewScanUiState())
    val uiState: StateFlow<NewScanUiState> = _uiState.asStateFlow()

    private val _effects = Channel<NewScanUiEffect>(Channel.BUFFERED)
    val effects: Flow<NewScanUiEffect> = _effects.receiveAsFlow()

    private var loadJob: Job? = null
    private var createProfileJob: Job? = null
    private var pendingStartFingerprint = ""
    private var pendingStartIdempotencyKey = ""
    private var submitJob: Job? = null

    init {
        load()
    }

    fun onAction(action: NewScanUiAction) {
        when (action) {
            NewScanUiAction.Load,
            NewScanUiAction.Retry,
            -> load()
            is NewScanUiAction.ProfileSelected -> selectProfile(action.patientId)
            is NewScanUiAction.ProfileNameChanged -> updateProfileName(action.value)
            is NewScanUiAction.RelationshipChanged -> updateRelationship(action.value)
            NewScanUiAction.CreateProfile -> createProfile()
            is NewScanUiAction.DeviceSelected -> selectDevice(action.deviceId)
            is NewScanUiAction.ScanTypeSelected -> selectScanType(action.type)
            is NewScanUiAction.BodySiteSelected -> selectBodySite(action.bodySite)
            is NewScanUiAction.ReadinessToggled -> toggleReadiness(action.item)
            is NewScanUiAction.NotesChanged -> updateNotes(action.value)
            NewScanUiAction.DismissFailure -> clearFailure()
            NewScanUiAction.Submit -> submit()
        }
    }

    private fun load() {
        if (_uiState.value.isSubmitting || _uiState.value.isCreatingProfile) return
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            _uiState.update {
                it.copy(
                    loadState = NewScanLoadState.Loading,
                    failure = NewScanFailure.None,
                    errorDetail = "",
                    requestId = "",
                )
            }
            try {
                val (profiles, devices) = coroutineScope {
                    val profilesRequest = async { repository.loadProfiles() }
                    val devicesRequest = async { repository.loadDevices() }
                    profilesRequest.await() to devicesRequest.await()
                }
                val normalizedProfiles = profiles
                    .filter { it.id.isNotBlank() }
                    .distinctBy { it.id }
                val current = _uiState.value
                val selectedProfileId = current.selectedProfileId
                    .takeIf { id -> normalizedProfiles.any { it.id == id } }
                    ?: normalizedProfiles.firstOrNull()?.id.orEmpty()
                val selectedProfile = normalizedProfiles.firstOrNull { it.id == selectedProfileId }
                val eligibleDevices = devices.toScanDeviceList(normalizedProfiles.workspaceIds())
                val selectedDeviceId = current.selectedDeviceId
                    .takeIf { id ->
                        eligibleDevices.any { device ->
                            device.id == id && device.isEligibleForScan(selectedProfile)
                        }
                    }
                    ?: eligibleDevices.firstOrNull {
                        it.isEligibleForScan(selectedProfile)
                    }?.id.orEmpty()
                _uiState.update {
                    it.copy(
                        loadState = NewScanLoadState.Content,
                        profiles = normalizedProfiles,
                        selectedProfileId = selectedProfileId,
                        devices = eligibleDevices,
                        selectedDeviceId = selectedDeviceId,
                        failure = NewScanFailure.None,
                        errorDetail = "",
                        requestId = "",
                    )
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                val failure = error.toNewScanFailure()
                _uiState.update {
                    it.copy(
                        loadState = failure.toLoadState(),
                        profiles = emptyList(),
                        selectedProfileId = "",
                        devices = emptyList(),
                        selectedDeviceId = "",
                        failure = failure,
                        errorDetail = error.safeDetail(),
                        requestId = (error as? SmartHealthApiException)?.requestId.orEmpty(),
                    )
                }
            }
        }
    }

    private fun selectProfile(patientId: String) {
        val current = _uiState.value
        val selectedProfile = current.profiles.firstOrNull { it.id == patientId }
        if (current.isBusy || selectedProfile == null) return
        val selectedDeviceId = current.selectedDeviceId
            .takeIf { id ->
                current.devices.any { it.id == id && it.isEligibleForScan(selectedProfile) }
            }
            ?: current.devices.firstOrNull {
                it.isEligibleForScan(selectedProfile)
            }?.id.orEmpty()
        _uiState.update {
            it.copy(
                selectedProfileId = patientId,
                selectedDeviceId = selectedDeviceId,
                failure = NewScanFailure.None,
                errorDetail = "",
                requestId = "",
            )
        }
    }

    private fun updateProfileName(value: String) {
        if (_uiState.value.isBusy) return
        _uiState.update {
            it.copy(
                profileName = value,
                profileNameInvalid = false,
                failure = NewScanFailure.None,
            )
        }
    }

    private fun updateRelationship(value: String) {
        if (_uiState.value.isBusy) return
        _uiState.update {
            it.copy(
                relationship = value,
                relationshipInvalid = false,
                failure = NewScanFailure.None,
            )
        }
    }

    private fun createProfile() {
        val current = _uiState.value
        if (current.isBusy) return
        val name = current.profileName.trim()
        val relationship = current.relationship.trim()
        if (name.isBlank() || relationship.isBlank()) {
            _uiState.update {
                it.copy(
                    profileNameInvalid = name.isBlank(),
                    relationshipInvalid = relationship.isBlank(),
                    failure = NewScanFailure.Validation,
                    errorDetail = "",
                )
            }
            return
        }

        createProfileJob?.cancel()
        createProfileJob = viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isCreatingProfile = true,
                    failure = NewScanFailure.None,
                    errorDetail = "",
                    requestId = "",
                )
            }
            try {
                val profile = repository.createDependentProfile(name, relationship)
                require(profile.id.isNotBlank()) { "Backend returned a profile without an id" }
                _uiState.update { state ->
                    val profiles = (state.profiles.filterNot { it.id == profile.id } + profile)
                        .sortedBy { it.name.lowercase(Locale.ROOT) }
                    val selectedDeviceId = state.selectedDeviceId
                        .takeIf { id ->
                            state.devices.any {
                                it.id == id && it.isEligibleForScan(profile)
                            }
                        }
                        ?: state.devices.firstOrNull {
                            it.isEligibleForScan(profile)
                        }?.id.orEmpty()
                    state.copy(
                        profiles = profiles,
                        selectedProfileId = profile.id,
                        selectedDeviceId = selectedDeviceId,
                        profileName = "",
                        relationship = "",
                        profileNameInvalid = false,
                        relationshipInvalid = false,
                        isCreatingProfile = false,
                    )
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                val failure = error.toNewScanFailure()
                _uiState.update {
                    if (failure == NewScanFailure.Permission) {
                        it.permissionDenied(error)
                    } else {
                        it.copy(
                            isCreatingProfile = false,
                            failure = failure,
                            errorDetail = error.safeDetail(),
                            requestId = (error as? SmartHealthApiException)?.requestId.orEmpty(),
                        )
                    }
                }
            }
        }
    }

    private fun selectDevice(deviceId: String) {
        val current = _uiState.value
        if (current.isBusy) return
        val device = current.devices.firstOrNull { it.id == deviceId } ?: return
        if (!device.isEligibleForScan(current.selectedProfile)) return
        _uiState.update {
            it.copy(
                selectedDeviceId = deviceId,
                failure = NewScanFailure.None,
                errorDetail = "",
                requestId = "",
            )
        }
    }

    private fun selectScanType(type: NewScanType) {
        if (_uiState.value.isBusy) return
        _uiState.update {
            it.copy(
                scanType = type,
                selectedBodySite = it.selectedBodySite?.takeIf { site -> site.scanType == type },
                failure = NewScanFailure.None,
                errorDetail = "",
            )
        }
    }

    private fun selectBodySite(bodySite: ScanBodySite) {
        val current = _uiState.value
        if (current.isBusy || bodySite.scanType != current.scanType) return
        _uiState.update {
            it.copy(
                selectedBodySite = bodySite,
                failure = NewScanFailure.None,
                errorDetail = "",
            )
        }
    }

    private fun toggleReadiness(item: NewScanReadinessCheck) {
        if (_uiState.value.isBusy) return
        _uiState.update {
            val readiness = it.readiness.toMutableSet().apply {
                if (!add(item)) remove(item)
            }
            it.copy(
                readiness = readiness,
                failure = NewScanFailure.None,
                errorDetail = "",
            )
        }
    }

    private fun updateNotes(value: String) {
        if (_uiState.value.isBusy) return
        _uiState.update {
            it.copy(
                notes = value.take(MaxNotesLength),
                failure = NewScanFailure.None,
                errorDetail = "",
            )
        }
    }

    private fun clearFailure() {
        _uiState.update {
            it.copy(failure = NewScanFailure.None, errorDetail = "", requestId = "")
        }
    }

    private fun submit() {
        val snapshot = _uiState.value
        if (snapshot.isBusy || snapshot.startedScanId.isNotBlank()) return
        val bodySite = snapshot.selectedBodySite
        if (!snapshot.canStart || bodySite == null) {
            _uiState.update {
                it.copy(
                    failure = NewScanFailure.Validation,
                    errorDetail = "",
                    requestId = "",
                )
            }
            return
        }

        submitJob?.cancel()
        submitJob = viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isSubmitting = true,
                    failure = NewScanFailure.None,
                    errorDetail = "",
                    requestId = "",
                )
            }
            try {
                val selectedDevice = snapshot.selectedDevice
                if (selectedDevice?.isEligibleForScan(snapshot.selectedProfile) != true) {
                    _uiState.update {
                        it.copy(
                            selectedDeviceId = "",
                            isSubmitting = false,
                            failure = NewScanFailure.DeviceOffline,
                        )
                    }
                    return@launch
                }

                val request = StartScanRequest(
                    patientId = snapshot.selectedProfileId,
                    mode = snapshot.scanType.wireValue,
                    bodySite = bodySite.wireValue,
                    deviceId = selectedDevice.id,
                    doctorNotes = snapshot.notes.trim(),
                )
                val fingerprint = request.startIntentFingerprint()
                if (fingerprint != pendingStartFingerprint) {
                    pendingStartFingerprint = fingerprint
                    pendingStartIdempotencyKey = idempotencyKeyFactory()
                }
                val scan = startScanWithTransportReconciliation(
                    request = request,
                    idempotencyKey = pendingStartIdempotencyKey,
                )
                if (!scan.matchesAcceptedRequest(request)) {
                    _uiState.update {
                        it.copy(
                            isSubmitting = false,
                            failure = NewScanFailure.InvalidReceipt,
                            errorDetail = "",
                        )
                    }
                    return@launch
                }
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        startedScanId = scan.id,
                        failure = NewScanFailure.None,
                    )
                }
                pendingStartFingerprint = ""
                pendingStartIdempotencyKey = ""
                _effects.send(NewScanUiEffect.BackendAccepted(scan.id))
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                val failure = error.toNewScanFailure()
                _uiState.update {
                    if (failure == NewScanFailure.Permission) {
                        it.permissionDenied(error)
                    } else {
                        it.copy(
                            isSubmitting = false,
                            failure = failure,
                            errorDetail = error.safeDetail(),
                            requestId = (error as? SmartHealthApiException)?.requestId.orEmpty(),
                        )
                    }
                }
            }
        }
    }

    private suspend fun startScanWithTransportReconciliation(
        request: StartScanRequest,
        idempotencyKey: String,
    ): Scan {
        var retryIndex = 0
        while (true) {
            try {
                return repository.startScan(request, idempotencyKey)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (!error.isAmbiguousStartTransportFailure() || retryIndex >= startRetryDelaysMillis.size) {
                    throw error
                }
                val retryDelay = startRetryDelaysMillis[retryIndex].coerceAtLeast(0L)
                retryIndex += 1
                if (retryDelay > 0L) delay(retryDelay)
            }
        }
    }

    override fun onCleared() {
        loadJob?.cancel()
        createProfileJob?.cancel()
        submitJob?.cancel()
        super.onCleared()
    }

    private companion object {
        const val MaxNotesLength = 4_000
    }
}

private fun StartScanRequest.startIntentFingerprint(): String = listOf(
    patientId.orEmpty().trim(),
    patientName.orEmpty().trim(),
    patientCode.orEmpty().trim(),
    mode.trim(),
    bodySite.trim(),
    deviceId.trim(),
    doctorNotes.trim(),
).joinToString("\u001f")

class NewScanViewModelFactory(
    private val repository: NewScanRepository = ApiNewScanRepository(),
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(NewScanViewModel::class.java))
        return NewScanViewModel(repository) as T
    }
}

fun SmartDevice.isEligibleForScan(patient: Patient?): Boolean {
    val normalizedPatientId = patient?.id?.trim().orEmpty()
    val patientWorkspaceId = patient?.organizationId?.trim().orEmpty()
    val deviceWorkspaceId = organizationId.trim()
    return id.isNotBlank() &&
        normalizedPatientId.isNotBlank() &&
        (type.isBlank() || type.equals("stethoscope", ignoreCase = true)) &&
        !status.equals("revoked", ignoreCase = true) &&
        online &&
        (patientWorkspaceId.isBlank() ||
            deviceWorkspaceId.isBlank() ||
            patientWorkspaceId == deviceWorkspaceId) &&
        (assignedPatientId.isBlank() || assignedPatientId == normalizedPatientId)
}

private fun List<SmartDevice>.toScanDeviceList(
    allowedWorkspaceIds: Set<String>,
): List<SmartDevice> =
    filter { it.type.isBlank() || it.type.equals("stethoscope", ignoreCase = true) }
        .filter { it.id.isNotBlank() }
        .filter { device ->
            allowedWorkspaceIds.isEmpty() ||
                device.organizationId.isBlank() ||
                device.organizationId in allowedWorkspaceIds
        }
        .sortedWith(
            compareByDescending<SmartDevice> { it.online }
                .thenByDescending { it.lastSeenAt.orEmpty() }
                .thenBy { it.name.ifBlank { it.id }.lowercase(Locale.ROOT) },
        )
        .distinctBy { it.id }

private val NewScanUiState.isBusy: Boolean
    get() = isCreatingProfile || isSubmitting

private fun List<Patient>.workspaceIds(): Set<String> =
    mapNotNull { it.organizationId.trim().takeIf(String::isNotBlank) }.toSet()

private fun NewScanUiState.permissionDenied(error: Throwable): NewScanUiState = copy(
    loadState = NewScanLoadState.Permission,
    profiles = emptyList(),
    selectedProfileId = "",
    devices = emptyList(),
    selectedDeviceId = "",
    selectedBodySite = null,
    readiness = emptySet(),
    notes = "",
    profileName = "",
    relationship = "",
    profileNameInvalid = false,
    relationshipInvalid = false,
    isCreatingProfile = false,
    isSubmitting = false,
    failure = NewScanFailure.Permission,
    errorDetail = "",
    requestId = (error as? SmartHealthApiException)?.requestId.orEmpty(),
    startedScanId = "",
)

private fun Scan.matchesAcceptedRequest(request: StartScanRequest): Boolean =
    id.isNotBlank() &&
        status in setOf("created", "recording") &&
        patientId == request.patientId &&
        deviceId == request.deviceId &&
        mode == request.mode &&
        bodySite == request.bodySite

private fun Throwable.toNewScanFailure(): NewScanFailure = when {
    this is SmartHealthApiException &&
        (statusCode in setOf(401, 403) ||
            code.uppercase(Locale.ROOT) in NewScanAuthorityErrorCodes) ->
        NewScanFailure.Permission
    this is SmartHealthApiException &&
        code.uppercase(Locale.ROOT) in NewScanDeviceOfflineErrorCodes ->
        NewScanFailure.DeviceOffline
    this is SmartHealthApiException -> NewScanFailure.Backend
    this is UnknownHostException ||
        this is ConnectException ||
        this is SocketTimeoutException ||
        this is IOException -> NewScanFailure.Offline
    else -> NewScanFailure.Backend
}

private fun Throwable.isAmbiguousStartTransportFailure(): Boolean =
    this !is SmartHealthApiException &&
        (this is UnknownHostException ||
            this is ConnectException ||
            this is SocketTimeoutException ||
            this is IOException)

private fun NewScanFailure.toLoadState(): NewScanLoadState = when (this) {
    NewScanFailure.Permission -> NewScanLoadState.Permission
    NewScanFailure.Offline -> NewScanLoadState.Offline
    else -> NewScanLoadState.Error
}

private fun Throwable.safeDetail(): String = when (this) {
    is SmartHealthApiException -> message.orEmpty()
    else -> ""
}

private val NewScanAuthorityErrorCodes = setOf(
    "ACCOUNT_DELETED",
    "ACCOUNT_LOCKED",
    "ACCOUNT_NOT_FOUND",
    "AUTH_SESSION_BINDING_MISSING",
    "AUTH_SESSION_CHANGED",
    "AUTH_SESSION_REPLACED",
    "AUTH_SESSION_REQUIRED",
    "AUTH_SESSION_REVOKED",
    "USER_DELETED",
    "WORKSPACE_ARCHIVED",
    "WORKSPACE_MEMBERSHIP_REQUIRED",
)

private val NewScanDeviceOfflineErrorCodes = setOf(
    "AUDIO_START_DELIVERY_FAILED",
    "DEVICE_NOT_AUTHENTICATED",
)
