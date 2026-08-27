package com.example.smart_health_android.patientdashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.PatientDashboardSectionAvailability
import com.example.smart_health_android.data.PatientDashboardSnapshot
import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.data.SmartDevice
import com.example.smart_health_android.data.SmartHealthApi
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.canonicalWorkspaceId
import com.example.smart_health_android.navigation.MobileExperience
import java.io.IOException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

interface PatientDashboardRepository {
    suspend fun loadCurrentUser(): AuthUser

    suspend fun loadDashboard(
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): PatientDashboardSnapshot
}

class ApiPatientDashboardRepository(
    private val api: SmartHealthApi,
) : PatientDashboardRepository {
    override suspend fun loadCurrentUser(): AuthUser = api.getMe()

    override suspend fun loadDashboard(
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): PatientDashboardSnapshot = api.getPatientDashboard(
        expectedUserId = expectedUserId,
        expectedWorkspaceId = expectedWorkspaceId,
    )
}

enum class PatientDashboardLoadState {
    Loading,
    Content,
    PermissionDenied,
    Offline,
    Error,
}

enum class PatientDashboardError {
    PermissionDenied,
    AuthorityMismatch,
    Offline,
    Unknown,
}

enum class PatientDashboardSectionState {
    Ready,
    Empty,
    Unavailable,
}

enum class PatientDashboardAnalysisState {
    Unavailable,
    Captured,
    Processing,
    NeedsAttention,
    Recording,
    TechnicalFailure,
}

enum class PatientDashboardDevicePresence {
    Online,
    Offline,
}

data class PatientDashboardProfile(
    val patientId: String,
    val displayName: String,
    val patientCode: String,
    val relationship: String,
    val profileType: String,
)

data class PatientDashboardRecentScan(
    val id: String,
    val date: String,
    val time: String,
    val type: String,
    val summary: String,
    val analysisState: PatientDashboardAnalysisState,
)

data class PatientDashboardDevice(
    val id: String,
    val name: String,
    val presence: PatientDashboardDevicePresence,
    val batteryPercent: Int?,
    val signalDbm: Int?,
    val firmwareVersion: String,
    val lastSeenAt: String?,
)

data class PatientDashboardUiState(
    val loadState: PatientDashboardLoadState = PatientDashboardLoadState.Loading,
    val profile: PatientDashboardProfile? = null,
    val recentScans: List<PatientDashboardRecentScan> = emptyList(),
    val device: PatientDashboardDevice? = null,
    val scansState: PatientDashboardSectionState = PatientDashboardSectionState.Empty,
    val deviceState: PatientDashboardSectionState = PatientDashboardSectionState.Empty,
    val features: PatientDashboardFeatureAccess = PatientDashboardFeatureAccess(),
    val query: String = "",
    val generatedAt: String = "",
    val hasLoaded: Boolean = false,
    val isRefreshing: Boolean = false,
    val isStale: Boolean = false,
    val isPartial: Boolean = false,
    val error: PatientDashboardError? = null,
    val requestId: String = "",
)

sealed interface PatientDashboardUiAction {
    data object Retry : PatientDashboardUiAction
    data object Refresh : PatientDashboardUiAction
    data class SearchChanged(val query: String) : PatientDashboardUiAction
}

sealed interface PatientDashboardUiEffect {
    data object RefreshConfirmed : PatientDashboardUiEffect
}

