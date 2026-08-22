package com.example.smart_health_android.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.SmartHealthApi
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.canonicalWorkspaceId
import com.example.smart_health_android.navigation.MobileExperience
import java.io.IOException
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class SettingsAccountRole {
    Admin,
    Doctor,
    Nurse,
    Technician,
    Billing,
    Patient,
    Viewer,
    Unknown,
}

data class SettingsOverviewAccount(
    val memberId: String,
    val displayName: String,
    val role: SettingsAccountRole,
    val workspaceName: String,
    val initials: String,
)

interface SettingsOverviewRepository {
    suspend fun loadCurrentUser(): AuthUser
}

class ApiSettingsOverviewRepository(
    private val api: SmartHealthApi,
) : SettingsOverviewRepository {
    override suspend fun loadCurrentUser(): AuthUser = api.getMe()
}

enum class SettingsOverviewLoadState {
    Loading,
    Ready,
    PermissionDenied,
    Offline,
    Error,
}

enum class SettingsOverviewError {
    PermissionDenied,
    AuthorityMismatch,
    Offline,
    Unknown,
}

data class SettingsOverviewUiState(
    val loadState: SettingsOverviewLoadState = SettingsOverviewLoadState.Loading,
    val account: SettingsOverviewAccount? = null,
    val hasLoaded: Boolean = false,
    val isRefreshing: Boolean = false,
    val isStale: Boolean = false,
    val isLoggingOut: Boolean = false,
    val error: SettingsOverviewError? = null,
    val requestId: String = "",
)

sealed interface SettingsOverviewUiAction {
    data object Retry : SettingsOverviewUiAction
    data object Refresh : SettingsOverviewUiAction
    data object Logout : SettingsOverviewUiAction
}

sealed interface SettingsOverviewUiEffect {
    data object RefreshConfirmed : SettingsOverviewUiEffect
}

enum class SettingsLogoutResult {
    Completed,
    Failed,
    AlreadyRunning,
}

/**
 * Logout has exactly one authority-clearing execution for the lifetime of a protected route.
 * Navigation runs in `finally`, so a provider/backend cleanup failure cannot leave the user on
 * a screen that once rendered protected data.
 */
class SettingsLogoutCoordinator(
    private val clearAuthority: () -> Unit,
    private val terminateSession: suspend () -> Unit,
    private val exitProtectedUi: () -> Unit,
) {
    private val started = AtomicBoolean(false)

    suspend fun logout(): SettingsLogoutResult {
        if (!started.compareAndSet(false, true)) {
            return SettingsLogoutResult.AlreadyRunning
        }

        var result = SettingsLogoutResult.Completed
        try {
            clearAuthority()
            terminateSession()
        } catch (_: Throwable) {
            result = SettingsLogoutResult.Failed
        } finally {
            exitProtectedUi()
        }
        return result
    }
}

class SettingsOverviewViewModel(
    private val repository: SettingsOverviewRepository,
    private val expectedAuthority: SettingsAuthoritySnapshot?,
    private val currentAuthority: () -> SettingsAuthoritySnapshot?,
    private val invalidateExpectedAuthority: () -> Unit,
    private val logoutCoordinator: SettingsLogoutCoordinator,
) : ViewModel() {
    private val _uiState = MutableStateFlow(
        if (expectedAuthority == null) {
            authorityDeniedState()
        } else {
            SettingsOverviewUiState()
        },
    )
    val uiState: StateFlow<SettingsOverviewUiState> = _uiState.asStateFlow()

    private val _effects = Channel<SettingsOverviewUiEffect>(Channel.BUFFERED)
    val effects: Flow<SettingsOverviewUiEffect> = _effects.receiveAsFlow()

    private var loadInFlight = false

    init {
        if (expectedAuthority != null) {
            load(initial = true)
        }
    }

    fun onAction(action: SettingsOverviewUiAction) {
        when (action) {
            SettingsOverviewUiAction.Retry -> load(initial = !_uiState.value.hasLoaded)
            SettingsOverviewUiAction.Refresh -> load(initial = false)
            SettingsOverviewUiAction.Logout -> logout()
        }
    }

    private fun load(initial: Boolean) {
        if (loadInFlight || _uiState.value.isLoggingOut) return
        val expected = expectedAuthority
        if (expected == null || currentAuthority() != expected) {
            _uiState.value = authorityDeniedState()
            return
        }

        loadInFlight = true
        _uiState.update { current ->
            current.copy(
                loadState = if (initial && !current.hasLoaded) {
                    SettingsOverviewLoadState.Loading
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
                user.toSettingsOverviewAccount(expected)
            }
                .onSuccess { account ->
                    loadInFlight = false
                    _uiState.value = SettingsOverviewUiState(
                        loadState = SettingsOverviewLoadState.Ready,
                        account = account,
                        hasLoaded = true,
                    )
                    if (!initial) {
                        _effects.send(SettingsOverviewUiEffect.RefreshConfirmed)
                    }
                }
                .onFailure { error ->
                    loadInFlight = false
                    _uiState.update { current ->
                        if (error.isSettingsAuthorityFailure()) {
                            if (currentAuthority() == expected) {
                                invalidateExpectedAuthority()
                            }
                            authorityDeniedState(
                                error = if (error is SmartHealthApiException) {
                                    SettingsOverviewError.PermissionDenied
                                } else {
                                    SettingsOverviewError.AuthorityMismatch
                                },
                                requestId = settingsOverviewRequestId(error),
                            )
                        } else if (
                            current.hasLoaded &&
                            current.account != null &&
                            error.canRetainSettingsStaleContent()
                        ) {
                            current.copy(
                                loadState = SettingsOverviewLoadState.Ready,
                                isRefreshing = false,
                                isStale = true,
                                error = settingsOverviewError(error),
                                requestId = settingsOverviewRequestId(error),
                            )
                        } else {
                            current.copy(
                                loadState = settingsOverviewFailureState(error),
                                account = null,
                                hasLoaded = false,
                                isRefreshing = false,
                                isStale = false,
                                error = settingsOverviewError(error),
                                requestId = settingsOverviewRequestId(error),
                            )
                        }
                    }
                }
        }
    }

    private fun logout() {
        if (_uiState.value.isLoggingOut) return
        _uiState.update {
            it.copy(
                isLoggingOut = true,
                isRefreshing = false,
            )
        }
        viewModelScope.launch {
            try {
                logoutCoordinator.logout()
            } finally {
                _uiState.update { it.copy(isLoggingOut = false) }
            }
        }
    }

    private fun requireCurrentAuthority(expected: SettingsAuthoritySnapshot) {
        if (currentAuthority() != expected) {
            throw SettingsAuthorityMismatchException()
        }
    }
}

class SettingsOverviewViewModelFactory(
    private val expectedAuthority: SettingsAuthoritySnapshot?,
    private val currentAuthority: () -> SettingsAuthoritySnapshot?,
    private val invalidateExpectedAuthority: () -> Unit,
    private val logoutCoordinator: SettingsLogoutCoordinator,
    private val repository: SettingsOverviewRepository =
        ApiSettingsOverviewRepository(SmartHealthRepository.api),
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(SettingsOverviewViewModel::class.java))
        return SettingsOverviewViewModel(
            repository = repository,
            expectedAuthority = expectedAuthority,
            currentAuthority = currentAuthority,
            invalidateExpectedAuthority = invalidateExpectedAuthority,
            logoutCoordinator = logoutCoordinator,
        ) as T
    }
}