class PatientDashboardViewModel(
    private val repository: PatientDashboardRepository,
    private val expectedAuthority: PatientDashboardAuthoritySnapshot?,
    private val currentAuthority: () -> PatientDashboardAuthoritySnapshot?,
    private val features: PatientDashboardFeatureAccess,
    private val invalidateExpectedAuthority: () -> Unit,
) : ViewModel() {
    private val _uiState = MutableStateFlow(
        if (expectedAuthority == null) {
            patientDashboardDeniedState(features = features)
        } else {
            PatientDashboardUiState(features = features)
        },
    )
    val uiState: StateFlow<PatientDashboardUiState> = _uiState.asStateFlow()

    private val _effects = Channel<PatientDashboardUiEffect>(Channel.BUFFERED)
    val effects: Flow<PatientDashboardUiEffect> = _effects.receiveAsFlow()

    private var loadInFlight = false
    private var authorizedContent: PatientDashboardContent? = null

    init {
        if (expectedAuthority != null) {
            load(initial = true)
        }
    }

    fun onAction(action: PatientDashboardUiAction) {
        when (action) {
            PatientDashboardUiAction.Retry -> load(initial = !_uiState.value.hasLoaded)
            PatientDashboardUiAction.Refresh -> load(initial = false)
            is PatientDashboardUiAction.SearchChanged -> updateSearch(action.query)
        }
    }

    private fun updateSearch(query: String) {
        val normalizedQuery = query.take(MAX_SEARCH_QUERY_LENGTH)
        _uiState.update { current ->
            current.copy(
                query = normalizedQuery,
                recentScans = authorizedContent
                    ?.recentScans
                    ?.filterForQuery(normalizedQuery)
                    .orEmpty(),
            )
        }
    }

    private fun load(initial: Boolean) {
        if (loadInFlight) return
        val expected = expectedAuthority
        if (expected == null || currentAuthority() != expected) {
            authorizedContent = null
            _uiState.value = patientDashboardDeniedState(features = features)
            return
        }

        loadInFlight = true
        _uiState.update { current ->
            current.copy(
                loadState = if (initial && !current.hasLoaded) {
                    PatientDashboardLoadState.Loading
                } else {
                    current.loadState
                },
                isRefreshing = !initial,
                error = null,
                requestId = "",
            )
        }

        viewModelScope.launch {
            runCatching {
                requireCurrentAuthority(expected)
                val user = repository.loadCurrentUser()
                requireCurrentAuthority(expected)
                user.requirePatientDashboardAuthority(expected)
                val snapshot = repository.loadDashboard(
                    expectedUserId = expected.userId,
                    expectedWorkspaceId = expected.workspaceId,
                )
                requireCurrentAuthority(expected)
                snapshot.toPatientDashboardContent(
                    expectedAuthority = expected,
                    expectedActivePatientId = user.activePatientId.trim(),
                )
            }
                .onSuccess { content ->
                    loadInFlight = false
                    authorizedContent = content
                    val query = _uiState.value.query
                    _uiState.value = content.toUiState(
                        features = features,
                        query = query,
                    )
                    if (!initial) {
                        _effects.send(PatientDashboardUiEffect.RefreshConfirmed)
                    }
                }
                .onFailure { failure ->
                    loadInFlight = false
                    handleLoadFailure(
                        error = failure,
                        expected = expected,
                    )
                }
        }
    }

    private fun handleLoadFailure(
        error: Throwable,
        expected: PatientDashboardAuthoritySnapshot,
    ) {
        val current = _uiState.value
        if (currentAuthority() != expected) {
            authorizedContent = null
            _uiState.value = patientDashboardDeniedState(
                features = features,
                error = PatientDashboardError.AuthorityMismatch,
                requestId = patientDashboardRequestId(error),
                query = current.query,
            )
            return
        }
        if (error.isPatientDashboardAuthorityFailure()) {
            if (currentAuthority() == expected) {
                invalidateExpectedAuthority()
            }
            authorizedContent = null
            _uiState.value = patientDashboardDeniedState(
                features = features,
                error = if (
                    error is SmartHealthApiException &&
                    error.statusCode in setOf(401, 403)
                ) {
                    PatientDashboardError.PermissionDenied
                } else {
                    PatientDashboardError.AuthorityMismatch
                },
                requestId = patientDashboardRequestId(error),
                query = current.query,
            )
        } else if (
            current.hasLoaded &&
            authorizedContent != null &&
            error.canRetainPatientDashboardStaleContent()
        ) {
            _uiState.value = current.copy(
                loadState = PatientDashboardLoadState.Content,
                isRefreshing = false,
                isStale = true,
                error = patientDashboardError(error),
                requestId = patientDashboardRequestId(error),
            )
        } else {
            authorizedContent = null
            _uiState.value = PatientDashboardUiState(
                loadState = patientDashboardFailureState(error),
                features = features,
                query = current.query,
                error = patientDashboardError(error),
                requestId = patientDashboardRequestId(error),
            )
        }
    }

    private fun requireCurrentAuthority(expected: PatientDashboardAuthoritySnapshot) {
        if (currentAuthority() != expected) {
            throw PatientDashboardAuthorityMismatchException()
        }
    }
}

class PatientDashboardViewModelFactory(
    private val expectedAuthority: PatientDashboardAuthoritySnapshot?,
    private val currentAuthority: () -> PatientDashboardAuthoritySnapshot?,
    private val features: PatientDashboardFeatureAccess,
    private val invalidateExpectedAuthority: () -> Unit,
    private val repository: PatientDashboardRepository =
        ApiPatientDashboardRepository(SmartHealthRepository.api),
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(PatientDashboardViewModel::class.java))
        return PatientDashboardViewModel(
            repository = repository,
            expectedAuthority = expectedAuthority,
            currentAuthority = currentAuthority,
            features = features,
            invalidateExpectedAuthority = invalidateExpectedAuthority,
        ) as T
    }
}

private data class PatientDashboardContent(
    val profile: PatientDashboardProfile,
    val recentScans: List<PatientDashboardRecentScan>,
    val device: PatientDashboardDevice?,
    val scansState: PatientDashboardSectionState,
    val deviceState: PatientDashboardSectionState,
    val generatedAt: String,
) {
    val isPartial: Boolean
        get() = scansState == PatientDashboardSectionState.Unavailable ||
            deviceState == PatientDashboardSectionState.Unavailable

    fun toUiState(
        features: PatientDashboardFeatureAccess,
        query: String,
    ) = PatientDashboardUiState(
        loadState = PatientDashboardLoadState.Content,
        profile = profile,
        recentScans = recentScans.filterForQuery(query),
        device = device,
        scansState = scansState,
        deviceState = deviceState,
        features = features,
        query = query,
        generatedAt = generatedAt,
        hasLoaded = true,
        isPartial = isPartial,
    )
}

private fun AuthUser.requirePatientDashboardAuthority(
    expectedAuthority: PatientDashboardAuthoritySnapshot,
) {
    val membership = currentMembership
        ?: throw PatientDashboardAuthorityMismatchException()
    val membershipWorkspaceId = membership.workspaceId
        .ifBlank { membership.organizationId }
        .trim()
    val membershipRole = membership.role.trim().lowercase()
    val normalizedCapabilities = capabilities
        .asSequence()
        .map(String::trim)
        .filter(String::isNotBlank)
        .toSortedSet()

    if (
        expectedAuthority.experience != MobileExperience.Patient ||
        expectedAuthority.role != PATIENT_ROLE ||
        id.trim() != expectedAuthority.userId ||
        !accountStatus.trim().equals(ACTIVE_STATUS, ignoreCase = true) ||
        !deletedAt.isNullOrBlank() ||
        canonicalWorkspaceId() != expectedAuthority.workspaceId ||
        membershipWorkspaceId != expectedAuthority.workspaceId ||
        membership.id.isBlank() ||
        !membership.operational ||
        !membership.status.trim().equals(ACTIVE_STATUS, ignoreCase = true) ||
        membershipRole != expectedAuthority.role ||
        normalizedCapabilities != expectedAuthority.capabilities ||
        PERSONAL_DASHBOARD_VIEW !in normalizedCapabilities
    ) {
        throw PatientDashboardAuthorityMismatchException()
    }
}