internal fun AuthUser.toSettingsOverviewAccount(
    expectedAuthority: SettingsAuthoritySnapshot,
): SettingsOverviewAccount {
    val expectedWorkspaceId = expectedAuthority.workspaceId
    val expectedRole = expectedAuthority.role
    val membership = currentMembership
        ?: throw SettingsAuthorityMismatchException()
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
        id.trim() != expectedAuthority.userId ||
        !accountStatus.trim().equals("active", ignoreCase = true) ||
        !deletedAt.isNullOrBlank() ||
        canonicalWorkspaceId() != expectedWorkspaceId ||
        membershipWorkspaceId != expectedWorkspaceId ||
        !membership.operational ||
        !membership.status.trim().equals("active", ignoreCase = true) ||
        membership.id.isBlank() ||
        membershipRole != expectedRole ||
        normalizedCapabilities != expectedAuthority.capabilities ||
        membershipRole.settingsExperience() != expectedAuthority.experience
    ) {
        throw SettingsAuthorityMismatchException()
    }

    val normalizedName = name.trim()
    val workspaceName = membership.workspaceName
        .trim()
        .ifBlank {
            currentWorkspace
                ?.takeIf { workspace -> workspace.id.trim() == expectedWorkspaceId }
                ?.name
                .orEmpty()
                .trim()
        }
        .ifBlank { expectedWorkspaceId }

    return SettingsOverviewAccount(
        memberId = membership.id.trim(),
        displayName = normalizedName,
        role = membershipRole.settingsAccountRole(),
        workspaceName = workspaceName,
        initials = normalizedName
            .split(Regex("\\s+"))
            .filter(String::isNotBlank)
            .takeLast(2)
            .mapNotNull { part -> part.firstOrNull()?.uppercaseChar() }
            .joinToString(""),
    )
}

private class SettingsAuthorityMismatchException : SecurityException()

private fun String.settingsExperience(): MobileExperience? = when (this) {
    "patient" -> MobileExperience.Patient
    "admin",
    "workspace_admin",
    "workspace_owner",
    "doctor",
    "nurse",
    "technician",
    -> MobileExperience.Clinical
    else -> null
}

private fun String.settingsAccountRole(): SettingsAccountRole = when (this) {
    "admin", "workspace_admin", "workspace_owner" -> SettingsAccountRole.Admin
    "doctor" -> SettingsAccountRole.Doctor
    "nurse" -> SettingsAccountRole.Nurse
    "technician" -> SettingsAccountRole.Technician
    "billing" -> SettingsAccountRole.Billing
    "patient" -> SettingsAccountRole.Patient
    "viewer" -> SettingsAccountRole.Viewer
    else -> SettingsAccountRole.Unknown
}

private fun authorityDeniedState(
    error: SettingsOverviewError = SettingsOverviewError.AuthorityMismatch,
    requestId: String = "",
) = SettingsOverviewUiState(
    loadState = SettingsOverviewLoadState.PermissionDenied,
    account = null,
    hasLoaded = false,
    isRefreshing = false,
    isStale = false,
    error = error,
    requestId = requestId,
)

private fun Throwable.isSettingsAuthorityFailure(): Boolean =
    this is SettingsAuthorityMismatchException ||
        (this is SmartHealthApiException && statusCode in setOf(401, 403))

private fun Throwable.canRetainSettingsStaleContent(): Boolean = when (this) {
    is SmartHealthApiException -> statusCode in 500..599
    is IOException -> true
    else -> false
}

private fun settingsOverviewFailureState(error: Throwable): SettingsOverviewLoadState = when {
    error.isSettingsAuthorityFailure() -> SettingsOverviewLoadState.PermissionDenied
    error is SmartHealthApiException -> SettingsOverviewLoadState.Error
    error is IOException -> SettingsOverviewLoadState.Offline
    else -> SettingsOverviewLoadState.Error
}

private fun settingsOverviewError(error: Throwable): SettingsOverviewError = when {
    error is SettingsAuthorityMismatchException -> SettingsOverviewError.AuthorityMismatch
    error is SmartHealthApiException && error.statusCode in setOf(401, 403) ->
        SettingsOverviewError.PermissionDenied
    error is SmartHealthApiException -> SettingsOverviewError.Unknown
    error is IOException -> SettingsOverviewError.Offline
    else -> SettingsOverviewError.Unknown
}

private fun settingsOverviewRequestId(error: Throwable): String =
    (error as? SmartHealthApiException)?.requestId.orEmpty()