private fun PatientDashboardSnapshot.toPatientDashboardContent(
    expectedAuthority: PatientDashboardAuthoritySnapshot,
    expectedActivePatientId: String,
): PatientDashboardContent {
    val normalizedActivePatientId = activePatientId.trim()
    val normalizedPatientAuthorityIds = setOf(
        patient.ownerUserId.trim(),
        patient.accountUserId.trim(),
        patient.guardianUserId.trim(),
    ).filter(String::isNotBlank)
    val normalizedDeviceOwner = device?.ownerUserId?.trim().orEmpty()
    val normalizedDeviceWorkspace = device?.organizationId?.trim().orEmpty()
    val normalizedAssignedPatientId = device?.assignedPatientId?.trim().orEmpty()

    if (
        protocolVersion != PATIENT_DASHBOARD_PROTOCOL_VERSION ||
        userId.trim() != expectedAuthority.userId ||
        workspaceId.trim() != expectedAuthority.workspaceId ||
        normalizedActivePatientId.isBlank() ||
        patient.id.trim() != normalizedActivePatientId ||
        patient.organizationId.trim() != expectedAuthority.workspaceId ||
        expectedAuthority.userId !in normalizedPatientAuthorityIds ||
        (expectedActivePatientId.isNotBlank() &&
            expectedActivePatientId != normalizedActivePatientId) ||
        recentScans.any { scan -> scan.patientId.trim() != normalizedActivePatientId } ||
        (
            device != null &&
                (
                    normalizedDeviceWorkspace != expectedAuthority.workspaceId ||
                        normalizedDeviceOwner != expectedAuthority.userId ||
                        (
                            normalizedAssignedPatientId.isNotBlank() &&
                                normalizedAssignedPatientId != normalizedActivePatientId
                            )
                    )
            )
    ) {
        throw PatientDashboardAuthorityMismatchException()
    }

    return PatientDashboardContent(
        profile = PatientDashboardProfile(
            patientId = normalizedActivePatientId,
            displayName = patient.name.trim(),
            patientCode = patient.patientCode.trim(),
            relationship = patient.relationship.trim(),
            profileType = patient.profileType.trim(),
        ),
        recentScans = recentScans.map(Scan::toPatientDashboardRecentScan),
        device = device?.toPatientDashboardDevice(),
        scansState = sections.scans.toPatientDashboardSectionState(),
        deviceState = sections.device.toPatientDashboardSectionState(),
        generatedAt = generatedAt.trim(),
    )
}

private fun Scan.toPatientDashboardRecentScan(): PatientDashboardRecentScan {
    val analysisState = patientDashboardAnalysisState()
    return PatientDashboardRecentScan(
        id = id.trim(),
        date = formattedDate(),
        time = formattedTime(),
        type = mode.trim().lowercase(),
        summary = "",
        analysisState = analysisState,
    )
}

private fun Scan.patientDashboardAnalysisState(): PatientDashboardAnalysisState {
    val normalizedStatus = status.trim().lowercase()
    return when {
        normalizedStatus == "recording" ->
            PatientDashboardAnalysisState.Recording
        normalizedStatus in setOf("interrupted", "failed") ->
            PatientDashboardAnalysisState.TechnicalFailure
        normalizedStatus in setOf("created", "uploading", "queued", "processing") ->
            PatientDashboardAnalysisState.Processing
        normalizedStatus in setOf("captured", "completed") ->
            PatientDashboardAnalysisState.Captured
        else -> PatientDashboardAnalysisState.Unavailable
    }
}

private fun SmartDevice.toPatientDashboardDevice() = PatientDashboardDevice(
    id = id.trim(),
    name = name.trim(),
    presence = if (online) {
        PatientDashboardDevicePresence.Online
    } else {
        PatientDashboardDevicePresence.Offline
    },
    batteryPercent = reportedBatteryPercent,
    signalDbm = reportedSignalDbm,
    firmwareVersion = firmwareVersion.trim(),
    lastSeenAt = lastSeenAt,
)

private fun PatientDashboardSectionAvailability.toPatientDashboardSectionState() = when (this) {
    PatientDashboardSectionAvailability.Ready -> PatientDashboardSectionState.Ready
    PatientDashboardSectionAvailability.Empty -> PatientDashboardSectionState.Empty
    PatientDashboardSectionAvailability.Unavailable -> PatientDashboardSectionState.Unavailable
}

private fun List<PatientDashboardRecentScan>.filterForQuery(
    query: String,
): List<PatientDashboardRecentScan> {
    val normalizedQuery = query.trim().lowercase()
    if (normalizedQuery.isBlank()) return this
    return filter { scan ->
        listOf(
            scan.id,
            scan.date,
            scan.time,
            scan.type,
            scan.summary,
        ).any { value -> value.lowercase().contains(normalizedQuery) }
    }
}

private class PatientDashboardAuthorityMismatchException : SecurityException()

private fun Throwable.isPatientDashboardAuthorityFailure(): Boolean =
    this is PatientDashboardAuthorityMismatchException ||
        (
            this is SmartHealthApiException &&
                (
                    statusCode in setOf(401, 403) ||
                        code in PATIENT_DASHBOARD_AUTHORITY_ERROR_CODES
                    )
            )

private fun Throwable.canRetainPatientDashboardStaleContent(): Boolean = when (this) {
    is SmartHealthApiException -> statusCode in 500..599
    is IOException -> true
    else -> false
}

private fun patientDashboardFailureState(error: Throwable): PatientDashboardLoadState = when {
    error.isPatientDashboardAuthorityFailure() -> PatientDashboardLoadState.PermissionDenied
    error is SmartHealthApiException -> PatientDashboardLoadState.Error
    error is IOException -> PatientDashboardLoadState.Offline
    else -> PatientDashboardLoadState.Error
}

private fun patientDashboardError(error: Throwable): PatientDashboardError = when {
    error is PatientDashboardAuthorityMismatchException ->
        PatientDashboardError.AuthorityMismatch
    error is SmartHealthApiException &&
        error.code in PATIENT_DASHBOARD_AUTHORITY_ERROR_CODES ->
        PatientDashboardError.AuthorityMismatch
    error is SmartHealthApiException && error.statusCode in setOf(401, 403) ->
        PatientDashboardError.PermissionDenied
    error is SmartHealthApiException -> PatientDashboardError.Unknown
    error is IOException -> PatientDashboardError.Offline
    else -> PatientDashboardError.Unknown
}

private fun patientDashboardDeniedState(
    features: PatientDashboardFeatureAccess,
    error: PatientDashboardError = PatientDashboardError.AuthorityMismatch,
    requestId: String = "",
    query: String = "",
) = PatientDashboardUiState(
    loadState = PatientDashboardLoadState.PermissionDenied,
    features = features,
    query = query,
    error = error,
    requestId = requestId,
)

private fun patientDashboardRequestId(error: Throwable): String =
    (error as? SmartHealthApiException)?.requestId.orEmpty()

private const val ACTIVE_STATUS = "active"
private const val PATIENT_ROLE = "patient"
private const val PERSONAL_DASHBOARD_VIEW = "personal.dashboard.view"
private const val PATIENT_DASHBOARD_PROTOCOL_VERSION = 1
private const val MAX_SEARCH_QUERY_LENGTH = 120

private val PATIENT_DASHBOARD_AUTHORITY_ERROR_CODES = setOf(
    "PATIENT_DASHBOARD_AUTHORITY_MISMATCH",
    "PATIENT_DASHBOARD_PROFILE_MISMATCH",
    "PATIENT_DASHBOARD_PROFILE_WORKSPACE_MISMATCH",
    "PATIENT_DASHBOARD_DEVICE_MISMATCH",
)
